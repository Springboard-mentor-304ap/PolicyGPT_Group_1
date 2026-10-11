import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { AddPolicyComponent } from './add-policy.component';
import { PolicyService } from '../../../core/services/policy.services';
import { Auth } from '../../../core/services/auth';

describe('tick-breaks-view check', () => {
  it('checks trigger after tick', async () => {
    await TestBed.configureTestingModule({
      imports: [AddPolicyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '125' } } } },
        { provide: Auth, useValue: { getStoredUser: () => ({ id: 1, role: 'ADMIN', name: 'A' }), getToken: () => 't' } },
      ],
    }).compileComponents();
    const policyService = TestBed.inject(PolicyService);
    vi.spyOn(policyService, 'getPolicy').mockImplementation(
      () =>
        new Observable((subscriber) => {
          const timer = setTimeout(() => {
            subscriber.next({ policy_id: 125, title: 'T', description: 'd', category: 'Water Resources', status: 'ARCHIVED' } as any);
            subscriber.complete();
          }, 0);
          return () => clearTimeout(timer);
        }),
    );
    const fixture = TestBed.createComponent(AddPolicyComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 30));
    console.log('BEFORE TICK, ctrl:', JSON.stringify((component as any).policyForm.get('category')?.value));
    TestBed.inject(ApplicationRef).tick();
    const trig = fixture.nativeElement.querySelector('#policy-category .selected-text');
    console.log('AFTER TICK, trigger:', JSON.stringify(trig?.textContent));
    console.log('AFTER TICK, ctrl:', JSON.stringify((component as any).policyForm.get('category')?.value));
    (component as any).cdr.markForCheck();
    TestBed.inject(ApplicationRef).tick();
    const trig2 = fixture.nativeElement.querySelector('#policy-category .selected-text');
    console.log('AFTER MARKFORCHECK, trigger:', JSON.stringify(trig2?.textContent));
    expect(true).toBe(true);
  });
});
