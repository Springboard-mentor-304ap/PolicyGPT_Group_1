import { Routes } from '@angular/router';

import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';

/**
 * Reusable Reports child routes.
 *
 * Mounted INSIDE each existing role layout in dashboard.routes.ts:
 * /dashboard/admin/reports, /dashboard/government/reports, etc.
 * There is no standalone Reports layout; the role layout stays mounted.
 *
 * Access is restricted to ADMIN and GOVERNMENT_OFFICIAL only, enforced
 * both by the parent dashboard roleGuard and by these child guards, so
 * direct navigation by CITIZEN / RESEARCHER / ORGANIZATION / GUEST is
 * blocked even if the URL is typed manually. The backend
 * REPORT_ROUTE_ROLES enforces the same boundary.
 */
const REPORTS_GUARDS = [authGuard, roleGuard];
const REPORTS_ROLES = ['ADMIN', 'ADMINISTRATOR', 'GOVERNMENT_OFFICIAL'];

export const REPORTS_CHILD_ROUTES: Routes = [
  {
    path: 'reports',
    canActivate: REPORTS_GUARDS,
    data: { roles: REPORTS_ROLES },
    loadComponent: () =>
      import('./report-dashboard/report-dashboard.component').then(
        (m) => m.ReportDashboardComponent,
      ),
  },
  {
    path: 'reports/generate',
    canActivate: REPORTS_GUARDS,
    data: { roles: REPORTS_ROLES },
    loadComponent: () =>
      import('./report-generate/report-generate.component').then(
        (m) => m.ReportGenerateComponent,
      ),
  },
  {
    path: 'reports/history',
    canActivate: REPORTS_GUARDS,
    data: { roles: REPORTS_ROLES },
    loadComponent: () =>
      import('./report-history/report-history.component').then(
        (m) => m.ReportHistoryComponent,
      ),
  },
  {
    path: 'reports/:reportId',
    canActivate: REPORTS_GUARDS,
    data: { roles: REPORTS_ROLES },
    loadComponent: () =>
      import('./report-details/report-details.component').then(
        (m) => m.ReportDetailsComponent,
      ),
  },
];
