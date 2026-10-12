export type SchemeStatus = 
  | 'DRAFT' 
  | 'PENDING_APPROVAL' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'ARCHIVED' 
  | 'ARCHIVE_REQUESTED' 
  | 'DELETE_REQUESTED';

export interface SchemeBase {
  name: string;
  title?: string | null;
  description: string;
  category: string;
  ministry?: string | null;
  department?: string | null;
  state?: string | null;
  benefits?: string[] | null;
  documents_required?: string | null;
  application_process?: string | null;
  application_url?: string | null;
  source_url?: string | null;
  eligibility_rules?: Record<string, any>[] | null;
}

export interface SchemeCreate extends SchemeBase {}

export interface SchemeUpdate {
  name?: string;
  description?: string;
  category?: string;
  ministry?: string | null;
  department?: string | null;
  state?: string | null;
  benefits?: string[] | null;
  documents_required?: string | null;
  application_process?: string | null;
  application_url?: string | null;
  source_url?: string | null;
  eligibility_rules?: Record<string, any>[] | null;
}

export interface SchemeResponse extends SchemeBase {
  scheme_id: number;
  status: SchemeStatus;
  created_by?: number | null;
  approved_by?: number | null;
  rejection_reason?: string | null;
  archive_reason?: string | null;
  archive_requested_by?: number | null;
  archive_requested_at?: string | null;
  delete_reason?: string | null;
  delete_requested_by?: number | null;
  delete_requested_at?: string | null;
  delete_requested_from_status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  created_by_name?: string | null;
  created_by_role?: string | null;
  approved_by_name?: string | null;
  approved_by_role?: string | null;
  deleted_by_name?: string | null;
  requested_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchemeListResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  schemes: SchemeResponse[];
}

export interface SchemeRejectRequest {
  reason: string;
}

export interface SchemeArchiveRequest {
  reason: string;
}

export interface SchemeDeleteRequest {
  reason: string;
}

export interface SchemeFilters {
  keyword?: string;
  category?: string;
  ministry?: string;
  department?: string;
  state?: string;
  sector?: string;
  publication_date?: string;
  status?: string;
  page?: number;
  limit?: number;
  manage?: boolean;
  created_by?: number;
}

export interface SchemeAnalyticsResponse {
  total: number;
  active: number;
  approved: number;
  pending: number;
  draft: number;
  rejected: number;
  archived: number;
  archive_requested: number;
  delete_requested: number;
  by_category: Record<string, number>;
  by_state: Record<string, number>;
}