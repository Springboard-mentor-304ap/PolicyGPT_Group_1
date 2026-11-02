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
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from "@angular/forms";

export interface PgDropdownOption {
  value: string;
  label: string;
}

export type PgDropdownOptionsInput = Array<string | PgDropdownOption>;

/**
 * PolicyGPT global dropdown / select.
 *
 * Canonical white-card dropdown used for filters and forms:
 * white menu, navy text, grey-blue border, 8-12px radius,
 * blue focus ring, light-blue hover/selected, shadowed menu,
 * custom chevron, searchable variant, keyboard + screen-reader support.
 *
 * Backwards compatible: `options` accepts `string[]` (existing callers)
 * or `{ value, label }[]` (value/label separation for filters).
 */
@Component({
  selector: "app-searchable-select",
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
      [class.is-filter]="size === 'filter'"
      [class.is-compact]="size === 'compact'"
      [id]="id ? id + '-container' : null"
    >
      <!-- Trigger Box -->
      <div
        class="select-trigger"
        [tabindex]="disabled ? -1 : 0"
        (click)="toggleDropdown()"
        (keydown.enter)="$event.preventDefault(); toggleDropdown()"
        (keydown.space)="$event.preventDefault(); toggleDropdown()"
        (keydown.arrowdown)="$event.preventDefault(); openDropdown()"
        (keydown.escape)="$event.preventDefault(); closeDropdown()"
        [attr.aria-expanded]="isOpen"
        [attr.aria-disabled]="disabled"
        [attr.aria-label]="ariaLabel || placeholder"
        [id]="id || null"
        role="combobox"
        aria-haspopup="listbox"
      >
        @if (icon) {
          <span class="material-icons select-icon" aria-hidden="true">{{
            icon
          }}</span>
        }

        <span class="selected-text" [class.placeholder]="!hasValue()">
          {{ displayLabel() }}
        </span>

        <div class="trigger-actions">
          @if (clearable && hasValue() && !disabled) {
            <button
              type="button"
              class="btn-clear"
              (click)="clearSelection($event)"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <span class="material-icons" aria-hidden="true">close</span>
            </button>
          }
          <span class="material-icons arrow-icon" aria-hidden="true">
            {{ isOpen ? "expand_less" : "expand_more" }}
          </span>
        </div>
      </div>

      <!-- Dropdown Panel -->
      @if (isOpen) {
        <div class="dropdown-panel" (click)="$event.stopPropagation()">
          <!-- Search Input Box (only for searchable lists) -->
          @if (searchable) {
            <div class="search-box">
              <span class="material-icons search-icon" aria-hidden="true"
                >search</span
              >
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
                aria-label="Search options"
              />
              @if (searchTerm) {
                <button
                  type="button"
                  class="btn-clear-search"
                  (click)="clearSearch($event)"
                  title="Clear search text"
                  aria-label="Clear search text"
                >
                  <span class="material-icons" aria-hidden="true">close</span>
                </button>
              }
            </div>
          }

          <!-- Options List -->
          <div
            class="options-list"
            role="listbox"
            [tabindex]="searchable ? -1 : 0"
            (keydown)="onListKeyDown($event)"
            #optionsList
          >
            @if (loading) {
              <div class="dropdown-state" role="status">
                <span class="state-spinner" aria-hidden="true"></span>
                <span>{{ loadingText }}</span>
              </div>
            } @else if (errorText) {
              <div class="dropdown-state is-error" role="alert">
                <span class="material-icons state-icon" aria-hidden="true"
                  >error_outline</span
                >
                <span>{{ errorText }}</span>
              </div>
            } @else {
              @if (showAllOption) {
                <div
                  class="option-item is-all-option"
                  [class.is-selected]="!hasValue()"
                  (click)="selectOption('')"
                  (mouseenter)="highlightedIndex = -2"
                  role="option"
                  [attr.aria-selected]="!hasValue()"
                >
                  <span class="option-label">{{ allOptionLabel }}</span>
                  @if (!hasValue()) {
                    <span class="material-icons check-icon" aria-hidden="true"
                      >check</span
                    >
                  }
                </div>
              }
              @if (displayedOptions.length > 0) {
                @for (
                  option of displayedOptions;
                  track option.value;
                  let i = $index
                ) {
                  <div
                    class="option-item"
                    [class.is-selected]="option.value === value"
                    [class.is-highlighted]="i === highlightedIndex"
                    (click)="selectOption(option.value)"
                    (mouseenter)="highlightedIndex = i"
                    role="option"
                    [attr.aria-selected]="option.value === value"
                  >
                    <span class="option-label">{{ option.label }}</span>
                    @if (option.value === value) {
                      <span class="material-icons check-icon" aria-hidden="true"
                        >check</span
                      >
                    }
                  </div>
                }
              }
              @if (customCandidate) {
                <div
                  class="option-item is-custom-option"
                  (click)="selectOption(customCandidate)"
                  (mouseenter)="highlightedIndex = displayedOptions.length"
                  role="option"
                  [attr.aria-selected]="false"
                >
                  <span class="option-label"
                    >{{ customText }}: “{{ customCandidate }}”</span
                  >
                  <span class="material-icons check-icon" aria-hidden="true"
                    >add</span
                  >
                </div>
              }
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
        color-scheme: light;
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
        padding: 0 10px;
        cursor: pointer;
        outline: none;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          background 0.15s ease;
        box-sizing: border-box;
        user-select: none;
        gap: 4px;
        color: #0f172a;

        &:hover {
          border-color: #94a3b8;
        }

        &:focus-visible {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
        }
      }

      /* Filter-size trigger matches .filter-select control height. */
      .searchable-select.is-filter .select-trigger,
      .searchable-select.is-compact .select-trigger {
        min-height: 38px;
        padding: 0 10px 0 12px;
        border-width: 1px;
        border-color: #dbe2eb;
        border-radius: 8px;
        background: #ffffff;
        font-size: 13px;

        &:hover {
          border-color: #0879ed;
        }
      }

      .searchable-select.is-filter .selected-text,
      .searchable-select.is-compact .selected-text {
        font-size: 13px;
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
        font-size: 13px;
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

        &:focus-visible {
          outline: 2px solid #1d4ed8;
          outline-offset: 1px;
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
        box-shadow:
          0 10px 25px rgba(15, 23, 42, 0.12),
          0 4px 6px -2px rgba(15, 23, 42, 0.05);
        z-index: 1050;
        overflow: hidden;
        animation: selectDropdownFade 0.15s ease-out;
        color-scheme: light;
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
        outline: none;
      }

      .option-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 14px;
        font-size: 13px;
        color: #1e293b;
        cursor: pointer;
        transition:
          background 0.1s ease,
          color 0.1s ease;
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

        &.is-custom-option .option-label {
          color: #1d4ed8;
          font-style: italic;
        }

        &:focus-visible {
          outline: 2px solid #1d4ed8;
          outline-offset: -2px;
        }
      }

      .is-filter .option-item,
      .is-compact .option-item {
        font-size: 13px;
        padding: 8px 12px;
      }

      .dropdown-state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px 16px;
        color: #64748b;
        font-size: 13px;
        font-weight: 500;

        &.is-error {
          color: #b42318;
        }

        .state-icon {
          font-size: 20px;
        }

        .state-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #cbd5e1;
          border-top-color: #1d4ed8;
          border-radius: 50%;
          animation: pgSelectSpin 0.8s linear infinite;
        }
      }

      @keyframes pgSelectSpin {
        to {
          transform: rotate(360deg);
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
  @Input() options: PgDropdownOptionsInput = [];
  @Input() placeholder: string = "Select an option";
  @Input() searchPlaceholder: string = "Search or select...";
  @Input() icon?: string;
  @Input() isInvalid: boolean = false;
  @Input() disabled: boolean = false;
  @Input() clearable: boolean = true;
  @Input() id: string = "";
  @Input() allOptionLabel?: string;
  /** Set false for small fixed lists (status, priority) to keep a compact menu. */
  @Input() searchable: boolean = true;
  /**
   * Allow entering a custom value not present in `options` ("Use ..."
   * row). Off by default so existing callers keep strict selection.
   * The raw string is emitted through the normal ControlValueAccessor
   * flow; backends accepting plain strings receive it directly.
   */
  @Input() allowCustom: boolean = false;
  /** Label prefix for the custom-value row. */
  @Input() customText: string = "Use custom value";
  /** 'default' (46px form control) or 'filter'/'compact' (38px filter control). */
  @Input() size: "default" | "filter" | "compact" = "default";
  @Input() loading: boolean = false;
  @Input() loadingText: string = "Loading options...";
  @Input() errorText: string = "";
  @Input() emptyText: string = "No matching options";
  @Input() ariaLabel: string = "";

  @Output() selectionChange = new EventEmitter<string>();

  @HostBinding("style.zIndex")
  get hostZIndex(): string | null {
    return this.isOpen ? "1050" : null;
  }

  @ViewChild("searchInput") searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild("optionsList") optionsList?: ElementRef<HTMLElement>;

  value: string = "";
  isOpen: boolean = false;
  searchTerm: string = "";
  highlightedIndex: number = -1;

  /** Normalized value/label pairs (backwards compatible with string[]). */
  get normalizedOptions(): PgDropdownOption[] {
    return (this.options ?? []).map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt,
    );
  }

  get showAllOption(): boolean {
    if (!this.allOptionLabel) {
      return false;
    }
    const term = (this.searchTerm || "").trim().toLowerCase();
    if (!term) {
      return true;
    }
    return this.allOptionLabel.toLowerCase().includes(term);
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly elementRef = inject(ElementRef);

  hasValue(): boolean {
    return this.value !== "" && this.value !== null && this.value !== undefined;
  }

  displayLabel(): string {
    if (!this.hasValue()) {
      return this.placeholder;
    }
    const found = this.normalizedOptions.find((o) => o.value === this.value);
    return found ? found.label : this.value || this.placeholder;
  }

  writeValue(val: string | null): void {
    this.value = val ?? "";
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

  get displayedOptions(): PgDropdownOption[] {
    const list = [...this.normalizedOptions];

    // Ensure currently selected value (e.g. from existing edit mode) is represented in the list
    if (this.hasValue() && !list.some((o) => o.value === this.value)) {
      list.unshift({ value: this.value, label: this.value });
    }

    const term = (this.searchTerm || "").trim().toLowerCase();
    if (!term || !this.searchable) {
      return list;
    }

    return list.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term),
    );
  }

  /**
   * Trimmed search text eligible as a custom value: non-empty with no
   * case-insensitive exact match among the options (avoids near-duplicate
   * variants of an existing option). Null when custom entry is off.
   */
  get customCandidate(): string | null {
    if (!this.allowCustom || this.disabled) return null;
    const term = (this.searchTerm || "").trim();
    if (!term) return null;
    const lower = term.toLowerCase();
    const exact = this.normalizedOptions.some(
      (o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower,
    );
    return exact ? null : term;
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
    this.searchTerm = "";
    this.highlightedIndex = this.searchable ? -1 : this.currentIndex();

    setTimeout(() => {
      if (this.searchable) {
        this.searchInput?.nativeElement?.focus();
      } else {
        this.optionsList?.nativeElement?.focus();
        this.scrollHighlightedIntoView();
      }
    }, 0);
  }

  closeDropdown(focusTrigger = false): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.searchTerm = "";
    this.highlightedIndex = -1;
    this.onTouched();
    if (focusTrigger) {
      const trigger = this.elementRef.nativeElement.querySelector(
        ".select-trigger",
      ) as HTMLElement | null;
      trigger?.focus();
    }
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

    this.value = "";
    this.onChange("");
    this.selectionChange.emit("");
    this.onTouched();
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
    this.highlightedIndex = this.displayedOptions.length > 0 ? 0 : -1;
  }

  clearSearch(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.searchTerm = "";
    this.highlightedIndex = -1;
    this.searchInput?.nativeElement?.focus();
  }

  private currentIndex(): number {
    return this.displayedOptions.findIndex((o) => o.value === this.value);
  }

  private scrollHighlightedIntoView(): void {
    setTimeout(() => {
      const list = this.optionsList?.nativeElement;
      const el = list?.querySelector(
        ".option-item.is-highlighted",
      ) as HTMLElement | null;
      el?.scrollIntoView({ block: "nearest" });
    }, 0);
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    this.handleOptionKey(event);
  }

  onListKeyDown(event: KeyboardEvent): void {
    this.handleOptionKey(event);
  }

  private handleOptionKey(event: KeyboardEvent): void {
    const opts = this.displayedOptions;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (opts.length > 0) {
          this.highlightedIndex = (this.highlightedIndex + 1) % opts.length;
          this.scrollHighlightedIntoView();
        }
        break;

      case "ArrowUp":
        event.preventDefault();
        if (opts.length > 0) {
          this.highlightedIndex =
            this.highlightedIndex <= 0
              ? opts.length - 1
              : this.highlightedIndex - 1;
          this.scrollHighlightedIntoView();
        }
        break;

      case "Enter":
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < opts.length) {
          this.selectOption(opts[this.highlightedIndex].value);
        } else if (opts.length === 1) {
          this.selectOption(opts[0].value);
        } else if (this.customCandidate) {
          // Keyboard path for the custom-value row.
          this.selectOption(this.customCandidate);
        }
        break;

      case "Escape":
        event.preventDefault();
        this.closeDropdown(true);
        break;

      case "Tab":
        this.closeDropdown();
        break;
    }
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }

    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closeDropdown();
    }
  }

  @HostListener("document:keydown.escape")
  onDocumentEscape(): void {
    if (this.isOpen) {
      this.closeDropdown();
    }
  }
}
