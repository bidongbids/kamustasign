# LCSign — Manuscript Diagrams (Mermaid)

All 7 diagrams from the manuscript, reproduced as Mermaid code. Paste any block into
[mermaid.live](https://mermaid.live) to preview/export, or view directly in VS Code
(with the Mermaid preview extension) or GitHub, which render `.md` Mermaid blocks natively.

---

## 1. Conceptual Framework (IPO Model) — Chapter I, Figure 1

```mermaid
flowchart LR
    subgraph INPUT
        I1["ASL gesture data<br/>WLASL, ASL-LEX"]
        I2["Interview data<br/>DHH students, teachers"]
        I3["Live video from<br/>webcam/device camera"]
        I4["Class, assignment, and<br/>submission data<br/>(Admin, Teacher)"]
    end

    subgraph PROCESS
        P1["Hand landmark detection<br/>(MediaPipe)"]
        P2["Gesture classification<br/>(CNN / LSTM / YOLO)"]
        P3["Text/speech translation"]
        P4["Compare submission to<br/>target sign + generate feedback"]
    end

    subgraph OUTPUT
        O1["Real-time translated<br/>text and/or speech"]
        O2["Automated score +<br/>performance feedback"]
        O3["Teacher-visible<br/>assignment reports"]
        O4["Improved teacher-student<br/>communication"]
    end

    I3 --> P1 --> P2
    I1 --> P2
    I2 --> P2
    P2 --> P3 --> O1 --> O4
    I4 --> P4
    P4 --> O2 --> O4
    P4 --> O3
```

---

## 2. Agile Development Cycle — Chapter III, Figure 1

```mermaid
flowchart LR
    Requirements(["Requirements"]) -->|iterate| Design(["Design"])
    Design -->|iterate| Development(["Development"])
    Development -->|iterate| Testing(["Testing"])
    Testing -->|iterate| Deployment(["Deployment"])
    Deployment -->|iterate| Review(["Review"])
    Review -->|iterate| Requirements
```

---

## 3. System Architecture — Chapter III, Figure 2

```mermaid
flowchart TD
    subgraph Users
        Teacher1["Teacher"]
        Admin1["Admin"]
        Student1["Student"]
    end

    subgraph App["LCSign App (Expo: Web + Mobile)"]
        UI["Role-based UI<br/>Student / Teacher / Admin screens"]
        Camera["Camera Input"]
        MP["MediaPipe Hand Landmark Detector<br/>(on-device, WASM)"]
        TFJS["TensorFlow.js Sign Classifier<br/>(bundled on-device)"]
        TTS["Text-to-Speech Output"]
    end

    subgraph Supabase["Supabase (Hosted Backend)"]
        DB[("Postgres DB<br/>profiles, assignments,<br/>submissions, scores")]
        Storage[("Storage<br/>submission videos")]
        Auth["Auth<br/>Role-based accounts"]
    end

    subgraph MLPipeline["Offline ML Pipeline (Python, one-time / periodic)"]
        Dataset["Labeled Sign Dataset"]
        Extract["MediaPipe Landmark Extraction"]
        Train["Model Training<br/>(TensorFlow / Keras)"]
        Convert["TF.js Conversion"]
    end

    Teacher1 --> UI
    Admin1 --> UI
    Student1 --> UI

    UI --> Camera --> MP --> TFJS --> TTS
    UI <--> DB
    UI <--> Storage
    UI <--> Auth

    Dataset --> Extract --> Train --> Convert
    Convert -.->|"deployed model<br/>bundled into app"| TFJS
```

---

## 4. Context Diagram — Chapter III, Figure 3

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 70, 'rankSpacing': 110, 'curve': 'basis'}}}%%
flowchart TD
    System[["LCSign (0)"]]
    Student(["Student"])
    Teacher(["Teacher"])
    Admin(["Admin"])

    System <-->|"camera feed, assignment submissions /<br/>live translation, assignment feedback"| Student
    System <-->|"assignments, grading actions /<br/>submissions, auto-scores, gradebook"| Teacher
    System <-->|"class/account management /<br/>user & class records"| Admin
```

Changed from 6 separate curved edges (one each direction per entity) to 3 combined
bidirectional edges with merged labels, and switched to top-down layout. This is what
caused the crowding in the original — three pairs of arrows all converging on the same
central node forced Mermaid to bend them around each other. One line per entity removes
the crossings entirely.

---

## 5. Data Flow Diagram (Level 1) — Chapter III, Figure 4

```mermaid
flowchart LR
    Student(["Student"])
    Teacher(["Teacher"])
    P1["1.0<br/>Capture & Detect<br/>Hand Landmarks"]
    P2["2.0<br/>Classify Sign<br/>(on-device model)"]
    P3["3.0<br/>Output Text /<br/>Speech"]
    P4["4.0<br/>Manage Assignment<br/>& Submission"]
    P5["5.0<br/>Auto-Score<br/>Submission"]
    D1[("D1 Trained Model<br/>(bundled)")]
    D2[("D2 Assignments /<br/>Submissions (Supabase)")]
    D3[("D3 Scores /<br/>Gradebook (Supabase)")]

    Student -->|"camera frames"| P1
    P1 -->|"21 landmarks (x,y,z)"| P2
    P2 -->|"predicted class"| P3
    P3 -->|"translated text / speech"| Student

    D1 -->|"model weights"| P2
    D1 -->|"model weights"| P5

    Student -->|"recorded submission"| P4
    P4 --> D2
    D2 -->|"submission + target"| P5
    P5 -->|"score"| D3
    D3 -->|"gradebook view"| Teacher
    Teacher -->|"assignment (target sign)"| P4
```

---

## 6. Functional Decomposition — Chapter III, Figure 5

```mermaid
flowchart TD
    Root["LCSign"]

    Root --> Auth["Authentication &<br/>Role Management"]
    Root --> RT["Real-Time<br/>Translator"]
    Root --> CM["Classroom Module"]
    Root --> AP["Admin Panel"]

    Auth --> A1["Login / Sign Up"]
    Auth --> A2["Role Routing<br/>(Student/Teacher/Admin)"]

    RT --> R1["Hand Landmark Detection"]
    RT --> R2["Sign Classification"]
    RT --> R3["Text / Speech Output"]

    CM --> C1["Post Assignment"]
    CM --> C2["Submit Recording"]
    CM --> C3["Auto-Score"]
    CM --> C4["Gradebook"]

    AP --> P1["Manage Accounts"]
    AP --> P2["Manage Classes"]
```

---

## 7. Entity Relationship Diagram — Chapter III, Figure 6

```mermaid
erDiagram
    CLASSES ||--o{ PROFILES : "members"
    CLASSES ||--o{ ASSIGNMENTS : "has"
    PROFILES ||--o{ ASSIGNMENTS : "posts (teacher)"
    PROFILES ||--o{ SUBMISSIONS : "submits (student)"
    ASSIGNMENTS ||--o{ SUBMISSIONS : "receives"
    SUBMISSIONS ||--|| SCORES : "produces"

    CLASSES {
        uuid id PK
        string name
        uuid teacher_id FK
    }
    PROFILES {
        uuid id PK "FK to auth.users"
        string full_name
        string role "student/teacher/admin"
        uuid class_id FK
    }
    ASSIGNMENTS {
        uuid id PK
        uuid teacher_id FK
        uuid class_id FK
        string target_sign
        date due_date
    }
    SUBMISSIONS {
        uuid id PK
        uuid assignment_id FK
        uuid student_id FK
        string video_url "Storage"
        timestamp submitted_at
    }
    SCORES {
        uuid id PK
        uuid submission_id FK
        string predicted_sign
        boolean is_correct
        float confidence
    }
```

---

**Note:** Diagrams 1–6 use flowchart syntax to approximate the original Graphviz-style
figures (rounded boxes, subgraphs). Diagram 7 uses Mermaid's native `erDiagram` syntax,
which is the more standard way to express that schema and will render with proper
crow's-foot notation.
