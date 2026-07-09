import {
  Color3,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  Vector3,
} from '@babylonjs/core';
import { Body, WheelJoint } from '@frsource/babylon-box3d';
import { plugin, scene } from '../core/engine';
import { material, rand } from '../utils';
import { addStaticMesh, rainShapes, spawnShape, track } from '../world';
import type { SceneDef } from './types';

/**
 * Drivable-buggy state: whether driving input is currently live, and the
 * wheel joints to drive/steer. box3d's wheel joint has no Babylon V2
 * equivalent, so this drops to `plugin.world` directly -- see the
 * package README's "Raw box3d access" section.
 */
export const drive: {
  active: boolean;
  wheels: WheelJoint[];
  steer: WheelJoint[];
} = { active: false, wheels: [], steer: [] };

/** Keys currently held down, populated by the app's keydown/keyup listeners. */
export const pressed = new Set<string>();

/** Builds a drivable buggy: a chassis with 4 wheel-jointed spheres. */
export function buildBuggy(x: number, y: number, z: number): void {
  const chassis = MeshBuilder.CreateBox(
    'chassis',
    { width: 1.8, height: 0.4, depth: 1.0 },
    scene,
  );
  chassis.position.set(x, y, z);
  chassis.material = material(Color3.FromHexString('#f38ba8'), 0.35);
  const chassisAgg = new PhysicsAggregate(
    chassis,
    PhysicsShapeType.BOX,
    { mass: 40, friction: 0.3 },
    scene,
  );
  track(chassis);
  const chassisNative = (
    chassisAgg.body._pluginData as {
      native: Body;
    }
  ).native;
  chassisNative.enableSleep(false);

  const wheelMat = material(Color3.FromHexString('#1e1e2e'), 0.9);
  for (const [wx, wz, steers] of [
    [0.7, 0.62, true],
    [0.7, -0.62, true],
    [-0.7, 0.62, false],
    [-0.7, -0.62, false],
  ] as const) {
    const wheelMesh = MeshBuilder.CreateSphere(
      'wheel',
      { diameter: 0.7, segments: 12 },
      scene,
    );
    wheelMesh.position.set(x + wx, y - 0.25, z + wz);
    wheelMesh.material = wheelMat;
    const wheelAgg = new PhysicsAggregate(
      wheelMesh,
      PhysicsShapeType.SPHERE,
      { mass: 4, friction: 1.2 },
      scene,
    );
    track(wheelMesh);
    const wheelNative = (wheelAgg.body._pluginData as { native: Body }).native;
    wheelNative.enableSleep(false);
    wheelNative.setBullet(true);

    // chassis frame A x maps onto world y (suspension), frame B z is the
    // axle (spin about world z) -- matches the original demo's convention.
    const qXtoY = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const joint = plugin.world.createWheelJoint(chassisNative, wheelNative, {
      localFrameA: { position: { x: wx, y: -0.25, z: wz }, rotation: qXtoY },
      localFrameB: { position: { x: 0, y: 0, z: 0 } },
      enableSuspensionSpring: true,
      suspensionHertz: 4,
      suspensionDampingRatio: 0.7,
      enableSuspensionLimit: true,
      lowerSuspensionLimit: -0.25,
      upperSuspensionLimit: 0.1,
      enableSpinMotor: true,
      maxSpinTorque: 60,
      enableSteering: steers,
      steeringHertz: 8,
      steeringDampingRatio: 1,
      maxSteeringTorque: 80,
      enableSteeringLimit: true,
      lowerSteeringLimit: -0.5,
      upperSteeringLimit: 0.5,
    });
    drive.wheels.push(joint);
    if (steers) drive.steer.push(joint);
  }
}

/** Reads `pressed` and drives the buggy's wheel joints each frame. */
export function updateDrive(): void {
  if (!drive.active) return;
  const forward =
    (pressed.has('ArrowUp') || pressed.has('w') ? 1 : 0) -
    (pressed.has('ArrowDown') || pressed.has('s') ? 1 : 0);
  const turn =
    (pressed.has('ArrowLeft') || pressed.has('a') ? 1 : 0) -
    (pressed.has('ArrowRight') || pressed.has('d') ? 1 : 0);
  for (const joint of drive.wheels) joint.setSpinMotorSpeed(forward * -25);
  for (const joint of drive.steer) joint.setTargetSteeringAngle(turn * -0.45);
}

export const drivingScene: SceneDef = {
  label: 'Driving',
  help: 'drive: arrows or wasd   click: rain obstacles',
  build() {
    drive.active = true;
    buildBuggy(0, 1.2, 6);
    const ramp = MeshBuilder.CreateBox(
      'ramp',
      { width: 9, height: 0.3, depth: 7 },
      scene,
    );
    ramp.position.set(9.5, 0.5, -6);
    ramp.rotationQuaternion = Quaternion.RotationAxis(Vector3.Backward(), 0.27);
    ramp.material = material(Color3.FromHexString('#8a8f98'), 0.7);
    new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, scene);
    addStaticMesh(ramp);
    for (let i = 0; i < 40; i++)
      spawnShape(rand(-10, 10), 1 + (i % 4), rand(-12, 2));
  },
  onClick(at) {
    rainShapes(at, 6);
  },
  onWave() {
    rainShapes({ x: 0, z: 0 }, 20);
  },
};
