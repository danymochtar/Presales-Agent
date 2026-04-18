"""Pricing MCP server: wraps the Azure Retail Prices API + simple FX helper.

API reference: https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices

All prices returned from Azure are in USD by default. The FX helper converts to
tenant-preferred currency (MYR for the Malaysia market pilot) using a reference
rate stored per-tenant (or provided explicitly at call time).

Cache: simple JSON file-per-query in `.cache/` with 24h default TTL. The retail
price catalog changes rarely so aggressive caching is fine for BOM drafts.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("pricing")

API_BASE = "https://prices.azure.com/api/retail/prices"
CACHE_DIR = Path(__file__).resolve().parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
DEFAULT_CACHE_TTL_SEC = int(os.environ.get("PRICING_CACHE_TTL_SEC", "86400"))
HTTP_TIMEOUT = 30

MALAYSIA_REGIONS = ["malaysiacentral", "malaysiasouth"]
SEA_REGIONS = ["southeastasia", "eastasia"]


def _cache_key(params: dict) -> Path:
    blob = json.dumps(params, sort_keys=True).encode()
    h = hashlib.sha256(blob).hexdigest()[:16]
    return CACHE_DIR / f"{h}.json"


def _cache_get(params: dict, ttl: int) -> dict | None:
    path = _cache_key(params)
    if not path.exists():
        return None
    if time.time() - path.stat().st_mtime > ttl:
        return None
    return json.loads(path.read_text())


def _cache_set(params: dict, data: dict) -> None:
    _cache_key(params).write_text(json.dumps(data))


def _fetch(odata_filter: str, currency: str = "USD", max_pages: int = 5) -> list[dict]:
    """Fetch all items matching an OData filter, following pagination up to max_pages."""
    params = {"$filter": odata_filter, "currencyCode": currency, "api-version": "2023-01-01-preview"}
    cached = _cache_get({"filter": odata_filter, "currency": currency}, DEFAULT_CACHE_TTL_SEC)
    if cached is not None:
        return cached

    items: list[dict] = []
    url: str | None = API_BASE
    page = 0
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        while url and page < max_pages:
            resp = client.get(url, params=params if page == 0 else None)
            resp.raise_for_status()
            body = resp.json()
            items.extend(body.get("Items", []))
            url = body.get("NextPageLink")
            page += 1
    _cache_set({"filter": odata_filter, "currency": currency}, items)
    return items


@mcp.tool()
def list_malaysia_regions() -> dict:
    """Return Azure region identifiers relevant to Malaysia market deployments.

    Use `primary` for customer-facing production, `dr_options` for disaster recovery.
    """
    return {
        "primary": {
            "malaysiacentral": "Malaysia Central (GA) — primary for MY market",
            "malaysiasouth": "Malaysia South (if available)",
        },
        "dr_options": {
            "southeastasia": "Singapore — closest paired region for MY",
            "eastasia": "Hong Kong — secondary DR option",
        },
        "notes": [
            "Malaysia Central is the newest MY region; SKU availability may be limited vs Southeast Asia.",
            "For regulated workloads requiring data residency in MY, use Malaysia Central only.",
            "For cost-optimized non-regulated workloads, Southeast Asia often has more SKUs and may be cheaper.",
        ],
    }


@mcp.tool()
def get_vm_price(
    arm_sku_name: str,
    region: str = "malaysiacentral",
    os_type: str = "linux",
    term: str = "consumption",
) -> dict:
    """Look up VM pricing for a single SKU in a region.

    Args:
        arm_sku_name: e.g. "Standard_D4s_v5"
        region: ARM region name, e.g. "malaysiacentral", "southeastasia"
        os_type: "linux" | "windows"  (windows pricing includes OS license)
        term: "consumption" | "reservation-1y" | "reservation-3y"

    Returns the best-matching price item(s) with retailPrice in USD, hourly rate,
    and calculated monthly estimate (730 hours).
    """
    filter_parts = [
        f"serviceName eq 'Virtual Machines'",
        f"armSkuName eq '{arm_sku_name}'",
        f"armRegionName eq '{region}'",
    ]
    term_lower = term.lower()
    if term_lower == "consumption":
        filter_parts.append("priceType eq 'Consumption'")
    elif term_lower.startswith("reservation"):
        filter_parts.append("priceType eq 'Reservation'")

    items = _fetch(" and ".join(filter_parts))

    filtered: list[dict] = []
    for item in items:
        product = (item.get("productName") or "").lower()
        sku = (item.get("skuName") or "").lower()
        has_windows = "windows" in product or "windows" in sku
        if os_type.lower() == "linux" and has_windows:
            continue
        if os_type.lower() == "windows" and not has_windows:
            continue
        if "low priority" in sku or "spot" in sku:
            continue
        if term_lower == "reservation-1y" and item.get("reservationTerm") != "1 Year":
            continue
        if term_lower == "reservation-3y" and item.get("reservationTerm") != "3 Years":
            continue
        filtered.append(item)

    if not filtered:
        return {
            "sku": arm_sku_name,
            "region": region,
            "os_type": os_type,
            "term": term,
            "found": False,
            "message": "no matching price found (check SKU availability in region, or try southeastasia)",
        }

    best = min(filtered, key=lambda x: x.get("retailPrice", 1e9))
    hourly = best.get("retailPrice", 0.0)
    monthly = round(hourly * 730, 2)
    return {
        "sku": arm_sku_name,
        "region": region,
        "os_type": os_type,
        "term": term,
        "found": True,
        "hourly_usd": hourly,
        "monthly_usd": monthly,
        "unit_of_measure": best.get("unitOfMeasure"),
        "product_name": best.get("productName"),
        "effective_from": best.get("effectiveStartDate"),
        "raw": best,
    }


@mcp.tool()
def batch_vm_prices(
    arm_sku_names: list[str],
    region: str = "malaysiacentral",
    os_type: str = "linux",
    term: str = "consumption",
) -> dict:
    """Batch lookup for multiple VM SKUs in a single region. More efficient than calling get_vm_price per SKU."""
    results = {}
    for sku in arm_sku_names:
        results[sku] = get_vm_price(sku, region, os_type, term)
    total_monthly = sum(r.get("monthly_usd", 0) for r in results.values() if r.get("found"))
    return {
        "region": region,
        "os_type": os_type,
        "term": term,
        "items": results,
        "total_monthly_usd": round(total_monthly, 2),
    }


@mcp.tool()
def get_managed_disk_price(
    sku: str,
    region: str = "malaysiacentral",
) -> dict:
    """Look up managed disk pricing. `sku` examples: "P10", "P30", "E10", "E30", "Premium SSD v2".

    Premium SSD v2 is priced per GB-month + IOPS + throughput; this helper returns base GB rate only.
    """
    filter_parts = [
        "serviceName eq 'Storage'",
        f"armRegionName eq '{region}'",
        f"contains(skuName, '{sku}')",
        "priceType eq 'Consumption'",
    ]
    items = _fetch(" and ".join(filter_parts))
    disk_items = [i for i in items if "disk" in (i.get("productName", "").lower() + i.get("meterName", "").lower())]
    if not disk_items:
        return {"sku": sku, "region": region, "found": False, "message": "no disk pricing found"}
    return {
        "sku": sku,
        "region": region,
        "found": True,
        "items": disk_items[:10],
    }


@mcp.tool()
def search_prices(odata_filter: str, max_items: int = 20) -> dict:
    """Raw OData filter pass-through for power users.

    Example filters:
        "serviceName eq 'Azure Firewall' and armRegionName eq 'malaysiacentral'"
        "serviceName eq 'Azure Bastion' and armRegionName eq 'southeastasia' and priceType eq 'Consumption'"
        "serviceFamily eq 'Networking' and armRegionName eq 'malaysiacentral'"
    """
    items = _fetch(odata_filter)
    return {
        "filter": odata_filter,
        "total_matched": len(items),
        "items": items[:max_items],
    }


@mcp.tool()
def estimate_monthly(
    arm_sku_name: str,
    quantity: int,
    region: str = "malaysiacentral",
    os_type: str = "linux",
    hours_per_month: int = 730,
    term: str = "consumption",
) -> dict:
    """Estimate monthly cost in USD for `quantity` VMs of a SKU.

    For RI-1y / RI-3y, `term` lookups return the amortized monthly cost (reservation / term months).
    """
    price = get_vm_price(arm_sku_name, region, os_type, term)
    if not price.get("found"):
        return {**price, "quantity": quantity, "total_monthly_usd": None}
    hourly = price["hourly_usd"]
    per_vm_monthly = round(hourly * hours_per_month, 2)
    total = round(per_vm_monthly * quantity, 2)
    return {
        "sku": arm_sku_name,
        "region": region,
        "os_type": os_type,
        "term": term,
        "quantity": quantity,
        "hours_per_month": hours_per_month,
        "per_vm_hourly_usd": hourly,
        "per_vm_monthly_usd": per_vm_monthly,
        "total_monthly_usd": total,
    }


@mcp.tool()
def usd_to_currency(amount_usd: float, target_currency: str = "MYR", rate: float | None = None) -> dict:
    """Convert USD to target currency using a reference rate.

    `rate` is target-per-USD (e.g. 4.70 means 1 USD = 4.70 MYR). If not provided,
    uses a built-in fallback table. In production, the tenant config's
    `commercial.fx_reference` should be the authoritative source — pass it in explicitly.
    """
    fallback_rates = {
        "MYR": 4.70,
        "IDR": 16500.0,
        "SGD": 1.35,
        "PHP": 57.0,
        "THB": 36.5,
        "VND": 25000.0,
        "USD": 1.0,
    }
    target = target_currency.upper()
    effective_rate = rate if rate is not None else fallback_rates.get(target)
    if effective_rate is None:
        return {
            "error": f"no FX rate for {target}. Provide `rate` explicitly (target-per-USD).",
            "supported_fallbacks": list(fallback_rates.keys()),
        }
    converted = round(amount_usd * effective_rate, 2)
    return {
        "amount_usd": amount_usd,
        "target_currency": target,
        "rate_target_per_usd": effective_rate,
        "amount_target": converted,
        "rate_source": "provided" if rate is not None else "built-in fallback (update tenant FX reference)",
    }


@mcp.tool()
def clear_cache() -> dict:
    """Clear the local pricing cache. Use when Azure price changes are suspected."""
    count = 0
    for p in CACHE_DIR.glob("*.json"):
        p.unlink()
        count += 1
    return {"cleared": count}


if __name__ == "__main__":
    mcp.run()
