# ASCEND Form Coach — Architecture & Technical Reference

## 1. Feature Overview
**ASCEND Form Coach** is an on-device computer-vision training assistant integrated into the ASCEND fitness application. The athlete uploads a recorded workout video; frames are sampled locally during playback and analyzed to track skeletal landmarks, determine movement phases, calculate joint angles, evaluate technique observations, automatically count repetitions, and record structured post-set summaries into the athlete's workout session. There is **no live camera mode** — `getUserMedia` is not used anywhere in the feature.

V1 delivers a full production implementation for **Barbell Back Squat**, with an extensible architecture designed for future exercise analyzers (Deadlift, Bench Press, Overhead Press, Lunges).

---

## 2. Technology Stack & Model Management

| Component | Technology | Role |
|---|---|---|
| **Pose Estimation** | `@mediapipe/tasks-vision` (v0.10.21) | Google MediaPipe 33-point body landmark tracking |
| **Model Asset** | `pose_landmarker_lite.task` (5.77 MB) | Quantized Float16 on-device neural model (Apache 2.0 License) |
| **WASM Runtime** | `public/mediapipe/wasm/` | Locally bundled WebAssembly binaries (`vision_wasm_internal.*`) |
| **Threading** | Web Worker (`pose.worker.ts`) | Off-main-thread inference with transferable `ImageBitmap` |
| **Main-Thread Fallback** | `PoseLandmarkerService` | Direct GPU/WebGL inference if Web Workers are restricted |
| **Video Input** | User-selected video file (MP4 / MOV / WebM) | Chosen via file picker or drag-and-drop; played back locally while frames are sampled for inference — never uploaded |
| **Rendering** | HTML5 Canvas Overlay | Skeleton, joint angle badges, and framing guides drawn over the playing video |
| **State Machine** | `RepStateMachine` | Deterministic hysteresis-backed movement phase engine |
| **Persistence** | `FormSessionRepository` & Zustand Store | Local storage (`ascend_form_coach_sessions`) + workout integration |

### Local Hosting & Privacy
- **Zero External API Calls**: Pose inference runs 100% on-device. No frames or video bytes leave the athlete's phone or browser; the uploaded file exists only as a local object URL for the duration of the analysis.
- **Audio**: The uploaded video is played muted during analysis; its audio track is never processed or stored.
- **Model Source & License**: MediaPipe Pose Landmarker Lite is developed by Google and distributed under the Apache License 2.0. Both WASM files and the `.task` model file are served locally from `/mediapipe/` under `public/`.
- **Asset Loading**: The WASM runtime and model are fetched from the app's own origin lazily, the first time an analysis is started (`PoseLandmarkerService.initialize()`). The service worker does **not** precache them; after the first fetch, ordinary HTTP caching applies.

---

## 3. High-Performance Architecture

```
[Uploaded Video File (HTML5 Video Playback)]
       │
       ▼ (Throttled ~14 FPS, Single In-Flight Gate)
[Transferable ImageBitmap]
       │
       ▼
[Web Worker: pose.worker.ts] ──(fallback)──► [Direct PoseLandmarker (Main)]
       │
       ▼
[33 Normalized Landmarks + Confidence]
       │
       ▼
[One-Euro Filter (LandmarkSmoothing.ts)]  ◄── Eliminates stationary tremor
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[SquatAnalyzer.ts]              [Canvas Overlay (PoseOverlay.tsx)]
  - Knee Angle (BA·BC)            - 60 FPS requestAnimationFrame
  - Torso Inclination             - Skeleton connection lines
  - RepStateMachine (Phases)      - Live angle badges
  - FormFeedbackEngine (Cues)     - Framing guide
       │
       ▼
[Post-Set Summary Modal] ──► [FormSessionRepository & Workout Store]
```

### Performance Mitigations:
1. **Decoupled Inference from Rendering**: Video playback and canvas overlays render via `requestAnimationFrame`, while neural inference runs at ~13–15 FPS.
2. **Single Frame in Flight**: If the inference worker is currently calculating a frame, incoming video frames are dropped. No backlog or memory leak occurs.
3. **Immediate GPU Free**: `ImageBitmap.close()` is invoked immediately after inference in the worker.

---

## 4. Squat Biomechanical Analysis Methodology

### Geometric Computations
- **Aspect-Ratio Isotropic Correction**: Coordinates $x$ are scaled by $(W / H)$ to ensure that 2D angles in normalized screen space represent true Euclidean angles regardless of whether the camera is in portrait or landscape mode.
- **Knee Angle ($\theta_{knee}$)**: Interior angle formed by Vector BA (Knee $\to$ Hip) and Vector BC (Knee $\to$ Ankle):
  $$\cos \theta = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|}, \quad \theta = \arccos(\text{clamp}(\cos \theta, -1, 1))$$
- **Torso Inclination ($\theta_{torso}$)**: Angle of the vector connecting Hip $\to$ Shoulder relative to the vertical gravity vector ($0^\circ$ = upright, $90^\circ$ = horizontal).

### Squat Movement Phases
The `RepStateMachine` transitions deterministically:
1. **Standing / Ready**: Knee angle $> 155^\circ$.
2. **Descending**: Knee angle drops below $142^\circ$ with negative velocity.
3. **Bottom Position**: Knee angle reaches minimum flexion ($\le 105^\circ$).
4. **Ascending**: Knee angle increases by $> 5^\circ$ from inflection point.
5. **Lockout**: Knee angle returns to $\ge 152^\circ$ and completes repetition.

### Repetition Rejection & Anti-Jitter Rules
- **Minimum Duration**: Repetition must take at least 0.8 seconds (prevents landmark jitter spikes).
- **Amplitude Gate**: Incomplete/shallow dips (e.g. lifter bends to $130^\circ$ and stands up without hitting bottom threshold) are aborted back to standing and **not** counted as completed reps.
- **Depth Classification**:
  - `below_parallel`: Minimum knee angle $\le \text{depthTarget} - 5^\circ$ (typically $\le 85^\circ$).
  - `parallel`: Minimum knee angle between $85^\circ$ and $100^\circ$.
  - `above_parallel`: Minimum knee angle $> 100^\circ$.

---

## 5. Form Coaching Rules & Limitations

| Rule ID | Priority | Condition | Coaching Cue | Biomechanical Limitation |
|---|---|---|---|---|
| `rule-feet-out-of-frame` | **Critical** | Ankles/feet $y > 0.98$ or $y < 0.02$ or visibility $< 0.5$ | *"Step back: keep your feet and ankles fully inside the frame."* | Pose models cannot verify depth without stable ankle/foot landmarks. |
| `rule-camera-view-front` | **High** | Shoulders & hips wide apart with equal visibility (front view) | *"Move camera to side view: squat depth is best analyzed from perpendicular profile."* | Frontal view causes perspective compression for knee flexion. |
| `rule-depth-shallow` | **Medium** | Bottom knee angle $> \text{depthTarget} + 12^\circ$ | *"Depth above target: aim for hip crease level with top of knees."* | Hip joint landmark is an anatomical approximation of the external hip crease. |
| `rule-depth-good` | **Low** | Bottom knee angle $\le \text{depthTarget} + 5^\circ$ | *"Good depth: hip crease reached parallel with knees."* | Validated against configured athlete target. |
| `rule-torso-inclination` | **Medium** | Torso inclination $> 52^\circ$ during ascent | *"Brace your core and keep your chest proud to avoid excessive forward lean."* | Torso angle naturally varies with femur length and low-bar vs high-bar technique. |

### NO Arbitrary 0–100 Form Score Policy
ASCEND Form Coach **strictly rejects** arbitrary numerical "form scores" (e.g. 78/100). Biomechanical technique is presented through empirical, verifiable metrics:
- Exact measured knee angle at bottom ($^\circ$).
- Torso inclination ($^\circ$).
- Descent duration and ascent duration ($s$).
- Evidence-backed observation occurrences.
- Athlete ability to edit and confirm detected reps before saving.

---

## 6. How to Add a New Exercise Analyzer

To implement a new analyzer (e.g. `DeadliftAnalyzer`), follow these steps:

1. **Implement `ExerciseAnalyzer` Interface**:
   Create `src/features/form-coach/analyzers/DeadliftAnalyzer.ts`:
   ```typescript
   import { ExerciseAnalyzer, AnalyzerFrameResult } from './ExerciseAnalyzer';

   export class DeadliftAnalyzer implements ExerciseAnalyzer {
     readonly exerciseId = 'deadlift';
     readonly exerciseName = 'Conventional Deadlift';
     readonly supportedCameraViews = ['side'];
     readonly requiredLandmarks = [...];

     initialize(config?: Record<string, unknown>) { ... }
     processFrame(landmarks, timestampMs, aspectRatio): AnalyzerFrameResult { ... }
     finishSet(workoutId, setIndex): FormSessionSummary { ... }
     reset() { ... }
     cleanup() { ... }
   }
   ```
2. **Define State Machine**:
   Create a dedicated or parameterized `RepStateMachine` with hinge thresholds (Setup $\to$ Pulling $\to$ Lockout $\to$ Descent).
3. **Register Rules**:
   Add exercise-specific rules in `FormFeedbackEngine` (e.g. bar path drift, hip shoot, lockout completion).
4. **Wire the Analyzer into the UI**:
   Route analyzer selection in `useFormCoach` to the new analyzer and surface it in `FormCoachModal` — the exercise card there is currently hardcoded to Barbell Back Squat, the only supported exercise.

---

## 7. Automated Test Suite

Run all Form Coach unit and integration tests:
```bash
npx vitest run tests/form-coach/
```

- `tests/form-coach/geometry.test.ts`: Vector angles, aspect-ratio scaling, velocities, confidence screening.
- `tests/form-coach/rep-state-machine.test.ts`: 5-phase movement cycle, incomplete rep rejection, tracking recovery.
- `tests/form-coach/squat-analyzer.test.ts`: Side-profile detection, readiness gates, post-set summary compilation.
- `tests/form-coach/feedback-engine.test.ts`: Rule prioritization, cooldown enforcement, flicker prevention.
- `tests/form-coach/form-session-repository.test.ts`: Local storage persistence and workout draft rep synchronization.
- `tests/form-coach/pose-landmarker-service.test.ts`: Landmarker lifecycle, frame gating/throttling, monotonic timestamps.
- `tests/form-coach/video-upload.test.ts`: Upload-flow architecture contracts (no camera APIs anywhere in the hook).
- `tests/form-coach/runtime-fixes.test.ts`: CSP WASM allowance, layout theme attribute, telemetry ID filtering.
