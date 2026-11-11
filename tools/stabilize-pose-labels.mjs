#!/usr/bin/env node
/** Offline bilateral relabelling, NOT anatomical-side verification.
 * API: stabilizeTracking({frames: [{joints: object|null}, ...], ...}, opts?)
 * Segment API: stabilizeSegmentTracking(track, opts?) uses upper bit 1 / lower bit 2.
 * Returns a deep copy. Each object frame receives label_swap_applied,
 * label_swap_state ('native'|'swapped'), label_source_mapping (output -> input
 * key), and label_swap_evidence. Original coordinates/confidences are untouched.
 * CLI: node tools/stabilize-pose-labels.mjs --input tracking.json --output NEW.json [--mode global|segments] [--torso-order-penalty NUMBER]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PARTS = ['shoulder_1', 'forearm', 'hand', 'upLeg', 'leg', 'foot'];
const PAIRS = PARTS.map(part => [`left_${part}_joint`, `right_${part}_joint`]);
const DEFAULTS = Object.freeze({ confidenceCutoff: 0.3, transitionPenalty: 0.005,
  huberDelta: 0.1, minBilateralPairs: 2, minBodyHeight: 1e-9,
  evidenceTolerance: 1e-6, torsoOrderPenalty: 0, torsoMinSeparation: 15, torsoConfidenceCutoff: 0.5 });
const CAVEAT = 'The first accepted pose is anchored to native detector labels. Its anatomical left/right identity is unknown; a wrong anchor is retained. Temporal objective reduction is not independent validation.';
const usable = (p, cutoff) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && Number.isFinite(p.confidence) && p.confidence >= cutoff;
const partner = key => {
  for (const [a, b] of PAIRS) { if (key === a) return b; if (key === b) return a; }
  return key;
};
const huber = (r, delta) => r <= delta ? r * r / (2 * delta) : r - delta / 2;

function poseInfo(frame, opts) {
  const joints = frame?.joints;
  if (!joints) return null;
  const complete = PAIRS.map(([a, b]) => usable(joints[a], opts.confidenceCutoff)
    && usable(joints[b], opts.confidenceCutoff));
  const points = PAIRS.flat().map(k => joints[k]).filter(p => usable(p, opts.confidenceCutoff));
  const height = points.length ? Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) : 0;
  if (complete.filter(Boolean).length < opts.minBilateralPairs || height <= opts.minBodyHeight) return null;
  return { joints, complete, height };
}

function edgeEvidence(previous, current, opts) {
  const segments = { upper: { same: 0, swapped: 0, joint_count: 0 },
    lower: { same: 0, swapped: 0, joint_count: 0 } };
  for (let pair = 0; pair < PAIRS.length; pair++) {
    // Require both sides at both endpoints: neither parity can win by dropping
    // a low-confidence/missing counterpart from its comparison set.
    if (!previous.complete[pair] || !current.complete[pair]) continue;
    const segment = segments[pair < 3 ? 'upper' : 'lower'];
    for (let side = 0; side < 2; side++) {
      const p = previous.joints[PAIRS[pair][side]];
      for (let parity = 0; parity < 2; parity++) {
        const q = current.joints[PAIRS[pair][side ^ parity]];
        const displacement = Math.hypot(q.x - p.x, q.y - p.y) / previous.height;
        const weight = Math.min(1, p.confidence, q.confidence);
        segment[parity ? 'swapped' : 'same'] += weight * huber(displacement, opts.huberDelta);
      }
      segment.joint_count++;
    }
  }
  const count = segments.upper.joint_count + segments.lower.joint_count;
  const costs = [0, 1].map(parity => Object.values(segments).reduce((sum, s) =>
    sum + s[parity ? 'swapped' : 'same'], 0) / (count || 1));
  for (const s of Object.values(segments)) {
    s.same /= s.joint_count || 1;
    s.swapped /= s.joint_count || 1;
    s.preferred_relative_state = !s.joint_count ? 'unavailable'
      : Math.abs(s.same - s.swapped) <= opts.evidenceTolerance ? 'ambiguous'
        : s.same < s.swapped ? 'same' : 'swapped';
  }
  const a = segments.upper.preferred_relative_state;
  const b = segments.lower.preferred_relative_state;
  return { costs, segments, comparable_joint_count: count,
    insufficient_evidence: count === 0,
    segment_conflict: ['same', 'swapped'].includes(a) && ['same', 'swapped'].includes(b) && a !== b };
}

export function stabilizeTracking(track, opts = {}) {
  return stabilize(track, opts, false);
}

/** Independent upper/lower bits, anchored together to the first accepted pose.
 * Same measurements, confidence handling, evidence, and output safeguards as global mode.
 */
export function stabilizeSegmentTracking(track, opts = {}) {
  return stabilize(track, opts, true);
}

function stabilize(track, opts, segmented) {
  if (!track || typeof track !== 'object' || !Array.isArray(track.frames)) {
    throw new TypeError('Expected a tracking object with a frames array');
  }
  const config = { ...DEFAULTS, ...opts };
  for (const key of Object.keys(opts)) if (!(key in DEFAULTS)) throw new TypeError(`Unknown option: ${key}`);
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(config[key])) throw new TypeError(`Invalid ${key}`);
  if (config.confidenceCutoff < 0 || config.confidenceCutoff > 1 || config.transitionPenalty < 0
    || config.torsoOrderPenalty < 0 || config.torsoMinSeparation < 0
    || config.torsoConfidenceCutoff < 0 || config.torsoConfidenceCutoff > 1
    || config.huberDelta <= 0 || config.minBodyHeight <= 0 || config.evidenceTolerance < 0
    || !Number.isInteger(config.minBilateralPairs) || config.minBilateralPairs < 1 || config.minBilateralPairs > 6) {
    throw new RangeError('Invalid stabilization options');
  }
  for (const frame of track.frames) {
    if (frame === null) continue;
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)
      || (frame.joints !== null && (!frame.joints || typeof frame.joints !== 'object' || Array.isArray(frame.joints)))) {
      throw new TypeError('Each frame must be null or an object with joints object/null');
    }
  }
  const result = structuredClone(track);
  const accepted = [];
  track.frames.forEach((f, index) => { const info = poseInfo(f, config); if (info) accepted.push({ index, ...info }); });
  const candidatesStates = segmented ? [0, 1, 2, 3] : [0, 1];
  const changes = parity => segmented ? (parity & 1) + ((parity >> 1) & 1) : parity;
  const temporalCost = (edge, parity) => segmented
    ? edge.segments.upper[parity & 1 ? 'swapped' : 'same']
      + edge.segments.lower[parity & 2 ? 'swapped' : 'same']
    : edge.costs[parity];
  // Explicit engineering prior: screen order in a frontal no-turn clip only.
  // Anchor signs are raw/native references, not confidence-qualified truth.
  const torsoObservation = (joints, pairIndex) => {
    const [leftKey, rightKey] = PAIRS[pairIndex];
    const left = joints?.[leftKey], right = joints?.[rightKey];
    if (!usable(left, config.torsoConfidenceCutoff) || !usable(right, config.torsoConfidenceCutoff)
      || Math.abs(left.x - right.x) < config.torsoMinSeparation || left.x === right.x) return null;
    return { sign: Math.sign(left.x - right.x), weight: Math.min(left.confidence, right.confidence) };
  };
  const nativeAnchorSign = pairIndex => {
    const [left, right] = PAIRS[pairIndex].map(key => accepted[0]?.joints[key]);
    return Number.isFinite(left?.x) && Number.isFinite(right?.x) && left.x !== right.x
      ? Math.sign(left.x - right.x) : null;
  };
  const torsoReference = { upper: nativeAnchorSign(0), lower: nativeAnchorSign(3) };
  const unaryEvidence = accepted.map(pose => ({ upper: torsoObservation(pose.joints, 0),
    lower: torsoObservation(pose.joints, 3) }));
  const unary = (k, state) => {
    let cost = 0, count = 0;
    if (config.torsoOrderPenalty > 0) for (const [segment, bit] of [['upper', 1], ['lower', 2]]) {
      const observation = unaryEvidence[k][segment];
      const swapped = segmented ? Boolean(state & bit) : Boolean(state);
      if (observation && torsoReference[segment] !== null
        && observation.sign * (swapped ? -1 : 1) !== torsoReference[segment]) {
        cost += config.torsoOrderPenalty * observation.weight;
        count++;
      }
    }
    return { cost, count };
  };
  const edges = [];
  const back = [];
  let dp = candidatesStates.map(state => state ? Infinity : 0); // Fix global sign ambiguity to first accepted native pose.
  for (let k = 1; k < accepted.length; k++) {
    const edge = edgeEvidence(accepted[k - 1], accepted[k], config);
    edges.push(edge);
    const parents = candidatesStates.map(() => 0);
    const next = candidatesStates.map(state => {
      const candidates = candidatesStates.map(prev => dp[prev] + temporalCost(edge, prev ^ state)
        + changes(prev ^ state) * config.transitionPenalty);
      // Exact ties prefer no transition, then the lowest encoded state.
      let prev = state;
      for (const candidate of candidatesStates) if (candidates[candidate] < candidates[prev]) prev = candidate;
      parents[state] = prev;
      return candidates[prev] + unary(k, state).cost;
    });
    back[k] = parents;
    dp = next;
  }
  const states = Array(accepted.length).fill(0);
  if (accepted.length) {
    states[states.length - 1] = candidatesStates.reduce((best, state) => dp[state] < dp[best] ? state : best, 0);
    for (let k = states.length - 1; k > 0; k--) states[k - 1] = back[k][states[k]];
  }
  let node = 0, state = 0, switches = 0, segmentSwitches = 0;
  const segmentSwitchCounts = { upper: 0, lower: 0 };
  const applied = [], conflicts = [];
  let selectedTemporal = 0, nativeTemporal = 0;
  const selectedUnary = states.map((state, k) => unary(k, state));
  const nativeUnary = states.map((_, k) => unary(k, 0));
  const priorCost = selectedUnary.reduce((sum, item) => sum + item.cost, 0);
  const nativePriorCost = nativeUnary.reduce((sum, item) => sum + item.cost, 0);
  for (let k = 1; k < accepted.length; k++) {
    const parity = states[k - 1] ^ states[k];
    selectedTemporal += temporalCost(edges[k - 1], parity);
    nativeTemporal += temporalCost(edges[k - 1], 0);
    switches += Number(parity !== 0);
    segmentSwitches += changes(parity);
    if (segmented) {
      segmentSwitchCounts.upper += parity & 1;
      segmentSwitchCounts.lower += (parity >> 1) & 1;
    }
    if (edges[k - 1].segment_conflict) conflicts.push([accepted[k - 1].index, accepted[k].index]);
  }
  result.frames.forEach((frame, index) => {
    const isAccepted = node < accepted.length && accepted[node].index === index;
    const edge = isAccepted && node > 0 ? edges[node - 1] : null;
    const priorIndex = edge ? accepted[node - 1].index : null;
    if (isAccepted) state = states[node++];
    if (frame === null) return; // A literal missing frame remains literally null.
    const mapping = {};
    if (frame.joints !== null) {
      const relabelled = {};
      for (const [key, value] of Object.entries(frame.joints)) {
        const pairIndex = PAIRS.findIndex(pair => pair.includes(key));
        const swapKey = segmented ? pairIndex >= 0 && Boolean(state & (pairIndex < 3 ? 1 : 2)) : Boolean(state);
        const destination = swapKey ? partner(key) : key;
        relabelled[destination] = value;
        mapping[destination] = key;
      }
      frame.joints = relabelled;
      if (state) applied.push(index);
    }
    frame.label_swap_applied = Boolean(state && frame.joints !== null);
    frame.label_swap_state = segmented ? state : state ? 'swapped' : 'native';
    if (segmented) {
      frame.upper_label_swap_state = state & 1 ? 'swapped' : 'native';
      frame.lower_label_swap_state = state & 2 ? 'swapped' : 'native';
    }
    frame.label_source_mapping = frame.joints === null ? null : mapping;
    frame.label_swap_evidence = {
      accepted_pose: isAccepted,
      state_basis: isAccepted ? index === accepted[0].index ? 'native_anchor' : 'viterbi' : 'carried_state_no_pose_evidence',
      previous_accepted_frame_position: priorIndex,
      gap_frames: edge ? index - priorIndex - 1 : null,
      segment_conflict: edge?.segment_conflict ?? false,
      insufficient_evidence: !isAccepted || (edge?.insufficient_evidence ?? false),
      segments: edge?.segments ?? null,
      same_relative_cost: edge?.costs[0] ?? null,
      swapped_relative_cost: edge?.costs[1] ?? null,
      torso_order_prior_cost: isAccepted ? selectedUnary[node - 1].cost : 0,
      torso_order_prior_violation_count: isAccepted ? selectedUnary[node - 1].count : 0
    };
  });
  result.label_stabilization = {
    method: segmented ? 'offline_segment_four_state_viterbi' : 'offline_global_two_state_viterbi',
    offline_future_use: true,
    future_use_disclosure: 'Full sequence is processed offline and backtracked; not an online/causal tracker.',
    states: segmented ? ['both_native', 'upper_swapped', 'lower_swapped', 'both_swapped'] : ['native', 'all_bilateral_labels_swapped'],
    ...(segmented ? { state_encoding: 'upper bit=1, lower bit=2',
      objective_comparison_caveat: 'Self-metric only. Sum of segment means has a different scale from global mode; cross-mode objective totals are not comparable accuracy measures.',
      segment_pairs: { upper: PARTS.slice(0, 3), lower: PARTS.slice(3) },
      segment_switch_count: segmentSwitches,
      segment_switch_counts: segmentSwitchCounts } : {}),
    anchor: { frame_position: accepted[0]?.index ?? null,
      source_frame: accepted.length ? track.frames[accepted[0].index].source_frame_zero_based ?? null : null,
      policy: 'first_accepted_pose_native', anatomical_identity_verified: false, caveat: CAVEAT },
    torso_order_prior: {
      enabled: config.torsoOrderPenalty > 0,
      penalty: config.torsoOrderPenalty, minimum_separation: config.torsoMinSeparation,
      confidence_cutoff: config.torsoConfidenceCutoff,
      anchor_frame_position: accepted[0]?.index ?? null,
      native_anchor_screen_order_signs: torsoReference,
      anchor_eligibility: 'Raw first accepted native x-order sign; no confidence/separation gate on reference. Missing/nonfinite/zero separation disables that reference. Confidence/separation gates apply to current observations only.',
      eligible_segment_observation_count: config.torsoOrderPenalty > 0 ? unaryEvidence.reduce((sum, e) => sum
        + Number(Boolean(e.upper && torsoReference.upper !== null)) + Number(Boolean(e.lower && torsoReference.lower !== null)), 0) : 0,
      selected_unary_violation_count: selectedUnary.reduce((sum, u) => sum + u.count, 0),
      native_unary_violation_count: nativeUnary.reduce((sum, u) => sum + u.count, 0),
      applied_on: 'accepted poses only; other frames retain the carried state without unary evidence',
      caveat: 'Opt-in post-hoc engineering assumption for frontal no-turn clips only, not anatomical truth or independent validation. Do not use for turns, mirroring changes, or when fixed screen-order/unmirrored assumptions are invalid.'
    },
    objective_params: { ...config,
      displacement: 'Euclidean joint displacement / previous accepted pose vertical extent of confidence-qualified joints',
      robust_loss: 'Huber(r)/delta: r^2/(2*delta) for r<=delta, otherwise r-delta/2',
      confidence_weight: 'min(1, previous confidence, current confidence)',
      aggregation: segmented ? 'sum of upper and lower segment mean confidence-weighted Huber costs; complete bilateral pairs only'
        : 'sum weighted loss / comparable joint count; only complete bilateral pairs at both endpoints',
      missing_pose_policy: 'Bridge accepted poses without elapsed-time normalization; carry state on other frames, never coordinates',
      transition: segmented ? 'transitionPenalty per changed segment bit between accepted pose states'
        : 'transitionPenalty for each change between accepted pose states' },
    accepted_frame_positions: accepted.map(x => x.index),
    applied_frames: applied,
    applied_frame_count: applied.length,
    switch_count: switches,
    segment_conflict_edges: conflicts,
    segment_conflict_count: conflicts.length,
    objective: { native_temporal: nativeTemporal, selected_temporal: selectedTemporal,
      selected_transition_penalty: segmentSwitches * config.transitionPenalty,
      selected_prior_cost: priorCost, native_prior_cost: nativePriorCost,
      selected_temporal_plus_transition: selectedTemporal + segmentSwitches * config.transitionPenalty,
      selected_total: selectedTemporal + segmentSwitches * config.transitionPenalty + priorCost,
      independent_validation: false },
    limitations: [CAVEAT, segmented
      ? 'Only entire upper/lower segments may swap; individual pairs are never independently reordered. Segment conflict flags are temporal evidence, not anatomical validation.'
      : 'Only whole-body swaps are permitted. Segment conflicts are review flags, not resolved anatomical identities.',
      'Crossings, fast motion, occlusion, long gaps, and changing perspective may defeat temporal continuity.',
      'Low-confidence or null poses supply no state evidence; carried label state is not a detection or an imputed coordinate.',
      'Body height is a 2-D vertical extent proxy, not calibrated physical height. No ground-truth accuracy is measured.']
  };
  return result;
}

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node tools/stabilize-pose-labels.mjs --input tracking.json --output NEW.json [--mode global|segments]\nOffline future-using global bilateral relabelling; native anchor is not anatomical truth. Existing outputs are refused.');
    return;
  }
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--output', '--mode', '--torso-order-penalty'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || values[args[i]]) {
      throw new Error('Expected --input <tracking.json> --output <NEW.json>');
    }
    values[args[i]] = args[i + 1];
  }
  if (!values['--input'] || !values['--output']) throw new Error('Both --input and --output are required');
  const mode = values['--mode'] ?? 'global';
  if (!['global', 'segments'].includes(mode)) throw new Error('--mode must be global or segments');
  const input = JSON.parse(await readFile(values['--input'], 'utf8'));
  const options = { torsoOrderPenalty: values['--torso-order-penalty'] === undefined ? 0 : Number(values['--torso-order-penalty']) };
  const output = mode === 'segments' ? stabilizeSegmentTracking(input, options) : stabilizeTracking(input, options);
  // Exclusive create protects existing outputs (including input/output aliases).
  await writeFile(values['--output'], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${output.frames.length} frames; ${output.label_stabilization.applied_frame_count} relabelled; ${output.label_stabilization.switch_count} state switches. Offline temporal consistency only, not anatomical validation.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(`stabilize-pose-labels: ${error.message}`); process.exitCode = 1; });
}
