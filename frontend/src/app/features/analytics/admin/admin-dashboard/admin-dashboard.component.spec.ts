import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminAnalyticsDataService } from '../services/admin-analytics-data.service';

describe('AdminDashboardComponent', () => {
  let component: AdminDashboardComponent;
  let fixture: ComponentFixture<AdminDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create AdminDashboardComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should render page title and sample data badge', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-title')?.textContent).toContain('Admin Analytics Dashboard');
    expect(compiled.querySelector('.sample-data-badge')).toBeTruthy();
  });

  it('should switch timeframe correctly', () => {
    component.selectTimeframe('Last 3 Months');
    expect(component.trendTimeframe()).toBe('Last 3 Months');
    expect(component.trendLabels).toEqual(['Jul', 'Aug', 'Sep']);

    component.selectTimeframe('Last 6 Months');
    expect(component.trendTimeframe()).toBe('Last 6 Months');
    expect(component.trendLabels.length).toBe(6);
  });

  it('should update currentRange on date range change', () => {
    component.onDateRangeChange('Custom Range');
    expect(component.currentRange()).toBe('Custom Range');
  });
});
