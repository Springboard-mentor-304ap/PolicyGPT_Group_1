import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import {
  AnalyticsService,
  PersonalAnalyticsOverview,
} from './analytics.service';

describe('AnalyticsService personal overviews', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/analytics';

  function overviewPayload(): PersonalAnalyticsOverview {
    return {
      role: 'CITIZEN',
      window: { range: '30d', from: '2026-09-02', to: '2026-10-01', bucket: 'day' },
      generated_at: '2026-10-01T00:00:00+00:00',
      kpis: {},
      trend: [],
      breakdown: [],
      total_activities: 0,
      recent_activity: [],
      top_searches: [],
      search_types: [],
      recent_notifications: [],
      saved_policies: [],
      saved_schemes: [],
      policies_by_category: [],
      schemes_by_category: [],
      comparisons: [],
      comparisons_tracked: false,
      most_viewed_policies: [],
      most_viewed_schemes: [],
      popularity_tracked: false,
      limitations: [],
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the citizen overview with the range query', async () => {
    const pending = firstValueFrom(service.getCitizenOverview({ range: '30d' }));

    const req = httpMock.expectOne(`${baseUrl}/citizen/overview?range=30d`);
    expect(req.request.method).toBe('GET');
    req.flush(overviewPayload());

    expect((await pending).role).toBe('CITIZEN');
  });

  it('delivers HTTP failures to the subscriber error callback', async () => {
    // Regression test: the error callback must run so the page can leave
    // the loading state and show the retry UI (a synchronous `throw`
    // inside catchError would escape as an uncaught exception instead).
    const pending = firstValueFrom(service.getResearcherOverview({ range: '7d' }));

    const req = httpMock.expectOne(`${baseUrl}/researcher/overview?range=7d`);
    req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    await expect(pending).rejects.toMatchObject({ status: 500 });
  });

  it('shares one in-flight request between concurrent subscribers', () => {
    let first = 0;
    let second = 0;
    service.getOrganizationOverview({ range: '30d' }).subscribe(() => first++);
    service.getOrganizationOverview({ range: '30d' }).subscribe(() => second++);

    const reqs = httpMock.match(`${baseUrl}/organization/overview?range=30d`);
    expect(reqs.length).toBe(1);
    reqs[0].flush(overviewPayload());

    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('serves fresh repeat calls from cache without a new request', () => {
    service.getCitizenOverview({ range: '7d' }).subscribe();
    httpMock.expectOne(`${baseUrl}/citizen/overview?range=7d`).flush(overviewPayload());

    let received = 0;
    service.getCitizenOverview({ range: '7d' }).subscribe(() => received++);
    httpMock.expectNone(`${baseUrl}/citizen/overview?range=7d`);
    expect(received).toBe(1);
  });

  it('bypasses the cache when forceRefresh is set', () => {
    service.getCitizenOverview({ range: '7d' }).subscribe();
    httpMock.expectOne(`${baseUrl}/citizen/overview?range=7d`).flush(overviewPayload());

    service.getCitizenOverview({ range: '7d' }, true).subscribe();
    httpMock.expectOne(`${baseUrl}/citizen/overview?range=7d`).flush(overviewPayload());
  });
});
