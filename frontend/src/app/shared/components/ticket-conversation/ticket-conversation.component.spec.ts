import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketConversationComponent } from './ticket-conversation.component';
import { SupportService } from '../../../core/services/support.service';

@Component({
  standalone: true,
  imports: [TicketConversationComponent],
  template: `<app-ticket-conversation [ticketId]="ticketId" [canReply]="canReply"></app-ticket-conversation>`,
})
class ConversationHost {
  ticketId = 42;
  canReply = true;
}

describe('TicketConversationComponent', () => {
  let fixture: ComponentFixture<ConversationHost>;
  let supportService: {
    getTicketMessages: ReturnType<typeof vi.fn>;
    postTicketMessage: ReturnType<typeof vi.fn>;
    getTicketMessagesAdmin: ReturnType<typeof vi.fn>;
    postTicketMessageAdmin: ReturnType<typeof vi.fn>;
  };

  const messages = [
    {
      id: 1,
      ticket_id: 42,
      sender_id: 7,
      sender_role: 'CITIZEN',
      sender_name: 'Test Citizen',
      message: 'My application is not showing.',
      created_at: '2026-10-06T10:30:00.000Z',
    },
    {
      id: 2,
      ticket_id: 42,
      sender_id: 1,
      sender_role: 'ADMIN',
      sender_name: 'Admin One',
      message: 'We are checking the issue.',
      created_at: '2026-10-06T10:42:00.000Z',
    },
  ];

  function conversation(): TicketConversationComponent {
    return fixture.debugElement.children[0].componentInstance as TicketConversationComponent;
  }

  beforeEach(async () => {
    supportService = {
      getTicketMessages: vi.fn().mockReturnValue(of(messages)),
      postTicketMessage: vi.fn().mockImplementation((_id: number, payload: { message: string }) =>
        of({ ...messages[0], id: 3, message: payload.message }),
      ),
      getTicketMessagesAdmin: vi.fn().mockReturnValue(of(messages)),
      postTicketMessageAdmin: vi.fn().mockReturnValue(of(messages[1])),
    };

    await TestBed.configureTestingModule({
      imports: [ConversationHost],
      providers: [{ provide: SupportService, useValue: supportService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ConversationHost);
  });

  it('1. should load user messages on init', () => {
    fixture.detectChanges();
    expect(supportService.getTicketMessages).toHaveBeenCalledWith(42);
    expect(conversation().messages().length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('My application is not showing.');
  });

  it('2. should distinguish admin messages', () => {
    fixture.detectChanges();
    expect(conversation().isAdminMessage(messages[1] as never)).toBe(true);
    expect(conversation().isAdminMessage(messages[0] as never)).toBe(false);
    expect(
      fixture.nativeElement.querySelectorAll('.conv-msg--admin').length,
    ).toBe(1);
  });

  it('3. should post a reply and append it', () => {
    fixture.detectChanges();
    conversation().draft = 'Thank you.';
    conversation().sendReply();
    expect(supportService.postTicketMessage).toHaveBeenCalledWith(42, {
      message: 'Thank you.',
    });
    expect(conversation().messages().length).toBe(3);
    expect(conversation().draft).toBe('');
  });

  it('4. should not post blank replies', () => {
    fixture.detectChanges();
    conversation().draft = '   ';
    conversation().sendReply();
    expect(supportService.postTicketMessage).not.toHaveBeenCalled();
  });

  it('5. should surface load errors with retry', () => {
    supportService.getTicketMessages.mockReturnValue(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    expect(conversation().loadError()).toContain('Unable to load');
    expect(fixture.nativeElement.textContent).toContain('Try Again');
  });

  it('6. should hide the reply box when replies are disabled', () => {
    fixture.componentInstance.canReply = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.conv-reply')).toBeNull();
  });
});
