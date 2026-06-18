// MCP endpoint — JSON-RPC 2.0 over HTTP.
// Compatible with the Model Context Protocol transport spec.
// One POST endpoint that handles: initialize, tools/list, tools/call,
// resources/list, resources/read, ping.
// Also exposes GET /.well-known/mcp.json for discovery.
import { Router } from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import {
  listTools, callTool, listResources, readResource,
} from '../lib/mcpRegistry.js';

const router = Router();

// MCP protocol version we speak. Bumped when breaking changes happen.
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'aguittech-core',
  version: '1.0.0',
  vendor: 'Aguitech',
};

// Discovery — no auth needed, just metadata for clients.
router.get('/.well-known/mcp.json', (_req, res) => {
  res.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    vendor: SERVER_INFO.vendor,
    protocol: 'mcp',
    protocolVersion: PROTOCOL_VERSION,
    transport: 'http',
    endpoint: '/api/mcp',
    auth: { type: 'bearer', prefix: 'agk_', header: 'Authorization' },
    capabilities: { tools: true, resources: true, prompts: false },
    tools: listTools(),
    resources: listResources(),
  });
});

// JSON-RPC dispatcher.
router.post('/', requireApiKey, async (req, res) => {
  const body = req.body || {};
  const { jsonrpc, id, method, params } = body;
  if (jsonrpc !== '2.0') {
    return res.status(400).json(jsonRpcError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }

  try {
    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: { tools: {}, resources: {} },
        };
        break;

      case 'ping':
        result = { ok: true };
        break;

      case 'tools/list':
        result = { tools: listTools() };
        break;

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) throw rpcError(-32602, 'params.name is required');
        const content = await callTool(name, args || {}, req.user);
        // MCP wraps tool results in a content array (text or resource).
        result = {
          content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) }],
          isError: false,
        };
        break;
      }

      case 'resources/list':
        result = { resources: listResources() };
        break;

      case 'resources/read': {
        const { uri } = params || {};
        if (!uri) throw rpcError(-32602, 'params.uri is required');
        result = await readResource(uri, req.user);
        break;
      }

      default:
        return res.status(200).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }

    res.json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    const code = err.status === 404 ? -32004
                : err.status === 403 ? -32003
                : err.status === 400 ? -32602
                : -32603;
    res.status(200).json(jsonRpcError(id, code, err.message || 'Internal error'));
  }
});

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
function rpcError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export default router;
