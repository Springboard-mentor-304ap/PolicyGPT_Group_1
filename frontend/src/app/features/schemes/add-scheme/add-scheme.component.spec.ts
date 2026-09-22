import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddSchemeComponent } from './add-scheme.component';
import { SchemeService } from '../../../core/services/scheme.service';
import { ToastService } from '../../../core/services/toast.service';
import { Auth } from '../../../core/services/auth';

describe('AddSchemeComponent', () => {
  let component: AddSchemeComponent;
  let fixture: ComponentFixture<AddSchemeComponent>;
  let schemeService: SchemeService;
  let toastService: ToastService;
  let authService: any;

  beforeEach(async () => {
    authService = {
      getStoredUser: () => ({ user_id: 2, role: 'GOVERNMENT_OFFICIAL', full_name: 'Gov User' }),
      getUserRole: () => 'GOVERNMENT_OFFICIAL',
      getToken: () => 'fake-gov-jwt-token',
    };

    await TestBed.configureTestingModule({
      imports: [AddSchemeComponent],
      providers: [
        SchemeService,
        ToastService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddSchemeComponent);
    component = fixture.componentInstance;
    schemeService = TestBed.inject(SchemeService);
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('1. should initialize with step 1 and valid government role', () => {
    expect(component.currentStep).toBe(1);
    expect(component.totalSteps).toBe(5);
    expect(component.isAdmin).toBe(false);
    expect(component.rolePrefix).toBe('government');
  });

  it('2. should validate required fields in step 1', () => {
    expect(component.isStepValid(1)).toBe(false);

    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      description: 'Clean energy generation initiative for households across the nation.',
    });

    expect(component.isStepValid(1)).toBe(true);
  });

  it('3. should save draft when saveDraft() is clicked', () => {
    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      description: 'Clean energy generation initiative for households across the nation.',
    });

    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 55,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.saveDraft();
    expect(saveDraftSpy).toHaveBeenCalled();
    expect(component.editingSchemeId).toBe(55);
    expect(component.savedDraftToast).toBe(true);
  });

  it('4. should test complete 5 step flow and submit for approval as Government Official', () => {
    // Step 1
    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      description: 'Clean energy generation initiative for households across the nation.',
    });
    component.nextStep();
    expect(component.currentStep).toBe(2);

    // Step 2
    component.nextStep();
    expect(component.currentStep).toBe(3);

    // Step 3
    component.nextStep();
    expect(component.currentStep).toBe(4);

    // Step 4
    component.nextStep();
    expect(component.currentStep).toBe(5);

    // Step 5
    component.schemeForm.patchValue({ declarationAgreed: true });
    expect(component.isStepValid(5)).toBe(true);

    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 88,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    const submitSpy = vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 88,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    expect(createSpy).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledWith(88);
    expect(component.showSuccessModal).toBe(true);
  });
});
