---
name: pattern-extractor
description: Extract reusable rules from user feedback on a deliverable draft. Invoked by training-project skill after each review cycle, or standalone when the user says "remember this rule", "from now on in BOMs always X", "save as a pattern". Takes feedback text + deliverable context, returns candidate patterns scoped to deliverable type with rationale. Does NOT persist silently — always confirms with user before calling log_training_feedback to write to learned-patterns.yaml.
---

# Pattern Extractor

Turn free-form presales-head feedback into durable, tenant-specific rules.

## When to extract a pattern vs. skip

**EXTRACT** when feedback is:
- Structural: "move the executive summary to the top", "always include a risks section"
- Stylistic: "keep exec summary under one page", "use bullet points not paragraphs for scope"
- Terminology: "call it 'migration' not 'lift-and-shift'"
- Commercial treatment: "always separate OS licenses from compute line", "show 3-year RI pricing alongside PAYG"
- Content mandatory: "every BOM must have an assumptions section with FX rate", "architecture docs always include a security section per WAF"
- Content prohibited: "never mention specific competitors", "don't include customer logos in BOM"
- Conditional rules: "if industry is BFSI, always mention Defender for Cloud", "for gov clients use Bahasa Malaysia"

**SKIP** when feedback is:
- One-off data fix: "VM count should be 23 not 24"
- Typo correction: "it's 'Azure' not 'azur'"
- Project-specific: "the customer wants it by March" (unless it reveals a pattern: "always ask the customer for deadline up front")
- Emotional without specifics: "this is too long" → ask user what section is too long before extracting
- Contradicts an existing learned pattern: flag the conflict to the user, don't silently overwrite

## Input expected

From the calling skill or user:
1. `deliverable_type` — bom | proposal | architecture | assessment | project_plan
2. `feedback_text` — verbatim user feedback
3. `draft_content` — the draft being reviewed (for context)
4. `tenant_id` — for persisting
5. `project_id` — source of this pattern

## Output

A list of candidate patterns, each:
```yaml
- deliverable: "bom"
  pattern: "Always separate OS licenses from compute as their own BOM line, even when bundled in the Azure SKU"
  rationale: "User flagged: 'I want to see Windows license cost separately so customer can decide on AHB'"
  confidence: "high"    # high | medium | low
  scope: "universal"    # universal | conditional
  conditions: []        # filled if scope=conditional, e.g. ["industry=BFSI"]
  example_from_draft: "line 12 had Windows Server bundled into D4s_v5 line"
```

## Workflow

### 1. Parse feedback

Read feedback_text. Segment into atomic points (one rule per sentence/bullet where possible). For each atomic point, classify: extract | skip.

### 2. Draft candidate patterns

For each "extract" point, draft a pattern using these rules:
- Use imperative voice ("Always X", "Never Y", "Include Z when W")
- Be specific enough that a future generation can mechanically check compliance
- Scope to the deliverable type unless obviously cross-cutting
- If conditional, spell out the condition explicitly

### 3. Check for conflicts

Call `list_learned_patterns(tenant_id, deliverable=<type>)`. Compare each candidate against existing patterns. Flag any candidate that:
- Contradicts an existing pattern → ask user which wins
- Is a refinement of an existing pattern → suggest merging instead of adding new

### 4. Confirm with user

Present candidates in a concise table. For each, show: pattern | scope | rationale. Ask user to:
- Approve as-is
- Edit the pattern text
- Reject (don't extract this)
- Mark as "observe-only" (note it but don't enforce yet)

### 5. Persist approved patterns

For each approved pattern, call:
```
log_training_feedback(
    tenant_id=<id>,
    project_id=<id>,
    deliverable=<type>,
    feedback=<original verbatim feedback, so lineage is preserved>,
    extracted_pattern=<approved pattern text>
)
```

This writes to `feedback-log.md` AND appends to `learned-patterns.yaml`.

### 6. Report back

Show summary: how many candidates, how many approved, how many rejected, how many merged with existing. Return control to the calling skill (`training-project`).

## Guardrails for pattern quality

- **Specificity check**: if a pattern contains vague words like "clearly", "properly", "professionally" without a measurable criterion, push back to the user for a concrete rule.
- **Testability check**: a good pattern can be checked against a draft. "Always use professional tone" is untestable. "Always use second person ('you') not third person ('the customer') in exec summaries" is testable.
- **Universality check**: before marking a pattern `scope=universal`, confirm with user. Many rules are conditional (industry, customer segment, deal size). Defaulting to conditional is safer.
- **Decay**: if a pattern hasn't been applied in 10+ projects (future feature — tracked via application log), flag it as candidate for retirement during the next training cycle.

## Examples

### Good pattern extraction

User feedback: "The exec summary is too long. For this customer segment — MNCs — they want it under one page, bullet points only, and they care about compliance posture up front."

Extracted:
```yaml
- deliverable: "proposal"
  pattern: "For MNC customers, exec summary must be ≤1 page and use bullet points only (no paragraphs)"
  scope: "conditional"
  conditions: ["customer_segment=MNC"]
  confidence: "medium"
- deliverable: "proposal"
  pattern: "For MNC customers, lead the exec summary with a compliance posture statement before value proposition"
  scope: "conditional"
  conditions: ["customer_segment=MNC"]
  confidence: "medium"
```

### Good rejection

User feedback: "The D4s_v5 count is wrong, should be 18 not 20."

Analysis: this is a data correction, not a pattern. Skip extraction. Just log the feedback and regenerate with corrected count.

### Flag ambiguity

User feedback: "Make it better."

Analysis: vague. Do not extract. Ask: "What specifically should change? (length / structure / tone / content / ordering)"
