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

test("version 2 accepts portable skills and routines and version 1 remains the plain format", () => {
  const skill = { name: "field-notes", description: "Keep notes.", instructions: "Record the date.\nRecord the finding." };
  const routine = { name: "Summarize notes", instructions: "Summarize the week's notes.", cadence: { kind: "weekly", time: "08:45", days: [5] } };
  const check = (bundle, version = 2) => checkTemplateText(JSON.stringify({ ...good, version, bundle }));
  assert.deepEqual(check({ skills: [skill], routines: [routine] }), []);
  assert.deepEqual(check({ skills: [skill] }), []);
  assert.deepEqual(check({ routines: [routine] }), []);
  assert.deepEqual(check(undefined, 1), []);
  assert.ok(check({ skills: [skill] }, 1).length);
  const withSkill = (change) => ({ skills: [{ ...skill, ...change }] });
  const withRoutine = (change) => ({ routines: [{ ...routine, ...change }] });
  for (const bundle of [
    undefined, null, [], {}, { skills: [] }, { plugins: [] }, { routines: Array(9).fill(routine) },
    { skills: [skill, skill] }, { routines: [routine, { ...routine, name: routine.name.toUpperCase() }] },
    withSkill({ name: "../notes" }), withSkill({ name: "constructor" }), withSkill({ name: "CON" }),
    withSkill({ description: "notes\ncommand: script" }), withSkill({ instructions: "spoof\u202e!" }),
    withSkill({ instructions: "x".repeat(12001) }), withSkill({ source: "file:///notes" }), withSkill({ command: "script" }),
    withRoutine({ name: "x".repeat(81) }), withRoutine({ instructions: "x".repeat(4001) }),
    withRoutine({ instructions: "\n  /send-mail" }), withRoutine({ script: "ls" }), withRoutine({ notify: true }),
    withRoutine({ deliver: { kind: "chat", chatId: "other" } }), withRoutine({ botId: "scout" }),
    withRoutine({ cadence: { kind: "daily", time: "24:00" } }), withRoutine({ cadence: { kind: "weekdays", time: "8:45" } }),
    withRoutine({ cadence: { kind: "weekly", time: "08:45", days: [1, 1] } }),
    withRoutine({ cadence: { kind: "custom", cron: "* * * * *" } }),
    JSON.parse('{"routines":[{"__proto__":{},"name":"X","instructions":"Write.","cadence":{"kind":"daily","time":"08:00"}}]}'),
    { skills: Array.from({ length: 8 }, (_, i) => ({ ...skill, name: "item-" + i, instructions: "猫".repeat(3000) })) },
  ]) assert.ok(check(bundle).length, "invalid bundle should fail");
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
