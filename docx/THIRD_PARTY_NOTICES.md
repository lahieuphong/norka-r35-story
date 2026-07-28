# Third-Party Notices

_Last audited: July 26, 2026._

This file records the principal third-party assets and direct software dependencies used by the NORKA R35 interactive demonstration. It is a summary, not a replacement for the complete upstream license texts. Transitive packages may carry additional notices in their own distributions.

For ownership of original project materials and the boundary between project and third-party rights, see [Copyright and Rights Notice](./COPYRIGHT.md).

## Vehicle Geometry and Base Model

- **Title:** `unpacked-norka_varis_r35`
- **Creator:** [MattDoesBlender](https://sketchfab.com/MattDoesBlender)
- **Source:** [Sketchfab model page](https://sketchfab.com/3d-models/unpacked-norka-varis-r35-6530a368bc4742ccb5488886d430cec7)
- **License:** [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) (`CC BY-NC-SA 4.0`)

The source attribution metadata is embedded in the GLB assets. `public/models/norka-r35-original.glb` is retained as the unmodified reference copy. Its recorded SHA-256 value is:

```text
a377887ccb248ef0147b2e318f84c9a64dd38c0bdead96209cdcffde63b4660f
```

## Material-Presentation Reference

- **Title:** `Norka Varis R35 | www.vecarz.com`
- **Creator:** [vecarz (@heynic)](https://sketchfab.com/heynic)
- **Source:** [Sketchfab model page](https://sketchfab.com/3d-models/norka-varis-r35-wwwvecarzcom-c4c42f9ef40644399f301a910184b241)
- **License:** [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) (`CC BY-NC-SA 4.0`)

The application's material presentation and selected supplied material maps were adapted from this edition. Its Sketchfab description also credits the MattDoesBlender base model.

## Modification Notice for Model-Related Assets

This project distributes optimized and modified derivatives of the credited Creative Commons assets. Changes include:

- restoration and remapping of material factors and texture slots;
- texture resizing, channel recomposition, color-space classification, and KTX2 or PNG re-encoding;
- Meshopt compression, conservative attribute quantization, and mobile instancing/joining of static opaque geometry;
- creation of desktop, mobile, constrained-mobile, and compatibility GLB variants;
- preservation and preparation of the driver-door and steering-wheel pivots for interactive runtime behavior; and
- integration into a responsive, non-commercial WebGL presentation.

The affected files include the generated variants in `public/models/` and model-derived or supplied authoring textures in `source-assets/textures/`. Those model-related assets and adaptations remain available under **CC BY-NC-SA 4.0**. The license requires attribution, non-commercial use, indication of modifications, and ShareAlike treatment for shared adaptations. The official license text controls if this summary differs from it.

The Creative Commons license applies to the credited model and model-related adaptations. It does not automatically relicense independently authored application source code.

## Procedural Studio Environment

The following files are generated locally by `scripts/generate-studio-hdr.py` from procedural softbox shapes:

- `public/hdr/automotive-studio.hdr`
- `public/hdr/automotive-studio-mobile.hdr`

They do not contain a downloaded photographic HDRI.

## Basis Universal Transcoder

The checked-in source copies below originate from the Basis Universal distribution bundled with Three.js:

- `source-assets/basis/basis_transcoder.js`
- `source-assets/basis/basis_transcoder.wasm`

Basis Universal is Copyright © 2016–2026 Binomial LLC and is provided under the Apache License 2.0. The checked-in source copies include the complete [Apache License 2.0 text](../source-assets/basis/LICENSE) and the upstream [Basis Universal NOTICE](../source-assets/basis/NOTICE). The runtime bundles the matching transcoder through Three.js instead of serving those source copies directly; production also retains deployed copies at [public/basis/LICENSE](../public/basis/LICENSE) and [public/basis/NOTICE](../public/basis/NOTICE).

## Direct Software Dependency License Summary

Versions are taken from the current `package.json` and installed package manifests.

| Package or group | Version | License |
|---|---:|---|
| React and React DOM | `19.2.7` | MIT |
| Three.js | `0.185.1` | MIT |
| `@react-three/fiber` | `9.6.1` | MIT |
| `@react-three/drei` | `10.7.7` | MIT |
| `three-stdlib` | `2.36.1` | MIT |
| GSAP | `3.15.0` | [GreenSock Standard "No Charge" License](https://gsap.com/standard-license) |
| glTF-Transform packages | `4.4.1` | MIT |
| Vite / `@vitejs/plugin-react` | `8.1.5` / `6.0.3` | MIT |
| TypeScript | `7.0.2` | Apache-2.0 |
| Sharp | `0.34.5` | Apache-2.0 |
| `ktx2-encoder` | `0.5.3` | MIT |
| `meshoptimizer` | `1.2.0` | MIT |
| React and Three type packages | Current locked versions | MIT |

Each package remains copyrighted by its respective author or contributor community and is governed by its own license. Package-level license files and notices remain authoritative.

## Trademarks and No Affiliation

Nissan, GT-R, R35, Varis, Sketchfab, and all other product names, logos, and marks are the property of their respective owners. They are referenced only to identify the subject and source materials.

This project is an unofficial, non-commercial interactive demonstration. It is not sponsored, authorized, or endorsed by, and is not affiliated with, Nissan Motor Co., Ltd., Varis, Sketchfab, MattDoesBlender, vecarz, or any other rights holder.
