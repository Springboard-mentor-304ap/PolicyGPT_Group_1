import { Routes } from '@angular/router';

/**
 * Reusable Reports child routes.
 *
 * Mounted INSIDE each existing role layout in dashboard.routes.ts:
 * /dashboard/admin/reports, /dashboard/government/reports, etc.
 * There is no standalone Reports layout; the role layout stays mounted.
 */
export const REPORTS_CHILD_ROUTES: Routes = [
  {
    path: 'reports',
    loadComponent: () =>
      import('./report-dashboard/report-dashboard.component').then(
        (m) => m.ReportDashboardComponent,
      ),
  },
  {
    path: 'reports/generate',
    loadComponent: () =>
      import('./report-generate/report-generate.component').then(
        (m) => m.ReportGenerateComponent,
      ),
  },
  {
    path: 'reports/history',
    loadComponent: () =>
      import('./report-history/report-history.component').then(
        (m) => m.ReportHistoryComponent,
      ),
  },
  {
    path: 'reports/:reportId',
    loadComponent: () =>
      import('./report-details/report-details.component').then(
        (m) => m.ReportDetailsComponent,
      ),
  },
];
