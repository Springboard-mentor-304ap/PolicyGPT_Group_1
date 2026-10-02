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

const endValuePlugin = {
  id: 'hbarEndValuePlugin',
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
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(value.toString(), bar.x + 6, bar.y);
          ctx.restore();
        }
      });
    });
  }
};

@Component({
  selector: 'app-hbar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container" style="position: relative; height: 320px; width: 100%;">
      @if (labels.length === 0 || data.length === 0) {
        <div class="chart-empty-state">
          <span class="material-icons">bar_chart</span>
          <p>No ranking data available.</p>
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
export class HbarChartComponent implements OnChanges, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() labels: string[] = [];
  @Input() data: number[] = [];
  @Input() selectedDepartment: string = 'All Departments';
  @Input() primaryColor: string = '#2f6fed';
  @Input() dimmedColor: string = 'rgba(47, 111, 237, 0.25)';

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
    if (this.labels.length === 0 || this.data.length === 0) {
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    const backgroundColors = this.labels.map(label => {
      if (!this.selectedDepartment || this.selectedDepartment === 'All Departments') {
        return this.primaryColor;
      }
      return label.toLowerCase() === this.selectedDepartment.toLowerCase()
        ? this.primaryColor
        : this.dimmedColor;
    });

    if (this.chartInstance) {
      this.chartInstance.data.labels = this.labels;
      this.chartInstance.data.datasets[0].data = this.data;
      this.chartInstance.data.datasets[0].backgroundColor = backgroundColors;
      this.chartInstance.update();
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const barAnim = getBarChartAnimationConfig('y');

    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      plugins: [endValuePlugin],
      data: {
        labels: this.labels,
        datasets: [
          {
            data: this.data,
            backgroundColor: backgroundColors,
            borderRadius: 4,
            barThickness: 14
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: barAnim.animation,
        animations: barAnim.animations,
        hover: CHART_HOVER_OPTIONS,
        layout: {
          padding: {
            right: 32
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
            display: false,
            grid: { display: false }
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#475569'
            }
          }
        }
      }
    });
  }
}
