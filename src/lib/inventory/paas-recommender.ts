// Map detected workload components to PaaS targets per cloud. Honors the
// project's migration strategy:
//
//   lift_and_shift → returns [] (everything stays IaaS).
//   hybrid         → only the "obvious wins" — databases / caches / file
//                    shares. Custom apps + AD + container hosts stay IaaS.
//   modernization  → every modernizable component swaps; non-modernizable
//                    flagged with a reason.
//
// Initial sizing is a hint string (e.g. "GP 4-vCore"). Precise PaaS SKU
// pricing comes when service-specific pricing modules ship (queued from
// the Azure Cost Assessment plan, Phase 1+).

import type { CloudType } from "@/lib/pricing/types";
import type { Workload, WorkloadSet } from "./workload";
import type { ComponentKind, DetectedComponent } from "./component-detector";

export type MigrationStrategy = "lift_and_shift" | "hybrid" | "modernization";

// Hybrid covers the "obvious wins" — components where a managed service
// is a clean swap with no application changes required.
const HYBRID_KINDS: ComponentKind[] = [
  "database_sql_server", "database_postgres", "database_mysql", "database_oracle", "database_mongo",
  "cache_redis", "file_share",
];

export type PaasRecommendation = {
  workloadIndex: number;
  workloadName: string;
  sourceKind: ComponentKind;
  cloud: CloudType;
  modernizable: boolean;
  target: string;          // e.g. "Azure SQL DB GP 4-vCore"
  tierHint: string;        // e.g. "General Purpose"
  reason: string;
};

// (cloud, kind) → { target, tier }. When a workload isn't a clean swap on
// a given cloud we mark it modernizable: false and explain why.
type Mapping = { target: string; tier: string; modernizable: boolean; reason: string };

const MAPPINGS: Record<CloudType, Partial<Record<ComponentKind, Mapping>>> = {
  azure: {
    database_sql_server: { target: "Azure SQL Database", tier: "General Purpose (vCore)", modernizable: true,
      reason: "SQL Server VM → managed Azure SQL DB; AHB applies for licence portability." },
    database_postgres:   { target: "Azure Database for PostgreSQL Flexible Server", tier: "General Purpose", modernizable: true,
      reason: "PostgreSQL VM → managed Flexible Server (zone-redundant HA available)." },
    database_mysql:      { target: "Azure Database for MySQL Flexible Server", tier: "General Purpose", modernizable: true,
      reason: "MySQL VM → managed Flexible Server." },
    database_oracle:     { target: "Oracle Database@Azure (or keep IaaS)", tier: "Customer-specific", modernizable: false,
      reason: "Oracle DB modernization requires customer-specific licensing decision (BYOL + Oracle support). Default to IaaS until contracted." },
    database_mongo:      { target: "Cosmos DB for MongoDB (vCore)", tier: "General Purpose", modernizable: true,
      reason: "MongoDB VM → Cosmos DB MongoDB API (or self-hosted Atlas via Marketplace)." },
    cache_redis:         { target: "Azure Cache for Redis", tier: "Standard / Premium", modernizable: true,
      reason: "Redis VM → managed Azure Cache for Redis." },
    file_share:          { target: "Azure Files (Premium ZRS)", tier: "Premium", modernizable: true,
      reason: "SMB/NFS file server → managed Azure Files." },
    web_iis:             { target: "Azure App Service", tier: "Premium v3 P1v3+", modernizable: true,
      reason: "IIS VM → App Service (.NET / Windows containers)." },
    web_apache:          { target: "Azure App Service / Container Apps", tier: "Premium v3 / Consumption", modernizable: true,
      reason: "Apache stack → containerise to App Service or Container Apps." },
    web_nginx:           { target: "Azure App Service / Container Apps", tier: "Premium v3 / Consumption", modernizable: true,
      reason: "nginx fronting an app → containerise behind App Service / Container Apps." },
    active_directory:    { target: "Microsoft Entra Domain Services", tier: "Standard", modernizable: false,
      reason: "AD DC modernization is an identity decision (Entra Domain Services / Entra ID join), not a BOM swap. Default keep on IaaS." },
    container_host:      { target: "Azure Kubernetes Service (AKS)", tier: "Customer-specific", modernizable: false,
      reason: "Container host → AKS is an architecture decision; right-sizing depends on workload, not VM specs. Default keep host VM on IaaS until architecture confirmed." },
  },
  aws: {
    database_sql_server: { target: "Amazon RDS for SQL Server", tier: "Multi-AZ (db.r6i)", modernizable: true,
      reason: "SQL Server VM → managed RDS (License Mobility with SA available)." },
    database_postgres:   { target: "Amazon RDS for PostgreSQL / Aurora PostgreSQL", tier: "Multi-AZ", modernizable: true,
      reason: "PostgreSQL VM → managed RDS or Aurora PostgreSQL." },
    database_mysql:      { target: "Amazon RDS for MySQL / Aurora MySQL", tier: "Multi-AZ", modernizable: true,
      reason: "MySQL VM → managed RDS or Aurora MySQL." },
    database_oracle:     { target: "Amazon RDS for Oracle", tier: "BYOL / License Included", modernizable: false,
      reason: "Oracle DB modernization is licensing-bound. Default to RDS BYOL only after customer confirms Oracle support contract terms; otherwise keep IaaS." },
    database_mongo:      { target: "Amazon DocumentDB (MongoDB-compat) / Atlas via Marketplace", tier: "General Purpose", modernizable: true,
      reason: "MongoDB VM → DocumentDB if Mongo 5.0 compat is acceptable; else Atlas." },
    cache_redis:         { target: "Amazon ElastiCache for Redis / MemoryDB", tier: "cache.r6g", modernizable: true,
      reason: "Redis VM → managed ElastiCache or MemoryDB (durable)." },
    file_share:          { target: "Amazon FSx for Windows / FSx for NetApp ONTAP / EFS", tier: "Standard", modernizable: true,
      reason: "File server → FSx (Windows/ONTAP) or EFS depending on protocol." },
    web_iis:             { target: "AWS App Runner / Elastic Beanstalk (Windows)", tier: "Customer-specific", modernizable: true,
      reason: "IIS VM → App Runner or Elastic Beanstalk." },
    web_apache:          { target: "AWS App Runner / Elastic Beanstalk / ECS Fargate", tier: "Standard", modernizable: true,
      reason: "Apache stack → App Runner / ECS Fargate." },
    web_nginx:           { target: "AWS App Runner / ECS Fargate", tier: "Standard", modernizable: true,
      reason: "nginx + app → ECS Fargate or App Runner." },
    active_directory:    { target: "AWS Directory Service (Managed Microsoft AD)", tier: "Standard", modernizable: false,
      reason: "AD DC → Managed AD is an identity decision, not a BOM swap. Default keep on IaaS." },
    container_host:      { target: "Amazon EKS", tier: "Customer-specific", modernizable: false,
      reason: "Container host → EKS is an architecture decision. Default keep host on IaaS until architecture confirmed." },
  },
  gcp: {
    database_sql_server: { target: "Cloud SQL for SQL Server", tier: "Enterprise (Regional)", modernizable: true,
      reason: "SQL Server VM → managed Cloud SQL." },
    database_postgres:   { target: "Cloud SQL for PostgreSQL / AlloyDB", tier: "Enterprise", modernizable: true,
      reason: "PostgreSQL VM → Cloud SQL or AlloyDB (higher perf)." },
    database_mysql:      { target: "Cloud SQL for MySQL", tier: "Enterprise", modernizable: true,
      reason: "MySQL VM → managed Cloud SQL." },
    database_oracle:     { target: "Bare Metal Solution (Oracle on GCP)", tier: "Customer-specific", modernizable: false,
      reason: "Oracle on GCP runs on Bare Metal Solution — needs customer-specific sizing + Oracle licensing decision. Default keep on IaaS." },
    database_mongo:      { target: "Atlas via Marketplace", tier: "Standard", modernizable: true,
      reason: "GCP has no first-party Mongo-compat service; managed Atlas via Marketplace is standard." },
    cache_redis:         { target: "Memorystore for Redis", tier: "Standard HA", modernizable: true,
      reason: "Redis VM → managed Memorystore." },
    file_share:          { target: "Filestore (Enterprise)", tier: "Enterprise", modernizable: true,
      reason: "File server → managed Filestore." },
    web_iis:             { target: "App Engine / Cloud Run (Windows containers)", tier: "Standard", modernizable: true,
      reason: "IIS workload → containerise to Cloud Run." },
    web_apache:          { target: "Cloud Run / App Engine", tier: "Standard", modernizable: true,
      reason: "Apache + app → Cloud Run." },
    web_nginx:           { target: "Cloud Run / Load Balancer", tier: "Standard", modernizable: true,
      reason: "nginx + app → Cloud Run." },
    active_directory:    { target: "Managed Microsoft AD on GCP", tier: "Standard", modernizable: false,
      reason: "AD DC modernization is identity-bound. Default keep on IaaS." },
    container_host:      { target: "Google Kubernetes Engine (GKE)", tier: "Customer-specific", modernizable: false,
      reason: "Container host → GKE is an architecture decision. Default keep host on IaaS." },
  },
};

export function recommendPaas(
  set: WorkloadSet,
  components: DetectedComponent[],
  cloud: CloudType,
  strategy: MigrationStrategy,
): PaasRecommendation[] {
  if (strategy === "lift_and_shift") return [];

  return components
    .filter((c) => {
      if (strategy === "modernization") return true;
      // hybrid: only obvious wins
      return HYBRID_KINDS.includes(c.kind);
    })
    .map((c) => {
      const m = MAPPINGS[cloud]?.[c.kind];
      const w: Workload | undefined = set.workloads[c.workloadIndex];
      const name = w?.name ?? c.name;
      if (!m) {
        return {
          workloadIndex: c.workloadIndex,
          workloadName: name,
          sourceKind: c.kind,
          cloud,
          modernizable: false,
          target: "No clean PaaS target",
          tierHint: "—",
          reason: `${cloud.toUpperCase()} has no first-party managed service that maps cleanly to ${c.kind}. Keep on IaaS.`,
        };
      }
      return {
        workloadIndex: c.workloadIndex,
        workloadName: name,
        sourceKind: c.kind,
        cloud,
        modernizable: m.modernizable && c.modernizable,
        target: m.target,
        tierHint: m.tier,
        reason: m.reason,
      };
    });
}

export const MIGRATION_STRATEGY_LABELS: Record<MigrationStrategy, string> = {
  lift_and_shift: "Lift and shift (IaaS only)",
  hybrid:         "Hybrid (modernize obvious wins)",
  modernization:  "Modernization (PaaS-first)",
};
