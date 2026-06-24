# MCP Server

Aguitech Core expone un servidor MCP (Model Context Protocol) en `/api/mcp` para integración con agentes AI (Claude, GPT, etc.).

## Setup
1. Genera API key en Profile → API Keys
2. Usa el key como Bearer token
3. JSON-RPC 2.0 sobre HTTPS, método `tools/list` y `tools/call`

## Tools disponibles
20+ tools para CRUD de todas las entidades (clients, projects, tasks, posts, appointments, etc.).

## Documentación detallada
Ver skill `aguittech-core/references/mcp-server-quirks.md` para quirks específicos.

## Audit log
Todas las acciones vía MCP quedan registradas con `actor: null` y `actorName: 'MCP:<key-name>'`.
