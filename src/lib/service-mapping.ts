// Cross-cloud service mapping reference. Used by /services to render a
// searchable comparison table for presales engineers picking equivalents
// across Azure / AWS / GCP. Service names follow each vendor's current
// public branding (refresh annually — vendor renames are common).

export type Group =
  | "compute"
  | "storage"
  | "network"
  | "database"
  | "identity-security"
  | "monitoring"
  | "devops"
  | "ai-ml"
  | "analytics"
  | "backup-dr"
  | "messaging"
  | "migration"
  | "governance"
  | "edge-iot"
  | "specialty";

export const GROUP_LABELS: Record<Group, string> = {
  "compute": "Compute",
  "storage": "Storage",
  "network": "Networking",
  "database": "Database",
  "identity-security": "Identity & Security",
  "monitoring": "Monitoring & Operations",
  "devops": "DevOps & CI/CD",
  "ai-ml": "AI / ML / Gen AI",
  "analytics": "Analytics",
  "backup-dr": "Backup & DR",
  "messaging": "Messaging & Eventing",
  "migration": "Migration",
  "governance": "Governance & Cost",
  "edge-iot": "Edge & IoT",
  "specialty": "Vertical & Specialty",
};

export type ServiceRow = {
  group: Group;
  service: string;          // Generic capability name (cloud-neutral).
  azure: string;            // "—" if not offered as a first-party product.
  aws: string;
  gcp: string;
  notes?: string;           // Caveats, partial overlaps, recommended pairings.
};

export const SERVICE_MAP: ServiceRow[] = [
  // ---------- Compute ----------
  { group: "compute", service: "Virtual machines (IaaS)", azure: "Virtual Machines", aws: "EC2", gcp: "Compute Engine" },
  { group: "compute", service: "Spot / preemptible VMs", azure: "Spot Virtual Machines", aws: "EC2 Spot Instances", gcp: "Spot VMs" },
  { group: "compute", service: "Auto-scaling VM group", azure: "Virtual Machine Scale Sets", aws: "EC2 Auto Scaling Group", gcp: "Managed Instance Group" },
  { group: "compute", service: "Bare-metal hosts", azure: "Azure Dedicated Host / BareMetal Infrastructure", aws: "EC2 Bare Metal / Dedicated Hosts", gcp: "Bare Metal Solution / Sole-tenant nodes" },
  { group: "compute", service: "Managed Kubernetes", azure: "AKS (Azure Kubernetes Service)", aws: "EKS", gcp: "GKE" },
  { group: "compute", service: "Container instances (single container)", azure: "Container Instances (ACI)", aws: "Fargate (with ECS task)", gcp: "Cloud Run (request-based)" },
  { group: "compute", service: "Container app platform", azure: "Container Apps", aws: "App Runner", gcp: "Cloud Run" },
  { group: "compute", service: "Serverless functions", azure: "Functions", aws: "Lambda", gcp: "Cloud Functions (2nd gen)" },
  { group: "compute", service: "PaaS web app hosting", azure: "App Service", aws: "Elastic Beanstalk", gcp: "App Engine" },
  { group: "compute", service: "Batch / HPC scheduler", azure: "Batch", aws: "Batch / ParallelCluster", gcp: "Batch" },
  { group: "compute", service: "Virtual desktop", azure: "Azure Virtual Desktop", aws: "WorkSpaces", gcp: "—", notes: "GCP partners with Citrix/Cameyo; no first-party VDI." },
  { group: "compute", service: "Hybrid / on-prem extension", azure: "Azure Stack HCI / Arc", aws: "Outposts", gcp: "GDC / Anthos on bare metal" },
  { group: "compute", service: "Cloud-hosted developer workstations", azure: "Microsoft Dev Box", aws: "—", gcp: "Cloud Workstations", notes: "AWS WorkSpaces is closer to VDI than dev-machine-as-a-service." },
  { group: "compute", service: "Java/Spring app platform", azure: "Azure Spring Apps", aws: "—", gcp: "—", notes: "Outside Azure, run Spring Boot containers on AKS/EKS/GKE/Cloud Run." },
  { group: "compute", service: "Static web hosting", azure: "Static Web Apps", aws: "Amplify Hosting", gcp: "Firebase Hosting" },
  { group: "compute", service: "Confidential containers", azure: "Confidential Containers (AKS)", aws: "EKS on Nitro Enclaves", gcp: "Confidential GKE Nodes" },

  // ---------- Storage ----------
  { group: "storage", service: "Object storage", azure: "Blob Storage", aws: "S3", gcp: "Cloud Storage" },
  { group: "storage", service: "Block storage (boot + data)", azure: "Managed Disks", aws: "EBS", gcp: "Persistent Disk / Hyperdisk" },
  { group: "storage", service: "File shares (SMB/NFS)", azure: "Files", aws: "EFS / FSx", gcp: "Filestore" },
  { group: "storage", service: "Archive tier", azure: "Blob Archive Tier", aws: "S3 Glacier / Glacier Deep Archive", gcp: "Cloud Storage Coldline / Archive" },
  { group: "storage", service: "Hybrid sync / appliance", azure: "File Sync / Data Box", aws: "Storage Gateway / Snow Family", gcp: "Storage Transfer Service / Transfer Appliance" },
  { group: "storage", service: "Hyperscale parallel FS", azure: "Azure NetApp Files / Lustre", aws: "FSx for Lustre", gcp: "Parallelstore" },
  { group: "storage", service: "Extreme-IO block storage", azure: "Premium SSD v2", aws: "EBS io2 Block Express", gcp: "Hyperdisk Extreme" },
  { group: "storage", service: "First-party NetApp ONTAP", azure: "Azure NetApp Files", aws: "FSx for NetApp ONTAP", gcp: "NetApp Volumes (Cloud Volumes Service)" },
  { group: "storage", service: "Object storage with NFS access", azure: "Blob Storage NFS 3.0 / ADLS Gen2", aws: "S3 Mountpoint / S3 File Gateway", gcp: "Cloud Storage FUSE" },

  // ---------- Networking ----------
  { group: "network", service: "Virtual private network (cloud)", azure: "Virtual Network (VNet)", aws: "VPC", gcp: "VPC" },
  { group: "network", service: "L4 load balancer", azure: "Standard Load Balancer", aws: "Network Load Balancer (NLB)", gcp: "Network Load Balancer" },
  { group: "network", service: "L7 / app load balancer", azure: "Application Gateway", aws: "Application Load Balancer (ALB)", gcp: "Application Load Balancer" },
  { group: "network", service: "Global L7 LB / multi-region", azure: "Front Door", aws: "Global Accelerator + CloudFront", gcp: "Global External Application LB" },
  { group: "network", service: "Public DNS", azure: "Azure DNS", aws: "Route 53", gcp: "Cloud DNS" },
  { group: "network", service: "Private DNS", azure: "Private DNS Zones", aws: "Route 53 Private Hosted Zones", gcp: "Cloud DNS Private Zones" },
  { group: "network", service: "Content delivery network", azure: "Azure Front Door (CDN)", aws: "CloudFront", gcp: "Cloud CDN" },
  { group: "network", service: "Site-to-site VPN", azure: "VPN Gateway", aws: "Site-to-Site VPN", gcp: "Cloud VPN (HA-VPN)" },
  { group: "network", service: "Private interconnect (dedicated link)", azure: "ExpressRoute", aws: "Direct Connect", gcp: "Cloud Interconnect (Dedicated / Partner)" },
  { group: "network", service: "Hub-and-spoke / transit", azure: "Virtual WAN", aws: "Transit Gateway", gcp: "Network Connectivity Center" },
  { group: "network", service: "API gateway", azure: "API Management", aws: "API Gateway", gcp: "API Gateway / Apigee" },
  { group: "network", service: "Service mesh", azure: "Open Service Mesh / Istio add-on (AKS)", aws: "App Mesh", gcp: "Anthos Service Mesh / Cloud Service Mesh" },
  { group: "network", service: "Cloud-native firewall", azure: "Azure Firewall", aws: "Network Firewall", gcp: "Cloud NGFW" },
  { group: "network", service: "Web application firewall", azure: "Azure WAF (on Front Door / App Gateway)", aws: "AWS WAF", gcp: "Cloud Armor" },
  { group: "network", service: "DDoS protection", azure: "DDoS Protection", aws: "Shield Standard / Advanced", gcp: "Cloud Armor (DDoS)" },
  { group: "network", service: "Private endpoint to managed services", azure: "Private Link / Private Endpoint", aws: "PrivateLink / Interface Endpoint", gcp: "Private Service Connect" },
  { group: "network", service: "NAT egress", azure: "NAT Gateway", aws: "NAT Gateway", gcp: "Cloud NAT" },

  // ---------- Database ----------
  { group: "database", service: "Managed SQL (proprietary)", azure: "SQL Database / SQL Managed Instance", aws: "RDS for SQL Server", gcp: "Cloud SQL for SQL Server" },
  { group: "database", service: "Managed MySQL", azure: "Azure Database for MySQL Flexible Server", aws: "RDS for MySQL / Aurora MySQL", gcp: "Cloud SQL for MySQL / AlloyDB Omni" },
  { group: "database", service: "Managed PostgreSQL", azure: "Azure Database for PostgreSQL Flexible Server", aws: "RDS for PostgreSQL / Aurora PostgreSQL", gcp: "Cloud SQL for PostgreSQL / AlloyDB" },
  { group: "database", service: "NoSQL key-value / document", azure: "Cosmos DB (Core SQL / Mongo / Cassandra)", aws: "DynamoDB", gcp: "Firestore (Native + Datastore mode)" },
  { group: "database", service: "Wide-column NoSQL", azure: "Cosmos DB for Cassandra", aws: "Keyspaces", gcp: "Bigtable" },
  { group: "database", service: "In-memory cache", azure: "Cache for Redis / Redis Enterprise", aws: "ElastiCache (Redis / Memcached) / MemoryDB", gcp: "Memorystore (Redis / Memcached)" },
  { group: "database", service: "Graph", azure: "Cosmos DB for Apache Gremlin", aws: "Neptune", gcp: "—", notes: "GCP recommends Spanner Graph (preview) or Bigtable + JanusGraph." },
  { group: "database", service: "Time-series", azure: "Data Explorer (Kusto)", aws: "Timestream", gcp: "Bigtable / BigQuery time-series functions" },
  { group: "database", service: "Globally distributed multi-master", azure: "Cosmos DB", aws: "DynamoDB Global Tables / Aurora Global", gcp: "Spanner" },
  { group: "database", service: "Data warehouse (MPP)", azure: "Synapse Analytics / Fabric Warehouse", aws: "Redshift", gcp: "BigQuery" },
  { group: "database", service: "Search engine", azure: "AI Search", aws: "OpenSearch Service", gcp: "Vertex AI Search / Memorystore for Search" },
  { group: "database", service: "MongoDB-compatible managed", azure: "Cosmos DB for MongoDB (vCore + RU)", aws: "DocumentDB (with MongoDB compat)", gcp: "Firestore (no Mongo API)", notes: "On GCP, run MongoDB Atlas via Marketplace if Mongo API is required." },
  { group: "database", service: "Vector database (managed RAG store)", azure: "AI Search vector / Cosmos DB vector", aws: "OpenSearch Serverless (vector) / Aurora pgvector / Bedrock KB", gcp: "Vertex AI Vector Search / AlloyDB pgvector" },
  { group: "database", service: "Ledger / immutable", azure: "Confidential Ledger / SQL Ledger Tables", aws: "QLDB (deprecated; new use cases → Aurora w/ verifiable audit)", gcp: "—" },

  // ---------- Identity & Security ----------
  { group: "identity-security", service: "Identity provider (workforce + B2C)", azure: "Microsoft Entra ID (formerly Azure AD)", aws: "IAM Identity Center / Cognito", gcp: "Cloud Identity / Identity Platform" },
  { group: "identity-security", service: "Resource-level RBAC", azure: "Azure RBAC", aws: "IAM", gcp: "IAM" },
  { group: "identity-security", service: "Privileged identity management", azure: "Entra Privileged Identity Management", aws: "IAM Access Analyzer + Identity Center", gcp: "Privileged Access Manager" },
  { group: "identity-security", service: "Key management (HSM-backed)", azure: "Key Vault / Managed HSM", aws: "KMS / CloudHSM", gcp: "Cloud KMS / Cloud HSM" },
  { group: "identity-security", service: "Secrets management", azure: "Key Vault Secrets", aws: "Secrets Manager", gcp: "Secret Manager" },
  { group: "identity-security", service: "Public certificate management", azure: "App Service Certificates / Key Vault Certificates", aws: "Certificate Manager (ACM)", gcp: "Certificate Manager" },
  { group: "identity-security", service: "Cloud security posture (CSPM)", azure: "Microsoft Defender for Cloud", aws: "Security Hub", gcp: "Security Command Center" },
  { group: "identity-security", service: "Threat detection on workloads", azure: "Defender for Servers / Containers / SQL", aws: "GuardDuty", gcp: "Security Command Center Premium" },
  { group: "identity-security", service: "SIEM / SOAR", azure: "Microsoft Sentinel", aws: "Security Lake + 3rd-party SIEM", gcp: "Chronicle SIEM / SOAR" },
  { group: "identity-security", service: "Data loss prevention / classification", azure: "Microsoft Purview", aws: "Macie", gcp: "Sensitive Data Protection (DLP)" },
  { group: "identity-security", service: "Compliance program / blueprint", azure: "Compliance Manager / Blueprints", aws: "Audit Manager / Control Tower controls", gcp: "Assured Workloads / Compliance Reports" },
  { group: "identity-security", service: "Confidential compute", azure: "Confidential VMs / Containers", aws: "Nitro Enclaves", gcp: "Confidential VMs / Confidential GKE" },
  { group: "identity-security", service: "SaaS posture (CASB)", azure: "Defender for Cloud Apps", aws: "—", gcp: "—", notes: "AWS + GCP rely on partner CASBs (Netskope, Zscaler, etc.)." },
  { group: "identity-security", service: "Code / supply-chain security (SAST + dependency)", azure: "GitHub Advanced Security", aws: "CodeGuru Security / Inspector for code", gcp: "—", notes: "GCP relies on GitHub/Snyk/Mend integrations." },
  { group: "identity-security", service: "Workload identity federation (no static keys)", azure: "Workload Identity Federation", aws: "IAM Roles Anywhere", gcp: "Workload Identity Federation" },
  { group: "identity-security", service: "API security (runtime)", azure: "API Management + Defender for APIs", aws: "WAF + API Gateway + GuardDuty", gcp: "Apigee Advanced API Security" },
  { group: "identity-security", service: "Container / image scanning", azure: "Defender for Containers / Microsoft Defender Vulnerability Mgmt", aws: "ECR Scanning + Inspector", gcp: "Artifact Analysis + GKE Security Posture" },

  // ---------- Monitoring & Operations ----------
  { group: "monitoring", service: "Log aggregation", azure: "Azure Monitor Logs (Log Analytics)", aws: "CloudWatch Logs", gcp: "Cloud Logging" },
  { group: "monitoring", service: "Metrics + alerting", azure: "Azure Monitor Metrics + Alerts", aws: "CloudWatch Metrics + Alarms", gcp: "Cloud Monitoring + Alerting" },
  { group: "monitoring", service: "Distributed tracing", azure: "Application Insights", aws: "X-Ray", gcp: "Cloud Trace" },
  { group: "monitoring", service: "Application performance monitoring", azure: "Application Insights", aws: "CloudWatch Application Signals", gcp: "Cloud Profiler + Trace" },
  { group: "monitoring", service: "Synthetic / uptime checks", azure: "Application Insights Standard Tests", aws: "CloudWatch Synthetics", gcp: "Cloud Monitoring Uptime Checks" },
  { group: "monitoring", service: "Dashboards", azure: "Workbooks / Grafana managed", aws: "CloudWatch Dashboards / Managed Grafana", gcp: "Cloud Monitoring Dashboards / Managed Grafana" },
  { group: "monitoring", service: "Incident management", azure: "Azure Monitor Action Groups", aws: "Incident Manager", gcp: "Cloud Monitoring + Pub/Sub fan-out" },
  { group: "monitoring", service: "AIOps / anomaly detection on logs+metrics", azure: "Azure Monitor AIOps (preview)", aws: "DevOps Guru", gcp: "—", notes: "GCP positions this as a Vertex AI custom-model job." },
  { group: "monitoring", service: "Resource inventory / config snapshot", azure: "Resource Graph", aws: "Config", gcp: "Cloud Asset Inventory" },

  // ---------- DevOps & CI/CD ----------
  { group: "devops", service: "End-to-end DevOps suite", azure: "Azure DevOps", aws: "AWS CodeCatalyst", gcp: "—", notes: "GCP integrates with GitHub / GitLab / Cloud Build instead of bundling." },
  { group: "devops", service: "CI build service", azure: "Azure Pipelines", aws: "CodeBuild", gcp: "Cloud Build" },
  { group: "devops", service: "CD / deploy service", azure: "Azure Pipelines / Deployment Manager", aws: "CodeDeploy + CodePipeline", gcp: "Cloud Deploy" },
  { group: "devops", service: "Source control", azure: "Azure Repos / GitHub Enterprise", aws: "CodeCommit (deprecated for new) / GitHub", gcp: "Cloud Source Repositories / GitHub" },
  { group: "devops", service: "Container registry", azure: "Container Registry (ACR)", aws: "ECR", gcp: "Artifact Registry" },
  { group: "devops", service: "IaC native tooling", azure: "ARM / Bicep", aws: "CloudFormation / CDK", gcp: "Deployment Manager (legacy) / Config Connector", notes: "Most tenants pick Terraform for portability — listed for completeness." },
  { group: "devops", service: "Configuration management", azure: "Automation State Configuration / Azure Arc", aws: "Systems Manager / OpsWorks", gcp: "VM Manager / Anthos Config Management" },
  { group: "devops", service: "AI code assistant (in-IDE)", azure: "GitHub Copilot", aws: "Q Developer (replaces CodeWhisperer)", gcp: "Gemini Code Assist" },
  { group: "devops", service: "Code review / quality bot", azure: "GitHub Advanced Security + Copilot review", aws: "CodeGuru Reviewer", gcp: "—", notes: "GCP relies on partner tools (SonarCloud, CodeRabbit) on top of Cloud Build." },
  { group: "devops", service: "Cloud-native low-code app builder", azure: "Power Apps", aws: "App Studio", gcp: "AppSheet" },
  { group: "devops", service: "Software supply-chain attestations (SLSA)", azure: "GitHub Actions + sigstore", aws: "Signer + ECR + SBOM scanning", gcp: "Cloud Build + Artifact Registry attestations + Binary Authorization" },
  { group: "devops", service: "Cloud marketplace", azure: "Azure Marketplace", aws: "AWS Marketplace", gcp: "Google Cloud Marketplace" },

  // ---------- AI / ML ----------
  { group: "ai-ml", service: "End-to-end ML platform", azure: "Azure Machine Learning", aws: "SageMaker", gcp: "Vertex AI" },
  { group: "ai-ml", service: "Foundation model API (incl. GPT/Claude/Gemini)", azure: "Azure OpenAI Service", aws: "Bedrock", gcp: "Vertex AI Model Garden" },
  { group: "ai-ml", service: "Vision (OCR + classification)", azure: "AI Vision (Document Intelligence)", aws: "Rekognition + Textract", gcp: "Vision AI + Document AI" },
  { group: "ai-ml", service: "Speech (STT + TTS)", azure: "AI Speech", aws: "Transcribe + Polly", gcp: "Speech-to-Text + Text-to-Speech" },
  { group: "ai-ml", service: "Translation", azure: "AI Translator", aws: "Translate", gcp: "Cloud Translation" },
  { group: "ai-ml", service: "Conversational / agents", azure: "AI Language + Bot Service / Copilot Studio", aws: "Lex + Bedrock Agents", gcp: "Dialogflow CX / Vertex AI Agent Builder" },
  { group: "ai-ml", service: "Vector / RAG search", azure: "AI Search (vector index)", aws: "OpenSearch Serverless (vector) / Bedrock KB", gcp: "Vertex AI Search / AlloyDB pgvector" },
  { group: "ai-ml", service: "Gen AI agent + app dev studio (foundry)", azure: "Azure AI Foundry (renamed from AI Studio, Nov 2024)", aws: "Bedrock Studio + Q Apps + Bedrock Agents", gcp: "Vertex AI Agent Builder", notes: "All three bundle: model catalog, prompt flow, evals, agent orchestration, knowledge bases, deployment." },
  { group: "ai-ml", service: "GenAI safety / guardrails / content moderation", azure: "AI Content Safety + Foundry guardrails", aws: "Bedrock Guardrails", gcp: "Vertex AI safety filters + Model Armor" },
  { group: "ai-ml", service: "Foundation-model fine-tuning (managed)", azure: "Azure OpenAI fine-tuning / AI Foundry tuning", aws: "Bedrock model customization", gcp: "Vertex AI tuning (supervised + RLHF)" },
  { group: "ai-ml", service: "AI gateway / multi-model proxy", azure: "API Management AI Gateway", aws: "Bedrock unified API", gcp: "Apigee + Vertex AI endpoints", notes: "Centralised auth, rate-limit, cost tracking, model routing." },
  { group: "ai-ml", service: "Image generation API", azure: "Azure OpenAI DALL-E / GPT-Image", aws: "Bedrock (Stability, Titan Image, Nova Canvas)", gcp: "Imagen on Vertex AI" },
  { group: "ai-ml", service: "Document intelligence / form extraction", azure: "AI Document Intelligence (formerly Form Recognizer)", aws: "Textract", gcp: "Document AI" },
  { group: "ai-ml", service: "Video AI / scene + content analysis", azure: "Video Indexer", aws: "Rekognition Video", gcp: "Video Intelligence API" },
  { group: "ai-ml", service: "ML model monitoring (drift + perf)", azure: "Azure ML monitoring", aws: "SageMaker Model Monitor", gcp: "Vertex AI Model Monitoring" },
  { group: "ai-ml", service: "Personalization / recommender", azure: "Personalizer (retiring Oct 2026)", aws: "Personalize", gcp: "Recommendations AI" },
  { group: "ai-ml", service: "Forecasting", azure: "Azure ML AutoML forecasting", aws: "SageMaker Canvas (replaces Forecast)", gcp: "Vertex AI Forecasting" },
  { group: "ai-ml", service: "Anomaly detection", azure: "Anomaly Detector (retiring Oct 2026)", aws: "Lookout for Metrics (retired)", gcp: "Vertex AI custom models", notes: "Microsoft + AWS pre-built APIs both winding down — pivot to custom ML." },
  { group: "ai-ml", service: "Fraud detection", azure: "AI Content Safety + Defender for Cloud", aws: "Fraud Detector", gcp: "—", notes: "GCP customers use Vertex AI custom + partner solutions (SEON, Sift)." },

  // ---------- Analytics ----------
  { group: "analytics", service: "Stream processing", azure: "Stream Analytics / Fabric Real-Time Intelligence", aws: "Kinesis Data Analytics (Managed Flink)", gcp: "Dataflow" },
  { group: "analytics", service: "Hadoop / Spark managed", azure: "HDInsight / Synapse Spark / Fabric", aws: "EMR", gcp: "Dataproc" },
  { group: "analytics", service: "ETL / data pipeline", azure: "Data Factory / Fabric Data Pipelines", aws: "Glue / Step Functions", gcp: "Cloud Data Fusion / Dataflow / Workflows" },
  { group: "analytics", service: "Notebooks", azure: "Synapse / Fabric / ML Studio notebooks", aws: "SageMaker Studio / Glue Notebooks", gcp: "Vertex AI Workbench / Colab Enterprise" },
  { group: "analytics", service: "BI / dashboards", azure: "Power BI", aws: "QuickSight", gcp: "Looker / Looker Studio" },
  { group: "analytics", service: "Data lakehouse", azure: "Microsoft Fabric / Synapse + ADLS", aws: "Lake Formation + Athena + S3", gcp: "BigLake + BigQuery" },
  { group: "analytics", service: "Ad-hoc query on object storage", azure: "Synapse Serverless SQL", aws: "Athena", gcp: "BigQuery (external tables) / BigLake" },
  { group: "analytics", service: "Unified analytics + AI platform (SaaS)", azure: "Microsoft Fabric (OneLake, Real-Time, Power BI, Data Factory in one)", aws: "—", gcp: "—", notes: "Unique to Microsoft as a single-SKU offering. AWS/GCP equivalents are assemblies of separate services." },
  { group: "analytics", service: "Data catalog + governance", azure: "Microsoft Purview", aws: "DataZone + Glue Data Catalog", gcp: "Dataplex + Data Catalog" },
  { group: "analytics", service: "Data clean room", azure: "Azure Confidential Clean Room (preview)", aws: "AWS Clean Rooms", gcp: "BigQuery clean rooms (Analytics Hub data sharing)" },
  { group: "analytics", service: "Data sharing across orgs", azure: "Azure Data Share / Fabric data sharing", aws: "Data Exchange", gcp: "Analytics Hub" },

  // ---------- Backup & DR ----------
  { group: "backup-dr", service: "Workload backup", azure: "Azure Backup", aws: "AWS Backup", gcp: "Backup and DR Service" },
  { group: "backup-dr", service: "Disaster recovery (replication + failover)", azure: "Site Recovery", aws: "Elastic Disaster Recovery", gcp: "Backup and DR Service" },
  { group: "backup-dr", service: "Database point-in-time restore", azure: "SQL DB / Cosmos DB PITR", aws: "RDS / DynamoDB PITR", gcp: "Cloud SQL / Spanner PITR" },

  // ---------- Messaging & Eventing ----------
  { group: "messaging", service: "Pub/sub topic", azure: "Service Bus Topics", aws: "SNS", gcp: "Pub/Sub" },
  { group: "messaging", service: "Queue", azure: "Storage Queue / Service Bus Queue", aws: "SQS", gcp: "Cloud Tasks / Pub/Sub" },
  { group: "messaging", service: "Event bus (cross-service)", azure: "Event Grid", aws: "EventBridge", gcp: "Eventarc" },
  { group: "messaging", service: "High-throughput streaming", azure: "Event Hubs", aws: "Kinesis Data Streams / MSK", gcp: "Pub/Sub (high-throughput)" },
  { group: "messaging", service: "Managed Kafka", azure: "Event Hubs (Kafka API) / HDInsight Kafka", aws: "MSK / MSK Serverless", gcp: "Managed Service for Apache Kafka" },
  { group: "messaging", service: "Workflow orchestration", azure: "Logic Apps / Durable Functions", aws: "Step Functions", gcp: "Workflows" },
  { group: "messaging", service: "Real-time / WebSocket pub-sub for clients", azure: "SignalR Service / Web PubSub", aws: "API Gateway WebSockets / AppSync (GraphQL real-time) / IoT Core MQTT", gcp: "Firebase Realtime Database / Pub/Sub via gRPC" },
  { group: "messaging", service: "Email delivery (transactional)", azure: "Communication Services Email", aws: "SES", gcp: "—", notes: "GCP customers typically use SendGrid via Marketplace." },
  { group: "messaging", service: "SMS + voice (programmable)", azure: "Communication Services SMS / Calling", aws: "End User Messaging (formerly Pinpoint) / Connect", gcp: "—", notes: "GCP: Twilio is the standard partner integration." },
  { group: "messaging", service: "Push notifications (mobile + web)", azure: "Notification Hubs", aws: "End User Messaging Push (Pinpoint)", gcp: "Firebase Cloud Messaging (FCM)" },
  { group: "messaging", service: "SaaS app integration / connectors", azure: "Logic Apps connectors (1000+)", aws: "AppFlow / EventBridge SaaS partners", gcp: "Application Integration / Workflows" },

  // ---------- Migration ----------
  { group: "migration", service: "Migration assessment + discovery", azure: "Azure Migrate", aws: "Migration Hub + Application Discovery Service", gcp: "Migration Center" },
  { group: "migration", service: "VM lift-and-shift agent", azure: "Azure Migrate: Server Migration", aws: "MGN (Application Migration Service)", gcp: "Migrate to Virtual Machines" },
  { group: "migration", service: "Database migration", azure: "Database Migration Service / Database Migration Assistant", aws: "DMS + Schema Conversion Tool", gcp: "Database Migration Service" },
  { group: "migration", service: "App refactor to containers", azure: "Migrate: App Containerization", aws: "App2Container", gcp: "Migrate to Containers" },
  { group: "migration", service: "Mainframe modernization", azure: "Mainframe Migration partners (Asysco, Astadia)", aws: "Mainframe Modernization", gcp: "Dual Run + Mainframe Connector" },
  { group: "migration", service: "SAP migration / managed", azure: "Azure Center for SAP solutions", aws: "AWS for SAP / RISE", gcp: "SAP on GCP / Bare Metal Solution" },

  // ---------- Governance & Cost ----------
  { group: "governance", service: "Cost monitoring + budgets", azure: "Cost Management + Billing", aws: "Cost Explorer + Budgets", gcp: "Billing Reports + Budgets" },
  { group: "governance", service: "Tagging / labels", azure: "Tags", aws: "Resource Tags", gcp: "Labels" },
  { group: "governance", service: "Org-wide policy / guardrails", azure: "Azure Policy + Management Groups", aws: "Service Control Policies (Organizations)", gcp: "Organization Policy Service" },
  { group: "governance", service: "Account / project hierarchy", azure: "Management Groups → Subscriptions → RGs", aws: "Organizations → OUs → Accounts", gcp: "Organization → Folders → Projects" },
  { group: "governance", service: "Landing-zone reference", azure: "Azure Landing Zones (CAF)", aws: "Control Tower", gcp: "Cloud Foundation Toolkit / Landing Zone v4" },
  { group: "governance", service: "Resource provisioning at scale", azure: "Blueprints / Deployment stacks", aws: "Service Catalog + Control Tower", gcp: "Service Catalog + Terraform blueprints" },
  { group: "governance", service: "License management / BYOL", azure: "Azure Hybrid Benefit", aws: "License Manager", gcp: "—", notes: "GCP charges BYOL via project labels + custom billing reports." },
  { group: "governance", service: "Cost anomaly detection (FinOps)", azure: "Cost Management anomaly detection", aws: "Cost Anomaly Detection", gcp: "Billing anomaly detection (Recommender)" },
  { group: "governance", service: "Service quotas / limits dashboard", azure: "Quotas", aws: "Service Quotas", gcp: "Quotas" },

  // ---------- Edge & IoT ----------
  { group: "edge-iot", service: "IoT device hub", azure: "IoT Hub", aws: "IoT Core", gcp: "—", notes: "GCP retired IoT Core (Aug 2023); migrate to partner solutions or Pub/Sub + custom MQTT broker." },
  { group: "edge-iot", service: "Edge runtime / device-side compute", azure: "IoT Edge / Azure Stack Edge", aws: "IoT Greengrass / Snowcone", gcp: "Distributed Cloud Edge" },
  { group: "edge-iot", service: "Time-series telemetry store", azure: "Data Explorer (Kusto) / Time Series Insights (deprecated)", aws: "Timestream", gcp: "Bigtable" },
  { group: "edge-iot", service: "Private 5G / on-prem mobile network", azure: "Azure Private 5G Core", aws: "AWS Private 5G", gcp: "—", notes: "GCP partners with telcos via Distributed Cloud Edge instead." },
  { group: "edge-iot", service: "Telco edge / multi-access (MEC)", azure: "Azure for Operators (AOS Edge)", aws: "Wavelength + Local Zones", gcp: "Distributed Cloud Edge (telco)" },

  // ---------- Vertical & Specialty ----------
  { group: "specialty", service: "Healthcare data (FHIR / DICOM)", azure: "Azure Health Data Services (FHIR + DICOM + MedTech)", aws: "HealthLake (FHIR) + HealthImaging (DICOM)", gcp: "Cloud Healthcare API (FHIR + DICOM + HL7v2)" },
  { group: "specialty", service: "Genomics / life sciences pipelines", azure: "Microsoft Genomics", aws: "HealthOmics", gcp: "—", notes: "GCP retired Cloud Life Sciences Aug 2025; reference workflows on Batch + Cloud Storage." },
  { group: "specialty", service: "Communications PaaS (CPaaS)", azure: "Azure Communication Services", aws: "Amazon Connect + Chime SDK + End User Messaging", gcp: "—", notes: "GCP customers integrate Twilio / Vonage." },
  { group: "specialty", service: "Game backend / matchmaking + fleet", azure: "PlayFab", aws: "GameLift + GameLift Servers", gcp: "—", notes: "Game Servers retired 2024; build on GKE + Agones (open source) instead." },
  { group: "specialty", service: "Mixed reality / spatial anchors", azure: "Object Anchors / Remote Rendering / Spatial Anchors (some retired Nov 2024)", aws: "—", gcp: "—", notes: "Microsoft is winding down dedicated spatial services; AR/VR is a partner play across all clouds now." },
  { group: "specialty", service: "Digital twin", azure: "Azure Digital Twins", aws: "IoT TwinMaker", gcp: "—", notes: "GCP customers build twins on BigQuery + Pub/Sub + custom UI." },
  { group: "specialty", service: "Autonomous vehicle / fleet telemetry", azure: "Azure Mobility (preview)", aws: "IoT FleetWise + Connected Mobility Solution", gcp: "—" },
  { group: "specialty", service: "Quantum compute (cloud-hosted)", azure: "Azure Quantum (multi-vendor: IonQ, Quantinuum, Rigetti)", aws: "Braket (multi-vendor: IonQ, Rigetti, IQM, QuEra)", gcp: "—", notes: "Google Quantum AI is research-only — not a paid public service." },
  { group: "specialty", service: "Satellite ground station", azure: "Azure Orbital", aws: "AWS Ground Station", gcp: "—" },
  { group: "specialty", service: "Robotics simulation + ops", azure: "—", aws: "RoboMaker (deprecated; new use cases → Isaac on EC2)", gcp: "—", notes: "All three clouds effectively partner with NVIDIA Omniverse / Isaac for new workloads." },
  { group: "specialty", service: "Public sector / sovereign cloud", azure: "Azure Government / Sovereign / Confidential", aws: "GovCloud (US/UK/EU sovereign in-flight)", gcp: "Sovereign Controls (Assured Workloads + partner-operated)" },
  { group: "specialty", service: "Geospatial / Earth observation", azure: "Planetary Computer", aws: "Earth on AWS (registry of open data)", gcp: "Earth Engine" },
  { group: "specialty", service: "Cloud-native SAP HANA platform", azure: "SAP on Azure (HANA Large Instances)", aws: "EC2 High Memory + SAP Reference Architectures", gcp: "Bare Metal Solution + SAP HANA on GCP" },
];

// Quick lookup by group for the page sidebar / filter chips.
export function rowsByGroup(): Record<Group, ServiceRow[]> {
  const out = Object.fromEntries(
    (Object.keys(GROUP_LABELS) as Group[]).map((g) => [g, [] as ServiceRow[]]),
  ) as Record<Group, ServiceRow[]>;
  for (const r of SERVICE_MAP) out[r.group].push(r);
  return out;
}
