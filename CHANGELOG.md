# LCSign changes

Newest first. Every build that leaves the development PC gets a new version
(`npm run version:set -- x.y.z`) and an entry here. How to release:
docs/RELEASING.md.

## 1.2.0 - 2026-11-22

**New**
- **App errors for admins:** while someone is signed in, the app sends its
  errors to the school's own database (migration 0019, `report_errors()`),
  and admins see them under "App errors" on the Accounts page: when, whose
  account, which app and version, the full text, Copy and Delete. Email
  addresses, log-in tokens and computer user names are taken out first.
  Admins only; deleted after 30 days. Limits: 30 per send, 50 new a day per
  account, 20,000 in all. Errors from before sign-in go with the next
  account that signs in on that device.
- Desktop app: crashes and freezes of the window are kept in
  `%APPDATA%\LCSign\logs\problems.json` and added to the error list when
  the app opens again, since a crashed window can't record its own crash.

**Fixed**
- `supabase/tests/rls_test.sql` hadn't run since 1.1.0 (four `$` instead of
  `$$`); it now also covers 0019.

## 1.1.0 - 2026-11-17

The first release with a real version number. Everything before was
installed as "1.0.0", whatever the date of the build.

**New**
- Android app (Capacitor), now signed with LCSign's own release key so later
  versions install over it.
- Teachers book video calls; students can call only during their booked
  time (database migration 0017).
- Sign-up and password reset by emailed 6-digit code, leaked-password check,
  and 2FA required for admins (0016).
- No internet: the start screen offers the Translator and a Classroom that
  keeps stars on the device.
- Translator redesign (big camera, hold ring, Settings) with Words in the
  same design; hands-free word reading starts sooner and trims the pause at
  the end.
- Classroom word lists A to Z; modules count only passes since the module
  was made; teacher Progress and module editor redesign.
- FSL words retrained with the team's recordings.
- **About LCSign** in the Appearance panel: version, update status, and
  "Copy error report".
- **Update check:** the app compares itself with the app_release table
  (0018). Too old = "Update LCSign" screen (the Translator still works).
- **Desktop auto-update** (switched off until an update address is set in
  app_release).
- **Error log:** the last errors on every device; the desktop app also
  writes `%APPDATA%\LCSign\logs\lcsign.log`. A crashed or frozen desktop
  window now offers Reload instead of going white.

**Fixed**
- Desktop app picked a virtual camera (Logi Capture) over the real webcam.
- Video call fixes (sign reader buttons, Clear syncs to the student).
- 25-second spinner when starting offline.

**Security**
- Electron 33 -> 45; inline scripts blocked by the content security policy.
- Dependency fixes (`npm audit fix`): the critical and most high issues
  gone. What's left is in Expo's build tools (not shipped in the app) and
  needs the Expo 58 upgrade.
- Red-team test (docs/RED_TEAM_REPORT.md): 126 attacks, 117 refused. Fixed:
  desktop content policy (no scripts from a CDN, connections only to
  LCSign's server), Android backups no longer copy the log-in, builds always
  clear their cache. Known limit: a student can fake stars through the API.

**Database:** apply 0015 (if not applied yet), 0016, 0017 and 0018 in order.
