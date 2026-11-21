import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classify, handle, scrub } from "../plugins/botkins-hill-climber/hooks/hill.mjs";
import { decide, digest, due, ledger, log, markReviewed, pending, reviewerModel, score } from "../plugins/botkins-hill-climber/skills/hill-climb-retro/scripts/hill.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOK = join(ROOT, "plugins/botkins-hill-climber/hooks/hill.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "hill-"));
const signals = (dir) => readFileSync(join(dir, "signals.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("classify catches corrections and preferences, ignores ordinary requests", () => {
  for (const text of ["No, I meant the Tuesday meeting", "I told you to use Central time", "That's not what I asked for", "You forgot the attachment again"]) assert.equal(classify(text), "correction", text);
  for (const text of ["From now on give times in Central", "Next time check the calendar first", "I prefer short answers"]) assert.equal(classify(text), "preference", text);
  for (const text of ["Can you check my calendar for tomorrow?", "Nobody knows the answer", "Notes on the sprint", "Is this wrong-headed?", ""]) assert.equal(classify(text), null, text);
});

test("scrub removes credentials before they reach disk", () => {
  assert.equal(scrub("use ghp_abcdefghijklmnop1234 now"), "use [redacted] now");
  assert.equal(scrub("my password: hunter2hunter2"), "my password [redacted]");
});

test("corrections are recorded and nudged at most once per chat per 30 minutes", () => {
  const dir = tmp();
  const input = { botId: "b1", chatId: "c1", sessionId: "s1", prompt: "No, that's wrong. I told you Central time." };
  const first = handle("userPromptSubmitted", input, dir, { now: 1_000_000 });
  assert.match(first.additionalContext, /correction/);
  assert.equal(handle("userPromptSubmitted", input, dir, { now: 1_000_000 + 60_000 }), null);
  assert.ok(handle("userPromptSubmitted", input, dir, { now: 1_000_000 + 31 * 60_000 }));
  assert.equal(handle("userPromptSubmitted", { ...input, prompt: "What's on my calendar?" }, dir, { now: 9e9 }), null);
  assert.equal(signals(dir).length, 3);
  assert.equal(handle("userPromptSubmitted", { ...input, chatId: "c2" }, dir, { now: 1_000_001, nudges: false }), null);
  assert.equal(signals(dir).length, 4);
});

test("sessionStart nudges a retro only past the threshold, once per day, and not after review", () => {
  const dir = tmp();
  const bot = { botId: "b1", chatId: "c1" };
  for (let i = 0; i < 4; i++) handle("postToolUseFailure", { ...bot, toolName: "gmail", error: "401" }, dir, { now: 1000 + i });
  assert.equal(handle("sessionStart", bot, dir, { now: 2000 }), null);
  handle("errorOccurred", { ...bot, error: "boom", errorContext: "model_call" }, dir, { now: 3000 });
  assert.match(handle("sessionStart", bot, dir, { now: 4000 }).additionalContext, /5 unreviewed/);
  assert.equal(handle("sessionStart", bot, dir, { now: 5000 }), null);
  assert.equal(handle("sessionStart", { botId: "b2" }, dir, { now: 5000 }), null);
  markReviewed(dir, "b1", 3500);
  assert.equal(handle("sessionStart", bot, dir, { now: 4000 + 25 * 3600_000 }), null);
});

test("pending groups repeated failures and respects the review mark", () => {
  const dir = tmp();
  const bot = { botId: "b1", sessionId: "s9" };
  handle("postToolUseFailure", { ...bot, toolName: "gmail", error: "401 unauthorized" }, dir, { now: 10 });
  handle("postToolUseFailure", { ...bot, toolName: "gmail", error: "401 unauthorized" }, dir, { now: 11 });
  handle("userPromptSubmitted", { ...bot, prompt: "From now on CC my assistant" }, dir, { now: 12 });
  handle("sessionEnd", { ...bot, reason: "complete" }, dir, { now: 13 });
  const p = pending(dir, "b1");
  assert.equal(p.total, 3);
  assert.deepEqual(p.repeatedFailures, [{ what: "gmail: 401 unauthorized", count: 2 }]);
  assert.equal(p.preferences[0].text, "From now on CC my assistant");
  assert.deepEqual(p.sessions, ["s9"]);
  markReviewed(dir, "b1", 12);
  assert.equal(pending(dir, "b1").total, 0);
});

test("digest keeps user turns, bot replies and failed tools", () => {
  const root = tmp();
  const dir = join(root, "copilot/session-state/s1");
  mkdirSync(dir, { recursive: true });
  const events = [
    { type: "system.message", data: { content: "SYSTEM PROMPT" } },
    { type: "user.message", data: { content: "Book the 3pm" } },
    { type: "tool.execution_start", data: { toolCallId: "t1", toolName: "calendar" } },
    { type: "tool.execution_complete", data: { toolCallId: "t1", success: false, error: { message: "slot taken" } } },
    { type: "assistant.message", data: { content: "Booked 4pm instead." } },
  ];
  writeFileSync(join(dir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"));
  assert.equal(digest(root, "s1"), "USER: Book the 3pm\nTOOL FAILED calendar: slot taken\nBOT: Booked 4pm instead.");
  assert.throws(() => digest(root, "../etc"), /bad session id/);
});

test("ledger records changes per bot", () => {
  const dir = tmp();
  log(dir, { bot: "b1", target: "AGENTS.md", change: "Give times in Central", why: "said twice" }, 0);
  log(dir, { bot: "b2", target: "memory", change: "x", why: "y" }, 1);
  assert.deepEqual(ledger(dir, "b1").map((r) => r.change), ["Give times in Central"]);
});

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12);
// Simulates a bot's traffic: `turns` prompts per day, of which `bad` are a given correction.
function traffic(dir, fromDay, days, turns, bad, prompt = "No, I told you Central time") {
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < turns; i++) {
      const text = i < bad ? prompt : "What's on my calendar?";
      handle("userPromptSubmitted", { botId: "b1", chatId: `c${d}-${i}`, prompt: text }, dir, { now: T0 + (fromDay + d) * DAY + i * 1000, nudges: false });
    }
  }
}

test("score waits for enough turns, then keeps changes that lowered friction", () => {
  const dir = tmp();
  traffic(dir, 0, 10, 10, 2);
  const good = log(dir, { bot: "b1", target: "USER.md", change: "Give times in Central", why: "x", watch: "central", undo: "delete line" }, T0 + 10 * DAY);
  const bad = log(dir, { bot: "b1", target: "AGENTS.md", change: "Something unrelated", why: "x" }, T0 + 10 * DAY);
  assert.equal(score(dir, "b1", { now: T0 + 11 * DAY })[0].verdict, "wait");
  traffic(dir, 11, 10, 10, 0);
  handle("postToolUseFailure", { botId: "b1", toolName: "gmail", error: "401" }, dir, { now: T0 + 12 * DAY });
  const s = score(dir, "b1", { now: T0 + 22 * DAY });
  const byId = Object.fromEntries(s.map((r) => [r.id, r]));
  assert.equal(byId[good.id].verdict, "keep");
  assert.equal(byId[good.id].before.watchedRate, 20);
  assert.equal(byId[good.id].after.watchedRate, 0);
  assert.equal(byId[bad.id].verdict, "keep");
  decide(dir, good.id, "kept");
  assert.deepEqual(score(dir, "b1", { now: T0 + 22 * DAY }).map((r) => r.id), [bad.id]);
  assert.equal(ledger(dir, "b1").find((r) => r.id === good.id).verdict, "kept");
});

test("score reverts a change when its watched problem keeps happening", () => {
  const dir = tmp();
  traffic(dir, 0, 10, 10, 1);
  const c = log(dir, { bot: "b1", target: "AGENTS.md", change: "Check time zones", why: "x", watch: "central" }, T0 + 10 * DAY);
  traffic(dir, 11, 10, 10, 2);
  const [r] = score(dir, "b1", { now: T0 + 22 * DAY });
  assert.equal(r.id, c.id);
  assert.equal(r.verdict, "revert");
  assert.throws(() => decide(dir, "nope", "kept"), /no change/);
});

test("due gates scheduled retros so quiet weeks cost nothing", () => {
  const dir = tmp();
  traffic(dir, 0, 3, 5, 0);
  assert.equal(due(dir, "b1", { now: T0 + 3 * DAY }).due, false);
  traffic(dir, 3, 1, 5, 5);
  assert.equal(due(dir, "b1", { now: T0 + 4 * DAY }).due, true);
});

test("reviewer models stay on the bot's own provider and harness", () => {
  const root = tmp();
  const write = (ws) => writeFileSync(join(root, "workspace.json"), JSON.stringify(ws));
  const ws = {
    settings: { harness: "copilot", model: { model: "opus", provider: "claude" } },
    bots: [{ id: "a" }, { id: "s", model: { model: "gpt-6.2-astra", provider: "codex" } }, { id: "g", model: { model: "gpt-6.2-sol", provider: "copilot" } }],
    chats: [{ id: "c1", botId: "a", model: { model: "gpt-6-sol", provider: "copilot" } }],
  };
  write(ws);
  assert.deepEqual(reviewerModel(root, "a").candidates, ["claude/haiku", "claude/claude-haiku-4-5-20251001"]);
  assert.equal(reviewerModel(root, "a").source, "default");
  assert.deepEqual(reviewerModel(root, "s").candidates, ["chatgpt/gpt-6-luna"]);
  assert.deepEqual(reviewerModel(root, "g").candidates, ["claude-haiku-5.5", "gpt-6-luna", "claude-haiku-4.5", "gemini-3.8-flash"]);
  assert.equal(reviewerModel(root, "a", "c1").source, "chat");
  assert.equal(reviewerModel(root, "a", "c1").candidates[0], "claude-haiku-5.5");
  write({ ...ws, settings: { ...ws.settings, harness: "provider" } });
  assert.deepEqual(reviewerModel(root, "a").candidates, ["haiku", "claude-haiku-4-5-20251001"]);
  write({ bots: [{ id: "x", model: { model: "m", provider: "opencode" } }] });
  assert.deepEqual(reviewerModel(root, "x").candidates, []);
});

test("hook command reads stdin and prints one JSON line", () => {
  const dir = tmp();
  const out = execFileSync(process.execPath, [HOOK, "userPromptSubmitted"], {
    input: JSON.stringify({ botId: "b", chatId: "c", prompt: "Stop doing that, I already told you" }),
    env: { PLUGIN_DATA: dir, HILL_CLIMBER_NUDGES: "${HILL_CLIMBER_NUDGES}" },
  }).toString();
  assert.match(JSON.parse(out).additionalContext, /Hill Climber/);
  const quiet = execFileSync(process.execPath, [HOOK, "userPromptSubmitted"], {
    input: JSON.stringify({ botId: "b", chatId: "c2", prompt: "No, wrong file" }),
    env: { PLUGIN_DATA: dir, HILL_CLIMBER_NUDGES: "off" },
  }).toString();
  assert.equal(quiet, "");
  assert.equal(execFileSync(process.execPath, [HOOK, "sessionEnd"], { input: "not json", env: { PLUGIN_DATA: dir } }).toString(), "");
});
