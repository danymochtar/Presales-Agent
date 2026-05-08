import { prisma } from "./prisma";

// MVP: every authenticated user maps to the single default tenant. When a user
// signs up, attach them to the default tenant (creating it on demand) and seed
// it with Malaysia-market defaults the first time.

const DEFAULT_TENANT_SLUG = "default";

export async function ensureDefaultTenant(userId: string) {
  const existing = await prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG } });
  if (existing) {
    await prisma.user.update({ where: { id: userId }, data: { tenantId: existing.id } });
    return existing;
  }

  const tenant = await prisma.tenant.create({
    data: {
      slug: DEFAULT_TENANT_SLUG,
      name: "Default Tenant",
      country: "Malaysia",
      locale: "en-MY",
      currency: "USD",
      fxMyrPerUsd: 4.7,
      commercial: {
        tax_rate_pct: 8.0,
        payment_terms: "Net 30",
        partner_tier: { vendor: "Microsoft", tier: "Solutions Partner - Infrastructure Azure", csp_model: "Indirect" },
        margin: { target_gross_margin_pct: 35, minimum_gross_margin_pct: 20 },
      },
      standards: {
        primary_cloud: "Azure",
        iac_preference: "Bicep",
        default_region_primary: "Malaysia Central",
        default_region_dr: "Southeast Asia",
        security_baseline: "CIS Microsoft Azure Foundations Benchmark v2.0",
        required_tags: ["Environment", "Owner", "CostCenter", "Workload", "DataClassification"],
      },
      guardrails: {
        redact: { ip: true, credentials: true, personal_emails: true, hostnames: false },
        must_review_before_send: ["final pricing", "discount above matrix", "legal terms", "delivery date commitment"],
        prohibited_statements: ["100% uptime", "guaranteed performance improvement", "fully automated zero-downtime migration"],
        auto_approve: { discount_pct_max: 5 },
      },
      compliance: {
        regulatory_frameworks_relevant: ["PDPA 2010 (Malaysia)", "Bank Negara Malaysia RMiT (if BFSI)"],
      },
      rateCardItems: {
        create: [
          { role: "Solution Architect", level: "Senior", dailyRate: 900, currency: "USD", location: "MY" },
          { role: "Solution Architect", level: "Lead", dailyRate: 1200, currency: "USD", location: "MY" },
          { role: "Presales Consultant", level: "Mid", dailyRate: 650, currency: "USD", location: "MY" },
          { role: "Project Manager", level: "Senior", dailyRate: 750, currency: "USD", location: "MY" },
          { role: "Cloud Engineer", level: "Mid", dailyRate: 500, currency: "USD", location: "MY" },
          { role: "Cloud Engineer", level: "Senior", dailyRate: 750, currency: "USD", location: "MY" },
          { role: "Migration Engineer", level: "Senior", dailyRate: 800, currency: "USD", location: "MY" },
          { role: "Security Engineer", level: "Senior", dailyRate: 900, currency: "USD", location: "MY" },
        ],
      },
      catalogItems: {
        create: [
          { service: "Azure Landing Zone (Enterprise Scale) Setup", defaultEffortDays: 15, prerequisite: "subscription + Entra ID tenant", deliverable: "LZ deployed + HLD" },
          { service: "Hub-Spoke Network Setup", defaultEffortDays: 5, prerequisite: "landing zone", deliverable: "Network design + deployment" },
          { service: "IaaS VM Migration (per VM)", defaultEffortDays: 0.5, prerequisite: "Azure Migrate assessment", deliverable: "Migrated VM in Azure", notes: "online via ASR/Azure Migrate" },
          { service: "SQL Server to SQL MI Migration", defaultEffortDays: 5, prerequisite: "DMS readiness report", deliverable: "Migrated DB + cutover plan" },
          { service: "Entra ID Connect Sync Setup", defaultEffortDays: 3, prerequisite: "on-prem AD assessment", deliverable: "Hybrid identity" },
          { service: "Azure Backup Policy Setup", defaultEffortDays: 2, prerequisite: "landing zone", deliverable: "Backup policy applied" },
          { service: "Azure Monitor + Log Analytics Setup", defaultEffortDays: 3, prerequisite: "landing zone", deliverable: "Dashboards + alerts" },
          { service: "Azure Site Recovery (DR) Setup", defaultEffortDays: 7, prerequisite: "primary + secondary region", deliverable: "DR runbook + tested failover" },
        ],
      },
    },
  });

  await prisma.user.update({ where: { id: userId }, data: { tenantId: tenant.id } });
  return tenant;
}

export async function requireSessionAndTenant(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
  if (!user) throw new Error("user not found");
  if (!user.tenant) {
    const tenant = await ensureDefaultTenant(userId);
    return { user, tenant };
  }
  return { user, tenant: user.tenant };
}
