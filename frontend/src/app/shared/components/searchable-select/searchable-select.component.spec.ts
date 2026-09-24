import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SearchableSelectComponent } from './searchable-select.component';
import {
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  POLICY_CATEGORIES,
} from '../../../core/constants/government-data.constants';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <form [formGroup]="testForm">
      <app-searchable-select
        id="test-category"
        formControlName="category"
        [options]="categories"
        placeholder="Select category"
        searchPlaceholder="Search or select category..."
        icon="grid_view"
      ></app-searchable-select>

      <app-searchable-select
        id="test-ministry"
        formControlName="ministry"
        [options]="ministries"
        placeholder="Select ministry"
        searchPlaceholder="Search or select ministry..."
        (selectionChange)="onMinistryChange($event)"
      ></app-searchable-select>

      <app-searchable-select
        id="test-department"
        formControlName="department"
        [options]="departmentOptions"
        placeholder="Select department"
        [disabled]="!testForm.get('ministry')?.value"
      ></app-searchable-select>
    </form>
  `,
})
class TestHostComponent {
  categories = POLICY_CATEGORIES;
  ministries = MINISTRIES;
  departmentOptions: string[] = [];

  testForm = new FormGroup({
    category: new FormControl(''),
    ministry: new FormControl(''),
    department: new FormControl(''),
  });

  onMinistryChange(selectedMinistry: string): void {
    if (!selectedMinistry) {
      this.departmentOptions = [];
      this.testForm.get('department')?.setValue('');
      return;
    }

    const specific = MINISTRY_DEPARTMENTS_MAP[selectedMinistry];
    if (specific && specific.length > 0) {
      this.departmentOptions = [...specific];
      const cur = this.testForm.get('department')?.value;
      if (cur && !specific.includes(cur)) {
        this.testForm.get('department')?.setValue('');
      }
    } else {
      this.departmentOptions = ['Department of Agriculture and Farmers Welfare'];
    }
  }
}

describe('SearchableSelectComponent & Dependent Behavior', () => {
  let hostFixture: ComponentFixture<TestHostComponent>;
  let hostComponent: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    hostFixture = TestBed.createComponent(TestHostComponent);
    hostComponent = hostFixture.componentInstance;
    hostFixture.detectChanges();
  });

  it('should initialize with correct default placeholders and closed state', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger');
    expect(triggerEl).toBeTruthy();
    expect(triggerEl.textContent).toContain('Select category');
    expect(hostFixture.nativeElement.querySelector('.dropdown-panel')).toBeNull();
  });

  it('should open dropdown when clicked and display options', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger') as HTMLElement;
    triggerEl.click();
    hostFixture.detectChanges();

    const panel = hostFixture.nativeElement.querySelector('.dropdown-panel');
    expect(panel).toBeTruthy();

    const options = hostFixture.nativeElement.querySelectorAll('.option-item');
    expect(options.length).toBe(POLICY_CATEGORIES.length);
  });

  it('should filter options case-insensitively upon user typing', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger') as HTMLElement;
    triggerEl.click();
    hostFixture.detectChanges();

    const searchInput = hostFixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    searchInput.value = 'agri';
    searchInput.dispatchEvent(new Event('input'));
    hostFixture.detectChanges();

    const optionLabels = Array.from(
      hostFixture.nativeElement.querySelectorAll('.option-label')
    ).map((el: any) => el.textContent.trim());

    expect(optionLabels).toContain('Agriculture');
    expect(optionLabels).not.toContain('Education');
  });

  it('should display "No matching options" if typing does not match any item', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger') as HTMLElement;
    triggerEl.click();
    hostFixture.detectChanges();

    const searchInput = hostFixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    searchInput.value = 'xyz123nonexistent';
    searchInput.dispatchEvent(new Event('input'));
    hostFixture.detectChanges();

    const noOptionsEl = hostFixture.nativeElement.querySelector('.no-options');
    expect(noOptionsEl).toBeTruthy();
    expect(noOptionsEl.textContent).toContain('No matching options');
  });

  it('should select an option on click, update form control, and close dropdown', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger') as HTMLElement;
    triggerEl.click();
    hostFixture.detectChanges();

    const firstOption = hostFixture.nativeElement.querySelector('.option-item') as HTMLElement;
    firstOption.click();
    hostFixture.detectChanges();

    expect(hostComponent.testForm.get('category')?.value).toBe(POLICY_CATEGORIES[0]);
    // Dropdown should now be closed
    const panel = hostFixture.nativeElement.querySelector('.dropdown-panel');
    expect(panel).toBeNull();
  });

  it('should close dropdown on Escape key', () => {
    const triggerEl = hostFixture.nativeElement.querySelector('#test-category .select-trigger') as HTMLElement;
    triggerEl.click();
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('.dropdown-panel')).toBeTruthy();

    const searchInput = hostFixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    searchInput.dispatchEvent(escEvent);
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('.dropdown-panel')).toBeNull();
  });

  it('should correctly filter dependent departments when Ministry of Education is selected', () => {
    expect(hostComponent.departmentOptions.length).toBe(0);

    hostComponent.onMinistryChange('Ministry of Education');
    hostFixture.detectChanges();

    expect(hostComponent.departmentOptions).toEqual([
      'Department of School Education and Literacy',
      'Department of Higher Education',
    ]);
  });

  it('should clear selected department when ministry changes to one that does not contain it', () => {
    // Select Ministry of Education and a valid child department
    hostComponent.onMinistryChange('Ministry of Education');
    hostComponent.testForm.get('department')?.setValue('Department of Higher Education');
    expect(hostComponent.testForm.get('department')?.value).toBe('Department of Higher Education');

    // Change to Ministry of Agriculture and Farmers Welfare
    hostComponent.onMinistryChange('Ministry of Agriculture and Farmers Welfare');
    hostFixture.detectChanges();

    // Department of Higher Education is not under Agriculture, so it should be cleared
    expect(hostComponent.testForm.get('department')?.value).toBe('');
    expect(hostComponent.departmentOptions).toEqual([
      'Department of Agriculture and Farmers Welfare',
      'Department of Agricultural Research and Education',
    ]);
  });
});
