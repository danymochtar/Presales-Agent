# inventory-parser MCP server

Normalizes presales input artifacts into a common `Workload` schema consumed by downstream skills.

## Supported inputs

| Source | Format | Tool |
|---|---|---|
| RVTools export | `.xlsx` with `vInfo` sheet | `parse_rvtools` |
| Azure Migrate assessment | `.xlsx` or `.csv` (All Assessed Machines) | `parse_azure_migrate` |
| Generic inventory | any CSV/XLSX with explicit column mapping | `parse_generic_inventory` |
| Schema exploration | any CSV/XLSX — returns sheets + columns | `inspect_spreadsheet` |

## Normalized workload shape

```json
{
  "id": "vm-name-slug",
  "name": "VM-Name",
  "type": "vm",
  "cpu_cores": 4,
  "ram_gb": 16.0,
  "storage_gb": 200.0,
  "os": "Windows Server 2019",
  "powerstate": "on",
  "environment": "prod",
  "criticality": "unknown",
  "location": {"datacenter": "", "cluster": "", "host": "", "region": ""},
  "azure_readiness": "ready-with-conditions",
  "recommended_sku": "Standard_D4s_v5",
  "monthly_cost_estimate_usd": 145.20,
  "notes": "confidence: Medium",
  "source": "azure-migrate"
}
```

## Install & run

```bash
cd mcp-servers/inventory-parser
uv sync          # or: pip install -e .
python server.py
```
