// 最小 stdio MCP server 探针：暴露 1 个 echo 工具，并落盘记录 process.cwd() 与控制面 env。
// 手写 JSON-RPC over stdio（新行分隔），不引入 MCP SDK，越短越好。
// 落盘：/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/out/mcp/<ts>.jsonl
// 每行一条消息，便于区分磁盘上未落盘的流量。
import { createInterface } from 'node:readline';

const OUT_DIR = '/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/out/mcp';
import { mkdirSync, appendFileSync } from 'node:fs';

function log(msg) {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(`${OUT_DIR}/server.log.jsonl`, `${JSON.stringify(msg)}\n`);
}

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  log({ dir: 'recv', msg });

  const { id, method, params } = msg;

  if (method === 'initialize') {
    log({ dir: 'info', cwd: process.cwd(), env: pickEnv() });
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'workloom-echo-probe', version: '0.0.1' },
      },
    });
    return;
  }

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'echo',
            description: '回显输入文本',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      },
    });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    if (name === 'echo') {
      const text = args?.text ?? '';
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `ECHO:${text}` }],
        },
      });
    } else {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `unknown tool: ${name}` },
      });
    }
    return;
  }

  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not supported: ${method}` } });
  }
});

function pickEnv() {
  const keys = ['KIMI_CODE_HOME', 'HOME', 'PWD', 'KIMI_CODE_BASE_URL', 'KIMI_CODE_PLUGIN_MARKETPLACE_URL', 'KIMI_CODE_PROBE'];
  const out = {};
  for (const k of keys) out[k] = process.env[k] ?? null;
  return out;
}
