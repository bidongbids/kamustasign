# Handoff: redraw the LCSign data flow diagrams with 90° lines

**For:** Claude Design
**From:** the LCSign team (BSIT capstone, Liloan Central School)
**What to make:** new versions of the five data flow diagrams (DFDs) in our manuscript, Figures 9–13. The content stays exactly the same. Only the drawing changes: **every line that connects two shapes must be made of straight horizontal and vertical pieces that meet at 90° corners.** No curves and no diagonal lines.

The current versions are in `reference/` so you can see what each figure looks like now. They use curved arrows, and that is the part to replace.

---

## 1. What does not change

- **Wording.** Every shape name and every arrow label must be copied **exactly** from the tables in Section 5, including capital letters, symbols (`/`, `&`, `+`) and where the line breaks fall. The diagrams have to match the paragraphs in the manuscript word for word. A few labels describe the original design, for example "Translate via Google API". Keep them as they are; do not "correct" them.
- **The set of shapes and arrows.** Use the same shapes and the same arrows, with each arrow pointing the same way. Do not add, merge or remove anything.
- **Notation (Yourdon/DeMarco style):**
  - **Process** = circle. The first line is the process number in **bold** (`1.0`, `2.0` …; the context diagram uses `0`), and the name sits below it in regular weight.
  - **External entity** (Student, Teacher, Admin) = rectangle with square corners and a **bold** name.
  - **Data store** = two parallel horizontal lines, **open at both ends** (no side lines). Inside: the store ID in **bold**, two spaces, then the name in regular weight, e.g. **D1**  Trained Model.
  - **Data flow** = a line with one filled triangular arrowhead at the receiving end, and an *italic* label.
- **Look:** black on white only. No colour, shading, shadows, gradients, rounded corners or icons. Font: **Arial** throughout.
- **No title, figure number or caption inside the image.** Word adds "Figure N" and the title above each picture (APA style).

## 2. The new rule: 90° lines

1. Every flow line is a chain of horizontal and vertical segments. Corners are exactly 90° and sharp, not rounded.
2. Use as few corners as possible: **0 or 1** is best, **2** is fine, **3** only if there is no other way.
3. **No line crosses another line.** Every figure can be drawn without crossings (see the suggested layouts in Section 5). If one truly can't be avoided, the two lines cross at a right angle and neither changes direction at the crossing.
4. Lines never pass through a shape or a label, and never run on top of or along another line.
5. When two flows go between the same two shapes in opposite directions (for example Admin → 9.0 and 9.0 → Admin), draw them as **two separate parallel lines**, at least 0.15 in apart at print size, each with its own arrowhead and label. Never draw one line with an arrowhead at both ends.
6. **Meeting a circle:** the last segment arrives straight on, horizontally or vertically. Where possible, use the circle's top, bottom, left and right points. When more than one line meets the same side, spread them out evenly with at least 0.15 in between, and end each one exactly on the circle's outline.
7. **Meeting a rectangle:** the line ends square to the edge, at least 0.1 in from any corner.
8. **Meeting a data store:** the line ends on the store's top or bottom line, or at one of its open ends, halfway between the two lines.
9. Arrowheads touch the outline of the receiving shape: no gap and no overlap.
10. All lines in a figure use the same thickness. All arrowheads are the same size.

## 3. Labels

- Each label is *italic*, horizontal (never rotated), and keeps the line breaks given in Section 5.
- Place each label beside the **longest straight segment** of its own line, about 0.05–0.1 in away from it. Never put a label on a corner or where it could belong to two lines.
- A label must not touch any line, shape or other label. A thin white halo behind the text is fine.
- Labels of parallel flow pairs go on the outer sides of the pair (one above and one below, or one left and one right) so that each label is clearly next to its own line.

## 4. Size and files

- **Printed width:** 6.0 in exactly, to fit Letter paper with 1-in margins and leave a little room. **Height:** no more than 4.5 in, so the figure, its caption and the start of its paragraph fit on one page. A shorter figure is better.
- **Text size at the printed 6.0-in width:** shape text 9 pt; flow labels 8 pt (never smaller than 8 pt, the APA minimum).
- **Lines:** about 0.9 pt. Arrowheads are about 5 pt long.
- **Spacing:** keep at least 0.1 in of white space between any two items, and about 0.1 in of white margin around the whole drawing.
- Within one figure, all process circles are the same size, just big enough for the longest name. The `0` circle in Figure 9 may be bigger. All entity rectangles in a figure are the same size.
- **Deliver per figure:** one **SVG** and one **PNG**. Each PNG is 1800 px wide (300 dpi at 6.0 in) on a solid white background, not transparent. Use these file names, so they can drop straight into the manuscript:

| Figure | File name (without extension) |
|---|---|
| 9 | `Figure09_Context_Diagram` |
| 10 | `Figure10_DFD_Real-Time_Translation` |
| 11 | `Figure11_DFD_Classroom_Module` |
| 12 | `Figure12_DFD_Video_Chat` |
| 13 | `Figure13_DFD_Account_and_Class_Management` |

## 5. The five figures

In the tables below, `/` inside a name is a real slash, and a line break is shown as **⏎**. In the suggested layouts, `(n.0)` is a process, `[Name]` is an entity, `==Dn==` is a data store, and `<=>` is a pair of parallel lines (one in each direction). The layouts are suggestions that make 90° routing easy without crossings. You may improve on them, as long as every rule in Sections 1–4 still holds.

### Figure 9: Context Diagram

*What it shows:* the whole system as one process, with its three users.

**Shapes**

| ID | Kind | Text |
|---|---|---|
| 0 | process | **0** ⏎ LCSign Real-Time ⏎ Sign Language ⏎ Interpretation ⏎ System |
| Student | entity | Student |
| Teacher | entity | Teacher |
| Admin | entity | Admin |

**Flows**

| From | To | Label |
|---|---|---|
| Student | 0 | Live camera feed, ⏎ assignment submissions |
| 0 | Student | Real-time translation output, ⏎ assignment feedback |
| Teacher | 0 | Assignments, ⏎ grading actions |
| 0 | Teacher | Submissions, auto-generated ⏎ scores, gradebook view |
| Admin | 0 | Account & class ⏎ management actions |
| 0 | Admin | User & class ⏎ records |

**Suggested layout:** all six lines are straight, with no corners.

```
[Student]  <=>  ( 0 )  <=>  [Teacher]
                  ||
               [Admin]
```

Student and Teacher sit level with the circle's centre, with the pair of lines entering the circle's left and right sides. Admin sits below, and its pair is vertical.

### Figure 10: Data Flow Diagram — Real-Time Translation (Processes 1.0–4.0)

*What it shows:* the camera picture goes in, the sign is recognised and translated, and text or speech comes back out.

**Shapes**

| ID | Kind | Text |
|---|---|---|
| Student | entity | Student |
| 1.0 | process | **1.0** ⏎ Extract Hand ⏎ Landmarks |
| 2.0 | process | **2.0** ⏎ Classify ⏎ Gesture ⏎ (ASL/FSL) |
| 3.0 | process | **3.0** ⏎ Translate via ⏎ Google API |
| 4.0 | process | **4.0** ⏎ Render Text/ ⏎ Speech Output |
| D1 | data store | **D1**  Trained Model |

**Flows**

| From | To | Label |
|---|---|---|
| Student | 1.0 | Camera frames |
| 1.0 | 2.0 | 21 landmarks ⏎ (x, y, z) |
| D1 | 2.0 | Model weights |
| 2.0 | 3.0 | Predicted sign ⏎ + confidence |
| 3.0 | 4.0 | Translated text, ⏎ reader's language |
| 4.0 | Student | Text/speech in the reader's preferred language |

**Suggested layout:** a staircase that goes up and down from left to right.

```
              (1.0)               (3.0)
[Student]               (2.0)               (4.0)
                        ==D1==
  <--------- return line from 4.0 runs along the bottom ---------
```

- Student → 1.0: up from Student's top, then right into 1.0's left side (1 corner).
- 1.0 → 2.0: right from 1.0, then down into 2.0's top (1 corner).
- D1 → 2.0: straight up into 2.0's bottom.
- 2.0 → 3.0: right from 2.0, then up into 3.0's bottom (1 corner).
- 3.0 → 4.0: right from 3.0, then down into 4.0's top (1 corner).
- 4.0 → Student: down from 4.0, left under D1, then up into Student's bottom (2 corners). Its label goes under the long bottom segment.

### Figure 11: Data Flow Diagram — Classroom Module (Processes 5.0–6.0)

*What it shows:* a teacher posts an assignment, a student submits a recording, and the system scores it and keeps the gradebook. This is the busiest figure: process 6.0 has seven lines.

**Shapes**

| ID | Kind | Text |
|---|---|---|
| Student | entity | Student |
| Teacher | entity | Teacher |
| 5.0 | process | **5.0** ⏎ Post/Store ⏎ Assignment & ⏎ Submission |
| 6.0 | process | **6.0** ⏎ Score ⏎ Submission |
| D1 | data store | **D1**  Trained Model |
| D2 | data store | **D2**  Assignments/Submissions |
| D3 | data store | **D3**  Scores/Gradebook |

**Flows**

| From | To | Label |
|---|---|---|
| Student | 5.0 | Recorded ⏎ submission |
| Teacher | 5.0 | Assignment (target sign) |
| 5.0 | D2 | Assignment + ⏎ submission |
| D2 | 6.0 | Submission video |
| Teacher | 6.0 | Grading actions ⏎ (score override) |
| 6.0 | Teacher | Submissions, scores, ⏎ gradebook view |
| D1 | 6.0 | Model weights |
| 6.0 | D3 | Score |
| D3 | 6.0 | Gradebook ⏎ records |
| 6.0 | Student | Score + feedback |

**Suggested layout**

```
        ........ Teacher → 5.0 runs along the very top ........
                         ==D2==
[Student] -->  (5.0)                    (6.0)   <=>   [Teacher]
                          ==D1==          ||
                                        ==D3==
        ....... 6.0 → Student runs along the very bottom ......
```

- Student → 5.0: one straight horizontal line.
- Teacher → 5.0: up from Teacher's top, left above D2, then down into 5.0's top (2 corners).
- 5.0 → D2: right from 5.0's upper right, then up into the left part of D2's bottom line (1 corner).
- D2 → 6.0: down from the right part of D2's bottom line, then right into 6.0's upper left, or straight down into 6.0's top (0–1 corners).
- Teacher ↔ 6.0: a pair of parallel horizontal lines.
- D1 → 6.0: right from D1's right end, then up into 6.0's bottom left (1 corner).
- 6.0 ↔ D3: a pair of parallel vertical lines.
- 6.0 → Student: down from 6.0's bottom, between D1 and D3. Then it runs left along the very bottom, under D1, and up into Student's bottom (2 corners).

### Figure 12: Data Flow Diagram — Video Chat (Processes 7.0–8.0)

*What it shows:* the call is set up through a short-lived signalling channel, then the video flows directly between the two computers and is captioned on each one.

**Shapes**

| ID | Kind | Text |
|---|---|---|
| Student | entity | Student |
| Teacher | entity | Teacher |
| 7.0 | process | **7.0** ⏎ Establish ⏎ Call |
| 8.0 | process | **8.0** ⏎ Stream Video ⏎ and Translate ⏎ Overlay |
| D1 | data store | **D1**  Trained Model |
| D4 | data store | **D4**  Temporary Realtime Signaling Channel |

**Flows**

| From | To | Label |
|---|---|---|
| D1 | 8.0 | Model weights |
| Student | 8.0 | Live video/audio ⏎ (WebRTC) |
| 8.0 | Student | Peer video + ⏎ translated overlay |
| Teacher | 8.0 | Live video/audio ⏎ (WebRTC) |
| 8.0 | Teacher | Peer video + ⏎ translated overlay |
| Student | 7.0 | Call request / ⏎ accept or decline |
| Teacher | 7.0 | Call request / ⏎ accept or decline |
| 7.0 | 8.0 | Connection ⏎ details |
| 7.0 | D4 | Offer, answer, ⏎ ICE candidates |
| D4 | 7.0 | Peer's offer, answer, ⏎ ICE candidates |

**Suggested layout:** symmetrical, with Student on the left and Teacher mirrored on the right.

```
                     ==D1==
                       |
                     (8.0)
[Student]              |              [Teacher]
                     (7.0)
                       ||
                ======D4======
```

- D1 → 8.0 and 7.0 → 8.0: straight vertical lines.
- Student → 8.0: up from the left part of Student's top, then right into 8.0's left side, upper (1 corner).
- 8.0 → Student: left from 8.0's left side, lower, then down into the right part of Student's top (1 corner). This L sits inside the first one, so they don't cross.
- Student → 7.0: down from Student's bottom, then right into 7.0's left side (1 corner).
- Teacher: the same three lines, mirrored.
- 7.0 ↔ D4: a pair of parallel vertical lines.

### Figure 13: Data Flow Diagram — Account and Class Management (Processes 9.0–10.0)

*What it shows:* the Admin manages accounts and classes, and both are saved in the database.

**Shapes**

| ID | Kind | Text |
|---|---|---|
| Admin | entity | Admin |
| 9.0 | process | **9.0** ⏎ Manage ⏎ Accounts |
| 10.0 | process | **10.0** ⏎ Manage ⏎ Classes |
| D5 | data store | **D5**  Profiles |
| D6 | data store | **D6**  Classes |

**Flows**

| From | To | Label |
|---|---|---|
| Admin | 9.0 | Account ⏎ management actions |
| 9.0 | Admin | User records |
| Admin | 10.0 | Class ⏎ management actions |
| 10.0 | Admin | Class records |
| 9.0 | D5 | New or updated ⏎ profile |
| D5 | 9.0 | Profile records |
| 10.0 | D6 | New or updated class |
| D6 | 10.0 | Class records |
| 10.0 | D5 | Class membership ⏎ (students, teacher) |

**Suggested layout**

```
             (9.0)          ==D5==
[Admin]
             (10.0)         ==D6==
```

- Admin ↔ 9.0: two parallel lines that go up from Admin's top, then right into 9.0's left side (1 corner each, one L inside the other).
- Admin ↔ 10.0: the same, going down from Admin's bottom.
- 9.0 → D5: one straight horizontal line into D5's left end.
- D5 → 9.0: down from the left part of D5's bottom line, then left into 9.0's right side, lower (1 corner).
- 10.0 → D6 and D6 → 10.0: the same pattern as 9.0 and D5.
- 10.0 → D5: up from 10.0's top right, right to the right part of D5, then up into D5's bottom line (2 corners). Its horizontal run sits below the D5 → 9.0 line and above D6, so nothing crosses.

## 6. Check before handing back

- [ ] Every line has only horizontal and vertical segments, with sharp 90° corners.
- [ ] There are no crossings, and no line passes through a shape or a label.
- [ ] Every shape name and label matches Section 5 exactly, line breaks included.
- [ ] The arrow counts are 6 / 6 / 10 / 10 / 9 for Figures 9 / 10 / 11 / 12 / 13, and every arrow points the right way.
- [ ] Every opposite pair is drawn as two parallel lines.
- [ ] Data stores are open at both ends, and entities have square corners.
- [ ] Each figure is 6.0 in wide and no more than 4.5 in tall, with labels ≥ 8 pt at that size.
- [ ] Black and white only, Arial, no title inside the image.
- [ ] You have one SVG and one 1800-px-wide white-background PNG per figure, named as in Section 4.
