import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import {
  ChatConfig,
  ChatConversationListResponse,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  ChatUsage,
} from "../models/chatbot.model";

@Injectable({
  providedIn: "root",
})
export class ChatbotService {
  private readonly baseUrl = "http://localhost:8000/chatbot";

  private readonly http = inject(HttpClient);

  sendMessage(
    payload: ChatMessageRequest,
  ): Observable<ChatMessageResponse> {
    return this.http.post<ChatMessageResponse>(
      `${this.baseUrl}/message`,
      payload,
    );
  }

  getHistory(
    conversationId?: number | null,
  ): Observable<ChatHistoryResponse> {
    const params: Record<string, string> = {};
    if (conversationId !== undefined && conversationId !== null) {
      params["conversation_id"] = String(conversationId);
    }
    return this.http.get<ChatHistoryResponse>(`${this.baseUrl}/history`, {
      params,
    });
  }

  clearHistory(): Observable<{ message: string; removed: number }> {
    return this.http.delete<{ message: string; removed: number }>(
      `${this.baseUrl}/history`,
    );
  }

  listConversations(
    limit = 50,
  ): Observable<ChatConversationListResponse> {
    return this.http.get<ChatConversationListResponse>(
      `${this.baseUrl}/conversations`,
      { params: { limit: String(limit) } },
    );
  }

  createConversation(): Observable<{ conversation_id: number }> {
    return this.http.post<{ conversation_id: number }>(
      `${this.baseUrl}/conversations`,
      {},
    );
  }

  deleteConversation(
    conversationId: number,
  ): Observable<{ message: string; removed: number }> {
    return this.http.delete<{ message: string; removed: number }>(
      `${this.baseUrl}/conversations/${conversationId}`,
    );
  }

  getConfig(): Observable<ChatConfig> {
    return this.http.get<ChatConfig>(`${this.baseUrl}/config`);
  }

  getUsage(): Observable<ChatUsage> {
    return this.http.get<ChatUsage>(`${this.baseUrl}/usage`);
  }
}
