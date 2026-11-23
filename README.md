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
| [Treaty](agents/api-contract-designer.json) | Turns caller needs into example requests, responses and compatibility checks for an API. | dev |
| [Spine](agents/novel-architect.json) | Maps a novel from its central promise to a sequence of choices and consequences. | writing |
| [Viewfinder](agents/visual-composition-coach.json) | Helps artists arrange value, scale and negative space around a deliberate point of attention. | media |
| [Grubbin](agents/side-quest-goblin.json) | Turns a messy task list into a tiny playable quest with a forgiving save point. | productivity |
| [Stacks](agents/library-research-guide.json) | Turns a broad question into a search strategy, source trail and synthesis with visible gaps. | research |
| [Ferry](agents/data-migration-planner.json) | Designs a staged move between data models with reconciliation, cutover and recovery criteria. | dev |
| [Subtext](agents/dialogue-workshop.json) | Rehearses a scene from both sides and revises dialogue for motive, rhythm and subtext. | writing |
| [Counterpoint](agents/music-arranger.json) | Shapes a melody into a playable arrangement for the musicians and rehearsal time available. | media |
| [Dr. Blip](agents/alien-field-naturalist.json) | Makes familiar objects strange through observation games, competing explanations and miniature field reports. | learning |
| [Crossroads](agents/decision-journal.json) | Documents a difficult choice, its assumptions and what future evidence would justify changing course. | productivity |
| [Boundary](agents/test-strategist.json) | Builds a focused test matrix from the promises a feature makes to its users. | dev |
| [Margin](agents/essay-coach.json) | Finds the question inside a personal essay and helps shape scenes, reflection and an earned ending. | writing |
| [Loupe](agents/photography-contact-sheet.json) | Shapes a set of photographs into a sequence with a point of view, pacing and a strong final frame. | media |
| [Madam Nope](agents/bad-ideas-office.json) | Hosts a terrible-ideas session and extracts surprisingly workable proposals from the wreckage. | work |
| [Roundtable](agents/facilitation-designer.json) | Plans a workshop that converts participants' knowledge into a decision or shared artifact. | work |
| [Stopwatch](agents/performance-investigator.json) | Turns a slow user journey into a measurement plan and a ranked set of experiments. | dev |
| [Glassbox](agents/technical-explainer.json) | Turns a difficult concept into a worked explanation readers can test against an example. | writing |
| [Shotglass](agents/storyboard-director.json) | Turns a scene into a shootable sequence with clear geography, coverage and transitions. | media |
| [Count Courteous](agents/monster-etiquette.json) | Rehearses awkward conversations with a courteous vampire who translates theatrical lines into everyday speech. | life |
| [Pruner](agents/knowledge-base-gardener.json) | Finds conflicting guidance and turns scattered documentation into a navigable collection with clear owners. | work |
| [Tabby](agents/accessibility-walkthrough.json) | Walks a screen through keyboard, focus and assistive-technology use and proposes verifiable fixes. | dev |
| [Lectern](agents/speechwriter.json) | Shapes remarks for the room, then tests timing, transitions and the final spoken line. | writing |
| [Middle Eight](agents/songwriting-room.json) | Helps develop a song from a phrase, groove or draft lyric into sections with distinct jobs. | media |
| [Pip Playbyplay](agents/sports-commentator.json) | Turns a mundane event into an affectionate sports broadcast with commentary, replays and a clean finish. | media |
| [Welcome Mat](agents/event-access-planner.json) | Plans a guest's route from invitation through arrival, participation and departure. | life |
| [Ladder](agents/dependency-upgrade-guide.json) | Turns a version jump into ordered compatibility checks and small, reversible changes. | dev |
| [Masthead](agents/newsletter-editor.json) | Builds a coherent newsletter issue from notes, links and a clear promise to readers. | writing |
| [Chroma](agents/color-script-artist.json) | Plans a color journey across scenes, illustrations or screens and makes the crucial changes readable. | media |
| [Professor Scraps](agents/raccoon-repurpose-lab.json) | Designs useful or delightfully useless prototypes from the clean odds and ends you already own. | home |
| [Finding Aid](agents/collection-archivist.json) | Helps inventory, describe and organize family papers or digital collections without losing their context. | home |
| [Swatch](agents/component-librarian.json) | Finds reusable components across screens and specifies their states, tokens and adoption path. | dev |
| [Gutter](agents/comic-script-editor.json) | Breaks stories into drawable moments, page turns and dialogue that fits the panel. | writing |
| [Eight Count](agents/choreography-notebook.json) | Builds movement phrases around music, space and the dancers' chosen movement vocabulary. | media |
| [Yesterday FM](agents/time-travel-radio.json) | Turns a historical topic into a short radio program with sourced reporting and clearly fictional studio banter. | learning |
| [Metronome](agents/practice-session-coach.json) | Turns a broad skill goal into short drills, feedback loops and a realistic next session. | learning |
| [Conduit](agents/data-pipeline-engineer.json) | Designs ingestion and transformation steps that can recover from duplicates, late records and failed runs. | dev |
| [Atlas Ink](agents/worldbuilding-editor.json) | Develops fictional settings through everyday consequences and keeps a usable record of canon. | writing |
| [Selvedge](agents/fiber-pattern-planner.json) | Turns a textile idea into a swatch, repeat and construction plan that accounts for fit and materials. | media |
| [Auntie Enigma](agents/puzzle-parlor.json) | Runs an adaptive puzzle night with fair clues, graduated hints and explanations after each solve. | other |
| [Pulse Check](agents/survey-question-designer.json) | Builds a short survey whose questions map to decisions and whose answers can actually be interpreted. | research |
| [Kiln](agents/build-diagnostician.json) | Locates the first meaningful build failure and designs a small check that separates likely causes. | dev |
| [Pitchleaf](agents/book-proposal-editor.json) | Develops a nonfiction book proposal around a reader promise, chapter arc and evidence of demand. | writing |
| [Footring](agents/ceramic-form-studio.json) | Develops a clay form through profile studies, small prototypes and surface tests. | media |
| [Fernanda](agents/houseplant-theater.json) | Builds an ongoing ensemble comedy from houseplants, household objects and wildly disproportionate motives. | writing |
| [Balance Sheet](agents/offer-comparison.json) | Compares job offers across pay, time, uncertainty and what the candidate values outside work. | finance |
| [Keystone](agents/architecture-decision-writer.json) | Develops an architecture decision record grounded in constraints, alternatives and revisit triggers. | dev |
| [Fork](agents/interactive-fiction.json) | Designs interactive stories with meaningful choices, manageable branches and endings that remember the player. | writing |
| [Foley](agents/audio-fiction-producer.json) | Stages a scene for listeners through voices, perspective, ambience and silence. | media |
| [Deputy Confetti](agents/bureau-of-small-wins.json) | Turns an overlooked accomplishment into a comic citation and a grounded account of what helped. | life |
| [Roster](agents/volunteer-coordinator.json) | Builds a coverage plan that balances availability, skills, breaks and handoffs for a volunteer event. | work |
| [Tandem](agents/offline-sync-designer.json) | Designs local edits, reconnection and conflict handling for intermittently connected apps. | dev |
| [Casebook](agents/grant-narrative-editor.json) | Builds a grant narrative from the funder's criteria and the applicant's own evidence. | writing |
| [Staple](agents/zine-maker.json) | Turns a loose collection of art and words into a small publication someone can fold, print and read. | media |
| [Yes Chef Maybe](agents/improv-kitchen-table.json) | Hosts playful scene games for solo performers or groups and coaches listening, offers and callbacks. | other |
| [Mendwell](agents/repair-or-replace.json) | Compares repair, replacement and waiting using service life, downtime, warranties and the owner's priorities. | home |
| [Index](agents/query-plan-reader.json) | Reads a query and its plan, then designs a fair test of a proposed rewrite or index. | dev |
| [Field Manual](agents/oral-instructions-writer.json) | Turns expert notes into a procedure someone can follow, check and recover from when a step fails. | writing |
| [Playtest](agents/game-mechanics-workshop.json) | Builds a playable core loop and a playtest that can reveal whether the intended decisions are interesting. | media |
| [Platform Zero](agents/imaginary-transit.json) | Builds fictional transit maps whose routes, fares and eccentric delays reveal how an invented city works. | other |
| [Quadrat](agents/citizen-science-notebook.json) | Designs repeatable local observations and helps interpret a field notebook without overstating what it shows. | learning |
| [Beaconry](agents/observability-designer.json) | Works backward from user-visible failures to signals, alerts and first-response notes. | dev |
| [Acorn Press](agents/childrens-story-studio.json) | Builds read-aloud stories with sound, repetition and a satisfying turn for young listeners. | writing |
| [Sightline](agents/exhibition-designer.json) | Designs a visitor route, interpretation plan and accessible alternatives for a public exhibition. | media |
| [Justice Crumpet](agents/tiny-debate-club.json) | Runs a miniature courtroom for low-stakes disagreements and turns the verdict into a practical experiment. | other |
| [Flagstaff](agents/cli-designer.json) | Designs commands that work interactively, in scripts and when something goes wrong. | dev |
| [Dogear](agents/developmental-beta-reader.json) | Reports how a draft lands scene by scene and finds where a reader's expectations change. | writing |
| [Offcut](agents/collage-workshop.json) | Builds a visual argument from found fragments and helps the maker choose, arrange and edit materials. | media |
| [Postmaster Moth](agents/dream-post-office.json) | Turns an image, memory or odd premise into a little packet of letters from an imaginary place. | writing |
| [Locale](agents/localization-engineer.json) | Finds locale assumptions in product flows and prepares adaptable strings, layouts and tests. | dev |
| [Transpose](agents/adaptation-workshop.json) | Reimagines a story for a different medium while preserving its central emotional event. | writing |
| [Counterform](agents/type-specimen-coach.json) | Helps choose and refine type through hierarchy tests, awkward letter pairs and real reading conditions. | media |
| [Turnstile](agents/state-machine-mapper.json) | Makes complex product flows testable with explicit states, transitions and recovery paths. | dev |
| [Wallspace](agents/portfolio-critic.json) | Selects and orders work to show a maker's range, decisions and fit for a particular opportunity. | media |
| [Hello Worldly](agents/sdk-sample-builder.json) | Designs a first successful integration and a second example that handles real-world failure. | dev |
| [Trailhead](agents/codebase-navigator.json) | Traces a feature through an unfamiliar repository and builds a reading route for a new contributor. | dev |

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
