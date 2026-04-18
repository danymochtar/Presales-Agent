# Azure SKU quick reference for BOM sizing

Rough guidance for mapping on-prem workloads to Azure VM SKUs. Use Azure Migrate's `recommended_sku` when available — this sheet is a fallback.

## VM family selection

| Workload profile | Family | Notes |
|---|---|---|
| General-purpose apps, web, small DB | **Dasv5 / Dadsv5 (AMD)** or **Dsv5 (Intel)** | default pick |
| Memory-intensive (in-memory DB, analytics, SAP) | **Easv5 / Edsv5** | 8 GB RAM per vCPU |
| Compute-intensive (batch, HPC, media) | **Fsv2 / Fasv6** | 2 GB RAM per vCPU |
| Storage/IO intensive (large DB) | **Lsv3 / Ebsv5** | Premium SSD v2 / local NVMe |
| GPU (ML, rendering) | **NCasT4 v3 / NDasrA100 v4** | confirm quota availability |
| Burstable (dev/test low utilization) | **B-series (Basv2)** | cheap but throttles; not for prod |

## Right-sizing rule of thumb

1. Start from on-prem CPU cores and RAM GB.
2. Apply utilization normalization: if on-prem CPU utilization p95 < 40%, target the next SKU **down**. If p95 > 70%, keep same size.
3. Round RAM to nearest SKU tier (don't over-provision by > 25%).
4. Check vCPU:RAM ratio against family:
   - 1:4 → D-series
   - 1:8 → E-series
   - 1:2 → F-series
5. Minimum production VM: 2 vCPU / 8 GB (Standard_D2s_v5 / E2s_v5).

## Disk selection

| Use case | Disk SKU |
|---|---|
| Prod OS/data, low-latency | Premium SSD v2 (configurable IOPS) |
| Standard prod | Premium SSD (P-tier) |
| Non-prod | Standard SSD (E-tier) |
| Archive, rarely accessed | Standard HDD or Azure Blob Archive |
| Ultra-low latency (SAP HANA, OLTP) | Ultra Disk |

Default: Premium SSD v2 for prod, Standard SSD for non-prod. Size to workload + 20% headroom.

## SQL migration destinations

| Source | Preferred target | Fallback |
|---|---|---|
| SQL Server instance with SQL Agent, cross-DB queries | **SQL Managed Instance** | SQL on Azure VM |
| Single database, no instance-level features | **Azure SQL Database** | SQL MI |
| Custom SQL config, old version | **SQL on Azure VM** | — |
| MySQL/PostgreSQL on VM | **Azure Database for MySQL/PostgreSQL — Flexible Server** | same on VM |

## Supporting services baseline (per landing zone)

| Service | Typical sizing | Monthly cost order-of-magnitude |
|---|---|---|
| Azure Firewall Standard | 1× per region | $900-$1200 + data processing |
| Azure Firewall Premium | 1× per region | $1400+ |
| Bastion Standard | 1× per region | $140 |
| Log Analytics workspace | 1-2 GB/VM/month ingest | $2.30/GB (Pay-as-you-go) |
| Azure Monitor (metrics) | included with resources | marginal |
| Entra ID P1 | per user | $6/user/month |
| Entra ID P2 | per user | $9/user/month |
| Defender for Servers P2 | per VM | $15/VM/month |
| Defender for SQL | per instance | variable |
| Key Vault (standard) | per 10k ops | negligible |
| Azure Backup | per protected instance + storage | instance $5-10 + storage |

## Azure Hybrid Benefit (AHB)

If customer has Windows Server or SQL Server **Software Assurance**:
- AHB reduces Windows VM license cost by ~40% (Linux-equivalent pricing)
- AHB reduces SQL license cost by ~55% depending on edition

**Always ask** whether customer has SA before sizing Windows/SQL workloads. Default to "without AHB" and flag it as an optimization opportunity.

## Reserved Instance / Savings Plan

Typical savings vs PAYG:
- 1-year RI: ~30-40% off
- 3-year RI: ~55-65% off
- Azure Savings Plan (compute): ~30-50% off, more flexibility

Apply only to workloads with steady-state consumption (prod always-on). Never apply RI to dev/test that can deallocate.

## Currency & FX notes

Azure retail list prices are per region in USD. For IDR:
- Microsoft local billing converts monthly using their internal FX
- For proposals, use a conservative FX buffer (~3-5% above spot)
- State the FX rate and date in BOM assumptions
