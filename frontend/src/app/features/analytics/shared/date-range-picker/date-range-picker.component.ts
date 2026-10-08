import { Component, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  defaultSelection,
  selectionForCustom,
  selectionForLabel,
  type DateRangeSelection,
} from '../analytics-date-range.service';

export type { DateRangeSelection };

const _defaultSel = defaultSelection();
const DEFAULT_LABEL = _defaultSel.label;
const DEFAULT_START = _defaultSel.startISO;
const DEFAULT_END = _defaultSel.endISO;

/**
 * Reusable Analytics date-range filter (single implementation used by every
 * Admin Analytics page and Support Analytics).
 *
 * The button keeps the exact Usage Statistics styling. The dropdown offers
 * the historical presets plus a real calendar range (start/end day inputs
 * with Apply / Cancel / Clear, end-before-start validation, outside-click
 * and Escape to close). Selections emit both the compat `rangeChange`
 * label string and the full `rangeSelect` bounds pages use to reload data
 * and to stamp report requests.
 */
@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="date-picker-wrapper">
      <button
        type="button"
        class="date-picker-btn"
        (click)="toggleDropdown($event)"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
        [title]="displayedRange()"
      >
        <span class="material-icons calendar-icon">calendar_today</span>
        <span class="selected-text">{{ displayedRange() }}</span>
        <span class="material-icons chevron-icon">expand_more</span>
      </button>

      @if (isOpen()) {
        <div class="dropdown-menu" role="listbox" (click)="$event.stopPropagation()">
          @for (preset of presets; track preset) {
            <button
              type="button"
              class="dropdown-item"
              [class.active]="preset === displayedRange()"
              (click)="selectPreset(preset)"
              role="option"
              [attr.aria-selected]="preset === displayedRange()"
            >
              <span class="preset-label">{{ preset }}</span>
              @if (preset === displayedRange()) {
                <span class="material-icons check-icon">check</span>
              }
            </button>
          }

          <div class="custom-divider" aria-hidden="true"></div>
          <p class="custom-heading">Custom range</p>
          <div class="custom-grid">
            <label class="custom-field">
              <span>Start date</span>
              <input
                type="date"
                [ngModel]="customStart()"
                (ngModelChange)="customStart.set($event)"
                [max]="customEnd() || undefined"
                aria-label="Start date"
              />
            </label>
            <label class="custom-field">
              <span>End date</span>
              <input
                type="date"
                [ngModel]="customEnd()"
                (ngModelChange)="customEnd.set($event)"
                [min]="customStart() || undefined"
                aria-label="End date"
              />
            </label>
          </div>
          @if (customError()) {
            <p class="custom-error" role="alert">{{ customError() }}</p>
          }
          <div class="custom-actions">
            <button type="button" class="custom-btn custom-btn--ghost" (click)="clearCustom()">
              Clear
            </button>
            <span class="custom-spacer"></span>
            <button type="button" class="custom-btn custom-btn--ghost" (click)="cancelCustom()">
              Cancel
            </button>
            <button
              type="button"
              class="custom-btn custom-btn--primary"
              (click)="applyCustom()"
              [disabled]="!canApplyCustom()"
            >
              Apply
            </button>
          </div>
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
      min-width: 264px;
      padding: 0.35rem 0 0.5rem;
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
    .custom-divider {
      height: 1px;
      background: #eef2f7;
      margin: 0.35rem 0 0.15rem;
    }
    .custom-heading {
      margin: 0;
      padding: 0.35rem 1rem 0.15rem;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .custom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      padding: 0.15rem 1rem 0.1rem;
    }
    .custom-field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 12px;
      font-weight: 500;
      color: #475569;

      input {
        font: inherit;
        color: #1e293b;
        background: #ffffff;
        border: 1px solid #dbe2eb;
        border-radius: 6px;
        padding: 0.35rem 0.5rem;
        min-width: 0;

        &:focus {
          outline: none;
          border-color: #0879ed;
        }
      }
    }
    .custom-error {
      margin: 0.25rem 1rem 0;
      font-size: 12px;
      font-weight: 500;
      color: #b42318;
    }
    .custom-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem 0.1rem;
    }
    @media (max-width: 480px) {
      .dropdown-menu {
        min-width: 0;
        width: max-content;
        max-width: calc(100vw - 32px);
      }
      .custom-grid {
        grid-template-columns: 1fr;
      }
    }
    .custom-spacer {
      flex: 1;
    }
    .custom-btn {
      font-size: 12.5px;
      font-weight: 600;
      border-radius: 6px;
      padding: 0.35rem 0.7rem;
      cursor: pointer;
      border: 1px solid #dbe2eb;
      background: #ffffff;
      color: #334155;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        border-color: #0879ed;
        color: #0879ed;
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    .custom-btn--primary {
      background: #2f6fed;
      border-color: #2f6fed;
      color: #ffffff;

      &:hover:not(:disabled) {
        background: #2459c4;
        border-color: #2459c4;
        color: #ffffff;
      }
    }
  `]
})
export class DateRangePickerComponent {
  /** Controlled display label (pages bind their shared range label). */
  @Input() value: string | null = null;
  /** Compat label emission (existing page handlers keep working). */
  @Output() rangeChange = new EventEmitter<string>();
  /** Full selection (label + ISO bounds) pages use to reload + export. */
  @Output() rangeSelect = new EventEmitter<DateRangeSelection>();

  selectedRange = signal<string>(DEFAULT_LABEL);
  isOpen = signal<boolean>(false);
  customStart = signal<string>(DEFAULT_START);
  customEnd = signal<string>(DEFAULT_END);

  presets = [
    'Today',
    'Last 7 Days',
    'Sep 1, 2024 - Sep 30, 2024',
    'Jan 1, 2024 - Sep 30, 2024',
    'Last 12 Months',
    'Year to Date'
  ];

  displayedRange(): string {
    return this.value ?? this.selectedRange();
  }

  customError(): string | null {
    const s = this.customStart();
    const e = this.customEnd();
    if (!s || !e) return 'Select both a start and an end date.';
    if (e < s) return 'End date cannot be before start date.';
    return null;
  }

  canApplyCustom(): boolean {
    return this.customError() === null;
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    if (!this.isOpen()) this.syncCustomInputs();
    this.isOpen.update(v => !v);
  }

  selectPreset(preset: string): void {
    this.selectedRange.set(preset);
    this.isOpen.set(false);
    this.rangeChange.emit(preset);
    const sel = selectionForLabel(preset);
    if (sel) this.rangeSelect.emit(sel);
  }

  applyCustom(): void {
    const sel = selectionForCustom(this.customStart(), this.customEnd());
    if (!sel) return;
    this.selectedRange.set(sel.label);
    this.isOpen.set(false);
    this.rangeChange.emit(sel.label);
    this.rangeSelect.emit(sel);
  }

  cancelCustom(): void {
    this.syncCustomInputs();
    this.isOpen.set(false);
  }

  clearCustom(): void {
    this.customStart.set(DEFAULT_START);
    this.customEnd.set(DEFAULT_END);
    this.selectedRange.set(DEFAULT_LABEL);
    this.isOpen.set(false);
    this.rangeChange.emit(DEFAULT_LABEL);
    this.rangeSelect.emit({
      label: DEFAULT_LABEL,
      startISO: DEFAULT_START,
      endISO: DEFAULT_END,
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.cancelCustom();
    }
  }

  /** Seed the calendar inputs from the currently displayed range. */
  private syncCustomInputs(): void {
    const sel = selectionForLabel(this.displayedRange());
    if (sel) {
      this.customStart.set(sel.startISO);
      this.customEnd.set(sel.endISO);
    }
  }
}
