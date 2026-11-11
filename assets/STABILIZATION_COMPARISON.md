# Same-frame stabilization comparison: experimental, conditional

The original baseline is retained unchanged. The comparison uses the same TOAGA `OAW02-bottom.mp4` frames 180–329, source interval [6,11) seconds, 150 frames at30fps. Both panels reuse the exact same frozen baseline JPEG/photo camera on every frame. This is not a different person, a different video, synthetic walking, OpenSim IK, or an accuracy benchmark. Original face obscuration is retained. Published TOAGA pose CSVs are not used because their timing/crop offsets remain unverified.

## Measured availability and heuristic review flags

|Variant|Pose frames /150|All12 above0.3|Missing/low-confidence observations /1800|Swap-like frames|Large-step frames|
|---|---:|---:|---:|---:|---:|
|Original adaptive ROI|149|116|107|13|11|
|Tight fixed ROI, not selected|150|144|6|0|2|
|Padded fixed ROI, native labels|150|143|11|9|18|
|Padded ROI, whole-body relabelling|150|143|11|1|10|
|Padded ROI, independent upper/lower relabelling, REJECTED|150|143|11|0|10|
|Padded ROI, conditional upper/lower relabelling, selected|150|143|11|1|10|

**Availability is not accuracy. Fewer flags are not proof of correct joints or anatomical sides.** These are same-clip development measurements, not held-out validation. Thresholds are unchanged from the baseline evaluator. The temporal objective overlaps the review heuristic, so its improvement is not independent evidence.

## What changed, and what did not

1. Rerun macOS Vision on a fixed padded ROI `(x460,y220,w400,h700)` in original1080×1920 pixels, instead of the jittering adaptive crop. Fixed wider fallback `(400,150,520,850)` is implemented for no detection but was not used. There was one candidate each frame. Nearest-hip association and the manually selected subject/clip remain; this is not a general multi-person identity benchmark.
2. Apply offline four-state Viterbi label assignment. Upper-body pairs (shoulder/elbow/wrist) and lower-body pairs (hip/knee/ankle) can each be renamed coherently. Do not independently swap a knee or ankle to force screen-x ordering. The full sequence, including future frames, is used, so this is not online tracking.
3. Selected conditional version adds an explicit **frontal no-turn torso-order assumption** relative to the first accepted native frame, not anatomical truth. A soft cost0.2 penalizes reversal of shoulder/hip screen order when the current pair has confidence≥0.5 and separation≥15px. The first anchor can be wrong. Do not use this setting for turns, changing view/mirroring, or other clips without checking the assumption. State-transition cost0.005 per segment; Huber delta0.1; confidence evidence cutoff0.3. This prior was added during same-clip engineering, not preregistered.
4. Coordinates and confidence scores from the padded native rerun are exactly preserved as a per-frame multiset. Only labels change. No coordinate smoothing, confidence boosting, interpolation, forward-filled joint, mirrored coordinate, or hidden replacement pose was introduced. Better availability comes from a real same-frame detector rerun, not filling gaps. This invariant is about native rerun→relabelling; the ROI rerun intentionally produces different predictions from the original baseline.

The tight360×560 pilot had apparently stronger scores, but the baseline ankle reached y798.9 while its lower crop boundary was y800. It was not selected because that leaves almost no padding and risks clipping lower-limb context. The larger padding was chosen before judging its final scores. We do not select the crop with the best-looking count.

Unconstrained segment assignment gave zero swap flags but renamed98 frames, including suspicious long lower-segment drift against the clip's frontal torso order. It was rejected rather than presented as perfect tracking. The selected conditional version renames15 frames and has zero prior violations on260 eligible torso-pair observations; this is by construction, NOT independent validation.

## Failures and regressions remain visible

- One swap-like frame remains: source245 at8.167s, knees/ankles. A heuristic can also fire on genuine crossing; without reference labels, neither correction nor truth is established.
- Ten large-step frames remain; the maximum step remains93.33px (baseline95.47px). Residual steps are in upper-body joints. We deliberately did not smooth them away.
- Seven frames still have low-confidence/missing joints. Aggregate availability improved, but some frames that were previously clean have new flags or missing joints. Exact frame lists are in `results/stabilization_comparison_quality.json`; source245 is a displayed regression example.
- QC includes source211,221,245,275,300,329, covering label trouble, retained jumps, a new failure, original dropout recovery, and later frames. The150-frame MP4, not the10fps GIF, is the complete temporal record.
- Manual visual sampling and invariant/unit tests do not establish anatomical accuracy, zero identity switches, clinical gait accuracy, fall prediction, or cohort generalization. The original TOAGA visible markers are not treated as joint-centre ground truth.

## Reproduce the scoped stages

Use a new working folder and the original baseline source-frame extraction described in [CONTINUOUS_OVERLAY.md](CONTINUOUS_OVERLAY.md). These are macOS Vision/JXA inference scripts, not a Windows/Linux model implementation. Frozen public predictions allow the label/evaluation stages to run with Node20+ alone.

```sh
# source-frames: the original150 PNG frames of seconds6–11, named frame-0000.png...
osascript -l JavaScript tools/track-padded-continuous-video.js source-frames 150 NEW-native.json
node tools/stabilize-pose-labels.mjs --mode segments --torso-order-penalty 0.2 --input NEW-native.json --output NEW-stabilized.json
# Or reproduce labels from byte-pinned published native predictions:
node tools/stabilize-pose-labels.mjs --mode segments --torso-order-penalty 0.2 --input assets/toaga-padded-roi-native.json --output NEW-stabilized-from-frozen.json
# Put a chosen output at NEW-RUN/tracking.json, then evaluate; never use the baseline run folder.
node tools/analyse-continuous-overlay.mjs --run-dir NEW-RUN
# Reuse matching baseline camera JPEG crops from the original rendering, do not mix frame offsets.
node tools/render-stabilization-comparison.mjs --baseline assets/toaga-continuous-predictions.json --candidate NEW-RUN/tracking-annotated.json --photos BASELINE-photo-crops --output NEW-comparison.html
npm test
```

The renderer is self-contained and exposes `comparisonReady` and `drawComparison(index)` on its page. After loading it in a browser and awaiting `comparisonReady`, export the canvas once for each index0–149. Encode those PNGs without dropping frames:

```sh
ffmpeg -framerate 30 -i comparison-frames/frame-%04d.png -frames:v 150 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart comparison.mp4
```

Original frames, original video, rendered frame folders and run HTML are not committed. Derived comparison media, native/corrected predictions, full variant summaries, code and hashes are committed. See [source provenance](toaga-stabilization-provenance.json), [prior source/license record](TOAGA_OVERLAY.md), and [full results](../results/stabilization_comparison_quality.json). Cohort expansion remains on hold pending independent annotation of ordinary and failure frames.
