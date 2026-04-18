# tenant-config MCP server

Per-tenant CRUD for the presales agent:
- tenant config (the 7 schema categories)
- rate card & service catalog
- knowledge base samples (past proposals/BOMs)
- projects (training or production mode)
- training feedback & learned patterns

## Install & run

```bash
cd mcp-servers/tenant-config
uv sync          # or: pip install -e .
python server.py # stdio MCP server
```

Registered as `tenant-config` in the project-level `.mcp.json` at repo root.

## Tools

| Tool | Purpose |
|---|---|
| `get_schema` | Read canonical tenant schema before editing config |
| `list_tenants` / `create_tenant` / `get_tenant_config` | Tenant lifecycle |
| `update_tenant_section` | Merge patch into identity/commercial/standards/team/knowledge_base/compliance/guardrails |
| `write_rate_card` / `read_rate_card` | Manage rate-card.csv |
| `write_service_catalog` / `read_service_catalog` | Manage service-catalog.csv |
| `add_knowledge_sample` / `list_knowledge_samples` / `read_knowledge_sample` | Past deliverable library |
| `create_project` / `list_projects` / `get_project` | Project lifecycle |
| `save_project_input` / `save_project_deliverable` / `read_project_file` | Project file I/O |
| `log_training_feedback` / `list_learned_patterns` | Train-of-trainer loop |

## Storage layout

```
tenants/<tenant-id>/
├── config.yaml              # 7 categories per schema
├── rate-card.csv
├── service-catalog.csv
├── knowledge-base/
│   ├── index.yaml
│   └── <deliverable_type>/*.md
├── templates/
├── learned-patterns.yaml
└── projects/<project-id>/
    ├── meta.yaml
    ├── inputs/              # RVTools / Azure Migrate / normalized workloads
    ├── deliverables/        # generated BOM / proposal / architecture
    └── feedback-log.md
```
