import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DepartmentAnalyticsComponent } from './department-analytics.component';
import { AdminAnalyticsDataService } from '../services/admin-analytics-data.service';

describe('DepartmentAnalyticsComponent', () => {
  let component: DepartmentAnalyticsComponent;
  let fixture: ComponentFixture<DepartmentAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartmentAnalyticsComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create DepartmentAnalyticsComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should render 6 metric cards', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-title')?.textContent).toContain('Department Analytics');
    expect(compiled.querySelectorAll('.top-cards-grid .metric-card').length).toBe(6);
  });

  it('should filter departments based on search query', () => {
    const event = { target: { value: 'Edu' } } as unknown as Event;
    component.updateSearch(event);
    expect(component.searchQuery()).toBe('edu');
    expect(component.filteredDepartments().length).toBeGreaterThan(0);
    expect(component.filteredDepartments()[0].name).toContain('Education');
  });

  it('should select department and update overview', () => {
    const targetDept = component.departmentsList[1]; // Agriculture
    component.selectDepartment(targetDept);
    expect(component.selectedDept().id).toBe('agriculture');
    expect(component.currentOverview().title).toBe(targetDept.overview.title);
  });

  it('should open and close details modal', () => {
    const row = component.tableRows[0];
    component.viewDepartmentDetails(row);
    expect(component.selectedRowDepartment()).toBe(row);

    component.closeDetailsModal();
    expect(component.selectedRowDepartment()).toBeNull();
  });
});
