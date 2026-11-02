import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WorkflowTimelineComponent } from './workflow-timeline.component';

/* NOTE: this repo's vitest harness only reflects the initial render
   in `fixture.nativeElement` (see notification-bell.spec.ts, which
   asserts state, not post-async DOM). DOM assertions below cover the
   initial loading state; post-fetch behavior is asserted on component
   state, which is what drives the template. */
describe('WorkflowTimelineComponent', () => {
  let fixture: ComponentFixture<WorkflowTimelineComponent>;
  let component: WorkflowTimelineComponent;
  let httpMock: HttpTestingController;

  const mockEvent = {
    audit_id: 1,
    user_id: 4,
    user_name: 'Test Government Official',
    user_email: null,
    user_role: 'GOVERNMENT_OFFICIAL',
    action: 'POLICY_SUBMITTED',
    entity_type: 'POLICY',
    entity_id: 10,
    description: "Policy 'X' submitted for approval.",
    action_label: 'Submitted for approval',
    from_status: 'DRAFT',
    to_status: 'PENDING_APPROVAL',
    reason: null,
    created_at: '2026-10-01T10:00:00',
  };

  function flushEvents(events: unknown[] = [mockEvent], total = 1): void {
    const req = httpMock.expectOne((r) =>
      r.url.endsWith('/audit-logs/entity/POLICY/10'),
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush({
      entity_type: 'POLICY',
      entity_id: 10,
      total,
      page: 1,
      limit: 20,
      pages: 1,
      events,
    });
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [WorkflowTimelineComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(WorkflowTimelineComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.entityType = 'POLICY';
    component.entityId = 10;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('creates and requests the entity timeline', () => {
    expect(component).toBeTruthy();
    expect(component.loading).toBe(true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.tl-spinner')).toBeTruthy();
    flushEvents();
    expect(component.events.length).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('stores actor name and role from enriched events', () => {
    flushEvents();
    expect(component.actorName(component.events[0] as never)).toBe(
      'Test Government Official',
    );
    expect(component.actorRole(component.events[0] as never)).toBe(
      'Government Official',
    );
    expect(component.eventTitle(component.events[0] as never)).toBe(
      'Submitted for approval',
    );
  });

  it('falls back to Unknown User without inventing identity', () => {
    flushEvents([
      { ...mockEvent, user_id: 999999, user_name: 'Unknown User', user_role: null },
    ]);
    expect(component.actorName(component.events[0] as never)).toBe('Unknown User');
    expect(component.actorRole(component.events[0] as never)).toBe('');
  });

  it('records an empty state when there are no events', () => {
    flushEvents([], 0);
    expect(component.events).toEqual([]);
    expect(component.total).toBe(0);
    expect(component.errorMessage).toBe('');
  });

  it('records an error state with retry that reloads', () => {
    const req = httpMock.expectOne((r) =>
      r.url.endsWith('/audit-logs/entity/POLICY/10'),
    );
    req.flush('denied', { status: 403, statusText: 'Forbidden' });
    expect(component.errorMessage).toContain('permission');
    component.retry();
    httpMock.expectOne((r) =>
      r.url.endsWith('/audit-logs/entity/POLICY/10'),
    );
  });

  it('emits loaded events for host identity lookups', () => {
    const spy = vi.fn();
    component.timelineLoaded.subscribe(spy);
    flushEvents();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].length).toBe(1);
  });

  it('maps icons per action category', () => {
    flushEvents();
    expect(component.iconFor('POLICY_APPROVED')).toBe('check_circle');
    expect(component.iconFor('SCHEME_DELETE_REQUESTED')).toBe('delete_outline');
    expect(component.iconFor('POLICY_SUBMITTED')).toBe('send');
    expect(component.iconFor('SOMETHING_NEW')).toBe('notifications');
  });

  it('formats timestamps with date and time', () => {
    flushEvents();
    const text = component.formatDateTime('2026-10-01T10:00:00');
    expect(text).not.toBe('Not specified');
    expect(text.length).toBeGreaterThan(10);
    expect(component.formatDateTime(null)).toBe('Not specified');
  });

  it('reveals everything immediately without an IntersectionObserver', () => {
    // jsdom has no IntersectionObserver: the component must degrade
    // to fully visible content instead of an empty animated list.
    expect(typeof IntersectionObserver).toBe('undefined');
    flushEvents([mockEvent, { ...mockEvent, audit_id: 2 }], 2);
    expect(component.revealed).toBe(2);
    expect(component.progressPct).toBe(100);
  });

  it('keeps reveal progress monotonic and disconnects on destroy', () => {
    flushEvents([mockEvent, { ...mockEvent, audit_id: 2 }], 2);
    expect(component.revealed).toBe(2);
    const disconnect = vi.fn();
    (component as any).observer = { disconnect } as never;
    fixture.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('reports zero progress with no events', () => {
    flushEvents([], 0);
    expect(component.revealed).toBe(0);
    expect(component.progressPct).toBe(0);
  });
});
