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
const FIELDS = new Set(["format", "version", "name", "role", "summary", "instructions", "look"]);
// Controls (except tab and newline) and invisible format characters can hide text from a reader.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f\p{Cf}]/u;

const text = (value, max) => typeof value === "string" && value.trim() !== "" && value.length <= max;

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
  if (data.version !== 1) errors.push("version must be 1");
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
  const heads = new Map();
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
      const head = JSON.parse(raw).look?.head;
      if (head) {
        if (heads.has(head)) fail(`look.head "${head}" is also used by ${heads.get(head)}`);
        heads.set(head, entry.name);
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
