/** Controlled report values. Mirrors backend report_permissions. */

export type ReportType =
  | 'POLICY_REPORT'
  | 'SCHEME_REPORT'
  | 'USER_REPORT'
  | 'USER_ACTIVITY_REPORT'
  | 'DEPARTMENT_REPORT'
  | 'MINISTRY_REPORT'
  | 'STATE_REPORT'
  | 'ANALYTICS_REPORT'
  | 'AUDIT_REPORT';

export type ReportFormat = 'PDF' | 'EXCEL';

export type ReportStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface Report {
  report_id: number;
  generated_by: number;
  report_type: ReportType | string;
  report_format: ReportFormat | string;
  title: string | null;
  status: ReportStatus | string;
  parameters: Record<string, any> | null;
  file_path: string | null;
  error_message: string | null;
  file_size: number | null;
  expires_at: string | null;
  generated_at: string;
}

export interface ReportGenerateRequest {
  report_type: ReportType;
  report_format?: ReportFormat;
  title?: string | null;
  detail?: string | null;
  parameters?: Record<string, any> | null;
}

export interface ReportGenerateResponse {
  report: Report;
  data: Record<string, any> | any[] | null;
}

export interface ReportsOverview {
  users?: number;
  policies?: number;
  schemes?: number;
  ministries?: number;
  departments?: number;
  activity?: number;
}

export interface ReportTypesResponse {
  role: string;
  report_types: ReportType[];
  report_formats: ReportFormat[];
  details?: Partial<Record<ReportType, string[]>>;
  overview?: ReportsOverview | null;
}

export interface ReportOptionsResponse {
  field: string;
  report_type: string;
  values: string[];
}
