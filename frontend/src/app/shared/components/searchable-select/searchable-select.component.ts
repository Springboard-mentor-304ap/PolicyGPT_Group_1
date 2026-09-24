import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div
      class="searchable-select"
      [class.is-open]="isOpen"
      [class.is-invalid]="isInvalid"
      [class.is-disabled]="disabled"
      [id]="id ? id + '-container' : null"
    >
      <!-- Trigger Box -->
      <div
        class="select-trigger"
        [tabindex]="disabled ? -1 : 0"
        (click)="toggleDropdown()"
        (keydown.enter)="$event.preventDefault(); toggleDropdown()"
        (keydown.space)="$event.preventDefault(); toggleDropdown()"
        [attr.aria-expanded]="isOpen"
        [attr.aria-disabled]="disabled"
        [id]="id || null"
        role="combobox"
        aria-haspopup="listbox"
      >
        @if (icon) {
          <span class="material-icons select-icon">{{ icon }}</span>
        }

        <span class="selected-text" [class.placeholder]="!value">
          {{ value || placeholder }}
        </span>

        <div class="trigger-actions">
          @if (clearable && value && !disabled) {
            <button
              type="button"
              class="btn-clear"
              (click)="clearSelection($event)"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <span class="material-icons">close</span>
            </button>
          }
          <span class="material-icons arrow-icon">
            {{ isOpen ? 'expand_less' : 'expand_more' }}
          </span>
        </div>
      </div>

      <!-- Dropdown Panel -->
      @if (isOpen) {
        <div class="dropdown-panel" (click)="$event.stopPropagation()">
          <!-- Search Input Box -->
          <div class="search-box">
            <span class="material-icons search-icon">search</span>
            <input
              #searchInput
              type="text"
              class="search-input"
              [placeholder]="searchPlaceholder"
              [value]="searchTerm"
              (input)="onSearchInput($event)"
              (keydown)="onSearchKeyDown($event)"
              autocomplete="off"
              spellcheck="false"
            />
            @if (searchTerm) {
              <button
                type="button"
                class="btn-clear-search"
                (click)="clearSearch($event)"
                title="Clear search text"
              >
                <span class="material-icons">close</span>
              </button>
            }
          </div>

          <!-- Options List -->
          <div class="options-list" role="listbox">
            @if (showAllOption) {
              <div
                class="option-item is-all-option"
                [class.is-selected]="!value"
                (click)="selectOption('')"
                role="option"
                [attr.aria-selected]="!value"
              >
                <span class="option-label">{{ allOptionLabel }}</span>
                @if (!value) {
                  <span class="material-icons check-icon">check</span>
                }
              </div>
            }
            @if (displayedOptions.length > 0) {
              @for (option of displayedOptions; track option; let i = $index) {
                <div
                  class="option-item"
                  [class.is-selected]="option === value"
                  [class.is-highlighted]="i === highlightedIndex"
                  (click)="selectOption(option)"
                  (mouseenter)="highlightedIndex = i"
                  role="option"
                  [attr.aria-selected]="option === value"
                >
                  <span class="option-label">{{ option }}</span>
                  @if (option === value) {
                    <span class="material-icons check-icon">check</span>
                  }
                </div>
              }
            } @else if (!showAllOption) {
              <div class="no-options">
                <span class="material-icons no-options-icon">search_off</span>
                <span>No matching options</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        position: relative;
      }

      :host(.is-open),
      :host(:has(.is-open)) {
        z-index: 1050;
      }

      .searchable-select {
        position: relative;
        width: 100%;
        box-sizing: border-box;
      }

      .select-trigger {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 46px;
        background: #ffffff;
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 14px;
        cursor: pointer;
        outline: none;
        transition: all 0.2s ease;
        box-sizing: border-box;
        user-select: none;
        gap: 8px;

        &:hover:not(.is-disabled) {
          border-color: #94a3b8;
        }

        &:focus-visible {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
        }
      }

      .searchable-select.is-open .select-trigger {
        border-color: #1d4ed8;
        box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
      }

      .searchable-select.is-invalid .select-trigger {
        border-color: #ef4444;
        background-color: #fef2f2;
      }

      .searchable-select.is-disabled .select-trigger {
        background-color: #f1f5f9;
        cursor: not-allowed;
        opacity: 0.75;
        border-color: #e2e8f0;
      }

      .select-icon {
        font-size: 20px;
        color: #64748b;
        flex-shrink: 0;
      }

      .selected-text {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        font-weight: 500;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;

        &.placeholder {
          color: #64748b;
          font-weight: 500;
        }
      }

      .trigger-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .btn-clear {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #94a3b8;
        transition: all 0.15s;

        .material-icons {
          font-size: 16px;
        }

        &:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
      }

      .arrow-icon {
        font-size: 20px;
        color: #64748b;
        transition: transform 0.2s ease;
      }

      /* DROPDOWN PANEL */
      .dropdown-panel {
        position: absolute;
        top: calc(100% + 5px);
        left: 0;
        right: 0;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.05);
        z-index: 1050;
        overflow: hidden;
        animation: selectDropdownFade 0.15s ease-out;
      }

      @keyframes selectDropdownFade {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* SEARCH BOX */
      .search-box {
        position: relative;
        padding: 8px 10px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
      }

      .search-icon {
        position: absolute;
        left: 18px;
        font-size: 18px;
        color: #94a3b8;
        pointer-events: none;
      }

      .search-input {
        width: 100%;
        height: 36px;
        padding: 0 28px 0 32px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        color: #0f172a;
        background: #ffffff;
        outline: none;
        transition: all 0.15s;
        box-sizing: border-box;

        &::placeholder {
          color: #94a3b8;
        }

        &:focus {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.1);
        }
      }

      .btn-clear-search {
        position: absolute;
        right: 18px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: center;

        .material-icons {
          font-size: 16px;
        }

        &:hover {
          color: #0f172a;
        }
      }

      /* OPTIONS LIST */
      .options-list {
        max-height: 240px;
        overflow-y: auto;
        padding: 4px 0;
        overscroll-behavior: contain;
      }

      .option-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 14px;
        font-size: 14px;
        color: #1e293b;
        cursor: pointer;
        transition: background 0.1s ease, color 0.1s ease;
        line-height: 1.4;

        .option-label {
          flex: 1;
          word-break: break-word;
        }

        .check-icon {
          font-size: 18px;
          color: #16a34a;
          flex-shrink: 0;
          margin-left: 8px;
        }

        &:hover,
        &.is-highlighted {
          background: #f1f5f9;
          color: #0f172a;
        }

        &.is-selected {
          background: #eff6ff;
          color: #1d4ed8;
          font-weight: 600;
        }
      }

      .no-options {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 24px 16px;
        color: #64748b;
        font-size: 13px;
        font-weight: 500;
        text-align: center;

        .no-options-icon {
          font-size: 26px;
          color: #94a3b8;
        }
      }
    `,
  ],
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() options: string[] = [];
  @Input() placeholder: string = 'Select an option';
  @Input() searchPlaceholder: string = 'Search or select...';
  @Input() icon?: string;
  @Input() isInvalid: boolean = false;
  @Input() disabled: boolean = false;
  @Input() clearable: boolean = true;
  @Input() id: string = '';
  @Input() allOptionLabel?: string;

  @Output() selectionChange = new EventEmitter<string>();

  @HostBinding('style.zIndex')
  get hostZIndex(): string | null {
    return this.isOpen ? '1050' : null;
  }

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  value: string = '';
  isOpen: boolean = false;
  searchTerm: string = '';
  highlightedIndex: number = -1;

  get showAllOption(): boolean {
    if (!this.allOptionLabel) {
      return false;
    }
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) {
      return true;
    }
    return this.allOptionLabel.toLowerCase().includes(term);
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly elementRef: ElementRef) {}

  writeValue(val: string | null): void {
    this.value = val || '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled && this.isOpen) {
      this.closeDropdown();
    }
  }

  get displayedOptions(): string[] {
    const list = [...this.options];

    // Ensure currently selected value (e.g. from existing edit mode) is represented in the list
    if (this.value && !list.includes(this.value)) {
      list.unshift(this.value);
    }

    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) {
      return list;
    }

    return list.filter((opt) => opt.toLowerCase().includes(term));
  }

  toggleDropdown(): void {
    if (this.disabled) {
      return;
    }

    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    if (this.disabled || this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.searchTerm = '';
    this.highlightedIndex = -1;

    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 0);
  }

  closeDropdown(): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.searchTerm = '';
    this.highlightedIndex = -1;
    this.onTouched();
  }

  selectOption(option: string): void {
    if (this.disabled) {
      return;
    }

    this.value = option;
    this.onChange(option);
    this.selectionChange.emit(option);
    this.closeDropdown();
  }

  clearSelection(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (this.disabled) {
      return;
    }

    this.value = '';
    this.onChange('');
    this.selectionChange.emit('');
    this.onTouched();
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
    this.highlightedIndex = 0;
  }

  clearSearch(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.searchTerm = '';
    this.highlightedIndex = -1;
    this.searchInput?.nativeElement?.focus();
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    const opts = this.displayedOptions;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (opts.length > 0) {
          this.highlightedIndex = (this.highlightedIndex + 1) % opts.length;
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (opts.length > 0) {
          this.highlightedIndex =
            this.highlightedIndex <= 0 ? opts.length - 1 : this.highlightedIndex - 1;
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < opts.length) {
          this.selectOption(opts[this.highlightedIndex]);
        } else if (opts.length === 1) {
          this.selectOption(opts[0]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.closeDropdown();
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }

    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closeDropdown();
    }
  }
}
