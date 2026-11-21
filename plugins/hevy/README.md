# Hevy for Botkins

Lets your bots read and log [Hevy](https://hevy.com) workouts, routines, exercise templates and history, and body measurements.

## Setup

1. You need **Hevy Pro**. Create a personal API key at <https://developers.hevy.com/api-key>.
2. In Botkins, install **hevy** from the Botkins marketplace and paste the key into **Hevy API key**.
3. Switch it on for the bots that should see your training data.

Node.js must be on the computer running Botkins. The server has no dependencies.

## Tools

22 tools generated from Hevy's OpenAPI spec: `list_workouts`, `get_workout`, `count_workouts`, `list_workout_events`, `create_workout`, `update_workout`, `list_routines`, `get_routine`, `create_routine`, `update_routine`, `list_routine_folders`, `get_routine_folder`, `create_routine_folder`, `list_exercise_templates`, `get_exercise_template`, `create_exercise_template`, `get_exercise_history`, `list_body_measurements`, `get_body_measurement`, `create_body_measurement`, `update_body_measurement`, `get_user_info`.

Image uploads are not included yet.

## Privacy

The key stays in the Botkins credential vault on your computer. The server sends it only to `https://api.hevyapp.com` in the `api-key` header. Anyone with the key can read and change your Hevy data, so revoke it on the Hevy developer page if it leaks.
