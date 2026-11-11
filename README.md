# Public Gait Representation Study

Exploratory research on **retained-walk repeatability, left/right asymmetry, and representation fidelity** using public gait datasets.

**Research work in progress. Not a fall-prediction model, not a validated clinical tool, and not a complete subject-specific OpenSim pipeline.**

## What is verified

- Public Mendeley dataset audit:44 participants, ages54–87;31 aged65+. Five quality-selected retained walks per person,220 records. The source collected10 walks and kept the best5.
- SPPB is a total score only in the audited files. POMA-G item ratings are available for39 participants. Do not invent SPPB subtests or treat220 walks as220 independent people.
- Subject01_01:602 frames at100Hz,24 observed lower-limb/pelvis markers and30 CGM2.3 angle components. Four wholly absent calibration-marker columns were excluded, not filled.
- Initial OpenSim4.4 table reading preserved61,404 marker/angle values. The later candidate rotation and mm→m conversion preserved43,344 marker-component values with native maximum error0 and matching cross-host numeric digest.
- Proper rotation R maps source(Y,Z,X) into target(X,Y,Z).166,152 marker-pair distances were preserved within floating-point rounding. This is geometry-supported for this trial, not independent laboratory calibration.
- Six generic-model pelvis/ankle candidate connections initialize successfully. Six knee/foot candidates still require placement review;12 segment-tracking markers are not arbitrarily mapped. No candidate is activated for IK.

## What is not verified

Actual anatomical attachment equivalence, external laboratory-axis calibration, subject-specific Scaling, IK accuracy, full-body foundation-model compatibility, AI/clinical validity, prospective falls prediction, literature novelty and institutional ethics determination remain open. Model initialization is not a subject-specific motion result.

The recorded native experiment predates this portable public-code refactor. Node tests and fresh source-data reruns are reported separately; the public Python refactor is not claimed to have been rerun in OpenSim.

## Start here

- [Research scope and limits](docs/RESEARCH_SCOPE.md)
- [Reproduction instructions](docs/REPRODUCIBILITY.md)
- [Evidence and data/coordinate distinctions](docs/VALIDATION.md)
- [Dataset sources and hashes](data/README.md)
- [Publishing/privacy boundaries](docs/PUBLICATION_POLICY.md)
- [Management and update workflow](docs/MANAGEMENT.md)
- [Source citations and licensing boundaries](CITATION.md) and [LICENSES.md](LICENSES.md)

Node20+ is used without external dependencies. Run:

```sh
npm test
node tools/download-datasets.mjs --root ./data-local --dataset mendeley
node scripts/export-single-trial.mjs --zip ./data-local/Mendeley_Gait44_v1/original.zip --out-dir ./runs/export-01
node scripts/validate-marker-axes.mjs --input-dir ./runs/export-01 --out-dir ./runs/geometry-01
```

Use new output folders; scripts refuse to overwrite prior results. Downloaded data, run outputs, model assets and runtime logs stay outside Git.

## Initial exploratory finding, not a clinical conclusion

On the44-person retained-walk dataset, one-way single-walk ICC was0.921 for mean bilateral speed,0.076 for absolute step-time symmetry and0.442 for absolute step-length symmetry. Signed and absolute asymmetry give different results; all prespecified-after-pilot sensitivity combinations are retained rather than selecting the largest ICC. Speed units in these summary files still carry the original source-check caveat.

See the aggregate [pilot](results/exploratory_repeatability.json) and [sensitivity](results/exploratory_sensitivity.json) records for confidence intervals and limitations. Selection, restricted between-person variation, noise floors and model definitions prevent a general clinical interpretation.
