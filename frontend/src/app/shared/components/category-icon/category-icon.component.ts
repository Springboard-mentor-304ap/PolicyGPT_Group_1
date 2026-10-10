import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

import {
  CategoryInput,
  getCategoryIcon,
} from "../../../core/utils/category-icon.util";

/**
 * Reusable category icon for policies and schemes.
 *
 * Renders a consistently sized, aligned, rounded icon container whose
 * glyph and colors derive from the centralized category mapping
 * (`core/utils/category-icon.util`). Use everywhere a policy or scheme
 * is displayed instead of hardcoding icons per page.
 *
 * Bookmark/save affordances stay separate: this component never renders
 * bookmark state (saved-state bookmark icons remain blue elsewhere).
 */
@Component({
  selector: "app-category-icon",
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="category-icon category-icon--{{ resolved.tone }}"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.background-color]="resolved.background"
      [style.color]="resolved.color"
      [style.border-color]="resolved.border"
      [style.font-size.px]="iconSize"
      role="img"
      [attr.aria-label]="(label || 'Category') + ' icon'"
    >
      <span class="material-icons" aria-hidden="true">{{ resolved.icon }}</span>
    </span>
  `,
  styles: [
    `
      .category-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 12px;
        border: 1px solid transparent;
        line-height: 1;
      }
      .category-icon .material-icons {
        font-size: inherit;
        line-height: 1;
      }
    `,
  ],
})
export class CategoryIconComponent {
  /** Policy/scheme category as a string or `{ category }`-shaped object. */
  @Input() category: CategoryInput;

  /** Container box size in px (glyph scales proportionally). */
  @Input() size = 44;

  /** Accessible label override; defaults to "Category". */
  @Input() label = "Category";

  get resolved() {
    return getCategoryIcon(this.category);
  }

  get iconSize(): number {
    return Math.round(this.size * 0.52);
  }
}
