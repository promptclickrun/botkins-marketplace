#!/usr/bin/env node
// Checks that every marketplace entry points at a folder with a valid plugin manifest.
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const market = JSON.parse(readFileSync(join(ROOT, ".github/plugin/marketplace.json"), "utf8"));
const errors = [];
const names = new Set();
const AUTH = new Set(["none", "api-key", "oauth"]);

if (market.name !== "botkins") errors.push(`marketplace name must be "botkins", got ${market.name}`);
for (const entry of market.plugins || []) {
  const where = `plugin ${entry.name ?? "(unnamed)"}`;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name || "")) errors.push(`${where}: name must be kebab-case`);
  if (names.has(entry.name)) errors.push(`${where}: duplicate name`);
  names.add(entry.name);
  for (const key of ["description", "version", "source", "category", "auth"]) if (!entry[key]) errors.push(`${where}: missing ${key}`);
  if (entry.auth && !AUTH.has(entry.auth)) errors.push(`${where}: auth must be one of ${[...AUTH].join(", ")}`);
  if (typeof entry.source !== "string") continue;
  const folder = normalize(join(ROOT, entry.source));
  if (!folder.startsWith(join(ROOT, "plugins"))) { errors.push(`${where}: source must live under plugins/`); continue; }
  const manifestPath = join(folder, "plugin.json");
  if (!existsSync(manifestPath)) { errors.push(`${where}: ${entry.source}/plugin.json not found`); continue; }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== entry.name) errors.push(`${where}: plugin.json name is ${manifest.name}`);
  if (manifest.version !== entry.version) errors.push(`${where}: version ${entry.version} != plugin.json ${manifest.version}`);
  const mcp = join(folder, ".mcp.json");
  if (existsSync(mcp)) {
    const text = readFileSync(mcp, "utf8");
    JSON.parse(text);
    for (const [, key] of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      if (!manifest.userConfig?.[key]) errors.push(`${where}: .mcp.json uses \${${key}} with no userConfig entry`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log(`OK: ${names.size} plugin(s)`);
