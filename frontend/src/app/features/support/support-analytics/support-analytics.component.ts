import { Component, OnDestroy, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { Subject, finalize, forkJoin, of, takeUntil } from "rxjs";
import { catchError } from "rxjs/operators";

import { SupportService } from "../../../core/services/support.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import {
  AdminSupportRequest,
  SupportAnalytics,
} from "../../../core/models/support.model";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  DateRangePickerComponent,
  type DateRangeSelection,
} from "../../analytics/shared/date-range-picker/date-range-picker.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../analytics/shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../analytics/shared/doughnut-chart/doughnut-chart.component";
import { HbarChartComponent } from "../../analytics/shared/hbar-chart/hbar-chart.component";
import { AnalyticsDateRangeService } from "../../analytics/shared/analytics-date-range.service";
import { AdminAnalyticsDataService } from "../../analytics/admin/services/admin-analytics-data.service";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#2f6fed",
  IN_PROGRESS: "#f5a524",
  WAITING_FOR_USER: "#8b5cf6",
  RESOLVED: "#3cb371",
  CLOSED: "#94a3b8",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_USER: "Waiting for User",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_ORDER = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
];

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#e5484d",
  HIGH: "#f5a524",
  MEDIUM: "#2f6fed",
  LOW: "#94a3b8",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface SupportActivityItem {
  id: number;
  ticket: string;
  subject: string;
  action: string;
  icon: string;
  time: string;
  status: string;
}

export interface SupportUpdateItem {
  id: number;
  ticket: string;
  subject: string;
  category: string;
  status: string;
  time: string;
}

/**
 * Admin-only support analytics dashboard.
 *
 * Mirrors the Admin Analytics Dashboard visual system (KPI cards,
 * chart cards, activity tables, date-range filter). Every number is
 * derived from live backend data: aggregates from
 * GET /support/admin/analytics (ADMIN RBAC enforced server-side)
 * plus per-ticket detail from GET /support/admin/requests for the
 * trend, resolution extremes and activity feeds. Unavailable metrics
 * render as 0 / —, never fabricated.
 */
@Component({
  selector: "app-support-analytics",
  standalone: true,
  imports: [
    CommonModule,
    BreadcrumbComponent,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    HbarChartComponent,
  ],
  template: `
    <div class="admin-analytics-page" [attr.aria-busy]="loading()">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a routerLink="/dashboard/admin" class="breadcrumb-link">Dashboard</a>
        <span class="chevron" aria-hidden="true">&gt;</span>
        <span class="current" aria-current="page">Support Analytics</span>
      </nav>

      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">Support Analytics</h1>
          <p class="page-subtitle">
            Ticket volume, resolution performance and support activity
          </p>
        </div>
        <div class="header-right">
          <app-date-range-picker
            [value]="currentRange()"
            (rangeChange)="onDateRangeChange($event)"
            (rangeSelect)="onDateRangeSelect($event)"
          />
          <button
            type="button"
            class="btn-download"
            (click)="downloadReport()"
            [disabled]="isDownloading()"
            aria-label="Download Support Analytics Report"
          >
            <span class="material-icons" aria-hidden="true">download</span>
            <span>{{
              isDownloading() ? "Downloading..." : "Download Report"
            }}</span>
          </button>
          <button
            type="button"
            class="refresh-btn"
            (click)="load()"
            [disabled]="loading()"
          >
            <span class="material-icons" aria-hidden="true">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      @if (error()) {
        <p class="analytics-status error" role="alert">
          {{ error() }}
          <button type="button" class="analytics-retry-btn" (click)="load()">
            Retry
          </button>
        </p>
      }

      <!-- KPI CARDS (2 rows x 4) — always rendered; live values populate on load -->
      <div class="top-cards-grid" role="list">
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle blue" aria-hidden="true">
            <span class="material-icons">confirmation_number</span>
          </div>
          <div class="card-content">
            <span class="card-label">Total Support Tickets</span>
            <div class="card-value-row">
              <span class="card-value">{{ data()?.total_tickets ?? 0 }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle orange" aria-hidden="true">
            <span class="material-icons">markunread_mailbox</span>
          </div>
          <div class="card-content">
            <span class="card-label">Open Tickets</span>
            <div class="card-value-row">
              <span class="card-value">{{ statusTotal("OPEN") }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle green" aria-hidden="true">
            <span class="material-icons">task_alt</span>
          </div>
          <div class="card-content">
            <span class="card-label">Resolved Tickets</span>
            <div class="card-value-row">
              <span class="card-value">{{ data()?.resolved_count ?? 0 }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle purple" aria-hidden="true">
            <span class="material-icons">schedule</span>
          </div>
          <div class="card-content">
            <span class="card-label">Average Resolution Time</span>
            <div class="card-value-row">
              <span class="card-value">{{
                formatHours(data()?.avg_resolution_hours)
              }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle amber" aria-hidden="true">
            <span class="material-icons">pending_actions</span>
          </div>
          <div class="card-content">
            <span class="card-label">Pending / In Progress</span>
            <div class="card-value-row">
              <span class="card-value">{{ inProgressCount() }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle red" aria-hidden="true">
            <span class="material-icons">priority_high</span>
          </div>
          <div class="card-content">
            <span class="card-label">High Priority Tickets</span>
            <div class="card-value-row">
              <span class="card-value">{{ highPriorityCount() }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle teal" aria-hidden="true">
            <span class="material-icons">rate_review</span>
          </div>
          <div class="card-content">
            <span class="card-label">Feedback Submissions</span>
            <div class="card-value-row">
              <span class="card-value">{{ data()?.feedback_count ?? 0 }}</span>
            </div>
          </div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="card-icon-circle navy" aria-hidden="true">
            <span class="material-icons">percent</span>
          </div>
          <div class="card-content">
            <span class="card-label">Resolution Rate</span>
            <div class="card-value-row">
              <span class="card-value">{{ resolutionRate() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TREND + STATUS -->
      <div class="grid-2">
        <section class="chart-card" aria-label="Tickets trend">
          <div class="card-header-row">
            <h3 class="card-title">Tickets Trend</h3>
            <div class="timeframe-wrapper">
              <button
                type="button"
                class="time-filter-btn"
                (click)="toggleTimeframeMenu($event)"
                [attr.aria-expanded]="showTimeframeMenu()"
              >
                <span>{{ trendTimeframe() }}</span>
                <span class="material-icons" aria-hidden="true"
                  >expand_more</span
                >
              </button>
              @if (showTimeframeMenu()) {
                <div class="timeframe-dropdown" role="menu">
                  @for (opt of timeframeOptions; track opt) {
                    <button
                      type="button"
                      class="timeframe-item"
                      [class.active]="opt === trendTimeframe()"
                      (click)="selectTimeframe(opt)"
                      role="menuitem"
                    >
                      {{ opt }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          <app-line-chart
            [labels]="trendLabels()"
            [datasets]="trendDatasets()"
            [yMin]="0"
            [yMax]="chartYMax()"
          />
        </section>

        <section class="chart-card" aria-label="Tickets by status">
          <h3 class="card-title">Tickets by Status</h3>
          <app-doughnut-chart
            [labels]="statusDonutLabels()"
            [data]="statusDonutData()"
            [colors]="statusDonutColors()"
            [centerMainText]="totalText()"
            centerSubText="Total Tickets"
          />
        </section>
      </div>

      <!-- CATEGORY + PRIORITY -->
      <div class="grid-2">
        <section class="chart-card" aria-label="Tickets by category">
          <h3 class="card-title">Tickets by Category</h3>
          <app-hbar-chart
            [labels]="categoryLabels()"
            [data]="categoryData()"
            primaryColor="#3b82f6"
          />
        </section>

        <section class="chart-card" aria-label="Tickets by priority">
          <h3 class="card-title">Tickets by Priority</h3>
          <app-doughnut-chart
            [labels]="priorityDonutLabels()"
            [data]="priorityDonutData()"
            [colors]="priorityDonutColors()"
            [centerMainText]="totalText()"
            centerSubText="Total Tickets"
          />
        </section>
      </div>

      <!-- ROLE + RESOLUTION PERFORMANCE -->
      <div class="grid-2">
        <section class="chart-card" aria-label="Support requests by user">
          <h3 class="card-title">Support Requests by User</h3>
          <app-hbar-chart
            [labels]="roleLabels()"
            [data]="roleData()"
            primaryColor="#0e7490"
          />
        </section>

        <section class="chart-card" aria-label="Resolution performance">
          <h3 class="card-title">Resolution Performance</h3>
          <ul class="perf-list">
            <li>
              <span class="perf-icon perf-icon--blue" aria-hidden="true">
                <span class="material-icons">schedule</span>
              </span>
              <span class="perf-text"
                ><span class="perf-label">Average Resolution</span>
                <span class="perf-sub">Mean time to resolve</span></span
              >
              <span class="perf-value">{{
                formatHours(data()?.avg_resolution_hours)
              }}</span>
            </li>
            <li>
              <span class="perf-icon perf-icon--green" aria-hidden="true">
                <span class="material-icons">bolt</span>
              </span>
              <span class="perf-text"
                ><span class="perf-label">Fastest Resolution</span>
                <span class="perf-sub">Quickest resolved ticket</span></span
              >
              <span class="perf-value">{{ fastestResolution() }}</span>
            </li>
            <li>
              <span class="perf-icon perf-icon--amber" aria-hidden="true">
                <span class="material-icons">hourglass_top</span>
              </span>
              <span class="perf-text"
                ><span class="perf-label">Longest Resolution</span>
                <span class="perf-sub">Slowest resolved ticket</span></span
              >
              <span class="perf-value">{{ longestResolution() }}</span>
            </li>
            <li>
              <span class="perf-icon perf-icon--navy" aria-hidden="true">
                <span class="material-icons">percent</span>
              </span>
              <span class="perf-text"
                ><span class="perf-label">Resolution Rate</span>
                <span class="perf-sub">Resolved of all tickets</span></span
              >
              <span class="perf-value">{{ resolutionRate() }}</span>
            </li>
          </ul>
        </section>
      </div>

      <!-- ACTIVITY TABLES -->
      <div class="grid-2">
        <section class="table-card" aria-label="Recent support activity">
          <div class="table-header-row">
            <h3 class="card-title">Recent Support Activity</h3>
            <span class="table-tag">Latest events</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                @for (item of recentActivity(); track item.id) {
                  <tr>
                    <td>
                      <span class="text-user">{{ item.ticket }}</span>
                      <span class="text-sub">{{ item.subject }}</span>
                    </td>
                    <td>
                      <span class="activity-pill">
                        <span class="material-icons" aria-hidden="true">{{
                          item.icon
                        }}</span>
                        {{ item.action }}
                      </span>
                    </td>
                    <td class="text-muted">
                      {{ item.time | date: "medium" }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="text-muted">No activity yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="table-card" aria-label="Latest support updates">
          <div class="table-header-row">
            <h3 class="card-title">Latest Support Updates</h3>
            <span class="table-tag">Newest tickets</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Category</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (item of latestUpdates(); track item.id) {
                  <tr>
                    <td>
                      <span class="text-user">{{ item.subject }}</span>
                      <span class="text-sub">{{ item.ticket }}</span>
                    </td>
                    <td class="text-action">{{ item.category }}</td>
                    <td class="text-muted">
                      {{ item.time | date: "mediumDate" }}
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        [style.color]="statusColor(item.status)"
                        [style.background]="statusBg(item.status)"
                        >{{ prettyStatus(item.status) }}</span
                      >
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="text-muted">No tickets yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      .admin-analytics-page {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0;
        padding: 28px 32px 40px;
        background: #f4f7fb;
        color: #172033;
        box-sizing: border-box;
        min-height: calc(100vh - 72px);
        overflow-x: clip;
      }
      @media (max-width: 1024px) {
        .admin-analytics-page {
          padding: 20px 20px 32px;
        }
      }
      @media (max-width: 640px) {
        .admin-analytics-page {
          padding: 20px 24px 32px;
        }
      }
      .breadcrumb {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 16px;
        color: #64748b;
        font-size: 13px;
        font-weight: 500;
      }
      .breadcrumb-link {
        color: #0879ed;
        text-decoration: none;
        font-weight: 500;
      }
      .breadcrumb-link:hover {
        text-decoration: underline;
      }
      .chevron {
        color: #94a3b8;
        font-size: 13px;
        line-height: 1;
        user-select: none;
      }
      .current {
        color: #111827;
        font-weight: 600;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }
      .header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .page-title {
        margin: 0;
        color: #111827;
        font-size: 28px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }
      .page-subtitle {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.45;
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .refresh-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 38px;
        padding: 0 14px;
        border-radius: 8px;
        background: #fff;
        border: 1px solid #dbe2eb;
        color: #334155;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      .refresh-btn:hover:not(:disabled) {
        background: #f8fafc;
        border-color: #0879ed;
      }
      .refresh-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .refresh-btn .material-icons {
        font-size: 18px;
      }
      .btn-download {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 38px;
        padding: 0 16px;
        border-radius: 8px;
        background: #fff;
        border: 1px solid #dbe2eb;
        color: #334155;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      .btn-download:hover:not(:disabled) {
        background: #f8fafc;
        border-color: #0879ed;
        color: #0879ed;
      }
      .btn-download:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-download .material-icons {
        font-size: 18px;
        color: #0879ed;
      }
      .top-cards-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 22px;
        align-content: start;
      }
      @media (max-width: 1200px) {
        .top-cards-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 860px) {
        .top-cards-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 480px) {
        .top-cards-grid {
          grid-template-columns: 1fr;
        }
      }
      .metric-card {
        min-width: 0;
        min-height: 84px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        border-radius: 12px;
        border: 1px solid #e3e8ef;
        background: #fff;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
      }
      .card-icon-circle {
        width: 48px;
        height: 48px;
        min-width: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .card-icon-circle .material-icons {
        font-size: 22px;
      }
      .card-icon-circle.blue {
        background: #eaf3ff;
        color: #0879ed;
      }
      .card-icon-circle.orange {
        background: #fff1e5;
        color: #ff861c;
      }
      .card-icon-circle.green {
        background: #e8f8ef;
        color: #078944;
      }
      .card-icon-circle.purple {
        background: #f3e8ff;
        color: #8b00e8;
      }
      .card-icon-circle.amber {
        background: #fef3c7;
        color: #b45309;
      }
      .card-icon-circle.red {
        background: #fee2e2;
        color: #dc2626;
      }
      .card-icon-circle.teal {
        background: #e0f2f1;
        color: #0e7490;
      }
      .card-icon-circle.navy {
        background: #e8edf5;
        color: #0b3268;
      }
      .card-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .card-label {
        font-size: 13.5px;
        font-weight: 500;
        color: #64748b;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-value-row {
        margin-top: 2px;
      }
      .card-value {
        font-size: 24px;
        font-weight: 700;
        color: #111827;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }
      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }
      @media (max-width: 1100px) {
        .grid-2 {
          grid-template-columns: 1fr;
        }
      }
      .chart-card,
      .table-card {
        background: #fff;
        border-radius: 16px;
        border: 1px solid #e4e9f1;
        padding: 22px 24px;
        box-shadow: 0 4px 16px rgba(15, 40, 82, 0.045);
        min-width: 0;
      }
      .card-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 18px;
        position: relative;
      }
      .card-title {
        font-size: 16px;
        font-weight: 700;
        color: #111827;
        margin: 0;
        letter-spacing: -0.01em;
      }
      section.chart-card > .card-title,
      section.table-card .card-title {
        margin-bottom: 18px;
      }
      section.chart-card > .card-header-row {
        margin-bottom: 18px;
      }
      section.chart-card > .card-header-row .card-title {
        margin-bottom: 0;
      }
      .timeframe-wrapper {
        position: relative;
      }
      .time-filter-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 0 10px;
        height: 32px;
        cursor: pointer;
      }
      .time-filter-btn:hover {
        background: #fff;
        border-color: #cbd5e1;
      }
      .time-filter-btn .material-icons {
        font-size: 16px;
        color: #64748b;
      }
      .timeframe-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
        z-index: 20;
        min-width: 140px;
        padding: 4px 0;
      }
      .timeframe-item {
        display: block;
        width: 100%;
        text-align: left;
        padding: 8px 12px;
        font-size: 12px;
        color: #334155;
        background: transparent;
        border: none;
        cursor: pointer;
      }
      .timeframe-item:hover {
        background: #f1f5f9;
        color: #0879ed;
      }
      .timeframe-item.active {
        font-weight: 600;
        color: #0879ed;
        background: #eff6ff;
      }
      .legend-list {
        list-style: none;
        margin: 6px 0 0;
        padding: 12px 0 0;
        border-top: 1px solid #edf1f5;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 16px;
      }
      @media (max-width: 480px) {
        .legend-list {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .legend-list li {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12.5px;
      }
      .legend-head {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .legend-list--table .legend-head {
        grid-column: 1 / -1;
      }
      .legend-head .legend-dot {
        visibility: hidden;
      }
      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .legend-label {
        flex: 1;
        min-width: 0;
        color: #334155;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .legend-count {
        font-weight: 700;
        color: #111827;
      }
      .legend-pct {
        color: #64748b;
        min-width: 48px;
        text-align: right;
      }
      .perf-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .perf-list li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid #edf1f5;
        border-radius: 10px;
        background: #fbfdff;
        min-width: 0;
      }
      .perf-icon {
        width: 36px;
        height: 36px;
        min-width: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .perf-icon .material-icons {
        font-size: 19px;
      }
      .perf-icon--blue {
        background: #eaf3ff;
        color: #0879ed;
      }
      .perf-icon--green {
        background: #e8f8ef;
        color: #078944;
      }
      .perf-icon--amber {
        background: #fef3c7;
        color: #b45309;
      }
      .perf-icon--navy {
        background: #e8edf5;
        color: #0b3268;
      }
      .perf-text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .perf-label {
        font-size: 13.5px;
        font-weight: 700;
        color: #111827;
      }
      .perf-sub {
        font-size: 12px;
        color: #64748b;
      }
      .perf-value {
        font-size: 18px;
        font-weight: 700;
        color: #111827;
        white-space: nowrap;
      }
      .table-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 18px;
      }
      .table-tag {
        font-size: 12px;
        color: #64748b;
        background: #f8fafc;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid #e4e9f1;
        font-weight: 500;
      }
      .table-responsive {
        overflow-x: auto;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 13px;
      }
      .data-table thead {
        background: #f8fafc;
      }
      .data-table th {
        padding: 11px 14px;
        border-bottom: 1px solid #e4e9f1;
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }
      .data-table td {
        padding: 12px 14px;
        border-bottom: 1px solid #edf1f5;
        color: #1e293b;
        font-size: 13px;
        vertical-align: middle;
      }
      .data-table tr:last-child td {
        border-bottom: none;
      }
      .data-table tbody tr {
        transition: background 0.15s ease;
      }
      .data-table tbody tr:hover {
        background: #fafcff;
      }
      .text-user {
        font-weight: 500;
        color: #1e293b;
        display: block;
      }
      .text-sub {
        display: block;
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
        max-width: 280px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .text-action {
        color: #334155;
      }
      .text-muted {
        color: #64748b;
        white-space: nowrap;
      }
      .activity-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 600;
        color: #334155;
        background: #f1f5f9;
        border-radius: 9999px;
        padding: 3px 10px;
        white-space: nowrap;
      }
      .activity-pill .material-icons {
        font-size: 15px;
        color: #0879ed;
      }
      .status-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 3px 9px;
        border-radius: 9999px;
        white-space: nowrap;
        border: 1px solid transparent;
      }
      .analytics-status {
        margin: 0 0 12px;
        font-size: 13px;
        font-weight: 500;
        color: #64748b;
      }
      .analytics-status.error {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        color: #b42318;
      }
      .analytics-retry-btn {
        border: 1px solid #e3e8ef;
        background: #fff;
        border-radius: 8px;
        padding: 4px 12px;
        font-size: 12.5px;
        font-weight: 600;
        color: #2f6fed;
        cursor: pointer;
      }
      .analytics-retry-btn:hover {
        border-color: #2f6fed;
      }
      @media (max-width: 480px) {
        .top-cards-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class SupportAnalyticsComponent {
  private readonly destroy$ = new Subject<void>();
  private readonly supportService = inject(SupportService);
  private readonly reportsService = inject(AdminAnalyticsDataService);
  private readonly rangeService = inject(AnalyticsDateRangeService);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  data = signal<SupportAnalytics | null>(null);
  tickets = signal<AdminSupportRequest[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  ticketsFailed = signal<boolean>(false);
  isDownloading = signal<boolean>(false);

  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  private readonly rangeTouched = signal<boolean>(false);
  trendTimeframe = signal<string>("Last 9 Months");
  showTimeframeMenu = signal<boolean>(false);
  timeframeOptions = [
    "Last 3 Months",
    "Last 6 Months",
    "Last 9 Months",
    "Last 12 Months",
  ];

  constructor() {
    const role = (this.auth.getUserRole() || "").toUpperCase().trim();
    if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
      this.toast.error("Access Denied", "Admin credentials required.");
      void this.router.navigate(["/dashboard/citizen/support"]);
      this.loading.set(false);
      return;
    }
    // Shared range picked on another Analytics page (kept across refresh).
    if (this.rangeService.touched()) {
      this.currentRange.set(this.rangeService.label());
      this.rangeTouched.set(true);
    }
    this.load();
  }

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard/admin"] },
      { label: "Support Analytics" },
    ];
  }

  statusTotal(key: string): number {
    return this.data()?.by_status?.[key] ?? 0;
  }

  openCount(): number {
    const byStatus = this.data()?.by_status ?? {};
    return (byStatus["OPEN"] ?? 0) + (byStatus["WAITING_FOR_USER"] ?? 0);
  }

  inProgressCount(): number {
    const by = this.data()?.by_status ?? {};
    return (by["IN_PROGRESS"] ?? 0) + (by["WAITING_FOR_USER"] ?? 0);
  }

  highPriorityCount(): number {
    const by = this.data()?.by_priority ?? {};
    return (by["URGENT"] ?? 0) + (by["HIGH"] ?? 0);
  }

  resolutionRate(): string {
    const total = this.data()?.total_tickets ?? 0;
    if (!total) return "—";
    const pct = ((this.data()?.resolved_count ?? 0) / total) * 100;
    return `${Math.round(pct * 10) / 10}%`;
  }

  formatHours(hours: number | null | undefined): string {
    if (hours === null || hours === undefined) return "—";
    return `${Math.round(hours * 10) / 10}h`;
  }

  statusSlices() {
    return Object.entries(this.data()?.by_status ?? {}).map(
      ([label, count]) => ({
        label,
        count,
        color: STATUS_COLORS[label] ?? "#64748b",
      }),
    );
  }

  prioritySlices() {
    return Object.entries(this.data()?.by_priority ?? {}).map(
      ([label, count]) => ({
        label,
        count,
        color: PRIORITY_COLORS[label] ?? "#64748b",
      }),
    );
  }

  categoryBars() {
    return Object.entries(this.data()?.by_category ?? {})
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }

  roleBars() {
    return Object.entries(this.data()?.by_role ?? {})
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }

  private pctOf(count: number, total: number): string {
    if (!total) return "0%";
    return `${Math.round((count / total) * 1000) / 10}%`;
  }

  statusLegend() {
    const total = this.data()?.total_tickets ?? 0;
    return STATUS_ORDER.map((key) => {
      const count = this.data()?.by_status?.[key] ?? 0;
      return {
        label: STATUS_LABELS[key] ?? key,
        count,
        pct: this.pctOf(count, total),
        color: STATUS_COLORS[key] ?? "#64748b",
      };
    });
  }

  totalText(): string {
    return String(this.data()?.total_tickets ?? 0);
  }

  statusDonutLabels(): string[] {
    return this.statusLegend().map((r) => `${r.label} (${r.count})`);
  }

  statusDonutData(): number[] {
    return this.statusLegend().map((r) => r.count);
  }

  statusDonutColors(): string[] {
    return this.statusLegend().map((r) => r.color);
  }

  priorityLegend() {
    const by = this.data()?.by_priority ?? {};
    const total = this.data()?.total_tickets ?? 0;
    const groups = [
      {
        label: "High",
        count: (by["URGENT"] ?? 0) + (by["HIGH"] ?? 0),
        color: "#f5a524",
      },
      { label: "Medium", count: by["MEDIUM"] ?? 0, color: "#2f6fed" },
      { label: "Low", count: by["LOW"] ?? 0, color: "#94a3b8" },
    ];
    return groups.map((g) => ({ ...g, pct: this.pctOf(g.count, total) }));
  }

  priorityDonutLabels(): string[] {
    return this.priorityLegend().map((r) => `${r.label} (${r.count})`);
  }

  priorityDonutData(): number[] {
    return this.priorityLegend().map((r) => r.count);
  }

  priorityDonutColors(): string[] {
    return this.priorityLegend().map((r) => r.color);
  }

  categoryLabels(): string[] {
    return this.categoryBars().map((b) => b.label);
  }

  categoryData(): number[] {
    return this.categoryBars().map((b) => b.value);
  }

  roleLabels(): string[] {
    return this.roleRequestCounts().map((b) => b.label);
  }

  roleData(): number[] {
    return this.roleRequestCounts().map((b) => b.value);
  }

  /**
   * Fixed five-role roster: every supported role except Guest is always
   * shown, with 0 when it has no support requests. Counts come from the
   * backend `by_role` aggregate (support requests grouped by submitter
   * role).
   */
  roleRequestCounts(): Array<{ label: string; value: number }> {
    const by = this.data()?.by_role ?? {};
    const get = (...keys: string[]): number =>
      keys.reduce((sum, k) => sum + (by[k] ?? 0), 0);
    return [
      { label: "Citizen", value: get("CITIZEN") },
      {
        label: "Government Official",
        value: get("GOVERNMENT_OFFICIAL", "GOVERNMENT"),
      },
      { label: "Organization", value: get("ORGANIZATION", "ORGANISATION") },
      { label: "Researcher", value: get("RESEARCHER") },
      { label: "Admin", value: get("ADMIN", "ADMINISTRATOR") },
    ];
  }

  prettyStatus(status: string): string {
    return STATUS_LABELS[(status || "").toUpperCase()] ?? status;
  }

  statusColor(status: string): string {
    return STATUS_COLORS[(status || "").toUpperCase()] ?? "#64748b";
  }

  statusBg(status: string): string {
    return `${this.statusColor(status)}1a`;
  }

  private trendMonthCount(): number {
    const m = /(\d+)/.exec(this.trendTimeframe());
    return m ? Number(m[1]) : 9;
  }

  private monthKey(year: number, month: number): number {
    return year * 12 + month;
  }

  private bucketMonths(count: number): { key: number; label: string }[] {
    const now = new Date();
    const out: { key: number; label: string }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: this.monthKey(d.getFullYear(), d.getMonth()),
        label: MONTHS[d.getMonth()],
      });
    }
    return out;
  }

  trendLabels(): string[] {
    return this.bucketMonths(this.trendMonthCount()).map((b) => b.label);
  }

  trendDatasets(): LineDataset[] {
    const buckets = this.bucketMonths(this.trendMonthCount());
    const open = new Array(buckets.length).fill(0);
    const progress = new Array(buckets.length).fill(0);
    const resolved = new Array(buckets.length).fill(0);
    // Date filter: trend buckets count only tickets in the shared range.
    for (const t of this.rangedTickets()) {
      const created = new Date(t.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const idx = buckets.findIndex(
        (b) =>
          b.key === this.monthKey(created.getFullYear(), created.getMonth()),
      );
      if (idx < 0) continue;
      const st = (t.status || "").toUpperCase();
      if (st === "RESOLVED" || st === "CLOSED") resolved[idx] += 1;
      else if (st === "IN_PROGRESS") progress[idx] += 1;
      else open[idx] += 1;
    }
    return [
      { label: "Open", data: open, borderColor: "#2f6fed" },
      { label: "In Progress", data: progress, borderColor: "#f5a524" },
      { label: "Resolved", data: resolved, borderColor: "#3cb371" },
    ];
  }

  chartYMax(): number {
    let max = 0;
    for (const ds of this.trendDatasets()) {
      for (const v of ds.data || []) {
        if (typeof v === "number" && v > max) max = v;
      }
    }
    if (max <= 0) return 10;
    return Math.ceil(max * 1.2);
  }

  private resolvedDurationsMs(): number[] {
    const out: number[] = [];
    // Date filter: resolution extremes reflect the shared range.
    for (const t of this.rangedTickets()) {
      const st = (t.status || "").toUpperCase();
      if (st !== "RESOLVED" && st !== "CLOSED") continue;
      const end = t.resolved_at ? new Date(t.resolved_at).getTime() : NaN;
      const start = new Date(t.created_at).getTime();
      if (Number.isFinite(end) && Number.isFinite(start) && end >= start) {
        out.push(end - start);
      }
    }
    return out;
  }

  fastestResolution(): string {
    const d = this.resolvedDurationsMs();
    if (!d.length) return "—";
    return this.formatHours(Math.min(...d) / 3_600_000);
  }

  longestResolution(): string {
    const d = this.resolvedDurationsMs();
    if (!d.length) return "—";
    return this.formatHours(Math.max(...d) / 3_600_000);
  }

  rangeWindow(): { start: number; end: number } | null {
    const preset = this.currentRange();
    const now = Date.now();
    if (preset === "Today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { start: d.getTime(), end: now };
    }
    if (preset === "Last 7 Days")
      return { start: now - 7 * 86_400_000, end: now };
    if (preset === "Last 12 Months") {
      const d = new Date();
      d.setMonth(d.getMonth() - 12);
      return { start: d.getTime(), end: now };
    }
    if (preset === "Year to Date") {
      return {
        start: new Date(new Date().getFullYear(), 0, 1).getTime(),
        end: now,
      };
    }
    const m = /^(.+?)\s*-\s*(.+)$/.exec(preset);
    if (m) {
      const s = new Date(m[1].trim()).getTime();
      const eDate = new Date(m[2].trim());
      if (Number.isFinite(s) && Number.isFinite(eDate.getTime())) {
        eDate.setHours(23, 59, 59, 999);
        return { start: s, end: eDate.getTime() };
      }
    }
    return null;
  }

  private rangedTickets(): AdminSupportRequest[] {
    if (!this.rangeTouched()) return this.tickets();
    const win = this.rangeWindow();
    if (!win) return this.tickets();
    return this.tickets().filter((t) => {
      const ts = new Date(t.updated_at || t.created_at).getTime();
      return Number.isFinite(ts) && ts >= win.start && ts <= win.end;
    });
  }

  recentActivity(): SupportActivityItem[] {
    return this.rangedTickets()
      .slice()
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .slice(0, 7)
      .map((t) => {
        const st = (t.status || "").toUpperCase();
        let action = "Ticket created";
        let icon = "add_circle";
        if (st === "RESOLVED" || st === "CLOSED") {
          action = "Ticket resolved";
          icon = "task_alt";
        } else if (t.response) {
          action = "Admin replied";
          icon = "reply";
        } else if (t.assigned_to !== null && t.assigned_to !== undefined) {
          action = "Ticket assigned";
          icon = "person_add";
        } else if (st === "IN_PROGRESS" || st === "WAITING_FOR_USER") {
          action = "Ticket status changed";
          icon = "sync";
        }
        return {
          id: t.query_id,
          ticket: t.request_id,
          subject: t.subject,
          action,
          icon,
          time: t.updated_at,
          status: t.status,
        };
      });
  }

  latestUpdates(): SupportUpdateItem[] {
    return this.rangedTickets()
      .slice()
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 7)
      .map((t) => ({
        id: t.query_id,
        ticket: t.request_id,
        subject: t.subject,
        category: t.category || "General",
        status: t.status,
        time: t.created_at,
      }));
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
    this.rangeTouched.set(true);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    this.rangeTouched.set(true);
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);
    this.reportsService
      .downloadReport("ANALYTICS_REPORT", "PDF", "Support Analytics Report", {
        ...this.rangeService.toReportParams(),
      })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `support-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.isDownloading.set(false);
        },
        error: (err) => {
          console.error("Could not download support analytics report:", err);
          this.isDownloading.set(false);
        },
      });
  }

  toggleTimeframeMenu(event: Event): void {
    event.stopPropagation();
    this.showTimeframeMenu.update((v) => !v);
  }

  selectTimeframe(option: string): void {
    this.trendTimeframe.set(option);
    this.showTimeframeMenu.set(false);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ticketsFailed.set(false);
    forkJoin({
      analytics: this.supportService
        .getSupportAnalytics()
        .pipe(catchError(() => of(null))),
      tickets: this.supportService
        .getAllSupportRequests()
        .pipe(catchError(() => of([] as AdminSupportRequest[]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ analytics, tickets }) => {
          if (!analytics) {
            this.error.set(
              "Unable to load support analytics. Please try again.",
            );
            this.data.set(null);
          } else {
            this.data.set(analytics);
          }
          const list = Array.isArray(tickets) ? tickets : [];
          this.tickets.set(list);
          this.ticketsFailed.set(false);
        },
        error: () =>
          this.error.set("Unable to load support analytics. Please try again."),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
