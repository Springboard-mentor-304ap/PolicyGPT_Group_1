import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { PolicyResponse } from '../../../core/models/policy.model';
import type { SchemeResponse } from '../../../core/models/scheme.model';

export interface GlobalSearchFlatItem {
  kind: 'policy' | 'scheme';
  id: number;
  title: string;
  description: string;
  meta: string;
}

@Component({
  selector: 'app-global-search-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-search-dropdown.component.html',
  styleUrls: ['./global-search-dropdown.component.scss'],
})
export class GlobalSearchDropdownComponent {
  @Input() query = '';
  @Input() policies: PolicyResponse[] = [];
  @Input() schemes: SchemeResponse[] = [];
  @Input() totalPolicies = 0;
  @Input() totalSchemes = 0;
  @Input() loading = false;
  @Input() error: string | null = null;
  /** Flattened active index for keyboard nav (-1 = none). */
  @Input() activeIndex = -1;

  @Output() selectPolicy = new EventEmitter<PolicyResponse>();
  @Output() selectScheme = new EventEmitter<SchemeResponse>();
  @Output() viewAllPolicies = new EventEmitter<void>();
  @Output() viewAllSchemes = new EventEmitter<void>();

  get hasResults(): boolean {
    return (this.policies?.length ?? 0) + (this.schemes?.length ?? 0) > 0;
  }

  get showEmpty(): boolean {
    return !this.loading && !this.error && !this.hasResults;
  }

  policyTitle(p: PolicyResponse): string {
    return String(p?.title ?? '').trim() || 'Untitled policy';
  }

  schemeTitle(s: SchemeResponse): string {
    const name = String((s as { name?: unknown })?.name ?? '').trim();
    if (name) return name;
    const title = String((s as { title?: unknown })?.title ?? '').trim();
    return title || 'Untitled scheme';
  }

  shortDescription(text: string | null | undefined, max = 96): string {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'No description available.';
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
  }

  metaForPolicy(p: PolicyResponse): string {
    const parts = [p?.category, p?.department || p?.ministry].filter(
      (v) => String(v ?? '').trim(),
    ) as string[];
    return parts.slice(0, 2).join(' · ');
  }

  metaForScheme(s: SchemeResponse): string {
    const parts = [s?.category, s?.department || s?.ministry].filter(
      (v) => String(v ?? '').trim(),
    ) as string[];
    return parts.slice(0, 2).join(' · ');
  }

  /** Flattened order: policies first, then schemes (matches template). */
  flatIndex(kind: 'policy' | 'scheme', idx: number): number {
    return kind === 'policy' ? idx : (this.policies?.length ?? 0) + idx;
  }

  isActive(kind: 'policy' | 'scheme', idx: number): boolean {
    return this.activeIndex === this.flatIndex(kind, idx);
  }

  /** Escape HTML then wrap query tokens in <mark>. */
  highlight(text: string): string {
    const safe = String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const q = String(this.query ?? '').replace(/\s+/g, ' ').trim();
    if (!q) return safe;
    const tokens = q.split(' ').filter((t) => t.length >= 2);
    const terms = tokens.length > 0 ? tokens : [q];
    let out = safe;
    for (const term of terms) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        out = out.replace(
          new RegExp(`(${esc})`, 'gi'),
          '<mark class="gs-mark">$1</mark>',
        );
      } catch {
        // ignore invalid patterns
      }
    }
    return out;
  }
}
