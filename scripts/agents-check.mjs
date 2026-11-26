// Checks for agent templates: the `agents` entries in the catalog and the template files they point at.
// The limits are the ones Botkins applies when it imports a template (templateFields in the app).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

export const FORMAT = "botkins.bot-template";
export const CATEGORIES = ["writing", "research", "productivity", "work", "dev", "learning", "health", "finance", "home", "media", "life", "other"];
export const HEADS = ["beacon", "crumb", "fathom", "goggle", "luna", "morel", "muse", "oakley", "pearl", "pip", "posy", "pounce", "ramble", "skiff", "spool", "sprig", "tinker", "toast", "wick", "wicket"];
export const PALETTES = ["original", "terracotta", "honey", "fern", "tidepool", "bluebell", "fig"];
export const EYES = ["oval", "button", "smile", "sleepy", "wink", "curious"];
export const LIMITS = { name: 48, role: 90, summary: 240, instructions: 30000, file: 256 * 1024, keywords: 12 };
const FIELDS = new Set(["format", "version", "name", "role", "summary", "instructions", "look", "bundle"]);
// Controls (except tab and newline) and invisible format characters can hide text from a reader.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f\p{Cf}]/u;

const text = (value, max) => typeof value === "string" && value.trim() !== "" && value.length <= max;

// Keep the portable bundle checks in sync with Botkins desktop/desktop/link/template-bundle.mjs.
// The portable additions to a version 2 bot template. Values are copied by allowlist so installed
// skills and routine definitions contain only words and a cadence supplied by the author.
const MAX_ITEMS = 8;
const MAX_BYTES = 64 * 1024;
const BUNDLE_HIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const PROTOTYPE_NAMES = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"].map((key) => key.toLowerCase()));

function fields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object.`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} has an unknown field.`);
}

function words(value, limit, label, multiline = false) {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    throw new Error(`${label} must contain 1 to ${limit} characters.`);
  if (BUNDLE_HIDDEN.test(multiline ? value.replace(/[\t\n]/g, "") : value))
    throw new Error(`${label} contains a control or invisible character.`);
  return value.trim();
}

function skill(value) {
  fields(value, ["name", "description", "instructions"], "Bundled skill");
  const { name } = value;
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name) ||
      PROTOTYPE_NAMES.has(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name))
    throw new Error("Bundled skill names must be portable names of up to 64 lowercase letters, numbers and dashes.");
  return { name, description: words(value.description, 600, "Skill description"), instructions: words(value.instructions, 12000, "Skill instructions", true) };
}

function routineCadence(value) {
  fields(value, value?.kind === "weekly" ? ["kind", "time", "days"] : ["kind", "time"], "Routine cadence");
  const { kind, time } = value;
  if (!["daily", "weekdays", "weekly"].includes(kind)) throw new Error("Bundle routines use daily, weekdays or weekly cadence.");
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Routine time must use 24-hour HH:MM.");
  if (kind !== "weekly") return { kind, time };
  const { days } = value;
  if (!Array.isArray(days) || !days.length || days.length > 7 ||
      [...days].some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(days).size !== days.length)
    throw new Error("A weekly routine needs unique day numbers from 0 (Sunday) to 6 (Saturday).");
  return { kind, time, days: [...days].sort((a, b) => a - b) };
}

function routine(value) {
  fields(value, ["name", "instructions", "cadence"], "Bundled routine");
  const name = words(value.name, 80, "Routine name");
  if (/[\\/]/.test(name) || name === "." || name === ".." || PROTOTYPE_NAMES.has(name.toLowerCase()))
    throw new Error("A bundled routine needs a display name without a path or reserved name.");
  const instructions = words(value.instructions, 4000, "Routine instructions", true);
  if (instructions.startsWith("/")) throw new Error("Bundled routine instructions cannot start with a slash command.");
  return { name, instructions, cadence: routineCadence(value.cadence) };
}

function items(list, check, label) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_ITEMS)
    throw new Error(`Template bundle ${label} must contain between 1 and ${MAX_ITEMS} entries.`);
  const entries = Array.from(list, check);
  const names = entries.map(({ name }) => name.normalize("NFKC").toLowerCase());
  if (new Set(names).size !== names.length) throw new Error(`Template bundle ${label} contain a duplicate name.`);
  return entries;
}

/** Checks and copies a portable bundle. An absent bundle keeps the original template format. */
export function templateBundle(input) {
  if (input === undefined) return undefined;
  fields(input, ["skills", "routines"], "Template bundle");
  const bundle = {};
  if (Object.hasOwn(input, "skills")) bundle.skills = items(input.skills, skill, "skills");
  if (Object.hasOwn(input, "routines")) bundle.routines = items(input.routines, routine, "routines");
  if (!bundle.skills && !bundle.routines) throw new Error("A template bundle needs skills or routines.");
  if (Buffer.byteLength(JSON.stringify(bundle), "utf8") > MAX_BYTES) throw new Error("Template bundle exceeds 64 KiB.");
  return bundle;
}

/** The problems with one template file's text. An empty list means it is a good template. */
export function checkTemplateText(raw) {
  const errors = [];
  if (Buffer.byteLength(raw, "utf8") > LIMITS.file) return ["file is larger than 256 KB"];
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return ["file is not valid JSON"];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["file is not a JSON object"];
  if (data.format !== FORMAT) errors.push(`format must be "${FORMAT}"`);
  if (data.version !== 1 && data.version !== 2) errors.push("version must be 1 or 2");
  if (Object.hasOwn(data, "bundle") !== (data.version === 2)) errors.push("a bundle requires version 2, and version 2 requires a bundle");
  if (Object.hasOwn(data, "bundle")) {
    try { templateBundle(data.bundle); }
    catch (error) { errors.push(error.message); }
  }
  for (const key of Object.keys(data)) if (!FIELDS.has(key)) errors.push(`unknown field "${key}"`);
  for (const key of ["name", "role", "summary", "instructions"]) {
    if (!text(data[key], LIMITS[key])) errors.push(`${key} must be a non-empty string of at most ${LIMITS[key]} characters`);
    else if (HIDDEN.test(data[key])) errors.push(`${key} has control or invisible characters`);
  }
  const look = data.look;
  if (!look || typeof look !== "object" || Array.isArray(look)) errors.push("look must be { head, palette }");
  else {
    if (!HEADS.includes(look.head)) errors.push(`look.head must be one of ${HEADS.join(", ")}`);
    if (!PALETTES.includes(look.palette)) errors.push(`look.palette must be one of ${PALETTES.join(", ")}`);
    if (look.eyes !== undefined && !EYES.includes(look.eyes)) errors.push(`look.eyes must be one of ${EYES.join(", ")}`);
    for (const key of Object.keys(look)) if (!["head", "palette", "eyes"].includes(key)) errors.push(`unknown look field "${key}"`);
  }
  return errors;
}

/** The problems with the catalog's `agents` entries and their files. Returns { errors, names }. */
export function checkAgents(root, entries) {
  const errors = [];
  const names = new Set();
  const looks = new Map();
  const listed = new Set();
  if (entries !== undefined && !Array.isArray(entries)) return { errors: ["agents must be an array"], names };
  for (const entry of entries || []) {
    const where = `agent ${entry?.name ?? "(unnamed)"}`;
    const fail = (message) => errors.push(`${where}: ${message}`);
    if (!entry || typeof entry !== "object") { errors.push(`${where}: entry must be an object`); continue; }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name || "")) fail("name must be kebab-case");
    if (names.has(entry.name)) fail("duplicate name");
    names.add(entry.name);
    if (!entry.version || typeof entry.version !== "string") fail("missing version");
    if (!CATEGORIES.includes(entry.category)) fail(`category must be one of ${CATEGORIES.join(", ")}`);
    if (entry.keywords !== undefined && (!Array.isArray(entry.keywords) || entry.keywords.length > LIMITS.keywords || !entry.keywords.every((k) => typeof k === "string" && k.trim()))) {
      fail(`keywords must be a list of at most ${LIMITS.keywords} words`);
    }
    if (typeof entry.source !== "string") { fail("missing source"); continue; }
    const source = entry.source.replace(/^\.\//, "");
    if (!source.startsWith("agents/") || !source.endsWith(".json") || source.split("/").includes("..") || source.split("/").length !== 2) {
      fail("source must be ./agents/<name>.json");
      continue;
    }
    if (source !== `agents/${entry.name}.json`) fail(`source must be ./agents/${entry.name}.json`);
    const file = normalize(join(root, source));
    if (!file.startsWith(join(root, "agents") + sep)) { fail("source must live under agents/"); continue; }
    if (!existsSync(file)) { fail(`${entry.source} not found`); continue; }
    listed.add(source);
    const raw = readFileSync(file, "utf8");
    for (const problem of checkTemplateText(raw)) fail(`${source}: ${problem}`);
    try {
      const { head, palette } = JSON.parse(raw).look ?? {};
      if (head && palette) {
        const look = `${head}/${palette}`;
        if (looks.has(look)) fail(`look "${look}" is also used by ${looks.get(look)}`);
        looks.set(look, entry.name);
      }
    } catch {}
  }
  const folder = join(root, "agents");
  if (existsSync(folder) && statSync(folder).isDirectory()) {
    for (const file of readdirSync(folder)) {
      if (file.endsWith(".json") && !listed.has(`agents/${file}`)) errors.push(`agents/${file} is not listed in marketplace.json`);
    }
  }
  return { errors, names };
}
