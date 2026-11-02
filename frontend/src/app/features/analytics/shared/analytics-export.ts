import type { PersonalAnalyticsOverview } from "../../../core/services/analytics.service";

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Download the visible analytics as an Excel-compatible CSV file. */
export function downloadAnalyticsCsv(
  role: string,
  data: PersonalAnalyticsOverview,
): void {
  const lines: string[][] = [];
  lines.push(["PolicyGPT Analytics Report"]);
  lines.push(["Role", role]);
  lines.push(["Period", `${data.window.from} to ${data.window.to}`]);
  lines.push(["Generated", data.generated_at]);
  lines.push([]);
  lines.push(["KPI", "Value", "Change vs previous period (%)"]);
  for (const [key, kpi] of Object.entries(data.kpis)) {
    lines.push([
      key,
      kpi.tracked === false ? "Not tracked" : String(kpi.value ?? 0),
      kpi.delta_pct === null || kpi.delta_pct === undefined
        ? "n/a"
        : String(kpi.delta_pct),
    ]);
  }
  lines.push([]);
  lines.push(["Trend", "Searches", "Saved policies", "Saved schemes", "Notifications"]);
  for (const point of data.trend) {
    lines.push([
      point.label,
      String(point.searches),
      String(point.saved_policies),
      String(point.saved_schemes),
      String(point.notifications),
    ]);
  }
  lines.push([]);
  lines.push(["Top search", "Count", "Share (%)"]);
  for (const row of data.top_searches) {
    lines.push([row.keyword, String(row.count), String(row.pct)]);
  }
  lines.push([]);
  lines.push(["Saved policy", "Category", "Saved on"]);
  for (const row of data.saved_policies) {
    lines.push([row.title, row.category ?? "", row.saved_on ?? ""]);
  }
  lines.push([]);
  lines.push(["Saved scheme", "Category", "Saved on"]);
  for (const row of data.saved_schemes) {
    lines.push([row.title, row.category ?? "", row.saved_on ?? ""]);
  }

  const csv = lines.map((row) => row.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${role}_analytics_${data.window.to}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Print the current page (user saves as PDF). Filename is set at save time. */
export function printAnalyticsPdf(): void {
  window.print();
}

export interface ResearcherTrendsExportInput {
  rangeLabel: string;
  customFrom?: string;
  customTo?: string;
  trends: {
    scope: string;
    generated_at: string;
    policies: {
      total_approved: number;
      by_category: { category: string; count: number }[];
      trend: { year: number; month: number; count: number }[];
    };
    schemes: {
      total_approved: number;
      by_category: { category: string; count: number }[];
      trend: { year: number; month: number; count: number }[];
    };
  } | null;
  overview: {
    window: { range: string; from: string; to: string };
    generated_at: string;
    kpis: Record<string, { value: number | null }>;
    trend: { label: string; searches: number }[];
    top_searches: { keyword: string; count: number; pct: number }[];
  } | null;
  trendLabels: string[];
  trendSeries: { label: string; values: number[] }[];
}

/**
 * Download the Researcher Trends page as an Excel-compatible CSV file.
 * Exports the currently selected range with live approved-corpus totals,
 * the visible publication window and the researcher's own search activity
 * from the same range — no placeholder data.
 */
export function downloadResearcherTrendsCsv(input: ResearcherTrendsExportInput): void {
  const period =
    input.customFrom && input.customTo
      ? `${input.customFrom} to ${input.customTo}`
      : input.overview
        ? `${input.overview.window.from} to ${input.overview.window.to} (${input.rangeLabel})`
        : input.rangeLabel;
  const stamp = (input.customFrom && input.customTo
    ? `${input.customFrom}_to_${input.customTo}`
    : (input.overview?.window.to ?? new Date().toISOString().slice(0, 10))
  ).replace(/[^0-9A-Za-z_-]/g, "");
  const lines: string[][] = [];
  lines.push(["PolicyGPT Researcher Trends Report"]);
  lines.push(["Corpus scope", input.trends?.scope ?? "APPROVED"]);
  lines.push(["Selected range", input.rangeLabel]);
  lines.push(["Period", period]);
  lines.push(["Generated", input.trends?.generated_at ?? new Date().toISOString()]);
  lines.push([]);
  lines.push(["Metric", "Value"]);
  lines.push(["Approved Policies", String(input.trends?.policies.total_approved ?? 0)]);
  lines.push(["Approved Schemes", String(input.trends?.schemes.total_approved ?? 0)]);
  lines.push(["My Searches", String(input.overview?.kpis["total_searches"]?.value ?? 0)]);
  const ownSaved =
    (input.overview?.kpis["saved_policies"]?.value ?? 0) +
    (input.overview?.kpis["saved_schemes"]?.value ?? 0);
  lines.push(["My Saved Items", String(ownSaved)]);
  lines.push([]);
  lines.push(["Publication window", ...input.trendLabels]);
  for (const s of input.trendSeries) {
    lines.push([s.label, ...s.values.map((v) => String(v))]);
  }
  lines.push([]);
  lines.push(["Policy category", "Count"]);
  for (const row of input.trends?.policies.by_category ?? []) {
    lines.push([row.category, String(row.count)]);
  }
  lines.push([]);
  lines.push(["Scheme category", "Count"]);
  for (const row of input.trends?.schemes.by_category ?? []) {
    lines.push([row.category, String(row.count)]);
  }
  lines.push([]);
  lines.push(["Top search", "Count", "Share (%)"]);
  for (const row of input.overview?.top_searches ?? []) {
    lines.push([row.keyword, String(row.count), String(row.pct)]);
  }

  const csv = lines.map((row) => row.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `researcher_trends_${stamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export interface GovtCsvSection {
  heading: string;
  headers: string[];
  rows: (string | number)[][];
}

/** Download a government analytics page as an Excel-compatible CSV file. */
export function downloadGovtCsv(
  reportTitle: string,
  filePrefix: string,
  periodTo: string,
  periodFrom: string,
  kpis: [string, string | number][],
  sections: GovtCsvSection[],
): void {
  const lines: string[][] = [];
  lines.push([reportTitle]);
  lines.push(["Period", `${periodFrom} to ${periodTo}`]);
  lines.push(["Generated", new Date().toISOString()]);
  lines.push([]);
  lines.push(["Metric", "Value"]);
  for (const [label, value] of kpis) {
    lines.push([label, String(value)]);
  }
  for (const section of sections) {
    lines.push([]);
    lines.push([section.heading]);
    lines.push(section.headers);
    for (const row of section.rows) {
      lines.push(row.map((v) => String(v ?? "")));
    }
  }

  const csv = lines.map((row) => row.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filePrefix}_${periodTo}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
