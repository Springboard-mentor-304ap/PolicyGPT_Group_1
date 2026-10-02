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
    <div class="chart-legend" role="list">
      @for (s of series; track s.key) {
        <button
          type="button"
          class="legend-chip"
          role="listitem"
          [class.legend-chip--off]="hidden.has(s.key)"
          (click)="toggle(s.key)"
          [attr.aria-pressed]="!hidden.has(s.key)"
          [attr.title]="'Toggle ' + s.label"
        >
          <span class="legend-dot" [style.background]="s.color"></span>
          <span>{{ s.label }}</span>
        </button>
      }
    </div>
    <div
      class="line-wrap"
      (mousemove)="onHover($event)"
      (mouseleave)="hoverIndex = null"
    >
      <svg
        #svg
        viewBox="0 0 640 240"
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
          <polyline
            [attr.points]="pointsFor(s)"
            fill="none"
            [attr.stroke]="s.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="chart-polyline"
          />
        }
        @if (hoverIndex !== null) {
          <line
            [attr.x1]="xFor(hoverIndex)"
            [attr.y1]="20"
            [attr.x2]="xFor(hoverIndex)"
            y2="220"
            class="hover-line"
          />
          @for (s of visibleSeries; track s.key) {
            <circle
              [attr.cx]="xFor(hoverIndex)"
              [attr.cy]="yFor(s.values[hoverIndex] ?? 0)"
              r="4"
              [attr.fill]="s.color"
              stroke="#fff"
              stroke-width="2"
            />
          }
        }
      </svg>
      <div class="x-labels" aria-hidden="true">
        <span>{{ firstLabel }}</span>
        <span>{{ midLabel }}</span>
        <span>{{ lastLabel }}</span>
      </div>
      @if (hoverIndex !== null) {
        <div
          class="chart-tooltip"
          [style.left.%]="tooltipLeft"
          [style.top.px]="8"
          role="status"
        >
          <strong>{{ labels[hoverIndex] }}</strong>
          @for (s of visibleSeries; track s.key) {
            <span class="tooltip-row">
              <span
                class="legend-dot"
                [style.background]="s.color"
              ></span>
              {{ s.label }}: <strong>{{ s.values[hoverIndex] ?? 0 }}</strong>
            </span>
          }
        </div>
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
      .chart-polyline {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: drawLine 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes drawLine {
        to {
          stroke-dashoffset: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .chart-polyline {
          stroke-dasharray: none;
          stroke-dashoffset: 0;
          animation: none;
        }
      }
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #dbe2eb;
        background: #fff;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
      }
      .legend-chip:hover {
        border-color: #94a3b8;
      }
      .legend-chip--off {
        opacity: 0.45;
      }
      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .line-wrap {
        position: relative;
      }
      .line-svg {
        width: 100%;
        height: 240px;
        display: block;
      }
      .grid-line {
        stroke: #e8edf3;
        stroke-width: 1;
      }
      .grid-label {
        font-size: 11px;
        fill: #94a3b8;
      }
      .hover-line {
        stroke: #94a3b8;
        stroke-width: 1;
        stroke-dasharray: 4 3;
      }
      .x-labels {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
      }
      .chart-tooltip {
        position: absolute;
        transform: translateX(-50%);
        background: #0f172a;
        color: #fff;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        pointer-events: none;
        white-space: nowrap;
        z-index: 5;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.3);
      }
      .chart-tooltip strong {
        display: block;
        margin-bottom: 4px;
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
export class AnalyticsLineChartComponent {
  @Input() series: LineSeries[] = [];
  @Input() labels: string[] = [];

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
    return this.maxValue <= 1 && this.series.every((s) => s.values.every((v) => v === 0));
  }

  get gridlines(): { y: number; value: number }[] {
    const max = this.maxValue;
    const step = max / 4;
    return [0, 1, 2, 3, 4].map((i) => ({
      y: 220 - (220 - 20) * (i / 4),
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
    const n = Math.max(this.labels.length - 1, 1);
    return 36 + ((640 - 36) * index) / n;
  }

  yFor(value: number): number {
    return 220 - ((220 - 20) * value) / this.maxValue;
  }

  pointsFor(s: LineSeries): string {
    return s.values.map((v, i) => `${this.xFor(i)},${this.yFor(v)}`).join(" ");
  }

  onHover(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const n = Math.max(this.labels.length - 1, 1);
    // Account for the 36-unit left gutter in a 640-unit viewBox.
    const adjusted = (ratio * 640 - 36) / (640 - 36);
    this.hoverIndex = Math.min(n, Math.max(0, Math.round(adjusted * n)));
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
        <svg viewBox="0 0 160 160" class="donut-svg" role="img" aria-label="Activity by type chart">
          <circle cx="80" cy="80" r="62" fill="none" stroke="#eef2f7" stroke-width="26" />
          @for (arc of arcs; track arc.label) {
            <circle
              cx="80"
              cy="80"
              r="62"
              fill="none"
              [attr.stroke]="arc.color"
              stroke-width="26"
              [attr.stroke-dasharray]="arc.dash"
              [attr.stroke-dashoffset]="arc.offset"
              [attr.opacity]="activeLabel === null || activeLabel === arc.label ? 1 : 0.35"
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
            <span class="donut-legend-value">{{ arc.count }} · {{ arc.pct }}%</span>
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
        animation: donutSpinIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
      .donut-segment {
        transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                    stroke-dasharray 0.6s ease,
                    stroke-width 0.2s ease,
                    opacity 0.2s ease;
      }
      @media (prefers-reduced-motion: reduce) {
        .donut-svg {
          animation: none;
        }
        .donut-segment {
          transition: none;
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
        font-size: 26px;
        font-weight: 800;
        color: #172033;
        line-height: 1;
      }
      .donut-center span {
        font-size: 11px;
        color: #8995a6;
        font-weight: 600;
        margin-top: 4px;
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
        font-size: 12.5px;
        padding: 4px 8px;
        border-radius: 6px;
      }
      .donut-legend--active {
        background: #f1f5f9;
      }
      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .donut-legend-label {
        color: #334155;
        font-weight: 600;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .donut-legend-value {
        color: #64748b;
        font-weight: 700;
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

  get arcs(): { label: string; count: number; color: string; pct: number; dash: string; offset: number; description?: string }[] {
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
        transform-origin: center bottom;
        animation: barGrowUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
        margin-bottom: 12px;
      }
      .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #dbe2eb;
        background: #fff;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
      }
      .legend-dot {
        width: 10px;
        height: 10px;
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
        stroke: #e8edf3;
        stroke-width: 1;
      }
      .grid-label {
        font-size: 11px;
        fill: #94a3b8;
      }
      .x-labels {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
        overflow: hidden;
      }
      .chart-tooltip {
        position: absolute;
        transform: translateX(-50%);
        background: #0f172a;
        color: #fff;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        pointer-events: none;
        white-space: nowrap;
        z-index: 5;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.3);
      }
      .chart-tooltip strong {
        display: block;
        margin-bottom: 4px;
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
    <div class="hbar-list" role="list">
      @for (item of items; track item.label) {
        <div
          class="hbar-row"
          role="listitem"
          [attr.title]="item.label + ': ' + item.value + (suffix ? ' ' + suffix : '')"
          tabindex="0"
          [attr.aria-label]="item.label + ': ' + item.value"
        >
          <span class="hbar-label">{{ item.label }}</span>
          <span class="hbar-track">
            <span
              class="hbar-fill"
              [style.width.%]="widthFor(item.value)"
              [style.background]="color"
            ></span>
          </span>
          <span class="hbar-value">{{ item.value }}{{ suffix ? " " + suffix : "" }}</span>
        </div>
      }
      @if (items.length === 0) {
        <p class="hbar-empty">No data in this period yet.</p>
      }
    </div>
  `,
  styles: [
    `
      .hbar-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hbar-row {
        display: grid;
        grid-template-columns: minmax(110px, 180px) 1fr auto;
        gap: 10px;
        align-items: center;
        border-radius: 6px;
      }
      .hbar-row:hover .hbar-fill,
      .hbar-row:focus .hbar-fill {
        filter: brightness(0.92);
      }
      .hbar-label {
        font-size: 12.5px;
        font-weight: 600;
        color: #334155;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hbar-track {
        height: 10px;
        background: #eef2f7;
        border-radius: 999px;
        overflow: hidden;
      }
      .hbar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        min-width: 4px;
        transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        animation: hbarExpand 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes hbarExpand {
        from {
          width: 0 !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .hbar-fill {
          animation: none;
          transition: none;
        }
      }
      .hbar-value {
        font-size: 12.5px;
        font-weight: 700;
        color: #172033;
        min-width: 44px;
        text-align: right;
      }
      .hbar-empty {
        color: #8995a6;
        font-size: 13px;
        text-align: center;
        margin: 8px 0 0;
      }
    `,
  ],
})
export class AnalyticsHBarChartComponent {
  @Input() items: BarItem[] = [];
  @Input() color = "#1461a0";
  @Input() suffix = "";

  get maxValue(): number {
    return Math.max(1, ...this.items.map((i) => i.value));
  }

  widthFor(value: number): number {
    return Math.max(2, (value / this.maxValue) * 100);
  }
}
