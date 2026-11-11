# Actual model XYZ export: inferred3D pose, not measured biomechanics

This is a3D-coordinate output, not the earlier2D overlay: the same MediaPipe FULL VIDEO inference was rerun on the same150 TOAGA frames180–329, [6,11)seconds. We copied `result.worldLandmarks[0][11,12,13,14,15,16,23,24,25,26,27,28]` directly. All1800 points contain native SDK x,y,z (5400 finite components). The earlier2D image points were reproduced exactly; their maximum difference from the preceding frozen run was0px. That verifies the replay/export path, NOT3D accuracy.

## Coordinate meaning

The official API distinguishes image-normalized depth from `worldLandmarks`: world outputs are3D coordinates in meters with the hip midpoint as origin. These are **model-estimated meters**, not a measured/camera-calibrated person-specific physical scale. No image crop offset or pixel scale is applied to world XYZ. Image coordinates remain in the separate `joints` field; raw3D is in `joints_world_m`.

[Official API coordinate description](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)

- Root-relative pose means the person moves their limbs around the hip origin. The person's actual translation through the room is NOT recovered; walking in place in the viewer is intentional, not a fabricated forward path.
- Raw SDK axes are retained. We did not establish gravity, camera extrinsics, laboratory axes, Vicon equivalence or OpenSim axes. The viewer applies only R=diag(1,−1,−1), a reversible180° X rotation with determinant+1, for display. It does not calibrate posture or identify a ground plane.
- The display Front/Side/Top presets are views of display axes, not verified anatomical or camera directions. Apparent lean must not be treated as a clinical trunk-angle measurement.
- Twelve body/limb points are exported. No face, body surface/shape mesh, subject-specific skeleton, OpenSim model, Scaling or IK is produced. Spheres/tubes are visualization guides, not reconstructed bone geometry.
- VIDEO's vendor temporal processing is included. No additional smoothing, coordinate edits, depth fabrication, confidence boosting, rejected point or frame interpolation was added. World visibility is not3D reconstruction accuracy.

## Actual checks and unresolved errors

150frames/12points/1800 observations all have finite XYZ. Raw Z spans approximately−0.327 to+0.455 model meters; this confirms depth values exist, not that depth is correct. The hip-midpoint residual from SDK origin is at most0.00109 model m; this is an origin consistency check, NOT millimeter accuracy. The maximum adjacent3D point step is0.109 model m, with genuine movement and estimation error not separated. Large-step frames remain in the data; nothing was smoothed away for the3D viewer. Exact values and source frames are in [quality results](../results/model_world3d_quality.json).

The standalone viewer uses actual WebGL3D projection, depth-tested spheres/tubes, draggable orbit, zoom, pause/play and150-frame scrubbing. Front/Side/Orbit were tested on a real WebGL context with no GL/JS error. A saved multiview image shows the SAME source frame244 from three viewpoints. The5s preview renders all150 poses in front and side display-axis views. The viewer does not interpolate/blend poses. Playback30fps is not a claim of30fps inference.

**No paired measured3D reference or reconstructed-depth error has been evaluated.** These outputs cannot yet support clinical joint angles, true step length, gravity-aligned posture, global walking speed or a valid OpenSim simulation.

## Reproduce

Use the same byte-pinned vendor cache and fixed400×700 JPEGs described in [VIDEO_MODE_COMPARISON.md](VIDEO_MODE_COMPARISON.md). Add the explicit3D export mode:

```sh
node tools/mediapipe-video/serve.mjs --mode 3d --cache data-local/mp-vendor --photos data-local/mp-fixed-photos --port 8940
```

Open the printed local URL, click Run150 CPU frames and download12-joint XYZ JSON. Default2D mode is unchanged. Processing is local CPU; no frames go to a remote inference API. The shared model/input config contains the vendor URLs and SHA256 pins. Do not reuse the scoped ROI/time profile for another recording without validation.

Frozen-coordinate checks and an offline viewer require only Node20+:

```sh
node tools/inspect-model-world3d.mjs --input assets/toaga-model-world3d.json --reference-image assets/toaga-mediapipe-fixed-predictions.json --output NEW-quality.json --csv NEW-XYZ.csv
node tools/create-world3d-viewer.mjs --input assets/toaga-model-world3d.json --output NEW-viewer.html
npm test
```

Open the generated HTML in a WebGL-capable browser. It is self-contained with no remote script/model/image dependency. GitHub's file viewer may show HTML source rather than run it; download and open locally. Raw JSON, CSV, viewer and media hashes are in [provenance](toaga-world3d-provenance.json).

## Separate from the main measured3D study

The44-person Mendeley Vicon study already contains measured3D markers and model-output angle channels. That is the main representation-research input. TOAGA's one-person video estimator demo is separate, with a different person/source and no verified paired3D ground truth. They were NOT aligned, combined or compared as if they were the same person. See [research scope and remaining3D gates](../docs/3D_SCOPE.md).
