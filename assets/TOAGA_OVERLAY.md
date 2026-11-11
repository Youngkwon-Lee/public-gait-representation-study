# Actual-video 2D overlay

Source:Toronto Older Adults Gait Archive(2022),Videos/OAW02-bottom.mp4. Video item:https://springernature.figshare.com/articles/dataset/Walking_videos/19929893 . Study:https://doi.org/10.1038/s41597-022-01495-z . Recorded source-manifest license:CC0. The article states that participants consented to public data sharing and that published video faces were obscured. The original obscuring is retained;no facial landmarks are displayed.

The source video was verified against the source ZIP entry CRC32 and uncompressed byte count. The selected still is zero-based frame180 at6.00s from a30fps,1080x1920 recording. The displayed crop is[x540,y290,w180,h280]. Both panels use identical RGB pixels;the right adds estimated body landmarks and guide lines.

## Inference, not a dataset ground-truth label
macOS Vision VNDetectHumanBodyPoseRequest ran CPU-only on[x480,y250,w300,h400]from that exact frame. Full-frame detection found no bodies;the manually selected crop yielded one body. Twelve non-facial body points above0.3 confidence were rendered without manual coordinate adjustment. Confidence is not clinical accuracy.

Normalized Vision coordinates were mapped back with x=480+300*x_normalized and y=250+400*(1-y_normalized),then into the display crop. Pixel transforms are deterministic;there is no guessed video/CSV time offset.

The released TOAGA pose CSV resets time for trimmed walking bouts,and an exact offset to the full recording was not established. Therefore it was deliberately not overlaid on an assumed frame. No Mendeley data was placed on a TOAGA person.

This one-frame example does not establish automated full-frame detection,temporal tracking,3D reconstruction,OpenSim IK,ground-truth joint locations or clinical validity. Model files and full raw source videos are not bundled.

See toaga-overlay-provenance.json for source and image hashes,ROI transforms and exact12point coordinates. The crop can be recreated with FFmpeg;the native detector helper is tools/detect-video-frame-pose.js(macOS only).
