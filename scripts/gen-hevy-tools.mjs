#!/usr/bin/env node
// Regenerates plugins/hevy/tools.json from Hevy's public OpenAPI spec.
// Usage: node scripts/gen-hevy-tools.mjs [path-or-url]   (default: https://developers.hevy.com/openapi.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = process.argv[2] || "https://developers.hevy.com/openapi.json";
const OUT = fileURLToPath(new URL("../plugins/hevy/tools.json", import.meta.url));

const spec = /^https:\/\//.test(SOURCE)
  ? await (await fetch(SOURCE)).json()
  : JSON.parse(readFileSync(SOURCE, "utf8"));

// Binary uploads need a file path flow; leave them out until there is a use for them.
const SKIP = new Set(["POST /v1/workouts/{workoutId}/images", "PUT /v1/body_measurements/{date}/image"]);

const NAMES = {
  "GET /v1/workouts": "list_workouts",
  "POST /v1/workouts": "create_workout",
  "GET /v1/workouts/count": "count_workouts",
  "GET /v1/workouts/events": "list_workout_events",
  "GET /v1/workouts/{workoutId}": "get_workout",
  "PUT /v1/workouts/{workoutId}": "update_workout",
  "GET /v1/user/info": "get_user_info",
  "GET /v1/routines": "list_routines",
  "POST /v1/routines": "create_routine",
  "GET /v1/routines/{routineId}": "get_routine",
  "PUT /v1/routines/{routineId}": "update_routine",
  "GET /v1/exercise_templates": "list_exercise_templates",
  "POST /v1/exercise_templates": "create_exercise_template",
  "GET /v1/exercise_templates/{exerciseTemplateId}": "get_exercise_template",
  "GET /v1/routine_folders": "list_routine_folders",
  "POST /v1/routine_folders": "create_routine_folder",
  "GET /v1/routine_folders/{folderId}": "get_routine_folder",
  "GET /v1/exercise_history/{exerciseTemplateId}": "get_exercise_history",
  "GET /v1/body_measurements": "list_body_measurements",
  "POST /v1/body_measurements": "create_body_measurement",
  "GET /v1/body_measurements/{date}": "get_body_measurement",
  "PUT /v1/body_measurements/{date}": "update_body_measurement",
};

const KEEP = new Set(["type", "description", "enum", "items", "properties", "required", "default", "maximum", "minimum", "format"]);

function resolve(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 12) return schema;
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    const { $ref: _ref, ...rest } = schema;
    return resolve({ ...spec.components.schemas[name], ...rest }, depth + 1);
  }
  if (Array.isArray(schema)) return schema.map((item) => resolve(item, depth + 1));
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!KEEP.has(key)) continue;
    if (key === "properties") out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, depth + 1)]));
    else if (key === "items") out.items = resolve(value, depth + 1);
    // Some Hevy schemas put `required: true` on a property; JSON Schema wants an array on the parent.
    else if (key === "required" && !Array.isArray(value)) continue;
    else out[key] = value;
  }
  // Hevy marks some enums as `type: "enum"`, which is not a JSON Schema type.
  if (out.type === "enum") out.type = "string";
  if (schema.nullable && typeof out.type === "string") out.type = [out.type, "null"];
  if (schema.properties) {
    const nested = Object.entries(schema.properties).filter(([, v]) => v && v.required === true).map(([k]) => k);
    if (nested.length) out.required = [...new Set([...(out.required || []), ...nested])];
  }
  return out;
}

const tools = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    const key = `${method.toUpperCase()} ${path}`;
    if (SKIP.has(key)) continue;
    const name = NAMES[key];
    if (!name) throw new Error(`No tool name for ${key}. Add it to NAMES or SKIP.`);
    const properties = {};
    const required = [];
    const params = { path: [], query: [] };
    for (const param of op.parameters || []) {
      if (!["path", "query"].includes(param.in)) continue;
      const schema = resolve(param.schema || { type: "string" });
      if (param.description) schema.description = param.description;
      properties[param.name] = schema;
      params[param.in].push(param.name);
      if (param.required || param.in === "path") required.push(param.name);
    }
    let body;
    const json = op.requestBody?.content?.["application/json"]?.schema;
    if (json) {
      properties.body = { ...resolve(json), description: "JSON request body." };
      required.push("body");
      body = true;
    }
    tools.push({
      name,
      description: (op.summary || op.description || key).trim(),
      method: method.toUpperCase(),
      path,
      params,
      ...(body ? { body } : {}),
      readOnly: method === "get",
      inputSchema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
    });
  }
}

writeFileSync(OUT, JSON.stringify({ source: SOURCE, specVersion: spec.info?.version, tools }, null, 2) + "\n");
console.log(`Wrote ${tools.length} tools to ${OUT}`);
