#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const JOINTS = ['left', 'right'].flatMap(side =>
  ['shoulder_1', 'forearm', 'hand', 'upLeg', 'leg', 'foot'].map(part => `${side}_${part}_joint`));
export const WARNING = '모델 추정3D · 골반 중심 상대좌표 · 실제 이동경로/체형메시/OpenSim/정확도 검증 아님';

export function validateInput(data) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(`Invalid world3d input: ${message}`); };
  if (!object(data) || !object(data.metadata)) fail('root metadata must be an object');
  if (data.fps !== 30) fail('fps must equal 30');
  if (!Array.isArray(data.frames) || data.frames.length !== 150) fail('exactly 150 frames required');
  data.frames.forEach((frame, i) => {
    if (!object(frame) || frame.index !== i) fail(`frame ${i}: index must equal ${i}`);
    if (!Number.isInteger(frame.source_frame_zero_based) || frame.source_frame_zero_based < 0)
      fail(`frame ${i}: source_frame_zero_based must be a nonnegative integer`);
    if (!Number.isFinite(frame.source_time_s) || frame.source_time_s < 0)
      fail(`frame ${i}: source_time_s must be finite and nonnegative`);
    if (!object(frame.joints_world_m)) fail(`frame ${i}: joints_world_m required`);
    if (Object.keys(frame.joints_world_m).length !== JOINTS.length ||
        Object.keys(frame.joints_world_m).some(name => !JOINTS.includes(name)))
      fail(`frame ${i}: expected exactly the 12 named body joints (no head/face)`);
    for (const name of JOINTS) {
      const p = frame.joints_world_m[name];
      if (!object(p) || !['x', 'y', 'z'].every(axis => Number.isFinite(p[axis])))
        fail(`frame ${i}, ${name}: finite numeric x, y and z required; no invented depth`);
      for (const key of ['visibility', 'presence'])
        if (p[key] !== undefined && p[key] !== null && !Number.isFinite(p[key])) fail(`frame ${i}, ${name}: ${key} must be finite`);
    }
  });
  return data;
}

export function createViewerHtml(input) {
  const data = validateInput(input);
  const json = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MediaPipe model world landmarks · 3D viewer</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101820;color:#eaf0f6;font:14px/1.55 system-ui,sans-serif}header{position:sticky;top:0;z-index:3;background:#322715;border-bottom:1px solid #a78137;padding:10px 18px;color:#ffe2a0;font-weight:650}main{max-width:1250px;margin:auto;padding:16px}h1{font-size:22px;margin:0 0 5px}p{margin:6px 0}.muted{color:#b4c1cf}.stage{position:relative;margin:14px 0;background:#14212e;border:1px solid #344556;border-radius:12px;overflow:hidden}canvas{display:block;width:100%;height:min(65vh,680px);min-height:320px;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}.hud{position:absolute;left:14px;top:12px;background:#101820df;padding:8px 12px;border-radius:6px;pointer-events:none;font-variant-numeric:tabular-nums}.legend{position:absolute;bottom:10px;left:14px;pointer-events:none;font-size:12px}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,select{background:#233748;color:#f1f6fb;border:1px solid #69829a;border-radius:6px;padding:8px 12px;cursor:pointer}button[aria-pressed=true]{background:#346488}input[type=range]{flex:1;min-width:160px;accent-color:#59b8e7}label{white-space:nowrap}#error{display:none;background:#5e2424;padding:18px;white-space:pre-wrap}details{margin-top:14px;border:1px solid #344556;border-radius:8px;padding:10px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}table{width:100%;border-collapse:collapse;font:12px ui-monospace,monospace}th,td{padding:5px;text-align:right;border-bottom:1px solid #344556}th:first-child,td:first-child{text-align:left}.left{color:#54baff}.right{color:#ffae60}.red{color:#ff7373}.green{color:#7ee099}.blue{color:#91aaff}#raw{overflow:auto}a{color:#96d7ff}@media(max-width:600px){header{font-size:12px}main{padding:10px}.hud{font-size:11px}canvas{height:55vh}}
</style></head><body>
<header role="note">${WARNING}</header>
<main><h1>모델 추정 XYZ · 회전 가능한 3D 골격</h1>
<p class="muted">12개 몸 관절의 모델 추정 미터값. 머리·얼굴 없음. 마우스 드래그로 궤도 회전 · 휠로 확대/축소.</p>
<p>표시 전용 회전: <strong>(X,Y,Z) = (x,−y,−z)</strong>, R = diag(1,−1,−1). X축 180° 회전, det(R)=+1. 역변환은 같은 R이며 거리·각도 보존. 원본 XYZ는 변경하지 않습니다.</p>
<p class="muted">카메라 보정·측정 좌표·전역 이동경로가 아닙니다. OpenSim 축이나 지면은 추정하지 않습니다. 원점 기준축만 표시하며 이동/평활화/프레임 보간을 추가하지 않습니다. 구와 연결선은 관절 위치 가이드이며 체형·뼈 형상 복원이 아닙니다.</p>
<div id="error" role="alert"></div>
<div class="stage"><canvas id="scene" aria-label="원근 투영과 깊이 검사를 사용하는 3D 관절 보기"></canvas>
<div class="hud"><div id="frameHud"></div><div id="sourceHud"></div><div id="viewHud"></div></div>
<div class="legend"><span class="left">● Left</span> · <span class="right">● Right</span> | 원점의 SDK raw 축: <span class="red">+x</span> <span class="green">+y</span> <span class="blue">+z</span> (각 0.2 model m)</div></div>
<div class="controls"><button id="play" type="button">재생</button><label for="scrub">프레임</label><input id="scrub" type="range" min="0" max="149" value="0" step="1"><output id="frameValue">0 / 149</output></div>
<div class="controls" style="margin-top:10px"><span>표시축 기준 보기:</span><button data-view="front" type="button">Front</button><button data-view="side" type="button">Side</button><button data-view="top" type="button">Top</button><button data-view="orbit" type="button">Orbit 3D</button><span class="muted">해부학적/카메라 기준 방향 검증 아님</span></div>
<details id="rawDetails"><summary>현재 프레임 원본 XYZ · visibility / presence</summary><div id="raw"></div></details>
<details><summary>입력 메타데이터 (좌표 해석의 검증 증명 아님)</summary><pre id="metadata"></pre></details>
<p class="muted">30 fps · 150 actual frames · 기본 일시정지 · 재생은 시간에 가장 가까운 실제 프레임을 선택하며 블렌딩하지 않습니다. visibility/presence 값으로 관절을 숨기거나 수정하지 않습니다.</p>
</main><script id="world-data" type="application/json">${json}</script>
<script>
'use strict';
window.viewerReady = false;
const D = JSON.parse(document.getElementById('world-data').textContent);
window.viewerData = D;
const names = ${JSON.stringify(JOINTS)};
const bones = ['left','right'].flatMap(s => [['shoulder_1','forearm'],['forearm','hand'],['shoulder_1','upLeg'],['upLeg','leg'],['leg','foot']].map(pair => pair.map(n => s+'_'+n+'_joint'))).concat([['left_shoulder_1_joint','right_shoulder_1_joint'],['left_upLeg_joint','right_upLeg_joint']]);
const canvas = document.getElementById('scene'), slider = document.getElementById('scrub'), playButton = document.getElementById('play');
document.getElementById('metadata').textContent = JSON.stringify(D.metadata,null,2);
let frame = 0, playing = false, anchor = 0, yaw = -.55, pitch = .18, view = 'orbit', distance;
const radius = Math.max(.3,...D.frames.flatMap(f => names.map(n => { const p=f.joints_world_m[n]; return Math.hypot(p.x,p.y,p.z); })));
distance = radius * 2.8;
const displayPoint = p => [p.x,-p.y,-p.z];
const left=[.20,.65,1],right=[1,.53,.21],neutral=[.57,.65,.74];
let gl, program, buffer, draw;
function fail(error) {
  playing=false; window.viewerReady=false; window.viewerError=String(error.message || error);
  const el=document.getElementById('error');el.style.display='block';el.textContent='WebGL 3D 표시 불가: '+window.viewerError+'\\n이 환경에서는 3D를 표시할 수 없습니다. 2D/가짜 3D 대체 화면을 만들지 않습니다. WebGL이 지원되는 브라우저에서 다시 여세요.';
  playButton.disabled=true;slider.disabled=true;
}
function updateHud() {
  const f=D.frames[frame];slider.value=frame;
  document.getElementById('frameValue').textContent=frame+' / 149';
  document.getElementById('frameHud').textContent='Frame '+frame+' / 149 · 30 fps · '+(playing?'재생 중':'일시정지');
  document.getElementById('sourceHud').textContent='Source frame (zero-based): '+f.source_frame_zero_based+' · Source time: '+f.source_time_s+' s';
  document.getElementById('viewHud').textContent='View: '+view+' · 원점 고정 · drag to rotate';
  playButton.textContent=playing?'일시정지':'재생';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  if(document.getElementById('rawDetails').open) {
    const table=document.createElement('table'),head=document.createElement('tr');
    ['SDK joint','x (m)','y (m)','z (m)','visibility','presence'].forEach(v=>{const th=document.createElement('th');th.textContent=v;head.append(th)});table.append(head);
    for(const name of names){const tr=document.createElement('tr'),p=f.joints_world_m[name];[name,p.x,p.y,p.z,p.visibility??'not supplied',p.presence??'not supplied'].forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.append(td)});table.append(tr)}
    document.getElementById('raw').replaceChildren(table);
  }
}
window.setFrame = function(i) {
  if(!Number.isInteger(i)||i<0||i>=D.frames.length)throw new RangeError('Frame must be integer 0..149');
  frame=i;anchor=performance.now()-frame/30*1000;updateHud();if(draw)draw();return D.frames[frame];
};
window.setView = function(name) {
  const views={front:[0,0],side:[Math.PI/2,0],top:[0,Math.PI/2-.001],orbit:[-.55,.18]};
  if(!Object.hasOwn(views,name))throw new RangeError('View must be front, side, top or orbit');
  [yaw,pitch]=views[name];view=name;updateHud();if(draw)draw();return name;
};
Object.defineProperty(window,'playing',{get:()=>playing,set:value=>{
  playing=Boolean(value)&&Boolean(window.viewerReady);anchor=performance.now()-frame/30*1000;updateHud();
}});
try {
  gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});
  if(!gl)throw Error('WebGL context unavailable');
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
  program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 position;attribute vec3 normal;attribute vec3 color;uniform mat4 vp;varying vec3 tint;void main(){float light=0.42+0.58*max(dot(normalize(normal),normalize(vec3(-0.4,0.8,1.0))),0.0);tint=color*light;gl_Position=vp*vec4(position,1.0);}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 tint;void main(){gl_FragColor=vec4(tint,1.0);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  ['position','normal','color'].forEach((name,i)=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12)});
  const vpLocation=gl.getUniformLocation(program,'vp');
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.055,.09,.13,1);
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const d=Math.hypot(...a);return a.map(v=>v/d)};
  function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r}
  function camera(aspect){
    const eye=[distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch)];
    const z=unit(eye),x=unit(cross([0,1,0],z)),y=cross(z,x),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    const v=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
    const near=radius*.005,far=radius*100,f=1/Math.tan(Math.PI/8);
    return multiply([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],v);
  }
  function mesh(){
    const vertices=[];const vertex=(p,n,c)=>vertices.push(...p,...n,...c);
    function sphere(center,r,c){
      const point=(a,b)=>[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
      const emit=n=>vertex(n.map((v,i)=>center[i]+r*v),n,c);
      for(let j=0;j<8;j++)for(let k=0;k<12;k++){
        const a=j*Math.PI/8,A=(j+1)*Math.PI/8,b=k*2*Math.PI/12,B=(k+1)*2*Math.PI/12;
        [point(a,b),point(A,b),point(A,B),point(a,b),point(A,B),point(a,B)].forEach(emit);
      }
    }
    function cylinder(a,b,r,c){
      if(Math.hypot(...sub(b,a))<1e-12)return;
      const w=unit(sub(b,a)),u=unit(cross(w,Math.abs(w[1])<.9?[0,1,0]:[1,0,0])),v=cross(w,u);
      const normal=t=>u.map((q,i)=>q*Math.cos(t)+v[i]*Math.sin(t));
      const emit=(p,n)=>vertex(p.map((q,i)=>q+r*n[i]),n,c);
      for(let k=0;k<10;k++){const n=normal(k*2*Math.PI/10),N=normal((k+1)*2*Math.PI/10);emit(a,n);emit(b,n);emit(b,N);emit(a,n);emit(b,N);emit(a,N)}
    }
    const points=Object.fromEntries(names.map(n=>[n,displayPoint(D.frames[frame].joints_world_m[n])]));
    for(const [a,b] of bones)cylinder(points[a],points[b],.008,a.startsWith('left')&&b.startsWith('left')?left:a.startsWith('right')&&b.startsWith('right')?right:neutral);
    for(const name of names)sphere(points[name],.018,name.startsWith('left')?left:right);
    const origin=[0,0,0];
    [[[.2,0,0],[1,.25,.25]],[[0,-.2,0],[.3,.9,.45]],[[0,0,-.2],[.4,.5,1]]].forEach(([end,c])=>{cylinder(origin,end,.003,c);sphere(end,.007,c)});
    sphere(origin,.009,[.95,.95,.95]);return new Float32Array(vertices);
  }
  draw=function(){
    const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(vpLocation,false,camera(w/h));
    const vertices=mesh();gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
  };
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Error('WebGL context lost; reload to retry'))});
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.009;pitch=Math.max(-Math.PI/2+.001,Math.min(Math.PI/2-.001,pitch+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];view='orbit';updateHud();draw()});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('lostpointercapture',()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(radius*.6,Math.min(radius*15,distance*Math.exp(Math.max(-300,Math.min(300,e.deltaY))*.001)));draw()},{passive:false});
  window.addEventListener('resize',()=>draw());
  slider.addEventListener('input',()=>{window.playing=false;window.setFrame(Number(slider.value))});
  playButton.addEventListener('click',()=>window.playing=!playing);
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>window.setView(b.dataset.view)));
  document.getElementById('rawDetails').addEventListener('toggle',updateHud);
  updateHud();draw();window.viewerReady=true;
  function tick(now){if(playing){const selected=Math.round((now-anchor)*30/1000)%150;if(selected!==frame){frame=selected;updateHud();draw()}}requestAnimationFrame(tick)}requestAnimationFrame(tick);
} catch(error){updateHud();fail(error)}
</script></body></html>`;
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node tools/create-world3d-viewer.mjs --input world.json --output NEW.html\nRequires metadata, fps:30 and 150 frames of 12 finite world XYZ joints. Offline WebGL; output is exclusively created.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--output'].includes(args[i]) || !args[i + 1] || options[args[i]])
      throw new Error('Usage: --input JSON --output NEW.html');
    options[args[i]] = args[i + 1];
  }
  if (!options['--input'] || !options['--output']) throw new Error('Usage: --input JSON --output NEW.html');
  const data = JSON.parse(fs.readFileSync(options['--input'], 'utf8'));
  const html = createViewerHtml(data);
  const output = path.resolve(options['--output']);
  fs.writeFileSync(output, html, { flag: 'wx' });
  console.log(JSON.stringify({ output, frames: data.frames.length, fps: data.fps, joints: JOINTS.length,
    raw_coordinates_modified: false, display_rotation: [1,-1,-1], interpolation: false, offline: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
