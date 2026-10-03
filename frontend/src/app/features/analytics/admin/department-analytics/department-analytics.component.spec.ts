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
    expect(component.searchQuery()).toBe('Edu');
    expect(component.showResults()).toBe(true);
    expect(component.filteredDepartments().length).toBeGreaterThan(0);
    expect(component.filteredDepartments()[0].name).toContain('Education');
  });

  it('should match departments by id or overview title', () => {
    const event = { target: { value: 'ministry' } } as unknown as Event;
    component.updateSearch(event);
    const items = component.filteredDepartments();
    expect(items.length).toBeGreaterThan(0);
    // 'Agriculture' has no 'ministry' in its name: matched via overview title.
    expect(items.map((d) => d.name)).toContain('Agriculture');
    expect(
      items.every((d) => d.overview.title.toLowerCase().includes('ministry')),
    ).toBe(true);
  });

  it('should show an empty state when nothing matches', () => {
    const event = { target: { value: 'zzz-no-such-dept' } } as unknown as Event;
    component.updateSearch(event);
    expect(component.showResults()).toBe(true);
    expect(component.filteredDepartments().length).toBe(0);
  });

  it('should select a department and close the results panel', () => {
    const targetDept = component.departmentsList[2]; // Education
    component.selectDepartmentAndClose(targetDept);
    expect(component.selectedDept().id).toBe('education');
    expect(component.currentOverview().title).toBe(targetDept.overview.title);
    expect(component.resultsOpen()).toBe(false);
  });

  it('should clear the search and restore the default view', () => {
    component.selectDepartment(component.departmentsList[2]);
    const event = { target: { value: 'health' } } as unknown as Event;
    component.updateSearch(event);
    component.clearSearch();
    expect(component.searchQuery()).toBe('');
    expect(component.showResults()).toBe(false);
    expect(component.filteredDepartments().length).toBe(
      component.departmentsList.length,
    );
    expect(component.selectedDept().id).toBe('all');
  });

  it('should navigate results with the keyboard', () => {
    const event = { target: { value: 'e' } } as unknown as Event;
    component.updateSearch(event);
    const count = component.filteredDepartments().length;
    expect(count).toBeGreaterThan(1);
    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeResultIndex()).toBe(0);
    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeResultIndex()).toBe(1);
    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.selectedDept().id).toBe(
      component.filteredDepartments()[1].id,
    );
    expect(component.resultsOpen()).toBe(false);
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
