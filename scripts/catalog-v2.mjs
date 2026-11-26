// Checks for the version 2 catalog listings: skills, packs and templates (format version 3).
// The rules are in docs/FORMAT.md. Version 1 apps ignore these keys.
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CATEGORIES, checkTemplateText, templateBundle } from "./agents-check.mjs";

export const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const TOOLS = ["shell", "node", "python", "browser", "network"];
export const SKILL_LIMITS = { files: 512, bytes: 12 * 1024 * 1024, skillMd: 60000, description: 600, summary: 240, preview: 1024 * 1024 };
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f\p{Cf}]/u;
const UNSAFE_PART = /[\\:<>"|?*\x00-\x1f]|[. ]$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const BUILD_OUTPUT = new Set(["node_modules", "dist", "shots", ".env"]);
const SPDX = /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;

const parse = (v) => v.split(".").map(Number);
function cmp(a, b) {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Whether `version` meets `range`: `^x.y.z`, `~x.y.z` or an exact `x.y.z`. */
export function satisfies(version, range) {
  const m = /^([\^~]?)(\d+\.\d+\.\d+)$/.exec(range);
  if (!m || !SEMVER.test(m[2]) || !SEMVER.test(version)) return false;
  const [op, base] = [m[1], m[2]];
  if (!op) return cmp(version, base) === 0;
  if (cmp(version, base) < 0) return false;
  const [v, b] = [parse(version), parse(base)];
  if (op === "~") return v[0] === b[0] && v[1] === b[1];
  if (b[0] > 0) return v[0] === b[0];
  if (b[1] > 0) return v[0] === 0 && v[1] === b[1];
  return cmp(version, base) === 0;
}

/** `name@range` split into its parts, or null. */
export function reference(text) {
  const m = typeof text === "string" && /^([a-z0-9][a-z0-9-]{0,63})@([\^~]?\d+\.\d+\.\d+)$/.exec(text);
  return m ? { name: m[1], range: m[2] } : null;
}

/** name and description from SKILL.md front matter, with the set of keys it declares. */
export function frontMatter(source) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const f = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (f) meta[f[1]] = f[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    else if (line.trim()) meta["\0multiline"] = true;
  }
  return meta;
}

function walk(root, dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = lstatSync(path);
    out.push({ path: relative(root, path).split(sep).join("/"), info });
    if (info.isDirectory()) walk(root, path, out);
  }
  return out;
}

/** The problems with one skill folder. */
export function checkSkillFolder(folder, name) {
  const errors = [];
  const skillMd = join(folder, "SKILL.md");
  if (!existsSync(skillMd)) return ["SKILL.md not found"];
  const text = readFileSync(skillMd, "utf8");
  if (text.length > SKILL_LIMITS.skillMd) errors.push(`SKILL.md is over ${SKILL_LIMITS.skillMd} characters`);
  const meta = frontMatter(text);
  if (!meta) errors.push("SKILL.md has no front matter");
  else {
    const keys = Object.keys(meta).filter((k) => k !== "\0multiline");
    if (meta["\0multiline"] || keys.length !== 2 || meta.name === undefined || meta.description === undefined)
      errors.push("SKILL.md front matter must have exactly single-line name and description");
    if (meta.name !== name) errors.push(`SKILL.md name is "${meta.name}", expected "${name}"`);
    if (!meta.description || meta.description.length > SKILL_LIMITS.description) errors.push(`SKILL.md description must be 1 to ${SKILL_LIMITS.description} characters`);
    else if (HIDDEN.test(meta.description)) errors.push("SKILL.md description has control or invisible characters");
  }
  // Files git would publish: honour the folder's own .gitignore for build output only.
  const files = walk(folder, folder, []).filter(({ path }) => !path.split("/").some((part) => BUILD_OUTPUT.has(part)));
  let bytes = 0;
  let count = 0;
  for (const { path, info } of files) {
    if (info.isSymbolicLink()) errors.push(`${path}: symbolic links are not allowed`);
    if (path.split("/").some((part) => UNSAFE_PART.test(part) || RESERVED.test(part))) errors.push(`${path}: not a portable path`);
    if (info.isFile()) { bytes += info.size; count += 1; }
  }
  if (count > SKILL_LIMITS.files) errors.push(`${count} files, more than ${SKILL_LIMITS.files}`);
  if (bytes > SKILL_LIMITS.bytes) errors.push(`${(bytes / 1048576).toFixed(1)} MiB, more than 12 MiB`);
  const shipped = walk(folder, folder, []).map(({ path }) => path.split("/"));
  if (shipped.some((parts) => parts.some((part) => BUILD_OUTPUT.has(part))) && !existsSync(join(folder, ".gitignore")) && !existsSync(join(folder, "starter", ".gitignore")))
    errors.push("build output present with no .gitignore to keep it out of the catalog");
  return errors;
}

function common(entry, fail) {
  if (!NAME.test(entry.name || "")) fail("name must be kebab-case, up to 64 characters");
  if (!SEMVER.test(entry.version || "")) fail("version must be MAJOR.MINOR.PATCH");
  if (!CATEGORIES.includes(entry.category)) fail(`category must be one of ${CATEGORIES.join(", ")}`);
  if (typeof entry.summary !== "string" || !entry.summary.trim() || entry.summary.length > SKILL_LIMITS.summary) fail(`summary must be 1 to ${SKILL_LIMITS.summary} characters`);
  else if (HIDDEN.test(entry.summary)) fail("summary has control or invisible characters");
  if (entry.keywords !== undefined && (!Array.isArray(entry.keywords) || entry.keywords.length > 12 || !entry.keywords.every((k) => typeof k === "string" && k.trim())))
    fail("keywords must be a list of at most 12 words");
}

function checkRefs(list, kind, index, fail) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) { fail(`${kind} must be a list`); return []; }
  const seen = new Set();
  for (const item of list) {
    const ref = reference(item);
    if (!ref) { fail(`${kind}: "${item}" must be name@range (^x.y.z, ~x.y.z or x.y.z)`); continue; }
    if (seen.has(ref.name)) fail(`${kind}: ${ref.name} listed twice`);
    seen.add(ref.name);
    const target = index.get(ref.name);
    if (!target) fail(`${kind}: ${ref.name} is not in this catalog`);
    else if (!satisfies(target.version, ref.range)) fail(`${kind}: ${ref.name} is ${target.version}, which does not meet ${ref.range}`);
  }
  return list;
}

/** Checks the `skills`, `packs` and `templates` of a catalog. Returns { errors, counts }. */
export function checkCatalogV2(root, market) {
  const errors = [];
  const counts = { skills: 0, packs: 0, templates: 0 };
  const has = ["skills", "packs", "templates"].some((k) => Object.hasOwn(market, k));
  if (has && market.schemaVersion !== 2) errors.push("a catalog with skills, packs or templates must set schemaVersion 2");
  for (const key of ["skills", "packs", "templates"]) if (market[key] !== undefined && !Array.isArray(market[key])) errors.push(`${key} must be an array`);

  const skills = new Map();
  for (const entry of Array.isArray(market.skills) ? market.skills : []) {
    const fail = (m) => errors.push(`skill ${entry?.name ?? "(unnamed)"}: ${m}`);
    common(entry, fail);
    if (skills.has(entry.name)) fail("duplicate name");
    skills.set(entry.name, entry);
    if (typeof entry.license !== "string" || !SPDX.test(entry.license)) fail("license must be an SPDX identifier");
    if (entry.source !== `./skills/${entry.name}`) { fail(`source must be ./skills/${entry.name}`); continue; }
    const folder = join(root, "skills", entry.name);
    if (!existsSync(folder)) { fail("folder not found"); continue; }
    for (const e of checkSkillFolder(folder, entry.name)) fail(e);
    if (entry.license && entry.license !== "MIT" && !existsSync(join(folder, "LICENSE")) && !existsSync(join(folder, "LICENSE.txt")))
      fail("a license other than the repository's MIT needs a LICENSE file in the folder");
    if (entry.preview !== undefined) {
      const p = typeof entry.preview === "string" ? entry.preview.replace(/^\.\//, "") : "";
      if (!p.startsWith(`skills/${entry.name}/`) || !/\.(png|jpe?g|webp)$/i.test(p) || p.split("/").includes("..")) fail("preview must be a PNG, JPEG or WebP inside the skill's folder");
      else if (!existsSync(join(root, p))) fail("preview not found");
      else if (lstatSync(join(root, p)).size > SKILL_LIMITS.preview) fail("preview is larger than 1 MiB");
    }
    if (entry.requires !== undefined) {
      const r = entry.requires;
      if (!r || typeof r !== "object" || Array.isArray(r) || Object.keys(r).some((k) => !["tools", "optional"].includes(k))) fail("requires must be { tools, optional }");
      else for (const k of ["tools", "optional"]) if (r[k] !== undefined && (!Array.isArray(r[k]) || !r[k].every((t) => TOOLS.includes(t)))) fail(`requires.${k} must list ${TOOLS.join(", ")}`);
    }
    counts.skills += 1;
  }

  const plugins = new Map((market.plugins || []).map((p) => [p.name, p]));
  const packs = new Map();
  for (const entry of Array.isArray(market.packs) ? market.packs : []) {
    const fail = (m) => errors.push(`pack ${entry?.name ?? "(unnamed)"}: ${m}`);
    common(entry, fail);
    if (packs.has(entry.name) || skills.has(entry.name)) fail("name is already used by another listing");
    packs.set(entry.name, entry);
    const s = checkRefs(entry.skills, "skills", skills, fail);
    const p = checkRefs(entry.plugins, "plugins", plugins, fail);
    if (!s.length && !p.length) fail("a pack needs at least one skill or plugin");
    for (const key of Object.keys(entry)) if (!["name", "version", "summary", "category", "keywords", "author", "skills", "plugins"].includes(key)) fail(`unknown field "${key}"`);
    counts.packs += 1;
  }

  const agentNames = new Set((market.agents || []).map((a) => a?.name));
  const templates = new Set();
  for (const entry of Array.isArray(market.templates) ? market.templates : []) {
    const fail = (m) => errors.push(`template ${entry?.name ?? "(unnamed)"}: ${m}`);
    if (!NAME.test(entry.name || "")) fail("name must be kebab-case");
    if (templates.has(entry.name)) fail("duplicate name");
    if (agentNames.has(entry.name)) fail("name is already used under agents");
    templates.add(entry.name);
    if (!SEMVER.test(entry.version || "")) fail("version must be MAJOR.MINOR.PATCH");
    if (!CATEGORIES.includes(entry.category)) fail(`category must be one of ${CATEGORIES.join(", ")}`);
    if (entry.source !== `./templates/${entry.name}.json`) { fail(`source must be ./templates/${entry.name}.json`); continue; }
    const file = join(root, "templates", `${entry.name}.json`);
    if (!existsSync(file)) { fail("file not found"); continue; }
    for (const e of checkTemplateV3(readFileSync(file, "utf8"), { skills, packs, plugins })) fail(e);
    counts.templates += 1;
  }
  return { errors, counts };
}

/** The problems with one format version 3 template file. */
export function checkTemplateV3(raw, index) {
  let data;
  try { data = JSON.parse(raw); } catch { return ["file is not valid JSON"]; }
  if (data?.version !== 3) return ["templates must use format version 3"];
  const errors = [];
  const { requires, bundle, ...rest } = data;
  // Reuse the version 2 checks for everything shared: name, role, instructions, look, bundle.
  const routines = bundle?.routines;
  const v2Bundle = bundle && { ...bundle, ...(routines && { routines: routines.map(({ active, ...r }) => r) }) };
  const asV2 = JSON.stringify({ ...rest, version: 2, bundle: v2Bundle ?? { skills: [{ name: "placeholder", description: "placeholder", instructions: "placeholder" }] } });
  errors.push(...checkTemplateText(asV2));
  if (routines) for (const r of routines) if (r && r.active !== undefined && typeof r.active !== "boolean") errors.push(`routine "${r.name}": active must be true or false`);
  if (requires === undefined && bundle === undefined) errors.push("a version 3 template needs requires or bundle");
  if (requires !== undefined) {
    if (!requires || typeof requires !== "object" || Array.isArray(requires) || Object.keys(requires).some((k) => !["skills", "packs", "plugins"].includes(k)))
      errors.push("requires must be { skills, packs, plugins }");
    else {
      const fail = (m) => errors.push(`requires.${m}`);
      checkRefs(requires.skills, "skills", index.skills, fail);
      checkRefs(requires.packs, "packs", index.packs, fail);
      checkRefs(requires.plugins, "plugins", index.plugins, fail);
      const total = ["skills", "packs", "plugins"].reduce((n, k) => n + (requires[k]?.length || 0), 0);
      if (!total) errors.push("requires lists nothing");
    }
  }
  if (bundle !== undefined) {
    try { templateBundle(v2Bundle); } catch (e) { if (!errors.includes(e.message)) errors.push(e.message); }
  }
  return errors;
}
