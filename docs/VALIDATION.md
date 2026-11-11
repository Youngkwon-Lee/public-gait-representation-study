# What the checks establish

Transport checks establish correct numeric parsing, row/label agreement and unit metadata. Geometric checks establish a proper rigid coordinate permutation, explicit mm→m scale, left/right and height/progression consistency, and near-rounding distance/roundtrip errors. Distances alone cannot detect a reflection; determinant and anatomical-side checks are essential.

The independent native check read602x24x3=43,344 transformed marker components with maximum error0. A row-major little-endian float64 hash includes frame,time,and all XYZ values. Different decimal text formatting can produce different TRC byte hashes while every parsed number is identical.

The six-region generic-model connection check only proves that pelvis/tibia frames exist and can connect in the unscaled template. It does not prove real skin-marker attachment, subject morphology, inverse kinematics or clinical accuracy. Current marker candidates are never activated for IK. Native mesh lookup issued81warnings; display-mesh rendering was not verified.

C3D known-record probes do not establish full metadata parsing or external gravity calibration. A minimal reader stopped at a subject-name offset irregularity; do not conclude the source is corrupt. The original file is unchanged. Original events are preserved but event/frame offset remains unverified.

The602samples span6.01s from first to last;602/100=6.02s is the sample-count-over-rate convention. These are different definitions, not a missing frame or speed manipulation.

See results/single_trial_validation.json and results/marker_mapping_candidates.json. No raw transport receipts, machine identities, filesystem paths or model assets are published.
