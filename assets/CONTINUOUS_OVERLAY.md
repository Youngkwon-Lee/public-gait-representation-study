# Continuous actual-video overlay:baseline with failures

TOAGA OAW02-bottom.mp4,source frames180..329(zero-based),6.000..10.9667s;clip duration5.000s,30fps. Source/public-sharing context and original face obscuring are described in TOAGA https://doi.org/10.1038/s41597-022-01495-z . Source item:https://springernature.figshare.com/articles/dataset/Walking_videos/19929893 (recordedCC0). Crop,pose overlay and captions are added.

## Tracking method
An initial ROI[x480,y250,w300,h400]was manually selected. macOS Vision VNDetectHumanBodyPoseRequest ran CPU-only on every source frame. The ROI adapts from detected body bounds;after no detection it is expanded once. If multiple bodies are returned,the nearest hip centroid to the prior selection is used. This is a bounded temporal-association baseline,not validated re-identification or automatic full-frame detection.

Twelve body points are thresholded at0.3 confidence. Face points are never rendered. Missing/weak joints are not drawn,not held from the previous frame and not interpolated. No joint smoothing or manual coordinate correction is applied. Display camera centering follows the predicted hip;only the camera position is held on a no-pose frame. Both panels use identical source-frame crops. Four sampled crops(0,35,95,149)exactly matched independently cropped JPEGs.

## Observations
- Pose present149/150;all12points above cutoff116/150. Detection availability is not accuracy.
- Missing/below-cutoff joint observations107/1800.
- Expanded ROI retries6frames;multiple candidates1frame.
- One no-pose frame(index95,source frame275,time9.1667s)is retained in the full MP4.
-13frames trigger swap-like temporal-assignment flags;11trigger large-displacement flags. These are exploratory review rules,not ground-truth error labels. Natural crossing legs can trigger a swap-like rule. Label instability is visible in the reviewed examples.
- Median/P95/max consecutive valid-point displacement:2.383/18.038/95.469pixels. These are original-image pixels,not physical gait velocity or calibrated error.

This baseline is **not ready to expand to the cohort without addressing label consistency and missed points**. Source-frame images were reviewed at indices0,31,60,67,95,120,149. That sampled review is not an exhaustive human identity audit.

## Files
The MP4 contains all150frames. The10fps GIF is a display preview and can skip individual failures;use the MP4,QC sheet and quality JSON for inspection. toaga-continuous-predictions.json contains this public demo's derived per-frame2D estimates,not participant clinical tables or supplied ground-truth labels. Original full video/PNG frames are not committed.

## Reproduce the bounded tracking stage

```sh
mkdir -p runs/continuous/source-frames
ffmpeg -ss 6 -i /path/to/OAW02-bottom.mp4 -frames:v 150 -fps_mode passthrough -start_number 0 runs/continuous/source-frames/frame-%04d.png
osascript -l JavaScript tools/track-continuous-video.js runs/continuous/source-frames 150 runs/continuous/tracking.json
node tools/analyse-continuous-overlay.mjs --run-dir runs/continuous
node tools/prepare-continuous-crops.mjs --run-dir runs/continuous
```

The tracking stage requires macOS Vision;no model download or new environment installation is implicit. The presentation stage used FFmpeg source-photo crops and browser Canvas to draw raw predictions/captions,then FFmpeg H.264/GIF encoding. It does not perform inference or alter tracking estimates. No Mendeley markers,provided temporally trimmed poseCSV,or Xsens timing alignment is used.
