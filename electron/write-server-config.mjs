// Writes electron/server.json (git-ignored) from the project's .env: the
// Supabase URL and the public anon key, the same two values the web build
// already carries. main.js uses them to read the update address
// (app_release, 0018) without trusting the page for it.
// Run by `npm run electron:build` before electron-builder.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(join(here, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // no .env: fall back to the environment
}
const get = (key) => process.env[key] || env[key] || "";

const config = { supabaseUrl: get("EXPO_PUBLIC_SUPABASE_URL"), anonKey: get("EXPO_PUBLIC_SUPABASE_ANON_KEY") };
writeFileSync(join(here, "server.json"), JSON.stringify(config, null, 2) + "\n");
console.log(config.supabaseUrl ? `server.json: ${config.supabaseUrl}` : "server.json: no Supabase URL - update checks stay off");
