import { describe, it, expect } from 'vitest';
import { PermissionService } from './permission.service';

describe('PermissionService self-approval guard', () => {
  const svc = new PermissionService();

  it('hides APPROVE/REJECT for the record owner even when Admin', () => {
    const actions = svc.getAvailableActions(
      'ADMIN',
      'PENDING_APPROVAL',
      'policy',
      true,
    );
    expect(actions.some((a) => a.type === 'APPROVE')).toBe(false);
    expect(actions.some((a) => a.type === 'REJECT')).toBe(false);
  });

  it('shows APPROVE/REJECT for a different Admin reviewer', () => {
    const actions = svc.getAvailableActions(
      'ADMIN',
      'PENDING_APPROVAL',
      'policy',
      false,
    );
    expect(actions.some((a) => a.type === 'APPROVE')).toBe(true);
    expect(actions.some((a) => a.type === 'REJECT')).toBe(true);
  });

  it('lets Govt owners submit but never approve', () => {
    const owner = svc.getAvailableActions(
      'GOVERNMENT_OFFICIAL',
      'DRAFT',
      'scheme',
      true,
    );
    expect(owner.some((a) => a.type === 'SUBMIT')).toBe(true);
    expect(owner.some((a) => a.type === 'APPROVE')).toBe(false);
  });

  it('supports ADMINISTRATOR alias without privilege loss', () => {
    expect(svc.canCreate('ADMINISTRATOR')).toBe(true);
    expect(svc.isAdmin('ADMINISTRATOR')).toBe(true);
  });
});
