import {
  Mesh,
  NullEngine,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsConstraintType,
  PhysicsMotionType,
  PhysicsRaycastResult,
  PhysicsShapeType,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
  VertexBuffer,
  type ConstrainedBodyPair,
  type PhysicsBody,
  type PhysicsConstraint,
  type PhysicsConstraintParameters,
  type PhysicsShape,
  type PhysicsShapeParameters,
} from '@babylonjs/core';
import Box3D from 'box3d-wasm/standard';
import type { Box3DModule } from 'box3d-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3DPlugin } from './box3dPlugin';

let box3d: Box3DModule;
let scene: Scene;

beforeAll(async () => {
  box3d = await Box3D();
  scene = new Scene(new NullEngine());
});

/** A bare stand-in for Babylon's `PhysicsBody` -- only the fields
 * `Box3DPlugin` actually reads/writes (`transformNode`, `_pluginData`,
 * `disablePreStep`, `disableSync`, `startAsleep`) need to be real. */
function fakeBody(overrides: Partial<PhysicsBody> = {}): PhysicsBody {
  return {
    transformNode: new TransformNode('t', scene),
    disablePreStep: false,
    disableSync: false,
    startAsleep: false,
    _pluginData: null,
    ...overrides,
  } as unknown as PhysicsBody;
}

function fakeShape(): PhysicsShape {
  return { _pluginData: null } as unknown as PhysicsShape;
}

function fakeConstraint(
  type: PhysicsConstraintType,
  options: PhysicsConstraintParameters,
): PhysicsConstraint {
  return { type, options, _pluginData: null } as unknown as PhysicsConstraint;
}

const boxShapeParams: PhysicsShapeParameters = {
  extents: new Vector3(1, 1, 1),
};

describe('Box3DPlugin', () => {
  it('constructs a box3d World and reports plugin metadata', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: -10, z: 0 } });
    expect(plugin.name).toBe('Box3D');
    expect(plugin.getPluginVersion()).toBe(2);
    expect(plugin.world.isValid()).toBe(true);
    plugin.dispose();
  });

  it('round-trips gravity, time step and velocity limits', () => {
    const plugin = new Box3DPlugin(box3d);
    plugin.setGravity(new Vector3(0, -20, 0));
    expect(plugin.world.getGravity()).toEqual({ x: 0, y: -20, z: 0 });

    plugin.setTimeStep(1 / 30);
    expect(plugin.getTimeStep()).toBe(1 / 30);

    expect(plugin.getMaxLinearVelocity()).toBe(Infinity);
    plugin.setVelocityLimits(5, 3);
    expect(plugin.getMaxLinearVelocity()).toBe(5);
    expect(plugin.getMaxAngularVelocity()).toBe(3);
    plugin.dispose();
  });

  it('initBody creates a native dynamic body and syncs its transform', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      new Vector3(1, 2, 3),
      Quaternion.Identity(),
    );
    expect(plugin.getMotionType(body)).toBe(PhysicsMotionType.DYNAMIC);

    body._pluginData.native.setLinearVelocity({ x: 0, y: -1, z: 0 });
    plugin.world.step(1, 4);
    plugin.sync(body);
    expect(body.transformNode.position.y).toBeLessThan(2);

    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('setShape attaches a box collider and computes mass from density', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );

    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setDensity(shape, 2);
    plugin.setShape(body, shape);

    expect(plugin.getShape(body)).toBe(shape);
    expect(plugin.getShapeType(shape)).toBe(PhysicsShapeType.BOX);
    // extents are full-size, so a (1,1,1) box is a 1x1x1 cube: density 2 => mass 2.
    expect(plugin.getMassProperties(body).mass).toBeCloseTo(2, 5);

    plugin.disposeShape(shape);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('rejects unsupported shape types with a descriptive error', () => {
    const plugin = new Box3DPlugin(box3d);
    const shape = fakeShape();
    expect(() => plugin.initShape(shape, PhysicsShapeType.MESH, {})).toThrow(
      /not supported by box3d-wasm/,
    );
    plugin.dispose();
  });

  it('throws when reading plugin data for an uninitialized body', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    expect(() => plugin.getMotionType(body)).toThrow(
      /has not been initialized/,
    );
    plugin.dispose();
  });

  it('clamps linear velocity during executeStep when a limit is set', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.setLinearVelocity(body, new Vector3(100, 0, 0));
    plugin.setVelocityLimits(10, Infinity);

    plugin.executeStep(1 / 60, [body]);

    const out = new Vector3();
    plugin.getLinearVelocityToRef(body, out);
    expect(out.length()).toBeCloseTo(10, 3);

    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('raycast reports the closest hit and populates the result', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.STATIC,
      new Vector3(0, 0, 5),
      Quaternion.Identity(),
    );
    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(body, shape);

    const result = new PhysicsRaycastResult();
    plugin.raycast(new Vector3(0, 0, 0), new Vector3(0, 0, 10), result);

    expect(result.hasHit).toBe(true);
    expect(result.body).toBe(body);
    // box at z=5 with extents (1,1,1) => near face at z=4.5.
    expect(result.hitDistance).toBeCloseTo(4.5, 1);

    plugin.disposeShape(shape);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('initConstraint builds a distance joint reporting the constrained bodies', () => {
    const plugin = new Box3DPlugin(box3d);
    const bodyA = fakeBody();
    const bodyB = fakeBody();
    plugin.initBody(
      bodyA,
      PhysicsMotionType.STATIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.initBody(
      bodyB,
      PhysicsMotionType.DYNAMIC,
      new Vector3(0, -2, 0),
      Quaternion.Identity(),
    );

    const constraint = fakeConstraint(PhysicsConstraintType.DISTANCE, {
      maxDistance: 2,
    });
    plugin.initConstraint(constraint, bodyA, bodyB);

    const pairs: ConstrainedBodyPair[] =
      plugin.getBodiesUsingConstraint(constraint);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.parentBody).toBe(bodyA);
    expect(pairs[0]?.childBody).toBe(bodyB);

    expect(plugin.getEnabled(constraint)).toBe(true);
    plugin.setEnabled(constraint, false);
    expect(plugin.getEnabled(constraint)).toBe(false);

    plugin.disposeConstraint(constraint);
    plugin.disposeBody(bodyA);
    plugin.disposeBody(bodyB);
    plugin.dispose();
  });

  it('dispose tears down every tracked body and the native world', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    const native = (body._pluginData as { native: { isValid(): boolean } })
      .native;

    plugin.dispose();

    expect(native.isValid()).toBe(false);
    expect(plugin.world.isValid()).toBe(false);
  });

  it('creates sphere, capsule and convex hull shapes', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );

    const sphere = fakeShape();
    plugin.initShape(sphere, PhysicsShapeType.SPHERE, { radius: 1 });
    plugin.setShape(body, sphere);
    expect(plugin.getBoundingBox(sphere).minimum.x).toBeCloseTo(-1, 5);

    const capsule = fakeShape();
    plugin.initShape(capsule, PhysicsShapeType.CAPSULE, {
      radius: 0.5,
      pointA: new Vector3(0, -1, 0),
      pointB: new Vector3(0, 1, 0),
    });
    plugin.setShape(body, capsule);
    expect(plugin.getShapeType(capsule)).toBe(PhysicsShapeType.CAPSULE);

    const mesh = new Mesh('m', scene);
    mesh.setVerticesData(
      VertexBuffer.PositionKind,
      new Float32Array([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1,
        1, -1, 1, 1,
      ]),
    );
    const hull = fakeShape();
    plugin.initShape(hull, PhysicsShapeType.CONVEX_HULL, { mesh });
    plugin.setShape(body, hull);
    expect(plugin.getShapeType(hull)).toBe(PhysicsShapeType.CONVEX_HULL);

    mesh.dispose();
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('composes CONTAINER shapes from children and reports their combined bounds', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );

    const child = fakeShape();
    plugin.initShape(child, PhysicsShapeType.BOX, boxShapeParams);

    const container = fakeShape();
    plugin.initShape(container, PhysicsShapeType.CONTAINER, {});
    plugin.addChild(container, child, new Vector3(2, 0, 0));
    expect(plugin.getNumChildren(container)).toBe(1);
    plugin.setShape(body, container);

    const bounds = plugin.getBoundingBox(container);
    expect(bounds.maximum.x).toBeCloseTo(2.5, 5);

    plugin.removeChild(container, 0);
    expect(plugin.getNumChildren(container)).toBe(0);

    plugin.disposeShape(container);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('round-trips shape filters, material and trigger flag', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(body, shape);

    plugin.setShapeFilterMembershipMask(shape, 2);
    plugin.setShapeFilterCollideMask(shape, 4);
    expect(plugin.getShapeFilterMembershipMask(shape)).toBe(2);
    expect(plugin.getShapeFilterCollideMask(shape)).toBe(4);

    plugin.setMaterial(shape, { friction: 0.2, restitution: 0.8 });
    expect(plugin.getMaterial(shape)).toEqual({
      friction: 0.2,
      restitution: 0.8,
    });

    plugin.setTrigger(shape, true);
    expect(plugin.getShape(body)).toBe(shape);

    plugin.disposeShape(shape);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('initBodyInstances treats the mesh transform as a single simulated body', () => {
    const plugin = new Box3DPlugin(box3d);
    const mesh = new Mesh('inst', scene);
    mesh.position.set(3, 4, 5);
    plugin.initBodyInstances(
      { _pluginData: null } as unknown as PhysicsBody,
      PhysicsMotionType.DYNAMIC,
      mesh,
    );
    plugin.updateBodyInstances({} as unknown as PhysicsBody, mesh);
    mesh.dispose();
    plugin.dispose();
  });

  it('applies forces, impulses and torque, and syncs kinematic targets pre-step', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.applyForce(body, new Vector3(1, 0, 0), Vector3.Zero());
    plugin.applyImpulse(body, new Vector3(0, 1, 0), Vector3.Zero());
    plugin.applyAngularImpulse(body, new Vector3(0, 0, 1));
    plugin.applyTorque(body, new Vector3(0, 0, 1));
    plugin.setAngularVelocity(body, new Vector3(0, 0, 2));
    const angVel = new Vector3();
    plugin.getAngularVelocityToRef(body, angVel);
    expect(angVel.z).toBeCloseTo(2, 5);

    plugin.setGravityFactor(body, 0.5);
    expect(plugin.getGravityFactor(body)).toBeCloseTo(0.5, 5);
    plugin.setLinearDamping(body, 0.1);
    expect(plugin.getLinearDamping(body)).toBeCloseTo(0.1, 5);
    plugin.setAngularDamping(body, 0.2);
    expect(plugin.getAngularDamping(body)).toBeCloseTo(0.2, 5);
    expect(plugin.getBodyGeometry(body)).toEqual({});

    // kinematic body: executeStep must push the transform node's pose into
    // box3d (the `_prestep` path) instead of reading the solver back.
    const kinematic = fakeBody();
    plugin.initBody(
      kinematic,
      PhysicsMotionType.ANIMATED,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    kinematic.transformNode.position.set(9, 9, 9);
    plugin.executeStep(1 / 60, [kinematic]);
    expect(plugin.getMotionType(kinematic)).toBe(PhysicsMotionType.ANIMATED);

    plugin.disposeBody(body);
    plugin.disposeBody(kinematic);
    plugin.dispose();
  });

  it('dispatches collision and trigger events to per-body and global observables', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });

    const bodyA = fakeBody();
    const bodyB = fakeBody();
    plugin.initBody(
      bodyA,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.initBody(
      bodyB,
      PhysicsMotionType.DYNAMIC,
      new Vector3(0.05, 0, 0),
      Quaternion.Identity(),
    );
    const shapeA = fakeShape();
    const shapeB = fakeShape();
    plugin.initShape(shapeA, PhysicsShapeType.BOX, boxShapeParams);
    plugin.initShape(shapeB, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(bodyA, shapeA);
    plugin.setShape(bodyB, shapeB);
    plugin.setCollisionCallbackEnabled(bodyA, true);

    let globalEvents = 0;
    plugin.onCollisionObservable.add(() => globalEvents++);
    let perBodyEvents = 0;
    plugin.getCollisionObservable(bodyA).add(() => perBodyEvents++);

    for (let i = 0; i < 5; i++) plugin.executeStep(1 / 60, [bodyA, bodyB]);

    expect(globalEvents).toBeGreaterThan(0);
    expect(perBodyEvents).toBeGreaterThan(0);

    plugin.setCollisionEndedCallbackEnabled(bodyA, true);
    plugin.disposeShape(shapeA);
    plugin.disposeShape(shapeB);
    plugin.disposeBody(bodyA);
    plugin.disposeBody(bodyB);
    plugin.dispose();
  });

  it('builds hinge, spherical, prismatic and weld joints and rebuilds on axis changes', () => {
    const plugin = new Box3DPlugin(box3d);
    const bodyA = fakeBody();
    const bodyB = fakeBody();
    plugin.initBody(
      bodyA,
      PhysicsMotionType.STATIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.initBody(
      bodyB,
      PhysicsMotionType.DYNAMIC,
      new Vector3(1, 0, 0),
      Quaternion.Identity(),
    );

    const hinge = fakeConstraint(PhysicsConstraintType.HINGE, {
      axisA: Vector3.Right(),
      axisB: Vector3.Right(),
    });
    plugin.initConstraint(hinge, bodyA, bodyB);
    plugin.setAxisMode(
      hinge,
      PhysicsConstraintAxis.ANGULAR_X,
      PhysicsConstraintAxisLimitMode.LIMITED,
    );
    plugin.setAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, -1);
    plugin.setAxisMaxLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, 1);
    plugin.setAxisMotorType(
      hinge,
      PhysicsConstraintAxis.ANGULAR_X,
      PhysicsConstraintMotorType.VELOCITY,
    );
    plugin.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 2);
    plugin.setAxisMotorMaxForce(hinge, PhysicsConstraintAxis.ANGULAR_X, 50);
    expect(plugin.getAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X)).toBe(
      -1,
    );
    expect(
      plugin.getAxisMotorType(hinge, PhysicsConstraintAxis.ANGULAR_X),
    ).toBe(PhysicsConstraintMotorType.VELOCITY);
    plugin.setAxisFriction(hinge, PhysicsConstraintAxis.ANGULAR_X, 3);
    expect(plugin.getAxisFriction(hinge, PhysicsConstraintAxis.ANGULAR_X)).toBe(
      3,
    );

    const ball = fakeConstraint(PhysicsConstraintType.BALL_AND_SOCKET, {});
    plugin.initConstraint(ball, bodyA, bodyB);

    const slider = fakeConstraint(PhysicsConstraintType.PRISMATIC, {
      axisA: Vector3.Up(),
      axisB: Vector3.Up(),
    });
    plugin.initConstraint(slider, bodyA, bodyB);

    const lock = fakeConstraint(PhysicsConstraintType.LOCK, {});
    plugin.initConstraint(lock, bodyA, bodyB);

    const sixDof = fakeConstraint(PhysicsConstraintType.SIX_DOF, {});
    plugin.initConstraint(sixDof, bodyA, bodyB);

    plugin.setCollisionsEnabled(hinge, true);
    expect(plugin.getCollisionsEnabled(hinge)).toBe(true);

    for (const c of [hinge, ball, slider, lock, sixDof]) {
      plugin.disposeConstraint(c);
    }
    plugin.disposeBody(bodyA);
    plugin.disposeBody(bodyB);
    plugin.dispose();
  });

  it('raycast skips a hit whose body matches the ignoreBody query option', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.STATIC,
      new Vector3(0, 0, 5),
      Quaternion.Identity(),
    );
    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(body, shape);

    const result = new PhysicsRaycastResult();
    plugin.raycast(new Vector3(0, 0, 0), new Vector3(0, 0, 10), result, {
      ignoreBody: body,
    });
    expect(result.hasHit).toBe(false);

    plugin.disposeShape(shape);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('setMassProperties scales attached shape densities to hit a target mass', () => {
    const plugin = new Box3DPlugin(box3d);
    const body = fakeBody();
    plugin.initBody(
      body,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setDensity(shape, 1);
    plugin.setShape(body, shape);

    plugin.setMassProperties(body, { mass: 10 });
    expect(plugin.getMassProperties(body).mass).toBeCloseTo(10, 4);

    plugin.disposeShape(shape);
    plugin.disposeBody(body);
    plugin.dispose();
  });

  it('covers the remaining body/shape/axis accessors and addConstraint', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });
    plugin.setSubStepCount(8);

    const bodyA = fakeBody();
    const bodyB = fakeBody();
    plugin.initBody(
      bodyA,
      PhysicsMotionType.STATIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.initBody(
      bodyB,
      PhysicsMotionType.DYNAMIC,
      new Vector3(0, -2, 0),
      Quaternion.Identity(),
    );

    plugin.setEventMask(bodyB, 5);
    expect(plugin.getEventMask(bodyB)).toBe(5);
    plugin.setMotionType(bodyB, PhysicsMotionType.STATIC);
    expect(plugin.getMotionType(bodyB)).toBe(PhysicsMotionType.STATIC);
    plugin.setMotionType(bodyB, PhysicsMotionType.DYNAMIC);
    plugin.setTargetTransform(
      bodyB,
      new Vector3(1, 1, 1),
      Quaternion.Identity(),
    );
    plugin.getCollisionEndedObservable(bodyB);

    const shape = fakeShape();
    plugin.initShape(shape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setDensity(shape, 3);
    expect(plugin.getDensity(shape)).toBe(3);
    plugin.setShape(bodyB, shape);
    expect(plugin.computeMassProperties(bodyB).mass).toBeCloseTo(3, 5);
    expect(plugin.getBodyBoundingBox(bodyB)).toBeTruthy();

    const distance = fakeConstraint(PhysicsConstraintType.DISTANCE, {
      maxDistance: 2,
    });
    plugin.addConstraint(bodyA, bodyB, distance);
    plugin.setAxisMode(
      distance,
      PhysicsConstraintAxis.LINEAR_DISTANCE,
      PhysicsConstraintAxisLimitMode.LIMITED,
    );
    plugin.setAxisMaxLimit(distance, PhysicsConstraintAxis.LINEAR_DISTANCE, 5);
    plugin.setAxisMotorType(
      distance,
      PhysicsConstraintAxis.LINEAR_DISTANCE,
      PhysicsConstraintMotorType.VELOCITY,
    );
    plugin.setAxisMotorTarget(
      distance,
      PhysicsConstraintAxis.LINEAR_DISTANCE,
      1,
    );
    plugin.setAxisMotorMaxForce(
      distance,
      PhysicsConstraintAxis.LINEAR_DISTANCE,
      20,
    );
    expect(
      plugin.getAxisMode(distance, PhysicsConstraintAxis.LINEAR_DISTANCE),
    ).toBe(PhysicsConstraintAxisLimitMode.LIMITED);
    expect(
      plugin.getAxisMaxLimit(distance, PhysicsConstraintAxis.LINEAR_DISTANCE),
    ).toBe(5);
    expect(
      plugin.getAxisMotorTarget(
        distance,
        PhysicsConstraintAxis.LINEAR_DISTANCE,
      ),
    ).toBe(1);
    expect(
      plugin.getAxisMotorMaxForce(
        distance,
        PhysicsConstraintAxis.LINEAR_DISTANCE,
      ),
    ).toBe(20);

    plugin.disposeConstraint(distance);
    plugin.disposeShape(shape);
    plugin.disposeBody(bodyA);
    plugin.disposeBody(bodyB);
    plugin.dispose();
  });

  it('notifies collision-ended observables once overlapping bodies separate', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });

    const bodyA = fakeBody();
    const bodyB = fakeBody();
    plugin.initBody(
      bodyA,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    plugin.initBody(
      bodyB,
      PhysicsMotionType.DYNAMIC,
      new Vector3(0.05, 0, 0),
      Quaternion.Identity(),
    );
    const shapeA = fakeShape();
    const shapeB = fakeShape();
    plugin.initShape(shapeA, PhysicsShapeType.BOX, boxShapeParams);
    plugin.initShape(shapeB, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(bodyA, shapeA);
    plugin.setShape(bodyB, shapeB);
    plugin.setCollisionEndedCallbackEnabled(bodyA, true);

    let ended = 0;
    plugin.onCollisionEndedObservable.add(() => ended++);
    plugin.getCollisionEndedObservable(bodyA).add(() => undefined);

    plugin.executeStep(1 / 60, [bodyA, bodyB]);
    plugin.setLinearVelocity(bodyB, new Vector3(50, 0, 0));
    for (let i = 0; i < 10; i++) plugin.executeStep(1 / 60, [bodyA, bodyB]);
    expect(ended).toBeGreaterThan(0);

    plugin.disposeShape(shapeA);
    plugin.disposeShape(shapeB);
    plugin.disposeBody(bodyA);
    plugin.disposeBody(bodyB);
    plugin.dispose();
  });

  it('notifies the trigger observable when a body enters a sensor shape', () => {
    const plugin = new Box3DPlugin(box3d, { gravity: { x: 0, y: 0, z: 0 } });

    const sensorBody = fakeBody();
    plugin.initBody(
      sensorBody,
      PhysicsMotionType.STATIC,
      new Vector3(3, 0, 0),
      Quaternion.Identity(),
    );
    const sensorShape = fakeShape();
    plugin.initShape(sensorShape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setTrigger(sensorShape, true);
    plugin.setShape(sensorBody, sensorShape);

    const visitor = fakeBody();
    plugin.initBody(
      visitor,
      PhysicsMotionType.DYNAMIC,
      Vector3.Zero(),
      Quaternion.Identity(),
    );
    const visitorShape = fakeShape();
    plugin.initShape(visitorShape, PhysicsShapeType.BOX, boxShapeParams);
    plugin.setShape(visitor, visitorShape);
    plugin.setLinearVelocity(visitor, new Vector3(20, 0, 0));

    let triggered = 0;
    plugin.onTriggerCollisionObservable.add(() => triggered++);
    for (let i = 0; i < 30; i++) plugin.executeStep(1 / 60, [visitor]);
    expect(triggered).toBeGreaterThan(0);

    plugin.disposeShape(sensorShape);
    plugin.disposeShape(visitorShape);
    plugin.disposeBody(sensorBody);
    plugin.disposeBody(visitor);
    plugin.dispose();
  });
});
