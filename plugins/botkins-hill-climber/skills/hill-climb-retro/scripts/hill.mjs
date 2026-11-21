#!/usr/bin/env node
// Hill Climber helper for the skills. Reads the signals the hooks recorded, digests a Copilot
// session transcript, and keeps a ledger of every self-improvement change so it can be reviewed
// or reverted. Local files only, no network.
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function botkinsDir(start = HERE, env = process.env) {
  if (env.BOTKINS_DIR && existsSync(env.BOTKINS_DIR)) return env.BOTKINS_DIR;
  // Skills are projected under <BOTKINS_DIR>/.botkins-plugin-runtime/..., so walk up.
  for (let dir = resolve(start), i = 0; i < 12; i++, dir = dirname(dir)) {
    if (existsSync(join(dir, ".botkins-plugin-data")) || existsSync(join(dir, "workspace.json"))) return dir;
    if (dirname(dir) === dir) break;
  }
  return null;
}

export function dataDir(root, env = process.env) {
  if (env.PLUGIN_DATA && existsSync(env.PLUGIN_DATA)) return env.PLUGIN_DATA;
  const base = join(root, ".botkins-plugin-data");
  if (!existsSync(base)) return null;
  const match = readdirSync(base).filter((name) => name.startsWith("botkins-hill-climber-")).sort();
  return match.length ? join(base, match[0]) : null;
}

const readLines = (file) => {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
};
const readState = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  } catch {
    return {};
  }
};

export function pending(dir, bot) {
  const state = readState(dir);
  const since = bot ? (state.reviewed?.[bot] ?? 0) : 0;
  const signals = readLines(join(dir, "signals.jsonl")).filter((r) => (!bot || r.bot === bot) && r.t > since && r.kind !== "session");
  const failures = {};
  for (const r of signals) {
    if (r.kind !== "tool_failure" && r.kind !== "error") continue;
    const key = `${r.tool ?? r.where ?? "?"}: ${(r.error ?? "").slice(0, 120)}`;
    failures[key] = (failures[key] ?? 0) + 1;
  }
  const said = (kind) => signals.filter((r) => r.kind === kind).map(({ t, chat, session, text }) => ({ at: new Date(t).toISOString(), chat, session, text }));
  return {
    since: since ? new Date(since).toISOString() : null,
    total: signals.length,
    corrections: said("correction"),
    preferences: said("preference"),
    repeatedFailures: Object.entries(failures).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([what, count]) => ({ what, count })),
    sessions: [...new Set(signals.map((r) => r.session).filter(Boolean))],
  };
}

export function markReviewed(dir, bot, now = Date.now()) {
  const state = readState(dir);
  state.reviewed = { ...state.reviewed, [bot]: now };
  const tmp = join(dir, `state.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, join(dir, "state.json"));
}

const textOf = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text ?? "").join(" ") : "");

export function digest(root, sessionId, max = 12_000) {
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(sessionId)) throw new Error("bad session id");
  const file = join(root, "copilot", "session-state", sessionId, "events.jsonl");
  if (!existsSync(file)) throw new Error(`no transcript for ${sessionId}`);
  const lines = [];
  const calls = {};
  for (const e of readLines(file)) {
    const d = e.data ?? {};
    if (e.type === "user.message") lines.push(`USER: ${textOf(d.content).slice(0, 1_500)}`);
    else if (e.type === "assistant.message" && textOf(d.content).trim()) lines.push(`BOT: ${textOf(d.content).slice(0, 800)}`);
    else if (e.type === "tool.execution_start") calls[d.toolCallId] = d.toolName;
    else if (e.type === "tool.execution_complete" && d.success === false) {
      const err = d.error?.message ?? d.error ?? textOf(d.result?.content);
      lines.push(`TOOL FAILED ${calls[d.toolCallId] ?? "?"}: ${String(err).slice(0, 300)}`);
    }
  }
  const out = lines.join("\n");
  // Keep the start (the ask) and the end (how it landed) when the session is long.
  return out.length <= max ? out : out.slice(0, Math.floor(max * 0.4)) + "\n[... middle omitted ...]\n" + out.slice(-Math.floor(max * 0.6));
}

export function log(dir, entry, now = Date.now()) {
  const record = { at: new Date(now).toISOString(), ...entry };
  appendFileSync(join(dir, "ledger.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 });
  return record;
}

export function ledger(dir, bot, last = 50) {
  return readLines(join(dir, "ledger.jsonl")).filter((r) => !bot || r.bot === bot).slice(-last);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) out._.push(argv[i]);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) out[argv[i].slice(2)] = true;
    else out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}

const USAGE = `usage: node hill.mjs <command>
  where                         Botkins folder, Hill Climber data folder, custom skills folder
  pending [--bot ID]            unreviewed corrections, preferences and repeated failures
  digest <sessionId> [--max N]  compact transcript: user turns, bot replies, failed tools
  reviewed --bot ID             mark this bot's signals as reviewed
  log --bot ID --target T --change C --why W [--evidence E]   record a change in the ledger
  ledger [--bot ID] [--last N]  recorded changes, newest last`;

function main() {
  const a = parseArgs(process.argv.slice(2));
  const root = botkinsDir();
  if (!root) throw new Error("Botkins folder not found. Set BOTKINS_DIR.");
  const dir = dataDir(root);
  const need = () => {
    if (!dir) throw new Error("No Hill Climber data yet. The hooks record signals only on the Copilot harness.");
    return dir;
  };
  const bot = typeof a.bot === "string" ? a.bot : undefined;
  const print = (value) => process.stdout.write((typeof value === "string" ? value : JSON.stringify(value, null, 2)) + "\n");
  switch (a._[0]) {
    case "where":
      return print({ botkins: root, data: dir, customSkills: join(root, "skills") });
    case "pending":
      return print(pending(need(), bot));
    case "digest":
      return print(digest(root, String(a._[1] ?? ""), Number(a.max) || 12_000));
    case "reviewed":
      if (!bot) throw new Error("--bot is required");
      markReviewed(need(), bot);
      return print("ok");
    case "log":
      for (const k of ["bot", "target", "change", "why"]) if (typeof a[k] !== "string") throw new Error(`--${k} is required`);
      return print(log(need(), { bot: a.bot, target: a.target, change: a.change, why: a.why, ...(typeof a.evidence === "string" && { evidence: a.evidence }) }));
    case "ledger":
      return print(ledger(need(), bot, Number(a.last) || 50));
    default:
      return print(USAGE);
  }
}

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};
if (process.argv[1] && isMain()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`hill: ${error.message}\n`);
    process.exit(1);
  }
}
