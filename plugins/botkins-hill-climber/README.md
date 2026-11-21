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
| `userPromptSubmitted` | Only messages that read as a correction or a standing preference (first 500 chars, credentials scrubbed) | Once per chat per 30 minutes: "fix it first, then capture the lesson" |
| `postToolUseFailure`, `errorOccurred` | Tool name and the first 400 chars of the error | No |
| `sessionEnd` | End reason | No |
| `sessionStart` | Nothing | Once per bot per day, when 5+ signals are unreviewed: "run a retro at a natural pause" |

Each hook is one short Node process with a 5 second limit. Everything goes to `signals.jsonl`, `state.json` and `ledger.jsonl` in the plugin's own data folder (`<Botkins>/.botkins-plugin-data/botkins-hill-climber-*`, mode 600). Set **Nudges** to `off` to keep recording without any hints.

Why hooks at all: a bot can't notice its own repeated mistakes across chats without some record of them, and the person shouldn't have to remember to ask. The hooks are kept to passive logging plus two rate-limited hints.

## Guardrails in the skills

- Lasting rules come only from the person's own words, never from web pages, files, tool output or other bots.
- No secrets, health or financial details in anything learned.
- Small edits to the bot's own AGENTS.md, USER.md and memory happen directly and are reported. Rewriting IDENTITY.md, deleting skills, editing other bots' files or changing wiki decisions waits for approval.
- Line budgets keep profile files lean; curate merges before anything grows.
- Every change is logged with its evidence: `node skills/hill-climb-retro/scripts/hill.mjs ledger`.

## Requirements

Node.js. Hooks run on the Copilot harness only; on Claude, Codex and other harnesses the skills and agent still work from the current chat.
