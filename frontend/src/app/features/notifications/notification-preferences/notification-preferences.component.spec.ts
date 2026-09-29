import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationPreferencesComponent } from './notification-preferences.component';
import { NotificationPreferencesService } from '../../../core/services/notification-preferences.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  NotificationPreferences,
  NotificationMatrixResponse,
} from '../../../core/models/notification.model';

describe('NotificationPreferencesComponent', () => {
  let component: NotificationPreferencesComponent;
  let fixture: ComponentFixture<NotificationPreferencesComponent>;
  let prefServiceMock: any;
  let authServiceMock: any;
  let toastServiceMock: any;

  const mockLegacyPrefs: NotificationPreferences = {
    preference_id: 1,
    user_id: 1,
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    policy_alerts: true,
    scheme_updates: true,
    deadline_reminders: true,
    application_updates: true,
    government_announcements: false,
    regulatory_updates: true,
    research_reports: false,
    system_alerts: true,
    frequency: 'INSTANT',
    updated_at: '2026-09-24T10:00:00Z',
  };

  const mockMatrix: NotificationMatrixResponse = {
    user_id: 1,
    role: 'CITIZEN',
    global_settings: mockLegacyPrefs,
    groups: [
      {
        key: 'policy_and_scheme',
        label: 'Policy & Scheme Alerts',
        description: 'New and updated policies and schemes.',
        section: 'Content',
        types: ['POLICY_PUBLISHED', 'SCHEME_PUBLISHED'],
        default_channels: { in_app_enabled: true, email_enabled: true, sms_enabled: false },
        type_preferences: [
          {
            notification_type: 'POLICY_PUBLISHED',
            in_app_enabled: true,
            email_enabled: true,
            sms_enabled: false,
            explicit: true,
          },
          {
            notification_type: 'SCHEME_PUBLISHED',
            in_app_enabled: true,
            email_enabled: true,
            sms_enabled: false,
            explicit: false,
          },
        ],
      },
      {
        key: 'deadlines',
        label: 'Deadline Reminders',
        description: 'Upcoming application and scheme deadlines.',
        section: 'Reminders',
        types: ['DEADLINE_REMINDER'],
        default_channels: { in_app_enabled: true, email_enabled: false, sms_enabled: false },
        type_preferences: [
          {
            notification_type: 'DEADLINE_REMINDER',
            in_app_enabled: true,
            email_enabled: false,
            sms_enabled: false,
            explicit: true,
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    prefServiceMock = {
      getPreferenceMatrix: vi.fn().mockReturnValue(of(mockMatrix)),
      savePreferenceMatrix: vi.fn().mockReturnValue(of(mockMatrix)),
      resetTypeMatrix: vi.fn().mockReturnValue(of(mockMatrix)),
      getPreferences: vi.fn().mockReturnValue(of(mockLegacyPrefs)),
      updatePreferences: vi.fn().mockReturnValue(of(mockLegacyPrefs)),
      resetPreferences: vi.fn().mockReturnValue(of(mockLegacyPrefs)),
    };

    authServiceMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      isGuest: vi.fn().mockReturnValue(false),
      getToken: vi.fn().mockReturnValue('mock-jwt-token'),
      getStoredUser: vi.fn().mockReturnValue({
        user_id: 1,
        email: 'citizen@gmail.com',
        phone: '+919876543210',
        role: 'CITIZEN',
      }),
      getUserRole: vi.fn().mockReturnValue('CITIZEN'),
    };

    toastServiceMock = {
      success: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationPreferencesComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationPreferencesService, useValue: prefServiceMock },
        { provide: Auth, useValue: authServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should create the component and load matrix from backend', () => {
    expect(component).toBeTruthy();
    expect(prefServiceMock.getPreferenceMatrix).toHaveBeenCalled();
    expect(component.workingGroups.length).toBe(2);
    expect(component.userRole).toBe('CITIZEN');
    expect(component.loading).toBe(false);
  });

  it('2. should calculate convenience channel summary states from the matrix', () => {
    // In mockMatrix:
    // POLICY_PUBLISHED: email=true, in_app=true
    // SCHEME_PUBLISHED: email=true, in_app=true
    // DEADLINE_REMINDER: email=false, in_app=true
    // Total types: 3. Email: 2 of 3 (mixed). In-App: 3 of 3 (allOn). SMS: 0 of 3 (allOff).
    expect(component.totalTypeCount).toBe(3);
    expect(component.emailEnabledCount).toBe(2);
    expect(component.globalEmailState).toBe('mixed');
    expect(component.inAppEnabledCount).toBe(3);
    expect(component.globalInAppState).toBe('allOn');
    expect(component.smsEnabledCount).toBe(0);
    expect(component.globalSmsState).toBe('allOff');
  });

  it('3. should toggle group channels and mark dirty unsaved changes', () => {
    expect(component.hasUnsavedChanges).toBe(false);
    const group = component.workingGroups[0];

    // Toggle group email off
    component.toggleGroupChannel(group, 'email_enabled', { target: { checked: false } } as unknown as Event);

    expect(group.email_enabled).toBe(false);
    expect(group.type_preferences.every((t) => !t.email_enabled)).toBe(true);
    expect(component.hasUnsavedChanges).toBe(true);
  });

  it('4. should toggle single type channel and update group override flag', () => {
    const group = component.workingGroups[0];
    const firstType = group.type_preferences[0];

    // Turn in-app off for just first type
    component.toggleSingleTypeChannel(group, firstType, 'in_app_enabled', { target: { checked: false } } as unknown as Event);

    expect(firstType.in_app_enabled).toBe(false);
    expect(firstType.explicit).toBe(true);
    expect(group.hasCustomOverrides).toBe(true);
    expect(component.hasUnsavedChanges).toBe(true);
  });

  it('5. should change frequency and mark unsaved changes', () => {
    expect(component.frequency).toBe('INSTANT');
    component.setFrequency('DAILY_DIGEST');
    expect(component.frequency).toBe('DAILY_DIGEST');
    expect(component.hasUnsavedChanges).toBe(true);
  });

  it('6. should save preferences to backend through savePreferenceMatrix', () => {
    component.setFrequency('WEEKLY_DIGEST');
    expect(component.hasUnsavedChanges).toBe(true);

    component.savePreferences();

    expect(prefServiceMock.savePreferenceMatrix).toHaveBeenCalled();
    const saveCallArg = prefServiceMock.savePreferenceMatrix.mock.calls[0][0];
    expect(saveCallArg.global_settings.frequency).toBe('WEEKLY_DIGEST');
    expect(saveCallArg.rules.length).toBeGreaterThan(0);
    expect(toastServiceMock.success).toHaveBeenCalledWith(
      'Preferences Saved',
      'Your notification preferences have been saved successfully.'
    );
    expect(component.savedSuccessfully).toBe(true);
    expect(component.hasUnsavedChanges).toBe(false);
  });

  it('7. should prompt modal and reset preferences via resetTypeMatrix', () => {
    component.promptResetToDefault();
    expect(component.showResetModal).toBe(true);

    component.confirmReset();

    expect(prefServiceMock.resetTypeMatrix).toHaveBeenCalled();
    expect(toastServiceMock.info).toHaveBeenCalledWith(
      'Preferences Reset',
      'Notification preferences have been restored to defaults.'
    );
    expect(component.showResetModal).toBe(false);
  });

  it('8. should show confirm modal when attempting to bulk-disable an active channel', () => {
    // In-app is allOn. Turning it off globally triggers confirmation modal.
    component.onGlobalChannelToggle('in_app', { target: { checked: false } } as unknown as Event);

    expect(component.showDisableChannelModal).toBe(true);
    expect(component.pendingChannelToDisable).toBe('in_app');

    // Confirm disable
    component.confirmDisableChannelAction();

    expect(component.globalInAppState).toBe('allOff');
    expect(component.showDisableChannelModal).toBe(false);
    expect(component.hasUnsavedChanges).toBe(true);
  });

  it('9. should handle beforeunload warning when there are unsaved changes', () => {
    const mockEvent = {
      preventDefault: vi.fn(),
      returnValue: '',
    } as any;

    component.hasUnsavedChanges = false;
    component.onBeforeUnload(mockEvent);
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();

    component.hasUnsavedChanges = true;
    component.onBeforeUnload(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toContain('unsaved');
  });

  it('10. should auto-save to backend when a group channel toggle is clicked', () => {
    vi.useFakeTimers();
    const group = component.workingGroups[0];
    component.toggleGroupChannel(group, 'in_app_enabled', { target: { checked: false } } as unknown as Event);
    expect(component.autoSaving).toBe(true);

    vi.advanceTimersByTime(400);

    expect(prefServiceMock.savePreferenceMatrix).toHaveBeenCalled();
    expect(component.savedSuccessfully).toBe(true);
    expect(component.hasUnsavedChanges).toBe(false);
    vi.useRealTimers();
  });
});
