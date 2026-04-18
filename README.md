# Presales Agent — Pilot

A self-provisioning agent framework for presales teams. Each tenant (company / presales head) configures the agent via an onboarding interview + a train-of-trainer loop on a real project, then uses skills to generate deliverables (BOM, proposal, architecture, assessment, project plan).

This repo contains **Pilot steps 1-5**:

1. `static-data-schema/` — canonical tenant configuration schema
2. `mcp-servers/tenant-config/` — CRUD for per-tenant config, rate card, knowledge base, projects
3. `mcp-servers/inventory-parser/` — RVTools / Azure Migrate / generic inventory → normalized workloads
4. `.claude/skills/presales-onboarding/` — Step 0 quick-config interview
5. `.claude/skills/generate-bom/` — first deliverable generator

Future steps (not in this scaffold): pricing MCP, doc-render MCP, redaction MCP, training-project + pattern-extractor skills, proposal/architecture/assessment/project-plan skills, market-research MCP.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ Claude Code / Agent                                               │
│                                                                   │
│   Skills (.claude/skills/):                                       │
│     • presales-onboarding  → walks setup interview                │
│     • generate-bom          → produces Azure BOM                  │
│     • (future) training-project, generate-proposal, ...           │
│                                                                   │
└────────────┬──────────────────────────────────────────────────────┘
             │ MCP (stdio)
   ┌─────────┴──────────┬───────────────────────┐
   │                    │                       │
┌──▼──────────────┐  ┌──▼────────────────┐  ┌──▼──────────────────┐
│ tenant-config   │  │ inventory-parser  │  │ (future MCP servers)│
│ MCP server      │  │ MCP server        │  │ pricing, doc-render │
│                 │  │                   │  │ redaction, market   │
│ tenants/ folder │  │ RVTools / Azure   │  │                     │
│ config + KB +   │  │ Migrate / generic │  │                     │
│ projects        │  │ → workloads JSON  │  │                     │
└─────────────────┘  └───────────────────┘  └─────────────────────┘
```

## Quick start

### 1. Install MCP server dependencies

Each MCP server is an independent Python package. Using `uv`:

```bash
cd mcp-servers/tenant-config && uv sync && cd ../..
cd mcp-servers/inventory-parser && uv sync && cd ../..
```

Or with pip (create a virtualenv first):

```bash
pip install -e mcp-servers/tenant-config
pip install -e mcp-servers/inventory-parser
```

### 2. Register the MCP servers

The repo includes `.mcp.json` which Claude Code picks up automatically. To use with the Claude Agent SDK or another MCP client, point at `mcp-servers/<name>/server.py`.

### 3. Onboard your tenant

In Claude Code, invoke the onboarding skill:

```
/presales-onboarding
```

or just ask: "set up a new tenant for Acme Cloud". The agent will walk through the 7 schema categories and persist config under `tenants/<your-tenant-id>/`.

### 4. Parse an inventory and generate a BOM

```
I have an RVTools export at /path/to/export.xlsx. Parse it for tenant
acme-indo, project migration-phase-1, then generate a BOM.
```

The agent will:
1. Call `parse_rvtools` → normalized workloads
2. Save workloads to `tenants/acme-indo/projects/migration-phase-1/inputs/workloads.json`
3. Run `generate-bom` skill → save `deliverables/bom.md`

## The 7 static-data categories

See `static-data-schema/tenant-schema.yaml` for the canonical reference.

| # | Category | Update cadence | Why it matters |
|---|---|---|---|
| A | Identity & brand | yearly | document header, signatory, legal entity |
| B | Commercial | quarterly | rate card, service catalog, margin, discount matrix |
| C | Technical standards | as-needed | IaC, regions, naming, default tooling |
| D | Team & capacity | monthly | RACI, roster, escalation |
| E | Knowledge base | continuous | past proposals/BOMs — drives output quality |
| F | Compliance & legal | yearly | certifications, T&C, SLA, NDA |
| G | Guardrails | rarely | redaction, must-review items, auto-approve thresholds |

## Data sensitivity

Tenant folders (`tenants/<tenant-id>/`) are **gitignored by default**. The `_example/` folder is the only tenant committed to the repo as a reference shape.

RVTools/Azure Migrate exports contain hostnames, IPs, and sometimes credentials — the tenant `guardrails.data_handling` settings control redaction defaults. The redaction MCP server (future) will enforce these at the boundary to the LLM.

## Development

```
presales-agent/
├── .mcp.json                         # MCP server registration
├── .gitignore
├── README.md
├── static-data-schema/
│   └── tenant-schema.yaml            # canonical shape (7 categories)
├── .claude/skills/
│   ├── presales-onboarding/
│   │   ├── SKILL.md
│   │   └── seed-data.md              # suggested defaults
│   └── generate-bom/
│       ├── SKILL.md
│       └── sku-cheatsheet.md         # VM/disk/service sizing guide
├── mcp-servers/
│   ├── tenant-config/
│   │   ├── server.py
│   │   ├── pyproject.toml
│   │   └── README.md
│   └── inventory-parser/
│       ├── server.py
│       ├── pyproject.toml
│       └── README.md
└── tenants/
    └── _example/                     # reference tenant (committed)
        ├── config.yaml
        ├── rate-card.csv
        ├── service-catalog.csv
        ├── knowledge-base/index.yaml
        └── learned-patterns.yaml
```

## Branch

Active development branch: `claude/presales-agent-pilot-qDBpJ`.
