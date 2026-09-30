import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

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
            <p>Generate and download official reports from PolicyGPT.</p>
          </div>
          <a class="back-button" routerLink="..">
            <span class="material-icons back-icon" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </a>
        </div>
      </header>

      <div class="card-list">
        <article class="portal-card">
          <div class="card-icon" aria-hidden="true">
            <span class="material-icons">description</span>
          </div>
          <div class="card-content">
            <div class="card-title-row">
              <h3>Generate Report</h3>
            </div>
            <p class="card-sub">
              Create a PDF or Excel report using available PolicyGPT data.
            </p>
          </div>
          <div class="card-actions">
            <a class="btn-secondary" routerLink="generate">Generate Report</a>
          </div>
        </article>

        <article class="portal-card">
          <div class="card-icon" aria-hidden="true">
            <span class="material-icons">history</span>
          </div>
          <div class="card-content">
            <div class="card-title-row">
              <h3>Report History</h3>
            </div>
            <p class="card-sub">View and download previously generated reports.</p>
          </div>
          <div class="card-actions">
            <a class="btn-secondary" routerLink="history">View History</a>
          </div>
        </article>
      </div>
    </div>
  `,
})
export class ReportDashboardComponent {}
