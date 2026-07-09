<p align="center">
  <a href="https://www.npmjs.com/package/@frsource/babylon-box3d">
    <img src="https://img.shields.io/npm/v/@frsource/babylon-box3d.svg" alt="NPM version badge">
  </a>
  <a href="https://www.npmjs.com/package/@frsource/babylon-box3d">
    <img src="https://img.shields.io/npm/dt/@frsource/babylon-box3d.svg" alt="NPM total downloads badge">
  </a>
  <a href="https://github.com/semantic-release/semantic-release">
    <img src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg" alt="semantic-relase badge">
  </a>
  <a href="https://github.com/FRSgit/babylon-box3d/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/FRSgit/babylon-box3d.svg" alt="license MIT badge">
  </a>
</p>

# @frsource/babylon-box3d

A Babylon.js [Physics V2](https://doc.babylonjs.com/features/featuresDeepDive/physics/v2overview) plugin backed by
[box3d-wasm](https://github.com/monteslu/box3d-wasm), a WebAssembly build of Erin Catto's Box3D rigid body engine.

It follows the same shape as `@babylonjs/havok`'s `HavokPlugin`: a class implementing `IPhysicsEnginePluginV2` that
can be passed straight to `scene.enablePhysics(gravity, plugin)`.

**[Live demo →](https://frsgit.github.io/babylon-box3d/)**

## Installation

```bash
npm i @frsource/babylon-box3d box3d-wasm
```

`@babylonjs/core` is a peer dependency -- install whichever version (`^9.0.0`) your project already uses.

## Usage

```ts
import Box3D from 'box3d-wasm';
import { Box3DPlugin } from '@frsource/babylon-box3d';

const box3d = await Box3D();
const plugin = new Box3DPlugin(box3d);

scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
```

## Coverage

Box3D's JS bindings are narrower than Havok's, so a few corners of `IPhysicsEnginePluginV2` are best-effort:

- Shapes: box, sphere, capsule and convex hull are fully supported. `CONTAINER` shapes are supported by attaching
  every child shape to the same box3d body. `MESH`, `HEIGHTFIELD` and `CYLINDER` are not supported by box3d-wasm and
  throw a descriptive error.
- Bodies: only a single instance per `PhysicsBody` is supported (no thin-instance batching) — `initBodyInstances`
  falls back to treating the mesh's own transform as a single body.
- Constraints: `BALL_AND_SOCKET`, `DISTANCE`, `HINGE`, `SLIDER`/`PRISMATIC`, `LOCK` and `SIX_DOF` (approximated with
  a weld/motor joint) map onto box3d's spherical/distance/revolute/prismatic/weld joints. Per-axis limit APIs are
  best-effort since box3d joints are already axis-specific (unlike Havok's generic 6-DOF constraint).
- `raycast` only returns the closest hit per query (box3d-wasm exposes `castRayClosest`, not a multi-hit sweep).

## Raw box3d access

Some box3d-wasm features have no equivalent in Babylon's `IPhysicsEnginePluginV2` -- most notably its car wheel
joint (suspension + steering + drive in one joint), used for vehicles rather than generic constraints, plus its
filter and parallel joints. `Box3DPlugin` exposes the underlying `world: Box3DWorld` publicly for exactly this:
create bodies through Babylon as usual, then reach `plugin.world.createWheelJoint(bodyA, bodyB, options)` (or
`createFilterJoint`/`createParallelJoint`) directly.

`box3d-wasm` ships no bundled types at all, so this package's `box3d-wasm.d.ts` declares only what `Box3DPlugin`
itself uses. `extraJoints.d.ts` augments it with the wheel/filter/parallel joint surface (verified present in the
compiled `box3d-wasm@0.2.0` binary by instantiating it and inspecting the live prototypes) for consumers who need
raw access. Both are ambient module declarations; `index.ts` pulls them into the program via triple-slash
references, so any package that does `import { Box3DPlugin } from '@frsource/babylon-box3d'` gets them for free --
no `tsconfig.json` changes needed, _as long as you access box3d-wasm's types only through `Box3DPlugin` itself_
(e.g. `plugin.world.createWheelJoint(...)`). If your own code also writes a direct `import ... from 'box3d-wasm'`,
TypeScript won't honor a dependency's augmentation of an already-resolved-but-untyped module for that import (see
TS2665) -- copy `box3d-wasm.d.ts` (and `extraJoints.d.ts` if you need the wheel/filter/parallel joints) into your
own project in that case, the way `docs/` here does for the demo.

## Demo

`docs/` is a standalone Vite + Babylon.js app that ports
[monteslu/threejs-box3d-demo](https://github.com/monteslu/threejs-box3d-demo) (originally three.js) onto this
plugin, deployed to GitHub Pages from `main`. See `docs/README.md` for running it locally.

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2026-present, Jakub FRS Freisler, [FRSOURCE](https://www.frsource.org/)

<p align="center">
<a href="https://www.frsource.org/" title="Click to visit FRSOURCE page!">
<img src="https://www.frsource.org/logo.jpg" alt="FRSOURCE logo" height="60px"/>
</a>
</p>
