export type SchemeStatus = 
  | 'DRAFT' 
  | 'PENDING_APPROVAL' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'ARCHIVED' 
  | 'ARCHIVE_REQUESTED' 
  | 'DELETE_REQUESTED';

export type PolicyStatus = SchemeStatus;

export type EntityStatus = SchemeStatus | PolicyStatus;

export interface StatusConfig {
  label: string;
  badgeClass: string;
  color: string;
  icon: string;
  description: string;
}

export const SCHEME_STATUS_CONFIG: Record<SchemeStatus, StatusConfig> = {
  DRAFT: {
    label: 'Draft',
    badgeClass: 'bg-gray-100 text-gray-700 border border-gray-200',
    color: '#6b7280',
    icon: '📝',
    description: 'Scheme is being created or edited.'
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    badgeClass: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    color: '#f59e0b',
    icon: '⏳',
    description: 'Waiting for Administrator review.'
  },
  APPROVED: {
    label: 'Approved',
    badgeClass: 'bg-green-100 text-green-700 border border-green-200',
    color: '#10b981',
    icon: '✅',
    description: 'Published and visible to public users.'
  },
  REJECTED: {
    label: 'Rejected',
    badgeClass: 'bg-red-100 text-red-700 border border-red-200',
    color: '#ef4444',
    icon: '❌',
    description: 'Can be edited and submitted again.'
  },
  ARCHIVED: {
    label: 'Archived',
    badgeClass: 'bg-gray-100 text-gray-700 border border-gray-200',
    color: '#6b7280',
    icon: '📦',
    description: 'Not visible to public. Can be edited according to workflow.'
  },
  ARCHIVE_REQUESTED: {
    label: 'Archive Requested',
    badgeClass: 'bg-orange-100 text-orange-700 border border-orange-200',
    color: '#f97316',
    icon: '📤',
    description: 'Waiting for Administrator review.'
  },
  DELETE_REQUESTED: {
    label: 'Delete Requested',
    badgeClass: 'bg-red-100 text-red-700 border border-red-200',
    color: '#ef4444',
    icon: '🗑️',
    description: 'Waiting for Administrator review.'
  }
};

export const POLICY_STATUS_CONFIG: Record<PolicyStatus, StatusConfig> = {
  ...SCHEME_STATUS_CONFIG
};

export function getStatusConfig(status: EntityStatus | string | undefined): StatusConfig {
  if (!status) return SCHEME_STATUS_CONFIG.DRAFT;
  const upperStatus = status.toString().toUpperCase() as EntityStatus;
  return SCHEME_STATUS_CONFIG[upperStatus] || SCHEME_STATUS_CONFIG.DRAFT;
}

export function getStatusLabel(status: EntityStatus | string | undefined): string {
  return getStatusConfig(status).label;
}

export function getStatusBadgeClass(status: EntityStatus | string | undefined): string {
  return getStatusConfig(status).badgeClass;
}

export function getStatusColor(status: EntityStatus | string | undefined): string {
  return getStatusConfig(status).color;
}

export function getStatusIcon(status: EntityStatus | string | undefined): string {
  return getStatusConfig(status).icon;
}

export function getStatusDescription(status: EntityStatus | string | undefined): string {
  return getStatusConfig(status).description;
}

export const ALL_STATUSES: EntityStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
  'ARCHIVE_REQUESTED',
  'DELETE_REQUESTED'
];

export const PUBLIC_STATUSES: EntityStatus[] = ['APPROVED'];

export const EDITABLE_STATUSES: EntityStatus[] = ['DRAFT', 'REJECTED', 'ARCHIVED'];

export const SUBMITTABLE_STATUSES: EntityStatus[] = ['DRAFT', 'REJECTED'];

export const APPROVABLE_STATUSES: EntityStatus[] = ['PENDING_APPROVAL'];

export const REJECTABLE_STATUSES: EntityStatus[] = ['PENDING_APPROVAL'];

export const ARCHIVABLE_STATUSES: EntityStatus[] = ['APPROVED'];

export const ARCHIVE_REQUESTABLE_STATUSES: EntityStatus[] = ['APPROVED'];

export const RESTORABLE_STATUSES: EntityStatus[] = ['ARCHIVED'];

export const DELETE_REQUESTABLE_STATUSES: EntityStatus[] = ['APPROVED', 'ARCHIVED'];

export const DELETE_APPROVABLE_STATUSES: EntityStatus[] = ['DELETE_REQUESTED'];

export const DELETE_REJECTABLE_STATUSES: EntityStatus[] = ['DELETE_REQUESTED'];

export const ARCHIVE_APPROVABLE_STATUSES: EntityStatus[] = ['ARCHIVE_REQUESTED'];

export const ARCHIVE_REJECTABLE_STATUSES: EntityStatus[] = ['ARCHIVE_REQUESTED'];