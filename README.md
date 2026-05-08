# Noventiq Multicloud Agent

Consultant-grade AI agent for cloud presales. Augments a senior presales head across the full multi-cloud presales lifecycle — Study → POC → Assessment → Design → Architecture → Costing → TCO → Project Plan → SOW → Proposal → Managed Services → Pipeline tracking.

**Pilot market:** Malaysia. USD billing, MYR FX reference. Single-user pilot.

## Lifecycle coverage (MVP-by-MVP roadmap)

The agent ships incrementally — one MVP at a time — and each MVP delivers a complete, testable slice of value. Each row below maps to one deployable commit.

| # | MVP | Deliverable | Status |
|---|---|---|---|
| 1 | Foundation rebrand + multi-cloud schema | Project setup with cloud checkboxes | **shipping now** |
| 2 | Multi-cloud Costing | BOM per cloud (Azure/AWS) + Compare mode | next |
| 3 | Multi-cloud Assessment | Per-workload readiness scoring | |
| 4 | Multi-cloud Architecture | Per-cloud landing zones + Mermaid | |
| 5 | Multi-cloud Proposal | Cloud strategy + recommendation | |
| 6 | TCO | Multi-year scenario analysis | |
| 7 | Project Deployment Plan | Phased plan + Mermaid Gantt | |
| 8 | SOW | Legal-grade scope, AC, change control | |
| 9 | Managed Services Offering | Tier catalog + SLA grid | |
| 10 | Customer Study / Briefing | Pre-meeting customer + market intel | |
| 11 | POC / Exercise Plan | Time-boxed POC scope + exit gates | |
| 12 | Pipeline Tracker | Opportunities + Activities (Excel I/O) | |
| 13 | Branded DOCX | Noventiq letterhead + Mermaid → PNG | |

Phase 14+ (future): knowledge base / win library, multi-tenant invite flow, CRM sync (HubSpot/Pipedrive/Salesforce), Microsoft Partner Center / AWS APN integration, GCP pricing client.

## What's in MVP 1 (current commit)

- Single-user auth (Better Auth, email + password)
- Default tenant auto-bootstrapped with Malaysia + multi-cloud defaults (Azure Malaysia Central, AWS ap-southeast-5, GCP asia-southeast2 — GCP pricing deferred)
- Multi-cloud project schema: `targetClouds[]`, `cloudRegions{}`, `customerSegment`, `primaryCloud`, `Deliverable.cloudProvider`
- Project creation form with cloud-target multi-checkbox, customer segment dropdown, per-cloud primary/DR region fields
- Project detail page shows cloud chips with primary star
- Existing BOM / Architecture / Proposal continue to work as Azure-only single-cloud (multi-cloud BOM ships in MVP 2)
- Existing settings UI (rate card, service catalog, learned patterns), training mode, DOCX export — unchanged

## Quick start (local)

```bash
cp .env.example .env
# Fill: DATABASE_URL, BETTER_AUTH_SECRET, AI_GATEWAY_API_KEY, BETTER_AUTH_URL=http://localhost:3000

pnpm install
pnpm db:push
pnpm dev          # http://localhost:3000
```

## Deploy to Vercel

See [DEPLOY.md](./DEPLOY.md). Vercel build auto-runs `prisma db push --accept-data-loss` during deploy — schema migrations apply automatically.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Prisma + PostgreSQL
- Better Auth (email + password, single-user pilot)
- Tailwind + shadcn/ui primitives
- Vercel AI SDK (`ai`) + Vercel AI Gateway (`@ai-sdk/gateway`) — Anthropic Claude with prompt caching + streaming
- `xlsx` for inventory parsing, `docx` + `marked` for DOCX export

## Repo layout

```
.
├── package.json
├── prisma/schema.prisma
├── src/
│   ├── app/
│   │   ├── api/                  Auth + project + deliverable streaming routes
│   │   ├── (app)/                Auth-gated: dashboard, projects, settings
│   │   └── sign-in/
│   ├── components/               shadcn primitives + feature components
│   └── lib/
│       ├── ai.ts                 Vercel AI Gateway client
│       ├── auth.ts
│       ├── prisma.ts
│       ├── tenant.ts             Default tenant bootstrap (multi-cloud defaults)
│       ├── prompts/              System prompts per deliverable
│       ├── pricing/              Azure Retail (multi-cloud pricing comes in MVP 2)
│       ├── inventory/            RVTools parser, sizing recommender
│       └── render/               Markdown → DOCX
│
├── DEPLOY.md
│
├── .claude/skills/               Claude Code skills (legacy CLI agent)
├── mcp-servers/                  Python MCP servers (legacy CLI agent)
├── static-data-schema/           Canonical tenant schema (reference)
└── tenants/                      Local tenant data for the CLI agent
```

## Branch

Active development: `claude/presales-agent-pilot-qDBpJ`

## Trademark note

"Noventiq" is the company name. This repository is private/internal pilot software; no public Noventiq trademark or branding asset is committed here. Update brand colors/letterhead in MVP 13 (Branded DOCX).
