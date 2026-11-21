---
name: hevy
description: Use when the person asks about their Hevy workouts, lifting history, routines, PRs, body weight or measurements, or wants to log a workout or build a routine in Hevy.
---

# Hevy

The `hevy` MCP server exposes the Hevy API through the person's own API key.

## Units and formats
- Weight is kg, distance is meters, duration is seconds. Convert from lb (1 lb = 0.45359237 kg) and show both if the person uses pounds.
- Times are ISO 8601 with a zone, such as `2026-11-20T18:00:00-06:00`. Body measurement dates are `YYYY-MM-DD`.
- Set `type` is one of `warmup`, `normal`, `failure`, `dropset`.

## Paging
- Workouts, routines, folders and measurements: `pageSize` max 10. Exercise templates: max 100.
- To answer "how many" questions, call `count_workouts` instead of paging.
- To sync changes since a date, use `list_workout_events` with `since`.

## Common flows
- **Progress on a lift:** `list_exercise_templates` to find the `exercise_template_id`, then `get_exercise_history` with optional `start_date`/`end_date`.
- **Log a workout:** resolve each exercise to a template ID first. Call `create_workout` with `body.workout` holding `title`, `start_time`, `end_time`, and `exercises[]` with `sets[]`. Confirm the summary with the person before writing.
- **Build a routine:** `list_routine_folders` (or `create_routine_folder`), then `create_routine` with `body.routine`.
- **Weigh-in:** `create_body_measurement` with `date` and `weight_kg`. It returns 409 if that date exists; then use `update_body_measurement`, which overwrites every field, so read the entry first and resend the fields to keep.

## Care
- Writes change the person's real training log. Confirm before `create_*` or `update_*` unless they gave the exact data.
- Rate limits: 1,000 requests per 5 minutes overall. Avoid paging the whole history when a count or event feed answers the question.
- A 401 or 403 means the key is missing, wrong, or the account lacks Hevy Pro.
