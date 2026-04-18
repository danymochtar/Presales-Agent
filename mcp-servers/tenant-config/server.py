"""Tenant config MCP server: CRUD for per-tenant config, knowledge base, and projects."""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from mcp.server.fastmcp import FastMCP

REPO_ROOT = Path(__file__).resolve().parents[2]
TENANTS_ROOT = REPO_ROOT / "tenants"
SCHEMA_PATH = REPO_ROOT / "static-data-schema" / "tenant-schema.yaml"

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
VALID_SECTIONS = {
    "identity", "commercial", "standards", "team",
    "knowledge_base", "compliance", "guardrails",
}

mcp = FastMCP("tenant-config")


def _tenant_dir(tenant_id: str) -> Path:
    if not SLUG_RE.match(tenant_id):
        raise ValueError(f"invalid tenant_id '{tenant_id}' (use lowercase, digits, hyphens)")
    return TENANTS_ROOT / tenant_id


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _dump_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@mcp.tool()
def get_schema() -> str:
    """Return the canonical tenant schema YAML as a string. Agents should read this before creating or updating tenant config."""
    return SCHEMA_PATH.read_text(encoding="utf-8")


@mcp.tool()
def list_tenants() -> list[str]:
    """List all tenant IDs (folders under tenants/, excluding those starting with underscore)."""
    if not TENANTS_ROOT.exists():
        return []
    return sorted(
        p.name for p in TENANTS_ROOT.iterdir()
        if p.is_dir() and not p.name.startswith("_") and not p.name.startswith(".")
    )


@mcp.tool()
def create_tenant(tenant_id: str, company_name: str, country: str = "", default_locale: str = "id-ID") -> dict:
    """Create a new tenant with minimal identity. Returns the initial config."""
    tdir = _tenant_dir(tenant_id)
    if tdir.exists():
        raise ValueError(f"tenant '{tenant_id}' already exists")

    template = yaml.safe_load(SCHEMA_PATH.read_text(encoding="utf-8"))
    template["identity"]["tenant_id"] = tenant_id
    template["identity"]["company_name"] = company_name
    template["identity"]["country"] = country
    template["identity"]["default_locale"] = default_locale
    template["_created_at"] = _now()

    _dump_yaml(tdir / "config.yaml", template)
    (tdir / "knowledge-base").mkdir(parents=True, exist_ok=True)
    (tdir / "templates").mkdir(parents=True, exist_ok=True)
    (tdir / "projects").mkdir(parents=True, exist_ok=True)
    _dump_yaml(tdir / "knowledge-base" / "index.yaml", {"samples": []})
    _dump_yaml(tdir / "learned-patterns.yaml", {"patterns": []})

    return template


@mcp.tool()
def get_tenant_config(tenant_id: str) -> dict:
    """Return full tenant config."""
    return _load_yaml(_tenant_dir(tenant_id) / "config.yaml")


@mcp.tool()
def update_tenant_section(tenant_id: str, section: str, data: dict) -> dict:
    """Merge `data` into a top-level section (identity, commercial, standards, team, knowledge_base, compliance, guardrails). Returns updated section."""
    if section not in VALID_SECTIONS:
        raise ValueError(f"invalid section '{section}'. Valid: {sorted(VALID_SECTIONS)}")
    cfg_path = _tenant_dir(tenant_id) / "config.yaml"
    cfg = _load_yaml(cfg_path)
    current = cfg.get(section, {}) or {}
    current.update(data)
    cfg[section] = current
    cfg["_updated_at"] = _now()
    _dump_yaml(cfg_path, cfg)
    return current


@mcp.tool()
def write_rate_card(tenant_id: str, rows: list[dict]) -> dict:
    """Write rate-card.csv. Each row: {role, level, daily_rate, currency, location}."""
    path = _tenant_dir(tenant_id) / "rate-card.csv"
    fieldnames = ["role", "level", "daily_rate", "currency", "location"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})
    return {"path": str(path.relative_to(REPO_ROOT)), "count": len(rows)}


@mcp.tool()
def read_rate_card(tenant_id: str) -> list[dict]:
    """Read rate-card.csv as list of rows."""
    path = _tenant_dir(tenant_id) / "rate-card.csv"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@mcp.tool()
def write_service_catalog(tenant_id: str, rows: list[dict]) -> dict:
    """Write service-catalog.csv. Each row: {service, default_effort_mandays, prerequisite, deliverable, notes}."""
    path = _tenant_dir(tenant_id) / "service-catalog.csv"
    fieldnames = ["service", "default_effort_mandays", "prerequisite", "deliverable", "notes"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})
    return {"path": str(path.relative_to(REPO_ROOT)), "count": len(rows)}


@mcp.tool()
def read_service_catalog(tenant_id: str) -> list[dict]:
    """Read service-catalog.csv as list of rows."""
    path = _tenant_dir(tenant_id) / "service-catalog.csv"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@mcp.tool()
def add_knowledge_sample(
    tenant_id: str,
    deliverable_type: str,
    title: str,
    content: str,
    outcome: str = "unknown",
    industry: str = "",
    use_as_reference: bool = True,
    notes: str = "",
) -> dict:
    """Save a past deliverable sample (markdown) into knowledge-base and register it in index.yaml."""
    tdir = _tenant_dir(tenant_id)
    subdir = tdir / "knowledge-base" / deliverable_type
    subdir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9-]+", "-", title.lower()).strip("-")[:60] or "sample"
    filename = f"{datetime.now().strftime('%Y%m%d')}-{slug}.md"
    path = subdir / filename
    path.write_text(content, encoding="utf-8")

    index_path = tdir / "knowledge-base" / "index.yaml"
    index = _load_yaml(index_path)
    samples = index.get("samples") or []
    samples.append({
        "path": str(path.relative_to(tdir)),
        "deliverable_type": deliverable_type,
        "title": title,
        "outcome": outcome,
        "industry": industry,
        "use_as_reference": use_as_reference,
        "notes": notes,
        "added_at": _now(),
    })
    index["samples"] = samples
    _dump_yaml(index_path, index)
    return {"path": str(path.relative_to(REPO_ROOT)), "total_samples": len(samples)}


@mcp.tool()
def list_knowledge_samples(tenant_id: str, deliverable_type: str | None = None) -> list[dict]:
    """List knowledge base samples, optionally filtered by deliverable_type."""
    index = _load_yaml(_tenant_dir(tenant_id) / "knowledge-base" / "index.yaml")
    samples = index.get("samples") or []
    if deliverable_type:
        samples = [s for s in samples if s.get("deliverable_type") == deliverable_type]
    return samples


@mcp.tool()
def read_knowledge_sample(tenant_id: str, relative_path: str) -> str:
    """Read a knowledge base sample's content by its path relative to the tenant folder."""
    path = _tenant_dir(tenant_id) / relative_path
    return path.read_text(encoding="utf-8")


@mcp.tool()
def create_project(
    tenant_id: str,
    project_id: str,
    customer: str,
    stage: str = "qualification",
    mode: str = "training",
    scope_summary: str = "",
) -> dict:
    """Create a project folder. `mode` = 'training' (onboarding) or 'production'. `stage` = qualification|proposal|negotiation|won|lost."""
    if not SLUG_RE.match(project_id):
        raise ValueError(f"invalid project_id '{project_id}'")
    pdir = _tenant_dir(tenant_id) / "projects" / project_id
    if pdir.exists():
        raise ValueError(f"project '{project_id}' already exists")
    (pdir / "inputs").mkdir(parents=True)
    (pdir / "deliverables").mkdir(parents=True)

    meta = {
        "project_id": project_id,
        "customer": customer,
        "stage": stage,
        "mode": mode,
        "scope_summary": scope_summary,
        "created_at": _now(),
    }
    _dump_yaml(pdir / "meta.yaml", meta)
    (pdir / "feedback-log.md").write_text(f"# Feedback log — {project_id}\n\n", encoding="utf-8")
    return meta


@mcp.tool()
def list_projects(tenant_id: str) -> list[dict]:
    """List all projects for a tenant with metadata."""
    pdir = _tenant_dir(tenant_id) / "projects"
    if not pdir.exists():
        return []
    out = []
    for p in sorted(pdir.iterdir()):
        if p.is_dir():
            meta = _load_yaml(p / "meta.yaml")
            if meta:
                out.append(meta)
    return out


@mcp.tool()
def get_project(tenant_id: str, project_id: str) -> dict:
    """Return project meta + list of inputs and deliverables."""
    pdir = _tenant_dir(tenant_id) / "projects" / project_id
    meta = _load_yaml(pdir / "meta.yaml")
    meta["inputs"] = [p.name for p in (pdir / "inputs").iterdir()] if (pdir / "inputs").exists() else []
    meta["deliverables"] = [p.name for p in (pdir / "deliverables").iterdir()] if (pdir / "deliverables").exists() else []
    return meta


@mcp.tool()
def save_project_input(tenant_id: str, project_id: str, filename: str, content: str) -> dict:
    """Save a text input artifact (e.g. normalized workloads JSON) into project inputs folder."""
    path = _tenant_dir(tenant_id) / "projects" / project_id / "inputs" / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {"path": str(path.relative_to(REPO_ROOT))}


@mcp.tool()
def save_project_deliverable(tenant_id: str, project_id: str, filename: str, content: str) -> dict:
    """Save a generated deliverable (markdown/yaml/csv) into project deliverables folder."""
    path = _tenant_dir(tenant_id) / "projects" / project_id / "deliverables" / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {"path": str(path.relative_to(REPO_ROOT))}


@mcp.tool()
def read_project_file(tenant_id: str, project_id: str, subpath: str) -> str:
    """Read a file from a project (subpath relative to project dir, e.g. 'inputs/workloads.json')."""
    path = _tenant_dir(tenant_id) / "projects" / project_id / subpath
    return path.read_text(encoding="utf-8")


@mcp.tool()
def log_training_feedback(
    tenant_id: str,
    project_id: str,
    deliverable: str,
    feedback: str,
    extracted_pattern: str | None = None,
) -> dict:
    """Append training feedback to the project feedback log and optionally record a learned pattern."""
    pdir = _tenant_dir(tenant_id) / "projects" / project_id
    log_path = pdir / "feedback-log.md"
    entry = f"\n## {_now()} — {deliverable}\n\n{feedback}\n"
    if extracted_pattern:
        entry += f"\n**Extracted pattern:** {extracted_pattern}\n"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(entry)

    if extracted_pattern:
        lp_path = _tenant_dir(tenant_id) / "learned-patterns.yaml"
        lp = _load_yaml(lp_path)
        patterns = lp.get("patterns") or []
        patterns.append({
            "deliverable": deliverable,
            "pattern": extracted_pattern,
            "source_project": project_id,
            "recorded_at": _now(),
        })
        lp["patterns"] = patterns
        _dump_yaml(lp_path, lp)
    return {"logged": True, "pattern_recorded": bool(extracted_pattern)}


@mcp.tool()
def list_learned_patterns(tenant_id: str, deliverable: str | None = None) -> list[dict]:
    """List patterns learned during training. Filter by deliverable if specified."""
    lp = _load_yaml(_tenant_dir(tenant_id) / "learned-patterns.yaml")
    patterns = lp.get("patterns") or []
    if deliverable:
        patterns = [p for p in patterns if p.get("deliverable") == deliverable]
    return patterns


if __name__ == "__main__":
    mcp.run()
