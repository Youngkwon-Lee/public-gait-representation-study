import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOINTS, WARNING, validateInput, createViewerHtml } from '../tools/create-world3d-viewer.mjs';

const cli = fileURLToPath(new URL('../tools/create-world3d-viewer.mjs', import.meta.url));
function fixture() {
  return { metadata: { source: 'synthetic test only', coordinate_system: 'MediaPipe worldLandmarks' }, fps: 30,
    frames: Array.from({ length: 150 }, (_, index) => ({ index, source_frame_zero_based: 900 + index,
      source_time_s: (900 + index) / 30, joints_world_m: Object.fromEntries(JOINTS.map((name, j) => [name,
        { x: (j % 2 ? .2 : -.2) + index * .0001, y: -.7 + j * .12, z: j * .03 - index * .0002, visibility: .95, presence: .9 }])) })) };
}
function runtime(data, unavailable = false) {
  const elements = new Map(), handlers = new Map(), calls = { draws: 0 }, views = [];
  function element(id) {
    return { id, value: '0', open: false, style: {}, dataset: {}, clientWidth: 1000, clientHeight: 600,
      textContent: '', append() {}, replaceChildren() {}, setAttribute() {},
      addEventListener(name, fn) { handlers.set(id + ':' + name, fn); }, setPointerCapture() {},
      getContext() { return unavailable ? null : gl; } };
  }
  const gl = { COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
    ARRAY_BUFFER: 5, FLOAT: 6, DEPTH_TEST: 7, LEQUAL: 8, COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 32, DYNAMIC_DRAW: 9, TRIANGLES: 10,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true,
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
    useProgram() {}, createBuffer: () => ({}), bindBuffer() {}, getAttribLocation: () => 0,
    enableVertexAttribArray() {}, vertexAttribPointer() {}, getUniformLocation: () => ({}),
    enable(value) { calls.depthTest = value; }, depthFunc() {}, clearColor() {}, viewport() {}, clear() {},
    uniformMatrix4fv(loc, transpose, matrix) { calls.matrix = Array.from(matrix); },
    bufferData(target, vertices) { calls.vertices = vertices; }, drawArrays() { calls.draws++; } };
  for (const name of ['front', 'side', 'top', 'orbit']) { const b = element(name); b.dataset.view = name; views.push(b); }
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    querySelectorAll: () => views, createElement: () => element('new') };
  document.getElementById('world-data').textContent = JSON.stringify(data);
  let now = 1000, animation;
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const context = vm.createContext({ window, document, console, Float32Array,
    performance: { now: () => now }, requestAnimationFrame: callback => { animation = callback; } });
  const html = createViewerHtml(data), script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { window, elements, handlers, calls, advance(milliseconds) { now += milliseconds; animation(now); } };
}

test('preserves every frame and all raw model XYZ values, including optional values', () => {
  const data = fixture(), before = JSON.stringify(data);
  assert.equal(validateInput(data), data);
  const html = createViewerHtml(data);
  const embedded = JSON.parse(html.match(/<script id="world-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(embedded, data); assert.equal(JSON.stringify(data), before);
  assert.ok(html.includes(WARNING)); assert.ok(html.includes('diag(1,−1,−1)'));
  assert.ok(html.includes('det(R)=+1')); assert.ok(html.includes('gl.enable(gl.DEPTH_TEST)'));
  assert.ok(!/<script[^>]+src=|<img\b|https?:\/\//i.test(html));
});

test('strictly rejects incomplete frames, missing/invented depth and nonfinite coordinates', () => {
  for (const mutate of [d => d.fps = 29.97, d => d.frames.pop(), d => delete d.metadata,
    d => d.frames[2].index = 3, d => d.frames[1].source_frame_zero_based = -1,
    d => d.frames[1].source_time_s = Infinity,
    d => delete d.frames[3].joints_world_m[JOINTS[0]].z,
    d => d.frames[3].joints_world_m[JOINTS[0]].z = NaN,
    d => d.frames[3].joints_world_m[JOINTS[0]].x = '0.2',
    d => d.frames[3].joints_world_m[JOINTS[0]].presence = NaN,
    d => d.frames[3].joints_world_m.nose = {x:0,y:0,z:0},
    d => delete d.frames[3].joints_world_m[JOINTS[0]]]) {
    const data = fixture(); mutate(data); assert.throws(() => validateInput(data), /Invalid world3d input/);
  }
});

test('metadata cannot break the embedded JSON or inject script/html', () => {
  const data = fixture(); data.metadata.note = '</script><script>alert(1)</script>&\u2028';
  const html = createViewerHtml(data);
  assert.ok(!html.includes(data.metadata.note));
  assert.equal(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]).metadata.note, data.metadata.note);
});

test('CLI creates output exclusively, accepts either option order, and refuses malformed input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world3d-viewer-test-'));
  try {
    const input = path.join(dir, 'input.json'), output = path.join(dir, 'new.html');
    fs.writeFileSync(input, JSON.stringify(fixture()));
    const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    const result = run(['--output', output, '--input', input]); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).frames, 150); const first = fs.readFileSync(output, 'utf8');
    assert.equal(run(['--input', input, '--output', output]).status, 1); assert.equal(fs.readFileSync(output, 'utf8'), first);
    assert.equal(run(['--input', input, '--out', output]).status, 1);
    const bad = fixture(); delete bad.frames[0].joints_world_m[JOINTS[0]].z;
    fs.writeFileSync(input, JSON.stringify(bad));
    const other = path.join(dir, 'bad.html');assert.equal(run(['--input', input, '--output', other]).status, 1);assert.equal(fs.existsSync(other), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('viewer API renders depth-tested geometry, switches perspective, and selects actual frames', () => {
  const data = fixture(), r = runtime(data);
  assert.equal(r.window.viewerReady, true); assert.equal(r.window.playing, false);
  assert.equal(r.calls.depthTest, 7); assert.ok(r.calls.vertices.length > 1000);
  assert.ok(r.calls.vertices.every(Number.isFinite)); assert.ok(r.calls.matrix.every(Number.isFinite));
  const before = r.calls.matrix.slice(); r.window.setView('side'); assert.notDeepEqual(r.calls.matrix, before);
  for (const name of ['front', 'top', 'orbit']) { r.window.setView(name); assert.ok(r.calls.matrix.every(Number.isFinite)); }
  assert.throws(() => r.window.setView('floor'), /View/);
  assert.throws(() => r.window.setFrame(150), /Frame/); assert.throws(() => r.window.setFrame(.5), /Frame/);
  r.window.setFrame(149); assert.ok(r.elements.get('sourceHud').textContent.includes('1049'));
  assert.deepEqual(JSON.parse(JSON.stringify(r.window.viewerData)), data);
  r.window.setFrame(0);r.window.playing = true;r.advance(18);assert.equal(r.elements.get('scrub').value, 1);
  r.advance(18);assert.equal(r.elements.get('scrub').value, 1);
  r.advance(4964);assert.equal(r.elements.get('scrub').value, 0);
  r.window.playing = false;r.advance(1000);assert.equal(r.elements.get('scrub').value, 0);
  const rotated = r.calls.matrix.slice();r.handlers.get('scene:pointerdown')({button:0,clientX:0,clientY:0,pointerId:1});
  r.handlers.get('scene:pointermove')({clientX:40,clientY:10});assert.notDeepEqual(r.calls.matrix, rotated);
  const zoomed = r.calls.matrix.slice();r.handlers.get('scene:wheel')({preventDefault(){},deltaY:100});assert.notDeepEqual(r.calls.matrix, zoomed);
});

test('WebGL absence produces an explicit error and never a fake 3D fallback', () => {
  const r = runtime(fixture(), true);
  assert.equal(r.window.viewerReady, false);assert.match(r.window.viewerError, /WebGL context unavailable/);
  assert.equal(r.elements.get('error').style.display, 'block');assert.match(r.elements.get('error').textContent, /가짜 3D/);
  assert.equal(r.calls.draws, 0);assert.equal(r.elements.get('play').disabled, true);
});

test('Absent optional scores stay null without inventing confidence or altering XYZ',()=>{const d=fixture();d.frames[0].joints_world_m[JOINTS[0]].presence=null;d.frames[0].joints_world_m[JOINTS[0]].visibility=null;assert.equal(validateInput(d),d);const h=createViewerHtml(d);const embedded=JSON.parse(h.match(/<script id="world-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.equal(embedded.frames[0].joints_world_m[JOINTS[0]].presence,null);assert.equal(embedded.frames[0].joints_world_m[JOINTS[0]].z,d.frames[0].joints_world_m[JOINTS[0]].z)});
