#!/usr/bin/env node
// Hevy MCP server (stdio, newline-delimited JSON-RPC). No dependencies.
// Reads the personal API key from HEVY_API_KEY and calls https://api.hevyapp.com.
import { readFileSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const API = process.env.HEVY_API_BASE || "https://api.hevyapp.com";
const KEY = process.env.HEVY_API_KEY || "";
const { tools } = JSON.parse(readFileSync(new URL("./tools.json", import.meta.url), "utf8"));
const byName = new Map(tools.map((tool) => [tool.name, tool]));
const PROTOCOL = "2025-06-18";
const MAX_TEXT = 100_000;

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const error = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const toolText = (text, isError = false) => ({ content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) });

function buildUrl(tool, args) {
  let path = tool.path;
  for (const name of tool.params.path) {
    const value = args[name];
    if (value === undefined || value === null || value === "") throw new Error(`Missing ${name}.`);
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(path, API);
  for (const name of tool.params.query) {
    if (args[name] !== undefined && args[name] !== null && args[name] !== "") url.searchParams.set(name, String(args[name]));
  }
  return url;
}

export async function callTool(name, args = {}, fetchImpl = fetch) {
  const tool = byName.get(name);
  if (!tool) return toolText(`Unknown tool: ${name}`, true);
  if (!KEY) return toolText("HEVY_API_KEY is not set. Add your Hevy API key in the plugin settings (needs Hevy Pro; create one at https://developers.hevy.com/api-key).", true);
  let url;
  try {
    url = buildUrl(tool, args);
  } catch (e) {
    return toolText(e.message, true);
  }
  const init = { method: tool.method, headers: { "api-key": KEY, accept: "application/json" } };
  if (tool.body) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(args.body ?? {});
  }
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (e) {
    return toolText(`Could not reach Hevy: ${e.message}`, true);
  }
  let text = await response.text();
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\n…(truncated; request a smaller page)";
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? " Check the Hevy API key in the plugin settings. The API needs Hevy Pro."
      : response.status === 429 ? " Hevy rate limit hit; wait a few minutes." : "";
    return toolText(`Hevy ${tool.method} ${url.pathname} failed (HTTP ${response.status}).${hint}\n${text}`, true);
  }
  return toolText(text || `HTTP ${response.status}`);
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "hevy", version: "1.0.0" },
        instructions: "Hevy workout tracker. Weights are kg, distances meters, durations seconds. Find exercise_template_id values with list_exercise_templates before creating workouts or routines.",
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: tools.map(({ name, description, inputSchema, readOnly }) => ({
          name,
          description,
          inputSchema,
          annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: true },
        })),
      });
    case "tools/call":
      return reply(id, await callTool(params?.name, params?.arguments || {}));
    default:
      if (isRequest) error(id, -32601, `Method not found: ${method}`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return error(null, -32700, "Parse error");
    }
    handle(message).catch((e) => message.id != null && error(message.id, -32603, e.message));
  });
}
