# Presales Agent — Web (MVP)

Vercel-deployable Next.js 15 app. Single-tenant for MVP. Generates Azure BOMs from RVTools inventory using live Azure Retail Prices and Anthropic Claude.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Prisma + Postgres (Neon recommended)
- Better Auth (email + password, single-tenant)
- Tailwind + shadcn/ui primitives
- Vercel AI SDK (`ai`) + Vercel AI Gateway (`@ai-sdk/gateway`) for LLM routing — Anthropic models with prompt caching + streaming
- `xlsx` for RVTools parsing

## What works in MVP (Phase 1)

- Sign up / sign in (email + password)
- Default tenant auto-created on first sign-in (Malaysia, USD, FX MYR 4.7, Malaysia Central / SEA defaults, seeded rate card + service catalog)
- Create projects
- Upload RVTools `.xlsx` → parsed to normalized workload schema
- Generate BOM v1, v2, v3... (streamed) — pricing fetched from Azure Retail API server-side, then Claude composes the doc
- View previous versions
- Read-only settings page (rate card, catalog, learned patterns)

## What's NOT in MVP (Phase 2+)

- Multi-tenant (all users join the default tenant for now)
- Settings editing UI (use Prisma Studio for now)
- Training-project loop + pattern extractor
- Generate proposal / architecture / assessment / project plan
- DOCX/PPTX render
- Knowledge base browser
- Template upload (DB column exists, no UI yet)

## Local setup

```bash
cd web
cp .env.example .env
# Fill: DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -base64 32),
#       AI_GATEWAY_API_KEY, BETTER_AUTH_URL=http://localhost:3000

pnpm install      # or npm install
pnpm db:push      # creates tables
pnpm dev          # http://localhost:3000
```

Sign up → land on dashboard → create project → upload RVTools → click "Generate BOM".

## Deploy to Vercel

1. Push to GitHub (branch: `claude/presales-agent-pilot-qDBpJ`).
2. Vercel → Import Project → **Root directory: `web/`**.
3. Database: provision Postgres (Vercel Postgres / Neon / external host). DATABASE_URL is the only DB var needed.
4. Env vars to set in Vercel dashboard:
   - `DATABASE_URL` — full Postgres connection string
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `AI_GATEWAY_API_KEY` — Vercel AI Gateway key (Vercel → AI → API Keys)
   - `BETTER_AUTH_URL` — **leave unset on Vercel**; auto-detected from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`
   - `AI_MODEL` — optional, defaults to `anthropic/claude-sonnet-4.5`
5. After first deploy, push schema once from local:
   ```bash
   cd web
   DATABASE_URL="<prod-url>" pnpm prisma db push
   ```
6. Visit your domain → sign up → use.

## Vercel free tier constraints (verified)

- **Function timeout 10s** for standard Node API routes. We set `maxDuration = 60` on the BOM generate route — this exceeds Hobby's hard cap. **You'll need Pro ($20/mo)** for the BOM generate route to reliably complete on large projects, or accept truncation on free tier (smaller workloads <20 VMs should fit in 10s with streaming).
- **Body size 4.5MB** for API routes. RVTools usually <2MB so OK; the parse route limits to 10MB which works on Pro.
- **Stateless functions**: pricing cache is in-memory and resets on cold start. For consistent caching across invocations, swap `src/lib/pricing/azure.ts` cache to Vercel KV.

## Architecture map

```
User → Next.js page (server component) → Prisma → Neon Postgres
                  ↓
            Client form/button
                  ↓
        /api/projects/[id]/bom/generate
                  ↓
    1. Load tenant + workloads from DB
    2. batchVmPrices() → Azure Retail API (parallel, cached)
    3. anthropic.messages.stream() with system prompt (cached) + user prompt
    4. Stream SSE deltas → client renders live
    5. On done, save Deliverable row
```

## Folder layout

```
web/
├── prisma/schema.prisma           Database schema (Better Auth + tenant + project + bom)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...all]/      Better Auth handler
│   │   │   └── projects/...        Project + BOM routes
│   │   ├── (app)/                  Auth-gated layout: dashboard, projects, settings
│   │   ├── sign-in/                Sign in / sign up
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── page.tsx                Redirect root → dashboard or sign-in
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts                 Better Auth server config
│   │   ├── auth-client.ts          Better Auth client hooks
│   │   ├── anthropic.ts
│   │   ├── tenant.ts               Default tenant bootstrap + seed
│   │   ├── prompts/generate-bom.ts BOM system prompt (long, cached)
│   │   ├── pricing/azure.ts        Azure Retail Prices API client
│   │   ├── pricing/fx.ts           FX helpers (MYR/IDR/SGD fallback)
│   │   └── inventory/              RVTools parser, Workload schema, sizing recommender
│   └── components/
│       ├── ui/                     shadcn primitives (button, input, label, card)
│       ├── bom-workspace.tsx       BOM streaming UI
│       ├── upload-input-form.tsx   RVTools upload form
│       └── sign-out-button.tsx
└── README.md (this file)
```

## Next steps after MVP ships

1. **Settings editing UI** — rate card editor, FX update, service catalog CRUD.
2. **Training project flow** — port `training-project` + `pattern-extractor` skills to the web. UI: side-by-side draft vs feedback, pattern review modal.
3. **Generate proposal** — second deliverable, depends on a finalized BOM.
4. **DOCX export** — use `docx` library, apply tenant template.
5. **Multi-tenant** — extend tenant model, add invite flow, scope all queries.
6. **Vercel Blob** — replace in-memory file handling with Blob for templates and original artifacts.
