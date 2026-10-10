import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

export interface BreadcrumbItem {
  label: string;
  /** Absolute router commands, e.g. ['/dashboard', 'citizen']. Omit for plain text. */
  route?: string[] | string;
}

/**
 * Shared PolicyGPT breadcrumb.
 *
 * Visual language matches the Notifications breadcrumb:
 * subtle 13px trail above the page title, blue semibold links,
 * chevron separators, dark current page with ellipsis.
 *
 * Usage:
 *   <app-breadcrumb [items]="breadcrumbItems"></app-breadcrumb>
 *
 * Hosts build role-aware items, e.g.
 * [{ label: 'Home', route: ['/dashboard', rolePrefix] }, { label: 'Saved Items' }]
 */
@Component({
  selector: "app-breadcrumb",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="pg-breadcrumb" aria-label="Breadcrumb">
      @for (item of items; track item.label; let last = $last) {
        @if (!last && item.route) {
          <a class="pg-breadcrumb__link" [routerLink]="item.route">{{
            item.label
          }}</a>
        } @else if (!last) {
          <span class="pg-breadcrumb__text">{{ item.label }}</span>
        } @else {
          <span class="pg-breadcrumb__current">{{ item.label }}</span>
        }
        @if (!last) {
          <span
            class="material-icons pg-breadcrumb__separator"
            aria-hidden="true"
            >chevron_right</span
          >
        }
      }
    </nav>
  `,
  styles: [
    `
      .pg-breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 16px;
        font-size: 13px;
        font-weight: 500;
        color: #64748b;
      }

      .pg-breadcrumb__link {
        background: transparent;
        border: 0;
        padding: 0;
        color: #0879ed;
        font-size: inherit;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        white-space: nowrap;
      }

      .pg-breadcrumb__link:hover {
        text-decoration: underline;
      }

      .pg-breadcrumb__text {
        color: #64748b;
        white-space: nowrap;
      }

      .pg-breadcrumb__separator {
        font-size: 13px;
        color: #94a3b8;
        user-select: none;
      }

      .pg-breadcrumb__current {
        color: #111827;
        font-weight: 600;
        max-width: 400px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class BreadcrumbComponent {
  @Input() items: BreadcrumbItem[] = [];
}
