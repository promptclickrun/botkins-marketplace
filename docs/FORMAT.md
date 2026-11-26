# Botkins Marketplace format, version 2

The catalog is `.github/plugin/marketplace.json`. Version 2 adds three listing types to the version 1 catalog: **skills**, **packs** and **templates**. It keeps `plugins` and `agents` exactly as they were.

| Key | Since | What it lists | Read by |
| --- | --- | --- | --- |
| `plugins` | 1 | Plugin folders (`plugins/<name>/plugin.json`) | Every Botkins app |
| `agents` | 1 | Agent templates, format version 1 or 2 (`agents/<name>.json`) | Every Botkins app |
| `skills` | 2 | Skill folders (`skills/<name>/SKILL.md` and companion files) | Apps with marketplace v2 |
| `packs` | 2 | Named sets of catalog skills and plugins | Apps with marketplace v2 |
| `templates` | 2 | Agent templates, format version 3, which can require catalog skills, packs and plugins | Apps with marketplace v2 |

## Compatibility

An app reads only the keys it knows and ignores the rest. A version 1 app keeps listing `plugins` and `agents`, and never sees `skills`, `packs` or `templates`.

Version 3 templates have their own key because version 1 apps reject a template version they do not know. A template that should also reach older apps keeps a version 2 file under `agents`, with its skills inline.

The catalog sets `"schemaVersion": 2`. An app built for a later schema reads only the keys it knows and ignores the rest.

## Skills

A skill listing points to a folder with a `SKILL.md`. The folder can also hold companion files: references, scripts, starter code, assets and a preview image. The whole folder installs as one skill.

```json
{
  "name": "visual-presentation",
  "version": "1.0.0",
  "source": "./skills/visual-presentation",
  "summary": "Cinematic single-file WebGL presentations: scenes and beats, shader transitions, synthesized sound, presenter controls.",
  "category": "media",
  "keywords": ["presentation", "slides", "webgl", "keynote"],
  "author": { "name": "Botkins", "url": "https://botkins.app" },
  "license": "MIT",
  "preview": "./skills/visual-presentation/preview.png",
  "requires": { "tools": ["shell", "node"], "optional": ["browser"] }
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `name` | yes | Kebab case, up to 64 characters. It must equal `name` in the SKILL.md front matter. |
| `version` | yes | Semantic version `MAJOR.MINOR.PATCH`. Raise it for every change to the folder. |
| `source` | yes | `./skills/<name>`. |
| `summary` | yes | Up to 240 characters. Botkins' own listing words. |
| `category` | yes | One of the agent categories (see below). |
| `keywords` | no | Up to 12 words. |
| `author` | no | `{ name, url }`. |
| `license` | yes | An SPDX identifier. If the license differs from the repository's, the folder must contain a LICENSE file. |
| `preview` | no | A PNG, JPEG or WebP inside the skill's folder, up to 1 MiB. |
| `requires.tools` | no | The capabilities the skill needs: `shell`, `node`, `python`, `browser`, `network`. Botkins shows them before install and warns when the bot can't meet them. |
| `requires.optional` | no | Capabilities the skill uses when available and works without. |

### Folder rules

These are the same limits the app's skill import enforces:

- **Files:** at most 512 files and 12 MiB unpacked.
- **Paths:** only portable paths. No `..`, no reserved device names, and no `\ : < > " | ? *`.
- **Links:** no symbolic links.
- **SKILL.md:** front matter with exactly `name` and `description`. The description is one line of up to 600 characters. The file is under 60,000 characters.
- **Excluded files:** no `node_modules`, `dist`, `.env` or other build output.
- **Executable files:** Botkins shows them in the install review. Installing a skill never runs anything.

### Installation

The app installs a skill through the same path it uses for featured skills:

1. It reads the folder from this repository at the catalog's commit.
2. It pins every file by its Git blob ID.
3. It shows a preview with the conflict check.
4. It copies the files into the chosen bot or bots.

An update is a new `version`. The app compares installed versions with the catalog and offers each update with a file diff.

## Packs

A pack is a named set of skills and plugins that installs together. A pack holds no files of its own.

```json
{
  "name": "presentation-studio",
  "version": "1.0.0",
  "summary": "Everything for talks: cinematic decks today, more presentation skills as they ship.",
  "category": "media",
  "skills": ["visual-presentation@^1.0.0"],
  "plugins": []
}
```

Each item is `name@range`, where the range is `^x.y.z`, `~x.y.z` or an exact `x.y.z`. Every name must exist in this catalog, and its current version must meet the range. A pack can reach skills that live in other catalogs only through a plugin.

## Templates, format version 3

A version 3 template is a version 2 template that can also require listings from this catalog:

```json
{
  "format": "botkins.bot-template",
  "version": 3,
  "name": "Deckhand",
  "role": "...",
  "summary": "...",
  "instructions": "...",
  "look": { "head": "spool", "palette": "fig" },
  "requires": {
    "skills": ["visual-presentation@^1.0.0"],
    "packs": [],
    "plugins": []
  },
  "bundle": {
    "skills": [{ "name": "...", "description": "...", "instructions": "..." }],
    "routines": [{ "name": "...", "instructions": "...", "cadence": { "kind": "weekly", "days": [1], "time": "09:00" }, "active": false }]
  }
}
```

- **`requires`:** the template's dependencies. Each item resolves against this catalog, the same way as a pack's. Botkins installs them for the new bot only, at the versions the catalog lists.
- **`bundle.skills`:** private skills, written inline, that belong only to this bot. The limits are the same as in version 2.
- **`bundle.routines`:** routines, as in version 2, plus `active`. A routine starts paused unless `active` is `true`. Botkins shows every routine and its schedule in the review, and the person can turn each one off before creating the bot.
- **At least one:** a version 3 template must have `requires` or `bundle`, or both.

The catalog entry under `templates` uses the same fields as an entry under `agents`, with `source` set to `./templates/<name>.json`.

### What the install review shows

Before the bot is made, the review lists:

1. The name, role, look and full instructions.
2. Every skill:
   - catalog skills, with their version, license, files and required tools;
   - private skills, with their full text.
3. Every plugin and the access it needs.
4. Every routine: its schedule, whether it starts active, and its full prompt.

Nothing installs or runs until the person confirms.

## Categories

`writing`, `research`, `productivity`, `work`, `dev`, `learning`, `health`, `finance`, `home`, `media`, `life`, `other`.

## Checks

`node scripts/validate.mjs` checks every listing:

- **Schema:** each listing follows the rules above.
- **References:** every reference resolves, and every version range is met.
- **Folders:** skill folders stay within the limits.
- **Text:** no listing text contains control or invisible characters.

CI runs it on every pull request.
