import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stabilizeTracking } from '../tools/stabilize-pose-labels.mjs';

const parts = ['shoulder_1', 'forearm', 'hand', 'upLeg', 'leg', 'foot'];
function pose(step = 0) {
  return Object.fromEntries(parts.flatMap((part, i) => ['left', 'right'].map((side, j) =>
    [`${side}_${part}_joint`, { x: (j ? 80 : 20) + step, y: i * 30,
      confidence: 0.8 + i * 0.01 + j * 0.001 }])));
}
function swap(joints, subset = parts) {
  return Object.fromEntries(Object.entries(joints).map(([key, value]) => {
    const part = key.replace(/^(left|right)_/, '').replace(/_joint$/, '');
    return [subset.includes(part) ? key.replace(/^(left|right)/, side => side === 'left' ? 'right' : 'left') : key, value];
  }));
}
const multiset = joints => Object.values(joints).map(p => JSON.stringify([p?.x, p?.y, p?.confidence])).sort();
const track = frames => ({ model: 'synthetic', frames: frames.map((joints, index) => ({ index, joints })) });
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('full bilateral swap block is corrected relative to native anchor', () => {
  const truth = Array.from({ length: 14 }, (_, i) => pose(i * 0.1));
  const input = track(truth.map((p, i) => i >= 4 && i <= 9 ? swap(p) : p));
  const out = stabilizeTracking(input);
  out.frames.forEach((f, i) => assert.deepEqual(f.joints, truth[i]));
  assert.deepEqual(out.label_stabilization.applied_frames, [4, 5, 6, 7, 8, 9]);
  assert.equal(out.label_stabilization.switch_count, 2);
  assert.equal(out.frames[4].label_source_mapping.left_hand_joint, 'right_hand_joint');
  assert(out.label_stabilization.objective.selected_total < out.label_stabilization.objective.native_temporal);
});

test('legitimate ankle crossing is retained, not forced into per-pair x order', () => {
  const input = track(Array.from({ length: 13 }, (_, i) => {
    const p = pose();
    p.left_foot_joint.x = 20 + i * 5;
    p.right_foot_joint.x = 80 - i * 5;
    return p;
  }));
  const out = stabilizeTracking(input);
  assert.deepEqual(out.frames.map(f => f.joints), input.frames.map(f => f.joints));
  assert.equal(out.label_stabilization.applied_frame_count, 0);
  assert(out.frames.at(-1).joints.left_foot_joint.x > out.frames.at(-1).joints.right_foot_joint.x);
});

test('null frames, low confidence, missing joints and exact coordinate/confidence multisets survive', () => {
  const low = pose();
  Object.values(low).forEach(p => { p.confidence = 0.299; });
  low.left_hand_joint.confidence = 0;
  delete low.right_foot_joint;
  const input = track([null, low, pose(), swap(pose()), low, null, swap(pose())]);
  input.frames.splice(1, 0, null);
  const before = JSON.stringify(input);
  const out = stabilizeTracking(freeze(input));
  assert.equal(JSON.stringify(input), before);
  assert.equal(out.frames[1], null);
  for (let i = 0; i < input.frames.length; i++) {
    const a = input.frames[i], b = out.frames[i];
    if (a === null) { assert.equal(b, null); continue; }
    if (a.joints === null) { assert.equal(b.joints, null); assert.equal(b.label_swap_applied, false); continue; }
    assert.deepEqual(multiset(b.joints), multiset(a.joints));
    for (const [destination, source] of Object.entries(b.label_source_mapping)) assert.deepEqual(b.joints[destination], a.joints[source]);
    assert.notEqual(b.joints, a.joints);
  }
  assert.equal(out.label_stabilization.anchor.frame_position, 3);
  assert.equal(out.frames[5].label_swap_evidence.accepted_pose, false);
  assert.equal(out.frames[5].label_swap_state, 'swapped');
});

test('native anchor is explicitly ambiguous, even when the first detector labels were reversed', () => {
  const input = track([swap(pose()), pose(), pose()]);
  const out = stabilizeTracking(input);
  assert.deepEqual(out.frames[0].joints, input.frames[0].joints);
  assert.deepEqual(out.frames[1].joints, input.frames[0].joints);
  assert.equal(out.label_stabilization.anchor.anatomical_identity_verified, false);
  assert.match(out.label_stabilization.anchor.caveat, /wrong anchor is retained/);
  assert.equal(out.label_stabilization.objective.independent_validation, false);
  assert.equal(out.label_stabilization.offline_future_use, true);
});

test('opposing upper/lower evidence is flagged, not resolved by separate pair swaps', () => {
  const input = track([pose(), swap(pose(), ['upLeg', 'leg', 'foot'])]);
  const out = stabilizeTracking(input);
  const evidence = out.frames[1].label_swap_evidence;
  assert.equal(evidence.segment_conflict, true);
  assert.equal(evidence.segments.upper.preferred_relative_state, 'same');
  assert.equal(evidence.segments.lower.preferred_relative_state, 'swapped');
  assert.deepEqual(out.label_stabilization.segment_conflict_edges, [[0, 1]]);
  assert([JSON.stringify(input.frames[1].joints), JSON.stringify(swap(input.frames[1].joints))].includes(JSON.stringify(out.frames[1].joints)));
});

test('confidence cutoff excludes subthreshold evidence without deleting measurements', () => {
  const p = pose(); Object.values(p).forEach(x => { x.confidence = 0.299999; });
  const out = stabilizeTracking(track([p, null]));
  assert.equal(out.label_stabilization.anchor.frame_position, null);
  assert.deepEqual(out.frames[0].joints, p);
  assert.equal(out.label_stabilization.switch_count, 0);
  const boundary = pose(); Object.values(boundary).forEach(x => { x.confidence = 0.3; });
  assert.equal(stabilizeTracking(track([boundary])).label_stabilization.anchor.frame_position, 0);
});

test('small transition penalty rejects gratuitous flips when evidence is negligible', () => {
  const p = pose();
  Object.values(p).forEach(x => { x.x *= 0.00001; });
  const out = stabilizeTracking(track([p, swap(p), p]));
  assert.equal(out.label_stabilization.switch_count, 0);
  assert.equal(out.label_stabilization.applied_frame_count, 0);
});

test('empty input, invalid input and invalid options are explicit', () => {
  assert.equal(stabilizeTracking(track([])).frames.length, 0);
  assert.throws(() => stabilizeTracking([]), /frames array/);
  assert.throws(() => stabilizeTracking(track([pose()]), { transitionPenalty: -1 }), /Invalid/);
  assert.throws(() => stabilizeTracking(track([pose()]), { confidenceCutof: 0.3 }), /Unknown/);
});

test('CLI documents offline use and refuses to overwrite an existing file', () => {
  const script = fileURLToPath(new URL('../tools/stabilize-pose-labels.mjs', import.meta.url));
  const existing = fileURLToPath(import.meta.url);
  const original = readFileSync(existing, 'utf8');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /not anatomical truth/);
  const input = fileURLToPath(new URL('../assets/toaga-continuous-predictions.json', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--input', input, '--output', existing], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /EEXIST/);
  assert.equal(readFileSync(existing, 'utf8'), original);
});

test('Viterbi path attains exhaustive anchored two-state objective minimum', () => {
  const input = track(Array.from({ length: 7 }, (_, i) => {
    const p = pose(i * 1.7);
    if (i === 3) { p.left_hand_joint.x += 35; p.right_leg_joint.y += 20; }
    return [1, 2, 5].includes(i) ? swap(p) : p;
  }));
  const out = stabilizeTracking(input);
  const penalty = out.label_stabilization.objective_params.transitionPenalty;
  let minimum = Infinity;
  for (let mask = 0; mask < 2 ** (input.frames.length - 1); mask++) {
    const states = [0, ...Array.from({ length: input.frames.length - 1 }, (_, i) => (mask >> i) & 1)];
    let cost = 0;
    for (let i = 1; i < states.length; i++) {
      const changed = states[i - 1] !== states[i];
      const evidence = out.frames[i].label_swap_evidence;
      cost += changed ? evidence.swapped_relative_cost + penalty : evidence.same_relative_cost;
    }
    minimum = Math.min(minimum, cost);
  }
  assert(Math.abs(out.label_stabilization.objective.selected_total - minimum) < 1e-12);
});

const { stabilizeSegmentTracking } = await import('../tools/stabilize-pose-labels.mjs');
for (const [segment, selectedParts, expectedState] of [
  ['upper', parts.slice(0, 3), 1], ['lower', parts.slice(3), 2]
]) test(`segments: ${segment}-only flip block corrected without swapping other segment`, () => {
  const truth = Array.from({ length: 9 }, (_, i) => pose(i * 0.1));
  const input = track(truth.map((p, i) => i >= 2 && i <= 5 ? swap(p, selectedParts) : p));
  const out = stabilizeSegmentTracking(input);
  out.frames.forEach((f, i) => assert.deepEqual(f.joints, truth[i]));
  assert.equal(out.frames[2].label_swap_state, expectedState);
  assert.equal(out.frames[0].upper_label_swap_state, 'native');
  assert.equal(out.frames[0].lower_label_swap_state, 'native');
  assert.deepEqual(out.label_stabilization.applied_frames, [2, 3, 4, 5]);
  assert.equal(out.label_stabilization.segment_switch_count, 2);
  assert.equal(out.label_stabilization.objective.independent_validation, false);
});

test('segments: legitimate ankle crossing is not independently reordered', () => {
  const input = track(Array.from({ length: 13 }, (_, i) => {
    const p = pose(); p.left_foot_joint.x = 20 + i * 5; p.right_foot_joint.x = 80 - i * 5; return p;
  }));
  const out = stabilizeSegmentTracking(input);
  assert.deepEqual(out.frames.map(f => f.joints), input.frames.map(f => f.joints));
  assert.equal(out.label_stabilization.applied_frame_count, 0);
});

test('segments: exact measurement multisets, null/low-confidence preservation and immutable input', () => {
  const low = pose(); Object.values(low).forEach(p => { p.confidence = 0.1; });
  const input = track([pose(), swap(pose(), parts.slice(0, 3)), low, null, swap(pose(), parts.slice(3))]);
  input.frames.push(null);
  const original = JSON.stringify(input);
  const out = stabilizeSegmentTracking(freeze(input));
  assert.equal(JSON.stringify(input), original);
  assert.equal(out.frames.at(-1), null);
  out.frames.forEach((f, i) => {
    if (f === null) return;
    if (f.joints === null) { assert.equal(input.frames[i].joints, null); return; }
    assert.deepEqual(multiset(f.joints), multiset(input.frames[i].joints));
    for (const [destination, source] of Object.entries(f.label_source_mapping)) assert.deepEqual(f.joints[destination], input.frames[i].joints[source]);
  });
  assert.equal(out.frames[2].label_swap_evidence.accepted_pose, false);
  assert.equal(out.frames[2].upper_label_swap_state, 'swapped');
});

test('segments: four-state Viterbi matches brute-force anchored optimum', () => {
  const input = track([pose(), swap(pose(1), parts.slice(0, 3)), swap(pose(2)), swap(pose(3), parts.slice(3)), pose(4)]);
  const out = stabilizeSegmentTracking(input);
  const penalty = out.label_stabilization.objective_params.transitionPenalty;
  let minimum = Infinity;
  for (let path = 0; path < 4 ** (input.frames.length - 1); path++) {
    const states = [0, ...Array.from({ length: input.frames.length - 1 }, (_, i) => (path >> (i * 2)) & 3)];
    let total = 0;
    for (let i = 1; i < states.length; i++) {
      const parity = states[i - 1] ^ states[i];
      const s = out.frames[i].label_swap_evidence.segments;
      total += s.upper[parity & 1 ? 'swapped' : 'same'] + s.lower[parity & 2 ? 'swapped' : 'same'];
      total += ((parity & 1) + ((parity >> 1) & 1)) * penalty;
    }
    minimum = Math.min(minimum, total);
  }
  assert(Math.abs(out.label_stabilization.objective.selected_total - minimum) < 1e-12);
  assert.equal(out.label_stabilization.offline_future_use, true);
});

test('CLI accepts segments mode but still refuses existing output; rejects invalid mode', () => {
  const script = fileURLToPath(new URL('../tools/stabilize-pose-labels.mjs', import.meta.url));
  const input = fileURLToPath(new URL('../assets/toaga-continuous-predictions.json', import.meta.url));
  const output = fileURLToPath(import.meta.url);
  const run = spawnSync(process.execPath, [script, '--input', input, '--output', output, '--mode', 'segments'], { encoding: 'utf8' });
  assert.match(run.stderr, /EEXIST/);
  const bad = spawnSync(process.execPath, [script, '--input', input, '--output', output, '--mode', 'invalid'], { encoding: 'utf8' });
  assert.match(bad.stderr, /mode must be global or segments/);
});

for (const [name, stabilize] of [['global', stabilizeTracking], ['segments', stabilizeSegmentTracking]]) {
  test(`${name}: opt-in torso-order prior resists distal-driven screen-order drift`, () => {
    const input = track([pose(), swap(pose(), ['forearm', 'hand', 'leg', 'foot'])]);
    const original = JSON.stringify(input);
    const off = stabilize(input);
    assert.equal(off.frames[1].label_swap_applied, true);
    assert.deepEqual(stabilize(input, { torsoOrderPenalty: 0 }), off);
    const on = stabilize(freeze(input), { torsoOrderPenalty: 0.5 });
    assert.equal(on.frames[1].label_swap_applied, false);
    assert.equal(on.label_stabilization.torso_order_prior.enabled, true);
    assert.deepEqual(on.label_stabilization.torso_order_prior.native_anchor_screen_order_signs, { upper: -1, lower: -1 });
    assert.equal(on.label_stabilization.objective.independent_validation, false);
    assert.equal(on.label_stabilization.objective.selected_prior_cost, 0);
    assert.equal(on.label_stabilization.objective.selected_total,
      on.label_stabilization.objective.selected_temporal_plus_transition + on.label_stabilization.objective.selected_prior_cost);
    assert.equal(JSON.stringify(input), original);
    on.frames.forEach((f, i) => assert.deepEqual(multiset(f.joints), multiset(input.frames[i].joints)));
  });
}

test('torso prior gates unreliable/close pairs and uses raw reversal with effective swapped sign', () => {
  const close = pose(); close.left_upLeg_joint.x = 49; close.right_upLeg_joint.x = 51;
  const input = track([close, swap(close)]);
  const out = stabilizeSegmentTracking(input, { torsoOrderPenalty: 0.5 });
  assert.equal(out.label_stabilization.torso_order_prior.native_anchor_screen_order_signs.lower, -1);
  assert.equal(out.label_stabilization.torso_order_prior.eligible_segment_observation_count, 2);
  assert.equal(out.frames[1].upper_label_swap_state, 'swapped');
  assert.equal(out.label_stabilization.objective.selected_prior_cost, 0);
  assert.throws(() => stabilizeTracking(input, { torsoOrderPenalty: -1 }), /Invalid/);
  assert.throws(() => stabilizeTracking(input, { torsoConfidenceCutoff: 2 }), /Invalid/);
});

test('four-state optimum includes per-frame torso unary costs, separate from temporal metric', () => {
  const input = track([pose(), swap(pose(), ['forearm', 'hand', 'leg', 'foot']), swap(pose(1)), pose(2)]);
  const penalty = 0.03;
  const out = stabilizeSegmentTracking(input, { torsoOrderPenalty: penalty });
  let minimum = Infinity;
  for (let path = 0; path < 4 ** (input.frames.length - 1); path++) {
    const states = [0, ...Array.from({ length: input.frames.length - 1 }, (_, i) => (path >> (i * 2)) & 3)];
    let cost = 0;
    for (let i = 1; i < states.length; i++) {
      const parity = states[i - 1] ^ states[i], evidence = out.frames[i].label_swap_evidence.segments;
      cost += evidence.upper[parity & 1 ? 'swapped' : 'same'] + evidence.lower[parity & 2 ? 'swapped' : 'same'];
      cost += ((parity & 1) + ((parity >> 1) & 1)) * 0.005;
      for (const [part, bit] of [['shoulder_1', 1], ['upLeg', 2]]) {
        const left = input.frames[i].joints[`left_${part}_joint`], right = input.frames[i].joints[`right_${part}_joint`];
        if (Math.sign(left.x - right.x) * (states[i] & bit ? -1 : 1) !== -1) cost += penalty * Math.min(left.confidence, right.confidence);
      }
    }
    minimum = Math.min(minimum, cost);
  }
  assert(Math.abs(out.label_stabilization.objective.selected_total - minimum) < 1e-12);
});
