import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, timer } from 'rxjs';

import { Auth } from './auth';
import { environment } from '../../../environments/environment';

/**
 * Server -> client event shapes emitted by the FastAPI notification socket.
 * Kept as a discriminated union so the switch in subscribers is exhaustive.
 */
export type NotificationRealtimeEvent =
  | { type: 'connected'; data: { unread_count: number; user_id: number; role: string | null } }
  | { type: 'ping'; data: Record<string, never> }
  | {
      type: 'notification';
      data: {
        notification_id: number;
        notification_type: string;
        category: string;
        title: string;
        message: string;
        priority: string;
        is_read: boolean;
        created_at: string;
        entity_type: string | null;
        entity_id: number | null;
      };
    }
  | {
      type: 'unread_count';
      data: { unread_count: number; delta?: number };
    }
  | { type: 'error'; data: { message: string } };

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'polling';

/*
 * The polling fallback only earns its keep if it fires *between* reconnect
 * attempts, so its interval has to stay below the worst-case backoff. With
 * MAX_BACKOFF_MS at 10s and a 15s poll, a long outage still refreshes the badge
 * roughly once per backoff window instead of never.
 */
const FALLBACK_POLL_MS = 15_000;
const MAX_BACKOFF_MS = 10_000;
const BASE_BACKOFF_MS = 1_000;
const PING_INTERVAL_MS = 25_000;
// Consecutive failed handshakes tolerated before giving up on the socket
// (e.g. the endpoint is absent from the deployed backend and answers 404).
// The REST polling fallback keeps notifications flowing, so retrying
// forever would only repeat failing handshakes and console errors.
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Owns the single WebSocket connection used for live notifications.
 *
 * Design notes:
 * - One socket per browser tab, shared by the bell, the notification centre
 *   and the dashboard, so a new notification never needs N connections.
 * - Reconnects with exponential backoff plus jitter. Without jitter, every tab
 *   of every user dropped by one backend restart would retry in lockstep and
 *   hammer the server.
 * - Falls back to coarse polling if the socket cannot be established at all
 *   (corporate proxy, blocked upgrade, old browser), so notifications still
 *   arrive - just not instantly.
 * - A 1008 close is an auth failure, not a network blip, so it stops retrying
 *   instead of hammering the server with a token the server will keep rejecting.
 */
@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private readonly auth = inject(Auth);
  private readonly zone = inject(NgZone);

  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pollCycle: Subscription | null = null;

  /** Set by the client so the polling fallback can still refresh the badge. */
  onPollTick: (() => void) | null = null;

  private readonly eventsSubject = new Subject<NotificationRealtimeEvent>();
  public readonly events$ = this.eventsSubject.asObservable();

  private readonly stateSubject = new BehaviorSubject<RealtimeConnectionState>('idle');
  public readonly connectionState$ = this.stateSubject.asObservable();

  private started = false;
  private wantConnection = false;

  constructor() {
    // A socket authenticated with the token we are deleting must not survive
    // the logout, or it would keep pushing frames to a signed-out tab.
    this.auth.onLoggedOut(() => this.disconnect());
  }

  /**
   * Open the socket. Safe to call repeatedly - it is a no-op once connected.
   */
  connect(): void {
    if (this.started) {
      return;
    }
    if (!this.auth.isLoggedIn() || this.auth.isGuest()) {
      return;
    }

    this.started = true;
    this.wantConnection = true;
    this.openSocket();
  }

  /**
   * Close the socket and cancel every pending retry/timer. Called on logout so
   * a socket authenticated with the old token does not linger.
   */
  disconnect(): void {
    this.started = false;
    this.wantConnection = false;
    this.clearTimers();

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      try {
        // 1000 = normal closure. The server prunes us on the disconnect.
        socket.close(1000, 'client logout');
      } catch {
        /* already closing */
      }
    }

    this.stateSubject.next('idle');
    this.eventsSubject.next({ type: 'unread_count', data: { unread_count: 0 } });
  }

  /** Re-open after a token refresh, e.g. a role change. */
  reconnect(): void {
    if (!this.started) {
      this.connect();
      return;
    }
    this.closeSocket(4000, 'reconnect');
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  // ============================================================
  // INTERNALS
  // ============================================================

  private openSocket(): void {
    if (!this.wantConnection) {
      return;
    }

    const token = this.auth.getToken();
    if (!token) {
      return;
    }

    // The socket's event handlers fire outside Angular's knowledge of pending
    // tasks, so without NgZone.run a change-detection cycle would never be
    // scheduled and the UI would not repaint.
    this.zone.runOutsideAngular(() => {
      // Deliberately NOT stopping the poll fallback here. An attempt that hangs
      // in CONNECTING, or one that keeps failing, must not leave the badge
      // frozen. Polling stops only once the server acknowledges with `connected`
      // (see handleMessage), which is the only proof the socket actually works.
      this.stateSubject.next('connecting');

      const url = this.buildUrl(token);
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        this.scheduleReconnect();
        return;
      }
      this.socket = socket;

      socket.onopen = () => {
        this.zone.run(() => {
          this.reconnectAttempt = 0;
          this.stateSubject.next('connected');
          this.startPings();
        });
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        this.zone.run(() => this.handleMessage(event.data));
      };

      socket.onerror = () => {
        // onerror is always followed by onclose; reconnect is scheduled there
        // so it happens exactly once.
      };

      socket.onclose = (event: CloseEvent) => {
        this.zone.run(() => {
          this.stopPings();
          this.socket = null;

          if (!this.wantConnection) {
            this.stateSubject.next('idle');
            return;
          }

          // 1008: the token was rejected. Retrying will not help.
          if (event.code === 1008) {
            this.wantConnection = false;
            this.started = false;
            this.stateSubject.next('idle');
            this.eventsSubject.next({
              type: 'error',
              data: { message: 'Realtime notifications unavailable: session rejected.' },
            });
            return;
          }

          this.startPollFallback();
          this.scheduleReconnect();
        });
      };
    });
  }

  private handleMessage(raw: string): void {
    let event: NotificationRealtimeEvent;
    try {
      event = JSON.parse(raw) as NotificationRealtimeEvent;
    } catch {
      return;
    }

    if (!event || typeof event.type !== 'string') {
      return;
    }

    this.eventsSubject.next(event);

    // While polling we can stop the moment the socket comes back.
    if (event.type === 'connected') {
      this.clearPollFallback();
    }
  }

  private scheduleReconnect(): void {
    if (!this.wantConnection || this.reconnectTimer) {
      return;
    }

    // The endpoint is persistently unavailable (e.g. repeated 404s from a
    // backend that does not serve the socket): stop opening new sockets and
    // stay on the REST polling fallback instead of erroring forever. A later
    // manual reconnect() resets the counter and tries again.
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.stateSubject.next('polling');
      return;
    }

    // Exponential backoff capped at MAX_BACKOFF_MS...
    const exponential = Math.min(BASE_BACKOFF_MS * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    // ...plus up to 30% jitter so many tabs do not retry in lockstep.
    const jitter = exponential * 0.3 * Math.random();
    const delay = exponential + jitter;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private startPings(): void {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPings(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startPollFallback(): void {
    if (this.pollCycle) {
      return;
    }
    this.stateSubject.next('polling');
    this.pollCycle = timer(0, FALLBACK_POLL_MS).subscribe(() => {
      this.onPollTick?.();
    });
  }

  private clearPollFallback(): void {
    this.pollCycle?.unsubscribe();
    this.pollCycle = null;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPings();
    this.clearPollFallback();
  }

  private closeSocket(code: number, reason: string): void {
    this.clearTimers();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      try {
        socket.close(code, reason);
      } catch {
        /* already closing */
      }
    }
  }

  /**
   * Browsers cannot attach an Authorization header to a WebSocket handshake,
   * so the JWT travels as a query parameter, matching the server.
   */
  private buildUrl(token: string): string {
    const httpBase = `${environment.apiUrl}`;
    const base = this.resolveApiBase(httpBase);
    const wsBase = base.replace(/^http/, 'ws').replace(/\/+$/, '');
    return `${wsBase}/ws/notifications?token=${encodeURIComponent(token)}`;
  }

  private resolveApiBase(fallback: string): string {
    if (typeof window === 'undefined') {
      return fallback;
    }
    const configured = (window as unknown as { __API_BASE_URL__?: string }).__API_BASE_URL__;
    return configured && configured.length > 0 ? configured : fallback;
  }
}
