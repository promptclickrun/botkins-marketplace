---
name: hill-climb-curate
description: Use when the person asks to clean up, prune, dedupe or audit your memory, profile or skills, when a profile file has grown past its budget, or after several retros. Keeps self-improvement from turning into clutter.
---

# Hill Climb Curate

Learning only helps if what you keep stays short, current and loadable. This pass removes, merges and sharpens. It adds nothing new.

Helper: `node "<hill-climb-retro skill folder>/scripts/hill.mjs"` (`ledger --bot <id>` shows recent changes, `log` records yours).

## Steps

1. **Inventory.** `memory_read`; `profile_read` for AGENTS.md, USER.md and IDENTITY.md; list your custom skills (`hill.mjs where` gives the folder); `hill.mjs ledger --bot <id> --last 30`; `hill.mjs score --bot <id>`.
   Changes the score marks `revert` are first in line to go: undo them as the retro skill describes and record `hill.mjs verdict --reverted`. Lines marked `kept` earned their place, so cut them only when they duplicate something.
2. **Find the waste.**
   - Duplicates: the same rule in memory and AGENTS.md, or in two skills.
   - Contradictions: an older line the person later reversed. The newer evidence wins.
   - Stale facts: a finished project, an old address, a tool that's gone.
   - Vague rules that don't change behavior ("be careful", "be thorough").
   - Skills whose `description` wouldn't trigger on the situation they were written for, or that nothing has used.
   - Files over budget (AGENTS.md about 60 lines, USER.md about 40, a skill about 80).
3. **Plan** a short list of edits: merge, cut, sharpen, move to a better home (see the routing table in hill-climb-retro).
4. **Apply** what's clearly safe: merging duplicates, deleting a memory the person already corrected, tightening wording without changing meaning. **Ask first** before deleting a skill, removing a rule the person set, or changing IDENTITY.md.
5. **Verify** each file reads cleanly and still says everything it needs to.
6. **Log** each change with `hill.mjs log` (with `--undo`), then report: before and after line counts, what moved or went, and what you left for the person to decide.

Never rewrite a whole file just to restyle it. Never delete anything another bot or the person owns.
