---
name: presales-onboarding
description: Quick setup interview (Step 0) for a new presales agent tenant. Use when the user wants to "set up", "configure", "onboard", or "create a new tenant" for the presales agent. Conducts a structured interview over the 7 static-data categories (identity, commercial, standards, team, knowledge base, compliance, guardrails), writes the tenant config via the tenant-config MCP server, and ends by inviting the user to run a training project for deep customization.
---

# Presales Onboarding — Step 0 (quick config)

Your role is to interview the presales head and produce a working tenant configuration in ~15 minutes. This is the "quick start" — deeper customization happens later via `training-project`.

## Prerequisites

The `tenant-config` MCP server must be available. Call `get_schema` first to see the canonical shape you are filling in.

## Interview sequence

Walk through the 7 categories **in order**. For each, ask ONE question at a time — do not dump the whole questionnaire. After each answer, write to the tenant config via `update_tenant_section` (or the dedicated tool for rate card / service catalog) before moving on, so progress is never lost.

### 0. Bootstrap

1. Ask for: `tenant_id` (short slug), `company_name`, `country`, preferred language (`id-ID` or `en-US`).
2. Call `create_tenant(tenant_id, company_name, country, default_locale)`. If it already exists, ask whether to update or pick a different id.

### A. Identity & brand

- Legal entity, tax id (NPWP/VAT), address
- Primary signatory (name + title)
- Brand colors, font, logo path (optional — can skip and add later)

Write via `update_tenant_section(tenant_id, "identity", {...})`.

### B. Commercial

- Currency (default IDR), tax rate (default 11%), payment terms
- **Rate card**: ask user to dictate or paste rows with columns `role, level, daily_rate, currency, location`. Collect as a list and call `write_rate_card(tenant_id, rows)`. Minimum set to start: Solution Architect, Presales Consultant, Project Manager, Migration Engineer, Cloud Engineer.
- **Service catalog**: standardized services with default mandays. Columns: `service, default_effort_mandays, prerequisite, deliverable, notes`. Seed examples user can confirm/edit: "Azure Landing Zone Setup" (10 md), "Network Hub-Spoke Setup" (5 md), "IaaS VM Migration per VM" (0.5 md), "SQL Managed Instance Migration" (5 md), "Entra ID Sync Setup" (3 md). Call `write_service_catalog`.
- Partner tier (Microsoft Solutions Partner designation, CSP model)
- Margin policy: target % and minimum %
- Discount matrix (auto-approve thresholds per approver level)

Write commercial config via `update_tenant_section(tenant_id, "commercial", {...})`.

### C. Technical standards

- Primary cloud (default Azure for this pilot)
- IaC preference (Bicep/Terraform)
- Default region primary + DR
- Naming convention + required tags
- Security baseline (CIS / Microsoft cloud security benchmark / custom)
- Default tooling (monitoring, backup, identity, CI/CD)
- Reference pattern library (which Azure reference architectures team uses by default)

Write via `update_tenant_section(tenant_id, "standards", {...})`.

### D. Team & capacity

- Ask if they want to upload a roster CSV now or skip. If skip, just set `roster_path` and move on.
- Confirm RACI default for each deliverable type (proposal, architecture, bom, assessment, project_plan). Show the schema defaults first and ask "keep or change?".
- Escalation matrix: L1 / L2 / L3 roles.

Write via `update_tenant_section(tenant_id, "team", {...})`.

### E. Knowledge base (CRITICAL — do not skip)

This is the single biggest driver of output quality.

Ask: "Do you have 2-3 past deliverables (proposals, BOMs, architecture docs) we can use as style references?"

For each sample the user provides:
1. Ask: deliverable type, title, outcome (won/lost), industry, short note on what's good about it.
2. Read the file content (user pastes or provides path).
3. Call `add_knowledge_sample(tenant_id, deliverable_type, title, content, outcome, industry, use_as_reference=True, notes=...)`.

If user has zero samples right now, note it explicitly: "Output quality will be generic until knowledge samples are added. Recommend running `training-project` with a real project soon."

### F. Compliance & legal

- Certifications company holds (ISO 27001, SOC 2, PCI-DSS, etc.)
- Paths to standard T&C / SLA / NDA / assumptions / dependencies boilerplate (user can provide later)

Write via `update_tenant_section(tenant_id, "compliance", {...})`.

### G. Guardrails

- Confirm redaction defaults (IPs, credentials, personal emails redacted; hostnames kept)
- Must-review-before-send list (default provided — confirm/edit)
- Prohibited statements (default provided — confirm/edit)
- Auto-approve thresholds (discount %, BOM line additions)

Write via `update_tenant_section(tenant_id, "guardrails", {...})`.

## Wrap-up

1. Call `get_tenant_config(tenant_id)` and show a condensed summary (company, currency, rate card row count, service catalog row count, knowledge sample count, primary cloud).
2. Flag gaps explicitly: zero knowledge samples, missing letterhead, missing T&C — each is a risk to output quality.
3. Recommend next step:
   - Run the `training-project` skill with 1 real recent project (ideally a won deal) to teach the agent your style.
   - Or skip to `generate-bom` on a new project if user wants to see output immediately (quality will be baseline generic).

## Principles during onboarding

- **One question at a time.** Do not dump a 40-field form. Presales heads are busy.
- **Sensible defaults first.** Show the schema default and ask "keep or change?" rather than asking from blank.
- **Persist after every answer.** Call the update tool immediately, never batch at the end.
- **Don't invent values.** If the user is unsure, leave the field blank and move on. They can update later.
- **Flag ambiguity.** If a field has compliance or commercial impact (margin, discount threshold, prohibited statements), confirm back before writing.
- **Never commit to a rate or discount on behalf of the user.** You are capturing their policy, not setting it.
