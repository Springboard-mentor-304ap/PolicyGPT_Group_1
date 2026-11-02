import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { Auth } from '../services/auth';

export const notificationRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(Auth);
  const router = inject(Router);

  let prefix = 'citizen';
  const role = (authService.getUserRole() || '').toUpperCase().trim();

  if (role === 'ADMIN' || role === 'ADMINISTRATOR' || role === 'ADMINISTRATOR_ROLE') {
    prefix = 'admin';
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

  const path = route.routeConfig?.path || '';
  let targetPath = `/dashboard/${prefix}/notifications`;

  if (path.includes('preferences')) {
    targetPath = `/dashboard/${prefix}/notifications/preferences`;
  } else if (route.params['id']) {
    targetPath = `/dashboard/${prefix}/notifications/${route.params['id']}`;
  }

  return router.createUrlTree([targetPath], {
    queryParams: route.queryParams,
  });
};
