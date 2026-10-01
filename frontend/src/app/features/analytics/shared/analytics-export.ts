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
