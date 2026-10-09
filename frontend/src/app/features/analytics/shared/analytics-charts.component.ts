import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export interface DonutSlice {
  label: string;
  count: number;
  color: string;
  description?: string;
}

export interface BarItem {
  label: string;
  value: number;
}

/* =========================================================
   MULTI-SERIES LINE CHART (pure SVG, no dependencies)
   ========================================================= */

@Component({
  selector: "app-analytics-line-chart",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div
      class="line-wrap"
      tabindex="0"
      role="region"
      aria-label="Interactive trend chart"
      (mousemove)="onHover($event)"
      (mouseleave)="hoverIndex = null"
      (touchmove)="onTouch($event)"
      (touchend)="hoverIndex = null"
      (keydown)="onKeydown($event)"
    >
      <svg
        #svg
        viewBox="0 0 640 248"
        preserveAspectRatio="none"
        class="line-svg"
        role="img"
        aria-label="Activity trend chart"
      >
        @for (grid of gridlines; track grid.y) {
          <line
            x1="36"
            [attr.y1]="grid.y"
            x2="640"
            [attr.y2]="grid.y"
            class="grid-line"
          />
          <text x="2" [attr.y]="grid.y + 4" class="grid-label">
            {{ grid.value }}
          </text>
        }
        @for (s of visibleSeries; track s.key) {
          <path
            [attr.d]="curvePathFor(s)"
            fill="none"
            [attr.stroke]="s.color"
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="chart-path"
          />
          @for (v of s.values; track $index) {
            <circle
              [attr.cx]="xFor($index)"
              [attr.cy]="yFor(v)"
              r="4.5"
              fill="#ffffff"
              [attr.stroke]="s.color"
              stroke-width="2.5"
              class="chart-marker"
              [style.--rise.px]="216 - yFor(v)"
            />
          }
        }
        @if (hoverIndex !== null) {
          <line
            [attr.x1]="xFor(hoverIndex)"
            [attr.y1]="20"
            [attr.x2]="xFor(hoverIndex)"
            y2="216"
            class="hover-line"
          />
          @for (s of visibleSeries; track s.key) {
            <circle
              [attr.cx]="xFor(hoverIndex)"
              [attr.cy]="yFor(s.values[hoverIndex] ?? 0)"
              r="7"
              [attr.fill]="s.color"
              stroke="#ffffff"
              stroke-width="2.5"
              class="hover-marker"
            />
          }
        }
        @for (lbl of labels; track $index) {
          @if (shouldShowXLabel($index)) {
            <text
              [attr.x]="xFor($index)"
              y="238"
              text-anchor="middle"
              class="grid-label x-axis-label"
            >
              {{ lbl }}
            </text>
          }
        }
      </svg>
      @if (hoverIndex !== null) {
        <div
          class="chart-tooltip"
          [style.left.%]="tooltipLeft"
          [style.top.px]="8"
          role="status"
        >
          <strong class="tooltip-period">{{ labels[hoverIndex] }}</strong>
          <div class="tooltip-items">
            @for (s of visibleSeries; track s.key) {
              <div class="tooltip-row">
                <span
                  class="tooltip-marker"
                  [style.border-color]="s.color"
                ></span>
                <span class="tooltip-label">{{ s.label }}:</span>
                <strong class="tooltip-value">{{
                  s.values[hoverIndex] ?? 0
                }}</strong>
              </div>
            }
          </div>
        </div>
      }
    </div>
    <div class="chart-legend" role="list">
      @for (s of series; track s.key) {
        <button
          type="button"
          class="legend-item"
          role="listitem"
          [class.legend-item--off]="hidden.has(s.key)"
          (click)="toggle(s.key)"
          [attr.aria-pressed]="!hidden.has(s.key)"
          [attr.title]="'Toggle ' + s.label"
        >
          <span class="legend-circle" [style.border-color]="s.color">
            <span
              class="legend-circle-inner"
              [style.background]="s.color"
            ></span>
          </span>
          <span class="legend-label">{{ s.label }}</span>
        </button>
      }
    </div>
    @if (isEmpty) {
      <p class="chart-empty">No activity in this period yet.</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .line-wrap {
        position: relative;
        outline: none;
      }
      .line-svg {
        width: 100%;
        height: 248px;
        display: block;
        overflow: visible;
      }
      .grid-line {
        stroke: #f1f5f9;
        stroke-width: 1;
      }
      .grid-label {
        font-size: 11px;
        font-weight: 500;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        fill: #64748b;
      }
      .x-axis-label {
        font-size: 11px;
        fill: #64748b;
      }
      /* Entry motion mirrors the Admin Analytics Dashboard line chart
         (Chart.js: 750ms easeOutQuart line reveal, circular markers):
         same duration, easing family, 2.5px stroke and r=4.5 markers. */
      .chart-path {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: drawLine 0.75s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      }
      /* Markers rise from the baseline together with the line draw
         (same 0.75s easeOutQuart progress as the Admin Chart.js
         y-animation): no per-point stagger, so circles never sequence
         in from the left independently of the line. */
      .chart-marker {
        opacity: 0;
        animation: riseMarker 0.75s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        cursor: pointer;
        transition: r 0.15s ease;
      }
      .hover-marker {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18));
      }
      @keyframes drawLine {
        to {
          stroke-dashoffset: 0;
        }
      }
      @keyframes riseMarker {
        from {
          opacity: 0;
          transform: translateY(var(--rise, 0px));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .chart-path {
          stroke-dasharray: none;
          stroke-dashoffset: 0;
          animation: none;
        }
        .chart-marker {
          opacity: 1;
          animation: none;
        }
      }
      .hover-line {
        stroke: #cbd5e1;
        stroke-width: 1;
        stroke-dasharray: 4 3;
      }
      .chart-tooltip {
        position: absolute;
        transform: translateX(-50%);
        background: #0f172a;
        color: #ffffff;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 12px;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        pointer-events: none;
        white-space: nowrap;
        z-index: 10;
        box-shadow:
          0 10px 20px -3px rgba(15, 23, 42, 0.25),
          0 4px 6px -2px rgba(15, 23, 42, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .tooltip-period {
        display: block;
        margin-bottom: 6px;
        font-weight: 600;
        color: #f8fafc;
        font-size: 12px;
      }
      .tooltip-items {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tooltip-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tooltip-marker {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: 2px solid;
        background: #ffffff;
        flex-shrink: 0;
      }
      .tooltip-label {
        color: #cbd5e1;
        font-size: 11px;
      }
      .tooltip-value {
        color: #ffffff;
        font-weight: 600;
        font-size: 12px;
        margin-left: auto;
      }
      .chart-legend {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 18px;
        margin-top: 14px;
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: #475569;
        border-radius: 6px;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        transition:
          opacity 0.15s ease,
          background-color 0.15s ease;
      }
      .legend-item:hover {
        background-color: #f8fafc;
        color: #1e293b;
      }
      .legend-item--off {
        opacity: 0.35;
        text-decoration: line-through;
      }
      .legend-circle {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid;
        background-color: #ffffff;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .legend-circle-inner {
        width: 4px;
        height: 4px;
        border-radius: 50%;
      }
      .legend-label {
        user-select: none;
      }
      .chart-empty {
        color: #8995a6;
        font-size: 13px;
        text-align: center;
        margin: 8px 0 0;
      }
    `,
  ],
})
export class AnalyticsLineChartComponent {
  @Input() series: LineSeries[] = [];
  @Input() labels: string[] = [];

  /**
   * Marker-clipping guard for the pure-SVG plot.
   *
   * Circular markers (r=4.5, 2.5px outline → 5.75px outer radius; r=7
   * hover markers → 8.25px) used to sit exactly on the viewBox edges:
   * first/last points at x=36/640 and min/max values at y=216/20, so
   * any clipping ancestor cut their outlines. The data plot is inset
   * by MARKER_PAD on every side so every marker — including its full
   * border — stays inside the SVG box. Gridlines remain full-bleed
   * (background only); marker shape, size, colors and animation are
   * unchanged.
   */
  private static readonly PLOT_LEFT = 36;
  private static readonly PLOT_RIGHT = 640;
  private static readonly PLOT_TOP = 20;
  private static readonly PLOT_BOTTOM = 216;
  private static readonly MARKER_PAD = 9;

  hidden = new Set<string>();
  hoverIndex: number | null = null;

  get visibleSeries(): LineSeries[] {
    return this.series.filter((s) => !this.hidden.has(s.key));
  }

  get maxValue(): number {
    let max = 0;
    for (const s of this.series) {
      for (const v of s.values) {
        if (v > max) {
          max = v;
        }
      }
    }
    return max <= 0 ? 1 : max;
  }

  get isEmpty(): boolean {
    return (
      this.maxValue <= 1 &&
      this.series.every((s) => s.values.every((v) => v === 0))
    );
  }

  get gridlines(): { y: number; value: number }[] {
    const max = this.maxValue;
    const step = max / 4;
    return [0, 1, 2, 3, 4].map((i) => ({
      y: 216 - (216 - 20) * (i / 4),
      value: Math.round(step * i),
    }));
  }

  get firstLabel(): string {
    return this.labels[0] ?? "";
  }

  get midLabel(): string {
    return this.labels[Math.floor(this.labels.length / 2)] ?? "";
  }

  get lastLabel(): string {
    return this.labels[this.labels.length - 1] ?? "";
  }

  get tooltipLeft(): number {
    if (this.hoverIndex === null || this.labels.length <= 1) {
      return 50;
    }
    const pct = (this.hoverIndex / (this.labels.length - 1)) * 100;
    return Math.min(88, Math.max(12, pct));
  }

  toggle(key: string): void {
    if (this.hidden.has(key)) {
      this.hidden.delete(key);
    } else {
      this.hidden.add(key);
    }
  }

  xFor(index: number): number {
    const C = AnalyticsLineChartComponent;
    const n = Math.max(this.labels.length - 1, 1);
    const left = C.PLOT_LEFT + C.MARKER_PAD;
    const width = C.PLOT_RIGHT - C.PLOT_LEFT - C.MARKER_PAD * 2;
    return left + (width * index) / n;
  }

  yFor(value: number): number {
    const C = AnalyticsLineChartComponent;
    const top = C.PLOT_TOP + C.MARKER_PAD;
    const bottom = C.PLOT_BOTTOM - C.MARKER_PAD;
    return bottom - ((bottom - top) * value) / this.maxValue;
  }

  pointsFor(s: LineSeries): string {
    return s.values.map((v, i) => `${this.xFor(i)},${this.yFor(v)}`).join(" ");
  }

  curvePathFor(s: LineSeries): string {
    const vals = s.values;
    if (!vals || vals.length === 0) return "";
    const pts = vals.map((v, i) => ({ x: this.xFor(i), y: this.yFor(v) }));
    if (pts.length === 1) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    }
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
    }

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const tension = 0.18;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  shouldShowXLabel(index: number): boolean {
    const total = this.labels.length;
    if (total <= 12) return true;
    if (total <= 24) return index % 2 === 0 || index === total - 1;
    const step = Math.ceil(total / 10);
    return index % step === 0 || index === total - 1;
  }

  onHover(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const n = Math.max(this.labels.length - 1, 1);
    // Inverse of xFor(): account for the gutter plus the marker inset.
    const C = AnalyticsLineChartComponent;
    const left = C.PLOT_LEFT + C.MARKER_PAD;
    const width = C.PLOT_RIGHT - C.PLOT_LEFT - C.MARKER_PAD * 2;
    const adjusted = (ratio * 640 - left) / width;
    this.hoverIndex = Math.min(n, Math.max(0, Math.round(adjusted * n)));
  }

  onTouch(event: TouchEvent): void {
    if (!event.touches.length) return;
    const touch = event.touches[0];
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (touch.clientX - rect.left) / Math.max(rect.width, 1);
    const n = Math.max(this.labels.length - 1, 1);
    const C = AnalyticsLineChartComponent;
    const left = C.PLOT_LEFT + C.MARKER_PAD;
    const width = C.PLOT_RIGHT - C.PLOT_LEFT - C.MARKER_PAD * 2;
    const adjusted = (ratio * 640 - left) / width;
    this.hoverIndex = Math.min(n, Math.max(0, Math.round(adjusted * n)));
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.labels.length) return;
    const n = this.labels.length - 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.hoverIndex = Math.min(n, (this.hoverIndex ?? -1) + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.hoverIndex = Math.max(0, (this.hoverIndex ?? 1) - 1);
    } else if (event.key === "Escape") {
      this.hoverIndex = null;
    }
  }
}

/* =========================================================
   DONUT CHART (pure SVG)
   ========================================================= */

@Component({
  selector: "app-analytics-donut-chart",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="donut-layout">
      <div class="donut-wrap">
        <svg
          viewBox="0 0 160 160"
          class="donut-svg"
          role="img"
          aria-label="Activity by type chart"
        >
          <circle
            cx="80"
            cy="80"
            r="62"
            fill="none"
            stroke="#eef2f7"
            stroke-width="26"
          />
          @for (arc of arcs; track arc.label; let i = $index) {
            <circle
              cx="80"
              cy="80"
              r="62"
              fill="none"
              [attr.stroke]="arc.color"
              stroke-width="26"
              [attr.stroke-dasharray]="arc.dash"
              [attr.stroke-dashoffset]="arc.offset"
              [style.--sweep-gap.px]="arc.gap"
              [style.animation-delay]="i * 70 + 'ms'"
              [attr.opacity]="
                activeLabel === null || activeLabel === arc.label ? 1 : 0.35
              "
              (mouseenter)="activeLabel = arc.label"
              (mouseleave)="activeLabel = null"
              (focus)="activeLabel = arc.label"
              (blur)="activeLabel = null"
              tabindex="0"
              [attr.aria-label]="arc.label + ': ' + arc.count"
              class="donut-segment"
            >
              <title>{{ arc.label }}: {{ arc.count }} ({{ arc.pct }}%)</title>
            </circle>
          }
        </svg>
        <div class="donut-center" aria-live="polite">
          <strong>{{ total }}</strong>
          <span>Total activities</span>
        </div>
      </div>
      <ul class="donut-legend">
        @for (arc of arcs; track arc.label) {
          <li
            (mouseenter)="activeLabel = arc.label"
            (mouseleave)="activeLabel = null"
            [class.donut-legend--active]="activeLabel === arc.label"
            [attr.title]="arc.description ?? arc.label"
          >
            <span class="legend-dot" [style.background]="arc.color"></span>
            <span class="donut-legend-label">{{ arc.label }}</span>
            <span class="donut-legend-value"
              >{{ arc.count }} · {{ arc.pct }}%</span
            >
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      .donut-layout {
        display: flex;
        gap: 18px;
        align-items: center;
        flex-wrap: wrap;
      }
      .donut-wrap {
        position: relative;
        width: 168px;
        flex-shrink: 0;
      }
      .donut-svg {
        width: 100%;
        display: block;
        transform: rotate(-90deg);
        animation: donutSpinIn 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      }
      @keyframes donutSpinIn {
        from {
          transform: rotate(-180deg) scale(0.92);
          opacity: 0.5;
        }
        to {
          transform: rotate(-90deg) scale(1);
          opacity: 1;
        }
      }
      /* Segment sweep + update transitions share the standard
         easeOutQuart easing with the Chart.js doughnut animation
         (800ms rotate/scale reveal), so every role's donut moves
         identically. */
      .donut-segment {
        transition:
          stroke-dashoffset 0.6s cubic-bezier(0.25, 1, 0.5, 1),
          stroke-dasharray 0.6s ease,
          stroke-width 0.2s ease,
          opacity 0.2s ease;
        animation: donutSweep 0.55s cubic-bezier(0.25, 1, 0.5, 1) backwards;
      }
      @keyframes donutSweep {
        from {
          stroke-dasharray: 0 var(--sweep-gap);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .donut-svg {
          animation: none;
        }
        .donut-segment {
          transition: none;
          animation: none;
        }
      }
      .donut-svg circle[tabindex] {
        cursor: pointer;
        outline: none;
      }
      .donut-svg circle[tabindex]:focus {
        stroke-width: 30;
      }
      .donut-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .donut-center strong {
        font-size: 24px;
        font-weight: 700;
        color: #111827;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
      }
      .donut-center span {
        font-size: 12px;
        color: #64748b;
        font-weight: 400;
        margin-top: 3px;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
      }
      .donut-legend {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1;
        min-width: 180px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .donut-legend li {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 5px 8px;
        border-radius: 6px;
        transition: background 0.15s ease;
      }
      .donut-legend--active {
        background: #f8fafc;
      }
      .legend-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .donut-legend-label {
        color: #334155;
        font-weight: 500;
        font-size: 13px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .donut-legend-value {
        color: #111827;
        font-weight: 600;
        font-size: 12px;
        white-space: nowrap;
      }
    `,
  ],
})
export class AnalyticsDonutChartComponent {
  @Input() slices: DonutSlice[] = [];

  activeLabel: string | null = null;

  get total(): number {
    return this.slices.reduce((sum, s) => sum + s.count, 0);
  }

  get arcs(): {
    label: string;
    count: number;
    color: string;
    pct: number;
    dash: string;
    offset: number;
    gap: number;
    description?: string;
  }[] {
    const circumference = 2 * Math.PI * 62;
    let cursor = 0;
    const total = this.total || 1;
    return this.slices.map((s) => {
      const frac = s.count / total;
      const arc = {
        label: s.label,
        count: s.count,
        color: s.color,
        pct: Math.round(frac * 1000) / 10,
        dash: `${Math.max(frac * circumference - 2, 0.5)} ${circumference}`,
        offset: -cursor * circumference,
        gap: circumference,
        description: s.description,
      };
      cursor += frac;
      return arc;
    });
  }
}

/* =========================================================
   GROUPED / STACKED BAR CHART (pure SVG)
   ========================================================= */

export interface GroupedBarSeries {
  label: string;
  color: string;
  values: number[];
}

@Component({
  selector: "app-analytics-grouped-bar-chart",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-legend" role="list">
      @for (s of series; track s.label) {
        <span class="legend-chip" role="listitem">
          <span class="legend-dot" [style.background]="s.color"></span>
          <span>{{ s.label }}</span>
        </span>
      }
    </div>
    <div
      class="bars-wrap"
      (mousemove)="onHover($event)"
      (mouseleave)="hoverIndex = null"
    >
      <svg
        viewBox="0 0 640 260"
        preserveAspectRatio="none"
        class="bars-svg"
        role="img"
        aria-label="Bar chart"
      >
        @for (grid of gridlines; track grid.y) {
          <line
            x1="36"
            [attr.y1]="grid.y"
            x2="640"
            [attr.y2]="grid.y"
            class="grid-line"
          />
          <text x="2" [attr.y]="grid.y + 4" class="grid-label">
            {{ grid.value }}
          </text>
        }
        @for (bar of bars; track $index) {
          <rect
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.w"
            [attr.height]="bar.h"
            [attr.fill]="bar.color"
            rx="3"
            class="chart-bar-rect"
            [attr.opacity]="
              hoverIndex === null || hoverIndex === bar.group ? 1 : 0.35
            "
          >
            <title>{{ bar.tip }}</title>
          </rect>
        }
      </svg>
      <div class="x-labels" aria-hidden="true">
        @for (label of shownXLabels; track $index) {
          <span>{{ label }}</span>
        }
      </div>
      @if (hoverIndex !== null && categories[hoverIndex]) {
        <div
          class="chart-tooltip"
          [style.left.%]="tooltipLeft"
          [style.top.px]="8"
          role="status"
        >
          <strong>{{ categories[hoverIndex] }}</strong>
          @for (s of series; track s.label) {
            <span class="tooltip-row">
              <span class="legend-dot" [style.background]="s.color"></span>
              {{ s.label }}:
              <strong>{{ s.values[hoverIndex] ?? 0 }}</strong>
              @if (stacked) {
                <span>({{ pctOf(s, hoverIndex) }}%)</span>
              }
            </span>
          }
        </div>
      }
    </div>
    @if (categories.length === 0) {
      <p class="chart-empty">No data in this period yet.</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .chart-bar-rect {
        /* Baseline-anchored vertical growth: each bar scales about its
           own bottom edge (shared 0.75s easeOutQuart entry, simultaneous
           across the group — same timing as the Chart.js bar animation). */
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: barGrowUp 0.75s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        transition: opacity 0.2s ease;
      }
      @keyframes barGrowUp {
        from {
          transform: scaleY(0);
        }
        to {
          transform: scaleY(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .chart-bar-rect {
          animation: none;
        }
      }
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }
      .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        transition: all 0.15s ease;
      }
      .legend-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .bars-wrap {
        position: relative;
      }
      .bars-svg {
        width: 100%;
        height: 260px;
        display: block;
      }
      .grid-line {
        stroke: #f1f5f9;
        stroke-width: 1;
      }
      .grid-label {
        font-size: 11px;
        font-weight: 500;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        fill: #64748b;
      }
      .x-labels {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 500;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        color: #64748b;
        margin-top: 6px;
        overflow: hidden;
      }
      .chart-tooltip {
        position: absolute;
        transform: translateX(-50%);
        background: #1e293b;
        color: #ffffff;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 12px;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          sans-serif;
        pointer-events: none;
        white-space: nowrap;
        z-index: 5;
        box-shadow:
          0 10px 15px -3px rgba(0, 0, 0, 0.1),
          0 4px 6px -2px rgba(0, 0, 0, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .chart-tooltip strong {
        display: block;
        margin-bottom: 4px;
        font-weight: 600;
        color: #f8fafc;
      }
      .tooltip-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .chart-empty {
        color: #8995a6;
        font-size: 13px;
        text-align: center;
        margin: 8px 0 0;
      }
    `,
  ],
})
export class AnalyticsGroupedBarChartComponent {
  @Input() categories: string[] = [];
  @Input() series: GroupedBarSeries[] = [];
  @Input() stacked = false;

  hoverIndex: number | null = null;

  private get totals(): number[] {
    return this.categories.map((_, i) =>
      this.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
    );
  }

  get maxValue(): number {
    if (this.stacked) {
      return Math.max(1, ...this.totals, 1);
    }
    let max = 1;
    for (const s of this.series) {
      for (const v of s.values) {
        if (v > max) {
          max = v;
        }
      }
    }
    return max;
  }

  get gridlines(): { y: number; value: number }[] {
    const max = this.maxValue;
    const step = max / 4;
    return [0, 1, 2, 3, 4].map((i) => ({
      y: 236 - (236 - 16) * (i / 4),
      value: Math.round(step * i),
    }));
  }

  get shownXLabels(): string[] {
    if (this.categories.length <= 6) {
      return this.categories;
    }
    const first = this.categories[0] ?? "";
    const mid = this.categories[Math.floor(this.categories.length / 2)] ?? "";
    const last = this.categories[this.categories.length - 1] ?? "";
    return [first, mid, last];
  }

  get bars(): {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    group: number;
    tip: string;
  }[] {
    const n = this.categories.length;
    if (n === 0) {
      return [];
    }
    const plotW = 640 - 36 - 10;
    const groupW = plotW / n;
    const count = Math.max(this.series.length, 1);
    const barW = this.stacked
      ? Math.min(44, groupW * 0.55)
      : Math.min(30, (groupW - 6) / count);
    const yFor = (v: number): number => 236 - ((236 - 16) * v) / this.maxValue;
    const out: {
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      group: number;
      tip: string;
    }[] = [];
    this.categories.forEach((cat, i) => {
      const groupX = 36 + i * groupW;
      if (this.stacked) {
        let acc = 0;
        for (const s of this.series) {
          const v = s.values[i] ?? 0;
          const y1 = yFor(acc + v);
          out.push({
            x: groupX + (groupW - barW) / 2,
            y: y1,
            w: barW,
            h: Math.max(yFor(acc) - y1, v > 0 ? 1.5 : 0),
            color: s.color,
            group: i,
            tip: `${cat}: ${s.label} ${v}`,
          });
          acc += v;
        }
      } else {
        const totalW = barW * this.series.length;
        this.series.forEach((s, j) => {
          const v = s.values[i] ?? 0;
          const y1 = yFor(v);
          out.push({
            x: groupX + (groupW - totalW) / 2 + j * barW,
            y: y1,
            w: Math.max(barW - 2, 2),
            h: Math.max(236 - y1, v > 0 ? 1.5 : 0),
            color: s.color,
            group: i,
            tip: `${cat}: ${s.label} ${v}`,
          });
        });
      }
    });
    return out;
  }

  get tooltipLeft(): number {
    if (this.hoverIndex === null || this.categories.length <= 1) {
      return 50;
    }
    const pct = (this.hoverIndex / (this.categories.length - 1)) * 100;
    return Math.min(88, Math.max(12, pct));
  }

  pctOf(s: GroupedBarSeries, index: number): number {
    const total = this.totals[index] ?? 0;
    if (!total) {
      return 0;
    }
    return Math.round(((s.values[index] ?? 0) / total) * 1000) / 10;
  }

  onHover(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const n = this.categories.length;
    if (!n) {
      this.hoverIndex = null;
      return;
    }
    const adjusted = (ratio * 640 - 36) / (640 - 36);
    this.hoverIndex = Math.min(n - 1, Math.max(0, Math.floor(adjusted * n)));
  }
}

/* =========================================================
   HORIZONTAL BAR CHART (proportional div bars)
   ========================================================= */

@Component({
  selector: "app-analytics-hbar-chart",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="hbar-chart" role="list">
      @for (item of items; track item.label) {
        <div
          class="hbar-row"
          role="listitem"
          [attr.title]="
            item.label +
            ': ' +
            formatValue(item.value) +
            (suffix ? ' ' + suffix : '')
          "
          tabindex="0"
          [attr.aria-label]="item.label + ': ' + formatValue(item.value)"
        >
          <span class="hbar-label" [attr.title]="item.label">{{
            item.label
          }}</span>
          <div class="hbar-bar-area">
            <div
              class="hbar-bar"
              [style.width.%]="widthFor(item.value)"
              [style.background-color]="color || '#3b82f6'"
            ></div>
            <span class="hbar-value"
              >{{ formatValue(item.value)
              }}{{ suffix ? " " + suffix : "" }}</span
            >
          </div>
        </div>
      }
      @if (items.length === 0) {
        <p class="hbar-empty">No data in this period yet.</p>
      }
    </div>
  `,
  styles: [
    `
      .hbar-chart {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        padding: 4px 0;
      }
      .hbar-row {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 24px;
        border-radius: 4px;
        transition: background-color 0.15s ease;
      }
      .hbar-row:hover .hbar-label,
      .hbar-row:focus .hbar-label {
        color: #0f172a;
      }
      .hbar-row:hover .hbar-bar,
      .hbar-row:focus .hbar-bar {
        filter: brightness(0.92);
        box-shadow: 0 1px 4px rgba(59, 130, 246, 0.25);
      }
      .hbar-row:focus-visible {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }
      .hbar-label {
        width: 140px;
        min-width: 110px;
        max-width: 180px;
        text-align: right;
        padding-right: 12px;
        font-size: 12px;
        font-weight: 500;
        color: #475569;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
      }
      .hbar-bar-area {
        flex: 1;
        display: flex;
        align-items: center;
        border-left: 1.5px solid #e2e8f0;
        height: 22px;
        min-width: 0;
      }
      .hbar-bar {
        display: block;
        height: 16px;
        border-radius: 0 4px 4px 0;
        min-width: 3px;
        flex-shrink: 0;
        transition:
          width 0.5s cubic-bezier(0.25, 1, 0.5, 1),
          filter 0.2s ease;
        animation: hbarExpand 0.75s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      }
      @keyframes hbarExpand {
        from {
          width: 0 !important;
        }
      }
      .hbar-value {
        margin-left: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        white-space: nowrap;
        flex-shrink: 0;
        opacity: 0;
        animation: hbarValueFade 0.4s ease forwards 0.25s;
      }
      @keyframes hbarValueFade {
        to {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .hbar-bar {
          animation: none !important;
          transition: none !important;
        }
        .hbar-value {
          animation: none !important;
          opacity: 1 !important;
        }
      }
      .hbar-empty {
        color: #64748b;
        font-size: 13px;
        text-align: center;
        margin: 12px 0;
      }
      @media (max-width: 640px) {
        .hbar-label {
          width: 95px;
          min-width: 80px;
          font-size: 11px;
          padding-right: 8px;
        }
        .hbar-bar {
          height: 14px;
        }
        .hbar-value {
          font-size: 10px;
          margin-left: 6px;
        }
      }
    `,
  ],
})
export class AnalyticsHBarChartComponent {
  @Input() items: BarItem[] = [];
  @Input() color = "#3b82f6";
  @Input() suffix = "";

  get maxValue(): number {
    return Math.max(1, ...this.items.map((i) => i.value));
  }

  widthFor(value: number): number {
    if (this.maxValue <= 0 || value <= 0) return 0;
    const pct = (value / this.maxValue) * 78;
    return Math.max(2, Math.min(78, Math.round(pct * 10) / 10));
  }

  formatValue(value: number): string {
    if (value === null || value === undefined) return "0";
    return typeof value === "number" ? value.toLocaleString() : String(value);
  }
}
