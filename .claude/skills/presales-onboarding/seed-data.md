# Seed data — suggested defaults for onboarding (Malaysia market)

Present these to the user as "keep or change?" rather than asking from blank.

## Rate card seed (Malaysia, USD, daily)

| role | level | daily_rate | currency | location |
|---|---|---|---|---|
| Solution Architect | Senior | 900 | USD | MY |
| Solution Architect | Lead | 1200 | USD | MY |
| Presales Consultant | Mid | 650 | USD | MY |
| Project Manager | Senior | 750 | USD | MY |
| Cloud Engineer | Mid | 500 | USD | MY |
| Cloud Engineer | Senior | 750 | USD | MY |
| Migration Engineer | Senior | 800 | USD | MY |
| Security Engineer | Senior | 900 | USD | MY |

> PLACEHOLDER illustrations at MY market ballpark. Always ask user for real rates.

## Service catalog seed (Azure IaaS/migration focus)

| service | default_effort_mandays | prerequisite | deliverable | notes |
|---|---|---|---|---|
| Azure Landing Zone (Enterprise Scale) Setup | 15 | subscription + Entra ID tenant | LZ deployed + HLD | baseline for most engagements |
| Hub-Spoke Network Setup | 5 | landing zone | Network design + deployment | include FW SKU choice |
| IaaS VM Migration (per VM) | 0.5 | Azure Migrate assessment | Migrated VM in Azure | online via ASR/Azure Migrate |
| SQL Server to SQL MI Migration | 5 | DMS readiness report | Migrated DB + cutover plan | per instance |
| Entra ID Connect Sync Setup | 3 | on-prem AD assessment | Hybrid identity | |
| Azure Backup Policy Setup | 2 | landing zone | Backup policy applied | per tier |
| Azure Monitor + Log Analytics Setup | 3 | landing zone | Dashboards + alerts | |
| Azure Site Recovery (DR) Setup | 7 | primary + secondary region | DR runbook + tested failover | |
| POC (Azure-based) | 10 | scope defined | POC report | time-boxed |

## Malaysia market defaults

- **Primary region**: Malaysia Central (GA — use for data residency, BFSI, gov)
- **Fallback region**: Southeast Asia (Singapore — wider SKU availability)
- **DR region**: Southeast Asia (paired with Malaysia Central)
- **Currency**: USD customer-facing; MYR internal reference (FX ~4.70 MYR/USD, confirm current)
- **Tax**: SST 8% for services; check customer tax residency
- **Compliance often relevant**: Bank Negara Malaysia (BFSI), PDPA 2010 (all), MAMPU guidelines (gov)

## RACI defaults (keep unless team structure differs)

See `static-data-schema/tenant-schema.yaml` section D for defaults.

## Must-review-before-send defaults

- final pricing
- discount above matrix threshold
- legal terms changes
- commitment to delivery date
- data residency claims (especially for BFSI / gov)

## Prohibited statements defaults

- "guaranteed performance improvement"
- "100% uptime"
- "fully automated migration with zero downtime"
- "compliant with [regulation]" — unless verified by legal
- any reference to competitor by name without comparison disclaimer
