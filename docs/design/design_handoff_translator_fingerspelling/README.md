# Handoff: LCSign Translator — Fingerspelling redesign

**For:** Claude Code, working in the LCSign repo.

**Screen:** `TranslatorHubScreen` → `LiveTranslatorScreen` (Fingerspelling tab), desktop and phone. It uses the theme from `design_handoff_classroom_theming/` (light/dark + 4 schemes, `useTheme()`), so build that first or alongside.

**Mockups:** `LCSign Translator Fingerspelling Mockups.html` (open in Chrome).

| Frame | What it shows |
|---|---|
| F1 | Signing a word, dark |
| F2 | First use / no hand, light |
| F3 | Settings popover |
| F4 | Status states, camera loading / blocked |
| F5 | Show to someone |
| F6 | 1366×768 |
| F7 | Phone + Settings sheet |

**Constraints:** RN `StyleSheet` only. Baloo2 700/600 and Inter 400/500/600 only. Spacing and radii scales as before. The camera `<video>` + landmark canvas must keep exactly the same box and cover transform. The video element must not remount when the layout changes.

## 1. What was wrong

- **The camera was the smallest element** (~540px wide) inside a big panel with empty space above it.
- **Three equal columns competed for attention:** recognised letter, confidence dial, translation.
- **"No hand" appeared three times:** the chip, the dial label and the status line.
- **One moment, three gauges:** the letter tile, the confidence dial and a separate "Hold progress 0/450 ms" bar.
- **Tips took the space where the word should be.** "Your word" and "Translation" duplicated each other.
- **Engineering controls were always on screen:** commit speed in ms, hold meter, "affects accuracy". They sat in a permanent bottom bar.
- **Two rows of tabs** split in a confusing way (Fingerspelling/Words/Signer on top, then ASL/FSL + Letters/Numbers), and a small icon-only Back button. Now: ASL/FSL on top, then Letters · Numbers · Words in one row.

## 2. New layout (desktop ≥ 1100, F1)

1. **Header (68):**
   - **Back** pill: the shared `BackButton` from the theming handoff
   - "Translator" (h2)
   - centred **ASL | FSL** tabs (`SegmentedToggle` lg, 44px): the top-level choice. **Signer is removed** from this screen.
   - right: **Speak in {language} ▾** (`LanguagePicker`), Appearance, and **?** (how it works)
2. **Second row (72):**
   - **Letters · Numbers · Words** in one row on the left (`SegmentedToggle`, `role="tablist"`). Letters and Numbers are fingerspelling; Words opens the word translator (record → stop → top matches) in the same frame.
   - right: **Signing hand** compact toggle (Left/Right, Left first, 36px, with hand icons; the Left icon is mirrored; Right stays the default), stays visible because it affects accuracy
   - **Settings** button
3. **Camera (left, flex 1, full height):**
   - The material-pass housing slimmed to a 10px bezel; the top/bottom shelves and vents are removed.
   - The video fills the bezel at radius 16 with `objectFit: cover`. `minWidth: 0` on this column.
   - Overlays (absolutely positioned siblings; they don't change the video box):
     - status chip top-left: "Hand found" with a green dot / "No hand · put it in the box" with an outline dot
     - fps chip top-right (optional, F3)
     - guide box: dashed white when there's no hand, solid `success` when there's a hand inside
     - the existing landmark dots
4. **Right column (548):**
   - **Now signing** card:
     - a 150px **hold ring** with the recognised letter inside. The ring *is* the hold progress, and it replaces both the separate letter tile and the hold meter. Empty with "?" when there's no letter, gold while filling, green + full when added.
     - beside it: the meta label, the existing status sentence (h-size Baloo 22), the existing hint line, and confidence as a `ProgressBar` + "92% · Sure" (`Sure` ≥ 80, `Almost sure` ≥ commit threshold, `Not sure`). This replaces the confidence dial.
   - **Your word** card:
     - the word at 56px Baloo with an accent caret
     - "{n} letters · {language}"
     - a line saying it will be spoken in {language}. The separate Translation column is removed, because for fingerspelling the word is the output.
     - Actions: **Speak it aloud** (accent, 52, flex) + **Show to someone** (neu, 52)
     - then **Space · Delete letter · Clear word** (ghost, labelled), then the keyboard hint
   - **Empty word (F2):** the three existing tips render *inside* the card, in place of the word, and disappear after the first letter. Speak is disabled (45% opacity, `accessibilityState.disabled`, hint "Spell a word first").

**1366×768 (F6):** ring 118, word 44px, gaps 12–16. No scrolling. Below 1100 wide, the phone stack is used with wider gutters.

## 3. Settings and help (F3)

`TranslatorSettings` popover (RN `Modal`; bottom sheet on phone). Saved on the device.
- **How long to hold a letter:** Fast 0.3 s · Balanced 0.45 s · Careful 0.7 s. These are the existing commit-speed presets with plain names. If your actual values differ, use your real values. The helper line explains when to change it.
- **Signing hand:** Left / Right (Left first; Right is the default), with the reason "The reader was trained on right hands. Left flips the picture for you."
- **Show on the camera:** Hand points (on by default) and Speed (fps; off by default). Both are display only.

The **?** button opens the three tips + the keyboard keys in the same popover style.

## 4. States (F4)

| State | Ring | Status (existing strings) | Confidence |
|---|---|---|---|
| No hand | empty, "?" | Show your hand to the camera. / Keep it inside the box. | "No hand", empty bar |
| Not sure | empty, "?" | Not sure yet. / Make the handshape clearer and hold it still. | bar + "Not sure" |
| Holding | gold, filling | Hold still… adding “B” / To repeat it, lower your hand first. | bar + "92% · Sure" |
| Added | green, full | Added “B”. / Lower your hand, then sign the next letter. | — |
| Camera loading | — | Overlay on the video only: "Getting the camera ready…" + "Loading the hand reader · first time takes a few seconds" | — |
| Camera blocked | — | Overlay on the video only: "The camera is blocked" / "Allow the camera in the browser's address bar, then try again." + **Try again** | — |

- **Ring fill:** the ring is the existing hold timer (`holdMs / commitMs`), drawn with `react-native-svg` (`strokeDasharray`). At 0 it draws no arc.
- **Reduced motion:** the ring moves in 25% steps instead of animating smoothly.
- **Throttling:** status and confidence update at most 10×/s (the reader runs at ~30 fps).

## 5. Show to someone (F5)

The existing full-screen view, themed. It shows "{name} signed" if there's a signed-in user (otherwise nothing), the word as large as fits (max 180px), the translation line if the speech language translates it, and **Speak it aloud** + **Close**. Tap anywhere or Esc still closes.

## 6. Phone (F7, < 768)

- **Header:** Back icon, "Translator", Settings icon, Appearance icon. **ASL | FSL** goes full width below the header, then **Letters · Numbers · Words** full width directly under it.
- **Camera:** full width, 300 tall, same overlays.
- **Below the camera:** a compact Now signing row (92px ring + status + confidence), then the word card (36px).
- **Fixed bottom bar (safe-area padded):** **Speak** (accent, flex), Show to someone, Space, Delete letter, all 52px. **Clear word**, signing hand and hold time live in the Settings sheet.
- **Orientation:** portrait only.

## 7. Component change list (RN)

| Component | Change |
|---|---|
| `TranslatorHubScreen` | Header with `BackButton`, centred **ASL \| FSL**, `LanguagePicker`, Appearance, help. The second row is one **Letters · Numbers · Words** toggle. Letters/Numbers mount `LiveTranslatorScreen`; Words mounts `WordTranslatorScreen` (one screen at a time, as today). The **Signer** tab is removed from the hub. Keep `SignerScreen` in the codebase and decide separately whether to reach it from elsewhere. |
| `LiveTranslatorScreen` | New two-column layout (camera / right column). Remove the bottom control strip (signing hand, commit speed, hold meter). Desktop no longer uses the fixed 1600×706 `TranslatorPanel` composition for this screen. |
| `CameraDevice` | `variant="slim"`: 10px bezel, no shelves. Status chip + fps chip as overlay props. `guideState: 'idle' \| 'hand'`. Loading / blocked overlays inside the bezel. |
| `HoldRing` (new) | `progress 0–1`, `glyph`, `size`, `tone: 'idle' \| 'holding' \| 'added'`. SVG ring + raised centre disc. Static steps with reduced motion. |
| `ConfidenceDial` | Not used on this screen. It's replaced by a `ProgressBar` + label. Keep the component for other screens if they still use it. |
| `HoldDurationControl` | Moves into `TranslatorSettings`, relabelled "How long to hold a letter". |
| `HandednessPicker` | `size="compact"` for the second row. The full size goes in Settings. |
| `TranslatorSettings`, `TranslatorHelp` (new) | Popover / sheet (§3). |
| `WordCard` (new or extracted) | Word, empty-state tips, actions (§2.4). |
| Practice mode (`variant="practice"`) | Keeps working: it hides Settings/help and the Your word card and shows the practice target instead. The camera + Now signing card stay the same. |

## 8. Copy (new or changed)

| Key | Text | Was |
|---|---|---|
| chip.hand | Hand found | — |
| chip.noHand | No hand · put it in the box | No hand / Put your hand in the box |
| tabs.language | ASL · FSL | (second row) |
| tabs.what | Letters · Numbers · Words | Fingerspelling · Words · Signer + Letters · Numbers |
| now.title | Now signing | Recognized |
| word.title | Your word | Your word / Translation |
| word.meta | {n} letters · {language} | {n} letters / {language} · ready |
| word.speakHint | Will be spoken in {language} · finish the word, then press Speak | Spell a word with your hand. It shows up here. |
| word.empty | Spell a word with your hand. | Your word builds here, one letter at a time. |
| action.delete | Delete letter | (icon only) |
| action.clear | Clear word | Clear |
| settings.hold | How long to hold a letter · Fast · Balanced · Careful | Commit speed · 450ms hold |
| settings.hold.help | Letters added by mistake? Choose Careful. Signing fast? Choose Fast. | — |
| settings.hand.help | The reader was trained on right hands. Left flips the picture for you. | affects accuracy |
| settings.points | Hand points | — |
| settings.fps | Speed (fps) | 28 FPS · MODEL READY |
| cam.loading | Getting the camera ready… · Loading the hand reader · first time takes a few seconds | Getting the camera ready… |
| cam.blocked | The camera is blocked · Allow the camera in the browser's address bar, then try again. · Try again | The camera isn't working. |

Kept as they are: all status sentences, the three tips, "Speak it aloud", "Show to someone", "Space", and the keyboard hint.
