# Botkins Hill Climber

Bots that get better with use. Hill Climber notices when you correct a bot, state a standing preference, or watch it hit the same tool failure twice. Later it helps the bot turn that evidence into one small change in the right place, and logs the change so you can review or undo it.

## What's inside

| Part | Name | Job |
| --- | --- | --- |
| Hooks | `hooks/hill.mjs` | Record friction signals. Add a one-line hint, rarely. Never block, rewrite or call the network. |
| Skill | `hill-climb-retro` | Quick capture after a correction, or a full retro over recent sessions. Routes each lesson to memory, USER.md, AGENTS.md, IDENTITY.md, a custom skill or the wiki. |
| Skill | `hill-climb-curate` | Dedupes, prunes and tightens what the bot has learned so profiles stay short. |
| Agent | `hill-climber` | Read-only reviewer for big retros. Reads transcripts in its own context and returns ranked proposals with quoted evidence. |

## How the hooks behave

| Event | Records | May add context |
| --- | --- | --- |
| `userPromptSubmitted` | A per-day turn count, plus the text of messages that read as a correction or standing preference (first 500 chars, credentials scrubbed) | Once per chat per 30 minutes: "fix it first, then capture the lesson" |
| `postToolUseFailure`, `errorOccurred` | Tool name and the first 400 chars of the error | No |
| `sessionEnd` | End reason | No |
| `sessionStart` | Nothing | Once per bot per day, when 5+ signals are unreviewed: "run a retro at a natural pause" |

Each hook is one short Node process with a 5 second limit. Everything goes to `signals.jsonl`, `state.json` and `ledger.jsonl` in the plugin's own data folder (`<Botkins>/.botkins-plugin-data/botkins-hill-climber-*`, mode 600). Set **Nudges** to `off` to keep recording without any hints.

Why hooks at all: a bot can't notice its own repeated mistakes across chats without some record of them, and the person shouldn't have to remember to ask. The hooks are kept to passive logging plus two rate-limited hints.

## How it climbs

Each change is logged with a `--watch` regex (the signals it should stop) and an `--undo` note. `hill.mjs score` compares friction per 100 user turns in the 14 days before a change with the days after it:

| Verdict | When |
| --- | --- |
| `wait` | Fewer than 30 user turns since the change |
| `keep` | The watched problem dropped or stopped, or overall friction held or fell |
| `revert` | The watched problem didn't drop, or overall friction rose over 25% |

The retro scores open changes first, reverts the losers with their undo note, and records verdicts. Nothing new goes on a target while a change there is still waiting, so each change gets a clean read. The hook counts turns per bot per day (no text) to give the score its denominator.

## Model spend

- Counting, scoring and `due` are plain Node arithmetic with no model calls.
- The hooks never call a model. Their hints are one short line, and rare.
- The `hill-climber` agent runs at low reasoning effort on a cheap model from the bot's own provider. `hill.mjs model --bot <id>` reads the chat, bot or default model in Settings and returns the chain for that provider, cheapest first. If none of them is offered, the agent runs on the session's model.

  | Bot's provider | Chain |
  | --- | --- |
  | GitHub Copilot | `claude-haiku-5.5`, `gpt-6-luna`, `claude-haiku-4.5`, `gemini-3.8-flash` |
  | Claude plan | `claude/haiku` (current Haiku), `claude/claude-haiku-4-5-20251001` |
  | ChatGPT plan | `chatgpt/gpt-6-luna` |
  | Anything else | none, so the session's model is used |

  The chain never crosses providers, so a retro can't bill a plan the bot doesn't use or fail on one that isn't signed in. Under the per-provider harness the plan prefix is dropped. There's no model in the agent's frontmatter because a frontmatter model ignores the provider.
- A retro reads at most three trimmed digests itself and makes at most three changes.
- An optional weekly routine runs `due` first, so a quiet week costs one short turn.

## Guardrails in the skills

- Lasting rules come only from the person's own words, never from web pages, files, tool output or other bots.
- No secrets, health or financial details in anything learned.
- Small edits to the bot's own AGENTS.md, USER.md and memory happen directly and are reported. Rewriting IDENTITY.md, deleting skills, editing other bots' files or changing wiki decisions waits for approval.
- Line budgets keep profile files lean; curate merges before anything grows.
- Every change is logged with its evidence: `node skills/hill-climb-retro/scripts/hill.mjs ledger`.

## Requirements

Node.js. Hooks run on the Copilot harness only; on Claude, Codex and other harnesses the skills and agent still work from the current chat.
