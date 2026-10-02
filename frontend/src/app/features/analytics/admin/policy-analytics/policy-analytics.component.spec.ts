import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PolicyAnalyticsComponent } from './policy-analytics.component';
import { AdminAnalyticsDataService } from '../services/admin-analytics-data.service';

describe('PolicyAnalyticsComponent', () => {
  let component: PolicyAnalyticsComponent;
  let fixture: ComponentFixture<PolicyAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyAnalyticsComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create PolicyAnalyticsComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should render page title and stat cards', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-title')?.textContent).toContain('Policy Analytics');
    expect(compiled.querySelectorAll('.stat-card').length).toBe(5);
  });

  it('should apply and reset filters', () => {
    component.onApplyFilters({ status: 'Approved' });
    expect(component.activeFilters()).toEqual({ status: 'Approved' });
    expect(component.latestPolicies().every(p => p.status === 'Approved')).toBe(true);

    component.onResetFilters();
    expect(component.activeFilters()).toEqual({});
  });

  it('should return correct chip classes for status', () => {
    expect(component.getStatusChipClass('Approved')).toBe('chip-green');
    expect(component.getStatusChipClass('Pending')).toBe('chip-orange');
    expect(component.getStatusChipClass('Rejected')).toBe('chip-red');
    expect(component.getStatusChipClass('Draft')).toBe('chip-gray');
  });
});
