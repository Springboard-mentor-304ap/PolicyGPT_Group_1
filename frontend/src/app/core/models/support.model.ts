import { FAQ } from './faq.model';

export type { FAQ };

export interface SupportRequest {
  query_id: number;
  request_id: string;
  user_id: number;
  name?: string;
  email?: string;
  category: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED' | string;
  response?: string | null;
  responded_at?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
}

export interface SupportRequestCreate {
  category: string;
  subject: string;
  description: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
}

export interface AdminSupportRequest extends SupportRequest {
  user_name?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  assigned_to?: number | null;
}

export interface SupportRequestRespond {
  response?: string | null;
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED' | string;
  assigned_to?: number | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  sender_id: number;
  sender_role: string;
  sender_name?: string | null;
  message: string;
  created_at: string;
}

export interface TicketMessageCreate {
  message: string;
}

export interface SupportAnalytics {
  total_tickets: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  by_role: Record<string, number>;
  resolved_count: number;
  avg_resolution_hours: number | null;
  feedback_count: number;
}

export const SUPPORT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
] as const;

export const SUPPORT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
