# Presales Agent

Self-provisioning agent for presales teams. Generates Azure deliverables (BOM first, more to come) from inventory inputs (RVTools / Azure Migrate) using live Azure Retail Prices and Claude via Vercel AI Gateway.

**Pilot market:** Malaysia. USD billing, MYR FX reference.

This repo contains two layers:

1. **Next.js web app at the repo root** — Vercel-deployable. The runnable product. See [DEPLOY.md](./DEPLOY.md).
2. **Claude Code agent assets in `.claude/skills/`, `mcp-servers/`, `static-data-schema/`, `tenants/`** — used when running the agent locally via Claude Code (CLI). Not required for the web deployment, but kept here as the source-of-truth specs and for local power-user workflows.

## Quick start (web app)

```bash
cp .env.example .env
# Fill: DATABASE_URL, BETTER_AUTH_SECRET, AI_GATEWAY_API_KEY, BETTER_AUTH_URL=http://localhost:3000

pnpm install
pnpm db:push
pnpm dev          # http://localhost:3000
```

Sign up → dashboard → create project → upload RVTools → click Generate BOM.

## Deploy to Vercel

See [DEPLOY.md](./DEPLOY.md) for full instructions. TL;DR:

1. Import repo in Vercel (no Root Directory setting needed — Next.js is at the root).
2. Set 3 env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_GATEWAY_API_KEY`.
3. Deploy.
4. Run `pnpm prisma db push` once against the prod URL to create tables.

## What works in the MVP

- Email + password auth (Better Auth)
- Default tenant auto-created with Malaysia defaults (USD, FX MYR 4.7, Malaysia Central + SEA, seeded rate card + service catalog)
- Project CRUD
- RVTools `.xlsx` upload → parsed to normalized workload schema
- Generate BOM (streamed): server fetches live Azure Retail prices in parallel, Claude composes the BOM Markdown, persists as a versioned `Deliverable`
- Versioned BOMs (v1, v2, v3, …)
- Read-only settings (rate card, service catalog, learned patterns)

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Prisma + PostgreSQL
- Better Auth (email + password)
- Tailwind + shadcn/ui primitives
- Vercel AI SDK (`ai`) + Vercel AI Gateway (`@ai-sdk/gateway`) — Anthropic models with prompt caching + streaming
- `xlsx` for RVTools parsing

## Repo layout

```
.
├── package.json               Next.js app
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── prisma/schema.prisma       Database schema
├── src/
│   ├── app/
│   │   ├── (app)/             Auth-gated: dashboard, projects, settings
│   │   ├── api/               Better Auth + projects + BOM streaming + parser
│   │   └── sign-in/
│   ├── components/            shadcn primitives + feature components
│   └── lib/
│       ├── ai.ts              Vercel AI Gateway client
│       ├── auth.ts            Better Auth server config
│       ├── prisma.ts
│       ├── tenant.ts          Default tenant bootstrap + Malaysia seed
│       ├── prompts/           BOM system prompt
│       ├── pricing/           Azure Retail + FX
│       └── inventory/         RVTools parser, sizing recommender
│
├── DEPLOY.md                  Full deployment + environment setup notes
│
├── .claude/skills/            Claude Code skills (legacy — used by the CLI agent)
├── mcp-servers/               Python MCP servers (legacy CLI agent)
├── static-data-schema/        Canonical tenant schema (reference)
└── tenants/                   Local tenant data for the CLI agent
```

## Phases

- **Phase 1 (current MVP)** — single-tenant, BOM only, read-only settings.
- **Phase 2** — settings editing UI, training-project loop + pattern extractor, generate-proposal, DOCX export, Vercel Blob for templates.
- **Phase 3** — multi-tenant, generate-architecture / assessment / project-plan, pipeline tracker, market-research MCP.

## Branch

Active development: `claude/presales-agent-pilot-qDBpJ`
