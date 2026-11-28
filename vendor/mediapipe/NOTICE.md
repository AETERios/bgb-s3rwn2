# Local focus detector assets

Pinned package: `@mediapipe/tasks-vision@0.10.21`, from the official npm distribution. MediaPipe is licensed under Apache-2.0; see LICENSE. Original bundle copyright/license notices are retained. Package URL, model source URLs, file sizes and SHA-256 hashes are recorded in assets.json.

Models: Google MediaPipe BlazeFace short-range (float16, version 1) and EfficientDet-Lite0 (int8, version 1), hosted in the official mediapipe-models bucket. Runtime and models are served from this site; no third-party CDN is needed during detection.

Official implementation references:

- https://developers.google.com/edge/mediapipe/solutions/vision/face_detector?tab=Web
- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector?tab=Web
- https://github.com/google-ai-edge/mediapipe

Detection only indicates visible faces or phones. It does not establish attention, phone use, identity, emotion or learning. Frames are neither uploaded nor persisted. The UI requests video only after an explicit click. Camera authorization and streams are never stored. Model assets are loaded on demand, not during normal reading or offline precaching.
