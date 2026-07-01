"""
Week 1 milestone: webcam -> MediaPipe hand landmark extraction.

What this does:
  1. Downloads the MediaPipe hand landmark model (one-time, ~7MB) if not present.
  2. Opens your webcam.
  3. For each frame, detects up to 2 hands and extracts 21 landmarks per hand
     (x, y, z coordinates, normalized 0-1 relative to image width/height).
  4. Prints the landmark coordinates for the wrist point (landmark 0) to the
     console every frame, as proof the full pipeline works end to end.
  5. Draws the landmark skeleton on screen so you can see detection quality live.

Controls:
  - Press 'q' to quit.

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/extract_landmarks.py
"""

import os
import urllib.request
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_PATH = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)


def ensure_model_downloaded():
    """Download the hand landmark model file if it's not already here."""
    if os.path.exists(MODEL_PATH):
        return
    print(f"Model not found locally. Downloading from:\n  {MODEL_URL}")
    print(f"Saving to: {MODEL_PATH}")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Download complete.")
    except Exception as e:
        print("Automatic download failed:", e)
        print(
            "Download it manually by pasting the URL above into your browser, "
            f"then save the file as '{MODEL_PATH}'."
        )
        raise SystemExit(1)


def main():
    ensure_model_downloaded()

    # Set up the hand landmark detector (MediaPipe Tasks API)
    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open webcam. Check that no other app is using it,")
        print("and that your OS has granted camera permission to this terminal/app.")
        return

    print("Webcam opened. Press 'q' in the video window to quit.\n")

    frame_count = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            print("Failed to read frame from webcam.")
            break

        # MediaPipe expects RGB, OpenCV gives BGR
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        result = detector.detect(mp_image)

        if result.hand_landmarks:
            for hand_index, hand_landmarks in enumerate(result.hand_landmarks):
                # Landmark 0 is always the wrist - good single point to log
                wrist = hand_landmarks[0]
                frame_count += 1
                if frame_count % 15 == 0:  # print every ~0.5s at 30fps, not every frame
                    handedness = (
                        result.handedness[hand_index][0].category_name
                        if result.handedness
                        else "Unknown"
                    )
                    print(
                        f"[{handedness} hand] wrist -> "
                        f"x={wrist.x:.3f}, y={wrist.y:.3f}, z={wrist.z:.3f}"
                    )

                # Draw all 21 points + connections on the frame
                h, w, _ = frame.shape
                for lm in hand_landmarks:
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    cv2.circle(frame, (cx, cy), 4, (255, 165, 0), -1)

        cv2.imshow("KamustaSign - Hand Landmark Test (press q to quit)", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("\nDone. Webcam released.")


if __name__ == "__main__":
    main()
