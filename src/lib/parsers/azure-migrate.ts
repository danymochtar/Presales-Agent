// Azure Migrate Excel report parser. Targets the "All_Assessed_Machines"
// or "VM" sheet that the Discovery & Assessment workbook exports. Falls back
// gracefully when the sheet structure isn't what we expect — caller can then
// route to RVTools or generic CSV parser.

import * as XLSX from "xlsx";
import { summarize, type Workload, type WorkloadSet } from "@/lib/inventory/workload";

// Column candidates seen across recent Azure Migrate exports.
const COL = {
  name: ["Machine name", "Machine Name", "VM name", "Computer name", "Server"],
  cpu: ["Cores", "Number of cores", "CPU"],
  ramMb: ["Memory(MB)", "RAM(MB)"],
  ramGb: ["Memory(GB)", "Memory in MB", "RAM(GB)"],
  os: ["Operating system", "OS"],
  storageGb: ["Storage(GB)", "Disk size(GB)", "Used storage(GB)"],
  monthlyCostUsd: ["Total cost(USD)", "Compute monthly cost(USD)"],
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
  if (/(linux|ubuntu|centos|rhel|debian|suse|oracle|fedora)/.test(s)) return "linux";
  return "other";
}

export function tryParseAzureMigrate(buffer: ArrayBuffer): WorkloadSet | null {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((s) => /assessed|vm|machine/i.test(s));
  if (!sheetName) return null;
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (rows.length === 0) return null;

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
      const storageGb = Number(pick(row, COL.storageGb) ?? 0) || 0;
      const os = osBucket(pick(row, COL.os));
      return { name, os, cpu, ramGb, storageGb, count: 1 };
    })
    .filter((x): x is Workload => x !== null);

  // Sanity: if we got nothing meaningful, signal "not Azure Migrate" so
  // caller can try RVTools instead.
  if (workloads.length === 0 || workloads.every((w) => w.cpu === 0 && w.ramGb === 0)) return null;

  return { source: "azure_migrate", workloads, totals: summarize(workloads) };
}
