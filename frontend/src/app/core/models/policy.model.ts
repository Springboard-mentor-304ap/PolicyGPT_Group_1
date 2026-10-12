export type PolicyStatus = 
  | 'DRAFT' 
  | 'PENDING_APPROVAL' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'ARCHIVED' 
  | 'ARCHIVE_REQUESTED' 
  | 'DELETE_REQUESTED';

export interface PolicyBase {
  title: string;
  description: string;
  category: string;
  ministry?: string | null;
  department?: string | null;
  state?: string | null;
  sector?: string | null;
  publication_date?: string | null;
  effective_date?: string | null;
  document_url?: string | null;
  source_url?: string | null;
  benefits?: string[] | null;
  eligibility_rules?: Record<string, any>[] | null;
  key_objectives?: string[] | null;
  additional_info?: string | null;
  important_notes?: string | null;
  documents_required?: string | null;
  implementation_process?: string | null;
}

export interface PolicyCreate extends PolicyBase {}

export interface PolicyUpdate {
  title?: string;
  description?: string;
  category?: string;
  ministry?: string | null;
  department?: string | null;
  state?: string | null;
  sector?: string | null;
  publication_date?: string | null;
  effective_date?: string | null;
  document_url?: string | null;
  source_url?: string | null;
  benefits?: string[] | null;
  eligibility_rules?: Record<string, any>[] | null;
  key_objectives?: string[] | null;
  additional_info?: string | null;
  important_notes?: string | null;
  documents_required?: string | null;
  implementation_process?: string | null;
}

export interface PolicyResponse extends PolicyBase {
  policy_id: number;
  status: PolicyStatus;
  created_by?: number | null;
  approved_by?: number | null;
  updated_by?: number | null;
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

export interface PolicyListResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  policies: PolicyResponse[];
}

export interface PolicyComparisonResponse {
  policy_1: PolicyResponse;
  policy_2: PolicyResponse;
}

export interface PolicyRejectRequest {
  reason: string;
}

export interface PolicyArchiveRequest {
  reason: string;
}

export interface PolicyDeleteRequest {
  reason: string;
}

export interface PolicyDocumentResponse {
  document_id: number;
  policy_id: number;
  document_name: string;
  document_type?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  uploaded_by?: number | null;
  created_at?: string | null;
}

export interface PolicyFilters {
  search?: string;
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

export interface PolicyAnalyticsResponse {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  total_policies?: number;
  by_status?: Record<string, number>;
  by_category?: { category: string; count: number }[];
  by_state?: { state: string; count: number }[];
  by_ministry?: { ministry: string; count: number }[];
  monthly_trend?: any[];
}