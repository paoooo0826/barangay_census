# More forgiving live verification

The gesture checks are adjusted independently of the final ID-to-live face
comparison. They remain heuristic decision support, with administrator approval
required for the resident record.

| Check | Previous | Updated |
| --- | --- | --- |
| Smile score | 0.70 | 0.50, held for two valid frames |
| Head-turn yaw | ±0.12 | ±0.085, correct direction, held for two frames |
| Move closer | 35% larger face area and at least 18% of the frame | 20% larger than the current action's starting face area, held for two frames |
| Blinks | Fixed eye ratios 0.220/0.235 | Four-frame median eye-opening calibration; close at 76% of baseline, reopen at 90%; two complete cycles |
| Face positioning | Strictly within the guide | 6% margin around the guide; face still fully inside the camera image |
| Minimum face size | 48% of guide width / 45% height | 44% width / 42% height |
| Gesture face-detection confidence | 0.45 for blinks, 0.55 otherwise | 0.45 for all gesture checks |

The app prompts users to look at the camera with their eyes open briefly before
blinking. A missing/multiple/off-guide face interrupts a partially completed
blink, so disappearance and reappearance cannot count as a blink. Small eye
landmark fluctuations do not count as close/reopen cycles.

Gesture processing no longer calculates unused face descriptors for every
frame. Descriptor comparison still runs on the final captured image, with the
same 0.55 match threshold and 0.45 strong-match threshold. The loop polls after
75 ms for blinks and 150 ms for other movements; model execution time remains
device-dependent. Three random movements, single-person checks, ID screening,
photo confirmation, and administrator review remain in place.

Validation includes pure gesture-state tests and component tests that walk the
actual live-verification loop through all five gestures, interrupted detection,
and final face comparison. Naturally narrower eyes, smaller turns, moderate
smiles, and a 21% face-area increase pass the simulated flow. A final mismatched
face still fails. These checks use synthetic landmarks and mocked camera
frames; physical webcam/phone testing remains outstanding, and no measured
real-world acceptance or spoof-detection rate is claimed.
