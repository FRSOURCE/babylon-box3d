import {
  Color3,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Vector3,
} from '@babylonjs/core';
import { camera, scene, shadows } from './core/engine';
import { material, palette, pick, rand } from './utils';

let sceneMeshes: Mesh[] = [];
let bodyCount = 0;

/** Number of physics bodies in the current scene, for the HUD. */
export function getBodyCount(): number {
  return bodyCount;
}

export function track(mesh: Mesh): Mesh {
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh);
  sceneMeshes.push(mesh);
  bodyCount++;
  return mesh;
}

export function addStaticMesh(mesh: Mesh): Mesh {
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh);
  sceneMeshes.push(mesh);
  return mesh;
}

/** Disposes every mesh/body from the current scene and rebuilds the ground plane. */
export function resetWorld(): void {
  for (const mesh of sceneMeshes) {
    // Default dispose() args leak both the shadow generator's render-list
    // reference (never auto-removed on disposal) and the mesh's material
    // (disposeMaterialAndTextures defaults to false) -- every scene
    // reset/switch was otherwise leaking one StandardMaterial per spawned
    // shape/ragdoll-part/plank forever.
    shadows.removeShadowCaster(mesh);
    mesh.dispose(false, true);
  }
  sceneMeshes = [];
  bodyCount = 0;

  const ground = MeshBuilder.CreateBox(
    'ground',
    { width: 60, height: 2, depth: 60 },
    scene,
  );
  ground.position.y = -1;
  ground.material = material(Color3.FromHexString('#36363b'), 0.95);
  new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, friction: 0.7 },
    scene,
  );
  addStaticMesh(ground);
}

export function spawnShape(x: number, y: number, z: number): void {
  const mat = material(pick(palette));
  const kind = Math.random();
  let mesh: Mesh;

  if (kind < 0.45) {
    const w = rand(0.5, 1.2);
    const h = rand(0.5, 1.2);
    const d = rand(0.5, 1.2);
    mesh = MeshBuilder.CreateBox(
      'shape',
      { width: w, height: h, depth: d },
      scene,
    );
    // Position before creating the aggregate: PhysicsAggregate snapshots
    // the mesh's transform as the body's initial position, and dynamic
    // bodies never get re-synced from the mesh afterwards (only
    // kinematic/animated ones do, in `_prestep`) -- setting position after
    // aggregate creation left every shape's *physics body* stacked at the
    // mesh's default origin, exploding apart once the solver ran.
    mesh.position.set(x, y, z);
    new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: 1, friction: 0.5 },
      scene,
    );
  } else if (kind < 0.8) {
    const r = rand(0.25, 0.5);
    mesh = MeshBuilder.CreateSphere(
      'shape',
      { diameter: r * 2, segments: 16 },
      scene,
    );
    mesh.position.set(x, y, z);
    new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      { mass: 1, friction: 0.4, restitution: 0.3 },
      scene,
    );
  } else {
    const r = rand(0.2, 0.35);
    const h = rand(0.5, 1.0);
    mesh = MeshBuilder.CreateCapsule(
      'shape',
      { radius: r, height: h + r * 2 },
      scene,
    );
    mesh.position.set(x, y, z);
    new PhysicsAggregate(
      mesh,
      PhysicsShapeType.CAPSULE,
      { mass: 1, friction: 0.5 },
      scene,
    );
  }
  mesh.material = mat;
  track(mesh);
}

export function rainShapes(at: { x: number; z: number }, count: number): void {
  for (let i = 0; i < count; i++) {
    spawnShape(
      at.x + rand(-1.2, 1.2),
      12 + rand(0, 3) + i * 0.8,
      at.z + rand(-1.2, 1.2),
    );
  }
}

/**
 * Fires a fast cannonball sphere from the camera toward `target` (or
 * straight ahead if omitted).
 */
export function shootBall(target?: Vector3): void {
  const dir = target
    ? target.subtract(camera.position).normalize()
    : camera.getForwardRay().direction;
  const from = camera.position.add(dir.scale(2));
  const mesh = MeshBuilder.CreateSphere(
    'cannonball',
    { diameter: 1.2, segments: 16 },
    scene,
  );
  mesh.position.copyFrom(from);
  const white = material(Color3.White(), 0.2);
  mesh.material = white;
  const agg = new PhysicsAggregate(
    mesh,
    PhysicsShapeType.SPHERE,
    { mass: 12, friction: 0.4, restitution: 0.4 },
    scene,
  );
  agg.body.setLinearVelocity(dir.scale(40));
  // box3d-wasm needs a bullet flag (CCD) for fast-moving small spheres -- no
  // Babylon V2 equivalent, so this drops to the raw box3d body.
  (
    agg.body._pluginData as { native: { setBullet(flag: boolean): void } }
  ).native.setBullet(true);
  track(mesh);
}
