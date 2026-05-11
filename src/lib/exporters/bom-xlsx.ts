// Calculator-format BOM workbook builder. Produces a multi-sheet .xlsx that
// mirrors the Azure / AWS / GCP Pricing Calculator export shape so customers
// can re-import the file directly into the vendor calculator or paste rows
// into a CSP / EA scenario.
//
// Reference shape (from Azure Pricing Calculator export):
//   Sheet "Summary":  pivot — Service category × Estimated monthly cost,
//                     Grand Total, ACR / year, optional Azure Frontier
//                     credit estimate.
//   Sheet "Landing Zone" / "Workloads":  detail rows with columns:
//     Service category | Service type | Custom name | Region | Description |
//     Estimated monthly cost | Estimated upfront cost | Database
//
// The LLM emits a JSON block of BomLineItem[] alongside the markdown BOM;
// the BOM route parses it, saves it to deliverable.metadata.lineItems,
// and this exporter renders it into the workbook on download.

import * as XLSX from "xlsx";
import type { CloudType } from "@/lib/pricing/types";

export type BomLineItem = {
  // Which sheet the row goes on. Landing Zone = infrastructure baseline;
  // Workloads = per-VM / per-PaaS / per-DB lines.
  section: "landing_zone" | "workload";
  // Vendor service-category label (Azure: "Networking" / "Security" /
  // "Storage" / etc.; AWS: "Compute" / "Database"; GCP: "Compute" / ...)
  category: string;
  // Vendor product name ("Virtual Machines" / "Azure SQL Database" /
  // "Application Gateway" / "EC2" / "RDS").
  serviceType: string;
  // Human-readable instance label. For workloads, include the source
  // hostname + business name (e.g. "PKTINFORWMS_DB1 (INFOR-MSSQL-DB)").
  // For LZ rows, "Hub VNet" / "Azure Firewall (hub)" / etc.
  customName: string;
  // Region label (Azure: "Malaysia West", AWS: "ap-southeast-5", GCP: "asia-southeast2").
  region: string;
  // Long-form spec: SKU, vCPU, RAM, term, OS, SQL licence, disks,
  // network. Mirrors the calculator's Description column.
  description: string;
  monthlyUsd: number;
  upfrontUsd?: number;
  // For workload rows only: tag the database category if the row is a
  // database ("SQL Database on VM" / "Azure SQL Database" / "Azure Database
  // for PostgreSQL" / "RDS" / "Cloud SQL").
  database?: string;
};

export type BomExportContext = {
  cloud: CloudType;
  projectName: string;
  customer: string;
  region: string;             // Primary region label
  purchaseModelLabel: string;
  fxMyrPerUsd?: number | null;
  // Optional: Azure Frontier credit estimate (50% of ACR up to caps) —
  // only relevant for Azure-targeted projects.
  azureFrontierCreditUsd?: number;
};

// Vendor-specific label for the detail-sheet header column.
const ESTIMATE_HEADER_LABEL: Record<CloudType, string> = {
  azure: "Microsoft Azure Estimate",
  aws:   "AWS Cost Calculator Estimate",
  gcp:   "Google Cloud Pricing Estimate",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSummarySheet(items: BomLineItem[], ctx: BomExportContext): XLSX.WorkSheet {
  // Pivot: Service category × Sum of monthly cost. Includes both LZ +
  // workload rows. Grand Total + ACR per year + AFO credit (Azure only).
  const byCategory: Record<string, number> = {};
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] ?? 0) + it.monthlyUsd;
  }
  const rows = Object.entries(byCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, sum]) => [cat, formatUsd(round2(sum))]);
  const grandTotal = items.reduce((s, it) => s + it.monthlyUsd, 0);
  const acrYear = grandTotal * 12;

  const data: (string | number)[][] = [
    [`${ctx.projectName} — ${ctx.customer}`, "", ""],
    [`Cloud: ${ctx.cloud.toUpperCase()} · Region: ${ctx.region} · Term: ${ctx.purchaseModelLabel}`, "", ""],
    [],
    ["Row Labels", "Sum of Estimated monthly cost"],
    ...rows,
    ["Grand Total", formatUsd(round2(grandTotal))],
    ["ACR per year (monthly × 12)", formatUsd(round2(acrYear))],
  ];
  if (ctx.cloud === "azure" && typeof ctx.azureFrontierCreditUsd === "number") {
    data.push(["Azure Frontier credit estimate", formatUsd(round2(ctx.azureFrontierCreditUsd))]);
  }
  if (ctx.fxMyrPerUsd) {
    data.push([`MYR equivalent (FX ${ctx.fxMyrPerUsd}/USD)`, formatUsd(round2(grandTotal * ctx.fxMyrPerUsd))]);
  }
  return XLSX.utils.aoa_to_sheet(data);
}

function buildDetailSheet(items: BomLineItem[], ctx: BomExportContext, label: string): XLSX.WorkSheet {
  // Calculator-export column shape. Database column included for Workloads
  // sheet only — exporter passes it as empty for LZ rows.
  const header = [
    ESTIMATE_HEADER_LABEL[ctx.cloud],
    "Service type",
    "Custom name",
    "Region",
    "Description",
    "Estimated monthly cost",
    "Estimated upfront cost",
    "Database",
  ];
  const data: (string | number)[][] = [
    [`${ctx.projectName} — ${label}`],
    header,
    ...items.map((it) => [
      it.category,
      it.serviceType,
      it.customName,
      it.region || ctx.region,
      it.description,
      formatUsd(round2(it.monthlyUsd)),
      formatUsd(round2(it.upfrontUsd ?? 0)),
      it.database ?? "",
    ]),
    [], // spacer
    ["", "", "", "", "Subtotal", formatUsd(round2(items.reduce((s, it) => s + it.monthlyUsd, 0))), "", ""],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  // Column widths roughly matching the reference template.
  sheet["!cols"] = [
    { wch: 24 },  // category
    { wch: 22 },  // service type
    { wch: 32 },  // custom name
    { wch: 14 },  // region
    { wch: 80 },  // description
    { wch: 14 },  // monthly
    { wch: 14 },  // upfront
    { wch: 22 },  // database
  ];
  return sheet;
}

export function buildBomWorkbook(items: BomLineItem[], ctx: BomExportContext): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(items, ctx), "Summary");

  const lz = items.filter((it) => it.section === "landing_zone");
  const wl = items.filter((it) => it.section === "workload");
  if (lz.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildDetailSheet(lz, ctx, "Landing Zone"), "Landing Zone");
  }
  if (wl.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildDetailSheet(wl, ctx, "Workloads"), "Workloads");
  }
  // Fallback: if neither section was tagged (legacy markdown-only BOMs),
  // dump everything onto a single "BOM" sheet so the file isn't empty.
  if (lz.length === 0 && wl.length === 0 && items.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildDetailSheet(items, ctx, "BOM"), "BOM");
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}

// JSON-block parser: the BOM prompt emits a fenced ```json block at the
// end of its markdown output containing the BomLineItem[] array under a
// `lineItems` key. This function extracts and validates the structure
// without throwing on minor schema drift.
export function parseLineItemsFromBomMarkdown(markdown: string): BomLineItem[] {
  // Match the LAST ```json ... ``` block in the output (the prompt is
  // instructed to emit the data block at the end).
  const matches = [...markdown.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (matches.length === 0) return [];
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(matches[i][1]);
      const arr: unknown = Array.isArray(obj) ? obj : (obj && typeof obj === "object" ? (obj as { lineItems?: unknown }).lineItems : null);
      if (!Array.isArray(arr)) continue;
      const items: BomLineItem[] = [];
      for (const x of arr) {
        if (!x || typeof x !== "object") continue;
        const r = x as Record<string, unknown>;
        if (typeof r.category !== "string" || typeof r.serviceType !== "string" || typeof r.customName !== "string") continue;
        const monthly = Number(r.monthlyUsd);
        if (!Number.isFinite(monthly)) continue;
        const section = r.section === "landing_zone" ? "landing_zone" : "workload";
        items.push({
          section,
          category: r.category,
          serviceType: r.serviceType,
          customName: r.customName,
          region: typeof r.region === "string" ? r.region : "",
          description: typeof r.description === "string" ? r.description : "",
          monthlyUsd: monthly,
          upfrontUsd: Number.isFinite(Number(r.upfrontUsd)) ? Number(r.upfrontUsd) : 0,
          database: typeof r.database === "string" ? r.database : undefined,
        });
      }
      if (items.length > 0) return items;
    } catch {
      // try previous block
    }
  }
  return [];
}
