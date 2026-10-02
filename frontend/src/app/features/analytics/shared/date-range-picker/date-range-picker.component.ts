import { Component, EventEmitter, HostListener, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="date-picker-wrapper">
      <button
        type="button"
        class="date-picker-btn"
        (click)="toggleDropdown($event)"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
      >
        <span class="material-icons calendar-icon">calendar_today</span>
        <span class="selected-text">{{ selectedRange() }}</span>
        <span class="material-icons chevron-icon">expand_more</span>
      </button>

      @if (isOpen()) {
        <div class="dropdown-menu" role="listbox">
          @for (preset of presets; track preset) {
            <button
              type="button"
              class="dropdown-item"
              [class.active]="preset === selectedRange()"
              (click)="selectPreset(preset)"
              role="option"
              [attr.aria-selected]="preset === selectedRange()"
            >
              <span class="preset-label">{{ preset }}</span>
              @if (preset === selectedRange()) {
                <span class="material-icons check-icon">check</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .date-picker-wrapper {
      position: relative;
      display: inline-block;
    }
    .date-picker-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      height: 38px;
      background: #ffffff;
      border: 1px solid #dbe2eb;
      border-radius: 8px;
      padding: 0 0.875rem;
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      transition: all 0.15s ease;
      white-space: nowrap;

      &:hover {
        border-color: #0879ed;
        background-color: #fafcff;
      }
      .calendar-icon, .chevron-icon {
        font-size: 18px;
        color: #64748b;
      }
    }
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #ffffff;
      border: 1px solid var(--border, #e3e8f0);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(15, 27, 61, 0.12);
      z-index: 100;
      min-width: 220px;
      padding: 0.35rem 0;
    }
    .dropdown-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      text-align: left;
      padding: 0.5rem 1rem;
      border: none;
      background: none;
      font-size: 0.875rem;
      color: var(--ink, #0f1b3d);
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: #f1f5f9;
      }
      &.active {
        font-weight: 600;
        color: var(--blue, #2f6fed);
        background: #e8f0fe;
      }
      .check-icon {
        font-size: 1rem;
        color: var(--blue, #2f6fed);
      }
    }
  `]
})
export class DateRangePickerComponent {
  @Output() rangeChange = new EventEmitter<string>();

  selectedRange = signal<string>('Jan 1, 2024 - Sep 30, 2024');
  isOpen = signal<boolean>(false);

  presets = [
    'Today',
    'Last 7 Days',
    'Sep 1, 2024 - Sep 30, 2024',
    'Jan 1, 2024 - Sep 30, 2024',
    'Last 12 Months',
    'Year to Date'
  ];

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen.update(v => !v);
  }

  selectPreset(preset: string): void {
    this.selectedRange.set(preset);
    this.isOpen.set(false);
    this.rangeChange.emit(preset);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }
  }
}
