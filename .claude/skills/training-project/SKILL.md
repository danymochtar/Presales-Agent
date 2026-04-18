---
name: training-project
description: Run the train-of-trainer loop on a real presales project to customize the agent to the tenant's style and rules. Use when onboarding is done and the user wants to "train the agent", "do a training project", "walk through a real project", or "refine the agent". Takes 1 real project (ideally a won deal), walks through each deliverable, collects user corrections after each, extracts patterns via pattern-extractor, and persists them to learned-patterns.yaml. Ends by generating an Operating Model document summarizing what the agent learned.
---

# Training Project — train-of-trainer loop

Goal: turn generic agent output into tenant-specific output by using 1 real project as the teaching ground. The agent produces a draft, the presales head corrects, and corrections become rules.

## Prerequisites

- Tenant exists with completed `presales-onboarding` (at minimum: identity, commercial, rate card, service catalog, guardrails)
- At least 1 template registered (letterhead or proposal template)
- MCP servers available: `tenant-config`, `inventory-parser`, `pricing`
- The `pattern-extractor` skill available

If prerequisites missing, stop and direct user to `presales-onboarding` first.

## Principles

1. **One deliverable at a time.** Do not generate all deliverables upfront. Finish BOM → review → correct → next.
2. **Version every draft.** Save `bom-v1.md`, `bom-v2.md` etc. so corrections are auditable.
3. **Structural feedback only becomes a pattern.** Typo fixes and data corrections are NOT patterns. Style rules, section ordering, terminology preferences, pricing treatment, mandatory inclusions — those ARE patterns.
4. **Confirm every pattern before persisting.** Show the user the extracted pattern and ask "record this as a rule for all future X?" before saving.
5. **Stop on blocker.** If the user's feedback reveals a gap in config (missing service in catalog, missing rate), update config mid-flow — do not paper over it.

## Workflow

### Step 0. Kickoff

Ask user:
1. Which tenant?
2. Project name (slug), customer name, industry, project stage (won/lost/pending)
3. Which deliverables should we train on? Default: BOM + proposal + architecture (proposal & architecture skills arrive later; for the pilot, focus on BOM).
4. What inputs are available? (RVTools export, Azure Migrate report, requirement doc, past final version of each deliverable for comparison)

Call `create_project(tenant_id, project_id, customer, stage=<stage>, mode="training", scope_summary=<scope>)`.

### Step 1. Ingest inputs

- For each input artifact, save via `save_project_input` (if text) or have the user place it in the `inputs/` folder (if binary).
- For inventory:
  - RVTools xlsx → call `parse_rvtools(path)` → save result JSON to `inputs/workloads.json`
  - Azure Migrate export → call `parse_azure_migrate(path)` → save to `inputs/workloads.json`
  - Generic inventory → call `inspect_spreadsheet(path)` first, then `parse_generic_inventory(path, column_mapping)`
- Present a summary of what was ingested: total workloads, cpu/ram/storage totals, OS distribution, readiness breakdown. Flag any warnings.

### Step 2. Ask for the "known good" reference

For each training deliverable, ask: "Do you have the final version of the {deliverable} that actually won this deal? If yes, share it — we'll use it as ground truth."

If user provides it, save via `add_knowledge_sample(tenant_id, deliverable_type, title, content, outcome="won", industry=<industry>, use_as_reference=True, notes="training ground truth for project <project_id>")`. This sample immediately joins the reference library.

### Step 3. Per-deliverable loop

For each deliverable in scope, repeat:

#### 3.1 Generate draft vN
Invoke the deliverable's skill (e.g. `generate-bom`). Save output as `deliverables/<deliverable>-v<n>.md`.

#### 3.2 Present for review
Show the user:
- Condensed summary of the draft
- Diff against the "known good" reference (if provided) — highlight structural differences, missing sections, extra content, tone mismatches
- Ask: "What needs to change?"

#### 3.3 Collect feedback
Capture user feedback verbatim. Don't paraphrase. Save to `feedback-log.md` via `log_training_feedback(tenant_id, project_id, deliverable=<name>, feedback=<verbatim>)`.

#### 3.4 Extract patterns
Invoke `pattern-extractor` skill with:
- The verbatim feedback
- The deliverable type
- The draft vN content (for context)

It returns a list of candidate patterns. For each, show the user:
- Pattern text (e.g. "In BOMs, always separate OS licenses from compute on their own line")
- Scope (deliverable type)
- Rationale (why this was extracted)

Ask: "Persist this as a rule? (y/n/edit)". On yes/edit, call `log_training_feedback(..., extracted_pattern=<pattern>)` which updates `learned-patterns.yaml`.

#### 3.5 Regenerate if needed
If corrections are substantial, re-invoke the generate skill → save as `v(n+1)`. Skill will now read the fresh `learned-patterns.yaml` and apply the new rules. Loop until user says "good enough".

#### 3.6 Graduate the deliverable
Save the final version as `deliverables/<deliverable>-final.md`. Note in feedback log: "graduated vN as final".

### Step 4. Operating Model summary

Once all training deliverables are graduated, generate an **Operating Model** document that summarizes what the agent learned. This doubles as the team's presales SOP.

Structure:
```markdown
# Presales Operating Model — {tenant company name}
_Generated from training project: {project_id}_
_Date: {today}_

## 1. Tenant profile
- Company, currency, primary cloud, target markets
- Partner tier, compliance certifications

## 2. Deliverables in scope
Per deliverable: owner (RACI), typical mandays, DoD checklist

## 3. Learned rules
Per deliverable, list of patterns from `learned-patterns.yaml` grouped by theme:
  - Structure & sections
  - Pricing & commercial treatment
  - Tone & terminology
  - Mandatory inclusions / prohibited content
  - Approval & review workflow

## 4. Commercial model
- Rate card summary
- Service catalog key lines
- Margin & discount policy
- Guardrails: what needs review, what is auto-approved

## 5. Standards
- Default cloud architecture stance
- Preferred IaC / tooling / regions
- Tagging + naming

## 6. Known gaps (from training)
- Fields the agent had to ask about repeatedly → candidates for adding to config
- Services not in catalog but used in this project → candidates for catalog update
- Patterns that were tenant-specific vs. universal

## 7. Next steps
- Run production projects
- Update rate card quarterly
- Grow knowledge base with every won deal
```

Save as `tenants/<tenant-id>/operating-model.md` via `save_project_deliverable` (or direct write — this is a tenant-level artifact, not project-level, so write to `tenants/<tenant-id>/operating-model.md`).

### Step 5. Close out

- Update project meta: `stage = "graduated"`, `mode = "training"`
- List what was learned: count of patterns per deliverable
- Recommend: "run your next REAL project in `mode=production`. The agent will now apply these patterns automatically."

## Do NOT

- Do not generate all deliverables in parallel — the feedback loop IS the value
- Do not extract patterns without user confirmation
- Do not mark a pattern as universal if it only showed up once — phrase it as "candidate pattern, observed 1x" and let the next training iteration reinforce
- Do not modify the tenant's base config (identity, commercial) during training without explicit permission — training updates `learned-patterns.yaml` and may add to knowledge base, but never silently rewrites rate cards or margin rules
