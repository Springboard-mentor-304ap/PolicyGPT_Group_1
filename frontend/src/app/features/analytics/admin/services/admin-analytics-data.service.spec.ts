import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminAnalyticsDataService } from './admin-analytics-data.service';

describe('AdminAnalyticsDataService', () => {
  let service: AdminAnalyticsDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminAnalyticsDataService]
    });
    service = TestBed.inject(AdminAnalyticsDataService);
  });

  it('should be created and indicate sample data', () => {
    expect(service).toBeTruthy();
    expect(service.isSampleData).toBe(true);
  });

  it('should return admin analytics overview data', async () => {
    const data = await firstValueFrom(service.getAdminAnalytics());
    expect(data).toBeTruthy();
    expect(data.totalUsers).toBe(5820);
    expect(data.activePolicies).toBe(1250);
    expect(data.totalSchemes).toBe(438);
  });

  it('should return policy analytics stats and filter data', async () => {
    const stats = await firstValueFrom(service.getPolicyAnalyticsStats());
    expect(stats.length).toBe(5);
    expect(stats[0].label).toBe('Total Policies');

    const policies = await firstValueFrom(service.getLatestPolicies({ status: 'Approved' }));
    expect(policies.every(p => p.status === 'Approved')).toBe(true);
  });

  it('should return scheme analytics data', async () => {
    const stats = await firstValueFrom(service.getSchemeAnalyticsStats());
    expect(stats.length).toBe(5);

    const schemes = await firstValueFrom(service.getTopViewedSchemes());
    expect(schemes.length).toBe(5);
  });

  it('should return department analytics data and download blob', async () => {
    const res = await firstValueFrom(service.getDepartmentAnalytics());
    expect(res.departments.length).toBeGreaterThan(0);

    const blob = await firstValueFrom(service.downloadReport('pdf'));
    expect(blob).toBeTruthy();
    expect(blob.type).toBe('application/pdf');
  });
});
