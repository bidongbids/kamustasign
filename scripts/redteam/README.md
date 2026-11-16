# Red-team scripts

Attacks LCSign the way a dishonest student, teacher, admin or outsider would:
straight against the database API with the public key and their own log-in,
skipping the app's screens. Results of the first run: `docs/RED_TEAM_REPORT.md`.

**Only ever against a separate TEST Supabase project.** The scripts create
accounts, change data and trip rate limits. `lib.mjs` refuses to run when
`env.json` points at the URL in the project's `.env`.

## Set up a test project (once)

1. Supabase dashboard: new project (free). Untick "Automatically expose new tables".
2. SQL editor: run `supabase/migrations/0001` ... `0018` in order, each as written
   ("Run without RLS" / "Run query" when it warns: later migrations add RLS).
3. Authentication > Sign In / Providers: turn **Confirm email off** (test project
   only, so accounts can be made without inboxes); Email provider: minimum
   password length 8. Realtime > Settings: turn **public access off**.
4. `env.json` here (git-ignored): `{"url": "https://<ref>.supabase.co", "anon": "<anon key>"}`.

## Run

```
node create-users.mjs     # 10 accounts, one or two per role -> creds.json (git-ignored)
node make-seed.mjs        # -> seed.sql: paste it into the TEST project's SQL editor
node mfa-setup.mjs        # 2FA for the test admins
node attack.mjs           # ~120 attacks -> results.json
node auth-extra.mjs       # 2FA guessing, forged tokens (wait 5 min after attack.mjs)
node electron-harness.cjs <empty scratch folder>   # desktop file server + URL checks
```

Stored-XSS check through the real app: build it against the test project with
`EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo export
--platform web --clear --output-dir scripts/redteam/dist-rt` (`--clear`, or the
build cache keeps the live address), `npm i --no-save puppeteer-core`, then
`node xss.mjs`. Rebuild the real app with `--clear` afterwards.

`VULNERABLE` lines are findings; `weak` = no limit where one would help;
`allowed` / `info` = works by design.
