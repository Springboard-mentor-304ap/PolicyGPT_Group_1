import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Subject, Subscription, debounceTime, switchMap, tap, catchError, of, Observable } from 'rxjs';

import { NotificationPreferencesService } from '../../../core/services/notification-preferences.service';
import { Auth, AuthUser } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import {
  NotificationPreferences,
  NotificationFrequency,
  NotificationMatrixResponse,
  NotificationPreferenceGroup,
  NotificationTypePreference,
  NotificationTypeRuleUpdate,
  NotificationMatrixUpdatePayload,
} from '../../../core/models/notification.model';
import {
  getNotificationGroupMeta,
  formatNotificationTypeLabel,
  NotificationGroupMeta,
  ROLE_NOTIFICATION_CONFIG,
} from '../../../core/models/notification-taxonomy';

/** UI representation of a group with channels and expansion state */
export interface UiPreferenceGroup {
  key: string;
  label: string;
  description: string;
  icon: string;
  iconClass: string;
  section: string;
  types: string[];
  default_channels: Record<string, boolean>;
  type_preferences: NotificationTypePreference[];
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  isExpanded: boolean;
  hasCustomOverrides: boolean;
}

export type ChannelToggleState = 'allOn' | 'allOff' | 'mixed';

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent],
  templateUrl: './notification-preferences.component.html',
  styleUrls: ['./notification-preferences.component.scss'],
})
export class NotificationPreferencesComponent implements OnInit, OnDestroy {
  currentUser: AuthUser | null = null;
  userRole = 'CITIZEN';
  isGuest = false;

  // Loading & State
  // `loading` gates the skeleton and is only true when there is no UI to
  // show yet. `syncing` / `syncError` track the background preference sync
  // and must NEVER hide the already-visible preferences UI.
  loading = true;
  syncing = false;
  syncError = false;
  matrixLoaded = false;
  saving = false;
  autoSaving = false;
  autoSaved = false;
  resetting = false;
  savedSuccessfully = false;
  errorMessage = '';

  // Working state
  workingGroups: UiPreferenceGroup[] = [];
  frequency: NotificationFrequency = 'INSTANT';
  globalSettings: NotificationPreferences | null = null;

  // Unsaved changes tracking & auto-save
  hasUnsavedChanges = false;
  private persistedSnapshot = '';
  private autoSaveSubject = new Subject<void>();
  private autoSaveSub?: Subscription;
  private autoSavedTimer: any = null;

  // Confirmation Modals
  showResetModal = false;
  showDisableChannelModal = false;
  pendingChannelToDisable: 'email' | 'in_app' | null = null;

  // Legacy compatibility property for unit tests
  preferences: NotificationPreferences = {
    preference_id: 0,
    user_id: 0,
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
    updated_at: '',
  };
  typeOptions: any[] = [];

  constructor(
    private readonly preferencesService: NotificationPreferencesService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getStoredUser();
    if (!this.currentUser || !this.currentUser.email) {
      this.authService.getCurrentUser().subscribe({
        next: (u) => {
          if (u) {
            this.currentUser = u;
            this.cdr.detectChanges();
          }
        },
      });
    }

    let currentRole = (this.authService.getUserRole() || '').toUpperCase().trim();
    if (!currentRole) {
      const url = this.router.url;
      if (url.includes('/admin')) currentRole = 'ADMINISTRATOR';
      else if (url.includes('/government')) currentRole = 'GOVERNMENT_OFFICIAL';
      else if (url.includes('/researcher')) currentRole = 'RESEARCHER';
      else if (url.includes('/organization')) currentRole = 'ORGANIZATION';
      else if (url.includes('/citizen')) currentRole = 'CITIZEN';
    }
    this.userRole = currentRole || 'CITIZEN';
    this.isGuest =
      this.authService.isGuest() ||
      (!this.authService.isLoggedIn() && !this.authService.getToken());

    if (this.isGuest) {
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // Instant local initialization from centralized role configuration to prevent sluggish render
    this.prepopulateFromRoleConfig(this.userRole);

    this.initLegacyTypeOptions();

    // Setup debounced auto-save stream
    this.autoSaveSub = this.autoSaveSubject
      .pipe(
        debounceTime(350),
        switchMap(() => this.performSave(false))
      )
      .subscribe();

    this.loadMatrix();
  }

  ngOnDestroy(): void {
    if (this.autoSaveSub) {
      this.autoSaveSub.unsubscribe();
    }
    if (this.autoSavedTimer) {
      clearTimeout(this.autoSavedTimer);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = 'You have unsaved notification preference changes.';
    }
  }

  get roleDisplayName(): string {
    const role = (this.userRole || '').toUpperCase().trim();
    switch (role) {
      case 'ADMIN':
      case 'ADMINISTRATOR':
        return 'Administrator';
      case 'GOVERNMENT':
      case 'GOVT':
      case 'GOVERNMENT_OFFICIAL':
        return 'Government Official';
      case 'RESEARCHER':
        return 'Researcher';
      case 'ORGANIZATION':
      case 'ORGANISATION':
        return 'Organization';
      case 'CITIZEN':
      default:
        return 'Citizen';
    }
  }

  get roleBadgeLabel(): string {
    const role = (this.userRole || '').toUpperCase().trim();
    switch (role) {
      case 'ADMIN':
      case 'ADMINISTRATOR':
        return 'ADMINISTRATOR';
      case 'GOVERNMENT':
      case 'GOVT':
      case 'GOVERNMENT_OFFICIAL':
        return 'GOVERNMENT OFFICIAL';
      case 'RESEARCHER':
        return 'RESEARCHER';
      case 'ORGANIZATION':
      case 'ORGANISATION':
        return 'ORGANIZATION';
      case 'CITIZEN':
      default:
        return 'CITIZEN';
    }
  }

  /**
   * Pre-populates the UI instantly from authoritative role config while backend matrix call is resolving.
   */
  private prepopulateFromRoleConfig(role: string): void {
    const canonical = (role || 'CITIZEN').toUpperCase().trim();
    const categories =
      ROLE_NOTIFICATION_CONFIG[canonical] ||
      ROLE_NOTIFICATION_CONFIG['CITIZEN'] ||
      [];

    if (categories.length > 0 && this.workingGroups.length === 0) {
      this.workingGroups = categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        description: cat.description,
        icon: cat.icon,
        iconClass: cat.iconClass,
        section: 'general',
        types: [...cat.types],
        default_channels: { in_app: true, email: true, sms: false },
        type_preferences: cat.types.map((t) => ({
          notification_type: t,
          in_app_enabled: true,
          email_enabled: true,
          sms_enabled: false,
          explicit: false,
        })),
        in_app_enabled: true,
        email_enabled: true,
        sms_enabled: false,
        isExpanded: false,
        hasCustomOverrides: false,
      }));
    }
  }

  // ============================================================
  // LOAD PREFERENCES (SOURCE OF TRUTH: BACKEND)
  // ============================================================

  loadMatrix(): void {
    // Only show the skeleton when there is genuinely nothing to render yet.
    // The role-config prepopulation in ngOnInit means the preferences UI is
    // already visible here, so a slow/erroring API must not hide the page.
    this.loading = this.workingGroups.length === 0;
    this.syncing = true;
    this.syncError = false;
    this.errorMessage = '';
    this.savedSuccessfully = false;

    this.preferencesService.getPreferenceMatrix().subscribe({
      next: (data: NotificationMatrixResponse) => {
        this.applyMatrixData(data);
        this.matrixLoaded = true;
        this.loading = false;
        this.syncing = false;
        this.syncError = false;
        this.errorMessage = '';
        this.cdr.detectChanges();
      },
      error: (err: HttpErrorResponse) => {
        // Non-blocking failure: keep the existing/default preferences UI
        // visible and usable. The error is surfaced as a small sync banner
        // (plus toast), never as a full-page replacement.
        this.loading = false;
        this.syncing = false;
        this.syncError = true;
        if (err.status === 401) {
          this.errorMessage = 'Please sign in to manage your notification preferences.';
        } else if (err.status === 403) {
          this.errorMessage = 'You do not have permission to manage preferences for this account.';
        } else {
          this.errorMessage = 'Unable to load notification preferences. Please check your connection and try again.';
        }
        this.toastService.warning(
          'Preferences Not Synced',
          'Unable to sync your latest preferences. Your current settings are still available.'
        );
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Retry only re-runs the background synchronization. The preferences UI
   * stays visible throughout; on success the server values are applied,
   * on failure the existing UI is kept.
   */
  retrySync(): void {
    this.loadMatrix();
  }

  private applyMatrixData(data: NotificationMatrixResponse): void {
    if (data.role) {
      this.userRole = data.role.toUpperCase().trim();
    }
    this.globalSettings = data.global_settings;
    this.frequency = (data.global_settings?.frequency as NotificationFrequency) || 'INSTANT';

    // Synchronize legacy model for backwards compatibility with tests and services
    if (data.global_settings) {
      this.preferences = { ...data.global_settings };
    }

    // Preserve expanded drawer state across reloads/saves
    const expandedKeys = new Set(
      this.workingGroups.filter((g) => g.isExpanded).map((g) => g.key)
    );

    const rawGroups: NotificationPreferenceGroup[] = Array.isArray(data.groups) ? data.groups : [];

    // Defensive: never wipe an already-visible role-specific UI because of
    // an anomalous empty payload. Keep the existing groups, but still sync
    // the global settings/frequency returned by the server.
    if (rawGroups.length === 0 && this.workingGroups.length > 0) {
      if (data.global_settings) {
        this.globalSettings = data.global_settings;
        this.frequency = (data.global_settings?.frequency as NotificationFrequency) || this.frequency;
        this.preferences = { ...data.global_settings };
      }
      this.takeSnapshot();
      this.hasUnsavedChanges = false;
      return;
    }

    this.workingGroups = rawGroups.map((g) => {
      const meta: NotificationGroupMeta = getNotificationGroupMeta(g.key, g.label, g.description);
      const typePrefs = (g.type_preferences || []).map((tp) => ({ ...tp }));

      // Calculate composite channel values for the group
      const inAppAll = typePrefs.length > 0 && typePrefs.every((tp) => tp.in_app_enabled);
      const emailAll = typePrefs.length > 0 && typePrefs.every((tp) => tp.email_enabled);
      const smsAll = typePrefs.length > 0 && typePrefs.every((tp) => tp.sms_enabled);
      const hasCustom = typePrefs.some((tp) => tp.explicit);

      return {
        key: g.key,
        label: meta.label,
        description: meta.description,
        icon: meta.icon,
        iconClass: meta.iconClass,
        section: g.section,
        types: [...g.types],
        default_channels: { ...g.default_channels },
        type_preferences: typePrefs,
        in_app_enabled: inAppAll,
        email_enabled: emailAll,
        sms_enabled: smsAll,
        isExpanded: expandedKeys.has(g.key),
        hasCustomOverrides: hasCustom,
      };
    });

    this.takeSnapshot();
    this.hasUnsavedChanges = false;
  }

  private takeSnapshot(): void {
    this.persistedSnapshot = JSON.stringify({
      frequency: this.frequency,
      groups: this.workingGroups.map((g) => ({
        key: g.key,
        types: g.type_preferences.map((tp) => ({
          type: tp.notification_type,
          in_app: tp.in_app_enabled,
          email: tp.email_enabled,
          sms: tp.sms_enabled,
        })),
      })),
    });
  }

  private checkForChanges(): void {
    const current = JSON.stringify({
      frequency: this.frequency,
      groups: this.workingGroups.map((g) => ({
        key: g.key,
        types: g.type_preferences.map((tp) => ({
          type: tp.notification_type,
          in_app: tp.in_app_enabled,
          email: tp.email_enabled,
          sms: tp.sms_enabled,
        })),
      })),
    });

    this.hasUnsavedChanges = current !== this.persistedSnapshot;
    if (this.hasUnsavedChanges) {
      this.savedSuccessfully = false;
    }
  }

  getGroupStatus(group: UiPreferenceGroup): 'enabled' | 'partial' | 'disabled' {
    const types = group.type_preferences;
    if (!types || types.length === 0) {
      if (group.in_app_enabled || group.email_enabled) return 'enabled';
      return 'disabled';
    }
    const totalChannels = types.length * 2; // In-app and Email
    const activeChannels =
      types.filter((t) => t.in_app_enabled).length +
      types.filter((t) => t.email_enabled).length;

    if (activeChannels === 0) return 'disabled';
    if (activeChannels === totalChannels) return 'enabled';
    return 'partial';
  }

  // ============================================================
  // CHANNEL MATRIX CONTROLS (PER-TYPE & PER-GROUP)
  // ============================================================

  toggleGroupChannel(
    group: UiPreferenceGroup,
    channel: 'in_app_enabled' | 'email_enabled' | 'sms_enabled',
    event: Event
  ): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (channel === 'email_enabled' && checked && !this.currentUser?.email) {
      this.toastService.warning('Email Required', 'A valid email address is required to enable Email alerts.');
      group.email_enabled = false;
      (event.target as HTMLInputElement).checked = false;
      this.cdr.detectChanges();
      return;
    }

    if (channel === 'sms_enabled') {
      group.sms_enabled = false;
      (event.target as HTMLInputElement).checked = false;
      this.toastService.info('SMS Coming Soon', 'SMS delivery is currently being configured and will be available soon.');
      this.cdr.detectChanges();
      return;
    }

    group[channel] = checked;

    // Apply the channel value across all notification types in this group
    group.type_preferences.forEach((tp) => {
      tp[channel] = checked;
    });

    this.checkForChanges();
    this.queueAutoSave();
    this.cdr.detectChanges();
  }

  toggleSingleTypeChannel(
    group: UiPreferenceGroup,
    typePref: NotificationTypePreference,
    channel: 'in_app_enabled' | 'email_enabled' | 'sms_enabled',
    event: Event
  ): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (channel === 'email_enabled' && checked && !this.currentUser?.email) {
      this.toastService.warning('Email Required', 'A valid email address is required for Email alerts.');
      typePref.email_enabled = false;
      (event.target as HTMLInputElement).checked = false;
      this.cdr.detectChanges();
      return;
    }

    if (channel === 'sms_enabled') {
      typePref.sms_enabled = false;
      (event.target as HTMLInputElement).checked = false;
      this.toastService.info('SMS Coming Soon', 'SMS delivery is currently being configured and will be available soon.');
      this.cdr.detectChanges();
      return;
    }

    typePref[channel] = checked;
    typePref.explicit = true;
    group.hasCustomOverrides = group.type_preferences.some((tp) => tp.explicit);

    // Recompute group channel state
    group[channel] = group.type_preferences.every((tp) => tp[channel]);

    this.checkForChanges();
    this.queueAutoSave();
    this.cdr.detectChanges();
  }

  toggleGroupExpansion(group: UiPreferenceGroup): void {
    group.isExpanded = !group.isExpanded;
    this.cdr.detectChanges();
  }

  // ============================================================
  // GLOBAL CONVENIENCE CONTROLS (RIGHT PANEL)
  // ============================================================

  get globalEmailState(): ChannelToggleState {
    const allTypes = this.getAllTypePreferences();
    if (allTypes.length === 0) return 'allOff';
    const enabledCount = allTypes.filter((t) => t.email_enabled).length;
    if (enabledCount === allTypes.length) return 'allOn';
    if (enabledCount === 0) return 'allOff';
    return 'mixed';
  }

  get globalInAppState(): ChannelToggleState {
    const allTypes = this.getAllTypePreferences();
    if (allTypes.length === 0) return 'allOff';
    const enabledCount = allTypes.filter((t) => t.in_app_enabled).length;
    if (enabledCount === allTypes.length) return 'allOn';
    if (enabledCount === 0) return 'allOff';
    return 'mixed';
  }

  get globalSmsState(): ChannelToggleState {
    return 'allOff';
  }

  get emailEnabledCount(): number {
    return this.getAllTypePreferences().filter((t) => t.email_enabled).length;
  }

  get inAppEnabledCount(): number {
    return this.getAllTypePreferences().filter((t) => t.in_app_enabled).length;
  }

  get smsEnabledCount(): number {
    return 0;
  }

  get totalTypeCount(): number {
    return this.getAllTypePreferences().length;
  }

  private getAllTypePreferences(): NotificationTypePreference[] {
    return this.workingGroups.flatMap((g) => g.type_preferences);
  }

  onGlobalChannelToggle(channel: 'email' | 'in_app' | 'sms', event: Event): void {
    if (channel === 'sms') {
      (event.target as HTMLInputElement).checked = false;
      this.toastService.info('SMS Coming Soon', 'SMS delivery is currently being configured and will be available soon.');
      return;
    }

    const checked = (event.target as HTMLInputElement).checked;

    if (!checked) {
      // Prompt confirmation before turning off across all notification types
      this.pendingChannelToDisable = channel;
      this.showDisableChannelModal = true;
      (event.target as HTMLInputElement).checked = true;
      this.cdr.detectChanges();
      return;
    }

    this.applyGlobalChannelToggle(channel, checked);
  }

  confirmDisableChannelAction(): void {
    if (this.pendingChannelToDisable) {
      this.applyGlobalChannelToggle(this.pendingChannelToDisable, false);
      this.pendingChannelToDisable = null;
    }
    this.showDisableChannelModal = false;
    this.cdr.detectChanges();
  }

  cancelDisableChannelAction(): void {
    this.pendingChannelToDisable = null;
    this.showDisableChannelModal = false;
    this.cdr.detectChanges();
  }

  private applyGlobalChannelToggle(channel: 'email' | 'in_app' | 'sms', enabled: boolean): void {
    const channelKey: 'in_app_enabled' | 'email_enabled' | 'sms_enabled' =
      channel === 'email' ? 'email_enabled' : 'in_app_enabled';

    if (enabled && channel === 'email' && !this.currentUser?.email) {
      this.toastService.warning('Email Required', 'A valid email address is required to enable Email alerts.');
      return;
    }

    this.workingGroups.forEach((g) => {
      g[channelKey] = enabled;
      g.type_preferences.forEach((tp) => {
        tp[channelKey] = enabled;
      });
    });

    this.checkForChanges();
    this.queueAutoSave();
    this.cdr.detectChanges();
  }

  // ============================================================
  // FREQUENCY SELECTION
  // ============================================================

  setFrequency(freq: NotificationFrequency): void {
    if (this.frequency !== freq) {
      this.frequency = freq;
      this.preferences.frequency = freq;
      this.checkForChanges();
      this.queueAutoSave();
      this.cdr.detectChanges();
    }
  }

  // ============================================================
  // PERSISTENCE (AUTO-SAVE & MANUAL SAVE TO BACKEND)
  // ============================================================

  private queueAutoSave(): void {
    if (!this.matrixLoaded) return;
    this.autoSaving = true;
    this.autoSaved = false;
    this.autoSaveSubject.next();
  }

  private performSave(isManualClick: boolean): Observable<NotificationMatrixResponse | null> {
    if (isManualClick) {
      this.saving = true;
    } else {
      this.autoSaving = true;
    }
    this.savedSuccessfully = false;

    const rules: NotificationTypeRuleUpdate[] = [];
    for (const group of this.workingGroups) {
      for (const tp of group.type_preferences) {
        rules.push({
          notification_type: tp.notification_type,
          in_app_enabled: tp.in_app_enabled,
          email_enabled: tp.email_enabled,
          sms_enabled: false,
        });
      }
    }

    const payload: NotificationMatrixUpdatePayload = {
      global_settings: {
        frequency: this.frequency,
        email_enabled: this.globalEmailState !== 'allOff',
        sms_enabled: false,
        in_app_enabled: this.globalInAppState !== 'allOff',
      },
      rules,
    };

    return this.preferencesService.savePreferenceMatrix(payload).pipe(
      tap((updated: NotificationMatrixResponse) => {
        this.applyMatrixData(updated);
        this.saving = false;
        this.autoSaving = false;
        this.savedSuccessfully = true;
        this.hasUnsavedChanges = false;
        this.autoSaved = true;

        if (this.autoSavedTimer) clearTimeout(this.autoSavedTimer);
        this.autoSavedTimer = setTimeout(() => {
          this.autoSaved = false;
          this.cdr.detectChanges();
        }, 2500);

        if (isManualClick) {
          this.toastService.success(
            'Preferences Saved',
            'Your notification preferences have been saved successfully.'
          );
        }
        this.cdr.detectChanges();
      }),
      catchError((err: HttpErrorResponse) => {
        this.saving = false;
        this.autoSaving = false;
        const msg =
          err?.error?.detail ||
          'Unable to save notification preferences. Your previous settings are unchanged.';
        this.toastService.error('Save Failed', msg);
        this.cdr.detectChanges();
        return of(null);
      })
    );
  }

  savePreferences(): void {
    this.performSave(true).subscribe();
  }

  // ============================================================
  // RESET TO DEFAULT
  // ============================================================

  promptResetToDefault(): void {
    this.showResetModal = true;
    this.cdr.detectChanges();
  }

  confirmReset(): void {
    this.showResetModal = false;
    this.resetToDefault();
  }

  cancelReset(): void {
    this.showResetModal = false;
  }

  resetToDefault(): void {
    this.resetting = true;
    this.savedSuccessfully = false;

    forkJoin({
      rules: this.preferencesService.resetTypeMatrix(),
      global: this.preferencesService.resetPreferences(),
    }).subscribe({
      next: ({ rules }) => {
        this.applyMatrixData(rules);
        this.resetting = false;
        this.savedSuccessfully = true;
        this.hasUnsavedChanges = false;
        this.toastService.info('Preferences Reset', 'Notification preferences have been restored to defaults.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.resetting = false;
        this.toastService.error('Reset Failed', 'Unable to reset notification preferences to defaults.');
        this.cdr.detectChanges();
      },
    });
  }

  // ============================================================
  // NAVIGATION & HELPERS
  // ============================================================

  getRolePrefix(): string {
    const role = (this.userRole || '').toUpperCase().trim();
    if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'admin';
    if (role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT' || role === 'GOVT') return 'government';
    if (role === 'RESEARCHER') return 'researcher';
    if (role === 'ORGANIZATION' || role === 'ORGANISATION') return 'organization';
    return 'citizen';
  }

  navigateToHome(): void {
    if (this.hasUnsavedChanges && !confirm('You have unsaved notification changes. Do you want to leave?')) {
      return;
    }
    const prefix = this.getRolePrefix();
    this.router.navigate([`/dashboard/${prefix}`]);
  }

  navigateToNotifications(): void {
    if (this.hasUnsavedChanges && !confirm('You have unsaved notification changes. Do you want to leave?')) {
      return;
    }
    const prefix = this.getRolePrefix();
    this.router.navigate([`/dashboard/${prefix}/notifications`]);
  }

  formatTypeLabel(type: string): string {
    return formatNotificationTypeLabel(type);
  }

  trackByGroupKey(_index: number, group: UiPreferenceGroup): string {
    return group.key;
  }

  trackByNotificationType(_index: number, item: NotificationTypePreference): string {
    return item.notification_type;
  }

  // ============================================================
  // LEGACY BACKWARDS COMPATIBILITY
  // ============================================================

  private initLegacyTypeOptions(): void {
    this.typeOptions = [
      { key: 'policy_alerts', title: 'Policy Alerts' },
      { key: 'scheme_updates', title: 'Scheme Updates' },
      { key: 'deadline_reminders', title: 'Deadline Reminders' },
    ];
  }
}
