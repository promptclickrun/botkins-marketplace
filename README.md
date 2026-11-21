# Botkins Marketplace

The first-party catalog of plugins and agent templates for [Botkins](https://github.com/promptclickrun/Botkins). Botkins desktop reads `.github/plugin/marketplace.json` from this repo, so merging to `main` publishes a plugin or an agent template to every desktop and paired phone within an hour. No app release is needed.

## Plugins

| Plugin | What it does | Auth |
| --- | --- | --- |
| [hevy](plugins/hevy) | Read and log Hevy workouts, routines, exercises and body measurements | Personal API key (Hevy Pro) |
| [botkins-hill-climber](plugins/botkins-hill-climber) | Bots learn from corrections and failures and turn them into small, logged changes to memory, profiles and skills | None (local hooks) |

## Agent templates

An agent template is a bot ready to be made: a name, a role, instructions and a look. In Botkins, open **Marketplace › Agents**, pick one and choose **Install**. Create a bot opens, filled in from the template. Change what you like and save. Nothing is installed except the new bot.

| Agent | What it does | Category |
| --- | --- | --- |
| [Sorter](agents/inbox-sorter.json) | Sorts your inbox into what needs a reply and what can wait, and drafts replies for you to approve | productivity |
| [Chief](agents/weekly-chief.json) | Weekly review: what got done, what slipped, and the three things that matter next | productivity |
| [Briefer](agents/meeting-briefer.json) | A one-page brief before a meeting, and decisions and action items after it | work |
| [Proof](agents/copy-editor.json) | Proofreads and edits your writing and keeps your voice | writing |
| [Scout](agents/fact-scout.json) | Checks a claim or statistic against sources and says how sure it is | research |
| [Penny](agents/budget-coach.json) | Sorts your spending, shows where the money goes, and helps you set a budget | finance |
| [Pantry](agents/meal-planner.json) | Plans a week of meals and writes the grocery list | home |
| [Compass](agents/trip-planner.json) | Turns a trip idea into a day-by-day plan and a list of what to book | life |
| [Lingo](agents/language-partner.json) | Practice conversation in the language you are learning, with gentle corrections | learning |
| [Spotter](agents/training-coach.json) | Plans workouts and reviews your log; reads Hevy when the plugin is on | health |
| [Chirp](agents/social-poster.json) | Three drafts of a social post in your voice | media |
| [Patch](agents/code-reviewer.json) | Reviews a diff or pull request for bugs, security and missing tests | dev |
| [Relay](agents/move-coordinator.json) | Builds a moving checklist backward from key handoff, including the jobs that need to happen while both homes are accessible. | home |
| [Tickler](agents/renewal-tracker.json) | Turns renewal notices into a timeline showing when you need to decide and what waiting could cost. | finance |
| [Rafter](agents/home-maintainer.json) | Turns appliance manuals and household chores into a seasonal maintenance calendar. | home |
| [Recall](agents/study-partner.json) | Builds short practice sessions from your notes and revisits the concepts you miss. | learning |
| [Slip](agents/return-organizer.json) | Reads receipts and return policies to make a checklist for getting an unwanted purchase back on time. | life |
| [Baton](agents/family-handoff.json) | Makes a one-page handoff for someone covering a household routine. | home |
| [Loop](agents/errand-planner.json) | Fits errands into a realistic outing around opening hours, pickups and what you can carry. | life |
| [Ribbon](agents/gift-finder.json) | Finds gift ideas that fit the recipient, the occasion and a real spending limit. | life |
| [Pocket](agents/appointment-prep.json) | Organizes your observations and questions into a note you can bring to a medical visit. | health |
| [Hem](agents/wardrobe-planner.json) | Builds outfits for the week from clothes you own, with time for laundry between wears. | life |
| [Float](agents/cash-forecast.json) | Builds a weekly cash forecast and shows which late receipts would put the balance under pressure. | finance |
| [Probe](agents/sales-discovery.json) | Turns an account brief into discovery questions and a clear test of whether a deal is worth pursuing. | work |
| [Gantry](agents/release-steward.json) | Builds a go-or-hold brief from release scope, checks and rollback evidence. | dev |
| [Signal](agents/campaign-designer.json) | Turns a campaign idea into a test with an audience, a comparison group and a decision rule. | work |
| [Tally](agents/invoice-matcher.json) | Matches invoice lines to purchase orders and receipts and explains discrepancies before payment review. | finance |
| [Queue](agents/support-triage.json) | Sorts support tickets by impact and urgency and prepares a handoff for the next responder. | work |
| [Thread](agents/research-synthesis.json) | Groups interview evidence into themes while keeping disagreements and source quotations visible. | research |
| [Sieve](agents/vendor-compare.json) | Compares vendor proposals against weighted requirements and exposes gaps behind the headline price. | work |
| [Debrief](agents/incident-retro.json) | Reconstructs an incident timeline and turns contributing conditions into verifiable follow-up work. | dev |
| [Dock](agents/onboarding-guide.json) | Builds a first-month plan around the work a new teammate needs to do independently. | work |
| [Keepsake](agents/oral-history.json) | Guides a family history interview and shapes the answers into an annotated memory vignette. | writing |
| [Alibi](agents/tabletop-mystery.json) | Designs a playable mystery with clue cards, suspects and a solution the host can explain. | other |
| [Echo](agents/sound-walk.json) | Turns a familiar walk into a listening score with prompts for each stop. | media |
| [Cabinet](agents/micro-museum.json) | Turns a few ordinary objects into a miniature exhibition with labels and a visitor route. | other |
| [Stanza](agents/constraint-poet.json) | Builds a poetry exercise around a chosen constraint and helps revise one line at a time. | writing |

## Install

In Botkins, open **Settings → Marketplace → Plugins**. Until the built-in entry ships, choose **Add a marketplace** and enter `promptclickrun/botkins-marketplace`. Pick a plugin, review it, enter its settings and switch it on for the bots that should use it.

## Add a plugin

1. Create `plugins/<name>/` with a `plugin.json`, plus any of `skills/<skill>/SKILL.md`, `.mcp.json`, `hooks/hooks.json`. See the [plugin format](https://github.com/promptclickrun/Botkins/blob/main/desktop/docs/PLUGINS.md).
2. Declare every credential in `userConfig` with `"sensitive": true`. Botkins stores the values in its credential vault and passes them to MCP servers only as environment variables or headers.
3. Add an entry to `.github/plugin/marketplace.json`. Besides the standard fields, set:
   - `category`: `health`, `productivity`, `finance`, `home`, `dev`, `media` or `other`.
   - `auth`: `none`, `api-key` or `oauth`.
4. Run `node scripts/validate.mjs && node --test "test/*.test.mjs"` and open a PR.

Local MCP servers should run on plain Node.js with no `npm install`. Botkins copies the plugin folder as-is.

## Add an agent template

1. In Botkins, make the bot: its name, role, About line, instructions and look.
2. Use **Export template…** on it (on a phone, the share sheet gives you the same file). Save the file as `agents/<name>.json`. The name is lowercase letters, digits and dashes.
3. Add an entry to the `agents` list in `.github/plugin/marketplace.json`, with `name`, `source` (`./agents/<name>.json`), `category`, `version`, `keywords` (at most 12) and `author`. The order of the list is the order people see, so the most useful template goes first.
   - `category`: `writing`, `research`, `productivity`, `work`, `dev`, `learning`, `health`, `finance`, `home`, `media`, `life` or `other`.
   - The file needs a one-sentence `summary` (at most 240 characters, shown as the description), a `role` (at most 90) and a `look` with a `head` and a `palette`. Use a head and palette combination no other template uses.
4. Run `node scripts/validate.mjs && node --test "test/*.test.mjs"` and open a PR. The checks use the same limits as Botkins does when it imports a template.

## Review rules for agent templates

Each template becomes a bot's instructions on someone's computer, so each PR needs:

- No instruction that sends, buys, posts, deletes, shares or changes anything without the person's yes to that exact action.
- No hidden instructions: nothing in invisible characters, nothing that tells the bot to keep something from the person, nothing aimed at another tool.
- No secrets, keys, personal data or private addresses.
- No claim of something a bot cannot do. Name connected apps and plugins only as "if the person has them", never as given.
- Plain, short instructions in the second person: what the bot does, how it works with the person, what it must not do.
- A version bump in `marketplace.json` for any change.

## Review rules for plugins

Everything here ships to every Botkins user, so each PR needs:

- No hooks without a strong reason. They run on each message with the user's OS permissions.
- No network destinations other than the service the plugin names.
- Secrets only through `userConfig`, never in arguments, URLs or committed files.
- A version bump in both `plugin.json` and `marketplace.json` for any change.

## Hevy tool generation

`plugins/hevy/tools.json` is generated from Hevy's [OpenAPI spec](https://developers.hevy.com/openapi.json):

```sh
node scripts/gen-hevy-tools.mjs
```

CI reruns it weekly and fails if Hevy changed their API.
