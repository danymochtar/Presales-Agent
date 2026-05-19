// Reference monthly USD list-prices for landing-zone components per cloud.
// Numbers are conservative published list prices for the most common SKU
// behind each component name — meant as a planning floor estimate the
// architect can refine inside the cloud's pricing calculator. Sourced from:
//   - Azure: https://azure.microsoft.com/en-us/pricing/details/{service}/
//   - AWS:   https://aws.amazon.com/{service}/pricing/
//   - GCP:   https://cloud.google.com/{service}/pricing
//
// Last refreshed: 2026-05. Refresh quarterly with the catalog.
//
// Many components have a *baseline* monthly cost (e.g. Azure Firewall ~$912
// for 730 fixed hours) plus *variable* cost (e.g. data processed at $0.016/GB).
// `monthlyUsd` represents the baseline only; `note` calls out the variable
// portion so the BOM line item carries the caveat.

import type { CloudType } from "@/lib/pricing/types";

export type LzPricingEntry = {
  monthlyUsd: number | null;
  note?: string;
};

// Keyed by `${cloud}::${componentName}`. Component names match
// `LzComponent.name` strings exactly in `src/lib/landing-zone/catalog.ts`.
const LZ_PRICES: Record<string, LzPricingEntry> = {
  // ---------- Azure infra ----------
  "azure::Hub VNet":                       { monthlyUsd: 0,    note: "VNet itself is free; cost lives in firewall + gateways + peering." },
  "azure::Spoke VNet(s)":                  { monthlyUsd: 0,    note: "Free per VNet; peering charged at ~$0.01/GB ingress + egress." },
  "azure::Azure Firewall":                 { monthlyUsd: 912,  note: "Standard SKU baseline (~$1.25/h × 730h). Premium tier ~$1,548/mo. Excludes data-processing ~$0.016/GB." },
  "azure::Virtual WAN":                    { monthlyUsd: 365,  note: "Hub deployment ~$0.50/h. Excludes routing-infrastructure unit cost ~$0.25/h and S2S/P2S charges." },
  "azure::ExpressRoute Gateway":           { monthlyUsd: 197,  note: "Standard SKU @ ~$0.27/h. Higher tiers (HighPerf / UltraPerf) scale up; circuit cost separate." },
  "azure::VPN Gateway":                    { monthlyUsd: 142,  note: "VpnGw1 ~$0.195/h. Higher VpnGw2-5 SKUs scale up; data egress separate." },
  "azure::App Gateway WAF v2":             { monthlyUsd: 317,  note: "1 capacity unit × 730h ~$0.4435/h + small fixed gateway hour cost." },
  "azure::Azure Bastion":                  { monthlyUsd: 142,  note: "Basic SKU ~$0.19/h. Standard ~$0.29/h (~$212/mo) adds host scaling + features." },
  "azure::DDoS Protection Std":            { monthlyUsd: 2944, note: "Tenant-flat ~$2,944/mo + ~$30/protected resource. Often shared across many subscriptions." },
  "azure::NAT Gateway":                    { monthlyUsd: 45,   note: "~$0.045/h × 730 plus $0.045/GB data processed." },
  "azure::Private DNS Zones":              { monthlyUsd: 5,    note: "$0.50/zone/mo (first 25 zones) + ~$0.40 per 1M DNS queries." },
  "azure::Microsoft Entra ID":             { monthlyUsd: 0,    note: "Entra ID Free is bundled with M365 / Azure tenant. P1 ~$6/user/mo. P2 ~$9/user/mo." },
  "azure::Entra Conditional Access":       { monthlyUsd: 0,    note: "Included in Entra ID P1+. Bundled cost — see Entra ID line." },
  "azure::Key Vault":                      { monthlyUsd: 5,    note: "Standard ~$0.03 per 10k operations. HSM-backed Premium adds ~$1/key/mo." },
  "azure::Defender for Cloud (CSPM)":      { monthlyUsd: 0,    note: "Foundational CSPM is free. Defender CSPM (advanced) ~$5/billable resource/mo." },
  "azure::Defender for Servers P2":        { monthlyUsd: 15,   note: "$14.60/server/mo. Multiply by detected server count." },
  "azure::Microsoft Sentinel":             { monthlyUsd: 0,    note: "Variable — $2.46/GB ingest (CY) + $0.10/GB long-term retention. Add to Log Analytics line." },
  "azure::Log Analytics Workspace":        { monthlyUsd: 230,  note: "Estimate at 50 GB/day ingest × $2.30/GB ÷ 30. PAYG only — adjust for commit tiers." },
  "azure::Azure Monitor":                  { monthlyUsd: 50,   note: "Metrics free for platform; alerts $0.10 each. Application Insights priced like Log Analytics ingest." },
  "azure::Azure Policy":                   { monthlyUsd: 0,    note: "Policy + initiative assignment is free. Guest configuration ~$6/server/mo." },
  "azure::Update Manager":                 { monthlyUsd: 0,    note: "Free for Azure VMs. Arc-enabled servers ~$5/server/mo." },
  "azure::Recovery Services Vault":        { monthlyUsd: 60,   note: "Backup baseline ~$10/VM + $0.10/GB stored. Site Recovery ~$25/VM/mo replication." },
  "azure::Azure Backup Vault":             { monthlyUsd: 30,   note: "Disk/Blob backup ~$0.10/GB stored + $0.0224/operation. PostgreSQL flex ~$0.225/GB stored." },

  // ---------- Azure platform ----------
  "azure::Azure Kubernetes Service":       { monthlyUsd: 73,   note: "Standard SKU control-plane ~$0.10/h. Free tier available for non-prod. Excludes node-pool VM cost." },
  "azure::Azure Container Registry":       { monthlyUsd: 50,   note: "Premium tier $1.50/day for replication + content trust. Standard $0.667/day. Basic $0.167/day." },
  "azure::App Service Environment v3":     { monthlyUsd: 945,  note: "Isolated v2 plan baseline ~$1.30/h. Single-tenant — significant fixed cost." },
  "azure::Container Apps":                 { monthlyUsd: 0,    note: "Consumption: $0.024/vCPU-hour + $0.003/GiB-hour above free tier. Pay only for what runs." },
  "azure::Azure Functions":                { monthlyUsd: 0,    note: "Consumption: first 1M executions free; $0.20/M after + $0.000016/GB-s. Premium plan ~$0.173/h+." },
  "azure::API Management":                 { monthlyUsd: 685,  note: "Standard v2 ~$0.94/h baseline. Developer ~$48/mo (no SLA). Premium ~$2,795/mo per unit." },
  "azure::Azure DevOps / GitHub Enterprise": { monthlyUsd: 30, note: "Azure DevOps: 5 users free, $6/user after. GitHub Enterprise: $21/user/mo." },
  "azure::Azure Service Bus":              { monthlyUsd: 10,   note: "Standard tier ~$0.0135/h + $0.80 per million operations. Premium messaging unit ~$667/mo." },
  "azure::Event Grid + Event Hubs":        { monthlyUsd: 22,   note: "Event Grid $0.60/M operations. Event Hubs Standard ~$0.03/h + $0.028/M events." },
  "azure::Defender for Containers":        { monthlyUsd: 7,    note: "~$7/vCPU/mo. AKS nodes priced per vCPU; scale with cluster size." },

  // ---------- Azure data + AI ----------
  "azure::Microsoft Fabric + OneLake":     { monthlyUsd: 525,  note: "F2 capacity ~$0.72/h. F4 ~$1.44/h. F64 (most common SME) ~$11.49/h ≈ $8,389/mo. Pause when idle." },
  "azure::Azure Data Lake Storage Gen2":   { monthlyUsd: 25,   note: "Hot LRS ~$0.0184/GB-mo. 1 TB stored ≈ $19. Operations + read/write ops extra." },
  "azure::Azure Databricks":               { monthlyUsd: 0,    note: "DBU-based — Premium SQL DBUs $0.55/DBU. Plus underlying VM cost. Pay for what runs." },
  "azure::Synapse Analytics":              { monthlyUsd: 1100, note: "DW100c ~$1.51/h. Production DW400c-DW1000c ~$6-15/h. Pause when idle." },
  "azure::Microsoft Foundry (Azure AI)":   { monthlyUsd: 0,    note: "Pay-per-token via Azure OpenAI: $5/M input + $15/M output for GPT-4o. Agent service free; pay for model + storage." },
  "azure::Azure AI Search":                { monthlyUsd: 245,  note: "S1 Standard ~$0.336/h ≈ $245/mo. Excludes vector storage + replica scaling." },
  "azure::Azure Machine Learning":         { monthlyUsd: 0,    note: "Workspace free. Compute via VM + storage + ACR. Managed endpoints priced per host hour." },
  "azure::Cosmos DB":                      { monthlyUsd: 25,   note: "Serverless: $0.279/M RUs + $0.25/GB stored. Provisioned: 400 RU/s = ~$24/mo." },
  "azure::Azure Data Factory":             { monthlyUsd: 100,  note: "$1 per 1000 pipeline orchestrations + ~$0.25/DIU-hour for data movement. Variable." },
  "azure::Purview":                        { monthlyUsd: 300,  note: "Capacity unit ~$0.41/h ≈ $300/mo. Plus scanning v-cores + storage." },

  // ---------- AWS infra ----------
  "aws::AWS Control Tower":                { monthlyUsd: 0,    note: "Free service. Underlying resources (Org trail, Config rules, etc.) are billed separately." },
  "aws::AWS Organizations + SCPs":         { monthlyUsd: 0,    note: "Free." },
  "aws::Transit Gateway":                  { monthlyUsd: 73,   note: "$36.50/attachment/mo + $0.02/GB data processed. Common LZ has 2-4 attachments." },
  "aws::Hub VPC + Spoke VPCs":             { monthlyUsd: 0,    note: "VPC + subnet free. NAT GW + endpoints + IGW data egress add cost." },
  "aws::AWS Network Firewall":             { monthlyUsd: 395,  note: "Endpoint hours ~$0.395/h ≈ $288/mo + $0.065/GB processed. Multi-AZ doubles cost." },
  "aws::Direct Connect":                   { monthlyUsd: 220,  note: "1 Gbps dedicated port ~$0.30/h ≈ $220/mo + data egress per region." },
  "aws::Site-to-Site VPN":                 { monthlyUsd: 36,   note: "$0.05/h per VPN connection ≈ $36/mo. Plus data egress. 2 tunnels per connection." },
  "aws::ALB + AWS WAF":                    { monthlyUsd: 22,   note: "ALB $0.0225/h + WAF $5/web-ACL/mo + $1/rule/mo + $0.60 per 1M requests. Baseline ≈ $22." },
  "aws::Shield Advanced":                  { monthlyUsd: 3000, note: "$3,000/mo flat across the org + data egress; warrants Enterprise-only adoption." },
  "aws::Session Manager":                  { monthlyUsd: 0,    note: "Free for EC2 + Fargate + on-prem (Advanced-tier SSM)." },
  "aws::Route 53 + Resolver":              { monthlyUsd: 15,   note: "Hosted zone $0.50/mo. Resolver inbound/outbound endpoints $0.125/ENI-hour ≈ $91/mo each." },
  "aws::IAM Identity Center":              { monthlyUsd: 0,    note: "Free service for SSO + permission sets." },
  "aws::KMS":                              { monthlyUsd: 5,    note: "$1/CMK/mo (incl. AWS-managed) + $0.03 per 10k requests. HSM tier (CloudHSM) ~$1,400/h cluster." },
  "aws::Secrets Manager":                  { monthlyUsd: 8,    note: "$0.40/secret/mo + $0.05 per 10k API calls. Versions + rotations included." },
  "aws::GuardDuty":                        { monthlyUsd: 100,  note: "VPC Flow Logs ~$1.00/GB analyzed (first 500 GB), $0.50/GB next + CloudTrail $4/M events + DNS $0.50/GB. Variable." },
  "aws::Security Hub":                     { monthlyUsd: 25,   note: "Compliance check ingest $0.0010 first 100k + $0.00006 finding ingest. ~$25 small org baseline." },
  "aws::Inspector":                        { monthlyUsd: 18,   note: "EC2 $1.51/instance/mo. ECR $0.09/image scan. Lambda function $0.30/scan." },
  "aws::CloudTrail (org trail)":           { monthlyUsd: 5,    note: "Management events free for first copy. Data events $0.10/100k events. CloudTrail Lake $0.50/GB ingested." },
  "aws::AWS Config":                       { monthlyUsd: 60,   note: "$0.003 per config item recorded + $0.001 per rule eval. Adds up across accounts; ~$60 small estate baseline." },
  "aws::CloudWatch":                       { monthlyUsd: 120,  note: "Logs $0.50/GB ingested + $0.03/GB stored. Custom metrics $0.30 each. Alarms $0.10 each." },
  "aws::AWS Backup":                       { monthlyUsd: 80,   note: "Warm storage EC2 ~$0.05/GB-mo + cross-region copy $0.04/GB. Restores $0.02/GB. RDS / EFS pricing differs." },

  // ---------- AWS platform ----------
  "aws::Amazon EKS":                       { monthlyUsd: 73,   note: "Control plane $0.10/h × 730 ≈ $73 per cluster. Excludes node-group EC2 + Fargate." },
  "aws::Amazon ECR":                       { monthlyUsd: 10,   note: "Storage $0.10/GB-mo + data transfer out. Enhanced scanning $0.09/image." },
  "aws::AWS Fargate":                      { monthlyUsd: 0,    note: "Per-task: $0.04048/vCPU-hour + $0.004445/GB-hour. Scale with workload." },
  "aws::AWS App Runner":                   { monthlyUsd: 0,    note: "Active service $0.064/vCPU-hour + $0.007/GB-hour + $0.0001/request. Pay only when handling traffic." },
  "aws::AWS Lambda":                       { monthlyUsd: 0,    note: "$0.20/M requests + $0.0000166667/GB-s. First 1M requests free monthly." },
  "aws::Amazon API Gateway":               { monthlyUsd: 25,   note: "REST $3.50/M calls. HTTP $1.00/M calls. WebSocket $1.00/M messages." },
  "aws::CodePipeline + CodeBuild":         { monthlyUsd: 40,   note: "CodePipeline $1/active pipeline/mo. CodeBuild $0.005/build-min Linux small instance." },
  "aws::Amazon SQS + SNS":                 { monthlyUsd: 5,    note: "SQS $0.40/M requests after 1M free. SNS $0.50/M publishes + delivery cost varies by protocol." },
  "aws::Amazon EventBridge":               { monthlyUsd: 1,    note: "$1 per million custom events. Default bus is free. Schema discovery $0.10/M events evaluated." },

  // ---------- AWS data + AI ----------
  "aws::Amazon S3 (data lake)":            { monthlyUsd: 25,   note: "Standard tier $0.023/GB-mo. 1 TB ≈ $23 + requests + data transfer out." },
  "aws::AWS Lake Formation":               { monthlyUsd: 0,    note: "Free. Underlying S3 + Glue Catalog + IAM all charged separately." },
  "aws::AWS Glue":                         { monthlyUsd: 88,   note: "ETL DPU-hour $0.44 × 200 DPU-hr/mo baseline. Data Catalog $1/100k objects/mo." },
  "aws::Amazon Athena":                    { monthlyUsd: 0,    note: "$5/TB data scanned. Cost-effective on Parquet/ORC. Provisioned capacity $0.30/DPU-h." },
  "aws::Amazon Redshift":                  { monthlyUsd: 730,  note: "Serverless $0.375/RPU-hour. Provisioned ra3.xlplus ~$1.086/h ≈ $792/mo per node." },
  "aws::Amazon EMR":                       { monthlyUsd: 250,  note: "Per-instance markup on EC2 (~25% premium). Variable on cluster size + uptime." },
  "aws::Amazon SageMaker":                 { monthlyUsd: 0,    note: "Notebook $0.0464/h+ ml.t3.medium. Training/inference billed per host hour by instance type." },
  "aws::Amazon Bedrock":                   { monthlyUsd: 0,    note: "Pay-per-token. Claude Sonnet 4.5 ~$3/M input + $15/M output. Provisioned throughput ~$31.50/h+ per model unit." },
  "aws::Amazon OpenSearch":                { monthlyUsd: 110,  note: "r6g.large.search ~$0.151/h ≈ $110/mo + EBS storage. Serverless OCU billed per hour active." },
  "aws::Amazon Kinesis":                   { monthlyUsd: 20,   note: "Data Streams $0.015/shard-hour + $0.014/M PUT records. Data Firehose $0.029/GB ingested." },

  // ---------- GCP infra ----------
  "gcp::Resource Hierarchy (Org / Folders)": { monthlyUsd: 0,  note: "Free." },
  "gcp::Shared VPC (host + service)":      { monthlyUsd: 0,    note: "VPC + subnets free. Cost lives in egress + interconnect + NAT." },
  "gcp::Cloud Interconnect":               { monthlyUsd: 1700, note: "Dedicated 10 Gbps ~$1,700/mo per VLAN attachment. Partner Interconnect ~$0.05/h + GB." },
  "gcp::Cloud VPN (HA-VPN)":               { monthlyUsd: 73,   note: "$0.05/h per tunnel × 730 × 2 tunnels ≈ $73/mo. Plus egress." },
  "gcp::Cloud Armor + Global LB":          { monthlyUsd: 18,   note: "Cloud Armor $5/policy/mo + $1/rule/mo + $0.75/M requests. LB $0.025/h per forwarding rule." },
  "gcp::Cloud NAT":                        { monthlyUsd: 32,   note: "$0.0014/VM-h × instances mapped + $0.045/GB processed. ~$32 baseline 1 NAT, 1 VM." },
  "gcp::IAP (Identity-Aware Proxy)":       { monthlyUsd: 0,    note: "Free for end-user identity. Tunnel data $0.10/GB egress." },
  "gcp::Cloud DNS":                        { monthlyUsd: 4,    note: "$0.20/zone/mo for first 25 + $0.40/M queries." },
  "gcp::Cloud Identity":                   { monthlyUsd: 0,    note: "Free tier covers SSO + basic IAM. Premium $6/user/mo for advanced security + endpoint mgmt." },
  "gcp::Cloud KMS":                        { monthlyUsd: 4,    note: "$0.06/key-version/mo + $0.03 per 10k operations. HSM tier $1/key-version + $1/10k operations." },
  "gcp::Secret Manager":                   { monthlyUsd: 5,    note: "$0.06/active secret/mo + $0.03 per 10k operations. Cross-region replication $0.06/secret." },
  "gcp::Security Command Center":          { monthlyUsd: 0,    note: "Standard tier free. Premium tier varies by org spend ~1.7-2.5% of compute spend." },
  "gcp::Cloud DLP":                        { monthlyUsd: 18,   note: "$1/GB inspected (storage) + $0.01/M tokens. Variable on scan frequency + volume." },
  "gcp::Cloud Logging":                    { monthlyUsd: 25,   note: "$0.50/GB ingested above 50 GiB free tier. Storage $0.01/GB-mo after 30-day default retention." },
  "gcp::Cloud Monitoring":                 { monthlyUsd: 15,   note: "Free for ~150 MB metric data/project; $0.2580/MB after. Uptime checks $0.30/M HTTPS checks." },
  "gcp::Organization Policies":            { monthlyUsd: 0,    note: "Free." },
  "gcp::Backup and DR Service":            { monthlyUsd: 100,  note: "Backup vault storage ~$0.05/GB-mo + GCS object lock. Variable on retention + cross-region copies." },

  // ---------- GCP platform ----------
  "gcp::Google Kubernetes Engine":         { monthlyUsd: 73,   note: "Cluster management $0.10/h ≈ $73/mo. Autopilot pay-per-pod $0.0445/vCPU-h + $0.0049225/GiB-h." },
  "gcp::Artifact Registry":                { monthlyUsd: 8,    note: "$0.10/GB-mo storage + $0.12/GB egress out of region. Scanning $0.26/image." },
  "gcp::Cloud Run":                        { monthlyUsd: 0,    note: "Scale-to-zero. CPU $0.000024/vCPU-s + Memory $0.0000025/GiB-s + Requests $0.40/M." },
  "gcp::Cloud Functions":                  { monthlyUsd: 0,    note: "2M invocations + 400k GB-s + 200k GHz-s free. $0.40/M invocations after." },
  "gcp::Apigee API Management":            { monthlyUsd: 500,  note: "Eval tier free. Pay-as-you-go from ~$500/mo (minimum subscription). Enterprise $20k+/yr." },
  "gcp::API Gateway":                      { monthlyUsd: 1,    note: "$3/M calls after 2M free monthly. No fixed cost." },
  "gcp::Cloud Build + Cloud Deploy":       { monthlyUsd: 10,   note: "Cloud Build 120 build-min free daily + $0.003/min after. Deploy free in preview." },
  "gcp::Pub/Sub":                          { monthlyUsd: 5,    note: "$40/TB throughput. First 10 GB free. Storage retention $0.27/GB-mo above 7 days." },

  // ---------- GCP data + AI ----------
  "gcp::Cloud Storage (data lake)":        { monthlyUsd: 20,   note: "Standard $0.020/GB-mo. 1 TB ≈ $20. Nearline $0.010/GB-mo, Coldline $0.004, Archive $0.0012." },
  "gcp::BigQuery":                         { monthlyUsd: 100,  note: "Storage $0.02/GB-mo (active) or $0.01 (long-term). Queries $6.25/TB scanned OR Editions slot reservation $0.04/slot-h." },
  "gcp::Dataform":                         { monthlyUsd: 0,    note: "Free service. Underlying BigQuery query cost applies." },
  "gcp::Dataflow":                         { monthlyUsd: 50,   note: "Batch $0.069/vCPU-h + $0.004/GB-h memory. Streaming higher rate. Pay only when pipeline runs." },
  "gcp::Dataproc":                         { monthlyUsd: 100,  note: "$0.010/vCPU/h Dataproc premium on top of underlying Compute Engine cost." },
  "gcp::Vertex AI":                        { monthlyUsd: 0,    note: "Gemini 1.5 Pro ~$1.25/M input + $5/M output. Custom training/inference billed per instance hour." },
  "gcp::Vertex AI Search / Agent Builder": { monthlyUsd: 0,    note: "Search $4/1000 queries first 10k/mo free. Agent Builder grounded $0.002/M tokens. Pay-per-use." },
  "gcp::Pub/Sub (stream ingest)":          { monthlyUsd: 5,    note: "Same pricing as Pub/Sub above; line separated when included for streaming data ingest." },
  "gcp::Dataplex / Universal Catalog":     { monthlyUsd: 60,   note: "$0.054/DCU-h + automated discovery $0.0090/DCU-h. ~$60 baseline for small estate." },
};

export function lzMonthlyUsd(cloud: CloudType, componentName: string): LzPricingEntry {
  return LZ_PRICES[`${cloud}::${componentName}`] ?? { monthlyUsd: null, note: "List price not yet catalogued — verify in the cloud's pricing calculator." };
}

/**
 * Total baseline monthly USD for a list of components on a cloud. `null`
 * entries (no price) are skipped silently — the consumer can show a
 * "+ N variable line items" footnote.
 */
export function lzBaselineMonthlyUsd(cloud: CloudType, componentNames: string[]): { totalUsd: number; pricedCount: number; unpricedCount: number } {
  let totalUsd = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const name of componentNames) {
    const p = lzMonthlyUsd(cloud, name);
    if (p.monthlyUsd != null) {
      totalUsd += p.monthlyUsd;
      pricedCount += 1;
    } else {
      unpricedCount += 1;
    }
  }
  return { totalUsd: Math.round(totalUsd * 100) / 100, pricedCount, unpricedCount };
}
