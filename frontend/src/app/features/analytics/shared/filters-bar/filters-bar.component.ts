import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="filters-card">
      <div class="filters-row">
        <!-- State Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-state">State</label>
          <select
            id="filter-state"
            class="filter-select"
            [value]="selectedState()"
            (change)="onSelectChange('state', $event)"
          >
            @for (opt of stateOptions; track opt) {
              <option [value]="opt">{{ opt }}</option>
            }
          </select>
        </div>

        <!-- Category Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-category">Category</label>
          <select
            id="filter-category"
            class="filter-select"
            [value]="selectedCategory()"
            (change)="onSelectChange('category', $event)"
          >
            @for (opt of categoryOptions; track opt) {
              <option [value]="opt">{{ opt }}</option>
            }
          </select>
        </div>

        <!-- Ministry Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-ministry">Ministry</label>
          <select
            id="filter-ministry"
            class="filter-select"
            [value]="selectedMinistry()"
            (change)="onSelectChange('ministry', $event)"
          >
            @for (opt of ministryOptions; track opt) {
              <option [value]="opt">{{ opt }}</option>
            }
          </select>
        </div>

        <!-- Department Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-department">Department</label>
          <select
            id="filter-department"
            class="filter-select"
            [value]="selectedDepartment()"
            (change)="onSelectChange('department', $event)"
          >
            @for (opt of departmentOptions; track opt) {
              <option [value]="opt">{{ opt }}</option>
            }
          </select>
        </div>

        <!-- Status Filter -->
        <div class="filter-group">
          <label class="filter-label" for="filter-status">Status</label>
          <select
            id="filter-status"
            class="filter-select"
            [value]="selectedStatus()"
            (change)="onSelectChange('status', $event)"
          >
            @for (opt of statusOptions; track opt) {
              <option [value]="opt">{{ opt }}</option>
            }
          </select>
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

  // Dropdown options
  stateOptions = ['All States', 'Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Gujarat'];
  categoryOptions = ['All Categories', 'Agriculture', 'Education', 'Healthcare', 'Social Welfare', 'Employment', 'Finance', 'Housing', 'Environment'];
  ministryOptions = ['All Ministries', 'Ministry of Agriculture', 'Ministry of Education', 'Ministry of Health', 'Ministry of Finance', 'Ministry of Housing', 'Ministry of Environment', 'Ministry of Skill Dev'];
  departmentOptions = ['All Departments', 'Agriculture & Farmers Welfare', 'Education & Literacy', 'Health & Family Welfare', 'Rural Development', 'Urban Development'];
  statusOptions = ['All Status', 'Approved', 'Pending', 'Active', 'Rejected', 'Archived'];

  onSelectChange(field: string, event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    switch (field) {
      case 'state': this.selectedState.set(val); break;
      case 'category': this.selectedCategory.set(val); break;
      case 'ministry': this.selectedMinistry.set(val); break;
      case 'department': this.selectedDepartment.set(val); break;
      case 'status': this.selectedStatus.set(val); break;
    }
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
