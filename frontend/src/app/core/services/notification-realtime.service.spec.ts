import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { Auth } from './auth';
import {
  NotificationRealtimeEvent,
  NotificationRealtimeService,
} from './notification-realtime.service';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code: code ?? 1000, reason: reason ?? '' });
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emit(event: NotificationRealtimeEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  serverClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

/** Advance vitest's fake clock, flushing the microtask queue too. */
function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
}

describe('NotificationRealtimeService', () => {
  let service: NotificationRealtimeService;
  let authMock: { isLoggedIn: ReturnType<typeof vi.fn>; isGuest: ReturnType<typeof vi.fn>; getToken: ReturnType<typeof vi.fn>; callbacks: Array<() => void> };
  let pollTicks: number;

  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    pollTicks = 0;

    authMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      isGuest: vi.fn().mockReturnValue(false),
      getToken: vi.fn().mockReturnValue('jwt-token-123'),
      callbacks: [],
    };
    // Stand in for Auth.onLoggedOut, capturing the callbacks so a test can
    // simulate a real logout.
    authMock.callbacks = [];

    (globalThis as any).WebSocket = MockWebSocket;

    TestBed.configureTestingModule({
      providers: [
        NotificationRealtimeService,
        {
          provide: Auth,
          useValue: {
            isLoggedIn: authMock.isLoggedIn,
            isGuest: authMock.isGuest,
            getToken: authMock.getToken,
            onLoggedOut: (cb: () => void) => authMock.callbacks.push(cb),
          },
        },
      ],
    });

    service = TestBed.inject(NotificationRealtimeService);
    service.onPollTick = () => {
      pollTicks += 1;
    };
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('does not connect for a guest or logged-out user', () => {
    authMock.isLoggedIn.mockReturnValue(false);
    service.connect();
    expect(MockWebSocket.instances).toHaveLength(0);

    service.disconnect();

    authMock.isLoggedIn.mockReturnValue(true);
    authMock.isGuest.mockReturnValue(true);
    service.connect();
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('sends the JWT in the query string and reports the connected state', () => {
    service.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain('ws://localhost:8000/ws/notifications');
    expect(socket.url).toContain('token=jwt-token-123');

    const states: string[] = [];
    service.connectionState$.subscribe((s) => states.push(s));

    socket.open();
    expect(states).toContain('connected');
  });

  it('encodes the token so a JWT with URL-significant characters is safe', () => {
    authMock.getToken.mockReturnValue('a+b/c=d');
    service.connect();
    expect(MockWebSocket.instances[0].url).toContain('token=a%2Bb%2Fc%3Dd');
  });

  it('is idempotent - a second connect() does not open a second socket', () => {
    service.connect();
    service.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('forwards parsed events to subscribers', () => {
    const received: NotificationRealtimeEvent[] = [];
    service.events$.subscribe((e) => received.push(e));

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.emit({ type: 'connected', data: { unread_count: 4, user_id: 1, role: 'CITIZEN' } });
    socket.emit({ type: 'unread_count', data: { unread_count: 7 } });
    socket.emit({ type: 'ping', data: {} });

    expect(received.map((e) => e.type)).toEqual(['connected', 'unread_count', 'ping']);
  });

  it('ignores malformed frames instead of throwing', () => {
    const received: NotificationRealtimeEvent[] = [];
    service.events$.subscribe((e) => received.push(e));

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(() => socket.emitRaw('not json')).not.toThrow();
    expect(() => socket.emitRaw('{"no":"type"}')).not.toThrow();
    expect(() => socket.emitRaw('null')).not.toThrow();
    expect(received).toHaveLength(0);
  });

  it('sends periodic pings so the connection stays warm through proxies', () => {
    vi.useFakeTimers();
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    advance(25_000);
    expect(socket.sent).toEqual(['ping']);

    advance(25_000);
    expect(socket.sent).toEqual(['ping', 'ping']);
  });

  it('reconnects with backoff after an unexpected close', () => {
    vi.useFakeTimers();
    const states: string[] = [];
    service.connectionState$.subscribe((s) => states.push(s));

    service.connect();
    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].serverClose(1006);

    // Falls back to polling immediately so the badge stays correct.
    expect(states).toContain('polling');

    advance(2_000);
    // A second socket is opened by the scheduled reconnect.
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it('backs off progressively rather than retrying instantly', () => {
    vi.useFakeTimers();
    service.connect();
    const first = MockWebSocket.instances[0];
    first.open();
    first.serverClose(1006);

    // Before the first backoff elapses, no reconnect attempt.
    advance(100);
    expect(MockWebSocket.instances).toHaveLength(1);

    // First backoff is 1s base * 2^0 plus <=30% jitter, so ~1.0-1.3s.
    advance(1_400);
    expect(MockWebSocket.instances).toHaveLength(2);

    const second = MockWebSocket.instances[1];
    second.serverClose(1006);

    // Second backoff doubles the base, so it must not fire at the same offset.
    advance(1_400);
    expect(MockWebSocket.instances).toHaveLength(2);
    advance(1_400);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('stops retrying after a 1008 auth rejection', () => {
    vi.useFakeTimers();
    const errors: NotificationRealtimeEvent[] = [];
    service.events$.subscribe((e) => {
      if (e.type === 'error') errors.push(e);
    });

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.serverClose(1008);

    advance(120_000);
    // No further sockets: retrying a rejected token would be pointless load.
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('ticks the poll fallback so the badge survives a dropped socket', () => {
    vi.useFakeTimers();
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    pollTicks = 0;
    socket.serverClose(1006);

    // rxjs `timer(0, ...)` schedules its first emission on the clock rather than
    // firing synchronously, so flush a zero delay first.
    advance(0);
    expect(pollTicks).toBe(1);

    // The poll interval must stay below the worst-case backoff, otherwise an
    // outage would never get a fallback tick.
    advance(15_000);
    expect(pollTicks).toBeGreaterThan(1);
  });

  it('keeps polling while a reconnect attempt is still pending or failing', () => {
    vi.useFakeTimers();
    service.connect();
    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].serverClose(1006);

    advance(0);
    const afterFirstTick = pollTicks;
    expect(afterFirstTick).toBeGreaterThan(0);

    // Reconnect attempts fire and fail, but the newest attempt is still
    // CONNECTING. Polling must survive, because an attempt that never completes
    // is exactly when the fallback matters most.
    advance(1_400);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    const attempt = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(attempt.readyState).toBe(MockWebSocket.CONNECTING);

    // A full poll interval later, the badge has been refreshed even though no
    // socket has ever acknowledged the connection.
    advance(15_000);
    expect(pollTicks).toBeGreaterThan(afterFirstTick);
  });

  it('stops polling once the socket reconnects', () => {
    vi.useFakeTimers();
    service.connect();
    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].serverClose(1006);

    advance(2_000);
    const whilePolling = pollTicks;
    expect(whilePolling).toBeGreaterThan(0);

    const reconnected = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    reconnected.open();
    reconnected.emit({ type: 'connected', data: { unread_count: 2, user_id: 1, role: 'CITIZEN' } });

    advance(180_000);
    // Polling stopped, so the badge is driven purely by the socket now.
    expect(pollTicks).toBe(whilePolling);
  });

  it('closes the socket on logout and does not reconnect', () => {
    vi.useFakeTimers();
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    // Simulate Auth.logout() firing its subscribers.
    authMock.callbacks.forEach((cb) => cb());

    expect(socket.closeCalls).toHaveLength(1);
    expect(socket.closeCalls[0].code).toBe(1000);

    advance(120_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('can reconnect on demand after a token refresh', () => {
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    service.reconnect();
    expect(socket.closeCalls[0].code).toBe(4000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('is inert before connect() so no socket exists for an idle app', () => {
    expect(MockWebSocket.instances).toHaveLength(0);
    const states: string[] = [];
    service.connectionState$.subscribe((s) => states.push(s));
    expect(states).toEqual(['idle']);
  });
});
