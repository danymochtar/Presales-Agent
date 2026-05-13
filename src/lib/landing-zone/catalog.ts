// Landing-zone catalog per cloud × archetype. Used by:
//   - BOM generator (Section 4 "Landing zone candidates") for grounded
//     recommendations matched to the framework standard
//   - /engagements/[id]/landing-zone picker — the user-facing step after
//     assessment where the team confirms which components to deploy
//
// Grounded in published vendor frameworks:
//   - Azure CAF (Cloud Adoption Framework) — Enterprise-Scale Landing Zone
//     https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/
//     Eight design areas: billing+tenant, identity, resource org, network,
//     security, mgmt/ops, governance, platform automation.
//   - AWS Landing Zone Accelerator (LZA on AWS) + Well-Architected
//   - GCP Cloud Foundation Fabric / Enterprise Foundations Blueprint
//
// Last refreshed: 2026-05. Refresh quarterly when vendor renames a service.

import type { CloudType } from "@/lib/pricing/types";
import type { ComponentKind } from "@/lib/inventory/component-detector";

export type LzCategory = "network" | "identity" | "security" | "ops" | "data-protection";

// Which archetype the component primarily belongs to. A component can appear
// in multiple archetypes (e.g. networking + identity are needed for ALL three
// archetypes) — the picker treats `infra` as the foundation and `platform` /
// `data_ai` as additive layers stacked on top.
export type LzArchetype = "infra" | "platform" | "data_ai";

export const LZ_ARCHETYPE_LABELS: Record<LzArchetype, string> = {
  infra: "Infrastructure (lift-and-shift)",
  platform: "Application platform (modernization)",
  data_ai: "Data + AI platform",
};

export const LZ_ARCHETYPE_DESCRIPTIONS: Record<LzArchetype, string> = {
  infra: "Core enterprise landing zone — hub + spoke networking, identity, security baseline, ops + backup. Required foundation for every cloud project.",
  platform: "Adds container + PaaS runtime services for app modernization — Kubernetes / serverless / API management / CI-CD on top of the infrastructure landing zone.",
  data_ai: "Adds data lake + analytics + ML/GenAI services for a data-platform workload — OneLake / Fabric / Foundry on Azure, Lake Formation + SageMaker on AWS, BigQuery + Vertex AI on GCP.",
};

export type LzComponent = {
  cloud: CloudType;
  archetype: LzArchetype;
  category: LzCategory;
  name: string;
  framework: "CAF" | "LZA" | "Cloud Foundation";
  description: string;
  // Default-pre-checked in the picker. `true` for the canonical components
  // every deployment of this archetype needs.
  requiredByDefault: boolean;
  // When present, only surface (or pre-check) when the detected inventory
  // contains one of these component kinds. Used for e.g. App Gateway WAF v2
  // (web tier only) or Defender for Servers P2 (when servers present).
  pairsWith?: ComponentKind[];
};

// ---------- Azure (CAF / Enterprise-Scale Landing Zone) ----------
const AZURE_INFRA: LzComponent[] = [
  // Network
  { cloud: "azure", archetype: "infra", category: "network", name: "Hub VNet",              framework: "CAF", description: "Hub virtual network anchoring the connectivity subscription (Enterprise-Scale Landing Zone).", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "network", name: "Spoke VNet(s)",         framework: "CAF", description: "Per-workload spoke VNets peered to the hub for landing-zone subscriptions.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "network", name: "Azure Firewall",        framework: "CAF", description: "Centralised north-south + east-west traffic inspection in the hub.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "network", name: "Virtual WAN",           framework: "CAF", description: "Global transit hub alternative to hub-spoke for multi-region / SD-WAN-heavy estates.", requiredByDefault: false },
  { cloud: "azure", archetype: "infra", category: "network", name: "ExpressRoute Gateway",  framework: "CAF", description: "Dedicated private connectivity from customer datacentre into Azure.", requiredByDefault: false },
  { cloud: "azure", archetype: "infra", category: "network", name: "VPN Gateway",           framework: "CAF", description: "Site-to-site / point-to-site IPsec tunnels for branch + remote workforce.", requiredByDefault: false },
  { cloud: "azure", archetype: "infra", category: "network", name: "App Gateway WAF v2",    framework: "CAF", description: "Layer-7 load balancer with WAF for internet-facing web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "azure", archetype: "infra", category: "network", name: "Azure Bastion",         framework: "CAF", description: "Brokered RDP/SSH access to private VMs without public IPs.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "network", name: "DDoS Protection Std",   framework: "CAF", description: "Network-scoped DDoS protection for public endpoints.", requiredByDefault: false },
  { cloud: "azure", archetype: "infra", category: "network", name: "NAT Gateway",           framework: "CAF", description: "Outbound SNAT for VNet egress at scale (replaces basic outbound rules).", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "network", name: "Private DNS Zones",     framework: "CAF", description: "Private DNS resolution for Private Link endpoints and VNet-internal names.", requiredByDefault: true },
  // Identity
  { cloud: "azure", archetype: "infra", category: "identity", name: "Microsoft Entra ID",   framework: "CAF", description: "Workforce identity provider (formerly Azure AD).", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "identity", name: "Entra Conditional Access", framework: "CAF", description: "Risk-based access policies for users + workload identities.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "identity", name: "Key Vault",            framework: "CAF", description: "Secrets, certificates, and HSM-backed key management.", requiredByDefault: true },
  // Security
  { cloud: "azure", archetype: "infra", category: "security", name: "Defender for Cloud (CSPM)", framework: "CAF", description: "Cloud security posture management across subscriptions.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "security", name: "Defender for Servers P2",   framework: "CAF", description: "Workload protection for VMs (EDR + threat intel).", requiredByDefault: false, pairsWith: ["database_sql_server", "database_postgres", "database_mysql", "database_oracle", "web_iis", "web_apache", "web_nginx", "active_directory"] },
  { cloud: "azure", archetype: "infra", category: "security", name: "Microsoft Sentinel",        framework: "CAF", description: "SIEM + SOAR ingesting platform + workload logs.", requiredByDefault: false },
  // Ops
  { cloud: "azure", archetype: "infra", category: "ops", name: "Log Analytics Workspace",   framework: "CAF", description: "Centralised log + metric store for the platform LZ.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "ops", name: "Azure Monitor",             framework: "CAF", description: "Metrics + alerting + Application Insights baseline.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "ops", name: "Azure Policy",              framework: "CAF", description: "Governance: enforce naming, tagging, allowed SKUs, region pinning across management groups.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "ops", name: "Update Manager",            framework: "CAF", description: "OS patching orchestration for IaaS + Arc-enabled servers.", requiredByDefault: false },
  // Data protection
  { cloud: "azure", archetype: "infra", category: "data-protection", name: "Recovery Services Vault", framework: "CAF", description: "Azure Backup target + Site Recovery orchestration.", requiredByDefault: true },
  { cloud: "azure", archetype: "infra", category: "data-protection", name: "Azure Backup Vault",     framework: "CAF", description: "Modern vault for Disk / PostgreSQL / Blob / Files backup workloads.", requiredByDefault: false },
];

const AZURE_PLATFORM: LzComponent[] = [
  { cloud: "azure", archetype: "platform", category: "ops", name: "Azure Kubernetes Service",  framework: "CAF", description: "Managed Kubernetes for containerised application landing zones.", requiredByDefault: true },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Azure Container Registry",  framework: "CAF", description: "Private registry + image scanning for AKS / App Service / ACA.", requiredByDefault: true },
  { cloud: "azure", archetype: "platform", category: "ops", name: "App Service Environment v3",framework: "CAF", description: "Single-tenant managed PaaS hosting for line-of-business web apps.", requiredByDefault: false },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Container Apps",            framework: "CAF", description: "Serverless containers for event-driven + microservice workloads (Dapr-aware).", requiredByDefault: false },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Azure Functions",           framework: "CAF", description: "Serverless functions for glue + event processing.", requiredByDefault: false },
  { cloud: "azure", archetype: "platform", category: "ops", name: "API Management",            framework: "CAF", description: "Internal + external API gateway, developer portal, rate limiting.", requiredByDefault: true },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Azure DevOps / GitHub Enterprise", framework: "CAF", description: "CI-CD source + pipelines for IaC + application code.", requiredByDefault: true },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Azure Service Bus",         framework: "CAF", description: "Messaging backbone for decoupled microservices.", requiredByDefault: false },
  { cloud: "azure", archetype: "platform", category: "ops", name: "Event Grid + Event Hubs",   framework: "CAF", description: "Event ingestion + routing for streaming + reactive workloads.", requiredByDefault: false },
  { cloud: "azure", archetype: "platform", category: "security", name: "Defender for Containers",framework: "CAF", description: "AKS runtime + registry vulnerability protection.", requiredByDefault: true },
];

const AZURE_DATA_AI: LzComponent[] = [
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Microsoft Fabric + OneLake", framework: "CAF", description: "Unified data platform — lakehouse, warehouse, Power BI, real-time analytics. Replaces / supersedes Synapse for most new builds.", requiredByDefault: true },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Azure Data Lake Storage Gen2",framework: "CAF", description: "Hierarchical-namespace storage backing OneLake shortcuts + custom data products.", requiredByDefault: true },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Azure Databricks",            framework: "CAF", description: "Spark + Delta Lake + MLflow for advanced ML and large-scale ETL.", requiredByDefault: false },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Synapse Analytics",           framework: "CAF", description: "Legacy dedicated SQL pool + serverless SQL. New builds prefer Fabric warehouses.", requiredByDefault: false },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Microsoft Foundry (Azure AI)",framework: "CAF", description: "Foundation models + agent service + AI Search hub. Replaces Azure AI Studio / OpenAI Studio.", requiredByDefault: true },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Azure AI Search",             framework: "CAF", description: "Vector + hybrid search index for RAG patterns with Foundry IQ.", requiredByDefault: true },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Azure Machine Learning",      framework: "CAF", description: "Classical ML workspaces, AutoML, managed endpoints (when Foundry's not the right fit).", requiredByDefault: false },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Cosmos DB",                   framework: "CAF", description: "Globally distributed NoSQL for AI app state, vector store, agent memory.", requiredByDefault: false },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Azure Data Factory",          framework: "CAF", description: "Hybrid data integration when source systems live on-prem and Fabric pipelines aren't enough.", requiredByDefault: false },
  { cloud: "azure", archetype: "data_ai", category: "ops", name: "Purview",                     framework: "CAF", description: "Data governance, lineage, classification across Fabric / SQL / Synapse.", requiredByDefault: true },
];

// ---------- AWS (Landing Zone Accelerator / Well-Architected) ----------
const AWS_INFRA: LzComponent[] = [
  { cloud: "aws", archetype: "infra", category: "ops", name: "AWS Control Tower",        framework: "LZA", description: "Multi-account orchestration: SCPs, account vending, baseline guardrails.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "ops", name: "AWS Organizations + SCPs", framework: "LZA", description: "Org root, OUs, service control policies for guardrails.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "network", name: "Transit Gateway",      framework: "LZA", description: "Hub for inter-VPC + on-prem connectivity at scale.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "network", name: "Hub VPC + Spoke VPCs", framework: "LZA", description: "Segregated VPCs per environment attached to the Transit Gateway.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "network", name: "AWS Network Firewall", framework: "LZA", description: "Managed stateful firewall for north-south + inter-VPC inspection.", requiredByDefault: false },
  { cloud: "aws", archetype: "infra", category: "network", name: "Direct Connect",       framework: "LZA", description: "Dedicated private connectivity from customer datacentre.", requiredByDefault: false },
  { cloud: "aws", archetype: "infra", category: "network", name: "Site-to-Site VPN",     framework: "LZA", description: "IPsec VPN backup connectivity to on-prem.", requiredByDefault: false },
  { cloud: "aws", archetype: "infra", category: "network", name: "ALB + AWS WAF",        framework: "LZA", description: "Layer-7 load balancer with WAF for internet-facing web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "aws", archetype: "infra", category: "network", name: "Shield Advanced",      framework: "LZA", description: "DDoS protection + 24×7 SRT for production internet endpoints.", requiredByDefault: false },
  { cloud: "aws", archetype: "infra", category: "network", name: "Session Manager",      framework: "LZA", description: "Brokered shell access to EC2 instances without bastion hosts.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "network", name: "Route 53 + Resolver",  framework: "LZA", description: "Public + private DNS plus VPC-to-on-prem resolution.", requiredByDefault: true },
  // Identity
  { cloud: "aws", archetype: "infra", category: "identity", name: "IAM Identity Center", framework: "LZA", description: "Federated workforce SSO across all member accounts.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "identity", name: "KMS",                 framework: "LZA", description: "Customer-managed key management with HSM tier available.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "identity", name: "Secrets Manager",     framework: "LZA", description: "Rotated secrets storage for application credentials.", requiredByDefault: true },
  // Security
  { cloud: "aws", archetype: "infra", category: "security", name: "GuardDuty",           framework: "LZA", description: "Account-wide threat detection from VPC Flow / CloudTrail / DNS.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "security", name: "Security Hub",        framework: "LZA", description: "Aggregated posture + CIS / PCI / FSBP benchmark scoring.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "security", name: "Inspector",           framework: "LZA", description: "Continuous vulnerability scanning for EC2 / ECR / Lambda.", requiredByDefault: false },
  // Ops
  { cloud: "aws", archetype: "infra", category: "ops", name: "CloudTrail (org trail)",   framework: "LZA", description: "Org-wide API audit trail to a central S3 bucket.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "ops", name: "AWS Config",               framework: "LZA", description: "Resource inventory + configuration history + conformance packs.", requiredByDefault: true },
  { cloud: "aws", archetype: "infra", category: "ops", name: "CloudWatch",               framework: "LZA", description: "Metrics + logs + alarms baseline.", requiredByDefault: true },
  // Data protection
  { cloud: "aws", archetype: "infra", category: "data-protection", name: "AWS Backup",   framework: "LZA", description: "Centralised backup policies across EC2 / RDS / EFS / DynamoDB.", requiredByDefault: true },
];

const AWS_PLATFORM: LzComponent[] = [
  { cloud: "aws", archetype: "platform", category: "ops", name: "Amazon EKS",            framework: "LZA", description: "Managed Kubernetes for containerised application landing zones.", requiredByDefault: true },
  { cloud: "aws", archetype: "platform", category: "ops", name: "Amazon ECR",            framework: "LZA", description: "Private container registry with image scanning.", requiredByDefault: true },
  { cloud: "aws", archetype: "platform", category: "ops", name: "AWS Fargate",           framework: "LZA", description: "Serverless container runtime under EKS / ECS.", requiredByDefault: false },
  { cloud: "aws", archetype: "platform", category: "ops", name: "AWS App Runner",        framework: "LZA", description: "Fully managed container-to-URL service for stateless web apps.", requiredByDefault: false },
  { cloud: "aws", archetype: "platform", category: "ops", name: "AWS Lambda",            framework: "LZA", description: "Serverless functions for glue + event processing.", requiredByDefault: false },
  { cloud: "aws", archetype: "platform", category: "ops", name: "Amazon API Gateway",    framework: "LZA", description: "REST + HTTP + WebSocket API gateway with usage plans.", requiredByDefault: true },
  { cloud: "aws", archetype: "platform", category: "ops", name: "CodePipeline + CodeBuild", framework: "LZA", description: "CI-CD pipelines for IaC + application code (or use GitHub Actions self-hosted).", requiredByDefault: true },
  { cloud: "aws", archetype: "platform", category: "ops", name: "Amazon SQS + SNS",      framework: "LZA", description: "Decoupled messaging + pub/sub backbone for microservices.", requiredByDefault: false },
  { cloud: "aws", archetype: "platform", category: "ops", name: "Amazon EventBridge",    framework: "LZA", description: "Event bus for routing application + SaaS events to consumers.", requiredByDefault: false },
];

const AWS_DATA_AI: LzComponent[] = [
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon S3 (data lake)",   framework: "LZA", description: "Object storage tier underpinning the data lake (raw / curated / consumption zones).", requiredByDefault: true },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "AWS Lake Formation",      framework: "LZA", description: "Lake-wide permissions, governance, fine-grained access on top of S3.", requiredByDefault: true },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "AWS Glue",                framework: "LZA", description: "Serverless ETL + Data Catalog + schema registry.", requiredByDefault: true },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon Athena",           framework: "LZA", description: "Serverless SQL on S3 + federated query.", requiredByDefault: false },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon Redshift",         framework: "LZA", description: "Cloud data warehouse for BI + serverless analytics.", requiredByDefault: false },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon EMR",              framework: "LZA", description: "Managed Hadoop / Spark for large-scale batch.", requiredByDefault: false },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon SageMaker",        framework: "LZA", description: "End-to-end ML platform: training, registry, inference endpoints.", requiredByDefault: true },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon Bedrock",          framework: "LZA", description: "Managed access to foundation models (Anthropic, Meta, Cohere, Amazon Titan).", requiredByDefault: true },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon OpenSearch",       framework: "LZA", description: "Search + vector index for RAG retrieval and observability.", requiredByDefault: false },
  { cloud: "aws", archetype: "data_ai", category: "ops", name: "Amazon Kinesis",          framework: "LZA", description: "Real-time streaming ingest into the data lake.", requiredByDefault: false },
];

// ---------- GCP (Cloud Foundation Fabric / Enterprise Foundations) ----------
const GCP_INFRA: LzComponent[] = [
  { cloud: "gcp", archetype: "infra", category: "ops", name: "Resource Hierarchy (Org / Folders)", framework: "Cloud Foundation", description: "Org root + folders (prod / nonprod / shared) for IAM + policy inheritance.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Shared VPC (host + service)",   framework: "Cloud Foundation", description: "Org-level VPC shared across service projects.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Cloud Interconnect",             framework: "Cloud Foundation", description: "Dedicated or Partner Interconnect to customer datacentre.", requiredByDefault: false },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Cloud VPN (HA-VPN)",             framework: "Cloud Foundation", description: "Highly-available IPsec tunnels for branch + remote.", requiredByDefault: false },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Cloud Armor + Global LB",        framework: "Cloud Foundation", description: "WAF + DDoS + global Layer-7 load balancer for web tiers.", requiredByDefault: false, pairsWith: ["web_iis", "web_apache", "web_nginx"] },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Cloud NAT",                      framework: "Cloud Foundation", description: "Managed outbound NAT for private VPC egress.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "network", name: "IAP (Identity-Aware Proxy)",     framework: "Cloud Foundation", description: "Bastion-less SSH/RDP access via short-lived tokens.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "network", name: "Cloud DNS",                      framework: "Cloud Foundation", description: "Public + private managed DNS.", requiredByDefault: true },
  // Identity
  { cloud: "gcp", archetype: "infra", category: "identity", name: "Cloud Identity",                framework: "Cloud Foundation", description: "Workforce identity provider + IAM principal source.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "identity", name: "Cloud KMS",                     framework: "Cloud Foundation", description: "Customer-managed keys with HSM tier available.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "identity", name: "Secret Manager",                framework: "Cloud Foundation", description: "Versioned secrets storage for application credentials.", requiredByDefault: true },
  // Security
  { cloud: "gcp", archetype: "infra", category: "security", name: "Security Command Center",       framework: "Cloud Foundation", description: "Posture management + threat detection across the org (CSPM + SIEM-lite).", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "security", name: "Cloud DLP",                     framework: "Cloud Foundation", description: "Sensitive data scanning + redaction across storage and BigQuery.", requiredByDefault: false },
  // Ops
  { cloud: "gcp", archetype: "infra", category: "ops", name: "Cloud Logging",                      framework: "Cloud Foundation", description: "Org-wide log aggregation to BigQuery / Cloud Storage sinks.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "ops", name: "Cloud Monitoring",                   framework: "Cloud Foundation", description: "Metrics + alerting + SLO management.", requiredByDefault: true },
  { cloud: "gcp", archetype: "infra", category: "ops", name: "Organization Policies",              framework: "Cloud Foundation", description: "Constraints (allowed regions, allowed VM images, disable serial port, etc.).", requiredByDefault: true },
  // Data protection
  { cloud: "gcp", archetype: "infra", category: "data-protection", name: "Backup and DR Service",  framework: "Cloud Foundation", description: "Org-wide backup policies + DR orchestration.", requiredByDefault: true },
];

const GCP_PLATFORM: LzComponent[] = [
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Google Kubernetes Engine",  framework: "Cloud Foundation", description: "Managed Kubernetes (Autopilot or Standard) for containerised workloads.", requiredByDefault: true },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Artifact Registry",         framework: "Cloud Foundation", description: "Container + language-package registry with vulnerability scanning.", requiredByDefault: true },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Cloud Run",                 framework: "Cloud Foundation", description: "Serverless containers, request-driven scaling to zero.", requiredByDefault: false },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Cloud Functions",           framework: "Cloud Foundation", description: "Serverless functions for glue + event processing.", requiredByDefault: false },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Apigee API Management",     framework: "Cloud Foundation", description: "Enterprise API gateway, developer portal, monetization.", requiredByDefault: false },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "API Gateway",               framework: "Cloud Foundation", description: "Lightweight managed API gateway for Cloud Run / Functions / GKE.", requiredByDefault: true },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Cloud Build + Cloud Deploy",framework: "Cloud Foundation", description: "CI-CD pipelines + progressive delivery.", requiredByDefault: true },
  { cloud: "gcp", archetype: "platform", category: "ops", name: "Pub/Sub",                   framework: "Cloud Foundation", description: "Global pub/sub + event-driven messaging backbone.", requiredByDefault: false },
];

const GCP_DATA_AI: LzComponent[] = [
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Cloud Storage (data lake)",    framework: "Cloud Foundation", description: "Object storage tier underpinning lake zones (raw / curated / consumption).", requiredByDefault: true },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "BigQuery",                     framework: "Cloud Foundation", description: "Serverless data warehouse + BigQuery ML + streaming inserts.", requiredByDefault: true },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Dataform",                     framework: "Cloud Foundation", description: "SQL-based ELT pipelines + version-controlled transformations in BigQuery.", requiredByDefault: true },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Dataflow",                     framework: "Cloud Foundation", description: "Managed Apache Beam for streaming + batch.", requiredByDefault: false },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Dataproc",                     framework: "Cloud Foundation", description: "Managed Spark / Hadoop for migration-heavy estates.", requiredByDefault: false },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Vertex AI",                    framework: "Cloud Foundation", description: "Unified ML + GenAI platform: training, registry, Gemini + open models, agents.", requiredByDefault: true },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Vertex AI Search / Agent Builder", framework: "Cloud Foundation", description: "Managed RAG + agent orchestration with grounding from enterprise data.", requiredByDefault: true },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Pub/Sub (stream ingest)",      framework: "Cloud Foundation", description: "Streaming ingest into BigQuery / Dataflow.", requiredByDefault: false },
  { cloud: "gcp", archetype: "data_ai", category: "ops", name: "Dataplex / Universal Catalog", framework: "Cloud Foundation", description: "Cross-source data governance, lineage, classification.", requiredByDefault: true },
];

// Combined export keeps the existing `LANDING_ZONE_CATALOG` callers working;
// new code should prefer `lzForArchetype()` for archetype-aware filtering.
export const LANDING_ZONE_CATALOG: Record<CloudType, LzComponent[]> = {
  azure: [...AZURE_INFRA, ...AZURE_PLATFORM, ...AZURE_DATA_AI],
  aws: [...AWS_INFRA, ...AWS_PLATFORM, ...AWS_DATA_AI],
  gcp: [...GCP_INFRA, ...GCP_PLATFORM, ...GCP_DATA_AI],
};

/**
 * Filter the catalog for a cloud to the LZ components that apply:
 * - All components marked `requiredByDefault: true` always surface.
 * - Optional components surface only if their `pairsWith` matches any of
 *   the detected component kinds OR `pairsWith` is omitted.
 *
 * Preserves catalog order (network → identity → security → ops →
 * data-protection) so the BOM renders consistently.
 *
 * Defaults to `infra` archetype for back-compat with the BOM generator
 * — pass `archetype: "platform" | "data_ai"` to get the additive layer.
 */
export function lzForCloud(cloud: CloudType, detected: ComponentKind[], archetype: LzArchetype = "infra"): LzComponent[] {
  return lzForArchetype(cloud, archetype, detected);
}

export function lzForArchetype(cloud: CloudType, archetype: LzArchetype, detected: ComponentKind[]): LzComponent[] {
  const catalog = LANDING_ZONE_CATALOG[cloud] ?? [];
  const detectedSet = new Set(detected);
  return catalog
    .filter((c) => c.archetype === archetype)
    .filter((c) => {
      if (c.requiredByDefault) return true;
      if (!c.pairsWith) return false;
      return c.pairsWith.some((k) => detectedSet.has(k));
    });
}

/**
 * All components for a cloud across all archetypes, with their archetype
 * tag preserved. Used by the picker page to render all three groups
 * side-by-side. Inventory-aware pre-check uses `requiredByDefault` +
 * `pairsWith` exactly like `lzForArchetype()`.
 */
export function lzAllArchetypesForCloud(cloud: CloudType): LzComponent[] {
  return LANDING_ZONE_CATALOG[cloud] ?? [];
}

/**
 * Suggest archetypes for an engagement based on its solution area + migration
 * strategy. Every engagement gets `infra`. `platform` is suggested for
 * modernization solution areas; `data_ai` for data-platform / AI app
 * solution areas. The user can always tick more.
 */
export function suggestedArchetypes(opts: {
  solutionArea: string | null | undefined;
  migrationStrategy: string | null | undefined;
}): LzArchetype[] {
  const out: LzArchetype[] = ["infra"];
  const sa = opts.solutionArea ?? "";
  const ms = opts.migrationStrategy ?? "";
  if (sa === "modernization" || sa === "greenfield_app" || sa === "on_prem_modernization" || ms === "hybrid" || ms === "modernization") {
    out.push("platform");
  }
  if (sa === "data_platform" || sa === "ai_app") {
    out.push("data_ai");
    if (!out.includes("platform")) out.push("platform"); // data/AI typically wants the app platform under it
  }
  return out;
}
