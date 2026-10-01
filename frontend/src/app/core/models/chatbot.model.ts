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
  data?: ChatResponseData | null;
  results?: ChatResultItem[];
}

export interface ChatResultItem {
  type: string;
  id?: number | string | null;
  title?: string;
  subtitle?: string | null;
  status?: string | null;
  ministry?: string | null;
  category?: string | null;
  state?: string | null;
  route?: string | null;
  extra?: Record<string, unknown>;
}

export interface ChatResponseData {
  response_type?: string;
  count?: number | null;
  total?: number | null;
  page?: number | null;
  page_size?: number | null;
  [key: string]: unknown;
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
  results?: ChatResultItem[];
  data?: ChatResponseData | null;
}

export interface QuickAction {
  label: string;
  message: string;
  icon: string;
}
