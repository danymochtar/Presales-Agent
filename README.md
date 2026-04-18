# Presales Agent — Pilot

A self-provisioning agent framework for presales teams. Each tenant (company / presales head) configures the agent via an onboarding interview, then trains it on 1 real project (train-of-trainer), then uses skills to generate deliverables (BOM, proposal, architecture, assessment, project plan).

**Pilot target market:** Malaysia. Customer-facing billing in USD, internal reference to MYR via FX.

## What's in the repo

### MCP servers

| Server | Purpose |
|---|---|
| `tenant-config` | CRUD for tenant config, rate card, service catalog, knowledge base, templates, projects, training feedback, learned patterns |
| `inventory-parser` | RVTools / Azure Migrate / generic inventory → normalized workload schema |
| `pricing` | Azure Retail Prices API wrapper + FX helper (USD native, MYR/IDR/SGD conversion) |

### Skills

| Skill | Purpose |
|---|---|
| `presales-onboarding` | Step 0 quick-config interview. Requires at least 1 template upload upfront. |
| `training-project` | Train-of-trainer loop. Walks 1 real project end-to-end, collects corrections, extracts patterns, graduates the agent. |
| `pattern-extractor` | Called by `training-project` (or standalone). Turns free-form feedback into durable rules stored in `learned-patterns.yaml`. |
| `generate-bom` | Produces Azure BOM using tenant config + pricing MCP + workloads. Versioned during training mode. |

Future (not yet in repo): generate-proposal, generate-architecture, generate-assessment, generate-project-plan, doc-render MCP, redaction MCP, market-research MCP.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ Claude Code / Agent                                               │
│                                                                   │
│   Skills (.claude/skills/):                                       │
│     • presales-onboarding   → setup interview + template upload   │
│     • training-project      → train-of-trainer loop               │
│     • pattern-extractor     → feedback → learned-patterns.yaml    │
│     • generate-bom          → BOM via pricing MCP                 │
│                                                                   │
└────────────┬──────────────────────────────────────────────────────┘
             │ MCP (stdio)
   ┌─────────┼──────────────────────────┬─────────────────────┐
   │         │                          │                     │
┌──▼────────────┐  ┌────────────────────▼─┐  ┌────────────────▼─┐
│ tenant-config │  │ inventory-parser    │  │ pricing           │
│               │  │                     │  │                   │
│ tenants/*     │  │ RVTools / Azure     │  │ Azure Retail API  │
│ config + KB + │  │ Migrate / generic   │  │ + FX conversion   │
│ templates +   │  │ → workloads JSON    │  │ (24h cache)       │
│ projects      │  │                     │  │                   │
└───────────────┘  └─────────────────────┘  └───────────────────┘
```

## Quick start

### 1. Install MCP server dependencies

```bash
for s in tenant-config inventory-parser pricing; do
  (cd mcp-servers/$s && uv sync)
done
```

Or with pip:

```bash
pip install -e mcp-servers/tenant-config
pip install -e mcp-servers/inventory-parser
pip install -e mcp-servers/pricing
```

### 2. Onboard your tenant

In Claude Code:

```
/presales-onboarding
```

or: "set up a new tenant for Acme Cloud in Malaysia."

The agent will:
1. Create the tenant folder under `tenants/<tenant-id>/`
2. Require you to upload at least 1 template (letterhead DOCX or proposal template)
3. Walk through the 7 config categories with Malaysia-market defaults
4. Seed rate card + service catalog
5. Invite 2-3 past deliverables as knowledge samples

### 3. Train the agent on a real project

```
/training-project
```

Pick a recent won project. The agent will:
1. Parse your inputs (RVTools / Azure Migrate)
2. Generate each deliverable (starting with BOM)
3. Show it to you
4. Take your feedback verbatim
5. Invoke `pattern-extractor` to lift rules out of the feedback
6. Confirm each candidate rule with you before persisting
7. Regenerate with new rules applied
8. Generate an Operating Model document at the end

### 4. Generate BOMs for real

```
I have an RVTools export at /path/to/export.xlsx. Parse it for tenant
acme-my, project migration-phase-1, then generate a BOM in Malaysia Central
with southeast asia DR.
```

## The 7 static-data categories

See `static-data-schema/tenant-schema.yaml` for the canonical reference.

| # | Category | Update cadence |
|---|---|---|
| A | Identity & brand | yearly |
| B | Commercial (rate card, catalog, margin, FX) | quarterly |
| C | Technical standards | as-needed |
| D | Team & capacity | monthly |
| E | Knowledge base (past deliverables) | continuous |
| F | Compliance & legal | yearly |
| G | Guardrails | rarely |
| + | Templates (DOCX/PPTX/XLSX) | rarely — required at onboarding |

## Malaysia market defaults

- **Billing currency:** USD (customer-facing for enterprise)
- **FX reference:** MYR (for internal TCO + customer-facing MYR equivalents)
- **Primary region:** Malaysia Central (for data residency, BFSI, gov)
- **DR region:** Southeast Asia (Singapore — Malaysia Central's paired region)
- **Tax:** SST 8%
- **Compliance frequently relevant:** PDPA 2010, Bank Negara RMiT (BFSI), MAMPU guidelines (gov)

Rate card seed: see `.claude/skills/presales-onboarding/seed-data.md` for USD daily rates at Malaysia market ballpark.

## Data sensitivity

- Tenant folders (`tenants/<id>/`) are **gitignored**. Only `_example/` is committed.
- RVTools / Azure Migrate exports contain sensitive data — tenant `guardrails.data_handling` controls redaction defaults (IPs + credentials + emails redacted by default; hostnames kept since they encode useful context).
- Pricing MCP cache (`mcp-servers/pricing/.cache/`) is gitignored.

## Repo layout

```
presales-agent/
├── .mcp.json                         # registers 3 MCP servers
├── .gitignore
├── README.md
├── static-data-schema/
│   └── tenant-schema.yaml            # canonical shape (7 categories + templates)
├── .claude/skills/
│   ├── presales-onboarding/          # SKILL.md + seed-data.md
│   ├── training-project/             # train-of-trainer loop
│   ├── pattern-extractor/            # feedback → rules
│   └── generate-bom/                 # SKILL.md + sku-cheatsheet.md
├── mcp-servers/
│   ├── tenant-config/                # tenant + KB + templates + projects + feedback
│   ├── inventory-parser/             # RVTools / Azure Migrate / generic
│   └── pricing/                      # Azure Retail Prices + FX
└── tenants/
    └── _example/                     # Malaysia reference tenant (USD, MY Central)
        ├── config.yaml
        ├── rate-card.csv
        ├── service-catalog.csv
        ├── knowledge-base/index.yaml
        └── learned-patterns.yaml
```

## Branch

Active development: `claude/presales-agent-pilot-qDBpJ`
