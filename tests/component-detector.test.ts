import { describe, it, expect } from "vitest";
import { detectComponents } from "@/lib/inventory/component-detector";
import { summarize, type Workload, type WorkloadSet } from "@/lib/inventory/workload";

function setOf(workloads: Workload[]): WorkloadSet {
  return { source: "manual", workloads, totals: summarize(workloads) };
}

describe("detectComponents", () => {
  it("flags SQL Server / Postgres / Redis / AD DC / web hostnames", () => {
    const set = setOf([
      { name: "sql-prod-01",       os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
      { name: "pgdb-01",           os: "linux",   cpu: 4, ramGb: 16, storageGb: 200, count: 1, notes: "PostgreSQL 14" },
      { name: "redis-cache-01",    os: "linux",   cpu: 2, ramGb: 8,  storageGb: 50,  count: 1 },
      { name: "dc-01",             os: "windows", cpu: 2, ramGb: 4,  storageGb: 100, count: 1 },
      { name: "web-iis-01",        os: "windows", cpu: 4, ramGb: 8,  storageGb: 100, count: 1, notes: "IIS 10" },
      { name: "app-server-01",     os: "linux",   cpu: 4, ramGb: 16, storageGb: 100, count: 1 },
    ]);
    const r = detectComponents(set);
    const byKind = Object.fromEntries(r.components.map((c) => [c.name, c.kind]));
    expect(byKind["sql-prod-01"]).toBe("database_sql_server");
    expect(byKind["pgdb-01"]).toBe("database_postgres");
    expect(byKind["redis-cache-01"]).toBe("cache_redis");
    expect(byKind["dc-01"]).toBe("active_directory");
    expect(byKind["web-iis-01"]).toBe("web_iis");
    // app-server-01 is generic — no detection
    expect(byKind["app-server-01"]).toBeUndefined();
    expect(r.counts.database_sql_server).toBe(1);
    expect(r.counts.active_directory).toBe(1);
  });

  it("marks AD + container hosts as non-modernizable", () => {
    const set = setOf([
      { name: "dc-prod",         os: "windows", cpu: 2, ramGb: 4,  storageGb: 100, count: 1 },
      { name: "kubernetes-node", os: "linux",   cpu: 8, ramGb: 32, storageGb: 200, count: 1 },
    ]);
    const r = detectComponents(set);
    expect(r.components.find((c) => c.name === "dc-prod")?.modernizable).toBe(false);
    expect(r.components.find((c) => c.name === "kubernetes-node")?.modernizable).toBe(false);
  });

  it("assigns medium confidence to hostname-only DB hints", () => {
    const set = setOf([
      { name: "sql-01", os: "windows", cpu: 4, ramGb: 16, storageGb: 200, count: 1 },
    ]);
    const r = detectComponents(set);
    expect(r.components[0].confidence).toBe("medium");
    expect(r.components[0].kind).toBe("database_sql_server");
  });

  it("returns empty when nothing matches", () => {
    const set = setOf([
      { name: "generic-app-01", os: "linux", cpu: 4, ramGb: 16, storageGb: 100, count: 1 },
    ]);
    const r = detectComponents(set);
    expect(r.components).toEqual([]);
    expect(Object.keys(r.counts)).toHaveLength(0);
  });
});
