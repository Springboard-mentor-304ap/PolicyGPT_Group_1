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
    <div class="vbar-scroll">
      <div class="vbar-inner" style="position: relative; width: 100%;" [style.height.px]="chartHeight">
        @if (!hasRenderableData()) {
          <div class="chart-empty-state">
            <span class="material-icons">equalizer</span>
            <p>{{ emptyMessage }}</p>
          </div>
        }
        <canvas #chartCanvas [style.display]="hasRenderableData() ? 'block' : 'none'"></canvas>
      </div>
    </div>
  `,
  styles: [`
    .vbar-scroll {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .vbar-inner {
      position: relative;
      width: 100%;
      min-width: 100%;
      height: 320px;
    }
    @media (max-width: 640px) {
      .vbar-inner {
        min-width: 560px;
      }
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
  /**
   * Optional second vertical-bar series (grouped columns, one group per
   * label). Null (default) keeps the original single-series rendering,
   * legend hidden, and behavior for all existing callers unchanged.
   */
  @Input() secondValues: number[] | null = null;
  @Input() firstLabel = 'Policies';
  @Input() secondLabel = 'Schemes';
  @Input() secondaryColor = '#3cb371';
  /**
   * Force the bottom legend on for single-series views (e.g. a filtered
   * Department Distribution showing only Policies or only Schemes).
   * Defaults to false so existing single-series callers stay unchanged.
   */
  @Input() showLegend = false;
  @Input() emptyMessage = 'No ministry breakdown available.';
  /**
   * Word-wrap long X-axis labels onto multiple centered lines using
   * Chart.js native multiline labels (string[] per tick). Underlying data
   * and tooltip text keep the full original label; only tick rendering
   * wraps. Opt-in per caller (e.g. Policies by Ministry).
   */
  @Input() wrapXAxisLabels = false;
  /** Soft per-line budget for wrapped X-axis labels. */
  @Input() xLabelLineChars = 16;
  /** Maximum wrapped lines per tick (overflow extends the final line). */
  @Input() xLabelMaxLines = 4;
  /**
   * Shrink the per-line wrap budget (never below 8 chars) so wrapped
   * lines fit the measured horizontal slot of each tick. Defaults to
   * false so existing callers keep their exact rendering; enable where
   * many long labels share a narrow card (Department Distribution).
   */
  @Input() fitLabelsToWidth = false;
  /**
   * Grow the chart container (base 320px, up to +96px) when wrapped
   * labels need more than two lines, so tick text never collides with
   * the legend or gets clipped. Opt-in per caller.
   */
  @Input() growWithLabels = false;

  private chartInstance: Chart | null = null;
  private isInitialized = false;
  private pendingFrame: number | null = null;
  private destroyed = false;
  /** Container height; grows when wrapped labels need extra lines. */
  chartHeight = 320;

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

  hasRenderableData(): boolean {
    return this.labels.length > 0 && this.values.length > 0;
  }

  private hasSecondSeries(): boolean {
    return Array.isArray(this.secondValues) && this.secondValues.length > 0;
  }

  private legendVisible(): boolean {
    return this.showLegend || this.hasSecondSeries();
  }

  private cancelPendingRender(): void {
    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
  }

  private buildDatasets(): any[] {
    // Single-series keeps the exact original rendering (fixed 28px bars).
    const first = {
      label: this.firstLabel,
      data: this.values,
      backgroundColor: this.color,
      borderRadius: { topLeft: 6, topRight: 6 },
      barThickness: 28,
      hoverBackgroundColor: '#075dcc',
    };
    if (!this.hasSecondSeries()) return [first];
    // Grouped columns share each category: flexible widths (capped) so up
    // to 10 departments fit without overflow on desktop widths.
    const groupedBase = {
      borderRadius: { topLeft: 6, topRight: 6 },
      maxBarThickness: 26,
      categoryPercentage: 0.72,
      barPercentage: 0.9,
    };
    return [
      { ...groupedBase, label: this.firstLabel, data: this.values, backgroundColor: this.color },
      {
        ...groupedBase,
        label: this.secondLabel,
        data: this.secondValues,
        backgroundColor: this.secondaryColor,
      },
    ];
  }

  private createOrUpdateChart(): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (!this.hasRenderableData()) {
      this.cancelPendingRender();
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
      return;
    }

    if (this.chartInstance) {
      this.applyFittedLabels(this.chartInstance);
      this.chartInstance.data.datasets = this.buildDatasets();
      if (this.chartInstance.options.plugins?.legend) {
        (this.chartInstance.options.plugins.legend as any).display = this.legendVisible();
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
      if (!this.hasRenderableData() || this.chartInstance) return;
      this.renderChart();
      // Re-measure once layout has settled so the first paint is already
      // at the final size (no small → large jump), then fit wrapped
      // labels to the measured tick slots.
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        const chart = this.chartInstance;
        chart?.resize();
        if (chart && this.applyFittedLabels(chart)) chart.update();
      });
    });
  }

  private renderChart(): void {
    const ctx = this.chartCanvas?.nativeElement.getContext('2d');
    if (!ctx) return;

    const barAnim = getBarChartAnimationConfig('x');
    const wrapping = this.wrapXAxisLabels;

    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      plugins: [topValuePlugin],
      data: {
        labels: this.displayLabels() as any,
        datasets: this.buildDatasets()
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: barAnim.animation,
        animations: barAnim.animations,
        hover: CHART_HOVER_OPTIONS,
        // Re-fit wrapped X labels whenever the container width changes
        // (desktop resize, tablet rotation) so lines keep fitting their
        // tick slot instead of colliding with neighbours.
        onResize: (chart) => {
          if (this.fitLabelsToWidth && this.applyFittedLabels(chart)) {
            chart.update();
          }
        },
        layout: {
          padding: {
            top: 20,
            bottom: wrapping ? 4 : 0
          }
        },
        plugins: {
          legend: {
            display: this.legendVisible(),
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
              // Multiline ticks show wrapped lines; the tooltip restores
              // the full original ministry name.
              title: (items) => items
                .map((item) => {
                  const raw = this.labels[item.dataIndex] ?? '';
                  return Array.isArray(raw) ? raw.join(' ') : String(raw);
                })
                .join(', ')
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#475569',
              maxRotation: wrapping ? 0 : 45,
              minRotation: 0,
              autoSkip: !wrapping,
              padding: wrapping ? 2 : 0
            }
          },
          y: {
            beginAtZero: true,
            min: 0,
            grid: { color: '#e3e8f0' },
            ticks: {
              font: { family: 'Roboto, Inter, sans-serif', size: 11, weight: 500 },
              color: '#64748b',
              precision: 0
            }
          }
        }
      }
    });
  }

  /**
   * Tick labels for rendering: plain strings unless wrapping is enabled,
   * in which case long labels become word-wrapped string arrays (Chart.js
   * renders each entry on its own centered line). Words are never dropped
   * or abbreviated; overflow extends the final line.
   */
  private displayLabels(): Array<string | string[]> {
    if (!this.wrapXAxisLabels) return [...this.labels];
    return this.labels.map((label) => this.wrapLabel(label, this.xLabelLineChars));
  }

  /**
   * Rebuild tick labels with a wrap budget derived from the measured
   * plot width, so every line fits its tick slot and neighbours never
   * collide. Also grows the container when extra lines need room.
   * Returns true when the rendered labels changed.
   */
  private applyFittedLabels(chart: any): boolean {
    const before = JSON.stringify(chart.data.labels);
    if (!this.wrapXAxisLabels) {
      chart.data.labels = [...this.labels];
    } else {
      const budget = this.fittedBudget(chart);
      chart.data.labels = this.labels.map((label) => this.wrapLabel(label, budget));
    }
    this.applyFittedHeight(chart);
    return JSON.stringify(chart.data.labels) !== before;
  }

  /**
   * Per-line character budget that fits the measured tick slot: never
   * wider than the configured cap, never narrower than 8 chars (below
   * that lines would fragment into unreadable shards).
   */
  private fittedBudget(chart: any): number {
    const cap = Math.max(8, this.xLabelLineChars);
    if (!this.fitLabelsToWidth || this.labels.length === 0) return cap;
    const plotWidth =
      chart?.chartArea?.width ??
      this.chartCanvas?.nativeElement?.parentElement?.clientWidth ??
      0;
    if (!plotWidth || plotWidth <= 0) return cap;
    const slot = plotWidth / this.labels.length;
    let avgChar = 6.2;
    try {
      const ctx = this.chartCanvas?.nativeElement.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.font = '500 11px Roboto, Inter, sans-serif';
        const sample = this.labels.join(' ');
        const measured = ctx.measureText(sample).width;
        ctx.restore();
        if (measured > 0 && sample.length > 0) {
          avgChar = measured / sample.length;
        }
      }
    } catch {
      // Fall back to the static estimate below.
    }
    if (!(avgChar > 0)) avgChar = 6.2;
    return Math.min(cap, Math.max(8, Math.floor((slot * 0.94) / avgChar)));
  }

  /** Grow the container when wrapped labels need more than two lines. */
  private applyFittedHeight(chart: any): void {
    if (!this.growWithLabels) {
      if (this.chartHeight !== 320) this.chartHeight = 320;
      return;
    }
    let maxLines = 1;
    const rendered = chart?.data?.labels ?? [];
    for (const tick of rendered) {
      const lines = Array.isArray(tick) ? tick.length : 1;
      if (lines > maxLines) maxLines = lines;
    }
    const next = 320 + Math.min(96, Math.max(0, maxLines - 2) * 18);
    if (next !== this.chartHeight) this.chartHeight = next;
  }

  private wrapLabel(label: string, budget: number): string | string[] {
    const max = Math.max(8, budget);
    const maxLines = Math.max(1, this.xLabelMaxLines);
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
}
