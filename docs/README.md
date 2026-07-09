# @frsource/babylon-box3d demo

A Babylon.js port of [monteslu/threejs-box3d-demo](https://github.com/monteslu/threejs-box3d-demo) (which uses
three.js), showcasing [`@frsource/babylon-box3d`](..) instead. Six scenes -- playground, pyramid, ragdolls,
dominoes, bridge, driving -- built with Babylon's own `PhysicsAggregate`/`PhysicsConstraint` API, dropping to
`plugin.world` directly only for the driving buggy's wheel joints (no `IPhysicsEnginePluginV2` equivalent exists).

Deployed to GitHub Pages from `main` via `.github/workflows/pages.yml`.

## Running locally

From the repo root (this is a pnpm workspace member, not a standalone install):

```bash
pnpm i
pnpm build          # builds the library this demo depends on
pnpm --filter @frsource/babylon-box3d-demo dev
```

## Controls

- `click` -- scene action: rain shapes, fire a cannonball, or drop a ragdoll, depending on the scene
- `shift+click` -- always fires a cannonball from the camera
- `double click` -- explosion at the clicked point
- `b` -- another wave of the scene's spawnable
- `r` -- reset the current scene
- arrows / WASD -- drive, in the Driving scene
- `?scene=ragdolls` -- start on a specific scene (`playground`, `pyramid`, `ragdolls`, `dominoes`, `bridge`,
  `driving`)
