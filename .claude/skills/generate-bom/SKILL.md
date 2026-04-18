---
name: generate-bom
description: Generate an Azure Bill of Materials (BOM) for a presales project. Use when the user asks for a "BOM", "bill of materials", "Azure costing", "sizing", "pricing", or "quote" for a project. Consumes normalized workloads (from inventory-parser), the tenant's rate card and service catalog, and produces a structured BOM with Azure services (compute, storage, network, supporting), implementation effort (mandays), and totals. Always saves the BOM as a deliverable in the project folder.
---

# Generate Azure BOM

Produce a complete, tenant-branded Bill of Materials for an Azure project.

## Prerequisites

- `tenant-config` MCP server available
- `inventory-parser` MCP server available (if input is RVTools / Azure Migrate)
- Tenant exists and has rate card + service catalog populated
- Project exists with normalized workloads saved at `inputs/workloads.json`

If any prerequisite is missing, guide the user to run `presales-onboarding` or parse their inventory first. Do not invent data.

## Inputs you need from the user

1. `tenant_id` — which tenant
2. `project_id` — which project
3. Target Azure regions (primary + DR). If tenant config has defaults, propose those first.
4. Deployment model per workload class: lift-and-shift vs. re-platform. Default to lift-and-shift unless workload is obviously a candidate for PaaS (e.g. SQL Server → SQL MI).
5. Commercial model: Pay-as-you-go vs. Reserved Instance (1-yr / 3-yr) vs. Azure Savings Plan. If unsure, model PAYG and note the RI savings opportunity.
6. Environment uplift factors: if inventory is on-prem, confirm whether to apply CPU utilization normalization (default: size Azure VMs to the P95 utilization, not peak, to avoid over-provisioning).

## Workflow

### 1. Load context

- `get_tenant_config(tenant_id)` → identity, standards, commercial, guardrails
- `read_rate_card(tenant_id)` → role × daily_rate
- `read_service_catalog(tenant_id)` → service × default_effort_mandays
- `list_knowledge_samples(tenant_id, deliverable_type="bom")` → past BOMs for style
- `list_learned_patterns(tenant_id, deliverable="bom")` → learned patterns to apply
- `read_project_file(tenant_id, project_id, "inputs/workloads.json")` → workload list

If past BOM samples exist, read 1-2 of them with `read_knowledge_sample` and match their structure, column order, and level of detail.

### 2. Map workloads to Azure services

For each workload, determine:

| Component | Decision |
|---|---|
| **Compute SKU** | Prefer `recommended_sku` from Azure Migrate if present. Otherwise pick Dasv5/Easv5 family for general-purpose, Fsv2 for compute-heavy, Esv5 for memory-heavy. Round UP cpu/ram to nearest SKU. |
| **OS licensing** | Windows: note Azure Hybrid Benefit opportunity if customer has Software Assurance. Linux: no license cost. |
| **Disk** | Premium SSD v2 for prod, Standard SSD for non-prod. Size to workload storage_gb + 20% headroom. |
| **Network** | Count NICs; assume 1 standard NIC per VM. Egress: estimate GB/month (ask if unclear). |
| **Backup** | Include Azure Backup policy — prod daily/35-day retention, non-prod weekly/14-day. |
| **Monitoring** | Log Analytics ingestion estimate: ~1-2 GB/VM/month baseline. |
| **DR** | If workload is prod and customer wants DR: Azure Site Recovery license per instance + replica storage. |

### 3. Add shared/landing-zone services

From the service catalog, pull recurring shared services:
- Hub VNet + Azure Firewall (or NVA) — 1 per region
- Bastion host for management
- Entra ID P1/P2 licenses (count users if known, else flag as assumption)
- Defender for Cloud plans applicable
- Key Vault (1 per environment)
- Private DNS zones
- Monitoring workspace

### 4. Compute Azure monthly cost

For this pilot, the `pricing-mcp` server is NOT yet wired up. Options:
- **Option A (preferred when Azure Migrate input is available):** use `monthly_cost_estimate_usd` from the parsed workloads (Azure Migrate already priced them).
- **Option B:** ask the user to paste region-specific pricing for the main SKUs, and apply ratios for the rest. Be explicit in the BOM about which line items are "ballpark" vs. "from Azure Migrate".
- **Option C:** if user allows web research, call the pricing API via web-fetch or the (future) `pricing-mcp`. For now, mark price lines as `TBD` with the SKU and quantity filled in, and note "run through Azure Calculator before sending to customer".

Always convert to the tenant currency using the current FX rate (ask user to confirm FX or use a stated benchmark). State the FX rate used in the Assumptions section.

### 5. Compute implementation effort & services cost

- Walk through the service catalog: for each applicable service, multiply `default_effort_mandays` by quantity (per VM, per instance, per tenant as appropriate).
- Cross-reference with the project's workload count (e.g. "IaaS VM Migration per VM" × 20 VMs = 10 mandays).
- For each line, assign a role from the rate card (SA for design, Migration Engineer for execution, PM for oversight at ~15% of total).
- Multiply mandays × daily rate to get services cost.

### 6. Apply margin

Per tenant commercial config:
- Services cost × (1 / (1 - target_gross_margin_pct/100)) = services sell price
- Azure consumption is usually pass-through (0% margin) OR has a small CSP margin. Confirm with user.
- Never go below `minimum_gross_margin_pct`.

### 7. Render the BOM

Default structure (override if knowledge samples show a different house style):

```markdown
# Bill of Materials — {Customer Name}
**Project:** {project_id}
**Prepared by:** {tenant company_name}
**Date:** {today}
**Currency:** {tenant currency} (FX: 1 USD = X {currency}, dated {fx_date})

## 1. Executive summary
- Scope summary (1-2 sentences)
- Total workloads: X VMs, Y DBs
- Target regions: {primary} (DR: {dr})
- Est. monthly Azure consumption: {currency} {amount}
- One-time professional services: {currency} {amount}
- 12-month total (consumption + services): {currency} {amount}

## 2. Azure consumption (monthly)
### 2.1 Compute
| # | Workload | Azure VM SKU | vCPU | RAM | OS | AHB? | Qty | Monthly {currency} |
|---|---|---|---|---|---|---|---|---|

### 2.2 Storage
| # | Workload | Disk SKU | Size (GB) | Qty | Monthly {currency} |
|---|---|---|---|---|---|

### 2.3 Networking
| # | Service | SKU | Qty | Monthly {currency} |
|---|---|---|---|---|

### 2.4 Shared / Platform services
| # | Service | SKU | Qty | Monthly {currency} |
|---|---|---|---|---|

### 2.5 Backup, Monitoring, Security
| # | Service | SKU / Plan | Qty | Monthly {currency} |
|---|---|---|---|---|

**Azure consumption subtotal (monthly):** {currency} {amount}
**Azure consumption 12-month:** {currency} {amount × 12}

## 3. Professional services (one-time)
| # | Service | Role | Mandays | Rate/day | {currency} |
|---|---|---|---|---|---|

**Services subtotal:** {currency} {amount}
**Margin applied:** {x}%
**Services sell price:** {currency} {amount}

## 4. Grand total
| Item | {currency} |
|---|---|
| Azure consumption (12 months) | |
| Professional services (one-time) | |
| Tax ({rate}%) | |
| **Grand total** | |

## 5. Assumptions
- Pricing based on {source: Azure Migrate export / Azure Calculator / MSRP region X, dated Y}
- FX rate: 1 USD = X {currency}
- Azure consumption priced at PAYG / RI-1yr / RI-3yr (state which)
- Azure Hybrid Benefit: {applied / not applied} — customer has/does not have Software Assurance
- Backup retention: prod {X} days, non-prod {Y} days
- Egress estimated at {Z} GB/month — to be validated
- {other workload-specific assumptions}

## 6. Out of scope
- {anything explicitly excluded}

## 7. Dependencies
- {customer actions required before delivery}
```

### 8. Save and summarize

- Call `save_project_deliverable(tenant_id, project_id, "bom.md", rendered_markdown)`
- Show the user a condensed summary: total workloads, Azure monthly estimate, services mandays, grand total.
- Ask: "Ready for review? Want to adjust any assumption, or should we proceed to `generate-proposal`?"

## Guardrails

- Never fabricate pricing. If you don't have a credible source, mark the line as `TBD` — do NOT make up numbers.
- Always state the pricing source and FX rate in the Assumptions section.
- Never commit to a discount. If the user asks for one, flag the discount matrix and required approver per tenant guardrails.
- Check `list_learned_patterns` for BOM-specific rules before finalizing (e.g. "always separate licenses from compute in this tenant's BOMs").
- Apply tenant redaction policy to any hostnames/IPs that appear in the output if `guardrails.data_handling` specifies.
- Remind the user that the BOM is a draft requiring the "final pricing" review per the tenant's must-review-before-send list.

## Integration points (future)

- `pricing-mcp` will replace the manual pricing step with live Azure Retail Prices lookups
- `doc-render-mcp` will render this Markdown into DOCX/PDF with tenant branding (letterhead from `identity.brand.letterhead_path`)
- `pattern-extractor` skill will capture any user corrections as learned patterns for next time
