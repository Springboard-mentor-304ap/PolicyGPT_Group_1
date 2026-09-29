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
