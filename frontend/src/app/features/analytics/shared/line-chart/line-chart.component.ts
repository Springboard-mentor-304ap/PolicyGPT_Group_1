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

  private chartInstance: Chart | null = null;
  private isInitialized = false;

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
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private createOrUpdateChart(): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (this.labels.length === 0 || this.datasets.length === 0) {
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.data.labels = this.labels;
      this.chartInstance.data.datasets = this.datasets.map(ds => ({
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
        pointHoverBorderWidth: 2.5
      }));
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

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: this.datasets.map(ds => ({
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
          pointHoverBorderWidth: 2.5
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: getLineChartAnimationConfig(),
        animations: getLineChartAnimationsProperty(),
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
