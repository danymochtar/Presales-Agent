// Minimal RVTools parser. Reads the vInfo sheet (most relevant for VM inventory).
// Real-world RVTools exports vary by version; this targets common columns.
// Fallback: caller can use generic CSV mapper.

import * as XLSX from "xlsx";
import { summarize, type CollectorMetadata, type Workload, type WorkloadSet } from "./workload";

// Minimum RVTools version we trust. The May 2025 supply-chain incident
// (trojanized version.dll on unofficial distributions) post-dates 4.6.x;
// Dell-published 4.7.x and later carry a clean signing chain.
const MIN_TRUSTED_VERSION = "4.7.0";

function parseCollector(wb: XLSX.WorkBook): CollectorMetadata {
  const meta: CollectorMetadata = { warnings: [] };
  const sheet = wb.Sheets["vMetaData"];
  if (!sheet) {
    meta.warnings!.push(
      "Unknown RVTools collector — no vMetaData sheet. Verify the file came from the official Dell-hosted RVTools (robware.net / rvtools.com) per the May 2025 supply-chain advisory.",
    );
    return meta;
  }
  // vMetaData has key/value rows; column names vary by version.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  for (const row of rows) {
    const entries = Object.entries(row);
    for (const [k, v] of entries) {
      const key = k.trim().toLowerCase();
      const val = v == null ? "" : String(v).trim();
      if (!val) continue;
      if (key.includes("rvtools") && key.includes("version") && !meta.collectorVersion) meta.collectorVersion = val;
      if (key === "version" && !meta.collectorVersion) meta.collectorVersion = val;
      if ((key === "dt" || key.includes("date")) && !meta.collectionDate) meta.collectionDate = val;
      if ((key.includes("vc") || key.includes("vcenter") || key === "host") && !meta.vcenterHost) meta.vcenterHost = val;
    }
  }
  if (meta.collectorVersion) {
    const cmp = compareVersions(meta.collectorVersion, MIN_TRUSTED_VERSION);
    if (cmp < 0) {
      meta.warnings!.push(
        `RVTools collector version ${meta.collectorVersion} predates the May 2025 advisory — recommend re-collecting with the official Dell-hosted ${MIN_TRUSTED_VERSION}+ build.`,
      );
    }
  } else {
    meta.warnings!.push("RVTools collector version not recorded in vMetaData — verify source.");
  }
  if (meta.warnings!.length === 0) delete meta.warnings;
  return meta;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const COL = {
  name: ["VM", "Name"],
  cpu: ["CPUs", "vCPU", "vCPUs"],
  ramMb: ["Memory", "Memory MB"],
  ramGb: ["Memory GB"],
  os: ["OS according to the configuration file", "OS", "Guest OS"],
  storageMb: ["Provisioned MB", "In Use MB"],
  storageGb: ["Provisioned GB", "In Use GB"],
};

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.trim().toLowerCase() === k.toLowerCase()) return row[rk];
    }
  }
  return undefined;
}

function osBucket(raw: unknown): "linux" | "windows" | "other" {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return "other";
  if (s.includes("windows")) return "windows";
  if (s.includes("linux") || s.includes("ubuntu") || s.includes("centos") || s.includes("rhel") || s.includes("debian") || s.includes("suse") || s.includes("oracle")) return "linux";
  return "other";
}

export function parseRvtools(buffer: ArrayBuffer): WorkloadSet {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets["vInfo"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("RVTools workbook has no readable sheet");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const workloads: Workload[] = rows
    .map((row): Workload | null => {
      const name = String(pick(row, COL.name) ?? "").trim();
      if (!name) return null;
      const cpu = Number(pick(row, COL.cpu) ?? 0);
      let ramGb = Number(pick(row, COL.ramGb));
      if (!ramGb || Number.isNaN(ramGb)) {
        const ramMb = Number(pick(row, COL.ramMb) ?? 0);
        ramGb = ramMb ? Math.round((ramMb / 1024) * 10) / 10 : 0;
      }
      let storageGb = Number(pick(row, COL.storageGb));
      if (!storageGb || Number.isNaN(storageGb)) {
        const storageMb = Number(pick(row, COL.storageMb) ?? 0);
        storageGb = storageMb ? Math.round(storageMb / 1024) : 0;
      }
      const os = osBucket(pick(row, COL.os));
      return { name, os, cpu, ramGb, storageGb, count: 1 };
    })
    .filter((x): x is Workload => x !== null);

  return {
    source: "rvtools",
    workloads,
    totals: summarize(workloads),
    collector: parseCollector(wb),
  };
}
