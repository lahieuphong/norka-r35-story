# NORKA R35 Camera Tuning Report

_Last audited against the current source code: July 26, 2026._

## Document Status

This report was checked against the current implementations in:

- `src/three/cameraShots.ts`
- `src/three/interiorTransitionShots.ts`
- `src/hooks/useScrollStory.ts`
- `src/three/CameraRig.tsx`
- `src/three/CarCanvas.tsx`

The "after" coordinates below reflect the current source. The recorded viewport percentages and collision observations are historical visual-QA results from the tuning passes; they were not recalculated during this documentation audit. The Mobile Hero target was changed after the original screenshot review, so that composition should be visually rechecked before a final release.

## Scope

The initial composition pass used two primary viewports:

- Desktop: **1440 × 900**
- Mobile portrait: **390 × 844**

Follow-up coverage included all 12 story scenes at those sizes, plus targeted checks at **1024 × 768**, **768 × 1024**, **320 × 568**, **667 × 375**, and **844 × 390**.

The original camera-tuning work did not alter the 3D model, normalization transform, model scale, CSS transforms, the GSAP master-timeline architecture, or the Three.js scene hierarchy. It adjusted camera `position`, `target`, `fov`, and transition waypoints. A dedicated `rear-signature` section was added to complete exterior coverage.

The development camera HUD remains available with the **D** key. Its **Copy shot** action exports a valid object entry for `cameraShots.ts`.

## Responsive Camera Profiles

| Profile | Selection rule | Shot set |
|---|---|---|
| Desktop / wide | Default when neither responsive rule below matches | `desktopShots` |
| Compact portrait or square | `width <= 1024` and `height >= width` | `mobileShots` |
| Short landscape | `width <= 1024`, `height <= 500`, and `height < width` | `landscapeShots` |

Camera composition and model-quality selection are intentionally separate. A device may keep its mobile model tier after rotation while changing to the short-landscape camera profile.

## Current Story Order

| Index | Shot key | Story label |
|---:|---|---|
| 01 | `explore` | 3D Experience |
| 02 | `performance` | Performance |
| 03 | `aerodynamics` | Aerodynamics |
| 04 | `rear-signature` | Rear Signature |
| 05 | `precision` | Precision |
| 06 | `interior` | Cockpit |
| 07 | `steering` | Steering |
| 08 | `instruments` | Digital Cluster |
| 09 | `front-seats` | Front Seats |
| 10 | `rear-seats` | Rear Seats |
| 11 | `rear-seat-detail` | Second Row |
| 12 | `hero` | Engineered Beyond Limits |

## Desktop — Before and After

| Section | Position Before | Position After | Target Before | Target After | FOV Before → After |
|---|---|---|---|---|---:|
| Hero | `[-4.60, 1.75, 5.70]` | `[-7.15, 1.72, 7.45]` | `[0.00, 0.55, 0.75]` | `[-2.45, 0.47, 0.68]` | `32 → 31.5` |
| Aerodynamics | `[4.80, 1.20, 0.35]` | `[9.10, 1.30, -0.75]` | `[0.00, 0.52, 0.00]` | `[0.00, 0.42, -1.10]` | `30 → 32` |
| Performance | `[1.80, 3.80, 3.50]` | `[1.40, 4.90, 6.50]` | `[0.00, 0.70, 1.05]` | `[-0.90, 0.55, 1.30]` | `28 → 30` |
| Precision | `[-2.30, 0.72, 2.30]` | `[-5.65, 0.61, -5.82]` | `[-0.82, 0.38, 1.55]` | `[0.45, 0.36, -1.90]` | `26 → 44` |
| Explore | `[4.70, 1.80, 5.30]` | `[3.20, 1.90, 7.30]` | `[0.00, 0.55, 0.00]` | `[-1.40, 0.50, 1.25]` | `34 → 36.5` |

## Compact / Mobile Portrait — Before and After

| Section | Position Before | Position After | Target Before | Target After | FOV Before → After |
|---|---|---|---|---|---:|
| Hero | `[-5.50, 2.00, 7.40]` | `[-7.30, 2.15, 8.95]` | `[0.00, 0.58, 0.78]` | `[-0.30, 2.40, 0.50]` | `38 → 53` |
| Aerodynamics | `[6.70, 1.45, 0.55]` | `[16.50, 1.90, 0.55]` | `[0.00, 0.57, 0.05]` | `[0.00, 0.38, 0.05]` | `39 → 50` |
| Performance | `[2.90, 4.90, 5.55]` | `[4.15, 7.10, 9.35]` | `[0.00, 0.72, 1.00]` | `[0.15, 0.12, 0.85]` | `38 → 53` |
| Precision | `[-3.45, 0.92, 3.50]` | `[-5.78, 0.61, -6.00]` | `[-0.78, 0.40, 1.48]` | `[-0.65, 0.35, -1.10]` | `36 → 64` |
| Explore | `[6.35, 2.15, 7.25]` | `[8.50, 2.40, 9.80]` | `[0.00, 0.57, 0.00]` | `[0.00, 0.10, 0.00]` | `40 → 54` |

## Short-Landscape Overrides

`landscapeShots` inherits every desktop shot except the two entries below:

| Section | Position | Target | FOV |
|---|---|---|---:|
| Rear Signature | `[-1.40, 0.66, -6.40]` | `[-1.40, 0.62, -2.00]` | `31` |
| Precision | `[-5.65, 0.61, -5.82]` | `[0.45, 0.36, -1.90]` | `34` |

## Recorded Composition Results

| Viewport | Section | Recorded result |
|---|---|---|
| Desktop | Hero | The entire car was visible from the front three-quarter angle. Its width was approximately **55.49%** of the viewport; the front bumper and front wheel remained clear, and the car stayed to the right of the text block. |
| Desktop | Aerodynamics | The body occupied approximately **67.58%** of the viewport width, within the 65–75% target. |
| Desktop | Performance | The elevated view clearly showed the hood, lamps, bumper, and complete front section. |
| Desktop | Precision | The full vehicle appeared from the rear-left angle, with the rear wheel and brake retained as focal details. |
| Desktop | Explore | The full car fit comfortably in frame at approximately **50.71%** of viewport width, leaving space before OrbitControls became active. |
| Mobile portrait | Hero | The historical review kept the complete car and front-bumper clearance above the text block. The current target Y value is now `2.40`, so this specific result requires a fresh screenshot check. |
| Mobile portrait | Aerodynamics | The body occupied approximately **73.94%** of the viewport width, within the 65–75% target. |
| Mobile portrait | Performance | The hood view occupied approximately **74.38%** of viewport width while preserving a readable full front section. |
| Mobile portrait | Precision | The full rear-left silhouette remained visible. The recorded horizontal NDC range was `[-0.970, 0.978]`, preserving clearance from both edges and from the text block below. |
| Mobile portrait | Explore | The full car remained in frame at approximately **79.43%** of viewport width, with balanced surrounding space. |

## Addendum — Digital Cluster

- Desktop changed from `position [0.37, 1.04, -0.24]`, `target [0.20, 0.82, 0.45]`, `fov 38` to `position [0.58, 1.05, -0.29]`, `target [0.10, 0.74, 0.47]`, `fov 41`.
- Compact portrait changed from `position [0.37, 1.02, -0.28]`, `target [0.37, 0.70, 0.45]`, `fov 52` to `position [0.62, 1.04, -0.36]`, `target [0.14, 0.56, 0.47]`, `fov 65`.
- The `instruments` waypoint moved right from `x 0.10` to `x 0.28` on desktop and from `x 0.08` to `x 0.28` on compact layouts. It also moved slightly backward on the Z axis so the Steering transition does not compress into its second half.
- The final frame keeps the steering wheel and instrument cluster as context while bringing the center display and center stack into clear view.

## Addendum — Rear Signature and Cabin Entry Path

- Scene `04` is a direct rear view. Desktop uses `position [-0.85, 0.78, -7.35]`, `target [-0.85, 0.58, -2.15]`, `fov 33`. Compact portrait uses `position [0.00, 0.72, -8.15]`, `target [0.00, 0.15, -2.15]`, `fov 52`. Short landscape uses the override documented above.
- The composition includes the full rear wing, four circular tail lamps, both rear wheels, four exhaust tips, and the diffuser. The section copy remains separated from the body across desktop, tablet, portrait-phone, and landscape-phone layouts.
- The current sequence runs Explore → Performance → Aerodynamics → Rear Signature → Precision, continues through the cabin, and ends at Hero.
- The exterior desktop waypoints for Performance, Aerodynamics, Rear Signature, and Precision are `[2.75, 3.60, 7.90]`, `[4.50, 3.50, 5.80]`, `[8.50, 2.80, -7.00]`, and `[-3.15, 1.00, -6.55]`.
- The equivalent compact waypoints are `[6.60, 4.75, 10.20]`, `[10.40, 5.10, 7.30]`, `[8.00, 3.50, -10.50]`, and `[-4.20, 1.30, -8.00]`.
- The recorded audit across all **300,735** uploaded vertices in the source GLB found no exterior-transition mesh intersections, near-plane contact, or abnormal midpoint cropping. This is a historical QA result rather than a runtime assertion.
- The story waypoint entering Cockpit is `[-0.24, 1.40, -2.60]` on desktop and `[-0.18, 1.45, -2.60]` on compact layouts. The camera moves through the rear glass, between the front seats, and into the cockpit.
- Because the GLB is a closed shell, `ext_glass` and `black_glass` fade only while the story camera crosses the glass. The same timeline evaluates in reverse during upward scrolling.
- The special Rear Seat Detail → Hero curve passes through the Interior alignment, clears the rear glass and wing, then completes the exterior orbit into the final Hero composition.
- Cockpit, Digital Cluster, and Front Seats already expose the center console, so an additional duplicate section is unnecessary.
- The engine bay cannot be revealed by camera movement alone because the hood is closed and the source GLB contains no animation clips. This is a model-state limitation, not a missing camera angle.

## Current Interactive Interior Camera

Interactive cabin navigation is separate from the scroll-story camera. Entry and exit use dedicated responsive camera shots:

| Profile | Stage | Position | Target | FOV |
|---|---|---|---|---:|
| Desktop / wide | Approach | `[2.08, 1.16, 0.32]` | `[0.77, 0.64, 0.04]` | `47` |
| Desktop / wide | Doorway | `[1.12, 1.04, 0.20]` | `[0.42, 0.73, 0.13]` | `54` |
| Desktop / wide | Cockpit | `[0.38, 1.03, -0.25]` | `[0.35, 0.78, 0.72]` | `62` |
| Compact portrait | Approach | `[2.50, 1.34, 0.50]` | `[0.72, 0.61, 0.04]` | `59` |
| Compact portrait | Doorway | `[1.23, 1.10, 0.24]` | `[0.40, 0.71, 0.12]` | `65` |
| Compact portrait | Cockpit | `[0.38, 1.03, -0.35]` | `[0.34, 0.84, 0.65]` | `82` |
| Short landscape | Approach | `[2.18, 1.13, 0.36]` | `[0.75, 0.62, 0.04]` | `50` |
| Short landscape | Doorway | `[1.12, 1.03, 0.20]` | `[0.42, 0.72, 0.13]` | `57` |
| Short landscape | Cockpit | `[0.38, 1.02, -0.25]` | `[0.35, 0.79, 0.72]` | `65` |

The seated eye position remains locked while OrbitControls changes the viewing direction. Interior pan and zoom are disabled. Orbit distance is clamped to `0.45–1.20` for wide and short-landscape profiles and `0.45–0.95` for compact portrait.

| Profile | Min polar, door open | Min polar, door closed | Max polar | Min azimuth, door open | Min azimuth, door closed | Max azimuth |
|---|---:|---:|---:|---:|---:|---:|
| Desktop / wide | `1.18` | `1.24` | `1.46` | `2.48` | `2.90` | `4.12` |
| Short landscape | `1.18` | `1.24` | `1.34` | `2.48` | `2.90` | `3.80` |
| Compact portrait | `1.00` | `1.04` | `1.42` | `2.48` | `2.90` | `4.55` |

Opening the driver's door expands the safe leftward view so the complete open door can be inspected. Closing it immediately restores the tighter cabin boundary. Compact layouts also keep a `0.46` look-anchor distance to prevent the camera target from drifting through dashboard geometry.

The steering wheel is independently draggable by mouse or touch around its authored local-Y pivot, with a limit of ±135 degrees. A steering-wheel hit captures only that gesture, preventing the camera from rotating while the wheel is being turned.

## Motion Validation

- In normal-motion mode, one GSAP ScrollTrigger master timeline is the only writer to the story camera rig.
- In reduced-motion mode, static per-section shots replace the scrubbed master motion.
- Every normal-motion segment continuously interpolates `rig.target`; target movement is not limited to position changes.
- `fov` is interpolated together with position and target.
- Reverse scrolling evaluates the same master timeline backward. No independent reverse-camera animation is created.
- The Explore → Performance and Rear Seat Detail → Hero transitions use dedicated continuous curves.
- No CSS transform simulates model movement, and model scale remains unchanged between story sections.
- Entering and exiting Explore mode both use the same initial `shots.explore` composition and preserve the saved story scroll position.
- Door opening, cabin entry, cabin exit, and door closing use independent Explore-view transitions without modifying the story ScrollTrigger lifecycle.
