// Minimal RVTools parser. Reads the vInfo sheet (most relevant for VM inventory).
// Real-world RVTools exports vary by version; this targets common columns.
// Fallback: caller can use generic CSV mapper.

import * as XLSX from "xlsx";
import { summarize, type Workload, type WorkloadSet } from "./workload";

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

  return { source: "rvtools", workloads, totals: summarize(workloads) };
}
