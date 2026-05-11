// Detect workload components — databases, web tiers, caches, file shares,
// AD/identity, container hosts — from a parsed WorkloadSet. Extends the
// regex-tag pattern from src/lib/pricing/licensing.ts:workloadTags() with
// broader coverage so the BOM generator can route modernization candidates
// to PaaS targets per cloud (paas-recommender.ts).
//
// Hints come from `${name} ${os} ${notes}` lowercased. Confidence is
// "high" when the match is unambiguous (e.g. `mssql`, `sql server`),
// "medium" when names suggest the role (`sql-prod-01`, `pgdb-1`),
// "low" when only an OS or weak naming hint exists. Low-confidence
// detections are surfaced in the BOM Assumptions so the user can review.

import type { Workload, WorkloadSet } from "./workload";

export type ComponentKind =
  | "database_sql_server"
  | "database_postgres"
  | "database_mysql"
  | "database_oracle"
  | "database_mongo"
  | "cache_redis"
  | "web_iis"
  | "web_apache"
  | "web_nginx"
  | "file_share"
  | "active_directory"
  | "container_host"
  | "unknown";

export type DetectedComponent = {
  workloadIndex: number;
  name: string;
  kind: ComponentKind;
  confidence: "high" | "medium" | "low";
  hint: string;
  modernizable: boolean;
};

// Non-modernizable kinds stay on IaaS even at modernization strategy.
// AD DCs technically have Entra Domain Services as an option but that's
// a customer-specific identity decision, not a BOM swap. Container hosts
// (Docker / k8s nodes) are already containerized — the modernization
// target is "use AKS / EKS / GKE" which is an architecture decision the
// BOM can flag but not deterministically right-size.
const NON_MODERNIZABLE: ComponentKind[] = ["active_directory", "container_host", "unknown"];

type Pattern = {
  kind: ComponentKind;
  re: RegExp;
  confidence: "high" | "medium" | "low";
};

// Order matters — high-confidence patterns first; first match wins per row.
const PATTERNS: Pattern[] = [
  // Databases — high confidence keywords
  { kind: "database_sql_server", re: /(?:^|[\s\-_])(?:mssql|sql\s*server)(?:[\s\-_]|$)/i, confidence: "high" },
  { kind: "database_postgres",   re: /\bpostgres(?:ql)?\b/i, confidence: "high" },
  { kind: "database_mysql",      re: /\bmysql\b|\bmariadb\b/i, confidence: "high" },
  { kind: "database_oracle",     re: /\boracle\s*(?:db|database|rac|exadata)\b/i, confidence: "high" },
  { kind: "database_mongo",      re: /\bmongo(?:db)?\b/i, confidence: "high" },

  // Web tiers
  { kind: "web_iis",     re: /\biis\b|internet\s+information\s+services/i, confidence: "high" },
  { kind: "web_apache",  re: /\bapache(?:\s*httpd)?\b|\bhttpd\b/i, confidence: "high" },
  { kind: "web_nginx",   re: /\bnginx\b/i, confidence: "high" },

  // Cache
  { kind: "cache_redis", re: /\bredis\b/i, confidence: "high" },

  // Identity
  { kind: "active_directory", re: /\bdomain\s*controller\b|\bactive\s*directory\b/i, confidence: "high" },
  { kind: "active_directory", re: /(?:^|[\s\-_])(?:dc|ad)[\s\-_0-9]+/i, confidence: "medium" },

  // Containers
  { kind: "container_host", re: /\bdocker\b|\bkubernetes\b|\bk8s\b/i, confidence: "high" },

  // File share
  { kind: "file_share", re: /\bfile\s*server\b|\bnas\b|\bsmb\s*share\b|\bnfs\s*server\b/i, confidence: "high" },
  { kind: "file_share", re: /(?:^|[\s\-_])(?:fs|fileserver|nas)[\s\-_0-9]+/i, confidence: "medium" },

  // Medium-confidence DB name patterns (hostname-based)
  { kind: "database_sql_server", re: /(?:^|[\s\-_])(?:sql|mssql)[\s\-_0-9]+/i, confidence: "medium" },
  { kind: "database_postgres",   re: /(?:^|[\s\-_])(?:pg|psql|pgdb)[\s\-_0-9]+/i, confidence: "medium" },
  { kind: "database_mysql",      re: /(?:^|[\s\-_])(?:my|mariadb)[\s\-_0-9]+/i, confidence: "medium" },
  { kind: "database_oracle",     re: /(?:^|[\s\-_])(?:ora|orcl|oradb)[\s\-_0-9]+/i, confidence: "medium" },
  { kind: "database_mongo",      re: /(?:^|[\s\-_])(?:mongo|mdb)[\s\-_0-9]+/i, confidence: "medium" },

  // Web hostname hints (lower confidence — could be a frontend app server)
  { kind: "web_iis",    re: /(?:^|[\s\-_])(?:web|www|iis)[\s\-_0-9]+/i, confidence: "low" },
  { kind: "cache_redis", re: /(?:^|[\s\-_])(?:cache|redis)[\s\-_0-9]+/i, confidence: "medium" },
];

function classifyOne(workload: Workload, index: number): DetectedComponent | null {
  const hint = `${workload.name} ${workload.os} ${workload.notes ?? ""}`.toLowerCase();
  for (const p of PATTERNS) {
    const m = hint.match(p.re);
    if (m) {
      return {
        workloadIndex: index,
        name: workload.name,
        kind: p.kind,
        confidence: p.confidence,
        hint: m[0].trim(),
        modernizable: !NON_MODERNIZABLE.includes(p.kind),
      };
    }
  }
  return null;
}

export function detectComponents(set: WorkloadSet): {
  components: DetectedComponent[];
  counts: Partial<Record<ComponentKind, number>>;
} {
  const components: DetectedComponent[] = [];
  for (let i = 0; i < set.workloads.length; i++) {
    const c = classifyOne(set.workloads[i], i);
    if (c) components.push(c);
  }
  const counts: Partial<Record<ComponentKind, number>> = {};
  for (const c of components) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  return { components, counts };
}

export const COMPONENT_KIND_LABELS: Record<ComponentKind, string> = {
  database_sql_server: "SQL Server",
  database_postgres:   "PostgreSQL",
  database_mysql:      "MySQL / MariaDB",
  database_oracle:     "Oracle DB",
  database_mongo:      "MongoDB",
  cache_redis:         "Redis cache",
  web_iis:             "IIS web server",
  web_apache:          "Apache web server",
  web_nginx:           "nginx web server",
  file_share:          "File share / NAS",
  active_directory:    "Active Directory DC",
  container_host:      "Container host (Docker/k8s)",
  unknown:             "Unknown",
};
