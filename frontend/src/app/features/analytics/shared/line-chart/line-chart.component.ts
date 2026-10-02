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
        tension: 0.35,
        pointRadius: 3,
        borderWidth: 2
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
          tension: 0.35,
          pointRadius: 3,
          borderWidth: 2
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              font: { family: 'Roboto, Inter, sans-serif', size: 12, weight: 500 }
            }
          },
          tooltip: { enabled: true }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Roboto, Inter, sans-serif', size: 11 }, color: '#64748b' }
          },
          y: {
            ...(this.yMin !== undefined ? { min: this.yMin } : {}),
            ...(this.yMax !== undefined ? { max: this.yMax } : {}),
            grid: { color: '#e2e8f0' },
            ticks: { font: { family: 'Roboto, Inter, sans-serif', size: 11 }, color: '#64748b' }
          }
        }
      }
    });
  }
}
