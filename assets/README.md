# Representative media

Source:Mendeley Data v1,Subject01_01,DOI https://doi.org/10.17632/xgw6bg3g8h.1 ,CC BY4.0.Caicedo Rodriguez et al.(2020);see ../CITATION.md for full attribution.

These are derived visualizations of public measured marker coordinates,not recordings of a person and not outputs of an OpenSim/AI model.

- MP4:all602 source frames,100fps,6.02s container duration;first-to-last source sample span6.01s.
- GIF:20fps display derivative;duration 6s. This display downsampling does not modify the source dataset.
- PNG:source frame866 at3.00s.
- Source axes are permuted(Y,Z,X) and mm converted to m. Each projection camera follows the pelvis-marker centroid horizontally for visibility;this is not an inferred joint centre. Vertical positions are not floor-calibrated.
- Guide lines connect observed marker locations;they are not bones or a fitted skeleton. Upper-body/head markers are not invented. The axis interpretation remains geometry-supported,not externally calibrated.

No Scaling,IK,AI,clinical/future-fall validation or participant identification is implied. This is an example selected as the first already-validated public trial,not an outcome-selected success case.

## Recreate

Run the existing single-trial export,then:

```sh
node tools/render-marker-preview.mjs --input ./runs/export-01/markers_native_axes.trc --out ./runs/marker-preview.html
```

The HTML is a local/offline Canvas renderer with embedded public coordinates. Open it in a browser and call drawMarkerFrame(i),i=0..601. The published images were rasterized with browser Canvas;FFmpeg then encoded the full100fps PNG sequence to H.264 and derived a20fps GIF. No model or downloaded archive code is executed by rendering. Raw input/HTML/frame directories remain outside Git. See media-provenance.json for exact file hashes.
