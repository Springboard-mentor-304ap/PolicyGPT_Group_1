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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
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
});
