/** Shared report catalog: categories, type metadata, detail labels. */

import { ReportType } from '../../core/models/report.model';

export interface ReportCategory {
  key: string;
  title: string;
  description: string;
  icon: string;
  types: ReportType[];
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    key: 'user',
    title: 'User Reports',
    description: 'User overview, registrations and distributions.',
    icon: 'group',
    types: ['USER_REPORT'],
  },
  {
    key: 'policy',
    title: 'Policy Reports',
    description: 'Policy portfolio, status and distribution breakdowns.',
    icon: 'policy',
    types: ['POLICY_REPORT'],
  },
  {
    key: 'scheme',
    title: 'Scheme Reports',
    description: 'Scheme portfolio, status and expiring schemes.',
    icon: 'account_balance',
    types: ['SCHEME_REPORT'],
  },
  {
    key: 'government',
    title: 'Government Reports',
    description: 'Ministry and department aggregations.',
    icon: 'domain',
    types: ['MINISTRY_REPORT', 'DEPARTMENT_REPORT'],
  },
  {
    key: 'state',
    title: 'State Reports',
    description: 'State-wise policy and scheme distribution.',
    icon: 'map',
    types: ['STATE_REPORT'],
  },
  {
    key: 'activity',
    title: 'Activity Reports',
    description: 'Audit and search activity within your scope.',
    icon: 'history',
    types: ['USER_ACTIVITY_REPORT'],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    description: 'Platform analytics within your scope.',
    icon: 'analytics',
    types: ['ANALYTICS_REPORT'],
  },
  {
    key: 'audit',
    title: 'Audit Reports',
    description: 'System audit trail for administrators.',
    icon: 'fact_check',
    types: ['AUDIT_REPORT'],
  },
];

export const REPORT_TYPE_META: Record<ReportType, { title: string; description: string }> = {
  POLICY_REPORT: { title: 'Policy Report', description: 'Full policy portfolio.' },
  SCHEME_REPORT: { title: 'Scheme Report', description: 'Full scheme portfolio.' },
  USER_REPORT: { title: 'User Report', description: 'Registered user base.' },
  USER_ACTIVITY_REPORT: {
    title: 'User Activity Report',
    description: 'Audit and search activity.',
  },
  DEPARTMENT_REPORT: {
    title: 'Department Report',
    description: 'Ministry and department aggregation.',
  },
  MINISTRY_REPORT: {
    title: 'Ministry Report',
    description: 'Ministry-wise distribution and status.',
  },
  STATE_REPORT: {
    title: 'State Report',
    description: 'State-wise distribution and status.',
  },
  ANALYTICS_REPORT: {
    title: 'Analytics Report',
    description: 'Platform analytics snapshot.',
  },
  AUDIT_REPORT: { title: 'Audit Report', description: 'System audit trail.' },
};

export const REPORT_DETAIL_LABELS: Record<string, string> = {
  overview: 'Overview',
  status: 'Status',
  'ministry-wise': 'Ministry-wise',
  'department-wise': 'Department-wise',
  'state-wise': 'State-wise',
  'category-wise': 'Category-wise',
  'sector-wise': 'Sector-wise',
  expiring: 'Expiring',
  registration: 'Registration',
  'role-wise': 'Role-wise',
  'district-wise': 'District-wise',
  'active-inactive': 'Active vs inactive',
  policy: 'Policy',
  scheme: 'Scheme',
  'policy-vs-scheme': 'Policy vs scheme',
  activity: 'Activity',
  'action-wise': 'Action-wise',
  'entity-wise': 'Entity-wise',
};

export function detailLabel(detail: string): string {
  return REPORT_DETAIL_LABELS[detail] ?? detail;
}

export interface FilterField {
  key: string;
  label: string;
  kind: 'date' | 'text' | 'number' | 'select' | 'remote';
  options?: string[];
  staticOptions?: string[];
}

export const FILTERS_BY_TYPE: Record<ReportType, FilterField[]> = {
  POLICY_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'ministry', label: 'Ministry', kind: 'remote' },
    { key: 'department', label: 'Department', kind: 'remote' },
    { key: 'state', label: 'State', kind: 'remote' },
    { key: 'category', label: 'Category', kind: 'remote' },
    { key: 'sector', label: 'Sector', kind: 'remote' },
    { key: 'status', label: 'Status', kind: 'remote' },
    { key: 'policy_id', label: 'Policy ID', kind: 'number' },
  ],
  SCHEME_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'ministry', label: 'Ministry', kind: 'remote' },
    { key: 'department', label: 'Department', kind: 'remote' },
    { key: 'state', label: 'State', kind: 'remote' },
    { key: 'category', label: 'Category', kind: 'remote' },
    { key: 'status', label: 'Status', kind: 'remote' },
    { key: 'scheme_id', label: 'Scheme ID', kind: 'number' },
  ],
  USER_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'role', label: 'Role', kind: 'remote' },
    { key: 'state', label: 'State', kind: 'remote' },
    { key: 'district', label: 'District', kind: 'remote' },
    { key: 'organization', label: 'Organization', kind: 'remote' },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      staticOptions: ['active', 'inactive'],
    },
  ],
  USER_ACTIVITY_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'action', label: 'Action', kind: 'remote' },
    { key: 'entity_type', label: 'Entity type', kind: 'remote' },
    { key: 'user_id', label: 'User ID (admin only)', kind: 'number' },
  ],
  DEPARTMENT_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'ministry', label: 'Ministry', kind: 'remote' },
    { key: 'department', label: 'Department', kind: 'remote' },
    { key: 'state', label: 'State', kind: 'remote' },
    { key: 'category', label: 'Category', kind: 'remote' },
  ],
  MINISTRY_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'ministry', label: 'Ministry', kind: 'remote' },
    { key: 'department', label: 'Department', kind: 'remote' },
    { key: 'state', label: 'State', kind: 'remote' },
  ],
  STATE_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'state', label: 'State', kind: 'remote' },
    { key: 'ministry', label: 'Ministry', kind: 'remote' },
    { key: 'department', label: 'Department', kind: 'remote' },
  ],
  ANALYTICS_REPORT: [],
  AUDIT_REPORT: [
    { key: 'date_from', label: 'From date', kind: 'date' },
    { key: 'date_to', label: 'To date', kind: 'date' },
    { key: 'action', label: 'Action', kind: 'remote' },
    { key: 'entity_type', label: 'Entity type', kind: 'remote' },
    { key: 'user_id', label: 'User ID', kind: 'number' },
    { key: 'role', label: 'Actor role', kind: 'remote' },
  ],
};
