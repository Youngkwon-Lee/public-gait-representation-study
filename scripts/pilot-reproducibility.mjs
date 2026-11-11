import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {cli} from './lib.mjs';
const options=cli(['audit','out-dir']);const source=path.resolve(options.audit),root=path.resolve(options['out-dir']);assert(!fs.existsSync(root),'Refusing to overwrite existing output');
const raw=JSON.parse(fs.readFileSync(source,'utf8'));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function icc1(x){const n=x.length,k=x[0].length;assert(n>1&&k>1);assert(x.every(r=>r.length===k&&r.every(Number.isFinite)));const means=x.map(mean),grand=mean(means);const msb=k*means.reduce((s,v)=>s+(v-grand)**2,0)/(n-1);const msw=x.reduce((s,r,i)=>s+r.reduce((ss,v)=>ss+(v-means[i])**2,0),0)/(n*(k-1));const denominator=msb+(k-1)*msw;return {single:denominator>0?(msb-msw)/denominator:null,meanK:msb>0?(msb-msw)/msb:null,withinPersonSD:Math.sqrt(msw),msb,msw};}
function close(a,b){assert(Math.abs(a-b)<1e-10)}
const fixture=[[.9,1,1.1],[1.9,2,2.1],[2.9,3,3.1]];const fi=icc1(fixture);close(fi.single,2.99/3.02);close(icc1([[1,1,1],[2,2,2],[3,3,3]]).single,1);assert.equal(icc1([[1,1],[1,1]]).single,null);close(icc1(fixture.map(r=>r.map(v=>v*10+7))).single,fi.single);close(icc1(fixture.map(r=>[...r].reverse())).single,fi.single);close(fi.meanK,3*fi.single/(1+2*fi.single));
const draw=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
function quantile(v,p){const a=[...v].sort((a,b)=>a-b),i=(a.length-1)*p,j=Math.floor(i);return a[j]+(a[Math.ceil(i)]-a[j])*(i-j)}
const dem=raw['01_demography_sppb_mmse.xlsx'].sheets[0].cached_data;
const ages=new Map(dem.filter(r=>typeof r[0]==='string'&&/^Subject \d+$/.test(r[0])).map(r=>[r[0],r[2]]));
const data=raw['05_gait_parameters.xlsx'].sheets[0].cached_data;
const headers=data[0].map(String).map(s=>s.trim());const at=Object.fromEntries(headers.map((h,i)=>[h,i]));const groups=new Map();let subject;
for(const row of data.slice(1)){if(row[0]!==null)subject=row[0];assert(ages.has(subject));const get=n=>row[at[n]];const si=(l,r)=>{assert(l+r>0);return 200*Math.abs(l-r)/(l+r)};const derived={walk:get('Walk'),speed:(get('Left_Walking_Speed')+get('Right_Walking_Speed'))/2,stepTimeSI:si(get('Left_Step_Time'),get('Right_Step_Time')),stepLengthSI:si(get('Left_Step_Length'),get('Right_Step_Length'))};if(!groups.has(subject))groups.set(subject,[]);groups.get(subject).push(derived);}
assert.equal(groups.size,44);for(const a of groups.values()){assert.equal(a.length,5);assert.deepEqual(a.map(r=>r.walk).sort(),[1,2,3,4,5]);}
const B=5000,seed=20261110;const rng=draw(seed);const results=[];
for(const [sample,filter]of [['all_44',id=>true],['age65plus_31',id=>ages.get(id)>=65]]){
 const selected=[...groups.entries()].filter(([id])=>filter(id));
 for(const [metric,label,units]of [['speed','Mean bilateral walking speed','source speed units; Vicon convention m/s needs source check'],['stepTimeSI','Absolute step-time symmetry index','percentage points'],['stepLengthSI','Absolute step-length symmetry index','percentage points']]){
  const x=selected.map(([,r])=>r.map(v=>v[metric]));const stat=icc1(x);const bootSingle=[],bootMean=[];
  for(let b=0;b<B;b++){const resampled=Array.from({length:x.length},()=>x[Math.floor(rng()*x.length)]);const a=icc1(resampled);if(a.single!==null)bootSingle.push(a.single);if(a.meanK!==null)bootMean.push(a.meanK);}
  results.push({sample,metric,label,units,n_participants:x.length,k_retained_walks:5,participant_mean:mean(x.map(mean)),icc_1_1:stat.single,icc_1_1_ci95:[quantile(bootSingle,.025),quantile(bootSingle,.975)],icc_1_5:stat.meanK,icc_1_5_ci95:[quantile(bootMean,.025),quantile(bootMean,.975)],pooled_within_person_sd:stat.withinPersonSD,bootstrap_valid:bootSingle.length});
 }
}
const output={status:'EXPLORATORY_PILOT_NOT_CONFIRMATORY',created_utc:new Date().toISOString(),input_sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),software:{node:process.version,spreadsheet_reader:'User-supplied cached workbook audit JSON; workbook extraction is outside this script'},method:{icc:'One-way random-effects ICC(1,1) and ICC(1,5), conditional on the five quality-selected retained walks; trial positions treated as exchangeable, not confirmed chronological order.',bootstrap:'Participant-cluster percentile bootstrap; resample entire five-walk vectors; 5000 replicates per metric/sample.',seed,replicates:B,self_tests_passed:6,selection:'Three metrics chosen for feasibility before association testing; results are exploratory, not a preregistered confirmatory analysis.'},limitations:['Original protocol collected ten 12-m walks and retained the best five. This analysis cannot estimate the effect of selection because discarded walks are unavailable.','These are retained-trial repeatability estimates, NOT between-day test-retest reliability, smartphone/AI validation, or clinical meaningful-change thresholds.','Within-person SD includes biological performance variation and measurement/processing variation, which cannot be separated.','Absolute symmetry indices are nonnegative and can have a positive noise floor; low ICC can reflect restricted between-participant variation, not only within-participant error.','Percentile bootstrap intervals are exploratory and may be biased near ICC boundaries in small samples.','ICC(1,5) is derived from the same estimated variance components, not an independent empirical validation of averaging five walks.','No fall prediction, clinical score association tests, outcome-based variable selection, model training, or p-values computed.','Independent participant counts are 44 (primary) and 31 (age >=65 sensitivity), not 220.','Institutional ethics/IRB determination, analysis-plan review and complete novelty review remain unresolved.'],results};
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'pilot_reproducibility.json'),JSON.stringify(output,null,2));
const csvHeaders=['sample','metric','n_participants','k_retained_walks','participant_mean','icc_1_1','icc_1_1_ci95_lower','icc_1_1_ci95_upper','icc_1_5','icc_1_5_ci95_lower','icc_1_5_ci95_upper','pooled_within_person_sd'];
const csv=[csvHeaders.join(','),...results.map(r=>[r.sample,r.metric,r.n_participants,5,r.participant_mean,r.icc_1_1,...r.icc_1_1_ci95,r.icc_1_5,...r.icc_1_5_ci95,r.pooled_within_person_sd].join(','))].join('\n')+'\n';fs.writeFileSync(path.join(root,'pilot_reproducibility.csv'),csv);
console.log(JSON.stringify({self_tests:6,seed,bootstrap:B,results},null,2));
