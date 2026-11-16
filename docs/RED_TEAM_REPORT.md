# LCSign red-team report

**Date:** 17 Nov 2026 · **Version tested:** 1.1.0 (migrations 0001-0018) · **Scripts:** `scripts/redteam/`

## Summary

We attacked LCSign the way a dishonest student, teacher, admin or outsider
would. We skipped the app's screens and talked to the server directly with
the public key and our own log-ins. **126 attacks on the server: 117 refused,
1 real weakness, 2 marked weak, 6 by design.** One of the two weak marks (2FA code
guessing) was rechecked and is limited after about 30 tries per 5 minutes. No attack let anyone see or
change another person's data, raise their own rights, or listen in on a call.

What needs attention:

1. **A student can fake stars** by calling the server directly. The sign
   reader runs on the device, so the server can't check that a sign was made.
2. **The log-in limit can lock a classroom out.** Supabase allows 30 log-ins
   per 5 minutes per internet address, and a school lab shares one address.
3. **The video-call relay key ships inside the app.** Anyone can copy it and
   use up the free monthly relay allowance.

We fixed four smaller things in code (findings 4-7).

## How it was tested

- **Target:** a separate Supabase project, `lcsign-redteam`, never the live
  one. It has all 18 migrations, the same Realtime (private channels only) and
  password settings, and **Confirm email off** so test accounts need no inbox.
- **Accounts:** a super admin and an admin (both with 2FA), a waiting admin,
  2 teachers with one class each, a waiting teacher, 3 students (class A,
  class B, no class) and a waiting student. Classes were seeded with modules,
  progress, call notes and bookings.
- **Tools:** Node scripts with `supabase-js` and raw HTTP; puppeteer-core with
  Chrome against the real app built for the test project; a sandbox that
  loads `electron/main.js`; `aapt2` on the signed APK; `git log` and
  `grep` for secrets.
- **Not tested:** the live project (on purpose), email delivery, the desktop
  app running (Smart App Control blocks unsigned Electron on the development
  PC; its code was tested in the sandbox), load or denial-of-service attacks,
  and phishing.

## Findings

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Medium | **Fake stars.** `record_lesson_attempt` accepts "passed" from any student for their own account. A script can mark every sign learned in seconds. It can't touch other students (refused). | Open: design limit of on-device recognition |
| 2 | Medium (availability) | **Log-in limit vs. a school network.** Live: 30 sign-ins per 5 minutes per IP (Supabase default). Our run was cut off at attempt 32. A class of 30+ logging in behind one school router gets "Request rate limit reached". | Open: raise in Supabase, needs your OK |
| 3 | Medium (cost) | **Relay key in the app.** The Metered TURN credentials URL with its API key is in the shipped bundle. Anyone can fetch relay credentials and use the free plan's monthly data, after which calls across networks fail. | Open: needs a Metered usage cap, or a server function |
| 4 | Low | **Desktop content policy allowed scripts from cdn.jsdelivr.net**, which hosts anyone's files, and connections to any `*.supabase.co`. That would help an attacker only if HTML injection existed (none found). | **Fixed:** scripts only from the app; connections only to LCSign's own project |
| 5 | Low | **Android `allowBackup=true`**: device backups could copy the stored log-in session to another phone. | **Fixed:** `allowBackup="false"` |
| 6 | Low (process) | **Stale server address in builds.** The build cache kept the previous server address even with new settings. A build could point at the wrong server. | **Fixed:** every build script and CI use `expo export --clear` |
| 7 | Info | **Docs said passes are limited to one per sign per 10 minutes.** Migration 0012 removed that, since one pass learns a sign. 20 simultaneous passes all counted, as designed. | **Fixed:** EVALUATION.md and the reviewer corrected |
| 8 | Low | **Join codes can be guessed without a limit**: about 100 guesses a second. With 31^6 = 887 million codes that's weeks per class, and it needs an *approved* student with no class. | Open: accept, or longer codes / an attempt limit |
| 9 | Low | **A copied access token works up to 1 hour after log-out.** This is how Supabase tokens work. | Accept, or shorten the token lifetime in Supabase |
| 10 | Info | Approved teachers see the email of every student without a class (needed for the invite list). | By design |

## What held

| Attacker | Attacks | Result |
| --- | --- | --- |
| No account (public key only) | 31: every table, every function, API schema listing, a call channel | All refused, except reading `app_release` (by design) |
| Student | 40: other profiles and classes, own role/approval/class, others' progress, writing progress directly, modules, word plans, call notes, bookings, faked missed calls, every teacher/admin function, legacy tables, another pair's call | All refused except fake stars (#1) |
| Waiting student / teacher / admin | 9: joining with a valid code, practising, creating a class, approving itself, listing accounts | All refused |
| Teacher | 26: another class's students, progress, notes and modules; taking over or renaming a class; moving students; booking in another teacher's name; editing students' progress or names; making itself admin; approving accounts; another call | All refused |
| Admin | 14: admin actions without passing 2FA, turning off own 2FA, approving an admin, becoming or demoting the super admin, deleting accounts, reading call notes, `app_release` | All refused |
| Log-in | Sign-up asking for super admin + approved, a 7-character password, password guessing, 2FA code guessing, a forged `service_role` token, an unsigned (`alg: none`) super-admin token | All refused; guessing is cut off at about 30 tries per 5 minutes |
| Screens (stored XSS) | Script and HTML in a student name, class name, module title and description, and call notes, seen by teacher, student and admin on 10 screens | Nothing ran; shown as plain text. The class-code print page escapes its text |
| Desktop app (`main.js` in a sandbox) | 11 path tricks on the file server (`..`, `%2f`, `%5c`, `%00`, neighbouring folder); 8 lookalike app addresses; 8 bad update addresses | All refused |
| Android app | Debuggable, plain-HTTP traffic, components open to other apps | None; the one exported receiver needs a system permission |
| Secrets | Git history, the shipped bundle | Clean; only the public key and the relay key (#3) ship |

## What to do

1. **Raise the sign-in limit** on the live project (Authentication > Rate
   Limits > "sign-ups and sign-ins") from 30 to about 150 per 5 minutes, or
   stagger log-ins. Password guessing stays limited per address.
2. **Cap the relay:** set a usage limit or alert in the Metered dashboard.
   Better: hand out TURN credentials from a Supabase Edge Function only to
   logged-in users, and take the key out of the app.
3. **Fake stars:** accept as a known limit (say so in the manuscript), or
   later: show teachers when a student learns many signs within minutes.
4. **Turn on 2FA for the accounts that own everything**: Supabase, GitHub,
   the LCSign Gmail and Metered. Whoever gets into those controls the data,
   the update source and the emails.
5. **Ship the fixes:** they're in the code. Rebuild the installers (the
   Windows one through GitHub Actions) and the APK.
6. **The test project** `lcsign-redteam` holds only test accounts. Keep it to
   rerun these scripts after changes (it pauses itself after a week idle), or
   delete it in the Supabase dashboard.

## Rerun

`scripts/redteam/README.md`. The scripts refuse to run against the live
project's URL.
