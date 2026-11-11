# Research scope

## Working question
Can gait representations preserve within-person retained-walk repeatability and meaningful left/right structure, without confusing transport/coordinate consistency with biomechanical or clinical validity? This is a candidate research question, not a confirmed novelty claim.

## Data and independence
The primary public dataset contains44 participants and five retained walks each. Ages54–87 mean the full cohort is not an exclusively65+ sample; the31-person65+ subset is a sensitivity analysis. The five retained passes were selected from10 collected walks. Trial numbers are not independently confirmed chronological/timepoint labels. Between-day test-retest reliability cannot be estimated.

SPPB total scores are present, but individual subtest scores are not established. POMA-G ratings are incomplete at participant level(39 of44). The supplementary Toronto archive has14 participants; it is not automatically interchangeable with the Mendeley marker/clinical definitions.

## Existing exploratory analyses
Pilot:one-way ICC(1,1) and derived ICC(1,5), participant-vector percentile bootstrap,5000 replicates, seed20261110. Sensitivity:one-way vs two-way absolute-agreement single-record ICC, signed vs absolute200*(L-R)/(L+R), all44 vs65+31;5000 participant-vector resamples, seed20261111. Prior pilot results were known before the sensitivity analysis. Not preregistered. All combinations are reported.

Within-person variation combines biological and processing variation. Low ICC is not proof that a measure is useless; high ICC is not clinical validity. Signed and absolute indices have different meanings. There are no outcome-based feature selections, clinical-score association tests, p-values, trained models or future-fall claims here.

## Open gates
1.Verify physical attachment/offsets and source calibration/anthropometry availability before subject-specific Scaling/IK.
2.Validate event-clock/frame alignment before gait-cycle normalization or cycle-level asymmetry.
3.Do not rename CGM2.3 angles as OpenSim coordinates or fabricate unmeasured upper-body motion.
4.Review novelty, participant-level evaluation and institutional ethics before confirmatory research.
5.Existing CGM curves can be studied directly; OpenSim reconstruction is not automatically a prerequisite for every representation question.
