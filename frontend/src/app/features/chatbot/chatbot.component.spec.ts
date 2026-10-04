import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatbotComponent } from './chatbot.component';
import { Auth } from '../../core/services/auth';

function storeUser(role: string): void {
  localStorage.setItem(
    'policygpt_user',
    JSON.stringify({ user_id: 1, role, email: 't@example.com' }),
  );
  localStorage.setItem('policygpt_token', 'test-token');
}

// localStorage-backed Auth stub with the same observable semantics as the
// real Auth service for the members the chatbot component uses
// (getStoredUser/getUserRole). The real Auth class cannot be instantiated
// under raw vitest because JIT constructor-dependency metadata is only
// produced by the Angular compiler pipeline (`ng test`); the stub keeps
// every existing assertion exercising identical role/user behaviour.
const authStub = {
  getStoredUser: () => {
    try {
      const raw = localStorage.getItem('policygpt_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  getUserRole: () => {
    try {
      const raw = localStorage.getItem('policygpt_user');
      const user = raw ? (JSON.parse(raw) as { role?: unknown }) : null;
      const role = user?.role;
      return typeof role === 'string' ? role.toUpperCase().trim() : null;
    } catch {
      return null;
    }
  },
};

describe('ChatbotComponent', () => {
  let fixture: ComponentFixture<ChatbotComponent>;
  let component: ChatbotComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  const baseUrl = 'http://localhost:8000/chatbot';

  beforeEach(async () => {
    localStorage.clear();
    storeUser('CITIZEN');
    await TestBed.configureTestingModule({
      imports: [ChatbotComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    // NOTE: no fixture.detectChanges() here. In this repo's zoneless test
    // setup, an early detectChanges leaves later renders stale; tests that
    // need DOM use ApplicationRef.tick() after driving component state.
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('1. should create with launcher closed', () => {
    expect(component).toBeTruthy();
    expect(component.open).toBe(false);
  });

  it('2. should open with citizen greeting and quick actions', () => {
    component.openPanel();
    expect(component.open).toBe(true);
    expect(component.messages.length).toBe(1);
    expect(component.messages[0].text).toContain('find government schemes');
    expect(component.quickActions.length).toBe(6);
    expect(component.quickActions[0].label).toBe('Find schemes for me');
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });
  });

  it('3. should send a message and render the reply with actions', () => {
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });

    component.draft = 'scholarships?';
    component.send();
    expect(component.loading).toBe(true);

    const req = httpMock.expectOne(`${baseUrl}/message`);
    expect(req.request.method).toBe('POST');
    req.flush({
      success: true,
      conversation_id: 9,
      message: '**Test Scholarship**\n\nEducation Ministry',
      intent: 'SCHEME_SEARCH',
      sources: [],
      actions: [{ label: 'View Scheme', type: 'VIEW_SCHEME', route: '/dashboard/citizen/schemes/7' }],
      guest_remaining: null,
    });

    expect(component.loading).toBe(false);
    const last = component.messages[component.messages.length - 1];
    expect(last.sender).toBe('assistant');
    expect(last.actions?.length).toBe(1);
    expect(component.renderMarkdown('**bold** text')).toContain('<strong>bold</strong>');
  });

  it('4. should show safe server detail but suppress long internals', () => {
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });

    component.draft = 'hi';
    component.send();
    const req = httpMock.expectOne(`${baseUrl}/message`);
    req.flush({ detail: 'Service busy' }, { status: 500, statusText: 'Server Error' });

    let last = component.messages[component.messages.length - 1];
    expect(last.text).toContain('Service busy');

    component.draft = 'hi again';
    component.send();
    const req2 = httpMock.expectOne(`${baseUrl}/message`);
    req2.flush(
      { detail: 'Traceback File "/app/main.py" SECRET=' + 'x'.repeat(600) },
      { status: 500, statusText: 'Server Error' },
    );

    last = component.messages[component.messages.length - 1];
    expect(last.text).toContain("couldn't process");
    expect(last.text).not.toContain('Traceback');
    expect(last.text).not.toContain('SECRET');
  });

  it('5. should show guest limit card with login and register', () => {
    storeUser('GUEST');
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });
    expect(component.greeting).toContain('publicly available');

    component.draft = 'hi';
    component.send();
    const req = httpMock.expectOne(`${baseUrl}/message`);
    req.flush(
      { detail: "You've reached the guest chatbot limit. Sign in to continue." },
      { status: 403, statusText: 'Forbidden' },
    );

    const last = component.messages[component.messages.length - 1];
    expect(last.limitReached).toBe(true);
    expect(component.guestLimitReached).toBe(true);
  });

  it('6. should navigate using the action route', () => {
    const spy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.runAction({
      label: 'View Scheme',
      type: 'VIEW_SCHEME',
      route: '/dashboard/citizen/schemes/7',
    });
    expect(spy).toHaveBeenCalledWith('/dashboard/citizen/schemes/7');
  });

  it('7. should use role-based quick actions for admin', () => {
    storeUser('ADMIN');
    expect(component.quickActions.some((a) => a.label === 'User management help')).toBe(true);
    expect(component.greeting).toContain('administrators');
  });

  it('8. should minimize and close the panel', () => {
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });
    component.minimize();
    expect(component.minimized).toBe(true);
    expect(component.open).toBe(true);
    component.close();
    expect(component.open).toBe(false);
  });

  it('9. should render markdown tables for comparisons', () => {
    const html = component.renderMarkdown(
      '| Feature | A | B |\n|---|---|---|\n| Ministry | Edu | Health |',
    );
    expect(html).toContain('<table');
    expect(html).toContain('<th>Feature</th>');
    expect(html).toContain('<td>Edu</td>');
  });

  it('10. should store structured results and map card actions', () => {
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });

    component.draft = 'How many draft policies are there?';
    component.send();
    const req = httpMock.expectOne(`${baseUrl}/message`);
    req.flush({
      success: true,
      conversation_id: 9,
      message: '**Draft Policies**\n\nThere are **12** draft policies currently available.',
      intent: 'POLICY_COUNT',
      sources: [],
      actions: [{ label: 'View All Draft Policies', type: 'NAVIGATE', route: '/dashboard/citizen/policies' }],
      data: { response_type: 'STATISTIC_RESPONSE', count: 12 },
      results: [{ type: 'statistic', title: 'Draft Policies', subtitle: '12', route: '/dashboard/citizen/policies' }],
      guest_remaining: null,
    });

    const last = component.messages[component.messages.length - 1];
    expect(last.results?.length).toBe(1);
    expect(last.data?.response_type).toBe('STATISTIC_RESPONSE');
    const action = component.resultAction(last.results![0]);
    expect(action?.route).toBe('/dashboard/citizen/policies');
    expect(component.statusClass('APPROVED')).toContain('approved');
    expect(component.statusClass('DRAFT')).toContain('draft');
  });

  it('11. should render backend record lists as one continuous ordered list', () => {
    const html = component.renderMarkdown(
      '**Schemes**\n\nFound **3** matching schemes:\n\n' +
        '1. Scheme A\n   Ministry A; Education\n' +
        '2. Scheme B\n   Ministry B; Health\n' +
        '3. Scheme C\n   Ministry C; Agriculture\n\n' +
        'Select View Scheme on any result for full details.',
    );
    expect(html.match(/<ol>/g)?.length ?? 0).toBe(1);
    expect(html.match(/<li>/g)?.length ?? 0).toBe(3);
    expect(html).toContain('Ministry A');
    expect(html).toContain('chatbot-list-detail');
  });

  it('12. should keep metadata lines inside their list item without renumbering', () => {
    const html = component.renderMarkdown('1. Scheme A\n   Ministry A; Education\n2. Scheme B');
    expect(html.match(/<ol>/g)?.length ?? 0).toBe(1);
    expect(html.match(/<li>/g)?.length ?? 0).toBe(2);
    // The metadata stays in the first item, not in a separate paragraph.
    expect(html).toContain('Scheme A<br>');
  });

  it('13. should restart numbering only across separate sections', () => {
    const html = component.renderMarkdown(
      '**Policies**\n\n1. Policy A\n\n**Schemes**\n\n1. Scheme A\n2. Scheme B',
    );
    expect(html.match(/<ol>/g)?.length ?? 0).toBe(2);
    expect(html.match(/<li>/g)?.length ?? 0).toBe(3);
  });

  it('14. should omit enumerated record lines when structured cards exist', () => {
    const msg = {
      id: 1,
      sender: 'assistant' as const,
      text:
        '**Schemes**\n\nFound **2** matching schemes:\n\n' +
        '1. Scheme A\n   Ministry A\n2. Scheme B\n   Ministry B\n\n' +
        "Reply 'show more' for the next results.",
      results: [
        { type: 'scheme', id: 5, title: 'Scheme A', ministry: 'Ministry A', route: '/dashboard/citizen/schemes/5' },
        { type: 'scheme', id: 9, title: 'Scheme B', ministry: 'Ministry B', route: '/dashboard/citizen/schemes/9' },
      ],
      data: null,
    };
    const shown = component.displayText(msg);
    expect(shown).not.toContain('1. Scheme A');
    expect(shown).not.toContain('Ministry A');
    expect(shown).toContain('Found **2**');
    expect(shown).toContain("Reply 'show more'");
  });

  it('15. should render full text when no structured results exist', () => {
    const msg = {
      id: 2,
      sender: 'assistant' as const,
      text: '1. Scheme A\n   Ministry A\n2. Scheme B',
      results: [],
      data: null,
    };
    expect(component.displayText(msg)).toBe(msg.text);
  });

  it('16. should number cards continuously and across pages, skipping summaries', () => {
    const msg = {
      id: 3,
      sender: 'assistant' as const,
      text: 'x',
      results: [
        { type: 'statistic', title: 'Schemes', subtitle: '12' },
        { type: 'scheme', id: 5, title: 'Scheme A', route: '/dashboard/citizen/schemes/5' },
        { type: 'scheme', id: 9, title: 'Scheme B', route: '/dashboard/citizen/schemes/9' },
      ],
      data: { response_type: 'LIST_RESPONSE', page: 2, page_size: 5 },
    };
    // (page 2, size 5): record cards continue at 6, 7.
    expect(component.cardNumber(msg, 1)).toBe(6);
    expect(component.cardNumber(msg, 2)).toBe(7);
    const firstPage = { ...msg, data: { response_type: 'SEARCH_RESPONSE' } };
    expect(component.cardNumber(firstPage, 1)).toBe(1);
    expect(component.cardNumber(firstPage, 2)).toBe(2);
  });

  it('17. should map View Details actions to real record routes', () => {
    const scheme = component.resultAction({
      type: 'scheme', id: 9, title: 'Scheme B', route: '/dashboard/citizen/schemes/9',
    });
    expect(scheme?.label).toBe('View Scheme Details');
    expect(scheme?.route).toBe('/dashboard/citizen/schemes/9');
    const policy = component.resultAction({
      type: 'policy', id: 10, title: 'Policy C', route: '/dashboard/citizen/policies/10',
    });
    expect(policy?.label).toBe('View Policy Details');
    expect(policy?.route).toBe('/dashboard/citizen/policies/10');
    expect(component.resultAction({ type: 'scheme', id: 9 })).toBeNull();
  });

  it('18. should group ministry details and hide empty fields', () => {
    expect(component.resultMeta({ type: 'scheme', ministry: 'Ministry A', category: 'Education', state: 'Karnataka' })).toBe(
      'Ministry A · Education · Karnataka',
    );
    expect(component.resultMeta({ type: 'scheme', ministry: 'Ministry A' })).toBe('Ministry A');
    expect(component.resultMeta({ type: 'scheme' })).toBe('');
    expect(component.renderMarkdown('1. <b>X</b>')).toContain('&lt;b&gt;');
  });

  it('19. should distinguish the four eligibility assessments', () => {
    expect(component.eligibilityClass('Eligible based on available criteria.')).toContain('eligible');
    expect(component.eligibilityIcon('Eligible based on available criteria.')).toBe('check_circle');
    expect(component.eligibilityClass('Possibly eligible — verification required.')).toContain('possible');
    expect(component.eligibilityIcon('Possibly eligible — verification required.')).toBe('help');
    expect(component.eligibilityClass('Not eligible based on a specified mandatory criterion.')).toContain('not-eligible');
    expect(component.eligibilityIcon('Not eligible based on a specified mandatory criterion.')).toBe('cancel');
    expect(component.eligibilityClass('Unable to determine — more information required.')).toContain('unknown');
    expect(component.eligibilityIcon('Unable to determine — more information required.')).toBe('info');
  });

  it('20. should render one card per record with correct detail navigation', () => {
    component.openPanel();
    httpMock.expectOne(`${baseUrl}/history`).flush({ conversation_id: 9, messages: [] });

    component.draft = 'Show me schemes I may be eligible for';
    component.send();
    httpMock.expectOne(`${baseUrl}/message`).flush({
      success: true,
      conversation_id: 9,
      message:
        'I found **2** schemes that may match.\n\n' +
        '1. Scheme A\n   Ministry A\n2. Scheme B\n   Ministry B',
      intent: 'SCHEME_RECOMMENDATION',
      sources: [],
      actions: [],
      data: { response_type: 'ELIGIBILITY_RESPONSE', eligibility_label: 'Possibly eligible — verification required.' },
      results: [
        {
          type: 'scheme', id: 5, title: 'Scheme A',
          subtitle: 'Short description A.', ministry: 'Ministry A', state: 'Karnataka',
          status: 'APPROVED', route: '/dashboard/citizen/schemes/5',
        },
        {
          type: 'scheme', id: 9, title: 'Scheme B with a very long name that must still wrap inside the card',
          subtitle: 'Short description B.', ministry: 'Ministry B',
          status: 'APPROVED', route: '/dashboard/citizen/schemes/9',
        },
      ],
      guest_remaining: null,
    });
    // ApplicationRef.tick() re-renders reliably in both test runners
    // (fixture.detectChanges() does not propagate in the zoneless setup).
    TestBed.inject(ApplicationRef).tick();

    const last = component.messages[component.messages.length - 1];
    // No duplicated enumeration: prose summary stays, record lines move to cards.
    expect(component.displayText(last)).not.toContain('1. Scheme A');
    expect(component.cardNumber(last, 0)).toBe(1);
    expect(component.cardNumber(last, 1)).toBe(2);

    const cards = fixture.nativeElement.querySelectorAll('.chatbot-result-card');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('.chatbot-result-card__num')?.textContent?.trim()).toBe('1');
    expect(cards[1].querySelector('.chatbot-result-card__title')?.textContent).toContain('very long name');
    expect(cards[1].querySelector('.chatbot-result-card__meta')?.textContent).toContain('Ministry B');

    const spy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.runAction(component.resultAction(last.results![1])!);
    expect(spy).toHaveBeenCalledWith('/dashboard/citizen/schemes/9');
  });
});
