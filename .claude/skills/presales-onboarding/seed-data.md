# Seed data — suggested defaults for onboarding

Present these to the user as "keep or change?" rather than asking from blank.

## Rate card seed (Indonesia, IDR, daily)

| role | level | daily_rate | currency | location |
|---|---|---|---|---|
| Solution Architect | Senior | 3500000 | IDR | ID |
| Solution Architect | Lead | 5000000 | IDR | ID |
| Presales Consultant | Mid | 2500000 | IDR | ID |
| Project Manager | Senior | 3000000 | IDR | ID |
| Cloud Engineer | Mid | 2000000 | IDR | ID |
| Cloud Engineer | Senior | 3000000 | IDR | ID |
| Migration Engineer | Senior | 3200000 | IDR | ID |
| Security Engineer | Senior | 3500000 | IDR | ID |

> Numbers above are PLACEHOLDER illustrations. Always ask the user for their real rates.

## Service catalog seed (Azure IaaS/migration focus)

| service | default_effort_mandays | prerequisite | deliverable | notes |
|---|---|---|---|---|
| Azure Landing Zone (Enterprise Scale) Setup | 15 | subscription + Entra ID tenant | LZ deployed + HLD | baseline for most engagements |
| Hub-Spoke Network Setup | 5 | landing zone | Network design + deployment | include FW SKU choice |
| IaaS VM Migration (per VM) | 0.5 | Azure Migrate assessment | Migrated VM in Azure | online via ASR/Azure Migrate |
| SQL Server to SQL MI Migration | 5 | DMS readiness report | Migrated DB + cutover plan | per instance, not per DB |
| Entra ID Connect Sync Setup | 3 | on-prem AD assessment | Hybrid identity | |
| Backup (Azure Backup) Setup | 2 | landing zone | Backup policy applied | per policy tier |
| Monitoring (Azure Monitor + LA) Setup | 3 | landing zone | Dashboards + alerts | |
| DR (Azure Site Recovery) Setup | 7 | primary + secondary region | DR runbook + tested failover | |
| POC (Azure-based) | 10 | scope defined | POC report | time-boxed |

## RACI defaults (keep unless team structure differs)

See `static-data-schema/tenant-schema.yaml` section D for defaults.

## Must-review-before-send defaults

- final pricing
- discount above matrix threshold
- legal terms changes
- commitment to delivery date

## Prohibited statements defaults

- "guaranteed performance improvement"
- "100% uptime"
- "fully automated migration with zero downtime"
- "compliant with [specific regulation]" — unless verified by legal
