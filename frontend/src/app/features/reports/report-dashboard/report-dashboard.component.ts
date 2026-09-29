import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { ReportService } from '../../../core/services/report.service';
import {
  ReportFormat,
  ReportType,
  ReportTypesResponse,
} from '../../../core/models/report.model';

import {
  REPORT_CATEGORIES,
  REPORT_TYPE_META,
  ReportCategory,
  detailLabel as catalogDetailLabel,
} from '../report-catalog';

interface CategoryPanel {
  def: ReportCategory;
  rows: { type: ReportType; details: string[] }[];
}

interface OverviewCard {
  label: string;
  value: number | null;
  sub: string;
  icon: string;
  color: 'blue' | 'orange' | 'green' | 'purple';
}

@Component({
  selector: 'app-report-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrl: '../reports-shared.scss',
  template: `
    <div class="reports-page">
      <header class="page-header">
        <div class="header-content">
          <div class="header-main">
            <h1>Reports &amp; Export</h1>
            <p>Generate, download and review role-scoped official reports.</p>
          </div>
          <a class="back-button" routerLink="..">
            <span class="material-icons back-icon" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </a>
        </div>
      </header>

      @if (loading()) {
        <div class="skeleton-list" aria-label="Loading reports overview">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-card" aria-hidden="true">
              <div class="skeleton skeleton-icon"></div>
              <div class="skeleton-body">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-line"></div>
              </div>
            </div>
          }
        </div>
      } @else if (error) {
        <section class="state-card error-state">
          <div class="state-icon">
            <span class="material-icons" aria-hidden="true">error_outline</span>
          </div>
          <h2>Unable to Load Reports</h2>
          <p>{{ error }}</p>
          <button type="button" class="retry-button" (click)="reload()">
            Try Again
          </button>
        </section>
      } @else if (panels.length === 0) {
        <section class="empty-state">
          <div class="empty-icon">
            <span class="material-icons" aria-hidden="true">
              description
            </span>
          </div>
          <h2>No Reports Available</h2>
          <p>No report categories are available for your role.</p>
        </section>
      } @else {
        <section class="stats-grid" aria-label="Reports overview">
          @for (card of overviewCards; track card.label) {
            <article class="stat-card">
              <div class="stat-icon stat-icon--{{ card.color }}">
                <span class="material-icons" aria-hidden="true">
                  {{ card.icon }}
                </span>
              </div>
              <div>
                <p class="stat-value">{{ card.value ?? 0 }}</p>
                <p class="stat-label">{{ card.label }}</p>
              </div>
            </article>
          }
        </section>

        @for (panel of panels; track panel.def.key) {
          <section class="category-panel">
            <h2>{{ panel.def.title }}</h2>
            <p>{{ panel.def.description }}</p>
            <div class="card-list">
              @for (row of panel.rows; track row.type) {
                <article class="portal-card">
                  <div class="card-icon" aria-hidden="true">
                    <span class="material-icons">{{ panel.def.icon }}</span>
                  </div>
                  <div class="card-content">
                    <div class="card-title-row">
                      <h3>{{ typeTitle(row.type) }}</h3>
                    </div>
                    <p class="card-sub">{{ typeDescription(row.type) }}</p>
                    <div class="metadata">
                      @for (detail of row.details; track detail) {
                        <a
                          class="metadata-item"
                          [routerLink]="['generate']"
                          [queryParams]="{ type: row.type, detail: detail }"
                        >
                          {{ detailLabel(detail) }}
                        </a>
                      }
                      <span class="metadata-item">PDF</span>
                      <span class="metadata-item">Excel</span>
                    </div>
                  </div>
                  <div class="card-actions">
                    <a
                      class="btn-secondary"
                      [routerLink]="['generate']"
                      [queryParams]="{ type: row.type }"
                    >
                      Generate
                    </a>
                  </div>
                </article>
              }
            </div>
          </section>
        }

        <section class="results-section">
          <div class="results-header">
            <div>
              <h2>Report History</h2>
              <p>Review previously generated reports.</p>
            </div>
            <a class="btn-secondary" routerLink="history">View History</a>
          </div>
        </section>
      }
    </div>
  `,
})
export class ReportDashboardComponent implements OnInit {
  private readonly reports = inject(ReportService);

  panels: CategoryPanel[] = [];
  overviewCards: OverviewCard[] = [];
  readonly loading = signal(true);
  error: string | null = null;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error = null;
    // finalize guarantees the loading state always resolves, even if the
    // request hangs; timeout converts a hung request into an error state.
    // loading is a signal so the template tracks it reactively.
    this.reports
      .getTypes()
      .pipe(
        timeout(30000),
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: (res: ReportTypesResponse) => {
          const allowed = new Set(res?.report_types ?? []);
          const details = res?.details ?? {};
          this.panels = REPORT_CATEGORIES.map((def) => ({
            def,
            rows: def.types
              .filter((type) => allowed.has(type))
              .map((type) => ({ type, details: details[type] ?? ['overview'] })),
          })).filter((panel) => panel.rows.length > 0);
          this.overviewCards = this.buildOverviewCards(res?.overview ?? null);
        },
        error: () => {
          this.error =
            'Could not load reports. Check your connection and retry.';
        },
      });
  }

  typeTitle(type: ReportType): string {
    return REPORT_TYPE_META[type]?.title ?? type;
  }

  typeDescription(type: ReportType): string {
    return REPORT_TYPE_META[type]?.description ?? 'Official report export.';
  }

  detailLabel(detail: string): string {
    return catalogDetailLabel(detail);
  }

  private buildOverviewCards(
    overview: ReportTypesResponse['overview'],
  ): OverviewCard[] {
    if (!overview) {
      return [];
    }
    const cards: OverviewCard[] = [];
    if (overview.users !== undefined) {
      cards.push({
        label: 'Users',
        value: overview.users,
        sub: 'Registered users',
        icon: 'group',
        color: 'blue',
      });
    }
    cards.push(
      {
        label: 'Policies',
        value: overview.policies ?? 0,
        sub: 'Total policies',
        icon: 'policy',
        color: 'orange',
      },
      {
        label: 'Schemes',
        value: overview.schemes ?? 0,
        sub: 'Total schemes',
        icon: 'account_balance',
        color: 'green',
      },
      {
        label: 'Ministries',
        value: overview.ministries ?? 0,
        sub: 'Distinct ministries',
        icon: 'domain',
        color: 'purple',
      },
      {
        label: 'Departments',
        value: overview.departments ?? 0,
        sub: 'Distinct departments',
        icon: 'corporate_fare',
        color: 'blue',
      },
    );
    if (overview.users !== undefined) {
      cards.push({
        label: 'Activity',
        value: overview.activity ?? 0,
        sub: 'Audit events in scope',
        icon: 'history',
        color: 'orange',
      });
    }
    return cards;
  }
}
