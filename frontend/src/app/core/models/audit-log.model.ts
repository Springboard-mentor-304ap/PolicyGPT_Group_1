export interface AuditLog {
  audit_id: number;
  user_id: number | null;
  user_name?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  description?: string | null;
  ip_address?: string | null;
  created_at: string;
  /** Timeline enrichment (per-entity endpoint only). */
  action_label?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
}

export interface EntityAuditTimeline {
  entity_type: string;
  entity_id: number;
  total: number;
  page: number;
  limit: number;
  pages: number;
  events: AuditLog[];
}

export interface AuditLogFilters {
  action?: string;
  entity_type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}
