import pathlib,json,hashlib,struct,math,time,sys,copy,xml.etree.ElementTree as ET
import argparse,os
p=argparse.ArgumentParser(description='Bounded native OpenSim table and generic-frame check; NOT Scaling or IK')
for flag in ('input-dir','out-dir','model','marker-set','contract'):p.add_argument('--'+flag,required=True)
a=p.parse_args()
INPUT=pathlib.Path(a.input_dir).resolve();ROOT=pathlib.Path(a.out_dir).resolve()
assert not ROOT.exists(),'Refusing to overwrite existing output directory'
SOURCE=INPUT/'markers_native_axes.trc'
e=json.loads(pathlib.Path(a.contract).resolve().read_text())
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==e['source_native_trc_sha256']
MODEL=pathlib.Path(a.model).resolve();MARKERS=pathlib.Path(a.marker_set).resolve()
expected_model='3c358cfe977965735337d0d3577e8a0a90f0d6c0fb832a023b910cbd6b531d38'
expected_markers='16a0aa5028b19c0576bc2058b8f425fffc810150b714aa4b7aa75c4163a20c90'
assert hashlib.sha256(MODEL.read_bytes()).hexdigest()==expected_model
assert hashlib.sha256(MARKERS.read_bytes()).hexdigest()==expected_markers
assert all(b'<!DOCTYPE' not in p.read_bytes().upper() and b'<!ENTITY' not in p.read_bytes().upper() for p in (MODEL,MARKERS))
ROOT.mkdir(parents=True);os.chdir(ROOT)
lines=SOURCE.read_text().splitlines();headers=lines[1].split('\t');values=lines[2].split('\t');assert dict(zip(headers,values))['Units']=='mm'
rows=[[float(x) for x in s.split('\t')] for s in lines[6:] if s.strip()]
assert len(rows)==602 and all(len(r)==74 and all(math.isfinite(x) for x in r) for r in rows)
for i,r in enumerate(rows):assert r[0]==566+i and abs(r[1]-i/100)<1e-12
rotated=[]
for i,r in enumerate(rows):
 xyz=[]
 for j in range(24):
  x,y,z=r[2+3*j:5+3*j];xyz.extend([y*.001,z*.001,x*.001])
 rotated.append([str(int(r[0])),lines[6+i].split('\t')[1]]+[format(x,'.17g') for x in xyz])
TARGET=ROOT/'markers_osim_axes_candidate_m.trc'
head=[lines[0].replace('markers_native_axes.trc',TARGET.name),lines[1],'\t'.join('m' if k=='Units' else v for k,v in zip(headers,values)),lines[3],lines[4],'']
TARGET.write_text('\n'.join(head+['\t'.join(r) for r in rotated])+'\n')
import opensim as osim
osim.Logger.setLevelString('warn');started=time.monotonic()
a=osim.TimeSeriesTableVec3(str(SOURCE));b=osim.TimeSeriesTableVec3(str(TARGET))
assert a.getNumRows()==b.getNumRows()==602 and a.getNumColumns()==b.getNumColumns()==24
assert list(a.getColumnLabels())==list(b.getColumnLabels())
assert b.getTableMetaDataAsString('Units')=='m'
def at(v,i):
 try:return v.get(i)
 except (AttributeError,TypeError):return v[i]
ta=list(a.getIndependentColumn());tb=list(b.getIndependentColumn());assert ta==tb
numhash=hashlib.sha256();max_error=0.;checked=0
for i in range(602):
 numhash.update(struct.pack('<dd',rows[i][0],float(tb[i])))
 old=a.getRowAtIndex(i);new=b.getRowAtIndex(i)
 for j in range(24):
  p=at(old,j);q=at(new,j);want=[float(at(p,1))*.001,float(at(p,2))*.001,float(at(p,0))*.001]
  for k in range(3):
   actual=float(at(q,k));assert math.isfinite(actual);max_error=max(max_error,abs(actual-want[k]));numhash.update(struct.pack('<d',actual));checked+=1
assert checked==e['native_marker_values_expected']==43344
assert max_error==0.
assert numhash.hexdigest()==e['numeric_payload_sha256'],'Cross-host native table values differ'
selected={'r.ASIS','L.ASIS','r.PSIS','L.PSIS','r_ankle','L_ankle'}
xml=ET.fromstring(MARKERS.read_bytes());definition=[x for x in xml.iter('Marker') if x.attrib.get('name') in selected];assert len(definition)==6
subsetroot=ET.Element('OpenSimDocument',Version='40000');subset=ET.SubElement(subsetroot,'MarkerSet',name='REGION_CANDIDATES6_UNSCALED_NOT_IK_READY');objects=ET.SubElement(subset,'objects')
for marker in definition:objects.append(copy.deepcopy(marker))
ET.SubElement(subset,'groups');subset_path=ROOT/'landmark_regions6_REVIEW_ONLY.xml';ET.ElementTree(subsetroot).write(subset_path,encoding='utf-8',xml_declaration=True)
loaded=osim.MarkerSet(str(subset_path));assert loaded.getSize()==6
model=osim.Model(str(MODEL));model.setUseVisualizer(False);assert model.getMarkerSet().getSize()==0
for marker in definition:
 name=marker.attrib['name'];body=marker.findtext('socket_parent_frame').rsplit('/',1)[-1];loc=[float(x) for x in marker.findtext('location').split()]
 model.addMarker(osim.Marker(name,model.updBodySet().get(body),osim.Vec3(*loc)))
model.finalizeConnections();state=model.initSystem()
connections=[]
for i in range(model.getMarkerSet().getSize()):
 marker=model.getMarkerSet().get(i);connections.append({'name':marker.getName(),'connected_parent':marker.getParentFrame().getAbsolutePathString()})
assert {x['name'] for x in connections}==selected
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==e['source_native_trc_sha256']
assert hashlib.sha256(MODEL.read_bytes()).hexdigest()==expected_model
assert hashlib.sha256(MARKERS.read_bytes()).hexdigest()==expected_markers
report={'status':'PASS_NATIVE_TRANSFORM_AND_GENERIC_FRAME_CONNECTIONS_NOT_IK_READY','created_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'opensim_version':osim.GetVersion(),'python':sys.version.split()[0],'source_trc_sha256':e['source_native_trc_sha256'],'rotated_trc_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'numeric_payload_sha256':numhash.hexdigest(),'cross_host_numeric_digest_matches':True,'rows':602,'markers':24,'native_marker_values_checked':checked,'native_transform_max_abs_error_m':max_error,'frame_indices_and_time_preserved':True,'unit_metadata':'m','R':[[0,1,0],[0,0,1],[1,0,0]],'generic_marker_subset_connections':connections,'generic_model_coordinate_count':model.getCoordinateSet().getSize(),'generic_model_initialized_without_simulation':True,'anatomical_attachment_validated':False,'external_lab_calibration_verified':False,'subject_specific_scaling_run':False,'IK_run':False,'AI_run':False,'GPU_requested':False,'nonpublic_participant_data_used':False,'original_model_marker_and_source_hashes_unchanged':True,'existing_IK_config_modified':False,'model_saved_or_deployed':False,'candidate_files_in_task_folder_only':True,'elapsed_seconds':time.monotonic()-started}
(ROOT/'native_mapping_validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
