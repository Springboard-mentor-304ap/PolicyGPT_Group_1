export interface ChatAction {
  label: string;
  type: string;
  route?: string | null;
  entity_type?: string | null;
  entity_id?: number | string | null;
}

export interface ChatSource {
  kind: string;
  id?: number | string | null;
  title?: string;
}

export interface ChatMessageRequest {
  message: string;
  conversation_id?: number | null;
  context?: { page?: string } | null;
}

export interface ChatMessageResponse {
  success: boolean;
  conversation_id: number;
  message: string;
  intent: string;
  sources: ChatSource[];
  actions: ChatAction[];
  guest_remaining?: number | null;
}

export interface ChatHistoryMessage {
  message_id: number;
  sender: string;
  message: string;
  intent?: string | null;
  created_at: string;
}

export interface ChatHistoryResponse {
  conversation_id: number;
  messages: ChatHistoryMessage[];
}

export interface ChatConfig {
  enabled: boolean;
  guest_message_limit: number;
  max_message_length: number;
  max_history: number;
}

export interface ChatUsage {
  message_count: number;
  guest_limit?: number | null;
  guest_remaining?: number | null;
}

export interface ChatUiMessage {
  id: number;
  sender: "user" | "assistant";
  text: string;
  actions?: ChatAction[];
  limitReached?: boolean;
}

export interface QuickAction {
  label: string;
  message: string;
  icon: string;
}
