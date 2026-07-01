# KamustaSign

Real-time ASL interpreter + classroom module for Liloan Central School.
Built with Expo (React Native), web-first via `expo start --web`.

## Getting started

```bash
npm install
npx expo install
npx expo start --web
```

## What's built

- `src/theme/theme.ts` — design tokens (colors, fonts, spacing, radii)
- `src/components/HandLandmarkMark.tsx` — hand-landmark logo/loading motif
- `src/components/RoleCard.tsx` — reusable tappable role card
- `src/screens/RoleSelectScreen.tsx` — approved landing screen (Student/Teacher/Admin)
- `App.tsx` — font loading + placeholder role routing

## Not yet built

- Auth (Supabase)
- Real navigation (`@react-navigation/native`) — App.tsx currently uses
  simple local state instead
- Real-time translator screen
- Teacher assignment flow
- Student assignment flow
- Admin panel

## Fonts

Uses `@expo-google-fonts/baloo-2` (headings) and `@expo-google-fonts/inter`
(body text) — installed as npm packages, no manual font files needed.
