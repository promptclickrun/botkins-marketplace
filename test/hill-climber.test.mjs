import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { botAuthored, classify, handle, normalize, scrub } from "../plugins/botkins-hill-climber/hooks/hill.mjs";
import { decide, digest, due, ledger, log, markReviewed, pending, reviewerModel, score } from "../plugins/botkins-hill-climber/skills/hill-climb-retro/scripts/hill.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOK = join(ROOT, "plugins/botkins-hill-climber/hooks/hill.mjs");
const HELPER = join(ROOT, "plugins/botkins-hill-climber/skills/hill-climb-retro/scripts/hill.mjs");
const SCHEDULER = join(ROOT, "plugins/botkins-hill-climber/skills/hill-climb-retro/scripts/schedule.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "hill-"));
const signals = (dir) => readFileSync(join(dir, "signals.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("classify catches corrections and preferences, ignores ordinary requests", () => {
  for (const text of ["No, I meant the Tuesday meeting", "I told you to use Central time", "That's not what I asked for", "You forgot the attachment again"]) assert.equal(classify(text), "correction", text);
  for (const text of ["From now on give times in Central", "Next time check the calendar first", "I prefer short answers"]) assert.equal(classify(text), "preference", text);
  for (const text of ["Can you check my calendar for tomorrow?", "Nobody knows the answer", "Notes on the sprint", "Is this wrong-headed?", ""]) assert.equal(classify(text), null, text);
});

test("phone punctuation and invisible characters don't hide corrections", () => {
  assert.equal(normalize("Don\u2019t \u201Csay\u201D that\u2014ever\u00A0again\u200B"), "don't \"say\" that-ever again");
  assert.equal(normalize("\uFF2E\uFF4F, wrong"), "no, wrong");
  const caught = [
    "Here\u2019s a correction: don\u2019t say things like \u201CThe fix, about 30 minutes:\u201D",
    "You didn\u2019t check the calendar",
    "That\u2019s not what I asked",
    "I\u2019d rather you skip the summary",
    "Correction: the meeting is Tuesday",
    "Nope\u2014the other lamp",
    "No, that\u2019s the wrong file",
    "As I said, Central time",
    "Please don\u2019t guess the time",
    "Why do you keep adding em-dashes?",
    "I\u00A0told\u00A0you this already",
    "you\u200B forgot the attachment",
  ];
  for (const text of caught) assert.ok(classify(text), text);
  const ignored = [
    "No problem, thanks!",
    "No worries",
    "Actually, can you also check tomorrow?",
    "Why do you think the build failed?",
    "I don\u2019t use Gmail for work",
    "Stop the music in the office",
    "Can you never-mind that and check the weather",
    "Did you see the news?",
  ];
  for (const text of ignored) assert.equal(classify(text), null, text);
});

test("bot-written prompts are never counted as the person's words", () => {
  assert.equal(botAuthored({ chatId: "c1", botId: "b2", sessionId: "c1-team-b2", prompt: "No, I told you" }), "teammate");
  assert.equal(botAuthored({ sessionId: "c1-team-5bc75d27-96ba-4df2-95e3-7c80aa242237", prompt: "x" }), "teammate");
  assert.equal(botAuthored({ sessionId: "s", prompt: "Message from Alfie (Chief of Staff):\nFrom now on stress-test it" }), "teammate");
  assert.equal(botAuthored({ sessionId: "c1", chatId: "c1", prompt: "From now on use Central" }), null);
  assert.equal(botAuthored({ sessionId: "c9" }, "routine"), "routine");
  assert.equal(botAuthored({ sessionId: "c9" }, "panel"), "panel");

  const dir = tmp();
  const root = tmp();
  writeFileSync(join(root, "workspace.json"), JSON.stringify({ chats: [{ id: "r1", schedules: [{ routine: true }] }, { id: "p1", panelId: "x" }, { id: "u1" }] }));
  process.env.BOTKINS_DIR = root;
  try {
    const prompt = "No, I told you. From now on use Central.";
    handle("userPromptSubmitted", { botId: "b2", chatId: "c1", sessionId: "c1-team-b2", prompt: "Message from Alfie (CoS):\n" + prompt }, dir, { now: 1 });
    handle("userPromptSubmitted", { botId: "b2", chatId: "r1", sessionId: "r1", prompt }, dir, { now: 2 });
    handle("userPromptSubmitted", { botId: "b2", chatId: "p1", sessionId: "p1", prompt }, dir, { now: 3 });
    assert.equal(existsSync(join(dir, "signals.jsonl")), false);
    assert.equal(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).turns, undefined);
    handle("userPromptSubmitted", { botId: "b2", chatId: "u1", sessionId: "u1", prompt }, dir, { now: 4 });
    assert.equal(signals(dir).length, 1);
    handle("postToolUseFailure", { botId: "b2", chatId: "c1", sessionId: "c1-team-b2", toolName: "gmail", error: "401" }, dir, { now: 5 });
    assert.equal(signals(dir).length, 2, "a teammate's own tool failures still count against it");
  } finally {
    delete process.env.BOTKINS_DIR;
  }
});

test("the proactive retro does not turn its own failures into new review work", () => {
  const dir = tmp();
  const root = tmp();
  writeFileSync(join(root, "workspace.json"), JSON.stringify({
    chats: [{ id: "retro", schedules: [{ routine: true, name: "Hill Climber retro", script: "node gate", followUp: true }] }],
  }));
  const env = { BOTKINS_DIR: root, PLUGIN_DATA: dir };
  const input = JSON.stringify({ botId: "b1", chatId: "retro", error: "timeout" });
  for (const event of ["postToolUseFailure", "errorOccurred"]) {
    execFileSync(process.execPath, [HOOK, event], { env, input });
  }
  assert.equal(pending(dir, "b1").total, 0);
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
  markReviewed(dir, "b1", 11);
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
  const bad = log(dir, { bot: "b1", target: "AGENTS.md", change: "Something unrelated", why: "x" }, T0 + 10 * DAY + 1);
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

test("a missing baseline cannot trigger a rollback or a scheduled retro", () => {
  const dir = tmp();
  log(dir, { bot: "b1", target: "USER.md", change: "Give times in Central", why: "x", watch: "central" }, T0);
  traffic(dir, 1, 4, 10, 1, "No, you forgot the attachment");
  markReviewed(dir, "b1", T0 + 5 * DAY);
  const opts = { now: T0 + 5 * DAY };
  const [result] = score(dir, "b1", opts);
  assert.equal(result.before.turns, 0);
  assert.equal(result.after.turns, 40);
  assert.equal(result.verdict, "wait");
  assert.match(result.reason, /baseline/i);
  assert.equal(due(dir, "b1", opts).due, false);
});

test("own changes are scored per bot; shared changes on every bot, reverted if any got worse", () => {
  const dir = tmp();
  const day = (bot, from, days, turns, bad) => {
    for (let d = 0; d < days; d++)
      for (let i = 0; i < turns; i++)
        handle("userPromptSubmitted", { botId: bot, chatId: `${bot}${d}-${i}`, prompt: i < bad ? "No, I told you Central time" : "Weather?" }, dir, { now: T0 + (from + d) * DAY + i * 1000, nudges: false });
  };
  day("a", 0, 10, 10, 2);
  day("d", 0, 10, 10, 1);
  const own = log(dir, { bot: "a", target: "USER.md", change: "Give times in Central", why: "x", watch: "central" }, T0 + 10 * DAY);
  const shared = log(dir, { bot: "a", target: "skill:calendar", change: "Always state the zone", why: "x", watch: "central" }, T0 + 10 * DAY);
  assert.equal(own.scope, "own");
  assert.equal(shared.scope, "shared");
  day("a", 11, 10, 10, 0);
  day("d", 11, 10, 10, 3);

  const forA = Object.fromEntries(score(dir, "a", { now: T0 + 22 * DAY }).map((r) => [r.id, r]));
  assert.equal(forA[own.id].verdict, "keep", "Dolly's worse week doesn't touch Alfie's own change");
  assert.equal(forA[shared.id].verdict, "revert");
  assert.match(forA[shared.id].reason, /worse for bot d/);
  assert.equal(forA[shared.id].perBot.a.verdict, "keep");

  const forD = score(dir, "d", { now: T0 + 22 * DAY });
  assert.deepEqual(forD.map((r) => r.id), [shared.id], "Dolly sees the shared change, not Alfie's own");
  assert.equal(forD[0].madeByAnotherBot, true);
  assert.equal(pending(dir, "d").corrections.every((c) => c.text.includes("Central")), true);
  assert.equal(ledger(dir, "d").length, 1);
  markReviewed(dir, "d", T0 + 22 * DAY);
  markReviewed(dir, "a", T0 + 22 * DAY);
  assert.equal(due(dir, "d", { now: T0 + 22 * DAY }).due, false, "another bot's shared change does not wake this bot");
  assert.equal(due(dir, "a", { now: T0 + 22 * DAY }).due, true, "ready verdicts wake the bot that owns them");
});

test("due gates scheduled retros so quiet weeks cost nothing", () => {
  const dir = tmp();
  traffic(dir, 0, 3, 5, 0);
  assert.equal(due(dir, "b1", { now: T0 + 3 * DAY }).due, false);
  traffic(dir, 3, 1, 5, 5);
  assert.equal(due(dir, "b1", { now: T0 + 4 * DAY }).due, true);
});

test("the native wake gate sleeps until its bot needs a retro and skips retries that day", () => {
  const root = tmp();
  const dir = tmp();
  const wake = () => JSON.parse(execFileSync(process.execPath, [HELPER, "wake", "--bot", "b1"], {
    env: { BOTKINS_DIR: root, PLUGIN_DATA: dir },
  }).toString());
  for (let i = 0; i < 5; i++) handle("postToolUseFailure", { botId: "b2", error: "timeout" }, dir, { now: T0 + i });
  traffic(dir, 0, 1, 4, 4);
  assert.equal(wake().wakeAgent, false);
  traffic(dir, 1, 1, 1, 1);
  assert.equal(wake().wakeAgent, true);
  assert.equal(wake().wakeAgent, false);
});

test("owner setup registers a standalone routine that follows the enabled plugin revision", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "hill script with 'quote "));
  const id = "botkins-hill-climber@botkins";
  const slug = "botkins-hill-climber_botkins";
  const hash = createHash("sha256").update(id).digest("hex").slice(0, 16);
  const dir = join(root, ".botkins-plugin-data", `botkins-hill-climber-botkins-${hash}`);
  const revision = "a".repeat(64);
  const installed = join(root, "plugin-marketplace/plugins", slug, revision, "skills/hill-climb-retro/scripts");
  mkdirSync(installed, { recursive: true });
  copyFileSync(HELPER, join(installed, "hill.mjs"));
  writeFileSync(join(root, "workspace.json"), JSON.stringify({ bots: [{ id: "b1", model: { provider: "copilot", model: "gpt-6-luna" } }] }));
  const plugin = { id, revision, enabled: true, installed: true, status: "ready", bots: ["b1"] };
  const fixture = join(root, "plugin-fixture.json");
  writeFileSync(fixture, JSON.stringify([plugin]));
  writeFileSync(join(root, "botkins"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes("--version")) console.log("0.17.8");
else if (args.includes("plugins")) console.log(require("node:fs").readFileSync(process.env.HILL_FIXTURE, "utf8"));
else if (args.includes("list")) console.log("[]");
else if (args.includes("add")) console.log(JSON.stringify(args));
else process.exitCode = 1;
`, { mode: 0o700 });
  const env = { ...process.env, BOTKINS_DIR: root, HILL_FIXTURE: fixture, PATH: `${root}:${process.env.PATH}` };
  const args = JSON.parse(execFileSync(process.execPath, [SCHEDULER, "--bot", "b1", "--yes"], { env }).toString());
  assert.ok(args.includes("--follow-up"), "the scheduler must start a model follow-up when the local gate wakes it");
  assert.equal(args[args.indexOf("--model") + 1], "copilot/gpt-6-luna");
  const run = () => JSON.parse(execFileSync("/bin/sh", ["-c", args[args.indexOf("--script") + 1]], { env }).toString());
  assert.equal(run().wakeAgent, false);
  traffic(dir, 0, 1, 5, 5);
  writeFileSync(fixture, JSON.stringify([{ ...plugin, bots: ["b2"] }]));
  assert.equal(run().wakeAgent, false);
  const next = "b".repeat(64);
  const updated = join(root, "plugin-marketplace/plugins", slug, next, "skills/hill-climb-retro/scripts");
  mkdirSync(updated, { recursive: true });
  copyFileSync(HELPER, join(updated, "hill.mjs"));
  writeFileSync(fixture, JSON.stringify([{ ...plugin, revision: next }]));
  writeFileSync(join(installed, "hill.mjs"), "throw new Error('stale revision must not run');");
  assert.equal(run().wakeAgent, true);
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
