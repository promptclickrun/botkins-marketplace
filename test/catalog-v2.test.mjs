import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkCatalogV2, checkTemplateV3, satisfies } from "../scripts/catalog-v2.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const market = JSON.parse(readFileSync(new URL("../.github/plugin/marketplace.json", import.meta.url), "utf8"));

test("the published catalog's skills, packs and templates are valid", () => {
  const { errors, counts } = checkCatalogV2(ROOT, market);
  assert.deepEqual(errors, []);
  assert.ok(counts.skills >= 1 && counts.templates >= 1);
});

test("version ranges", () => {
  assert.ok(satisfies("1.4.2", "^1.0.0"));
  assert.ok(!satisfies("2.0.0", "^1.0.0"));
  assert.ok(satisfies("0.2.9", "^0.2.1") && !satisfies("0.3.0", "^0.2.1"));
  assert.ok(satisfies("1.2.9", "~1.2.0") && !satisfies("1.3.0", "~1.2.0"));
  assert.ok(satisfies("1.2.3", "1.2.3") && !satisfies("1.2.4", "1.2.3"));
  assert.ok(!satisfies("1.0.0", ">=1.0.0"));
});

function fixture(t, { skillMd, extra = () => {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mkt-v2-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, "skills", "demo");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "SKILL.md"), skillMd ?? "---\nname: demo\ndescription: A demo skill.\n---\nDo the demo.\n");
  extra(root, folder);
  return root;
}
const skill = { name: "demo", version: "1.0.0", source: "./skills/demo", summary: "Demo.", category: "other", license: "MIT" };
const look = { head: "pip", palette: "fern" };
const template = (change = {}) => ({ format: "botkins.bot-template", version: 3, name: "Demo", role: "Demo bot", summary: "Demo.", instructions: "Help.", look, requires: { skills: ["demo@^1.0.0"] }, ...change });

test("a skill folder must match its listing and stay portable", (t) => {
  const ok = fixture(t);
  assert.deepEqual(checkCatalogV2(ok, { schemaVersion: 2, skills: [skill] }).errors, []);

  const wrongName = fixture(t, { skillMd: "---\nname: other\ndescription: x\n---\nbody" });
  assert.match(checkCatalogV2(wrongName, { schemaVersion: 2, skills: [skill] }).errors.join("\n"), /expected "demo"/);

  const extraKey = fixture(t, { skillMd: "---\nname: demo\ndescription: x\nversion: 2\n---\nbody" });
  assert.match(checkCatalogV2(extraKey, { schemaVersion: 2, skills: [skill] }).errors.join("\n"), /exactly single-line/);

  const linked = fixture(t, { extra: (_, folder) => symlinkSync("/etc/hosts", join(folder, "hosts")) });
  assert.match(checkCatalogV2(linked, { schemaVersion: 2, skills: [skill] }).errors.join("\n"), /symbolic links/);

  const apache = fixture(t);
  assert.match(checkCatalogV2(apache, { schemaVersion: 2, skills: [{ ...skill, license: "Apache-2.0" }] }).errors.join("\n"), /LICENSE file/);

  assert.match(checkCatalogV2(ok, { skills: [skill] }).errors.join("\n"), /schemaVersion 2/);
  assert.match(checkCatalogV2(ok, { schemaVersion: 2, skills: [{ ...skill, source: "./skills/../x" }] }).errors.join("\n"), /source must be/);
});

test("packs and templates resolve against the catalog", (t) => {
  const root = fixture(t, { extra: (r) => {
    mkdirSync(join(r, "templates"));
    writeFileSync(join(r, "templates", "demo-bot.json"), JSON.stringify(template()));
  } });
  const pack = { name: "demo-pack", version: "1.0.0", summary: "Pack.", category: "other", skills: ["demo@^1.0.0"] };
  const entry = { name: "demo-bot", version: "1.0.0", category: "other", source: "./templates/demo-bot.json" };
  const good = { schemaVersion: 2, skills: [skill], packs: [pack], templates: [entry] };
  assert.deepEqual(checkCatalogV2(root, good).errors, []);

  const tooNew = { ...good, packs: [{ ...pack, skills: ["demo@^2.0.0"] }] };
  assert.match(checkCatalogV2(root, tooNew).errors.join("\n"), /does not meet \^2\.0\.0/);
  const missing = { ...good, packs: [{ ...pack, skills: ["ghost@1.0.0"] }] };
  assert.match(checkCatalogV2(root, missing).errors.join("\n"), /ghost is not in this catalog/);
  const empty = { ...good, packs: [{ ...pack, skills: [] }] };
  assert.match(checkCatalogV2(root, empty).errors.join("\n"), /at least one/);
  const clash = { ...good, agents: [{ name: "demo-bot" }] };
  assert.match(checkCatalogV2(root, clash).errors.join("\n"), /already used under agents/);
});

test("a version 3 template keeps the version 2 rules and adds requires and active routines", () => {
  const index = { skills: new Map([["demo", { version: "1.2.0" }]]), packs: new Map(), plugins: new Map() };
  const check = (t) => checkTemplateV3(JSON.stringify(t), index);
  assert.deepEqual(check(template()), []);
  const routine = { name: "Weekly", instructions: "Review.", cadence: { kind: "weekly", time: "09:00", days: [1] } };
  assert.deepEqual(check(template({ bundle: { routines: [{ ...routine, active: true }] } })), []);
  assert.match(check(template({ bundle: { routines: [{ ...routine, active: "yes" }] } })).join("\n"), /active must be true or false/);
  assert.match(check(template({ requires: undefined })).join("\n"), /needs requires or bundle/);
  assert.match(check(template({ requires: { skills: ["demo@~1.0.0"] } })).join("\n"), /does not meet/);
  assert.match(check(template({ requires: { skills: [] } })).join("\n"), /lists nothing/);
  assert.match(check(template({ requires: { tools: [] } })).join("\n"), /requires must be/);
  assert.match(check(template({ version: 2 })).join("\n"), /format version 3/);
  assert.match(check(template({ look: { head: "nobody", palette: "fern" } })).join("\n"), /look.head/);
  assert.match(check(template({ bundle: { routines: [{ ...routine, instructions: "/run" }] } })).join("\n"), /slash command/);
});
