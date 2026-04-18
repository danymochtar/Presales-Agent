# pricing MCP server

Wraps the [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices) and provides FX conversion for BOM generation. Tuned for the Malaysia market: Malaysia Central is the default primary region, Southeast Asia (Singapore) the DR default.

## Tools

| Tool | Purpose |
|---|---|
| `list_malaysia_regions` | Azure region IDs relevant to MY market + DR options |
| `get_vm_price` | Single VM SKU price (Linux/Windows, PAYG/RI-1y/RI-3y) |
| `batch_vm_prices` | Batch lookup across multiple SKUs |
| `get_managed_disk_price` | Managed disk pricing (P10/P30/E10/E30 etc.) |
| `search_prices` | Raw OData filter pass-through |
| `estimate_monthly` | Monthly estimate for `quantity` VMs × 730h |
| `usd_to_currency` | FX conversion with explicit rate override |
| `clear_cache` | Invalidate local price cache |

## Cache

Prices are cached to `mcp-servers/pricing/.cache/` for 24h (override via env `PRICING_CACHE_TTL_SEC`). This makes interactive BOM iteration fast without hammering the public API.

## Currency

The Azure Retail API returns USD by default. For Malaysia market:

- Keep customer-facing BOM in **USD** (common for enterprise deals in MY)
- Use `usd_to_currency` with an explicit `rate` from the tenant config's `commercial.fx_reference` for internal MYR reference and TCO comparisons
- The built-in fallback rate is approximate — always override with the tenant's current rate before sending a BOM

## Install

```bash
cd mcp-servers/pricing
uv sync            # or: pip install -e .
python server.py
```
