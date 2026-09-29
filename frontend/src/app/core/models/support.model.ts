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
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | string;
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
