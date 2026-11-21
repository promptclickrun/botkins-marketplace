import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkAgents, checkTemplateText } from "../scripts/agents-check.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const market = JSON.parse(readFileSync(new URL("../.github/plugin/marketplace.json", import.meta.url), "utf8"));
const good = { format: "botkins.bot-template", version: 1, name: "Test", role: "A test", summary: "Does a test.", instructions: "You help test.", look: { head: "pip", palette: "fern" } };

test("every agent template in the catalog is valid", () => {
  assert.ok(market.agents.length >= 12);
  const { errors } = checkAgents(ROOT, market.agents);
  assert.deepEqual(errors, []);
});

test("a bad template is refused", () => {
  assert.deepEqual(checkTemplateText(JSON.stringify(good)), []);
  const bad = { ...good, name: "x".repeat(49), summary: "", instructions: "Do this​", look: { head: "nobody", palette: "fern" }, extra: 1 };
  const problems = checkTemplateText(JSON.stringify(bad)).join("\n");
  for (const word of ["name", "summary", "invisible", "look.head", "extra"]) assert.match(problems, new RegExp(word));
  assert.deepEqual(checkTemplateText("{"), ["file is not valid JSON"]);
  const entry = { name: "x", source: "./agents/../x.json", category: "other", version: "1.0.0" };
  assert.match(checkAgents(ROOT, [entry]).errors.join("\n"), /source must be/);
});

test("agents can share a head when their palettes differ", (t) => {
  const root = mkdtempSync(join(tmpdir(), "botkins-looks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "agents"));
  const entries = ["first", "second"].map(name => ({
    name, source: `./agents/${name}.json`, category: "other", version: "1.0.0"
  }));
  const save = (entry, palette) => writeFileSync(join(root, entry.source),
    JSON.stringify({ ...good, look: { ...good.look, palette } }));
  save(entries[0], "fern");
  save(entries[1], "honey");
  assert.deepEqual(checkAgents(root, entries).errors, []);
  save(entries[1], "fern");
  assert.match(checkAgents(root, entries).errors.join("\n"), /also used by first/);
});
