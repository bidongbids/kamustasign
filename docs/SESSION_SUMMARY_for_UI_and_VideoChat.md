# LCSign / KamustaSign — Session Summary (for UI + Video Chat build)

This file summarizes a prior chat session so a new chat can pick up work on **building the app UI and the video chat feature**. It does not contain application code — the actual codebase lives in the `kamustasign` project folder and should be explored directly in the new session.

## 1. Project in one paragraph

KamustaSign (branded in-app as **LCSign**) is a Bachelor of Science in Information Technology capstone project: an AI-based, real-time American Sign Language (ASL) interpretation system for **Liloan Central School** (Liloan, Bonifacio, Misamis Occidental, Philippines). It translates ASL hand gestures into text/speech in real time via a standard webcam, and includes a classroom module where teachers post sign-language assignments, students submit recorded performances, and the system auto-scores them using the same recognition engine. The proponents are Origenes, Cirilo Ivan; Labrague, Paul Simon; and Llanda, Ryan Jay E., advised by Dhen Marc A. Ginos, MIT.

## 2. Confirmed tech stack

- **Recognition pipeline (on-device):** MediaPipe (hand-landmark detection, 21 points × x/y/z = 63 values per sample) → TensorFlow.js model (converted from a Keras model) → classification.
- **Model architecture (from `ml/scripts/train_classifier.py`):** `Input(63) → Dense(128, ReLU) → Dropout(0.3) → Dense(64, ReLU) → Dropout(0.2) → Dense(num_classes, softmax)`, Adam optimizer, `sparse_categorical_crossentropy` loss, 40 epochs, batch size 32.
- **Data split:** scikit-learn `train_test_split(test_size=0.3, random_state=42, stratify=y)`, then the 30% temp set split 50/50 again → final **70/15/15 train/val/test**. Labels via `LabelEncoder`. Evaluated with Keras `model.evaluate()` (`test_loss`, `test_acc`).
- **App framework:** Expo (React Native 0.85, Expo SDK 56), React 19.2, TypeScript. Single codebase → web/desktop build + native Android build.
- **Backend:** Supabase — Auth (role-based: student/teacher/admin), Postgres DB (profiles, classes, assignments, submissions, scores), Storage (submission videos), Row Level Security policies. **Supabase Realtime** is the planned signaling channel for video chat (see below).
- **Web-side MediaPipe:** `@mediapipe/tasks-vision` (WASM build) for client-side landmark detection in the browser build.
- **ML tooling:** Python 3.11, MediaPipe 0.10.35, TensorFlow 2.21.0 / Keras 3, OpenCV 4.11, scikit-learn 1.5.2, TensorFlow.js 4.22.0.
- **Existing screens confirmed via screenshots:** Role Select screen (Student / Teacher / Admin / Translator entry cards) and a "Live Translator (Web Test)" screen showing camera feed + hand landmark overlay + "Detected sign" + confidence %.

## 3. What this session actually did

The bulk of this session was **revising the capstone manuscript** (Word document, not code), in two passes:

### Pass 1 — 12 reviewer notes
Reframed the problem statement around feature benefits; merged two specific objectives and named MediaPipe/YOLO/ISO 25010; merged Foreign/Local Literature into one section with literature-vs-study terminology fixed; added "Relation to KamustaSign" comparisons to NVIDIA Signs and KamAI; replaced Agile methodology with a **Design, Development, and Evaluation (DDE)** cycle; added a "current technical situation" before/after visual; fixed garbled Student/Teacher/Admin module labels in functional requirements; redrew the System Architecture diagram with icons; split the Data Flow Diagram into per-function diagrams and added a UML Use Case Diagram; documented the exact train/val/test method and accuracy formula; and re-aligned the Beta Testing Evaluation Form to the specific objectives.

### Pass 2 — added the video chat feature to the manuscript
The user asked to add a **peer-to-peer video chat with live sign-language translation overlay** feature. This is the part most relevant to the next chat's UI/build work. Design decided during this session:

- **Transport:** WebRTC for a **direct peer-to-peer** audio/video connection between two devices (no video/audio routed through a server).
- **Signaling only:** Supabase Realtime is used *solely* to exchange the WebRTC connection setup messages — SDP offer, SDP answer, and ICE candidates — before the P2P link takes over. No new persistent database tables are needed; the signaling channel is ephemeral (exists only for the few seconds it takes to connect a call).
- **Translation overlay:** Each device runs its **own local copy** of the existing MediaPipe + TensorFlow.js recognition pipeline, applied to **two video streams**: (1) the device's own camera feed, and (2) the incoming peer video feed received over WebRTC. Each side independently translates whatever signing it sees and renders the result as an on-screen overlay caption — translation is never computed server-side or sent over the network.
- **Who can use it:** Both the **Student** and **Teacher** roles can start or join a video chat with each other (shared use case — modeled like "Log In / Sign Up" being shared across all three roles, but Video Chat is specifically a Student↔Teacher feature, not Admin-facing).
- **Suggested flow (from the DFD built for this):**
  1. Process 6.0 "Establish Call (Signaling)" — caller sends a call request (callee id) via Supabase Realtime; callee responds accept/decline; offer/answer/ICE candidates are relayed through the Realtime channel (referred to as **D4 Realtime Channel** in the diagram, ephemeral).
  2. Once connected, control moves to Process 7.0 "Stream Video & Translate Overlay (P2P)" — direct WebRTC video/audio flows both ways; each device reuses the bundled model (**D1 Trained Model**) to translate the incoming stream and overlay captions.
- **Non-functional notes carried into the manuscript:** call quality is subject to normal P2P/network constraints; latency for call setup and a "signaling success rate" metric were added as things to actually measure during testing (mirrors how model accuracy is measured — see accuracy formula below).
- **Testing formulas already defined** (for consistency if you build instrumentation): `Accuracy = (Correct Predictions ÷ Total Predictions) × 100%`; Likert weighted mean `= Σ(f × w) ÷ N`.

**Earlier in this session (before manuscript work), the user separately asked "is it possible to add a videochat with sign language?"** — the conversational answer (which the design above formalizes) was: use WebRTC + reuse the existing on-device MediaPipe/TensorFlow.js pipeline pointed at the remote peer's `<video>` element, and use Supabase Realtime for signaling since Supabase is already the backend. That original suggestion is exactly what got built out into the manuscript design above.

## 4. Deliverable produced this session

- **`LCSign_Manuscript_Revised.docx`** — saved in the `kamustasign` project folder. Full revised Chapters I–III (Introduction, Review of Related Literature, Methodology), 14 figures, 5 tables, including all diagrams described above (System Architecture with a Video Chat Module box, a dedicated Video Chat Data Flow Diagram, an updated Use Case Diagram, updated Functional Decomposition). This is documentation/proposal content, not application code.
- Diagram source scripts (matplotlib-based, custom icon library) and intermediate images were built in a temporary sandbox (`/tmp/diagrams`, `/tmp/manuscript_build`) that **does not persist** between sessions — if diagrams need to be regenerated or restyled later, they'll need to be rebuilt from scratch (the visual style: teal `#1D6F66` / marigold `#C97F17` palette, custom vector icons for camera/gear/brain/cloud/database/lock/folder/person/speaker/check/book/phone, is documented here for reference but the code itself is gone).

## 5. What the next chat should do

The next chat's job is to **actually build**, in the real `kamustasign` codebase:
1. The video chat UI (call initiation, incoming call UI, in-call screen with both video feeds + overlay captions) for both Student and Teacher roles.
2. The WebRTC integration (peer connection setup, media stream handling) — likely `react-native-webrtc` for native + browser-native WebRTC APIs for the web build, matching the existing dual Expo web/native target.
3. Supabase Realtime signaling (exchanging offer/answer/ICE candidates via a Realtime channel keyed by a call/room id).
4. Wiring the existing on-device MediaPipe + TF.js classifier to run against the incoming peer `<video>` element/stream, not just the local camera, and rendering translated captions as an overlay on both feeds.

Recommend starting the new chat by exploring the current state of the `kamustasign` codebase (folder structure, existing navigation/screens, how the existing Real-Time Translator screen wires MediaPipe → TF.js today) before writing new code, since this summary describes the *plan* agreed on in the manuscript, not the current app code.
