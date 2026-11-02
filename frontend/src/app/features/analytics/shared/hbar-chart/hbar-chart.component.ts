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
          const formatted = typeof value === 'number' ? value.toLocaleString() : value.toString();
          ctx.fillText(formatted, bar.x + 6, bar.y);
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
  @Input() primaryColor: string = '#3b82f6';
  @Input() dimmedColor: string = 'rgba(59, 130, 246, 0.25)';
  /**
   * Optional second horizontal-bar series (grouped bars, one group per
   * label). Null (default) keeps the original single-series rendering,
   * legend hidden, and behavior for all existing callers unchanged.
   */
  @Input() secondData: number[] | null = null;
  @Input() firstLabel = 'Policies';
  @Input() secondLabel = 'Schemes';
  @Input() secondaryColor = '#3cb371';
  /**
   * When false, Chart.js renders the final state immediately with no
   * entry/update animation. Defaults to true so existing callers
   * (e.g. Admin Analytics) keep their current behavior.
   */
  @Input() animationsEnabled = true;
  /**
   * Word-wrap long Y-axis labels onto multiple lines (Chart.js renders
   * each entry on its own line). Off by default so existing callers keep
   * their exact rendering; enable where long names must never clip
   * (e.g. department distributions in the details modal).
   */
  @Input() wrapYAxisLabels = false;
  /** Soft per-line budget for wrapped Y-axis labels. */
  @Input() yLabelLineChars = 28;
  /** Maximum wrapped lines per tick (overflow extends the final line). */
  @Input() yLabelMaxLines = 3;

  /** Rendered tick labels (wrapped when enabled); tooltips use the full originals. */
  private renderedLabels: Array<string | string[]> = [];

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

  private createOrUpdateChart(): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (this.labels.length === 0 || this.data.length === 0) {
      this.cancelPendingRender();
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    if (this.chartInstance) {
      this.renderedLabels = this.displayLabels();
      this.chartInstance.data.labels = this.renderedLabels as any;
      this.chartInstance.data.datasets = this.buildDatasets();
      if (this.chartInstance.options.plugins?.legend) {
        (this.chartInstance.options.plugins.legend as any).display = this.hasSecondSeries();
      }
      if (!this.animationsEnabled) {
        this.chartInstance.options.animation = false;
        (this.chartInstance.options as any).animations = {};
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
      if (this.labels.length === 0 || this.data.length === 0 || this.chartInstance) return;
      this.renderChart();
      // Re-measure once layout has settled so the first paint is already
      // at the final size (no small → large jump).
      requestAnimationFrame(() => {
        if (!this.destroyed) this.chartInstance?.resize();
      });
    });
  }

  private resolveBackgroundColors(): string[] {
    return this.labels.map(label => {
      if (!this.selectedDepartment || this.selectedDepartment === 'All Departments') {
        return this.primaryColor;
      }
      return label.toLowerCase() === this.selectedDepartment.toLowerCase()
        ? this.primaryColor
        : this.dimmedColor;
    });
  }

  private hasSecondSeries(): boolean {
    return Array.isArray(this.secondData) && this.secondData.length > 0;
  }

  private buildDatasets(): any[] {
    const base = {
      borderRadius: {
        topRight: 4,
        bottomRight: 4,
        topLeft: 0,
        bottomLeft: 0
      },
      borderSkipped: 'start',
      barThickness: 16
    };
    const first = {
      ...base,
      label: this.firstLabel,
      data: this.data,
      backgroundColor: this.resolveBackgroundColors(),
    };
    if (!this.hasSecondSeries()) return [first];
    return [
      first,
      {
        ...base,
        label: this.secondLabel,
        data: this.secondData,
        backgroundColor: this.secondaryColor,
      },
    ];
  }

  /**
   * Tick labels for rendering: plain strings unless Y-wrapping is
   * enabled, in which case long labels become word-wrapped string
   * arrays (Chart.js renders each entry on its own line). Words are
   * never dropped or abbreviated; overflow extends the final line.
   */
  private displayLabels(): Array<string | string[]> {
    if (!this.wrapYAxisLabels) return [...this.labels];
    return this.labels.map((label) => this.wrapLabel(label));
  }

  private wrapLabel(label: string): string | string[] {
    const max = Math.max(8, this.yLabelLineChars);
    const maxLines = Math.max(1, this.yLabelMaxLines);
    const words = label.split(/\s+/).filter(Boolean);
    if (words.join(' ').length <= max) return label;
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (lines.length >= maxLines - 1) {
        // Final line absorbs all remaining words (never drop words).
        current = current ? `${current} ${word}` : word;
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= max || current === '') {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length <= 1 ? label : lines;
  }

  private renderChart(): void {
    const ctx = this.chartCanvas?.nativeElement.getContext('2d');
    if (!ctx) return;

    const barAnim = this.animationsEnabled
      ? getBarChartAnimationConfig('y')
      : { animation: false as const, animations: {} };

    this.renderedLabels = this.displayLabels();
    const self = this;

    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      plugins: [endValuePlugin],
      data: {
        labels: this.renderedLabels as any,
        datasets: this.buildDatasets()
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
            right: 48
          }
        },
        plugins: {
          legend: {
            display: this.hasSecondSeries(),
            position: 'bottom',
            align: 'center',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              boxHeight: 8,
              padding: 18,
              color: '#475569',
              font: { family: 'Roboto, Inter, sans-serif', size: 12, weight: 500 }
            }
          },
          tooltip: {
            enabled: true,
            animation: {
              duration: 150
            },
            callbacks: {
              // Wrapped ticks show shortened lines; the tooltip restores
              // the complete original label. No-op for plain labels.
              title: (items) => items
                .map((item) => {
                  const raw = self.labels[item.dataIndex] ?? '';
                  return Array.isArray(raw) ? raw.join(' ') : String(raw);
                })
                .join(', ')
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
            border: { display: true, color: '#e2e8f0', width: 1.5 },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#475569',
              padding: 8,
              autoSkip: false,
              callback: function (value, index) {
                const rendered = self.renderedLabels[index];
                return (rendered ?? value) as any;
              }
            }
          }
        }
      }
    });
  }
}
