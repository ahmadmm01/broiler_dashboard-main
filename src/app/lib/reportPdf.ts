import { jsPDF } from "jspdf";

export type CycleReportKind = "current" | "completed";

export type CycleReportKpi = {
  label: string;
  value: string;
  detail?: string;
};

export type CycleReportSensorMetric = {
  label: string;
  unit: string;
  average: number;
  minimum: number;
  maximum: number;
  exceedanceLabel?: string;
};

export type CycleReportAnalysis = {
  sourceLabel: string;
  generatedAt?: string;
  dataThrough?: string;
  model?: string;
  riskLevel?: string;
  question?: string;
  stale?: boolean;
  summary: string;
  findings: Array<{
    title: string;
    evidence: string;
    interpretation?: string;
  }>;
  actions: Array<{
    timeframe: string;
    action: string;
    reason: string;
  }>;
  monitoring: string[];
};

export type CycleReportPdfModel = {
  kind: CycleReportKind;
  title: string;
  cycleId: string;
  houseName: string;
  zoneLabel: string;
  statusLabel: string;
  periodLabel: string;
  generatedAt: string;
  dataWindow: string;
  sourceLabel: string;
  revision?: number;
  completionNotes?: string;
  kpis: CycleReportKpi[];
  sensorMetrics: CycleReportSensorMetric[];
  sensorSummary: string;
  analysis: CycleReportAnalysis;
};

const PAGE_WIDTH_PX = 900;
const PAGE_HEIGHT_PX = 1273;

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusColors(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("high") || normalized.includes("critical")) {
    return { background: "#fee2e2", foreground: "#991b1b", border: "#fecaca" };
  }
  if (normalized.includes("moderate") || normalized.includes("warning")) {
    return { background: "#fef3c7", foreground: "#92400e", border: "#fde68a" };
  }
  if (normalized.includes("completed")) {
    return { background: "#ede9fe", foreground: "#5b21b6", border: "#ddd6fe" };
  }
  return { background: "#dcfce7", foreground: "#166534", border: "#bbf7d0" };
}

function pageFrame(
  model: CycleReportPdfModel,
  pageNumber: number,
  content: string
) {
  const colors = statusColors(model.statusLabel);
  return `
    <section
      data-report-page="${pageNumber}"
      style="
        box-sizing:border-box;
        width:${PAGE_WIDTH_PX}px;
        height:${PAGE_HEIGHT_PX}px;
        overflow:hidden;
        position:relative;
        padding:48px 52px 58px;
        background:#ffffff;
        color:#172033;
        font-family:Arial, Helvetica, sans-serif;
      "
    >
      <header style="display:flex;justify-content:space-between;gap:28px;border-bottom:3px solid #2563eb;padding-bottom:18px;margin-bottom:24px;">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#2563eb;">iSENS-COOP</div>
          <h1 style="margin:5px 0 0;font-size:29px;line-height:1.15;color:#0f172a;">${escapeHtml(model.title)}</h1>
          <p style="margin:7px 0 0;font-size:13px;color:#64748b;">Smart Sensing System for Poultry House Monitoring</p>
        </div>
        <div style="min-width:180px;text-align:right;">
          <span style="display:inline-block;border:1px solid ${colors.border};border-radius:999px;padding:7px 12px;background:${colors.background};color:${colors.foreground};font-size:12px;font-weight:700;">${escapeHtml(model.statusLabel)}</span>
          <div style="margin-top:10px;font-size:11px;line-height:1.5;color:#64748b;">Generated<br/><strong style="color:#334155;">${escapeHtml(model.generatedAt)}</strong></div>
        </div>
      </header>

      ${content}

      <footer style="position:absolute;left:52px;right:52px;bottom:24px;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#64748b;">
        <span>${escapeHtml(model.cycleId)} - ${escapeHtml(model.zoneLabel)}</span>
        <span>Page ${pageNumber} of 3</span>
      </footer>
    </section>
  `;
}

function reportIdentity(model: CycleReportPdfModel) {
  const items = [
    ["House", model.houseName],
    ["Zone", model.zoneLabel],
    ["Cycle ID", model.cycleId],
    ["Period", model.periodLabel],
    ["Data source", model.sourceLabel],
    ["Data window", model.dataWindow],
  ];

  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:22px;">
      ${items
        .map(
          ([label, value]) => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:11px 13px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#64748b;">${escapeHtml(label)}</div>
              <div style="margin-top:4px;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function kpiGrid(kpis: CycleReportKpi[]) {
  return `
    <section style="margin-bottom:22px;">
      <h2 style="margin:0 0 11px;font-size:18px;color:#0f172a;">Production performance</h2>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;">
        ${kpis
          .slice(0, 8)
          .map(
            (kpi) => `
              <div style="min-height:74px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;padding:11px;">
                <div style="font-size:10px;color:#64748b;">${escapeHtml(kpi.label)}</div>
                <div style="margin-top:5px;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(kpi.value)}</div>
                ${
                  kpi.detail
                    ? `<div style="margin-top:4px;font-size:9px;line-height:1.35;color:#64748b;">${escapeHtml(kpi.detail)}</div>`
                    : ""
                }
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function sensorTable(model: CycleReportPdfModel) {
  return `
    <section>
      <div style="display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:10px;">
        <h2 style="margin:0;font-size:18px;color:#0f172a;">Environmental performance</h2>
        <span style="font-size:10px;color:#64748b;">Average and observed range</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f1f5f9;color:#334155;">
            <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;">Metric</th>
            <th style="border:1px solid #cbd5e1;padding:8px;text-align:right;">Average</th>
            <th style="border:1px solid #cbd5e1;padding:8px;text-align:right;">Minimum</th>
            <th style="border:1px solid #cbd5e1;padding:8px;text-align:right;">Maximum</th>
            <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;">Review</th>
          </tr>
        </thead>
        <tbody>
          ${model.sensorMetrics
            .map(
              (metric) => `
                <tr>
                  <td style="border:1px solid #e2e8f0;padding:8px;font-weight:700;">${escapeHtml(metric.label)}</td>
                  <td style="border:1px solid #e2e8f0;padding:8px;text-align:right;">${escapeHtml(metric.average.toFixed(metric.label === "CO2" ? 0 : 2))} ${escapeHtml(metric.unit)}</td>
                  <td style="border:1px solid #e2e8f0;padding:8px;text-align:right;">${escapeHtml(metric.minimum.toFixed(metric.label === "CO2" ? 0 : 2))}</td>
                  <td style="border:1px solid #e2e8f0;padding:8px;text-align:right;">${escapeHtml(metric.maximum.toFixed(metric.label === "CO2" ? 0 : 2))}</td>
                  <td style="border:1px solid #e2e8f0;padding:8px;color:#475569;">${escapeHtml(metric.exceedanceLabel ?? "Reference only")}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      <div style="margin-top:10px;border:1px solid #bbf7d0;border-radius:9px;background:#f0fdf4;padding:10px 12px;font-size:11px;line-height:1.45;color:#166534;">
        ${escapeHtml(model.sensorSummary)}
      </div>
    </section>
  `;
}

function analysisMetadata(analysis: CycleReportAnalysis) {
  const details = [
    analysis.sourceLabel,
    analysis.model ? `Model: ${analysis.model}` : null,
    analysis.generatedAt ? `Generated: ${analysis.generatedAt}` : null,
    analysis.dataThrough ? `Data through: ${analysis.dataThrough}` : null,
  ].filter(Boolean);

  return `
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:15px;">
      ${details
        .map(
          (detail) =>
            `<span style="border:1px solid #c4b5fd;border-radius:999px;background:#f5f3ff;padding:5px 9px;font-size:10px;font-weight:700;color:#5b21b6;">${escapeHtml(detail ?? "")}</span>`
        )
        .join("")}
      ${
        analysis.riskLevel
          ? `<span style="border:1px solid #fecaca;border-radius:999px;background:#fef2f2;padding:5px 9px;font-size:10px;font-weight:700;color:#991b1b;">${escapeHtml(analysis.riskLevel)} risk</span>`
          : ""
      }
      ${
        analysis.stale
          ? '<span style="border:1px solid #fde68a;border-radius:999px;background:#fffbeb;padding:5px 9px;font-size:10px;font-weight:700;color:#92400e;">Newer sensor data is available</span>'
          : ""
      }
    </div>
  `;
}

function findingsPage(model: CycleReportPdfModel) {
  const analysis = model.analysis;
  return pageFrame(
    model,
    2,
    `
      ${analysisMetadata(analysis)}
      ${
        analysis.question
          ? `<div style="margin-bottom:14px;border-left:4px solid #7c3aed;background:#f5f3ff;padding:10px 12px;font-size:11px;color:#5b21b6;"><strong>Analysis question:</strong> ${escapeHtml(analysis.question)}</div>`
          : ""
      }
      <section style="margin-bottom:20px;border:1px solid #c4b5fd;border-radius:12px;background:#faf5ff;padding:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7c3aed;">Analysis summary</div>
        <p style="margin:8px 0 0;font-size:13px;line-height:1.58;color:#334155;">${escapeHtml(analysis.summary)}</p>
      </section>

      <section>
        <h2 style="margin:0 0 11px;font-size:18px;color:#0f172a;">Key findings and evidence</h2>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;">
          ${analysis.findings
            .slice(0, 4)
            .map(
              (finding, index) => `
                <article style="min-height:174px;border:1px solid #e2e8f0;border-radius:11px;padding:13px;background:#ffffff;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:999px;background:#e0e7ff;color:#4338ca;font-size:11px;font-weight:700;">${index + 1}</span>
                    <h3 style="margin:0;font-size:13px;color:#0f172a;">${escapeHtml(finding.title)}</h3>
                  </div>
                  <p style="margin:9px 0 0;font-size:11px;line-height:1.45;color:#475569;"><strong>Evidence:</strong> ${escapeHtml(finding.evidence)}</p>
                  ${
                    finding.interpretation
                      ? `<p style="margin:8px 0 0;font-size:10px;line-height:1.45;color:#64748b;"><strong>Interpretation:</strong> ${escapeHtml(finding.interpretation)}</p>`
                      : ""
                  }
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      ${
        model.completionNotes
          ? `<section style="margin-top:16px;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;padding:11px 13px;font-size:11px;line-height:1.45;color:#166534;"><strong>Completion notes:</strong> ${escapeHtml(model.completionNotes)}</section>`
          : ""
      }
    `
  );
}

function actionsPage(model: CycleReportPdfModel) {
  const analysis = model.analysis;
  return pageFrame(
    model,
    3,
    `
      ${analysisMetadata(analysis)}
      <section>
        <h2 style="margin:0 0 11px;font-size:18px;color:#0f172a;">Priority actions</h2>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          ${analysis.actions
            .slice(0, 5)
            .map(
              (item, index) => `
                <article style="min-height:132px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc;padding:12px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;">${index + 1}</span>
                    <span style="border-radius:999px;background:#ffffff;padding:4px 7px;font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;">${escapeHtml(item.timeframe)}</span>
                  </div>
                  <div style="margin-top:8px;font-size:12px;font-weight:700;line-height:1.35;color:#0f172a;">${escapeHtml(item.action)}</div>
                  <div style="margin-top:6px;font-size:10px;line-height:1.4;color:#64748b;">${escapeHtml(item.reason)}</div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      <section style="margin-top:20px;border:1px solid #bae6fd;border-radius:11px;background:#f0f9ff;padding:14px;">
        <h2 style="margin:0;font-size:16px;color:#0c4a6e;">Monitoring focus</h2>
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;">
          ${analysis.monitoring
            .slice(0, 6)
            .map(
              (item) =>
                `<span style="border:1px solid #bae6fd;border-radius:999px;background:#ffffff;padding:6px 9px;font-size:10px;color:#075985;">${escapeHtml(item)}</span>`
            )
            .join("")}
        </div>
      </section>

      <section style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:15px;">
        <h2 style="margin:0 0 7px;font-size:14px;color:#334155;">Interpretation and limitations</h2>
        <p style="margin:0;font-size:10px;line-height:1.55;color:#64748b;">
          This report supports monitoring and operational review. AI-assisted content uses the stored or current dashboard snapshot identified above. It does not diagnose disease, replace flock inspection, or replace verified farm records. Confirm recommendations with farm management and qualified veterinary support when unusual health findings are observed.
        </p>
      </section>
    `
  );
}

export function buildCycleReportHtmlPages(model: CycleReportPdfModel) {
  const firstPage = pageFrame(
    model,
    1,
    `
      ${reportIdentity(model)}
      ${kpiGrid(model.kpis)}
      ${sensorTable(model)}
    `
  );

  return [firstPage, findingsPage(model), actionsPage(model)];
}

export function createCycleReportPdf(model: CycleReportPdfModel) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: false,
  });
  const clean = (value: string | number | undefined) =>
    String(value ?? "")
      .replaceAll("CO₂", "CO2")
      .replaceAll("NH₃", "NH3")
      .replaceAll("PM₂.₅", "PM2.5")
      .replaceAll("µ", "u")
      .replaceAll("²", "2")
      .replaceAll("³", "3")
      .replaceAll("°", " deg ")
      .replaceAll("–", "-")
      .replaceAll("—", "-")
      .replaceAll("·", "-")
      .replace(/[^\x20-\x7E]/g, "");
  const wrap = (value: string, width: number) =>
    pdf.splitTextToSize(clean(value), width) as string[];
  const box = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: [number, number, number],
    border: [number, number, number]
  ) => {
    pdf.setFillColor(...fill);
    pdf.setDrawColor(...border);
    pdf.roundedRect(x, y, width, height, 2.5, 2.5, "FD");
  };
  const header = (pageNumber: number) => {
    const pageTitle =
      pageNumber === 1
        ? model.title
        : pageNumber === 2
          ? "Analysis & Evidence"
          : "Actions & Monitoring";
    const pageSubtitle =
      pageNumber === 1
        ? "Smart Sensing System for Poultry House Monitoring"
        : `${model.cycleId} / ${model.zoneLabel}`;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(37, 99, 235);
    pdf.text(`iSENS-COOP / REPORT ${pageNumber}`, 14, 13);
    pdf.setFontSize(19);
    pdf.setTextColor(15, 23, 42);
    pdf.text(clean(pageTitle), 14, 24);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(clean(pageSubtitle), 14, 30);
    const status = clean(model.statusLabel);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    const statusWidth = Math.min(67, pdf.getTextWidth(status) + 9);
    box(196 - statusWidth, 10, statusWidth, 10, [254, 242, 242], [254, 202, 202]);
    pdf.setTextColor(153, 27, 27);
    pdf.text(status, 191.5, 16.5, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Generated ${clean(model.generatedAt)} / P${pageNumber}`, 196, 27.5, {
      align: "right",
    });
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(0.8);
    pdf.line(14, 34, 196, 34);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.25);
    pdf.line(14, 286, 196, 286);
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${clean(model.cycleId)} - ${clean(model.zoneLabel)}`, 14, 291);
    pdf.text(`Page ${pageNumber} of 3`, 196, 291, { align: "right" });
  };
  const sectionTitle = (title: string, y: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text(clean(title), 14, y);
  };
  const analysisMeta = (y: number) => {
    const values = [
      model.analysis.sourceLabel,
      model.analysis.model ? `Model: ${model.analysis.model}` : "",
      model.analysis.generatedAt
        ? `Generated: ${model.analysis.generatedAt}`
        : "",
      model.analysis.dataThrough
        ? `Data through: ${model.analysis.dataThrough}`
        : "",
      model.analysis.riskLevel
        ? `${model.analysis.riskLevel} risk`
        : "",
    ].filter(Boolean);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(91, 33, 182);
    pdf.text(wrap(values.join(" | "), 182), 14, y);
  };

  const identity = [
    ["House", model.houseName],
    ["Zone", model.zoneLabel],
    ["Cycle ID", model.cycleId],
    ["Period", model.periodLabel],
    ["Data source", model.sourceLabel],
    ["Data window", model.dataWindow],
  ];
  identity.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 14 : 107;
    const y = 41 + row * 19;
    box(x, y, 89, 16, [248, 250, 252], [226, 232, 240]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(clean(label).toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text(wrap(value, 82).slice(0, 2), x + 3, y + 11);
  });
  sectionTitle("Production performance", 105);
  model.kpis.slice(0, 8).forEach((kpi, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = 14 + column * 46.5;
    const y = 111 + row * 25;
    box(x, y, 43.5, 22, [239, 246, 255], [219, 234, 254]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(clean(kpi.label), x + 3, y + 5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(clean(kpi.value), x + 3, y + 13);
    if (kpi.detail) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(100, 116, 139);
      pdf.text(clean(kpi.detail), x + 3, y + 18);
    }
  });
  sectionTitle("Environmental performance", 169);
  const columns = [14, 52, 79, 106, 133, 196];
  const headings = ["Metric", "Average", "Minimum", "Maximum", "Review"];
  pdf.setFillColor(241, 245, 249);
  pdf.rect(14, 174, 182, 9, "F");
  headings.forEach((heading, index) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(51, 65, 85);
    pdf.text(clean(heading), columns[index] + 2, 180);
  });
  model.sensorMetrics.slice(0, 5).forEach((metric, row) => {
    const y = 183 + row * 11;
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(14, y, 182, 11);
    const decimals = clean(metric.label) === "CO2" ? 0 : 2;
    const values = [
      clean(metric.label),
      `${metric.average.toFixed(decimals)} ${clean(metric.unit)}`,
      metric.minimum.toFixed(decimals),
      metric.maximum.toFixed(decimals),
    ];
    values.forEach((value, index) => {
      pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(51, 65, 85);
      pdf.text(value, columns[index] + 2, y + 7);
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.3);
    pdf.text(
      wrap(metric.exceedanceLabel ?? "Reference only", 59).slice(0, 2),
      columns[4] + 2,
      y + 4.5
    );
  });
  box(14, 242, 182, 18, [240, 253, 244], [187, 247, 208]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(22, 101, 52);
  pdf.text(wrap(model.sensorSummary, 174).slice(0, 3), 18, 248);
  header(1);

  pdf.addPage();
  analysisMeta(42);
  let summaryY = 50;
  if (model.analysis.question) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(91, 33, 182);
    pdf.text(
      wrap(`Analysis question: ${model.analysis.question}`, 182).slice(0, 2),
      14,
      48
    );
    summaryY = 57;
  }
  box(14, summaryY, 182, 34, [250, 245, 255], [196, 181, 253]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(124, 58, 237);
  pdf.text("ANALYSIS SUMMARY", 18, summaryY + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text(
    wrap(model.analysis.summary, 174).slice(0, 6),
    18,
    summaryY + 14
  );
  sectionTitle("Key findings and evidence", summaryY + 44);
  model.analysis.findings.slice(0, 4).forEach((finding, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 14 : 107;
    const y = summaryY + 50 + row * 63;
    box(x, y, 89, 58, [255, 255, 255], [226, 232, 240]);
    pdf.setFillColor(224, 231, 255);
    pdf.circle(x + 6, y + 7, 4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(67, 56, 202);
    pdf.text(String(index + 1), x + 6, y + 9, { align: "center" });
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text(wrap(finding.title, 73).slice(0, 2), x + 12, y + 7);
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    pdf.text(
      wrap(`Evidence: ${finding.evidence}`, 81).slice(0, 5),
      x + 4,
      y + 20
    );
    if (finding.interpretation) {
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        wrap(`Interpretation: ${finding.interpretation}`, 81).slice(0, 3),
        x + 4,
        y + 42
      );
    }
  });
  if (model.completionNotes) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(22, 101, 52);
    pdf.text(
      wrap(`Completion notes: ${model.completionNotes}`, 182).slice(0, 2),
      14,
      274
    );
  }
  header(2);

  pdf.addPage();
  analysisMeta(42);
  sectionTitle("Priority actions", 52);
  model.analysis.actions.slice(0, 5).forEach((action, index) => {
    const isFifth = index === 4;
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = isFifth ? 14 : column === 0 ? 14 : 107;
    const y = isFifth ? 161 : 58 + row * 50;
    const width = isFifth ? 182 : 89;
    const height = isFifth ? 37 : 45;
    box(x, y, width, height, [248, 250, 252], [226, 232, 240]);
    pdf.setFillColor(219, 234, 254);
    pdf.circle(x + 6, y + 7, 4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(29, 78, 216);
    pdf.text(String(index + 1), x + 6, y + 9, { align: "center" });
    pdf.setFontSize(6);
    pdf.setTextColor(100, 116, 139);
    pdf.text(clean(action.timeframe).toUpperCase(), x + width - 4, y + 7, {
      align: "right",
      maxWidth: width - 20,
    });
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(
      wrap(action.action, width - 8).slice(0, isFifth ? 2 : 3),
      x + 4,
      y + 16
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      wrap(action.reason, width - 8).slice(0, 3),
      x + 4,
      y + (isFifth ? 27 : 32)
    );
  });
  box(14, 203, 182, 25, [240, 249, 255], [186, 230, 253]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(12, 74, 110);
  pdf.text("Monitoring focus", 18, 211);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(
    wrap(model.analysis.monitoring.join(" | "), 174).slice(0, 3),
    18,
    218
  );
  pdf.setDrawColor(226, 232, 240);
  pdf.line(14, 238, 196, 238);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(51, 65, 85);
  pdf.text("Interpretation and limitations", 14, 246);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    wrap(
      "This report supports monitoring and operational review. AI-assisted content uses the dashboard snapshot identified above. It does not diagnose disease, replace flock inspection, or replace verified farm records. Confirm recommendations with farm management and qualified veterinary support when unusual health findings are observed.",
      182
    ).slice(0, 5),
    14,
    252
  );
  header(3);

  const safeCycleId = model.cycleId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix =
    model.kind === "current"
      ? "current_cycle_report"
      : "completed_cycle_report";
  const now = new Date();
  const reportTimestamp = [
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-"),
    [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(""),
  ].join("_");
  return {
    pdf,
    filename: `${prefix}_${safeCycleId}_${reportTimestamp}.pdf`,
  };
}

export function downloadCycleReportPdf(model: CycleReportPdfModel) {
  const { pdf, filename } = createCycleReportPdf(model);
  pdf.save(filename);
}
