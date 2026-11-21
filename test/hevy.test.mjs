import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../plugins/hevy/server.mjs", import.meta.url));

function rpc(env, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH, ...env } });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const lines = out.split("\n").filter(Boolean);
      if (lines.length >= messages.filter((m) => m.id != null).length) {
        child.kill();
        resolve(lines.map((line) => JSON.parse(line)));
      }
    });
    child.on("error", reject);
    for (const message of messages) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  });
}

test("initialize and tools/list expose every generated tool", async () => {
  const [init, list] = await rpc({}, [
    { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { method: "notifications/initialized" },
    { id: 2, method: "tools/list" },
  ]);
  assert.equal(init.result.serverInfo.name, "hevy");
  const { tools } = JSON.parse(readFileSync(new URL("../plugins/hevy/tools.json", import.meta.url)));
  assert.equal(list.result.tools.length, tools.length);
  assert.ok(list.result.tools.find((t) => t.name === "create_workout").inputSchema.required.includes("body"));
  const valid = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
  const walk = (s) => {
    if (!s || typeof s !== "object") return;
    for (const t of [s.type].flat().filter(Boolean)) assert.ok(valid.has(t), `invalid JSON Schema type ${t}`);
    Object.values(s.properties || {}).forEach(walk);
    walk(s.items);
  };
  list.result.tools.forEach((t) => walk(t.inputSchema));
});

test("missing key returns a tool error, not a crash", async () => {
  const [res] = await rpc({}, [{ id: 1, method: "tools/call", params: { name: "count_workouts", arguments: {} } }]);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /HEVY_API_KEY/);
});

test("callTool builds path, query, body and api-key header", async () => {
  process.env.HEVY_API_KEY = "test-key";
  const { callTool } = await import(`../plugins/hevy/server.mjs?${Date.now()}`);
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200 });
  };
  await callTool("get_exercise_history", { exerciseTemplateId: "D04AC939", start_date: "2026-01-01T00:00:00Z" }, fake);
  assert.equal(seen[0].url, "https://api.hevyapp.com/v1/exercise_history/D04AC939?start_date=2026-01-01T00%3A00%3A00Z");
  assert.equal(seen[0].init.headers["api-key"], "test-key");

  await callTool("create_routine_folder", { body: { routine_folder: { title: "Push" } } }, fake);
  assert.equal(seen[1].init.method, "POST");
  assert.equal(seen[1].init.body, '{"routine_folder":{"title":"Push"}}');

  const bad = await callTool("get_workout", {}, fake);
  assert.equal(bad.isError, true);

  const denied = await callTool("count_workouts", {}, async () => new Response("nope", { status: 401 }));
  assert.match(denied.content[0].text, /Hevy Pro/);
});
