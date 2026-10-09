import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectComponent } from '../../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  template: `
    <div class="filters-card">
      <div class="filters-row">
        <!-- State Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-state">State</label>
          <app-searchable-select
            id="filter-state"
            size="filter"
            [options]="stateOptions"
            [searchable]="true"
            searchPlaceholder="Search states..."
            placeholder="All States"
            [(ngModel)]="stateModel"
            (selectionChange)="selectedState.set($event || defaultState)"
          />
        </div>

        <!-- Category Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-category">Category</label>
          <app-searchable-select
            id="filter-category"
            size="filter"
            [options]="categoryOptions"
            [searchable]="true"
            searchPlaceholder="Search categories..."
            placeholder="All Categories"
            [(ngModel)]="categoryModel"
            (selectionChange)="selectedCategory.set($event || defaultCategory)"
          />
        </div>

        <!-- Ministry Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-ministry">Ministry</label>
          <app-searchable-select
            id="filter-ministry"
            size="filter"
            [options]="ministryOptions"
            [searchable]="true"
            searchPlaceholder="Search ministries..."
            placeholder="All Ministries"
            [(ngModel)]="ministryModel"
            (selectionChange)="selectedMinistry.set($event || defaultMinistry)"
          />
        </div>

        <!-- Department Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-department">Department</label>
          <app-searchable-select
            id="filter-department"
            size="filter"
            [options]="departmentOptions"
            [searchable]="true"
            searchPlaceholder="Search departments..."
            placeholder="All Departments"
            [(ngModel)]="departmentModel"
            (selectionChange)="selectedDepartment.set($event || defaultDepartment)"
          />
        </div>

        <!-- Status Filter (small fixed list: compact, no search box) -->
        <div class="filter-group">
          <label class="filter-label" for="filter-status">Status</label>
          <app-searchable-select
            id="filter-status"
            size="filter"
            [options]="statusOptions"
            [searchable]="false"
            placeholder="All Status"
            [(ngModel)]="statusModel"
            (selectionChange)="selectedStatus.set($event || defaultStatus)"
          />
        </div>

        <!-- Action Buttons -->
        <div class="filter-actions">
          <button type="button" class="btn-apply" (click)="onApply()">
            Apply Filters
          </button>
          <button type="button" class="btn-reset" (click)="onReset()">
            Reset
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './filters-bar.component.scss'
})
export class FiltersBarComponent {
  @Output() apply = new EventEmitter<Record<string, string>>();
  @Output() reset = new EventEmitter<void>();

  // Default values
  readonly defaultState = 'All States';
  readonly defaultCategory = 'All Categories';
  readonly defaultMinistry = 'All Ministries';
  readonly defaultDepartment = 'All Departments';
  readonly defaultStatus = 'All Status';

  // Signals for current selection
  selectedState = signal<string>(this.defaultState);
  selectedCategory = signal<string>(this.defaultCategory);
  selectedMinistry = signal<string>(this.defaultMinistry);
  selectedDepartment = signal<string>(this.defaultDepartment);
  selectedStatus = signal<string>(this.defaultStatus);

  // Dropdown options (first entry is the "All" default; the control
  // stores '' for it so placeholder text shows until a value is picked).
  stateOptions = ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Gujarat'];
  categoryOptions = ['Agriculture', 'Education', 'Healthcare', 'Social Welfare', 'Employment', 'Finance', 'Housing', 'Environment'];
  ministryOptions = ['Ministry of Agriculture', 'Ministry of Education', 'Ministry of Health', 'Ministry of Finance', 'Ministry of Housing', 'Ministry of Environment', 'Ministry of Skill Dev'];
  departmentOptions = ['Agriculture & Farmers Welfare', 'Education & Literacy', 'Health & Family Welfare', 'Rural Development', 'Urban Development'];
  statusOptions = ['Approved', 'Pending', 'Active', 'Rejected', 'Archived'];

  /** ngModel bridges: '' means the "All ..." default. */
  get stateModel(): string {
    return this.selectedState() === this.defaultState ? '' : this.selectedState();
  }
  set stateModel(v: string) {
    this.selectedState.set(v || this.defaultState);
  }

  get categoryModel(): string {
    return this.selectedCategory() === this.defaultCategory ? '' : this.selectedCategory();
  }
  set categoryModel(v: string) {
    this.selectedCategory.set(v || this.defaultCategory);
  }

  get ministryModel(): string {
    return this.selectedMinistry() === this.defaultMinistry ? '' : this.selectedMinistry();
  }
  set ministryModel(v: string) {
    this.selectedMinistry.set(v || this.defaultMinistry);
  }

  get departmentModel(): string {
    return this.selectedDepartment() === this.defaultDepartment ? '' : this.selectedDepartment();
  }
  set departmentModel(v: string) {
    this.selectedDepartment.set(v || this.defaultDepartment);
  }

  get statusModel(): string {
    return this.selectedStatus() === this.defaultStatus ? '' : this.selectedStatus();
  }
  set statusModel(v: string) {
    this.selectedStatus.set(v || this.defaultStatus);
  }

  onApply(): void {
    this.apply.emit({
      state: this.selectedState(),
      category: this.selectedCategory(),
      ministry: this.selectedMinistry(),
      department: this.selectedDepartment(),
      status: this.selectedStatus()
    });
  }

  onReset(): void {
    this.selectedState.set(this.defaultState);
    this.selectedCategory.set(this.defaultCategory);
    this.selectedMinistry.set(this.defaultMinistry);
    this.selectedDepartment.set(this.defaultDepartment);
    this.selectedStatus.set(this.defaultStatus);
    this.reset.emit();
  }
}
