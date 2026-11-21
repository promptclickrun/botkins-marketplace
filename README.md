# Botkins Marketplace

The first-party plugin catalog for [Botkins](https://github.com/promptclickrun/Botkins). Botkins desktop reads `.github/plugin/marketplace.json` from this repo, so merging to `main` publishes a plugin to every desktop and paired phone within an hour. No app release is needed.

## Plugins

| Plugin | What it does | Auth |
| --- | --- | --- |
| [hevy](plugins/hevy) | Read and log Hevy workouts, routines, exercises and body measurements | Personal API key (Hevy Pro) |

## Install

In Botkins, open **Settings → Marketplace → Plugins**. Until the built-in entry ships, choose **Add a marketplace** and enter `promptclickrun/botkins-marketplace`. Pick a plugin, review it, enter its settings and switch it on for the bots that should use it.

## Add a plugin

1. Create `plugins/<name>/` with a `plugin.json`, plus any of `skills/<skill>/SKILL.md`, `.mcp.json`, `hooks/hooks.json`. See the [plugin format](https://github.com/promptclickrun/Botkins/blob/main/desktop/docs/PLUGINS.md).
2. Declare every credential in `userConfig` with `"sensitive": true`. Botkins stores the values in its credential vault and passes them to MCP servers only as environment variables or headers.
3. Add an entry to `.github/plugin/marketplace.json`. Besides the standard fields, set:
   - `category`: `health`, `productivity`, `finance`, `home`, `dev`, `media` or `other`.
   - `auth`: `none`, `api-key` or `oauth`.
4. Run `node scripts/validate.mjs && node --test test/` and open a PR.

Local MCP servers should run on plain Node.js with no `npm install`. Botkins copies the plugin folder as-is.

## Review rules

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
