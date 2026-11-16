# Releasing LCSign

The steps for every build that goes to the school's PCs or phones.

## 1. Before building

1. **Everything committed.** `git status` is clean, apart from work that
   isn't meant to ship. Build only from committed code.
2. **Only words the model knows.** Check that every word in
   `src/lib/wordCategories.ts` is in `public/word-model/label_classes.json`
   (and the FSL lists in `public/fsl-model/`).
3. **Tests:** `npm run typecheck` and `npm test` pass.
4. **Version:** `npm run version:set -- x.y.z` (bug fixes raise z, new
   features raise y), then add a CHANGELOG.md entry. Commit both, then tag:
   `git tag vx.y.z`.

## 2. Database changes (if the release has a new migration)

1. **Back up first:** `npm run db:backup` (needs `SUPABASE_DB_URL` in `.env`).
2. Run the migration in the Supabase SQL editor, in number order.
3. If old copies of the app can't work with the change, raise `min_version`
   in `app_release` (step 5) **after** the new build can be downloaded.
   Otherwise everyone gets stuck on the "Update LCSign" screen with nothing
   to install.

## 3. Build

- **Windows:** `npm run electron:build` produces
  `electron/dist/LCSign-Setup-x.y.z.exe`, plus `latest.yml` and the
  `.blockmap` for auto-update.
- **Android:** `npm run mobile:build` produces
  `mobile/dist/LCSign-x.y.z.apk` (to install directly on phones) and
  `LCSign-x.y.z.aab` (for the Play Store). It's signed with the release key
  when `mobile/android/keystore.properties` is present. Without it you get a
  debug build that can't update the real one.

Keep the previous version's installer. If something's wrong, that is the
way back.

## 4. Try it before everyone gets it

On **one** school PC (and one phone): install over the old version. Then
check: log in as a student and as a teacher, open the Translator (Letters
and Words), practise one sign, and make one call. Look at
Appearance > About LCSign: the new version number, and "Copy error report"
shows nothing new.

## 5. Publish

1. Put the files where `app_release` points:
   - Desktop auto-update: upload `LCSign-Setup-x.y.z.exe`,
     `LCSign-Setup-x.y.z.exe.blockmap` and `latest.yml` together to the
     folder in `update_feed_url`. A GitHub release works: the URL is
     `https://github.com/<owner>/<repo>/releases/latest/download`.
   - Android / manual download: the link in `download_url`.
2. Supabase > Table Editor > `app_release`: set `latest_version` (and
   `min_version` if needed, see 2.3) on the row for each platform.
3. Desktop apps with a feed URL download the update within ~4 hours, or at
   their next start, and install it when they close. Phones show "Version
   x.y.z is out" in About LCSign. Install the APK by hand.

## Keys and secrets (never in git)

- `.env`: Supabase URL and anon key, TURN URL, `SUPABASE_DB_URL`.
- Android release key: `C:\Users\USER\LCSign-release-key\` (see its
  README). Back it up in two places. Losing it means every phone must
  uninstall LCSign to take a new version.
- Whoever can edit `app_release` or the update folder decides what the
  desktop app installs (the installer isn't code-signed). Keep both
  locked down.
