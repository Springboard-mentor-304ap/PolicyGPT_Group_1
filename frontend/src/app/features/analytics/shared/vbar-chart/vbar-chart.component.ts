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
  getBarChartAnimationConfig
} from '../chart-animation.config';

Chart.register(...registerables);

const topValuePlugin = {
  id: 'vbarTopValuePlugin',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset: any, index: number) => {
      const meta = chart.getDatasetMeta(index);
      meta.data.forEach((bar: any, i: number) => {
        const value = dataset.data[i];
        if (value !== undefined && value !== null) {
          ctx.save();
          ctx.font = '600 11px Roboto, Inter, sans-serif';
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(value.toString(), bar.x, bar.y - 4);
          ctx.restore();
        }
      });
    });
  }
};

@Component({
  selector: 'app-vbar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container" style="position: relative; height: 320px; width: 100%;">
      @if (labels.length === 0 || values.length === 0) {
        <div class="chart-empty-state">
          <span class="material-icons">equalizer</span>
          <p>No ministry breakdown available.</p>
        </div>
      }
      <canvas #chartCanvas [style.display]="labels.length === 0 ? 'none' : 'block'"></canvas>
    </div>
  `,
  styles: [`
    .chart-container {
      position: relative;
      width: 100%;
      height: 320px;
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
export class VbarChartComponent implements OnChanges, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  @Input() color: string = '#2f6fed';

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
    if (this.labels.length === 0 || this.values.length === 0) {
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.data.labels = this.labels;
      this.chartInstance.data.datasets[0].data = this.values;
      this.chartInstance.data.datasets[0].backgroundColor = this.color;
      this.chartInstance.update();
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const barAnim = getBarChartAnimationConfig('x');

    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      plugins: [topValuePlugin],
      data: {
        labels: this.labels,
        datasets: [
          {
            data: this.values,
            backgroundColor: this.color,
            borderRadius: { topLeft: 6, topRight: 6 },
            barThickness: 28,
            hoverBackgroundColor: '#075dcc'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: barAnim.animation,
        animations: barAnim.animations,
        hover: CHART_HOVER_OPTIONS,
        layout: {
          padding: {
            top: 20
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            animation: {
              duration: 150
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#475569',
              maxRotation: 45,
              minRotation: 0,
              autoSkip: true
            }
          },
          y: {
            beginAtZero: true,
            min: 0,
            grid: { color: '#e3e8f0' },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#64748b'
            }
          }
        }
      }
    });
  }
}
