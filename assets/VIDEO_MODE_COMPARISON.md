# VIDEO-mode estimator comparison: the previous clip still jittered

The earlier label-stabilized clip did not solve position jumps. Its maximum step was93.33px and ten frames retained large-step review flags. Calling that a visually stable tracker would be misleading. This iteration changes the estimator and removes our moving camera crop, not just the labels.

## What actually ran

- One public TOAGA `OAW02-bottom.mp4` subject, the unchanged150 source frames180–329, source [6,11)seconds at30fps. No cohort expansion, original video upload, private46-person data, or TOAGA pose CSV alignment.
- Official MediaPipe PoseLandmarker FULL float16 model v1, tasks-vision1.2.2, CPU delegate, runningMode VIDEO, one continuous task instance, numPoses1. Model/detection/presence/tracking thresholds0.5. Twelve shoulder/elbow/wrist/hip/knee/ankle landmarks exported; no face, world/depth coordinates or segmentation exported.
- **VIDEO includes vendor tracking and internal landmark/visibility smoothing.** The exported coordinates are unmodified SDK VIDEO outputs, not unsmoothed network estimates. No additional application filter, outlier rejection, imputation, confidence boosting, manual point adjustment, or Viterbi label correction.
- Input ROI is constant `(460,220,400,700)` in original1080×1920 pixels. A preliminary run used the old Vision-derived moving crop; the selected fixed input removes that dependency. Original coordinates are recovered exactly as `x=460+400*crop_x,y=220+700*crop_y`.
- Both video panels use the same constant camera and the same exact JPEG on each frame. The previous renderer's moving crop had up to15.03px camera movement per frame; that display instability is removed from BOTH panels. The left is the previous label-corrected estimator, not a deliberately worsened or different source video.
- A public runner was executed end to end through its Run150 CPU frames button. All150 resulting coordinate sets exactly matched a separate fixed-input run. This is reproducibility on the same inputs/runtime, not independent accuracy validation.

## Descriptive results, not ground-truth accuracy

|Output|Max adjacent joint step|P95 step|Steps >50px|Reported-score-qualified observations|
|---|---:|---:|---:|---:|
|Original Vision|95.47px|17.75px|40|1693/1800|
|Previous label-corrected Vision|93.33px|8.44px|12|1789/1800|
|MediaPipe VIDEO, moving input|20.35px|7.56px|0|1800/1800|
|MediaPipe VIDEO, fixed input|13.90px|5.66px|0|1800/1800|

**Steps include genuine walking movement, not isolated jitter.** Percentiles use linear interpolation at index(n−1)p; thresholds20/50px are descriptive, not validated error classifiers. Vision confidence and MediaPipe visibility are different, uncalibrated scores. A0.3 display threshold and higher reported visibility do not establish equivalent detection accuracy, anatomical correctness, absence of hallucinated/occluded points, or clinical measurement validity. No reference joint annotation, calibrated3D, or clinical benchmark was used.

The final150-frame SDK output has no flags under the existing heuristic evaluator, but that evaluator is not ground truth. Source frame318 (clip index138) has one of the largest legitimate-or-erroneous steps and is included in QC rather than omitted. QC also includes the previous wrist/shoulder failure intervals. All150frames are in the30fps MP4; the150-frame GIF is a preview with centisecond-quantized timing;the MP4 has exact30fps.

The CPU run takes roughly0.10seconds per SDK inference call, excluding fetch/decode/init; it did NOT achieve30fps real time. The five-second output is offline playback, not a real-time performance claim. Exact timing values and comparison denominators are in [results](../results/video_mode_comparison_quality.json).

## Reproduce locally without a remote inference service

Node20+, a SIMD-capable browser and FFmpeg. No Python/global package installation or model weights are committed. Vendor JS/WASM/model downloads are byte-pinned and verified before serving; a mismatch is an error, not a bypass. Serve only on127.0.0.1; no frames are sent to a remote model API.

```sh
mkdir -p data-local
node tools/mediapipe-video/prepare.mjs --cache data-local/mp-vendor
# Extract the SAME150 original PNG frames at6–11seconds as in CONTINUOUS_OVERLAY.md.
mkdir -p data-local/mp-fixed-photos
ffmpeg -framerate 30 -i SOURCE-FRAMES/frame-%04d.png -frames:v 150 -vf 'crop=400:700:460:220' -q:v 2 -start_number 0 data-local/mp-fixed-photos/frame-%04d.jpg
node tools/mediapipe-video/serve.mjs --cache data-local/mp-vendor --photos data-local/mp-fixed-photos --port 8876
```

Open the printed local URL, click Run150 CPU frames once, wait for Completed150/150, then download the12-joint JSON. The source profile is deliberately hardcoded to this clip; do not reuse its ROI, clock or confidence assumptions on another recording. Future clips need their own validated target/ROI/time mapping.

Frozen published SDK coordinates permit deterministic metric reproduction without downloading models:

```sh
node tools/compare-video-estimators.mjs --output NEW-comparison.json
npm test
```

Prepare the exact checked presentation JSON and self-contained renderer:

```sh
node tools/prepare-video-comparison.mjs --out-dir data-local/mp-compare
node tools/render-stabilization-comparison.mjs --baseline data-local/mp-compare/before.json --candidate data-local/mp-compare/after.json --photos data-local/mp-fixed-photos --output data-local/mp-compare/renderer.html
```

Load renderer.html in a browser, await window.comparisonReady, call drawComparison(index) for every index0–149, and export the1280×900 canvas to sequential PNGs. Encode without skipping frames:

```sh
ffmpeg -framerate 30 -i comparison-frames/frame-%04d.png -frames:v 150 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart comparison.mp4
```

The display camera must be constant `(460,220,400,700)` for this comparison, not the old moving inference crops. Captured SDK outputs, model URLs/hashes, media hashes, timing and camera details are in [provenance](toaga-video-mode-provenance.json). Original measured-marker previews and OpenSim input checks are separate work, not validation of these2D estimates. Anatomical accuracy and gait measurement preservation still require reference annotation before cohort expansion.
