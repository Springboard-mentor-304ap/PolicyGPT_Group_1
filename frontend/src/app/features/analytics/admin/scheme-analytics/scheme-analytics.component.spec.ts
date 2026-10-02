import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SchemeAnalyticsComponent } from './scheme-analytics.component';
import { AdminAnalyticsDataService } from '../services/admin-analytics-data.service';

describe('SchemeAnalyticsComponent', () => {
  let component: SchemeAnalyticsComponent;
  let fixture: ComponentFixture<SchemeAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemeAnalyticsComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SchemeAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create SchemeAnalyticsComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should render page title and top viewed schemes table', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-title')?.textContent).toContain('Scheme Analytics');
    expect(component.topViewedSchemes().length).toBe(5);
  });

  it('should apply and reset filters', () => {
    component.onApplyFilters({ ministry: 'Ministry of Agriculture & Farmers Welfare' });
    expect(component.activeFilters()).toEqual({ ministry: 'Ministry of Agriculture & Farmers Welfare' });

    component.onResetFilters();
    expect(component.activeFilters()).toEqual({});
  });

  it('should return correct type chip class', () => {
    expect(component.getTypeChipClass('Update')).toBe('type-blue');
    expect(component.getTypeChipClass('Notification')).toBe('type-purple');
    expect(component.getTypeChipClass('New Scheme')).toBe('type-green');
    expect(component.getTypeChipClass('Unknown')).toBe('type-gray');
  });
});
