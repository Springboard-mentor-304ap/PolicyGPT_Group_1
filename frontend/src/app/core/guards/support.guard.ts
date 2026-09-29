import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { Auth } from '../services/auth';

/**
 * Prohibits Administrators from accessing the user Support portal.
 * Redirects Administrators to /dashboard/admin/faqs (Admin FAQ Management).
 */
export const supportRoleGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router = inject(Router);

  const role = (authService.getUserRole() || '').toUpperCase().trim();
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') {
    return router.createUrlTree(['/dashboard/admin/faqs']);
  }

  return true;
};

/**
 * Top-level redirect guard for /support that routes the user to their specific
 * dashboard layout path (/dashboard/{role}/support).
 */
export const supportRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(Auth);
  const router = inject(Router);

  const role = (authService.getUserRole() || '').toUpperCase().trim();

  let prefix = 'citizen';
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') {
    return router.createUrlTree(['/dashboard/admin/faqs']);
  } else if (
    role === 'GOVERNMENT_OFFICIAL' ||
    role === 'GOVERNMENT_OFFICER' ||
    role === 'GOVERNMENT' ||
    role === 'GOVT'
  ) {
    prefix = 'government';
  } else if (role === 'ORGANIZATION' || role === 'ORGANISATION') {
    prefix = 'organization';
  } else if (role === 'RESEARCHER') {
    prefix = 'researcher';
  } else if (role === 'CITIZEN') {
    prefix = 'citizen';
  } else if (authService.isGuest() || !authService.getToken()) {
    prefix = 'guest';
  }

  return router.createUrlTree([`/dashboard/${prefix}/support`], {
    queryParams: route.queryParams,
  });
};
