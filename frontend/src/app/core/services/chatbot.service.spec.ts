import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatbotService } from './chatbot.service';
import { ChatMessageResponse } from '../models/chatbot.model';

describe('ChatbotService', () => {
  let service: ChatbotService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/chatbot';

  const mockReply: ChatMessageResponse = {
    success: true,
    conversation_id: 3,
    message: 'Here is what I found.',
    intent: 'SCHEME_SEARCH',
    sources: [{ kind: 'SCHEME', id: 7, title: 'Test Scholarship' }],
    actions: [{ label: 'View Scheme', type: 'VIEW_SCHEME', route: '/dashboard/citizen/schemes/7' }],
    guest_remaining: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatbotService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ChatbotService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. should be created', () => {
    expect(service).toBeTruthy();
  });

  it('2. should post a message with conversation context', () => {
    service
      .sendMessage({ message: 'scholarships?', conversation_id: 3 })
      .subscribe((res) => {
        expect(res.conversation_id).toBe(3);
        expect(res.intent).toBe('SCHEME_SEARCH');
        expect(res.actions.length).toBe(1);
      });

    const req = httpMock.expectOne(`${baseUrl}/message`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.message).toBe('scholarships?');
    expect(req.request.body.conversation_id).toBe(3);
    req.flush(mockReply);
  });

  it('3. should fetch history', () => {
    service.getHistory().subscribe((res) => {
      expect(res.messages.length).toBe(2);
    });

    const req = httpMock.expectOne(`${baseUrl}/history`);
    expect(req.request.method).toBe('GET');
    req.flush({
      conversation_id: 3,
      messages: [
        { message_id: 1, sender: 'user', message: 'hi', intent: 'GREETING', created_at: '' },
        { message_id: 2, sender: 'assistant', message: 'Hello!', intent: 'GREETING', created_at: '' },
      ],
    });
  });

  it('4. should clear history', () => {
    service.clearHistory().subscribe((res) => {
      expect(res.removed).toBe(4);
    });

    const req = httpMock.expectOne(`${baseUrl}/history`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Chat history cleared.', removed: 4 });
  });

  it('5. should fetch config and usage', () => {
    service.getConfig().subscribe((config) => {
      expect(config.guest_message_limit).toBe(5);
    });
    httpMock.expectOne(`${baseUrl}/config`).flush({
      enabled: true,
      guest_message_limit: 5,
      max_message_length: 2000,
      max_history: 20,
    });

    service.getUsage().subscribe((usage) => {
      expect(usage.message_count).toBe(2);
    });
    httpMock.expectOne(`${baseUrl}/usage`).flush({
      message_count: 2,
      guest_limit: 5,
      guest_remaining: 3,
    });
  });
});
