#!/usr/bin/env node
// Botkins Hill Climber hook. Local only: it appends friction signals to the plugin's data folder
// and, at most once in a while, adds a one-line nudge. It never blocks or rewrites anything.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROUTINE_NAME } from "../skills/hill-climb-retro/scripts/hill.mjs";

const SIGNALS_MAX_BYTES = 2_000_000;
const CHAT_NUDGE_MS = 30 * 60_000;
const BOT_NUDGE_MS = 24 * 60 * 60_000;
const RETRO_THRESHOLD = 5;
const TURN_DAYS_KEPT = 180;

// Phones and some keyboards send typographic characters: ’ for ', “ ” for ", – — for -, non-breaking
// and narrow spaces, zero-width joiners, full-width letters. Fold all of them to plain ASCII-ish
// text first, so the patterns below only ever see one spelling.
const QUOTES = /[\u2018\u2019\u201A\u201B\u2032\u2035\u02BB\u02BC\u02BD\u0060\u00B4\uFF07]/g;
const DQUOTES = /[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB\uFF02]/g;
const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const SPACES = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"')
    .replace(DASHES, "-")
    .replace(SPACES, " ")
    .trim()
    .toLowerCase();

// Tuned for precision over recall: a missed lesson costs little, a nudge on every message is noise.
// Matched against normalize()d text, so only straight apostrophes and lowercase appear here.
const CORRECTION = new RegExp(
  [
    // "No, I meant..." but not "No problem" or "No worries".
    String.raw`^(no|nope|nah|wrong|incorrect|ugh|not quite|stop)\s*[,.!:;-]`,
    String.raw`^(no|nope|nah),? (that|it|this|i|you|not)\b`,
    String.raw`^(here'?s a |a |one |quick |small |minor )?correction\b`,
    String.raw`\bthat'?s a correction\b`,
    String.raw`\b(that'?s|this is|it'?s|that is|this isn'?t|that isn'?t|it isn'?t) (not right|wrong|incorrect|not correct|not what|what i asked)\b`,
    String.raw`\bi (already )?(told|asked) you\b`,
    String.raw`\b(like|as) i (said|told you|asked)\b`,
    String.raw`\bnot what i (asked|meant|wanted|said)\b`,
    String.raw`\b(already|just) (told|said|asked)\b`,
    String.raw`\bwhy (did|would) you\b`,
    String.raw`\bwhy do you keep\b`,
    String.raw`\byou (forgot|missed|ignored|keep|kept|didn'?t|did not|got it wrong)\b`,
    // An instruction at the start of a sentence, not "I don't use Gmail".
    String.raw`(^|[.!?:;] )(please )?(don'?t|do not) (ever|do that|say|tell me|give me|call me|use|add|guess)\b`,
    String.raw`\bstop (doing|using|saying|adding|giving|asking)\b`,
  ].join("|"),
);
const PREFERENCE = /\b(from now on|going forward|in the future|next time|always (use|do|say|ask|check|give)|never (use|do|say|ask|give)|remember (that|to)|i (prefer|want you to|like it when)|i('d| would) rather)\b/;

export function classify(prompt) {
  const text = normalize(prompt);
  if (!text || text.length > 4_000) return null;
  if (PREFERENCE.test(text)) return "preference";
  if (CORRECTION.test(text)) return "correction";
  return null;
}

// Only the person teaches a bot. Teammate asks arrive as a prompt the asking bot wrote, in a
// session named "<chat>-team-<bot>" and opening "Message from <bot> (<role>):". Routine and panel
// refresh chats run on instructions a bot wrote earlier. Neither counts as the person's words.
const TEAMMATE_PROMPT = /^message from [^\n]{1,80} \([^\n]{0,200}\):/;
export function botAuthored(input, chatKind) {
  const session = String(input.sessionId ?? "");
  if (input.chatId && input.botId && session === `${input.chatId}-team-${input.botId}`) return "teammate";
  if (/-team-[0-9a-f-]{8,}$/i.test(session)) return "teammate";
  if (TEAMMATE_PROMPT.test(normalize(input.prompt))) return "teammate";
  if (chatKind === "routine" || chatKind === "panel") return chatKind;
  return null;
}

// What kind of chat this is, read once from Botkins' workspace and cached in state.
function chatKindFor(state, chat) {
  if (!chat) return "chat";
  state.chatKind ??= {};
  if (state.chatKind[chat]) return state.chatKind[chat];
  let kind = "chat";
  const root = process.env.BOTKINS_DIR;
  if (root) {
    try {
      const c = JSON.parse(readFileSync(join(root, "workspace.json"), "utf8")).chats?.find((x) => x.id === chat);
      if (c?.panelId) kind = "panel";
      else if ((c?.schedules ?? []).some((s) => s?.routine && s.name === ROUTINE_NAME && s.script && s.followUp)) kind = "hill-retro";
      else if ((c?.schedules ?? []).some((s) => s?.routine)) kind = "routine";
    } catch {
      return kind;
    }
  }
  const keys = Object.keys(state.chatKind);
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 400)) delete state.chatKind[k];
  state.chatKind[chat] = kind;
  return kind;
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
  const chatKind = chatKindFor(state, chat);
  if (chatKind === "hill-retro") return null;
  let context;

  if (evt === "userPromptSubmitted") {
    if (botAuthored(input, chatKind)) {
      writeState(dir, state);
      return null;
    }
    // Turn counts per bot per day are the denominator for scoring. No prompt text is kept here.
    if (bot) {
      const day = new Date(now).toISOString().slice(0, 10);
      const turns = (state.turns ??= {})[bot] ??= {};
      turns[day] = (turns[day] ?? 0) + 1;
      const cutoff = new Date(now - TURN_DAYS_KEPT * 86_400_000).toISOString().slice(0, 10);
      for (const d of Object.keys(turns)) if (d < cutoff) delete turns[d];
    }
    const kind = classify(input.prompt);
    if (!kind) {
      writeState(dir, state);
      return null;
    }
    append(dir, { ...base, kind, text: scrub(clip(input.prompt, 500)) });
    state.chat ??= {};
    if (nudges && (state.chat[chat] === undefined || now - state.chat[chat] > CHAT_NUDGE_MS)) {
      state.chat[chat] = now;
      context =
        kind === "preference"
          ? "[Hill Climber] Standing preference stated. After the request, save it (hill-climb-retro, quick capture)."
          : "[Hill Climber] Possible correction. Fix it first; if it could recur, quick-capture the lesson (hill-climb-retro).";
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
        context = `[Hill Climber] ${count} unreviewed signals since ${new Date(oldest).toISOString().slice(0, 10)}. Don't interrupt; at a natural pause run hill-climb-retro.`;
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
