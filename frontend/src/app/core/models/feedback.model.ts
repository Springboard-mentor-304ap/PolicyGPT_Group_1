export type FeedbackType =
  | 'GENERAL'
  | 'BUG_ISSUE'
  | 'POLICY_INQUIRY'
  | 'SCHEME_QUESTION'
  | 'SUGGESTION'
  | 'GRIEVANCE';

export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Feedback {
  feedback_id: number;
  user_id: number;
  policy_id?: number | null;
  scheme_id?: number | null;
  feedback_type: string;
  subject?: string | null;
  message: string;
  status: FeedbackStatus | string;
  admin_response?: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string | null;
  user_email?: string | null;
  user_role?: string | null;
}

export interface FeedbackCreate {
  user_id?: number;
  policy_id?: number | null;
  scheme_id?: number | null;
  feedback_type: string;
  subject?: string | null;
  message: string;
}

export interface FeedbackUpdate {
  status?: string;
  admin_response?: string | null;
}
