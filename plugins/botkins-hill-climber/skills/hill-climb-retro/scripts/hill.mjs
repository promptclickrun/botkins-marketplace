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

// A change is "shared" when other bots read the same thing: custom skills, the wiki, home or app
// configuration. Those are scored on every bot's signals, not just the bot that made them.
const SHARED_TARGET = /^(skill|new-skill|wiki)\b|\bwiki\b|(^|\/)skills\//i;
export const scopeOf = (target, explicit) => (explicit === "shared" || explicit === "own" ? explicit : SHARED_TARGET.test(String(target ?? "")) ? "shared" : "own");

export function log(dir, entry, now = Date.now()) {
  const id = `c${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
  const { scope, ...rest } = entry;
  const record = { id, at: new Date(now).toISOString(), ...rest, scope: scopeOf(entry.target, scope) };
  appendFileSync(join(dir, "ledger.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 });
  return record;
}

// Ledger rows are changes; verdict rows ({ verdict, of }) close them. Changes come back with
// their latest verdict attached. A bot sees its own changes plus every shared change, since a
// shared change touches what it reads too.
export function ledger(dir, bot, last = 50) {
  const rows = readLines(join(dir, "ledger.jsonl"));
  const verdicts = {};
  for (const r of rows) if (r.of) verdicts[r.of] = { verdict: r.verdict, note: r.note, decidedAt: r.at };
  return rows
    .filter((r) => !r.of)
    .map((r) => ({ ...r, scope: r.scope ?? scopeOf(r.target) }))
    .filter((r) => !bot || r.bot === bot || r.scope === "shared")
    .map((r) => ({ ...r, ...verdicts[r.id] }))
    .slice(-last);
}

export function decide(dir, id, verdict, note, now = Date.now()) {
  if (!["kept", "reverted"].includes(verdict)) throw new Error("verdict must be kept or reverted");
  if (!ledger(dir, undefined, Infinity).some((r) => r.id === id)) throw new Error(`no change ${id}`);
  const record = { at: new Date(now).toISOString(), of: id, verdict, ...(note && { note }) };
  appendFileSync(join(dir, "ledger.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 });
  return record;
}

const DAY = 86_400_000;
const FRICTION = new Set(["correction", "tool_failure", "error"]);
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const matches = (re, r) => re.test([r.text, r.tool, r.error].filter(Boolean).join(" "));

// Friction per 100 user turns in [from, to). The change's own day is left out of both sides,
// since turns are only counted per day.
function windowStats(signals, turnsByDay, from, to, watch) {
  let turns = 0;
  for (const [day, n] of Object.entries(turnsByDay)) if (day >= dayOf(from) && day < dayOf(to)) turns += n;
  const inside = signals.filter((r) => FRICTION.has(r.kind) && r.t >= from && r.t < to && dayOf(r.t) >= dayOf(from) && dayOf(r.t) < dayOf(to));
  const friction = inside.length;
  const watched = watch ? inside.filter((r) => matches(watch, r)).length : undefined;
  const rate = (n) => (turns ? Math.round((n / turns) * 1000) / 10 : null);
  return { turns, friction, rate: rate(friction), ...(watch && { watched, watchedRate: rate(watched) }) };
}

/**
 * Scores each open change: friction per 100 turns in the window before it versus after it.
 * Pure local arithmetic, so a bot can run it as often as it likes at no model cost.
 */
function judge(before, after, watch, minTurns) {
  if (after.turns < minTurns) return ["wait", `${after.turns}/${minTurns} turns since the change`];
  if (watch && before.watched > 0) {
    if (after.watchedRate === 0) return ["keep", "the watched problem stopped"];
    if (after.watchedRate >= before.watchedRate) return ["revert", "the watched problem did not drop"];
    return ["keep", "the watched problem dropped"];
  }
  if (before.rate === null || before.friction === 0) return after.friction <= 1 ? ["keep", "no baseline friction and none added"] : ["revert", "friction appeared after the change"];
  if (after.rate <= before.rate) return ["keep", "friction rate held or fell"];
  if (after.rate > before.rate * 1.25 && after.friction >= 3) return ["revert", "friction rate rose over 25%"];
  return ["keep", "within noise"];
}

const sumTurns = (all) => {
  const out = {};
  for (const days of Object.values(all ?? {})) for (const [d, n] of Object.entries(days)) out[d] = (out[d] ?? 0) + n;
  return out;
};

export function score(dir, bot, { now = Date.now(), windowDays = 14, minTurns = 30 } = {}) {
  const state = readState(dir);
  const all = readLines(join(dir, "signals.jsonl"));
  const changes = ledger(dir, bot, Infinity);
  const startOfDay = (t) => Math.floor(t / DAY) * DAY;
  const out = [];
  for (const c of changes) {
    if (c.verdict) continue;
    let watch;
    try {
      watch = c.watch ? new RegExp(c.watch, "i") : undefined;
    } catch {}
    const changeDay = startOfDay(Date.parse(c.at));
    const windows = (signals, turnsByDay) => ({
      before: windowStats(signals, turnsByDay, changeDay - windowDays * DAY, changeDay, watch),
      after: windowStats(signals, turnsByDay, changeDay + DAY, Math.min(now, changeDay + DAY + windowDays * DAY), watch),
    });
    const shared = c.scope === "shared";
    // An own change is judged on its bot's signals only. A shared one on everyone's, and also bot
    // by bot, so a change that helps one bot can't hide one it made worse for another.
    const { before, after } = shared ? windows(all, sumTurns(state.turns)) : windows(all.filter((r) => r.bot === c.bot), state.turns?.[c.bot] ?? {});
    let [verdict, reason] = judge(before, after, watch, minTurns);
    let perBot;
    if (shared) {
      perBot = {};
      for (const b of Object.keys(state.turns ?? {})) {
        const w = windows(all.filter((r) => r.bot === b), state.turns[b]);
        const [v, why] = judge(w.before, w.after, watch, minTurns);
        perBot[b] = { verdict: v, reason: why, turnsAfter: w.after.turns };
        if (verdict !== "wait" && v === "revert") [verdict, reason] = ["revert", `worse for bot ${b}: ${why}`];
      }
    }
    out.push({
      id: c.id,
      at: c.at,
      bot: c.bot,
      scope: c.scope,
      target: c.target,
      change: c.change,
      ...(c.bot !== bot && { madeByAnotherBot: true }),
      ...(c.undo && { undo: c.undo }),
      before,
      after,
      ...(perBot && { perBot }),
      verdict,
      reason,
    });
  }
  return out;
}

// The reviewer's model chain (Haiku 5.5, GPT-6 Luna, Haiku 4.5, Gemini 3.8 Flash), kept to the
// models the bot's own provider offers, in that provider's ids. Crossing to another provider
// would bill a connection the bot doesn't use, or fail where that connection isn't signed in.
// Under the Copilot harness another plan's models are "<plan>/<id>" (Botkins desktop/harness).
const CHAIN = {
  copilot: ["claude-haiku-5.5", "gpt-6-luna", "claude-haiku-4.5", "gemini-3.8-flash"],
  // Claude Code's "haiku" alias is its current Haiku, 5.5 today.
  claude: ["haiku", "claude-haiku-4-5-20251001"],
  codex: ["gpt-6-luna"],
};
const PLAN = { claude: "claude/", codex: "chatgpt/" };
export function reviewerChain(provider, harness = "copilot") {
  const list = CHAIN[provider] ?? [];
  const hosted = harness !== "provider" && Object.hasOwn(PLAN, provider);
  return hosted ? list.map((id) => PLAN[provider] + id) : list;
}

/**
 * Which model the hill-climber agent should run on for this bot: the chain for the provider the
 * bot actually uses (chat, then bot, then the default in Settings). When none is offered, the
 * caller leaves the model out and the agent runs on the session's own model.
 */
export function reviewerModel(root, bot, chat) {
  let ws = {};
  try {
    ws = JSON.parse(readFileSync(join(root, "workspace.json"), "utf8"));
  } catch {}
  const chatModel = chat ? ws.chats?.find((c) => c.id === chat)?.model : undefined;
  const botModel = bot ? ws.bots?.find((b) => b.id === bot)?.model : undefined;
  const selection = chatModel ?? botModel ?? ws.settings?.model ?? null;
  const source = chatModel ? "chat" : botModel ? "bot" : selection ? "default" : "none";
  const provider = selection?.provider ?? "copilot";
  const candidates = reviewerChain(provider, ws.settings?.harness);
  return { provider, source, current: selection?.model ?? null, candidates, otherwise: "leave the model out: the agent uses this session's model" };
}

/** Cheap gate for a scheduled retro: is there anything worth spending a model turn on? */
export function due(dir, bot, opts = {}) {
  const p = pending(dir, bot);
  const scored = score(dir, bot, opts);
  const ready = scored.filter((s) => s.verdict !== "wait").length;
  return { due: p.total >= 5 || ready > 0, pendingSignals: p.total, changesToDecide: ready, changesWaiting: scored.length - ready };
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
  log --bot ID --target T --change C --why W [--evidence E] [--watch REGEX] [--undo U] [--scope own|shared]
                                record a change; --watch matches the signals it should stop,
                                --undo says how to reverse it (old text, or "delete line X"),
                                --scope shared for things every bot reads (skills, wiki, home
                                config); skill and wiki targets are shared automatically
  ledger [--bot ID] [--last N]  recorded changes with their verdicts, newest last
  score --bot ID [--window DAYS] [--min-turns N]
                                friction per 100 turns before vs after each open change,
                                with a keep / revert / wait verdict
  verdict --id ID --kept|--reverted [--note N]   close a change after acting on its score
  due --bot ID                  is a retro worth running? (pending signals or verdicts ready)
  model --bot ID [--chat ID]    models for the hill-climber agent on this bot's provider, cheapest
                                first: pass the first one your task tool offers, else none`;

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
      if (typeof a.watch === "string") new RegExp(a.watch, "i");
      return print(
        log(need(), {
          bot: a.bot,
          target: a.target,
          change: a.change,
          why: a.why,
          ...Object.fromEntries(["evidence", "watch", "undo", "scope"].filter((k) => typeof a[k] === "string").map((k) => [k, a[k]])),
        }),
      );
    case "ledger":
      return print(ledger(need(), bot, Number(a.last) || 50));
    case "score": {
      if (!bot) throw new Error("--bot is required");
      return print(score(need(), bot, { windowDays: Number(a.window) || 14, minTurns: Number(a["min-turns"]) || 30 }));
    }
    case "verdict":
      if (typeof a.id !== "string") throw new Error("--id is required");
      if (!a.kept === !a.reverted) throw new Error("pass exactly one of --kept or --reverted");
      return print(decide(need(), a.id, a.kept ? "kept" : "reverted", typeof a.note === "string" ? a.note : undefined));
    case "model":
      return print(reviewerModel(root, bot, typeof a.chat === "string" ? a.chat : undefined));
    case "due":
      if (!bot) throw new Error("--bot is required");
      return print(dir ? due(dir, bot) : { due: false, pendingSignals: 0, changesToDecide: 0, changesWaiting: 0 });
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
