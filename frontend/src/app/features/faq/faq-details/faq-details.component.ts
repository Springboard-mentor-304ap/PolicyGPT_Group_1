import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subject, finalize, takeUntil } from "rxjs";

import { FaqService } from "../../../core/services/faq.service";
import { FAQ } from "../../../core/models/faq.model";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

/**
 * Public FAQ details page (guests included).
 *
 * Shared across roles: the role prefix is derived from the URL, mirroring
 * ProfileComponent. Only published FAQs resolve (backend filters drafts).
 */
@Component({
  selector: "app-faq-details",
  standalone: true,
  imports: [CommonModule, RouterLink, BreadcrumbComponent],
  template: `
    <div class="faq-page">
      <app-breadcrumb
        *ngIf="breadcrumbItems.length > 0"
        [items]="breadcrumbItems"
      ></app-breadcrumb>

      @if (loading) {
        <div class="faq-state" aria-busy="true">
          <span class="faq-spinner" aria-hidden="true"></span>
          <span>Loading answer...</span>
        </div>
      } @else if (errorMessage) {
        <div class="faq-state faq-state--error" role="alert">
          <span class="material-icons" aria-hidden="true">error_outline</span>
          <span>{{ errorMessage }}</span>
          <button type="button" class="faq-retry" (click)="load()">
            Try Again
          </button>
        </div>
      } @else if (faq) {
        <article class="faq-card" aria-labelledby="faq-question">
          <div class="faq-badges">
            <span class="faq-category">{{ faq.category || "General" }}</span>
          </div>
          <h1 id="faq-question">{{ faq.question }}</h1>
          <p class="faq-answer">{{ faq.answer }}</p>
          <div class="faq-actions">
            <a class="link-action" [routerLink]="faqsRoute">Back to FAQs</a>
          </div>
        </article>
      }
    </div>
  `,
  styles: [
    `
      .faq-page {
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }
      .faq-card {
        background: #fff;
        border: 1px solid #e4e9f1;
        border-radius: 14px;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        padding: 20px 22px;
        min-width: 0;
      }
      .faq-badges {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }
      .faq-category {
        font-size: 11.5px;
        font-weight: 700;
        border-radius: 6px;
        padding: 3px 9px;
        background: #eef2f7;
        color: #334155;
      }
      .faq-card h1 {
        margin: 0 0 12px;
        font-size: 22px;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.01em;
        overflow-wrap: anywhere;
      }
      .faq-answer {
        margin: 0 0 16px;
        font-size: 14.5px;
        line-height: 1.65;
        color: #1e293b;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .faq-actions {
        display: flex;
        gap: 12px;
      }
      .link-action {
        color: #2457d6;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }
      .link-action:hover {
        text-decoration: underline;
      }
      .faq-state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 34px 18px;
        background: #fff;
        border: 1px solid #e4e9f1;
        border-radius: 16px;
        color: #64748b;
        font-size: 13px;
      }
      .faq-state--error {
        color: #b91c1c;
      }
      .faq-retry {
        border: 1px solid #2457d6;
        background: #2457d6;
        color: #fff;
        border-radius: 8px;
        padding: 8px 16px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .faq-spinner {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(36, 87, 214, 0.25);
        border-top-color: #2457d6;
        animation: faq-spin 0.7s linear infinite;
      }
      @keyframes faq-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (max-width: 640px) {
        .faq-card {
          padding: 18px 16px;
        }
        .faq-card h1 {
          font-size: 19px;
        }
      }
    `,
  ],
})
export class FaqDetailsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly faqService = inject(FaqService);

  faqId = 0;
  faq: FAQ | null = null;
  loading = true;
  errorMessage: string | null = null;

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get("id");
    this.faqId = raw !== null ? Number(raw) : NaN;
    if (!Number.isFinite(this.faqId)) {
      this.loading = false;
      this.errorMessage = "Invalid FAQ reference.";
      return;
    }
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    const trail: BreadcrumbItem[] = [];
    if (prefix) {
      trail.push(
        { label: "Home", route: ["/dashboard", prefix] },
        { label: "FAQs", route: ["/dashboard", prefix, "faqs"] },
      );
    } else {
      trail.push({ label: "FAQs", route: ["/faqs"] });
    }
    trail.push({ label: this.faq?.question ?? "FAQ Details" });
    return trail;
  }

  get faqsRoute(): string[] {
    const prefix = this.dashboardPrefix();
    return prefix ? ["/dashboard", prefix, "faqs"] : ["/faqs"];
  }

  private dashboardPrefix(): string | null {
    const url = this.router.url || "";
    const match = /\/dashboard\/([^/]+)/.exec(url);
    if (!match) {
      return null;
    }
    switch (match[1].toLowerCase()) {
      case "admin":
      case "citizen":
      case "government":
      case "researcher":
      case "organization":
      case "guest":
        return match[1].toLowerCase();
      default:
        return null;
    }
  }

  load(): void {
    this.loading = true;
    this.errorMessage = null;
    this.faqService
      .getFaq(this.faqId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (faq) => (this.faq = faq),
        error: () =>
          (this.errorMessage =
            "This answer is unavailable. It may have been unpublished."),
      });
  }
}
