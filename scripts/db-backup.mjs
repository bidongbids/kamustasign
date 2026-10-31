// Copies everything in the LCSign database - accounts, 2FA apps, classes,
// progress, modules, call notes - into one .sql file, and puts it back after
// a loss. Supabase's free plan keeps no backups of its own.
//
//   npm run db:backup                   -> backups/lcsign-YYYY-MM-DD-HHMM.sql
//   npm run db:restore -- <file.sql>    -> into an EMPTY project: every
//                                          migration applied, no accounts yet
//
// Needs SUPABASE_DB_URL in .env: Supabase dashboard -> Connect -> "Session
// pooler" connection string, with the database password put in. It has no
// EXPO_PUBLIC_ prefix, so it never ends up in the app bundle.
//
// A backup holds names, emails and password hashes. backups/ is git-ignored;
// keep the files off GitHub and shared drives too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Supabase's own login tables: the accounts, how each one signs in, and their
// authenticator apps. Sessions and logs are left out - after a restore
// everyone just logs in again.
const AUTH_TABLES = ["users", "identities", "mfa_factors"];

const ident = (name) => `"${name.replace(/"/g, '""')}"`;

// db is { query(sql, params) -> rows, exec(sql) } so the tests can hand in
// PGlite instead of a live connection.

/** The app's tables in public, each after the tables it references. */
async function publicTables(db) {
  const names = (
    await db.query(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`
    )
  ).map((r) => r.name);
  const refs = await db.query(
    `select c.relname as child, p.relname as parent from pg_constraint k
     join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
     join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
     where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'public'`
  );
  const ordered = [];
  const seen = new Set();
  const visit = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    for (const r of refs) if (r.child === t && r.parent !== t) visit(r.parent);
    ordered.push(t);
  };
  names.forEach(visit);
  return ordered;
}

/** One insert per row. Postgres quotes the values, so nothing is escaped by hand. */
async function tableInserts(db, schema, table) {
  const cols = await db.query(
    `select a.attname as name, a.attidentity as identity from pg_attribute a
     join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     order by a.attnum`,
    [schema, table]
  );
  const target = `${ident(schema)}.${ident(table)}`;
  const head = `insert into ${target} (${cols.map((c) => ident(c.name)).join(", ")}) ${
    cols.some((c) => c.identity === "a") ? "overriding system value " : ""
  }values (`;
  const values = cols.map((c) => `quote_nullable(t.${ident(c.name)}::text)`).join(" || ', ' || ");
  const rows = await db.query(`select ${values} as v from ${target} t`);
  return rows.map((r) => `${head}${r.v});`);
}

async function tableExists(db, schema, table) {
  const [{ found }] = await db.query(`select to_regclass($1) is not null as found`, [`${ident(schema)}.${ident(table)}`]);
  return found;
}

/** The whole backup as SQL text, plus how many rows each table had. */
export async function dumpDatabase(db, { madeAt = new Date(), source = "" } = {}) {
  // Same text form for dates and times whatever the server's settings.
  await db.exec(`set datestyle = 'ISO, YMD'; set timezone = 'UTC'; set intervalstyle = 'postgres'`);
  const tables = [];
  for (const t of AUTH_TABLES) if (await tableExists(db, "auth", t)) tables.push(["auth", t]);
  for (const t of await publicTables(db)) tables.push(["public", t]);

  const counts = [];
  const body = [];
  for (const [schema, table] of tables) {
    const inserts = await tableInserts(db, schema, table);
    counts.push({ table: `${schema}.${table}`, rows: inserts.length });
    body.push(`-- ${schema}.${table}: ${inserts.length} row(s)`, ...inserts, "");
  }

  const sql = [
    "-- LCSign database backup",
    `-- Made ${madeAt.toISOString()}${source ? ` from ${source}` : ""}`,
    "-- Holds names, emails and password hashes: keep it private.",
    "-- Restore with: npm run db:restore -- <this file>",
    "",
    // Skips triggers (handle_new_user would add a second profile per account)
    // and foreign-key order checks while the rows go back in.
    "set session_replication_role = replica;",
    "set datestyle = 'ISO, YMD';",
    "",
    ...body,
    "set session_replication_role = origin;",
    "",
  ].join("\n");
  return { sql, counts };
}

/** Puts a backup back. Refuses a project that already has accounts or data. */
export async function restoreDatabase(db, sql) {
  const [{ n: accounts }] = await db.query(`select count(*)::int as n from auth.users`);
  if (accounts > 0) {
    throw new Error(
      `That project already has ${accounts} account(s). A restore only goes into an empty project ` +
        `(every migration applied, nobody signed up yet), so nothing is overwritten.`
    );
  }
  for (const t of await publicTables(db)) {
    const [{ n }] = await db.query(`select count(*)::int as n from public.${ident(t)}`);
    if (n > 0) throw new Error(`public.${t} already has ${n} row(s). A restore only goes into an empty project.`);
  }
  await db.exec("begin");
  try {
    await db.exec(sql);
    await db.exec("commit");
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

// ── command line ──────────────────────────────────────────────────────────

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function connect() {
  try {
    process.loadEnvFile(path.join(repoRoot, ".env"));
  } catch {
    // no .env - SUPABASE_DB_URL may be set in the shell instead
  }
  const raw = process.env.SUPABASE_DB_URL;
  if (!raw) {
    fail(
      "SUPABASE_DB_URL isn't set. In the Supabase dashboard press Connect, copy the\n" +
        '"Session pooler" connection string, put your database password in place of\n' +
        "[YOUR-PASSWORD], and add it to .env as one line:\n\n" +
        "  SUPABASE_DB_URL=postgresql://postgres.abcd...:password@aws-0-....pooler.supabase.com:5432/postgres"
    );
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(
      "SUPABASE_DB_URL isn't a valid address. If the database password has symbols\n" +
        "like @ # / ? in it, reset it (Project Settings -> Database) to letters and numbers."
    );
  }
  // Supabase uses its own certificate authority, so the connection is
  // encrypted without checking the certificate chain.
  url.searchParams.delete("sslmode");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    const hint =
      e.code === "ENOTFOUND" || e.code === "ENETUNREACH"
        ? 'Can\'t reach that address. Use the "Session pooler" string, not "Direct connection" (that one needs IPv6).'
        : /password authentication failed/i.test(e.message)
          ? "Wrong database password. Reset it in Project Settings -> Database if you don't have it."
          : /tenant or user not found/i.test(e.message)
            ? 'The user name in SUPABASE_DB_URL is wrong. Copy the "Session pooler" string again.'
            : "If the project is paused, restore it in the Supabase dashboard first.";
    fail(`Couldn't connect to the database: ${e.message}\n${hint}`);
  }
  const db = {
    query: async (sql, params) => (await client.query(sql, params)).rows,
    exec: async (sql) => {
      await client.query(sql);
    },
  };
  return { client, db, host: url.hostname };
}

const stamp = (d) => d.toISOString().slice(0, 16).replace("T", "-").replace(":", "");

async function backupCommand() {
  const { client, db, host } = await connect();
  try {
    const madeAt = new Date();
    const { sql, counts } = await dumpDatabase(db, { madeAt, source: host });
    const dir = path.join(repoRoot, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `lcsign-${stamp(madeAt)}.sql`);
    fs.writeFileSync(file, sql);
    for (const c of counts) console.log(`  ${c.table.padEnd(28)} ${c.rows}`);
    console.log(`\nSaved ${path.relative(repoRoot, file)} (${Math.ceil(sql.length / 1024)} KB).`);
    console.log("Copy it somewhere off this computer too, like a USB drive.");
  } finally {
    await client.end();
  }
}

async function restoreCommand(file) {
  if (!file) fail("Which backup? npm run db:restore -- backups/lcsign-....sql");
  const sql = fs.readFileSync(path.resolve(file), "utf8");
  if (!sql.startsWith("-- LCSign database backup")) fail(`${file} isn't an LCSign backup.`);
  const { client, db, host } = await connect();
  try {
    console.log(`Restoring ${file} into ${host} ...`);
    await restoreDatabase(db, sql);
    console.log("Done. Everyone logs in again with their usual password (and 2FA app).");
  } catch (e) {
    fail(`Nothing was changed: ${e.message}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [command, arg] = process.argv.slice(2);
  if (command === "backup") await backupCommand();
  else if (command === "restore") await restoreCommand(arg);
  else fail("Usage: node scripts/db-backup.mjs backup | restore <file.sql>");
}
