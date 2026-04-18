"""Inventory parser MCP server.

Parses RVTools exports, Azure Migrate assessment exports, and generic inventory
spreadsheets into a normalized `Workload` schema that downstream skills
(generate-bom, generate-architecture, generate-assessment) consume.

Normalized workload schema:
{
  "id": str,                   # stable identifier (vm name slug)
  "name": str,
  "type": "vm" | "database" | "storage" | "app" | "unknown",
  "cpu_cores": int,
  "ram_gb": float,
  "storage_gb": float,
  "os": str,                   # normalized family e.g. "Windows Server 2019", "RHEL 8"
  "powerstate": "on" | "off" | "unknown",
  "environment": "prod" | "non-prod" | "unknown",
  "criticality": "high" | "medium" | "low" | "unknown",
  "location": {"datacenter": str, "cluster": str, "host": str, "region": ""},
  "azure_readiness": "ready" | "ready-with-conditions" | "not-ready" | "unknown",
  "recommended_sku": str,      # from Azure Migrate if present
  "monthly_cost_estimate_usd": float | None,
  "notes": str,
  "source": "rvtools" | "azure-migrate" | "generic"
}
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("inventory-parser")


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", (name or "").lower()).strip("-") or "unknown"


def _to_gb(value: Any, unit_hint: str = "mb") -> float:
    """Convert sizes to GB. `unit_hint` = 'mb' | 'gb' | 'kb' | 'bytes'."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    unit_hint = unit_hint.lower()
    if unit_hint in ("gb", "gib"):
        return round(n, 2)
    if unit_hint in ("mb", "mib"):
        return round(n / 1024, 2)
    if unit_hint in ("kb", "kib"):
        return round(n / (1024 * 1024), 2)
    if unit_hint == "bytes":
        return round(n / (1024 ** 3), 2)
    return round(n, 2)


def _normalize_os(raw: str) -> str:
    if not raw:
        return "unknown"
    s = str(raw).strip()
    patterns = [
        (r"windows\s*server\s*(\d{4}).*", lambda m: f"Windows Server {m.group(1)}"),
        (r"windows\s*(\d+).*", lambda m: f"Windows {m.group(1)}"),
        (r"red\s*hat.*?(\d+)", lambda m: f"RHEL {m.group(1)}"),
        (r"rhel.*?(\d+)", lambda m: f"RHEL {m.group(1)}"),
        (r"ubuntu.*?(\d+\.\d+|\d+)", lambda m: f"Ubuntu {m.group(1)}"),
        (r"centos.*?(\d+)", lambda m: f"CentOS {m.group(1)}"),
        (r"debian.*?(\d+)", lambda m: f"Debian {m.group(1)}"),
        (r"suse.*?(\d+)", lambda m: f"SLES {m.group(1)}"),
        (r"oracle.*?linux.*?(\d+)", lambda m: f"Oracle Linux {m.group(1)}"),
    ]
    lower = s.lower()
    for pat, fn in patterns:
        m = re.search(pat, lower)
        if m:
            return fn(m)
    return s[:60]


def _infer_environment(name: str, annotation: str = "") -> str:
    blob = f"{name} {annotation}".lower()
    prod_markers = ("prod", "-prd", " prd", "production")
    nonprod_markers = ("dev", "test", "stag", "uat", "qa", "sandbox", "nonprod", "non-prod")
    if any(m in blob for m in prod_markers):
        return "prod"
    if any(m in blob for m in nonprod_markers):
        return "non-prod"
    return "unknown"


def _empty_workload() -> dict:
    return {
        "id": "",
        "name": "",
        "type": "vm",
        "cpu_cores": 0,
        "ram_gb": 0.0,
        "storage_gb": 0.0,
        "os": "unknown",
        "powerstate": "unknown",
        "environment": "unknown",
        "criticality": "unknown",
        "location": {"datacenter": "", "cluster": "", "host": "", "region": ""},
        "azure_readiness": "unknown",
        "recommended_sku": "",
        "monthly_cost_estimate_usd": None,
        "notes": "",
        "source": "",
    }


@mcp.tool()
def parse_rvtools(file_path: str) -> dict:
    """Parse RVTools .xlsx export. Reads vInfo (VMs) and vHost (hosts) sheets.

    Returns: {"workloads": [...], "summary": {...}, "warnings": [...]}.
    """
    path = Path(file_path)
    warnings: list[str] = []
    workloads: list[dict] = []

    xl = pd.ExcelFile(path)
    sheet_map = {s.lower(): s for s in xl.sheet_names}
    vinfo_sheet = sheet_map.get("vinfo") or sheet_map.get("tabvinfo")
    if not vinfo_sheet:
        raise ValueError(f"no vInfo sheet found. Sheets present: {xl.sheet_names}")
    df = pd.read_excel(path, sheet_name=vinfo_sheet)

    def col(*candidates: str) -> str | None:
        cols_lower = {c.lower().strip(): c for c in df.columns}
        for cand in candidates:
            if cand.lower() in cols_lower:
                return cols_lower[cand.lower()]
        return None

    name_col = col("VM")
    cpu_col = col("CPUs", "CPU")
    mem_col = col("Memory", "Memory (MB)")
    prov_col = col("Provisioned MB", "Provisioned (MB)", "Provisioned")
    inuse_col = col("In Use MB", "In Use (MB)")
    os_col = col("OS according to the configuration file", "OS", "Guest OS")
    host_col = col("Host")
    cluster_col = col("Cluster")
    dc_col = col("Datacenter")
    power_col = col("Powerstate")
    annot_col = col("Annotation")
    template_col = col("Template")

    if not name_col:
        raise ValueError("vInfo sheet missing 'VM' column")

    for _, row in df.iterrows():
        if template_col and str(row.get(template_col, "")).strip().lower() in ("true", "1"):
            continue
        name = str(row.get(name_col, "")).strip()
        if not name or name.lower() == "nan":
            continue
        annot = str(row.get(annot_col, "")) if annot_col else ""
        wl = _empty_workload()
        wl["id"] = _slug(name)
        wl["name"] = name
        wl["cpu_cores"] = int(row.get(cpu_col, 0) or 0) if cpu_col else 0
        wl["ram_gb"] = _to_gb(row.get(mem_col, 0) if mem_col else 0, "mb")
        storage_raw = row.get(prov_col, 0) if prov_col else (row.get(inuse_col, 0) if inuse_col else 0)
        wl["storage_gb"] = _to_gb(storage_raw, "mb")
        wl["os"] = _normalize_os(row.get(os_col, "") if os_col else "")
        wl["powerstate"] = "on" if str(row.get(power_col, "")).lower().startswith("power") and "on" in str(row.get(power_col, "")).lower() else ("off" if power_col and "off" in str(row.get(power_col, "")).lower() else "unknown")
        wl["environment"] = _infer_environment(name, annot)
        wl["location"]["host"] = str(row.get(host_col, "") or "") if host_col else ""
        wl["location"]["cluster"] = str(row.get(cluster_col, "") or "") if cluster_col else ""
        wl["location"]["datacenter"] = str(row.get(dc_col, "") or "") if dc_col else ""
        wl["source"] = "rvtools"
        workloads.append(wl)

    summary = {
        "total_vms": len(workloads),
        "total_cpu_cores": sum(w["cpu_cores"] for w in workloads),
        "total_ram_gb": round(sum(w["ram_gb"] for w in workloads), 2),
        "total_storage_gb": round(sum(w["storage_gb"] for w in workloads), 2),
        "powered_on": sum(1 for w in workloads if w["powerstate"] == "on"),
        "by_os": _count_by(workloads, "os"),
        "by_environment": _count_by(workloads, "environment"),
    }
    return {"workloads": workloads, "summary": summary, "warnings": warnings}


@mcp.tool()
def parse_azure_migrate(file_path: str) -> dict:
    """Parse Azure Migrate assessment export (.xlsx or .csv).

    Expects columns typical of the "All assessed machines" export:
    Machine name, Operating system, Cores, Memory(MB), Storage(GB),
    Azure VM readiness, Recommended size, Monthly compute cost estimate USD,
    Monthly storage cost estimate USD, Readiness issues, Confidence rating.
    """
    path = Path(file_path)
    warnings: list[str] = []
    workloads: list[dict] = []

    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path)
    else:
        xl = pd.ExcelFile(path)
        target = None
        for s in xl.sheet_names:
            if "assessed" in s.lower() and "machine" in s.lower():
                target = s
                break
        if not target:
            target = xl.sheet_names[0]
            warnings.append(f"no 'Assessed Machines' sheet found; using first sheet '{target}'")
        df = pd.read_excel(path, sheet_name=target)

    def col(*candidates: str) -> str | None:
        cols_lower = {c.lower().strip(): c for c in df.columns}
        for cand in candidates:
            if cand.lower() in cols_lower:
                return cols_lower[cand.lower()]
        return None

    name_col = col("Machine name", "Server name", "Name")
    os_col = col("Operating system", "OS")
    cpu_col = col("Cores", "CPU cores", "Number of cores")
    mem_col = col("Memory(MB)", "Memory (MB)", "Memory in MB")
    storage_col = col("Storage(GB)", "Storage (GB)", "Total storage (GB)")
    ready_col = col("Azure VM readiness", "Migration readiness", "Readiness")
    sku_col = col("Recommended size", "Recommended VM size", "Azure VM size")
    compute_cost_col = col("Monthly compute cost estimate USD", "Compute cost estimate USD", "Monthly compute cost")
    storage_cost_col = col("Monthly storage cost estimate USD", "Storage cost estimate USD", "Monthly storage cost")
    issues_col = col("Readiness issues", "Issues")
    confidence_col = col("Confidence rating", "Confidence")

    if not name_col:
        raise ValueError(f"could not find machine name column. Columns: {list(df.columns)}")

    for _, row in df.iterrows():
        name = str(row.get(name_col, "")).strip()
        if not name or name.lower() == "nan":
            continue
        wl = _empty_workload()
        wl["id"] = _slug(name)
        wl["name"] = name
        wl["os"] = _normalize_os(row.get(os_col, "") if os_col else "")
        wl["cpu_cores"] = int(row.get(cpu_col, 0) or 0) if cpu_col else 0
        wl["ram_gb"] = _to_gb(row.get(mem_col, 0) if mem_col else 0, "mb")
        wl["storage_gb"] = float(row.get(storage_col, 0) or 0) if storage_col else 0.0
        ready_raw = str(row.get(ready_col, "")).lower() if ready_col else ""
        if "ready with" in ready_raw or "conditions" in ready_raw:
            wl["azure_readiness"] = "ready-with-conditions"
        elif "not ready" in ready_raw or "not-ready" in ready_raw:
            wl["azure_readiness"] = "not-ready"
        elif "ready" in ready_raw:
            wl["azure_readiness"] = "ready"
        wl["recommended_sku"] = str(row.get(sku_col, "") or "").strip() if sku_col else ""

        compute_cost = float(row.get(compute_cost_col, 0) or 0) if compute_cost_col else 0
        storage_cost = float(row.get(storage_cost_col, 0) or 0) if storage_cost_col else 0
        total_cost = compute_cost + storage_cost
        wl["monthly_cost_estimate_usd"] = round(total_cost, 2) if total_cost else None

        issues = str(row.get(issues_col, "") or "") if issues_col else ""
        confidence = str(row.get(confidence_col, "") or "") if confidence_col else ""
        notes_parts = [p for p in [issues, f"confidence: {confidence}" if confidence else ""] if p and p.lower() != "nan"]
        wl["notes"] = " | ".join(notes_parts)
        wl["environment"] = _infer_environment(name)
        wl["source"] = "azure-migrate"
        workloads.append(wl)

    summary = {
        "total_machines": len(workloads),
        "total_cpu_cores": sum(w["cpu_cores"] for w in workloads),
        "total_ram_gb": round(sum(w["ram_gb"] for w in workloads), 2),
        "total_storage_gb": round(sum(w["storage_gb"] for w in workloads), 2),
        "total_monthly_cost_usd": round(
            sum(w["monthly_cost_estimate_usd"] or 0 for w in workloads), 2
        ),
        "by_readiness": _count_by(workloads, "azure_readiness"),
        "by_os": _count_by(workloads, "os"),
    }
    return {"workloads": workloads, "summary": summary, "warnings": warnings}


@mcp.tool()
def parse_generic_inventory(file_path: str, column_mapping: dict, size_unit: str = "gb") -> dict:
    """Parse a generic inventory CSV/XLSX given an explicit column mapping.

    column_mapping keys (all optional except name):
        name, cpu_cores, ram, storage, os, environment, criticality,
        datacenter, cluster, host

    `size_unit` applies to ram & storage columns ("gb" | "mb" | "kb").
    """
    path = Path(file_path)
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path)

    if "name" not in column_mapping:
        raise ValueError("column_mapping must include 'name'")

    workloads: list[dict] = []
    for _, row in df.iterrows():
        name = str(row.get(column_mapping["name"], "")).strip()
        if not name or name.lower() == "nan":
            continue
        wl = _empty_workload()
        wl["id"] = _slug(name)
        wl["name"] = name
        if "cpu_cores" in column_mapping:
            wl["cpu_cores"] = int(row.get(column_mapping["cpu_cores"], 0) or 0)
        if "ram" in column_mapping:
            wl["ram_gb"] = _to_gb(row.get(column_mapping["ram"], 0), size_unit)
        if "storage" in column_mapping:
            wl["storage_gb"] = _to_gb(row.get(column_mapping["storage"], 0), size_unit)
        if "os" in column_mapping:
            wl["os"] = _normalize_os(row.get(column_mapping["os"], ""))
        if "environment" in column_mapping:
            env = str(row.get(column_mapping["environment"], "")).lower()
            if "prod" in env and "non" not in env:
                wl["environment"] = "prod"
            elif any(m in env for m in ("dev", "test", "uat", "stag", "qa")):
                wl["environment"] = "non-prod"
        if "criticality" in column_mapping:
            crit = str(row.get(column_mapping["criticality"], "")).lower()
            if crit in ("high", "medium", "low"):
                wl["criticality"] = crit
        for loc_field in ("datacenter", "cluster", "host"):
            if loc_field in column_mapping:
                wl["location"][loc_field] = str(row.get(column_mapping[loc_field], "") or "")
        wl["source"] = "generic"
        workloads.append(wl)

    summary = {
        "total_workloads": len(workloads),
        "total_cpu_cores": sum(w["cpu_cores"] for w in workloads),
        "total_ram_gb": round(sum(w["ram_gb"] for w in workloads), 2),
        "total_storage_gb": round(sum(w["storage_gb"] for w in workloads), 2),
    }
    return {"workloads": workloads, "summary": summary, "warnings": []}


@mcp.tool()
def inspect_spreadsheet(file_path: str) -> dict:
    """Return sheet names + column headers. Useful before calling parse_generic_inventory to craft the column_mapping."""
    path = Path(file_path)
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path, nrows=5)
        return {"type": "csv", "columns": list(df.columns), "preview_rows": df.head(3).to_dict(orient="records")}
    xl = pd.ExcelFile(path)
    sheets = {}
    for s in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=s, nrows=3)
        sheets[s] = {"columns": list(df.columns), "preview_rows": df.to_dict(orient="records")}
    return {"type": "xlsx", "sheets": sheets}


def _count_by(workloads: list[dict], field: str) -> dict:
    counts: dict[str, int] = {}
    for w in workloads:
        key = str(w.get(field, "unknown")) or "unknown"
        counts[key] = counts.get(key, 0) + 1
    return counts


if __name__ == "__main__":
    mcp.run()
