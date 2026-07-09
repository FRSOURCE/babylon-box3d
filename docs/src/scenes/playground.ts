import {
  BallAndSocketConstraint,
  Color3,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsMotionType,
  PhysicsShapeType,
  Quaternion,
  Vector3,
  type Observer,
  type Scene,
} from '@babylonjs/core';
import { scene } from '../core/engine';
import { material, rand } from '../utils';
import { addStaticMesh, rainShapes, spawnShape, track } from '../world';
import type { SceneDef } from './types';

/**
 * Removes any per-frame render observers a previous `buildToys()` call
 * registered (windmill spin, seesaw tilt). Without this, every playground
 * rebuild -- initial load, `r` reset, or revisiting the scene -- would add
 * two more permanent callbacks that keep mutating meshes `resetWorld()`
 * just disposed, leaking both the observer and the disposed mesh forever.
 */
let toyObservers: Observer<Scene>[] = [];
function clearToyObservers(): void {
  for (const obs of toyObservers) scene.onBeforeRenderObservable.remove(obs);
  toyObservers = [];
}

/** Builds the playground's joint toys: a windmill, a wrecking ball on a chain, and a seesaw. */
function buildToys(): void {
  clearToyObservers();
  // motorized windmill that flings whatever lands near it
  const post = MeshBuilder.CreateBox(
    'post',
    { width: 0.5, height: 2.2, depth: 0.5 },
    scene,
  );
  post.position.set(8, 1.1, 0);
  post.material = material(Color3.FromHexString('#8a8f98'), 0.6);
  new PhysicsAggregate(post, PhysicsShapeType.BOX, { mass: 0 }, scene);
  addStaticMesh(post);

  const rotor = MeshBuilder.CreateBox(
    'rotor',
    { width: 8, height: 0.3, depth: 0.7 },
    scene,
  );
  rotor.position.set(8, 2.4, 0);
  rotor.rotationQuaternion = Quaternion.Identity();
  rotor.material = material(Color3.FromHexString('#f9e2af'), 0.4);
  const rotorAgg = new PhysicsAggregate(
    rotor,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  rotorAgg.body.setMotionType(PhysicsMotionType.ANIMATED);
  track(rotor);

  const rotorAngularSpeed = -2;
  let rotorAngle = 0;
  toyObservers.push(
    scene.onBeforeRenderObservable.add(() => {
      rotorAngle +=
        (rotorAngularSpeed * scene.getEngine().getDeltaTime()) / 1000;
      rotor.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Up(),
        rotorAngle,
      );
    }),
  );

  // wrecking ball on a chain of ball-and-socket joints, released with a
  // swing. Every link is a vertical capsule, so its own top/bottom anchor
  // offsets are the same fixed local constants regardless of world position.
  const anchor = MeshBuilder.CreateBox('anchor', { size: 0.1 }, scene);
  anchor.position.set(-8, 12, 0);
  anchor.isVisible = false;
  const anchorAgg = new PhysicsAggregate(
    anchor,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  addStaticMesh(anchor);

  const linkCount = 6;
  let prevBody = anchorAgg.body;
  let prevLocalBottom = Vector3.Zero();
  for (let i = 0; i < linkCount; i++) {
    const link = MeshBuilder.CreateCapsule(
      'link',
      { radius: 0.15, height: 0.7 + 0.3 },
      scene,
    );
    link.position.set(-8, 11.5 - i, 0);
    link.material = material(Color3.FromHexString('#646e8e'), -0.6);
    const linkAgg = new PhysicsAggregate(
      link,
      PhysicsShapeType.CAPSULE,
      { mass: 2 },
      scene,
    );
    track(link);

    const joint = new BallAndSocketConstraint(
      prevLocalBottom,
      new Vector3(0, 0.5, 0),
      Vector3.Up(),
      Vector3.Up(),
      scene,
    );
    prevBody.addConstraint(linkAgg.body, joint);
    prevBody = linkAgg.body;
    prevLocalBottom = new Vector3(0, -0.5, 0);
  }
  const ball = MeshBuilder.CreateSphere(
    'wreckingball',
    { diameter: 1.8, segments: 16 },
    scene,
  );
  ball.position.set(-8, 11.5 - linkCount - 0.6, 0);
  ball.material = material(Color3.FromHexString('#545e6e'), -1);
  const ballAgg = new PhysicsAggregate(
    ball,
    PhysicsShapeType.SPHERE,
    { mass: 45, friction: 0.4 },
    scene,
  );
  ballAgg.body.setLinearVelocity(new Vector3(8, 0, 0));
  track(ball);
  const ballJoint = new BallAndSocketConstraint(
    prevLocalBottom,
    new Vector3(0, 0.9, 0),
    Vector3.Up(),
    Vector3.Up(),
    scene,
  );
  prevBody.addConstraint(ballAgg.body, ballJoint);

  /**
   * Seesaw. This plugin's HINGE joint doesn't reliably drive a dynamic
   * plank -- it sometimes only ever rotates about the fixed world-X axis
   * through the pivot regardless of the requested axis, and sometimes
   * just stays frozen even under a stack of shapes landing on it. Same
   * workaround as the bridge deck: pin the plank to the pivot with a PAIR
   * of BallAndSocketConstraints spaced across the plank's depth (world Z,
   * the tilt axis) instead of a single central hinge. A lone central
   * pivot only constrains one point, so nothing stops the plank from
   * twisting/yawing on top of it; two points spaced along the tilt axis
   * mechanically block that twist while still letting the plank rotate
   * freely about the line through them -- a real dynamic hinge, driven
   * purely by gravity and whatever bumps into it, no scripted motion.
   */
  const pivot = MeshBuilder.CreateBox(
    'pivot',
    { width: 0.6, height: 1.2, depth: 0.6 },
    scene,
  );
  pivot.position.set(0, 0.6, -9);
  pivot.material = material(Color3.FromHexString('#8a8f98'), 0.6);
  const pivotAgg = new PhysicsAggregate(
    pivot,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  addStaticMesh(pivot);

  // Long side on width (world X) instead of depth (world Z) -- rotated 90
  // from the previous layout to match the original scene. The pivot pair
  // below is spaced along that same depth axis so the plank keeps tipping
  // correctly instead of spinning along its own length.
  const plank = MeshBuilder.CreateBox(
    'plank',
    { width: 8, height: 0.4, depth: 2 },
    scene,
  );
  plank.position.set(0, 1.35, -9);
  plank.rotationQuaternion = Quaternion.Identity();
  plank.material = material(Color3.FromHexString('#a6e3a1'), 0.5);
  const plankAgg = new PhysicsAggregate(
    plank,
    PhysicsShapeType.BOX,
    { mass: 3, friction: 0.6 },
    scene,
  );
  plankAgg.body.setAngularDamping(0.6);
  plankAgg.body.setLinearDamping(0.2);
  track(plank);

  const pivotRailZ = 0.8;
  for (const side of [-1, 1]) {
    const joint = new BallAndSocketConstraint(
      new Vector3(0, 0.6, side * pivotRailZ),
      new Vector3(0, -0.15, side * pivotRailZ),
      Vector3.Up(),
      Vector3.Up(),
      scene,
    );
    pivotAgg.body.addConstraint(plankAgg.body, joint);
  }

  for (let i = 0; i < 3; i++) {
    spawnShape(3 + rand(-0.2, 0.2), 3 + i * 1.2, -9 + rand(-0.2, 0.2));
  }
}

export const playgroundScene: SceneDef = {
  label: 'Playground',
  help: 'click: rain shapes',
  build() {
    buildToys();
    const side = 6;
    for (let i = 0; i < 150; i++) {
      const gx = (i % side) - side / 2;
      const gz = (Math.floor(i / side) % side) - side / 2;
      const gy = Math.floor(i / (side * side));
      spawnShape(
        gx * 1.3 + rand(-0.1, 0.1),
        6 + gy * 1.3,
        gz * 1.3 + rand(-0.1, 0.1),
      );
    }
  },
  onClick(at) {
    rainShapes(at, 8);
  },
  onWave() {
    rainShapes({ x: 0, z: 0 }, 50);
  },
};
