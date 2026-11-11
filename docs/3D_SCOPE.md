# Keep measured3D research and video-inferred3D demos separate

## Main study: measured public Vicon3D,44 participants

Already inspected:220 retained trials from44 people; exploratory repeatability/asymmetry analysis; one trial's3D marker input/units/axis transformation and OpenSim input reading. This is not video reconstruction. Existing3D measurements and available CGM model-output angles should be used directly rather than re-estimated from an unrelated video.

Still not completed: anatomical marker attachment equivalence; externally calibrated axes; subject-specific Scaling/IK; compatible pretrained3D/motion representation input; dataset-overlap/leakage audit; participant-level independent evaluation; clinically valid conclusions. Missing full-body channels must not be invented to satisfy a model schema. Model selection and research novelty remain open; no new foundation model was trained or claimed.

## Separate demo: TOAGA video,one person,five seconds

Historical steps were single-image2D overlay, continuous2D failure inspection, conditional label correction, and VIDEO-mode tracking. Those did not complete the3D research question. Current additional output is native SDK world XYZ plus a rotating3D point/segment viewer. It is a model-inferred,hip-centred3D pose baseline, NOT measured3D, a body mesh, global walking trajectory, OpenSim IK or a clinical accuracy benchmark.

Different subjects/sources must never be overlaid, paired or scored as matched ground truth. The TOAGA pose CSV clock/crop alignment remains unverified and is not used. A visibly plausible or smooth3D pose does not establish correct depth, scale, gravity alignment or biomechanics.

## Next main-research gate

Return to measured3D/angle channel compatibility and explicitly define the research question/model before expanding implementation. Establish which source channels are measured versus derived, what the candidate model truly requires, and whether licenses/data overlap permit the intended validation. Keep repeated trials grouped by participant. A video3D accuracy claim separately requires same-subject, synchronized reference3D and calibration, not the unrelated44-person cohort.

Nonpublic materials remain outside this work. Original data/backups and prior outputs are not overwritten or automatically synchronized; the paused auxiliary Drive backup is not restarted by these demos.
