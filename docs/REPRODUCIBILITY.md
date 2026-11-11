# Reproduction

## Offline tests
Node20+;no external Node dependencies:
```sh
npm test
```

## Source files
Download only from recorded public sources and validate the immutable-file manifest:
```sh
node tools/download-datasets.mjs --root ./data-local --dataset mendeley
node tools/verify-downloads.mjs --root ./data-local --dataset mendeley
# Optional supplementary archive:
node tools/download-datasets.mjs --root ./data-local --dataset toaga
```
The downloader refuses conflicting existing files, uses partial files, verifies byte count/SHA256 before committing them, and never executes archive contents. Source availability/anti-bot failures are not evidence of missing data.

## Single trial:source CSV to TRC/STO
```sh
node scripts/export-single-trial.mjs --zip ./data-local/Mendeley_Gait44_v1/original.zip --out-dir ./runs/export-01
node scripts/validate-marker-axes.mjs --input-dir ./runs/export-01 --out-dir ./runs/geometry-01
```
This path preserves observed markers, frames and CGM components. The axis transformation is a candidate for Subject01_01 only. It is not an all-subject C3D→Scaling→IK converter.

## Optional native check in an existing OpenSim4.4 environment
```sh
/path/to/existing/python scripts/validate-opensim-input.py \
  --input-dir ./runs/export-01 \
  --contract ./runs/geometry-01/cross_host_contract.json \
  --out-dir ./runs/native-01 \
  --model /path/to/LaiUhlrich2022.osim \
  --marker-set /path/to/LaiUhlrich2022_markers_mocap.xml
```
No environment installation or model download is implicit. Model files are not bundled. The baseline model/marker hashes are pinned; a different template requires review, not silently bypassing the check. The public Python refactor has not been rerun natively as part of the initial publication. The earlier original-script native result is in results/single_trial_validation.json.

## Exploratory aggregate repeatability
```sh
node scripts/pilot-reproducibility.mjs --audit /path/to/workbook_audit_raw.json --out-dir ./runs/pilot-01
node scripts/sensitivity.mjs --audit /path/to/workbook_audit_raw.json --prior ./runs/pilot-01/pilot_reproducibility.json --out-dir ./runs/sensitivity-01
```
**Reproduction gap:**these two scripts require an existing workbook-audit JSON cache. The original openpyxl extraction stage is not packaged in this initial release. The aggregate historical outputs are not presented as a fully end-to-end raw-workbook reproduction. Raw/cache participant-level tables are not included in Git.
