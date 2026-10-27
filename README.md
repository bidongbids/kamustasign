# LCSign

Sign-language translator and classroom app for Liloan Central School: it reads
ASL/FSL signs from a webcam, turns them into text and speech, and gives
students a practice curriculum that teachers can track. (The repository and
the older design docs use the project's working name, KamustaSign.)

Built with Expo (React Native), mainly targeting the web (`expo start --web`),
with an Electron desktop build. Recognition runs **on the device** (MediaPipe +
TensorFlow.js); no camera video is sent to any server.

## Features

| Area | What it does |
|---|---|
| **Translator: Fingerspelling** | ASL letters (and digits) from one hand, live, with a hold-to-commit rule. Left-handed signers can mirror the input. |
| **Translator: Words** | 344 ASL words (combined ASL Citizen / WLASL / MS-ASL / GISLR ensemble) and 105 FSL words (FSL-105). Record a word, or use hands-free mode, which finds each sign by when the hands start and stop moving (`src/ml/signSegmenter.ts`). The result is translated (MyMemory) and spoken (expo-speech). |
| **Translator: Signer** | Text-to-sign direction: a 3D avatar plays sign recordings (early stage). |
| **Students** | Curriculum by language and group (letters / numbers / words), "How to make it" reference videos, practice graded by the model (one good try learns a sign; stars show how well it was made), word categories by part of speech. |
| **Teachers** | Multiple classes, inviting students (checklist or join code), custom modules (an ordered set of signs with an optional due date), class progress. |
| **Admin** | Account management, approving teacher sign-ups. |
| **Video call** | Teacher-controlled WebRTC calls with an in-call sign reader that ignores signs outside its vocabulary. |
| **Auth** | Supabase email/password (Google optional). Teacher accounts wait for an admin's approval. Two-factor sign-in (TOTP) for teachers and admins, enforced by the database. An Account panel (tap your name in the dashboard header) changes your name and password and turns 2FA on or off. "Forgot password?" once email sending is set up (below). |

## Getting started

Requirements: Node 20+ (tested on Node 24), Chrome or Edge, a webcam.

```bash
npm install
cp .env.example .env      # then fill in the values (see below)
npm run web               # http://localhost:8081
```

### Environment (`.env`)

| Variable | Needed for |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Accounts, classroom, progress, video-call signalling. Without them the translator still works; sign-in is disabled. |
| `EXPO_PUBLIC_TURN_CREDENTIALS_URL`, or `EXPO_PUBLIC_TURN_URLS` + `EXPO_PUBLIC_TURN_USERNAME` + `EXPO_PUBLIC_TURN_CREDENTIAL` | Video calls between **different networks** (school Wi-Fi, mobile data). Without TURN, calls only connect reliably on the same network. Free tier: [metered.ca](https://www.metered.ca/stun-turn). |
| `EXPO_PUBLIC_MYMEMORY_EMAIL` | Optional: raises the free translation quota. |
| `EXPO_PUBLIC_PASSWORD_RESET` | `true` shows "Forgot password?". Turn it on only after custom SMTP is set up (see below); Supabase's built-in mailer only sends to the project team's own addresses. |
| `EXPO_PUBLIC_GOOGLE_SIGNIN` | `true` shows "Continue with Google" on the student sign-in screen, after the Google provider is turned on in Supabase. |

### Database

Run the migrations in `supabase/migrations/` **in order** (`0001` → `0013`)
in the Supabase SQL editor (or `supabase db push`). Row Level Security is
defined there; the anon key is safe to ship because RLS, not the key,
restricts access. `supabase/tests/rls_test.sql` checks the main access rules
(see [Testing](#testing)).

### Supabase dashboard settings

These live in the dashboard, not in the migrations:

- **Realtime → Settings → "Allow public access": off.** Calls use private
  channels (0011). Builds from before 0011 used a public channel and can't
  call once this is off, so replace them first.
- **Authentication → Emails → SMTP:** a custom SMTP server (Brevo, Resend,
  Gmail with an app password, ...). Then turn on **"Confirm email"** in the
  Email provider settings. Without it, anyone can sign up with an address
  that isn't theirs, including a real teacher's - so until it's on, approve
  teacher accounts only after checking with the person.
- **Email provider settings → minimum password length: 8**, to match the app.
- **Authentication → URL Configuration:** add the web app's address (for
  example `https://lcsign.example.org/**` and `http://localhost:8081/**`)
  to the redirect URLs, so reset and confirmation links come back to it.

### Admin help

- **Approving teachers:** new teacher accounts appear at the top of the
  Admin dashboard. "Make student" turns one down.
- **Lost 2FA phone:** in the Supabase SQL editor,
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'teacher@example.com');`
  The person can then log in with just their password and set 2FA up again
  from the Account panel.
- **Forgotten password before SMTP is set up:** set a temporary one in the
  SQL editor and ask the person to change it in the Account panel:
  `update auth.users set encrypted_password = extensions.crypt('Temporary-Pass-123', extensions.gen_salt('bf')) where email = 'student@example.com';`

### Offline use

Everything the translator needs is in `public/`: the TF.js models
(`model/`, `word-model/`, `fsl-model/`), the MediaPipe `.task` files, and a
vendored copy of the MediaPipe runtime (`mediapipe/tasks-vision/`). The
translator works with no internet; only accounts, translation, and video
calls need a connection.

**Installable app (PWA).** The production web build has a manifest and a
service worker (`public/sw.js`), so Chrome/Edge offer "Install app", and
after one online visit the app opens and translates with no connection.
Each model is cached the first time it is used, so open the Fingerspelling
and Words tabs (ASL and FSL) once while online on each classroom device.
When shipping a retrained model, bump `CACHE` in `public/sw.js`.

**For demos, use the production build** (`npm run electron:build`, or
`npx expo export --platform web` served statically), not `npm run web`. The
Metro dev server serves large static files slowly (about 0.4 MB/s measured
on Windows), so in dev the camera takes about 50 s to start the first time,
versus seconds from disk.

## Scripts

| Command | What it does |
|---|---|
| `npm run web` | Dev server for the web app |
| `npm test` | Unit tests (Jest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run electron:install` | Install the Electron shell's dependencies (once) |
| `npm run electron:dev` | Web dev server + Electron window |
| `npm run electron:build` | Static web export + Windows installer (`electron/dist`) |
| `npm run android` / `ios` | Expo native (camera recognition is web-only for now) |

## Project layout

```
App.tsx                  role select -> auth -> dashboards / translator
src/
  screens/               translator (Live/Word/Signer), dashboard/, auth/, videocall/
  components/            shared UI (theme-aware), learn/ = student practice UI
  hooks/                 camera stream, MediaPipe landmarkers, video call, call sign reader
  ml/                    model loading, landmark -> feature vectors, sign segmenter
  lib/                   curriculum + progress rules, Supabase queries, translation, TTS
  theme/                 light/dark tokens, shadows, responsive helpers
  __tests__/             unit tests
public/                  models, MediaPipe runtime, reference media (see CREDITS.txt)
ml/                      Python training pipeline (see below)
supabase/                migrations + RLS tests
electron/                desktop shell (app:// protocol)
docs/                    design handoffs, model guides, planning notes
```

## ML pipeline

The Python side (`ml/`) extracts MediaPipe landmarks from sign datasets,
trains the classifiers, and exports them to TF.js.

- Setup: `ml/setup_python_env_windows.ps1` (CPU), or `ml/setup_wsl_gpu.sh`
  for GPU training under WSL.
- Guides: [docs/FSL_MODEL_GUIDE.md](docs/FSL_MODEL_GUIDE.md),
  [docs/NUMBERS_MODEL_GUIDE.md](docs/NUMBERS_MODEL_GUIDE.md).
- Evaluation: `ml/scripts/word_model_diagnostics.py`,
  `letter_model_diagnostics.py`, `per_class_accuracy.py`; the combined report
  is in [docs/EVALUATION.md](docs/EVALUATION.md).
- Raw datasets (`ml/data/`) and training checkpoints (`ml/models/`) are not in
  git. The deployed web models in `public/` are.

## Testing

```bash
npm test             # curriculum/progress rules, practice flow, sign segmenter
npm run typecheck
```

RLS: run `supabase/tests/rls_test.sql` against a **non-production** database
(it creates and rolls back its own test users). It raises an exception on the
first rule that fails.

## Data and licences

Reference videos and some training data come from research datasets (ASL
Citizen, WLASL, MS-ASL, GISLR, FSL-105) with their own terms, listed in
`public/reference/CREDITS.txt`. Several are **non-commercial / research-only**:
check those terms before any public release or redistribution of this repo,
its models, or its reference media.
