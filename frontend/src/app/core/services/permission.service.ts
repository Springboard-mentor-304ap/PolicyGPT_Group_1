import { Injectable } from '@angular/core';

export type UserRole = 
  | 'ADMIN' 
  | 'GOVERNMENT_OFFICIAL' 
  | 'CITIZEN' 
  | 'RESEARCHER' 
  | 'ORGANIZATION' 
  | 'GUEST';

export type EntityType = 'scheme' | 'policy';

export type ActionType = 
  | 'VIEW'
  | 'EDIT'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'ARCHIVE'
  | 'REQUEST_ARCHIVE'
  | 'APPROVE_ARCHIVE'
  | 'REJECT_ARCHIVE'
  | 'RESTORE'
  | 'REQUEST_DELETE'
  | 'APPROVE_DELETE'
  | 'REJECT_DELETE'
  | 'DELETE'
  | 'MANAGE_USERS'
  | 'VIEW_ANALYTICS'
  | 'VIEW_REPORTS';

export interface Action {
  type: ActionType;
  label: string;
  icon: string;
  requiresReason: boolean;
  reasonPlaceholder?: string;
  confirmationMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private readonly roleHierarchy: Record<UserRole, number> = {
    ADMIN: 6,
    GOVERNMENT_OFFICIAL: 5,
    ORGANIZATION: 4,
    RESEARCHER: 3,
    CITIZEN: 2,
    GUEST: 1
  };

  private readonly actionDefinitions: Record<ActionType, Omit<Action, 'type'>> = {
    VIEW: { label: 'View', icon: '👁️', requiresReason: false },
    EDIT: { label: 'Edit', icon: '✏️', requiresReason: false },
    SUBMIT: { label: 'Submit for Approval', icon: '📤', requiresReason: false, confirmationMessage: 'Submit this for approval?' },
    APPROVE: { label: 'Approve', icon: '✅', requiresReason: false, confirmationMessage: 'Approve this item?' },
    REJECT: { label: 'Reject', icon: '❌', requiresReason: true, reasonPlaceholder: 'Enter reason for rejection...' },
    ARCHIVE: { label: 'Archive', icon: '📦', requiresReason: true, reasonPlaceholder: 'Enter reason for archiving...', confirmationMessage: 'Archive this item?' },
    REQUEST_ARCHIVE: { label: 'Request Archive', icon: '📤', requiresReason: true, reasonPlaceholder: 'Enter reason for archive request...', confirmationMessage: 'Submit archive request?' },
    APPROVE_ARCHIVE: { label: 'Approve Archive', icon: '✅', requiresReason: false, confirmationMessage: 'Approve archive request?' },
    REJECT_ARCHIVE: { label: 'Reject Archive', icon: '❌', requiresReason: false, confirmationMessage: 'Reject archive request?' },
    RESTORE: { label: 'Restore', icon: '🔄', requiresReason: false, confirmationMessage: 'Restore this archived item?' },
    REQUEST_DELETE: { label: 'Request Delete', icon: '🗑️', requiresReason: true, reasonPlaceholder: 'Enter reason for delete request...', confirmationMessage: 'Submit delete request?' },
    APPROVE_DELETE: { label: 'Approve Delete', icon: '✅', requiresReason: false, confirmationMessage: 'Permanently delete this item? This cannot be undone.' },
    REJECT_DELETE: { label: 'Reject Delete', icon: '❌', requiresReason: false, confirmationMessage: 'Reject delete request?' },
    DELETE: { label: 'Delete', icon: '🗑️', requiresReason: false, confirmationMessage: 'Permanently delete this item? This cannot be undone.' },
    MANAGE_USERS: { label: 'Manage Users', icon: '👥', requiresReason: false },
    VIEW_ANALYTICS: { label: 'View Analytics', icon: '📊', requiresReason: false },
    VIEW_REPORTS: { label: 'View Reports', icon: '📈', requiresReason: false }
  };

  getAvailableActions(role: string, status: string, entityType: EntityType, isOwner = false): Action[] {
    const normalizedRole = this.normalizeRole(role);
    const normalizedStatus = status.toUpperCase();
    const actions: Action[] = [];

    if (this.canView(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('VIEW'));
    }

    if (this.canEdit(normalizedRole, normalizedStatus, isOwner)) {
      actions.push(this.createAction('EDIT'));
    }

    if (this.canSubmit(normalizedRole, normalizedStatus, isOwner)) {
      actions.push(this.createAction('SUBMIT'));
    }

    if (this.canApprove(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('APPROVE'));
    }

    if (this.canReject(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('REJECT'));
    }

    if (this.canArchive(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('ARCHIVE'));
    }

    if (this.canRequestArchive(normalizedRole, normalizedStatus, isOwner)) {
      actions.push(this.createAction('REQUEST_ARCHIVE'));
    }

    if (this.canApproveArchive(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('APPROVE_ARCHIVE'));
    }

    if (this.canRejectArchive(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('REJECT_ARCHIVE'));
    }

    if (this.canRestore(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('RESTORE'));
    }

    if (this.canRequestDelete(normalizedRole, normalizedStatus, isOwner)) {
      actions.push(this.createAction('REQUEST_DELETE'));
    }

    if (this.canApproveDelete(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('APPROVE_DELETE'));
    }

    if (this.canRejectDelete(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('REJECT_DELETE'));
    }

    if (this.canDelete(normalizedRole, normalizedStatus)) {
      actions.push(this.createAction('DELETE'));
    }

    return actions;
  }

  private createAction(type: ActionType): Action {
    const def = this.actionDefinitions[type];
    return { type, ...def };
  }

  private normalizeRole(role: string): UserRole {
    const upper = role.toUpperCase().trim();
    
    if (upper === 'ADMINISTRATOR' || upper === 'ADMIN') return 'ADMIN';
    if (upper === 'GOVERNMENT_OFFICIAL' || upper === 'GOVERNMENT_OFFICER' || upper === 'GOVERNMENT' || upper === 'GOVT') return 'GOVERNMENT_OFFICIAL';
    if (upper === 'ORGANISATION') return 'ORGANIZATION';
    if (upper === 'CITIZEN') return 'CITIZEN';
    if (upper === 'RESEARCHER') return 'RESEARCHER';
    if (upper === 'ORGANIZATION') return 'ORGANIZATION';
    if (upper === 'GUEST' || upper === 'GUEST_USER') return 'GUEST';
    
    return 'CITIZEN';
  }

  private canView(role: UserRole, status: string): boolean {
    if (role === 'ADMIN') return true;
    if (role === 'GOVERNMENT_OFFICIAL') return true;
    
    if (['CITIZEN', 'RESEARCHER', 'ORGANIZATION', 'GUEST'].includes(role)) {
      return status === 'APPROVED';
    }
    
    return false;
  }

  private canEdit(role: UserRole, status: string, isOwner: boolean): boolean {
    if (role === 'ADMIN') return true;
    if (role === 'GOVERNMENT_OFFICIAL' && isOwner) {
      return ['DRAFT', 'REJECTED', 'ARCHIVED'].includes(status);
    }
    return false;
  }

  private canSubmit(role: UserRole, status: string, isOwner: boolean): boolean {
    if (role === 'ADMIN') return true;
    if (role === 'GOVERNMENT_OFFICIAL' && isOwner) {
      return ['DRAFT', 'REJECTED'].includes(status);
    }
    return false;
  }

  private canApprove(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'PENDING_APPROVAL';
  }

  private canReject(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'PENDING_APPROVAL';
  }

  private canArchive(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && ['APPROVED'].includes(status);
  }

  private canRequestArchive(role: UserRole, status: string, isOwner: boolean): boolean {
    if (role === 'ADMIN') return false; // ADMIN uses direct archive
    if (role === 'GOVERNMENT_OFFICIAL' && isOwner) {
      return ['APPROVED'].includes(status);
    }
    return false;
  }

  private canApproveArchive(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'ARCHIVE_REQUESTED';
  }

  private canRejectArchive(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'ARCHIVE_REQUESTED';
  }

  private canRestore(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'ARCHIVED';
  }

  private canRequestDelete(role: UserRole, status: string, isOwner: boolean): boolean {
    if (role === 'ADMIN') return false; // ADMIN uses direct delete
    if (role === 'GOVERNMENT_OFFICIAL' && isOwner) {
      return ['APPROVED', 'ARCHIVED'].includes(status);
    }
    return false;
  }

  private canApproveDelete(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'DELETE_REQUESTED';
  }

  private canRejectDelete(role: UserRole, status: string): boolean {
    return role === 'ADMIN' && status === 'DELETE_REQUESTED';
  }

  private canDelete(role: UserRole, status: string): boolean {
    return role === 'ADMIN';
  }

  hasAction(role: string, status: string, actionType: ActionType, entityType: EntityType, isOwner = false): boolean {
    const actions = this.getAvailableActions(role, status, entityType, isOwner);
    return actions.some(a => a.type === actionType);
  }

  canCreate(role: string): boolean {
    const normalizedRole = this.normalizeRole(role);
    return ['ADMIN', 'GOVERNMENT_OFFICIAL'].includes(normalizedRole);
  }

  canManageUsers(role: string): boolean {
    return this.normalizeRole(role) === 'ADMIN';
  }

  canViewAnalytics(role: string): boolean {
    const normalizedRole = this.normalizeRole(role);
    return ['ADMIN', 'GOVERNMENT_OFFICIAL'].includes(normalizedRole);
  }

  canViewReports(role: string): boolean {
    const normalizedRole = this.normalizeRole(role);
    return ['ADMIN', 'GOVERNMENT_OFFICIAL'].includes(normalizedRole);
  }

  isAdmin(role: string): boolean {
    return this.normalizeRole(role) === 'ADMIN';
  }

  isGovernmentOfficial(role: string): boolean {
    return this.normalizeRole(role) === 'GOVERNMENT_OFFICIAL';
  }

  isPublicRole(role: string): boolean {
    const normalizedRole = this.normalizeRole(role);
    return ['CITIZEN', 'RESEARCHER', 'ORGANIZATION', 'GUEST'].includes(normalizedRole);
  }
}