import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/notification-preferences';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [NotificationPreferencesService],
    });

    service = TestBed.inject(NotificationPreferencesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. should be created', () => {
    expect(service).toBeTruthy();
  });

  it('2. should fetch preference matrix via GET /notification-preferences/me/matrix', () => {
    const dummyMatrix: any = {
      user_id: 1,
      role: 'CITIZEN',
      groups: [],
    };

    service.getPreferenceMatrix().subscribe((matrix) => {
      expect(matrix).toEqual(dummyMatrix);
    });

    const req = httpMock.expectOne(`${baseUrl}/me/matrix`);
    expect(req.request.method).toBe('GET');
    req.flush(dummyMatrix);
  });

  it('3. should save preference matrix via PUT /notification-preferences/me/matrix', () => {
    const payload: any = {
      global_settings: { frequency: 'DAILY_DIGEST' },
      rules: [
        {
          notification_type: 'POLICY_PUBLISHED',
          in_app_enabled: true,
          email_enabled: false,
          sms_enabled: false,
        },
      ],
    };

    const dummyResponse: any = {
      user_id: 1,
      role: 'CITIZEN',
      groups: [],
    };

    service.savePreferenceMatrix(payload).subscribe((res) => {
      expect(res).toEqual(dummyResponse);
    });

    const req = httpMock.expectOne(`${baseUrl}/me/matrix`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush(dummyResponse);
  });

  it('4. should reset per-type overrides via DELETE /notification-preferences/me/types', () => {
    const dummyResponse: any = {
      user_id: 1,
      role: 'CITIZEN',
      groups: [],
    };

    service.resetTypeMatrix(['POLICY_PUBLISHED']).subscribe((res) => {
      expect(res).toEqual(dummyResponse);
    });

    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/me/types`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('types')).toBe('POLICY_PUBLISHED');
    req.flush(dummyResponse);
  });

  it('5. should reset global master settings via POST /notification-preferences/me/reset', () => {
    const dummySettings: any = {
      email_enabled: true,
      in_app_enabled: true,
      sms_enabled: false,
    };

    service.resetPreferences().subscribe((res) => {
      expect(res).toEqual(dummySettings);
    });

    const req = httpMock.expectOne(`${baseUrl}/me/reset`);
    expect(req.request.method).toBe('POST');
    req.flush(dummySettings);
  });
});
