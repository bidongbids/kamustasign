# Child learning layer: implementation notes

This implements the Graphite Aurora "student learning layer" design system for the Student dashboard and the Practice screen.

`originals/` holds copies of every existing file that was changed, as they were before this work. They have a `.orig` extension so TypeScript ignores them. Compare with them, or copy one back to undo a change.

## Changed files
- `src/theme/theme.ts`: new colour tokens (starFilled, starEmpty, starResting, celebrationGlow, masteredRing, tipAccent, holdTrack), plus `kidTypography` and `sizes`.
- `src/components/icons/UiIcons.tsx`: new icons (star, moon, check, lightbulb, hand, camera, clock, gear, loop, arrow, chevron-up, alert, eye).
- `src/components/ProgressBar.tsx`: new `readout` ("percent" | "count" | "none") and `size` props. The default is unchanged, so teacher and admin views look the same.
- `src/components/SegmentedToggle.tsx`: new `size="kid"` (48px segments) and `badge: "soon"` props.
- `src/components/HandednessPicker.tsx`: `useHandedness()` instances now stay in sync with each other.
- `src/screens/dashboard/CurriculumTabs.tsx`: new `audience="student"` prop. "Soon" groups can be selected and show a coming-soon panel. The teacher view is unchanged.
- `src/screens/dashboard/DashboardShell.tsx`: `DashboardCard` gets a `tint` prop ("frosted" by default, "sheer" for the student plan), and the shell gets `contentMaxWidth`.
- `src/screens/LiveTranslatorScreen.tsx`: new `variant="practice"`, `onHoldProgress` and `onRetry` props. The camera and MediaPipe lifecycle is untouched.
- `src/screens/WordTranslatorScreen.tsx`: new `variant="practice"`, `onRecordingStateChange` and `onRetry` props. There is no auto-speak in practice.
- `src/screens/dashboard/StudentDashboard.tsx` and `PracticeScreen.tsx`: rebuilt on the new components.

## New files
- `src/components/learn/*`: KidButton, Stars (StarRow / StarMeter), SignTile, WordPath, TargetCard (hold ring), SignReference, PracticeFeedback, PracticeCameraOverlay, MasteryCelebration, NextSignActions, GrownUpSettings.
- `src/lib/practiceFlow.ts` (tile state, resting, next sign, stages) and `src/lib/learnCopy.ts` (all child-facing practice text).
- `src/hooks/useReduceMotion.ts`.

## Unchanged
- The progress rules (80% confidence, 0.5 s hold, 3 passes 10 minutes apart). The SQL still decides what counts.
- `computeOverall()` and the teacher and admin views.
- No new data, packages or fonts.

## Follow-up (feedback round 1)
- **Hand landmarks:** `CameraDevice` now fits its canvas with `object-fit: cover`, the same way as the video. Before, the canvas was stretched while the video was cropped, so the skeleton was drawn off the real hand whenever the camera box wasn't 4:3. `drawHandSkeleton` now defaults to a neutral overlay (soft white bones, grey joints, no glow), and the word translator's face/pose dots are neutral grey too. This applies everywhere the overlay is used.
- **Practice size:** the desktop camera is sized from the window at 4:3, between 260 and 440 px tall. The whole practice view is one centred block, and the "How to make it" card is a fixed 240 px.
- **Long words:** the target word is sized so the longest word fits on one line and is never split ("basketba / ll").
- **Learning plan on desktop:** two columns (hello, Next up and Call on the left; tabs and signs on the right), up to 1600 px wide. The tabs sit side by side. Letter tiles grow to fill full, balanced rows (26 letters make 2 rows of 13). Closed word stages sit in two columns.
- **Practice fills the window (round 2):** the camera is now as big as the window allows while keeping 4:3, so none of the signing space is cropped. On screens 1440 px or wider, feedback and Next sign move into a third column on the right, so the camera can use the full height. "How to make it" stretches to the height of the columns beside it.
- **Balanced home layout (round 3):** on desktop the plan is now one full-width summary row of three equal-height cards (hello and progress, Next up, Call your teacher or "no class"), then the tabs centred, then the signs card. Every block shares the same left and right edges. In an open word stage the tiles are equal-width in balanced rows (10 words make 2 rows of 5), with the word on the left and the stars on the right.
- **Practice layout (round 4):** the third column is gone. The feedback now sits in one bottom row under the camera: beside the Record button for words (through the new `practiceAside` prop on `WordTranslatorScreen`), or across the full width for letters. The camera fills the right side up to 16:9, which limits how much of the 4:3 feed the crop can cut. Any width left over widens the left column (400 to 560 px). On desktop, the Next sign / Practise again / Back buttons appear in the left column under the target card.

## Live translator: Deaf-first pass
Nothing in the live translator depends on sound now, and every state is said in words on screen.
- **Camera feed:** a hand box with a label: "Put your hand in the box" → gold "Hold still…" → green "Added!". Camera loading and error states also show on the feed.
- **Recognized panel:** a status chip (No hand / Not sure / Hold still / Added). A **hold ring** around the big letter shows the commit progress right where you're looking. The dial gets a word under it ("Sure", "Almost sure", "Not sure"). One plain sentence says what to do next, including "To repeat a letter (like LL), lower your hand, then sign it again." The commit rule was invisible before.
- **Your word:** bigger tiles, the newest pops in (a visual confirmation in place of a sound), and an empty-state hint.
- **Translation side:** a placeholder instead of "—", and a 3-step guide in place of the paragraph. "Speak it aloud" shows "Translating…" / "Speaking…" so a Deaf user can see audio is playing. A new **Show to someone** button puts the word full-screen for a hearing person to read, plus a **Space** button.
- **Keyboard:** Backspace deletes, Esc clears (or closes the big view), Enter speaks.
- **Labels:** the panel's small labels went from textTertiary to textSecondary for readability. This also applies to the Words tab, which shares `TranslatorPanel`.
- **New optional `TranslatorPanel` props:** `placeholder`, `helperContent`, `speakLabel`, `speakIcon`. The Words tab doesn't use them, so it's otherwise unchanged.

## Video call screen
`src/screens/videocall/VideoCallScreen.tsx` was rebuilt in Graphite Aurora, with the same props, so the dashboards are unchanged. The original is in `originals/`.
- **Choose the model:** ASL Letters, ASL Words or FSL Words. ASL Numbers shows "soon", because `public/number-model` isn't deployed.
- **Read signs from Them / Me / Both:** each feed is read on this device by the new `src/hooks/useCallSignReader.ts`. Letters use the hand landmarker with the live translator's hold-to-add rule. Words are hands-free, using the holistic landmarker, `SignSegmenter` and the word ensemble. Nothing is sent over the network.
- **Text to speech:** a caption card per person shows their signs building up as text, a status chip, the hold ring for letters, and Speak aloud / Show big / Space / Delete / Clear. Speech uses the standing speech language ("Speak in" picker, shared with the translator). With a words model you can also turn on "Speak each new word aloud" for the other person's signs. Speaking your own signs plays on your device's speakers, for people near you.
- **Call controls:** Mute, Camera off (toggles the local tracks), Captions on/off, and a red Leave button. The peer's name, the call timer and the connection status are in the top bar.
- **Ringing and ended states:** glass cards with initials, Decline and Accept, Cancel, and "Call ended" with Back.
- **Icons:** `VideoIcon` gained an optional `off` prop, which is backward compatible. Mic, phone, phone-off and captions icons were added to `UiIcons.tsx`.
- `useSignRecognitionOverlay.ts` is no longer used by the call screen, but it was left in place.

## Practice: one screen, and hands-free words
- **Fits one screen:** words and letters practice now fit the window without scrolling (checked at 1920×870 and 1366×768). The desktop bottom strip is a fixed 120 px. Feedback uses a new `dense` style there (19 px headline, at most 2 lines of body text and a 1-line tip). The record card is 280 px wide. The target slab uses its compact size when the window is shorter than 900 px, so "How to make it" gets the remaining height.
- **Hands-free / Record button switch:** words practice now has this switch, which uses the same saved setting (`kamustasign:wordCaptureMode`) as the Words translator's Auto/Manual. Hands-free uses the translator's `mode="auto"`: the segmenter starts and stops on its own and each finished sign is checked and saved like a recorded clip. The record card turns into a status light ("Hands-free" / "Reading your sign…" / "Checking…"). The step chips become "Sign it → Keep going → Checking". The waiting text reads "Sign “bread”, then pause."
