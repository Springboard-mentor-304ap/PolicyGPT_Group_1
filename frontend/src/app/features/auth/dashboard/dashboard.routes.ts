import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: 'user',
    loadComponent: () =>
      import('./user-dashboard/user-dashboard.component').then(
        (m) => m.UserDashboardComponent
      ),
  },
  {
    path: 'citizen',
    loadComponent: () =>
      import('./citizen/citizen.component').then(
        (m) => m.CitizenComponent
      ),
  },
  {
    path: 'government',
    loadComponent: () =>
      import('./government/government.component').then(
        (m) => m.GovernmentComponent
      ),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin/admin.component').then(
        (m) => m.AdminComponent
      ),
  },
  { path: '', redirectTo: 'citizen', pathMatch: 'full' },
];