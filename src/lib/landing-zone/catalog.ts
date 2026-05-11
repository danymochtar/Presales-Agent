// Landing-zone catalog per cloud. Used by the BOM generator to surface a
// "Landing zone candidates" section that's grounded in the published
// frameworks (Azure CAF / AWS Well-Architected / GCP Cloud Foundation)
// rather than reinvented in the LLM prompt every run.
//
// Used by BOM (now) and Architecture (later — generate-architecture.ts
// can switch its prose-level guidance to read this catalog).
//
// Last refreshed: 2026-05. Refresh quarterly when vendor renames a service.

import type { CloudType } from "@/lib/pricing/types";
import type { ComponentKind } from "@/lib/inventory/component-detector";

export type LzCategory = "network" | "identity" | "security" | "ops" | "data-protection";

export type LzComponent = {
  cloud: CloudType;
  category: LzCategory;
  name: string;
  framework: "CAF" | "WAR" | "Cloud Foundation";
  description: string;
  requiredByDefault: boolean;
  // When present, only surface when the inventory contains one of these
  // component kinds. Used for e.g. App Gateway WAF v2 (web tier only) or
  // Bastion (when any VM exposed for ops access).
  pairsWith?: ComponentKind[];
};

const AZURE: LzComponent[] = [
  // Network
  { cloud: "azure", category: "network", name: "Hub VNet",              framework: "CAF", description: "Hub virtual network anchoring the connectivity subscription (Enterprise-Scale Landing Zone).", requiredByDefault: true },
  { cloud: "azure", category: "network", name: "Spoke VNet(s)",         framework: "CAF", description: "Per-workload spoke VNets peered to the hub for landing-zone subscriptions.", requiredByDefault: true },
  { cloud: "azure", category: "network", name: "Azure Firewall",        framework: "CAF", description: "Centralised north-south + east-west traffic inspection in the hub.", requiredByDefault: true },
  { cloud: "azure", category: "network", name: "ExpressRoute Gateway",  framework: "CAF", description: "Dedicated private connectivity from customer datacentre into Azure.", requiredByDefault: false },
  { cloud: "azure", category: "network", name: "VPN Gateway",           framework: "CAF", description: "Site-to-site / point-to-site IPsec tunnels for branch + remote workforce.", requiredByDefault: false },
  { cloud: "azure", category: "network", name: "App Gateway WAF v2",    framework: "CAF", description: "Layer-7 load balancer with WAF for internet-facing web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "azure", category: "network", name: "Azure Bastion",         framework: "CAF", description: "Brokered RDP/SSH access to private VMs without public IPs.", requiredByDefault: true },
  { cloud: "azure", category: "network", name: "DDoS Protection Std",   framework: "CAF", description: "Network-scoped DDoS protection for public endpoints.", requiredByDefault: false },
  { cloud: "azure", category: "network", name: "NAT Gateway",           framework: "CAF", description: "Outbound SNAT for VNet egress at scale (replaces basic outbound rules).", requiredByDefault: true },
  { cloud: "azure", category: "network", name: "Private DNS Zones",     framework: "CAF", description: "Private DNS resolution for Private Link endpoints and VNet-internal names.", requiredByDefault: true },
  // Identity
  { cloud: "azure", category: "identity", name: "Microsoft Entra ID",   framework: "CAF", description: "Workforce identity provider (formerly Azure AD).", requiredByDefault: true },
  { cloud: "azure", category: "identity", name: "Key Vault",            framework: "CAF", description: "Secrets, certificates, and HSM-backed key management.", requiredByDefault: true },
  // Security
  { cloud: "azure", category: "security", name: "Defender for Cloud (CSPM)",   framework: "CAF", description: "Cloud security posture management across subscriptions.", requiredByDefault: true },
  { cloud: "azure", category: "security", name: "Defender for Servers P2",     framework: "CAF", description: "Workload protection for VMs (EDR + threat intel).", requiredByDefault: false, pairsWith: ["database_sql_server", "database_postgres", "database_mysql", "database_oracle", "web_iis", "web_apache", "web_nginx", "active_directory"] },
  { cloud: "azure", category: "security", name: "Microsoft Sentinel",          framework: "CAF", description: "SIEM + SOAR ingesting platform + workload logs.", requiredByDefault: false },
  // Ops
  { cloud: "azure", category: "ops", name: "Log Analytics Workspace",   framework: "CAF", description: "Centralised log + metric store for the platform LZ.", requiredByDefault: true },
  { cloud: "azure", category: "ops", name: "Azure Monitor",             framework: "CAF", description: "Metrics + alerting + Application Insights baseline.", requiredByDefault: true },
  // Data protection
  { cloud: "azure", category: "data-protection", name: "Recovery Services Vault", framework: "CAF", description: "Azure Backup target + Site Recovery orchestration.", requiredByDefault: true },
];

const AWS: LzComponent[] = [
  { cloud: "aws", category: "network", name: "Transit Gateway",        framework: "WAR", description: "Hub for inter-VPC + on-prem connectivity at scale.", requiredByDefault: true },
  { cloud: "aws", category: "network", name: "Hub VPC + Spoke VPCs",   framework: "WAR", description: "Segregated VPCs per environment attached to the Transit Gateway.", requiredByDefault: true },
  { cloud: "aws", category: "network", name: "AWS Network Firewall",   framework: "WAR", description: "Managed stateful firewall for north-south + inter-VPC inspection.", requiredByDefault: false },
  { cloud: "aws", category: "network", name: "Direct Connect",         framework: "WAR", description: "Dedicated private connectivity from customer datacentre.", requiredByDefault: false },
  { cloud: "aws", category: "network", name: "Site-to-Site VPN",       framework: "WAR", description: "IPsec VPN backup connectivity to on-prem.", requiredByDefault: false },
  { cloud: "aws", category: "network", name: "ALB + AWS WAF",          framework: "WAR", description: "Layer-7 load balancer with WAF for internet-facing web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "aws", category: "network", name: "Shield Advanced",        framework: "WAR", description: "DDoS protection + 24×7 SRT for production internet endpoints.", requiredByDefault: false },
  { cloud: "aws", category: "network", name: "Session Manager",        framework: "WAR", description: "Brokered shell access to EC2 instances without bastion hosts.", requiredByDefault: true },
  { cloud: "aws", category: "network", name: "Route 53 + Resolver",    framework: "WAR", description: "Public + private DNS plus VPC-to-on-prem resolution.", requiredByDefault: true },
  // Identity
  { cloud: "aws", category: "identity", name: "IAM Identity Center",   framework: "WAR", description: "Federated workforce SSO across all member accounts.", requiredByDefault: true },
  { cloud: "aws", category: "identity", name: "KMS",                   framework: "WAR", description: "Customer-managed key management with HSM tier available.", requiredByDefault: true },
  { cloud: "aws", category: "identity", name: "Secrets Manager",       framework: "WAR", description: "Rotated secrets storage for application credentials.", requiredByDefault: true },
  // Security
  { cloud: "aws", category: "security", name: "GuardDuty",             framework: "WAR", description: "Account-wide threat detection from VPC Flow / CloudTrail / DNS.", requiredByDefault: true },
  { cloud: "aws", category: "security", name: "Security Hub",          framework: "WAR", description: "Aggregated posture + CIS / PCI / FSBP benchmark scoring.", requiredByDefault: true },
  // Ops
  { cloud: "aws", category: "ops", name: "CloudTrail",                 framework: "WAR", description: "Org-wide API audit trail to a central S3 bucket.", requiredByDefault: true },
  { cloud: "aws", category: "ops", name: "AWS Config",                 framework: "WAR", description: "Resource inventory + configuration history + conformance packs.", requiredByDefault: true },
  { cloud: "aws", category: "ops", name: "CloudWatch",                 framework: "WAR", description: "Metrics + logs + alarms baseline.", requiredByDefault: true },
  // Data protection
  { cloud: "aws", category: "data-protection", name: "AWS Backup",     framework: "WAR", description: "Centralised backup policies across EC2 / RDS / EFS / DynamoDB.", requiredByDefault: true },
];

const GCP: LzComponent[] = [
  { cloud: "gcp", category: "network", name: "Shared VPC",             framework: "Cloud Foundation", description: "Org-level VPC shared across service projects (host/service model).", requiredByDefault: true },
  { cloud: "gcp", category: "network", name: "Cloud Interconnect",     framework: "Cloud Foundation", description: "Dedicated or Partner Interconnect to customer datacentre.", requiredByDefault: false },
  { cloud: "gcp", category: "network", name: "Cloud VPN (HA-VPN)",     framework: "Cloud Foundation", description: "Highly-available IPsec tunnels for branch + remote.", requiredByDefault: false },
  { cloud: "gcp", category: "network", name: "Cloud Armor + Global LB",framework: "Cloud Foundation", description: "WAF + DDoS + global Layer-7 load balancer for web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "gcp", category: "network", name: "IAP (Identity-Aware Proxy)", framework: "Cloud Foundation", description: "Bastion-less SSH/RDP access via short-lived tokens.", requiredByDefault: true },
  { cloud: "gcp", category: "network", name: "Cloud DNS",              framework: "Cloud Foundation", description: "Public + private managed DNS.", requiredByDefault: true },
  // Identity
  { cloud: "gcp", category: "identity", name: "Cloud Identity",        framework: "Cloud Foundation", description: "Workforce identity provider + IAM principal source.", requiredByDefault: true },
  { cloud: "gcp", category: "identity", name: "Cloud KMS",             framework: "Cloud Foundation", description: "Customer-managed keys with HSM tier available.", requiredByDefault: true },
  { cloud: "gcp", category: "identity", name: "Secret Manager",        framework: "Cloud Foundation", description: "Versioned secrets storage for application credentials.", requiredByDefault: true },
  // Security
  { cloud: "gcp", category: "security", name: "Security Command Center", framework: "Cloud Foundation", description: "Posture management + threat detection across the org.", requiredByDefault: true },
  { cloud: "gcp", category: "security", name: "Cloud DLP",             framework: "Cloud Foundation", description: "Sensitive data scanning + redaction across storage and BigQuery.", requiredByDefault: false },
  // Ops
  { cloud: "gcp", category: "ops", name: "Cloud Logging",              framework: "Cloud Foundation", description: "Org-wide log aggregation to BigQuery / Cloud Storage sinks.", requiredByDefault: true },
  { cloud: "gcp", category: "ops", name: "Cloud Monitoring",           framework: "Cloud Foundation", description: "Metrics + alerting + SLO management.", requiredByDefault: true },
  // Data protection
  { cloud: "gcp", category: "data-protection", name: "Backup and DR Service", framework: "Cloud Foundation", description: "Org-wide backup policies + DR orchestration.", requiredByDefault: true },
];

export const LANDING_ZONE_CATALOG: Record<CloudType, LzComponent[]> = {
  azure: AZURE,
  aws: AWS,
  gcp: GCP,
};

/**
 * Filter the catalog for a cloud to those LZ components that apply:
 * - All components marked `requiredByDefault: true` always surface.
 * - Optional components surface only if their `pairsWith` matches any of
 *   the detected component kinds OR `pairsWith` is omitted.
 *
 * Result preserves catalog order (network → identity → security → ops →
 * data-protection) so the BOM renders consistently.
 */
export function lzForCloud(cloud: CloudType, detected: ComponentKind[]): LzComponent[] {
  const catalog = LANDING_ZONE_CATALOG[cloud] ?? [];
  const detectedSet = new Set(detected);
  return catalog.filter((c) => {
    if (c.requiredByDefault) return true;
    if (!c.pairsWith) return false;
    return c.pairsWith.some((k) => detectedSet.has(k));
  });
}
