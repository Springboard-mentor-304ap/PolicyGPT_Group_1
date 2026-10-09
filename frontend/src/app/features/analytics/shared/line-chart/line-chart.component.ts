import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  afterNextRender
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import type { ChartDataset } from 'chart.js';
import {
  CHART_HOVER_OPTIONS,
  getLineChartAnimationConfig,
  getLineChartAnimationsProperty
} from '../chart-animation.config';

Chart.register(...registerables);

export interface LineDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor?: string;
  fill?: boolean;
}

/**
 * Marker-clipping guard (see LINE_DATASET_CLIP / LINE_CHART_LAYOUT_PADDING).
 *
 * Circular markers (r=4.5, 2.5px outline → 5.75px outer radius; 8.25px on
 * hover) sit exactly on the chart-area edges for min/max/first/last
 * values. Chart.js clips dataset drawing to the chart area by default,
 * which cuts those markers in half. Disabling per-dataset clipping plus
 * layout padding (breathing room inside the canvas) keeps every marker
 * fully visible without changing axes, data or styling.
 */
const LINE_DATASET_CLIP = false as const;
const LINE_CHART_LAYOUT_PADDING = { top: 10, right: 10, bottom: 8, left: 8 };

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container" style="position: relative; height: 260px; width: 100%;">
      @if (labels.length === 0 || datasets.length === 0) {
        <div class="chart-empty-state">
          <span class="material-icons">show_chart</span>
          <p>No trend data available for the selected period.</p>
        </div>
      }
      <canvas #chartCanvas [style.display]="labels.length === 0 ? 'none' : 'block'"></canvas>
    </div>
  `,
  styles: [`
    .chart-container {
      position: relative;
      width: 100%;
      height: 260px;
    }
    .chart-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #64748b;
      gap: 0.5rem;
      .material-icons {
        font-size: 2rem;
        color: #94a3b8;
      }
      p {
        margin: 0;
        font-size: 0.875rem;
      }
    }
  `]
})
export class LineChartComponent implements OnChanges, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() labels: string[] = [];
  @Input() datasets: LineDataset[] = [];
  @Input() yMin?: number;
  @Input() yMax?: number;
  /**
   * When false, Chart.js renders the final state immediately with no
   * entry/update animation. Defaults to true so existing callers
   * (e.g. Admin Analytics) keep their current behavior.
   */
  @Input() animationsEnabled = true;

  private chartInstance: Chart | null = null;
  private isInitialized = false;
  private pendingFrame: number | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      this.isInitialized = true;
      this.createOrUpdateChart();
    });
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.isInitialized) {
      this.createOrUpdateChart();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancelPendingRender();
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private cancelPendingRender(): void {
    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
  }

  /** Shared dataset mapping so create + update paths stay identical. */
  private toChartDataset(ds: LineDataset): ChartDataset<'line', number[]> {
    return {
      label: ds.label,
      data: ds.data,
      borderColor: ds.borderColor,
      backgroundColor: ds.backgroundColor || 'transparent',
      fill: ds.fill ?? false,
      tension: 0.38,
      borderWidth: 2.5,
      pointRadius: 4.5,
      pointHoverRadius: 7,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: ds.borderColor,
      pointBorderWidth: 2.5,
      pointHoverBackgroundColor: ds.borderColor,
      pointHoverBorderColor: '#ffffff',
      pointHoverBorderWidth: 2.5,
      // Never clip markers at the chart-area edges (min/max/first/last).
      clip: LINE_DATASET_CLIP
    };
  }

  private createOrUpdateChart(): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (this.labels.length === 0 || this.datasets.length === 0) {
      this.cancelPendingRender();
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.data.labels = this.labels;
      this.chartInstance.data.datasets = this.datasets.map(ds => this.toChartDataset(ds));
      if (!this.animationsEnabled && this.chartInstance.options) {
        this.chartInstance.options.animation = false;
        (this.chartInstance.options as any).animations = {};
      }
      if (this.chartInstance.options.scales?.['y']) {
        if (this.yMin !== undefined) {
          this.chartInstance.options.scales['y'].min = this.yMin;
        } else {
          delete this.chartInstance.options.scales['y'].min;
        }
        if (this.yMax !== undefined) {
          this.chartInstance.options.scales['y'].max = this.yMax;
        } else {
          delete this.chartInstance.options.scales['y'].max;
        }
      }
      this.chartInstance.update();
      return;
    }

    // Defer creation to the next animation frame so the browser has
    // applied layout first. The canvas flips from display:none to block
    // in the same change-detection cycle that delivers the data; creating
    // the Chart synchronously would measure a not-yet-laid-out canvas and
    // freeze it at a tiny size (Chart.js observes the parent container,
    // whose dimensions never change, so it never recovers).
    this.cancelPendingRender();
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      if (this.destroyed || !this.chartCanvas?.nativeElement) return;
      if (this.labels.length === 0 || this.datasets.length === 0 || this.chartInstance) return;
      this.renderChart();
      // Re-measure once layout has settled so the first paint is already
      // at the final size (no small → large jump).
      requestAnimationFrame(() => {
        if (!this.destroyed) this.chartInstance?.resize();
      });
    });
  }

  private renderChart(): void {
    const ctx = this.chartCanvas?.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: this.datasets.map(ds => this.toChartDataset(ds))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Breathing room so unclipped edge markers stay inside the canvas.
        layout: { padding: LINE_CHART_LAYOUT_PADDING },
        animation: this.animationsEnabled ? getLineChartAnimationConfig() : false,
        animations: this.animationsEnabled ? getLineChartAnimationsProperty() : {},
        hover: CHART_HOVER_OPTIONS,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            align: 'center',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              boxHeight: 8,
              padding: 18,
              color: '#475569',
              font: { family: 'Inter, system-ui, -apple-system, sans-serif', size: 12, weight: 500 }
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            titleFont: { family: 'Inter, system-ui, -apple-system, sans-serif', size: 12, weight: 600 },
            bodyFont: { family: 'Inter, system-ui, -apple-system, sans-serif', size: 12 },
            padding: { top: 8, bottom: 8, left: 12, right: 12 },
            cornerRadius: 8,
            boxPadding: 4,
            usePointStyle: true,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            animation: {
              duration: 150
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: 'Inter, system-ui, -apple-system, sans-serif', size: 11 }, color: '#64748b' }
          },
          y: {
            ...(this.yMin !== undefined ? { min: this.yMin } : {}),
            ...(this.yMax !== undefined ? { max: this.yMax } : {}),
            grid: { color: '#f1f5f9' },
            border: { display: false },
            ticks: { font: { family: 'Inter, system-ui, -apple-system, sans-serif', size: 11 }, color: '#64748b' }
          }
        }
      }
    });
  }
}
