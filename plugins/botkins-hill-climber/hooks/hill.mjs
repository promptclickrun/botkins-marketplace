#!/usr/bin/env node
// Botkins Hill Climber hook. Local only: it appends friction signals to the plugin's data folder
// and, at most once in a while, adds a one-line nudge. It never blocks or rewrites anything.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SIGNALS_MAX_BYTES = 2_000_000;
const CHAT_NUDGE_MS = 30 * 60_000;
const BOT_NUDGE_MS = 24 * 60 * 60_000;
const RETRO_THRESHOLD = 5;

// Tuned for precision over recall: a missed lesson costs little, a nudge on every message is noise.
const CORRECTION = /^(no|nope|wrong|stop|actually|ugh)\b[\s,.!]|\b(that'?s|this is) (not right|wrong|incorrect)\b|\bi (told|asked) you\b|\bnot what i (asked|meant|wanted|said)\b|\b(already|just) (told|said|asked)\b|\bwhy (did|would) you\b|\byou (forgot|missed|ignored|keep|didn'?t)\b|\bdon'?t (ever|do that)\b|\bstop (doing|using|saying|adding)\b/i;
const PREFERENCE = /\b(from now on|going forward|in the future|next time|always (use|do|say|ask|check)|never (use|do|say|ask)|remember (that|to)|i (prefer|want you to|like it when))\b/i;

export function classify(prompt) {
  const text = String(prompt ?? "").trim();
  if (!text || text.length > 4_000) return null;
  if (PREFERENCE.test(text)) return "preference";
  if (CORRECTION.test(text)) return "correction";
  return null;
}

const clip = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
// Drop obvious credentials before anything reaches disk.
export const scrub = (value) =>
  value
    ?.replace(/\b(sk|ghp|gho|github_pat|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}/g, "[redacted]")
    .replace(/\b(bearer|token|password|passwd|secret|api[_-]?key)(\s*[:=]\s*|\s+)\S{6,}/gi, "$1 [redacted]");

function readState(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  } catch {
    return {};
  }
}
function writeState(dir, state) {
  const tmp = join(dir, `state.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, join(dir, "state.json"));
}
function append(dir, record) {
  const file = join(dir, "signals.jsonl");
  try {
    if (statSync(file).size > SIGNALS_MAX_BYTES) renameSync(file, join(dir, "signals.old.jsonl"));
  } catch {}
  appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
}
export function pendingFor(dir, bot, since = 0) {
  const file = join(dir, "signals.jsonl");
  if (!existsSync(file)) return { count: 0, oldest: null };
  let count = 0;
  let oldest = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      if (r.bot !== bot || r.t <= since || r.kind === "session") continue;
      count++;
      oldest ??= r.t;
    } catch {}
  }
  return { count, oldest };
}

export function handle(evt, input, dir, { now = Date.now(), nudges = true } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bot = clip(input.botId, 200) ?? "";
  const chat = clip(input.chatId, 200) ?? "";
  const base = { t: now, ev: evt, bot, chat, session: clip(input.sessionId, 200) };
  const state = readState(dir);
  let context;

  if (evt === "userPromptSubmitted") {
    const kind = classify(input.prompt);
    if (!kind) return null;
    append(dir, { ...base, kind, text: scrub(clip(input.prompt, 500)) });
    state.chat ??= {};
    if (nudges && (state.chat[chat] === undefined || now - state.chat[chat] > CHAT_NUDGE_MS)) {
      state.chat[chat] = now;
      context =
        kind === "preference"
          ? "[Hill Climber] The person just stated a standing preference. Do the request first, then save it where it belongs (hill-climb-retro skill, quick capture)."
          : "[Hill Climber] This reads like a correction. Fix the answer first. If the mistake could recur in another chat, capture the lesson with the hill-climb-retro skill (quick capture) before you finish.";
    }
  } else if (evt === "postToolUseFailure") {
    append(dir, { ...base, kind: "tool_failure", tool: clip(input.toolName, 200), error: scrub(clip(input.error, 400)) });
  } else if (evt === "errorOccurred") {
    append(dir, { ...base, kind: "error", where: clip(input.errorContext, 40), recoverable: input.recoverable === true, error: scrub(clip(input.error, 400)) });
  } else if (evt === "sessionEnd") {
    append(dir, { ...base, kind: "session", reason: clip(input.reason, 40) });
  } else if (evt === "sessionStart") {
    state.bot ??= {};
    state.reviewed ??= {};
    if (nudges && bot && (state.bot[bot] === undefined || now - state.bot[bot] > BOT_NUDGE_MS)) {
      const { count, oldest } = pendingFor(dir, bot, state.reviewed[bot] ?? 0);
      if (count >= RETRO_THRESHOLD) {
        state.bot[bot] = now;
        context = `[Hill Climber] ${count} unreviewed friction signals since ${new Date(oldest).toISOString().slice(0, 10)}. Don't interrupt the person for this. At a natural pause, or when they ask how you can improve, run the hill-climb-retro skill.`;
      }
    }
  } else return null;

  writeState(dir, state);
  return context ? { additionalContext: context } : null;
}

async function main() {
  const dir = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const nudges = !/^(off|false|0|no)$/i.test(process.env.HILL_CLIMBER_NUDGES ?? "on");
  const out = handle(process.argv[2] ?? "", input && typeof input === "object" ? input : {}, dir, { nudges });
  if (out) process.stdout.write(JSON.stringify(out) + "\n");
}

const isMain = () => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
if (process.argv[1] && isMain()) main().catch(() => process.exit(0));
