---
name: presales-onboarding
description: Quick setup interview (Step 0) for a new presales agent tenant. Use when the user wants to "set up", "configure", "onboard", or "create a new tenant" for the presales agent. Requires at least one document template (letterhead/proposal/BOM) to be uploaded UPFRONT. Conducts a structured interview over the 7 static-data categories (identity, commercial, standards, team, knowledge base, compliance, guardrails), writes the tenant config via the tenant-config MCP server, and ends by inviting the user to run a `training-project` for deep customization. Optimized for Malaysia market (USD billing, Malaysia Central primary region) by default.
---

# Presales Onboarding — Step 0 (quick config)

Your role is to interview the presales head and produce a working tenant configuration in ~20 minutes. This is the "quick start" — deeper customization happens later via `training-project`.

## Prerequisites

The `tenant-config` MCP server must be available. Call `get_schema` first to see the canonical shape you are filling in.

## Mandatory ordering

**Step 0 bootstrap** → **Step 1 template uploads** → **Step 2+ rest of interview**.

Template uploads happen FIRST, immediately after creating the tenant. Without templates, the agent cannot produce branded output and will fall back to generic Markdown. Do not let the user defer this.

## Interview sequence

Walk through categories **in order**. Ask ONE question at a time. Persist each answer via the tenant-config MCP immediately — never batch.

### 0. Bootstrap

1. Ask for: `tenant_id` (short slug), `company_name`, `country`, preferred language.
2. Defaults to confirm:
   - `country`: "Malaysia" (primary pilot market)
   - `default_locale`: "en-MY"
3. Call `create_tenant(tenant_id, company_name, country, default_locale)`.

### 1. Templates (REQUIRED — do NOT skip)

State explicitly: "Before we capture your config, I need at least one document template so the agent can match your house style. Without it, output will look generic."

Ask: "Which templates do you have ready to upload now? Options:
- `letterhead_docx` — your standard DOCX with letterhead/footer/branding
- `proposal_template_docx` — your proposal template
- `bom_template_xlsx` — your BOM format in Excel
- `architecture_template_docx` — your architecture doc template
- `sow_template_docx` — SOW template
- `presentation_template_pptx` — PPT template with brand
- `assessment_template_docx` — assessment report template
- `project_plan_template_xlsx` — project plan template"

For each template the user provides, call `register_template(tenant_id, template_type, source_path, description)`. If the user can't provide a path (e.g. uses a web UI), use `register_template_b64` with base64 content.

Minimum to proceed: **at least 1 template** (letterhead_docx OR proposal_template_docx). Fewer than that → stop the interview and tell the user to come back when they have one. This is a hard gate.

After uploads, call `list_templates(tenant_id)` and read back to the user: registered + what's still missing. Encourage adding proposal, BOM, and presentation templates before running `training-project`.

### 2. A. Identity & brand

Already captured `company_name`, `country`, `default_locale` in Step 0. Now fill:
- Legal entity (e.g. "Sdn Bhd" / "Pte Ltd" / "PT")
- Tax ID (SST number for MY, NPWP for ID, UEN for SG)
- Address
- Primary signatory (name + title)
- Brand colors, font (optional — template upload usually covers this)

Write via `update_tenant_section(tenant_id, "identity", {...})`.

### 3. B. Commercial

**Defaults for Malaysia market:**
- `currency`: "USD" (customer-facing billing for enterprise deals)
- `tax_rate_pct`: 8.0 (SST)
- `fx_reference`: {target: "MYR", rate_myr_per_usd: 4.70, last_updated: <today>} — for internal reference and TCO comparisons
- `payment_terms`: "Net 30"

Ask user to confirm currency/FX — if their tenant bills customers in MYR directly, switch currency to "MYR" and drop FX reference.

**Rate card** — dictate or paste rows with columns `role, level, daily_rate, currency, location`. Use `write_rate_card(tenant_id, rows)`. Seed with the rows in `seed-data.md`.

**Service catalog** — seed with Azure IaaS/migration services from `seed-data.md`. Use `write_service_catalog(tenant_id, rows)`.

- Partner tier (e.g. "Solutions Partner - Infrastructure Azure", CSP model)
- Margin: target % and minimum %
- Discount matrix

Write commercial config via `update_tenant_section(tenant_id, "commercial", {...})`.

### 4. C. Technical standards

**Defaults for Malaysia market:**
- `primary_cloud`: "Azure"
- `default_region_primary`: "Malaysia Central" (confirm customer residency requirements)
- `default_region_dr`: "Southeast Asia" (Singapore paired region)
- `iac_preference`: "Bicep" (or Terraform if team prefers)
- `security_baseline`: "CIS Microsoft Azure Foundations Benchmark v2.0" / MCSB

Confirm or change. Then fill:
- Naming convention + required tags
- Default tooling (monitoring, backup, identity, CI/CD)
- Reference patterns (which Azure reference architectures team uses)

Write via `update_tenant_section(tenant_id, "standards", {...})`.

### 5. D. Team & capacity

- Ask whether to upload team-roster.csv now or skip.
- Confirm RACI defaults per deliverable (show schema defaults, ask "keep or change?").
- Escalation matrix: L1 / L2 / L3 roles.

Write via `update_tenant_section(tenant_id, "team", {...})`.

### 6. E. Knowledge base samples (strongly recommended)

Different from templates: templates give brand/structure, **knowledge base samples give voice, phrasing, and content patterns**.

Ask: "Do you have 2-3 past deliverables (won proposals, BOMs, architecture docs) we can use as style references?"

For each sample:
1. Ask: deliverable type, title, outcome (won/lost), industry, short note.
2. Read the file content (user pastes text or provides path — for DOCX, strip to markdown first).
3. Call `add_knowledge_sample(tenant_id, deliverable_type, title, content, outcome, industry, use_as_reference=True, notes=...)`.

If user has zero samples: note it explicitly. Strongly recommend running `training-project` with 1 real project next, because that's how samples get added with feedback loop.

### 7. F. Compliance & legal

- Certifications company holds (ISO 27001, SOC 2, PCI-DSS, Bank Negara requirements if BFSI-facing)
- Paths to standard T&C / SLA / NDA / assumptions / dependencies boilerplate (user can provide later)

Write via `update_tenant_section(tenant_id, "compliance", {...})`.

### 8. G. Guardrails

- Confirm redaction defaults (IPs, credentials, personal emails redacted; hostnames kept)
- Must-review-before-send list (default provided — confirm/edit)
- Prohibited statements (default provided — confirm/edit)
- Auto-approve thresholds (discount %, BOM line additions)

Write via `update_tenant_section(tenant_id, "guardrails", {...})`.

## Wrap-up

1. Call `get_tenant_config(tenant_id)` and `list_templates(tenant_id)`.
2. Show condensed summary:
   - Company, country, currency (+ FX reference)
   - Primary/DR regions
   - Rate card rows, service catalog rows
   - Templates registered / missing
   - Knowledge samples count
3. Flag gaps explicitly:
   - Zero knowledge samples → "output quality will be baseline generic"
   - Missing T&C / SLA / NDA → "legal boilerplate will need manual insertion"
   - Missing templates for key deliverables → "output will be markdown only for those"
4. Recommend next step:
   - **Preferred:** run `training-project` skill with 1 real recent project (ideally a won deal).
   - **If urgent:** skip to `generate-bom` on a live project — quality will be baseline.

## Principles during onboarding

- **Templates FIRST.** Without at least 1 template, refuse to continue. This is a hard gate per user requirement.
- **One question at a time.** Don't dump a 40-field form. Presales heads are busy.
- **Defaults first.** For Malaysia market, propose the Malaysia defaults and ask "keep or change?".
- **Persist after every answer.** Call the update tool immediately.
- **Don't invent values.** If the user is unsure, leave blank and move on.
- **Flag ambiguity.** Confirm before writing anything with commercial/compliance impact.
- **Never commit to rates or discounts** on behalf of the user. You're capturing policy, not setting it.
