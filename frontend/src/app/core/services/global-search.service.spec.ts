import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_GLOBAL_SEARCH,
  GlobalSearchService,
  normalizeGlobalQuery,
} from './global-search.service';

describe('normalizeGlobalQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeGlobalQuery('  Ministry   of   Agriculture  ')).toBe(
      'Ministry of Agriculture',
    );
  });

  it('returns empty for blank input', () => {
    expect(normalizeGlobalQuery('   ')).toBe('');
    expect(normalizeGlobalQuery(null)).toBe('');
    expect(normalizeGlobalQuery(undefined)).toBe('');
  });
});

describe('GlobalSearchService', () => {
  function setup(): {
    service: GlobalSearchService;
    httpMock: HttpTestingController;
  } {
    TestBed.configureTestingModule({
      providers: [
        GlobalSearchService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    return {
      service: TestBed.inject(GlobalSearchService),
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  it('returns empty payload without HTTP for blank queries', () => {
    const { service, httpMock } = setup();
    let result: unknown;
    service.search('   ').subscribe((r) => (result = r));
    httpMock.expectNone(() => true);
    expect(result).toEqual(EMPTY_GLOBAL_SEARCH);
  });

  it('sends q + limit params for real queries', () => {
    const { service, httpMock } = setup();
    service.search('water', 5).subscribe();
    const req = httpMock.expectOne((r) => r.url.endsWith('/search/global'));
    expect(req.request.params.get('q')).toBe('water');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ ...EMPTY_GLOBAL_SEARCH });
  });

  it('clamps limit to 1..20', () => {
    const { service, httpMock } = setup();
    service.search('water', 99).subscribe();
    const req = httpMock.expectOne((r) => r.url.endsWith('/search/global'));
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({ ...EMPTY_GLOBAL_SEARCH });
  });

  it('propagates HTTP errors to the caller (dropdown shows error state)', () => {
    const { service, httpMock } = setup();
    let error: unknown;
    service.search('water').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne((r) => r.url.endsWith('/search/global'));
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(error).toBeTruthy();
  });
});
