import {
  type BoundingBox as BoundingBoxType,
  BoundingBox,
  type ConstrainedBodyPair,
  type IBasePhysicsCollisionEvent,
  type IPhysicsCollisionEvent,
  type IPhysicsEnginePluginV2,
  type IRaycastQuery,
  Matrix,
  type Mesh,
  type Nullable,
  Observable,
  type PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  type PhysicsConstraint,
  type PhysicsConstraintParameters,
  PhysicsConstraintType,
  PhysicsEventType,
  type PhysicsMassProperties,
  type PhysicsMaterial,
  PhysicsMotionType,
  type PhysicsRaycastResult,
  type PhysicsShape,
  type PhysicsShapeParameters,
  PhysicsShapeType,
  Quaternion,
  type TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import type {
  Body as Box3DBody,
  Box3DModule,
  Joint as Box3DJoint,
  Quat as Box3DQuat,
  Shape as Box3DShape,
  Vec3 as Box3DVec3,
  World as Box3DWorld,
} from 'box3d-wasm';

/** Sub-steps handed to `World.step`. Box3D (like Box2D v3) uses soft-constraint sub-stepping instead of Havok's single-iteration solver. */
const DEFAULT_SUB_STEP_COUNT = 4;

function toB3Vec(v: Vector3): Box3DVec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function fromB3Vec(v: Box3DVec3, out?: Vector3): Vector3 {
  if (out) {
    out.set(v.x, v.y, v.z);
    return out;
  }
  return new Vector3(v.x, v.y, v.z);
}

function toB3Quat(q: Quaternion): Box3DQuat {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function fromB3Quat(q: Box3DQuat, out?: Quaternion): Quaternion {
  if (out) {
    out.set(q.x, q.y, q.z, q.w);
    return out;
  }
  return new Quaternion(q.x, q.y, q.z, q.w);
}

/** Shortest-arc rotation that takes the local +X axis onto `axis`, matching how Havok/box3d constraints treat axisA/axisB as the constraint's primary (local X) direction. */
function quaternionFromXAxis(axis: Vector3): Quaternion {
  const from = Vector3.Right();
  const to = axis.normalizeToNew();
  const dot = Vector3.Dot(from, to);
  if (dot > 1 - 1e-6) {
    return Quaternion.Identity();
  }
  if (dot < -1 + 1e-6) {
    // 180 degree turn: any axis perpendicular to `from` works.
    const perp = Math.abs(from.y) < 0.99 ? Vector3.Up() : Vector3.Forward();
    const axisOfRotation = Vector3.Cross(from, perp).normalize();
    return Quaternion.RotationAxis(axisOfRotation, Math.PI);
  }
  const axisOfRotation = Vector3.Cross(from, to);
  const s = Math.sqrt((1 + dot) * 2);
  const invS = 1 / s;
  return new Quaternion(
    axisOfRotation.x * invS,
    axisOfRotation.y * invS,
    axisOfRotation.z * invS,
    s * 0.5,
  ).normalize();
}

/** Native geometry attached to a body on behalf of one leaf `PhysicsShape` node (the shape itself, or one of its CONTAINER descendants). */
interface ShapeAttachment {
  shape: PhysicsShape;
  native: Box3DShape;
}

/** A child shape added to a (possibly CONTAINER) shape via `addChild`, with its transform relative to the parent. */
interface ShapeChild {
  shape: PhysicsShape;
  translation: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/** Everything the plugin needs to remember about a `PhysicsBody`. Mirrors Havok's `BodyPluginData`. */
class Box3DBodyPluginData {
  public shape: Nullable<PhysicsShape> = null;
  public attachments: ShapeAttachment[] = [];
  public motionType: PhysicsMotionType = PhysicsMotionType.STATIC;
  public eventMask = 0;
  public collisionCBEnabled = false;
  public collisionEndedCBEnabled = false;
  public onCollisionObservable = new Observable<IPhysicsCollisionEvent>();
  public onCollisionEndedObservable =
    new Observable<IBasePhysicsCollisionEvent>();

  public constructor(public native: Box3DBody) {}
}

/** Per-shape state. box3d-wasm has no free-standing shape object (geometry is always created against a body), so a `PhysicsShape` is really just this descriptor until it's attached to a body via `setShape`. */
class Box3DShapeDescriptor {
  public filterMembershipMask = 1;
  public filterCollideMask = 0xffffffff;
  public material: PhysicsMaterial = { friction: 0.5, restitution: 0 };
  public density = 1;
  public isTrigger = false;
  public children: ShapeChild[] = [];

  public constructor(
    public type: PhysicsShapeType,
    public parameters: PhysicsShapeParameters,
  ) {}
}

type JointFactory = (data: Box3DConstraintPluginData) => Nullable<Box3DJoint>;

/** Everything needed to (re)build the underlying box3d joint for a `PhysicsConstraint`. Axis setters mutate the cached values below and call `_rebuild`, which destroys and recreates the native joint — box3d's bound API only exposes limit/motor fields on joint *creation*, not generic post-hoc setters for every axis. */
class Box3DConstraintPluginData {
  public native: Nullable<Box3DJoint> = null;
  public enabled = true;
  public collideConnected = false;
  public readonly axisMotorType = new Map<
    PhysicsConstraintAxis,
    PhysicsConstraintMotorType
  >();
  public readonly axisMotorTarget = new Map<PhysicsConstraintAxis, number>();
  public readonly axisMotorMaxForce = new Map<PhysicsConstraintAxis, number>();
  public readonly axisLimitMode = new Map<
    PhysicsConstraintAxis,
    PhysicsConstraintAxisLimitMode
  >();
  public readonly axisMinLimit = new Map<PhysicsConstraintAxis, number>();
  public readonly axisMaxLimit = new Map<PhysicsConstraintAxis, number>();
  public readonly axisFriction = new Map<PhysicsConstraintAxis, number>();

  public constructor(
    public readonly type: PhysicsConstraintType,
    public readonly bodyPair: ConstrainedBodyPair,
    public readonly buildJoint: (
      data: Box3DConstraintPluginData,
    ) => Nullable<Box3DJoint>,
  ) {}

  public rebuild(): void {
    if (this.native && this.native.isValid()) {
      this.native.destroy(true);
    }
    this.native = this.enabled ? this.buildJoint(this) : null;
  }
}

/**
 * Babylon.js Physics V2 plugin backed by {@link https://github.com/monteslu/box3d-wasm | box3d-wasm}.
 *
 * Modeled after `@babylonjs/core`'s `HavokPlugin` (same file layout as
 * `Physics/v2/Plugins/havokPlugin.ts`), adapted to the narrower API surface
 * that box3d-wasm's embind bindings expose. See the package README for a
 * summary of what isn't (fully) supported.
 */
export class Box3DPlugin implements IPhysicsEnginePluginV2 {
  public world: Box3DWorld;
  public name = 'Box3D';

  public onCollisionObservable = new Observable<IPhysicsCollisionEvent>();
  public onCollisionEndedObservable =
    new Observable<IBasePhysicsCollisionEvent>();
  public onTriggerCollisionObservable =
    new Observable<IBasePhysicsCollisionEvent>();

  private _timeStep = 1 / 60;
  private _subStepCount = DEFAULT_SUB_STEP_COUNT;
  private _maxLinearVelocity = Infinity;
  private _maxAngularVelocity = Infinity;

  private readonly _bodies = new Map<PhysicsBody, Box3DBodyPluginData>();
  private readonly _shapeOwners = new Map<
    number,
    { body: PhysicsBody; shape: PhysicsShape }
  >();
  private _warnedAboutInstancing = false;

  /**
   * @param box3d - The resolved box3d-wasm module, e.g. `await Box3D()`.
   * @param worldOptions - Forwarded to box3d-wasm's `World` constructor (gravity, sleep, continuous collision, thread count, ...).
   */
  public constructor(
    box3d: Box3DModule,
    worldOptions?: ConstructorParameters<Box3DModule['World']>[0],
  ) {
    this.world = new box3d.World(worldOptions);
  }

  public setGravity(gravity: Vector3): void {
    this.world.setGravity(toB3Vec(gravity));
  }

  public setTimeStep(timeStep: number): void {
    this._timeStep = timeStep;
  }

  public getTimeStep(): number {
    return this._timeStep;
  }

  /** Number of box3d solver sub-steps per `executeStep` call. Defaults to 4, matching box3d's own samples. */
  public setSubStepCount(subStepCount: number): void {
    this._subStepCount = subStepCount;
  }

  public getPluginVersion(): number {
    return 2;
  }

  public setVelocityLimits(
    maxLinearVelocity: number,
    maxAngularVelocity: number,
  ): void {
    // box3d-wasm exposes `maximumLinearSpeed` only at world-creation time, and has no
    // angular speed limit at all. We keep the values so getters are honest and clamp
    // linear velocity ourselves after each step.
    this._maxLinearVelocity = maxLinearVelocity;
    this._maxAngularVelocity = maxAngularVelocity;
  }

  public getMaxLinearVelocity(): number {
    return this._maxLinearVelocity;
  }

  public getMaxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  public executeStep(delta: number, bodies: Array<PhysicsBody>): void {
    for (const body of bodies) {
      if (!body.disablePreStep) {
        this._prestep(body);
      }
    }

    this.world.step(delta, this._subStepCount);

    if (Number.isFinite(this._maxLinearVelocity)) {
      this._clampLinearVelocities(bodies);
    }

    for (const body of bodies) {
      if (!body.disableSync) {
        this.sync(body);
      }
    }

    this._dispatchEvents();
  }

  private _clampLinearVelocities(bodies: Array<PhysicsBody>): void {
    const max = this._maxLinearVelocity;
    for (const body of bodies) {
      const data = this._getPluginData(body);
      const v = data.native.getLinearVelocity();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed > max && speed > 0) {
        const scale = max / speed;
        data.native.setLinearVelocity({
          x: v.x * scale,
          y: v.y * scale,
          z: v.z * scale,
        });
      }
    }
  }

  /** Pushes kinematic/animated transform-node motion into box3d before stepping. Dynamic bodies are driven by the solver and skip this. */
  private _prestep(body: PhysicsBody): void {
    const data = body._pluginData as Nullable<Box3DBodyPluginData>;
    if (!data || data.motionType === PhysicsMotionType.DYNAMIC) {
      return;
    }
    const node = body.transformNode;
    const position = node.position;
    const rotation =
      node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    data.native.setTargetTransform(
      { position: toB3Vec(position), rotation: toB3Quat(rotation) },
      this._timeStep,
      true,
    );
  }

  // -------------------------------------------------------------------
  // Body
  // -------------------------------------------------------------------

  public initBody(
    body: PhysicsBody,
    motionType: PhysicsMotionType,
    position: Vector3,
    orientation: Quaternion,
  ): void {
    const native = this.world.createBody({
      type: toBox3DBodyType(motionType),
      position: toB3Vec(position),
      rotation: toB3Quat(orientation),
      isAwake: !body.startAsleep,
    });
    const data = new Box3DBodyPluginData(native);
    data.motionType = motionType;
    body._pluginData = data;
    this._bodies.set(body, data);
  }

  public initBodyInstances(
    body: PhysicsBody,
    motionType: PhysicsMotionType,
    mesh: Mesh,
  ): void {
    if (!this._warnedAboutInstancing) {
      this._warnedAboutInstancing = true;
      // eslint-disable-next-line no-console
      console.warn(
        'Box3DPlugin: box3d-wasm has no batched rigid body instancing; only the master mesh transform is simulated.',
      );
    }
    const position = mesh.position.clone();
    const rotation =
      mesh.rotationQuaternion?.clone() ??
      Quaternion.FromEulerVector(mesh.rotation);
    this.initBody(body, motionType, position, rotation);
  }

  public updateBodyInstances(_body: PhysicsBody, _mesh: Mesh): void {
    // No-op: see initBodyInstances - only a single instance is ever simulated.
  }

  public removeBody(body: PhysicsBody): void {
    const data = this._bodies.get(body);
    if (!data) {
      return;
    }
    this._destroyAttachments(data);
    if (data.native.isValid()) {
      data.native.destroy();
    }
    this._bodies.delete(body);
  }

  public sync(body: PhysicsBody): void {
    this.syncTransform(body, body.transformNode);
  }

  public syncTransform(body: PhysicsBody, transformNode: TransformNode): void {
    const data = body._pluginData as Nullable<Box3DBodyPluginData>;
    if (!data || data.motionType !== PhysicsMotionType.DYNAMIC) {
      return;
    }
    fromB3Vec(data.native.getPosition(), transformNode.position);
    transformNode.rotationQuaternion = fromB3Quat(
      data.native.getRotation(),
      transformNode.rotationQuaternion ?? new Quaternion(),
    );
  }

  public setShape(body: PhysicsBody, shape: Nullable<PhysicsShape>): void {
    const data = this._getPluginData(body);
    this._destroyAttachments(data);
    data.shape = shape;
    if (shape) {
      this._attachShape(
        body,
        data,
        shape,
        Vector3.Zero(),
        Quaternion.Identity(),
        Vector3.One(),
      );
      data.native.applyMassFromShapes();
    }
  }

  public getShape(body: PhysicsBody): Nullable<PhysicsShape> {
    return this._getPluginData(body).shape;
  }

  public getShapeType(shape: PhysicsShape): PhysicsShapeType {
    return this._getShapeData(shape).type;
  }

  public setEventMask(body: PhysicsBody, eventMask: number): void {
    this._getPluginData(body).eventMask = eventMask;
  }

  public getEventMask(body: PhysicsBody): number {
    return this._getPluginData(body).eventMask;
  }

  public setMotionType(body: PhysicsBody, motionType: PhysicsMotionType): void {
    const data = this._getPluginData(body);
    data.motionType = motionType;
    data.native.setType(toBox3DBodyType(motionType));
  }

  public getMotionType(body: PhysicsBody): PhysicsMotionType {
    return this._getPluginData(body).motionType;
  }

  public computeMassProperties(body: PhysicsBody): PhysicsMassProperties {
    const data = this._getPluginData(body);
    data.native.applyMassFromShapes();
    return {
      mass: data.native.getMass(),
      centerOfMass: fromB3Vec(data.native.getLocalCenterOfMass()),
    };
  }

  public setMassProperties(
    body: PhysicsBody,
    massProps: PhysicsMassProperties,
  ): void {
    const data = this._getPluginData(body);
    if (
      massProps.inertia ||
      massProps.inertiaOrientation ||
      massProps.centerOfMass
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        'Box3DPlugin: box3d-wasm derives inertia and center of mass from shape density; only `mass` can be overridden.',
      );
    }
    if (massProps.mass === undefined) {
      return;
    }
    data.native.applyMassFromShapes();
    const currentMass = data.native.getMass();
    if (currentMass <= 0 || data.attachments.length === 0) {
      return;
    }
    const scale = massProps.mass / currentMass;
    for (const attachment of data.attachments) {
      attachment.native.setDensity(
        attachment.native.getDensity() * scale,
        false,
      );
    }
    data.native.applyMassFromShapes();
  }

  public getMassProperties(body: PhysicsBody): PhysicsMassProperties {
    const data = this._getPluginData(body);
    return {
      mass: data.native.getMass(),
      centerOfMass: fromB3Vec(data.native.getLocalCenterOfMass()),
    };
  }

  public setLinearDamping(body: PhysicsBody, damping: number): void {
    this._getPluginData(body).native.setLinearDamping(damping);
  }

  public getLinearDamping(body: PhysicsBody): number {
    return this._getPluginData(body).native.getLinearDamping();
  }

  public setAngularDamping(body: PhysicsBody, damping: number): void {
    this._getPluginData(body).native.setAngularDamping(damping);
  }

  public getAngularDamping(body: PhysicsBody): number {
    return this._getPluginData(body).native.getAngularDamping();
  }

  public setLinearVelocity(body: PhysicsBody, linVel: Vector3): void {
    this._getPluginData(body).native.setLinearVelocity(toB3Vec(linVel));
  }

  public getLinearVelocityToRef(body: PhysicsBody, linVel: Vector3): void {
    fromB3Vec(this._getPluginData(body).native.getLinearVelocity(), linVel);
  }

  public applyImpulse(
    body: PhysicsBody,
    impulse: Vector3,
    location: Vector3,
  ): void {
    this._getPluginData(body).native.applyLinearImpulse(
      toB3Vec(impulse),
      toB3Vec(location),
      true,
    );
  }

  public applyAngularImpulse(body: PhysicsBody, angularImpulse: Vector3): void {
    this._getPluginData(body).native.applyAngularImpulse(
      toB3Vec(angularImpulse),
      true,
    );
  }

  public applyForce(
    body: PhysicsBody,
    force: Vector3,
    location: Vector3,
  ): void {
    this._getPluginData(body).native.applyForce(
      toB3Vec(force),
      toB3Vec(location),
      true,
    );
  }

  public applyTorque(body: PhysicsBody, torque: Vector3): void {
    this._getPluginData(body).native.applyTorque(toB3Vec(torque), true);
  }

  public setAngularVelocity(body: PhysicsBody, angVel: Vector3): void {
    this._getPluginData(body).native.setAngularVelocity(toB3Vec(angVel));
  }

  public getAngularVelocityToRef(body: PhysicsBody, angVel: Vector3): void {
    fromB3Vec(this._getPluginData(body).native.getAngularVelocity(), angVel);
  }

  public getBodyGeometry(_body: PhysicsBody): object {
    // box3d-wasm doesn't expose triangulated collision geometry back to JS.
    return {};
  }

  public disposeBody(body: PhysicsBody): void {
    const data = this._bodies.get(body);
    if (!data) {
      return;
    }
    data.onCollisionObservable.clear();
    data.onCollisionEndedObservable.clear();
    this.removeBody(body);
    body._pluginData = null;
  }

  public setCollisionCallbackEnabled(
    body: PhysicsBody,
    enabled: boolean,
  ): void {
    const data = this._getPluginData(body);
    data.collisionCBEnabled = enabled;
  }

  public setCollisionEndedCallbackEnabled(
    body: PhysicsBody,
    enabled: boolean,
  ): void {
    const data = this._getPluginData(body);
    data.collisionEndedCBEnabled = enabled;
  }

  public addConstraint(
    body: PhysicsBody,
    childBody: PhysicsBody,
    constraint: PhysicsConstraint,
  ): void {
    this.initConstraint(constraint, body, childBody);
  }

  public getCollisionObservable(
    body: PhysicsBody,
  ): Observable<IPhysicsCollisionEvent> {
    return this._getPluginData(body).onCollisionObservable;
  }

  public getCollisionEndedObservable(
    body: PhysicsBody,
  ): Observable<IBasePhysicsCollisionEvent> {
    return this._getPluginData(body).onCollisionEndedObservable;
  }

  public setGravityFactor(body: PhysicsBody, factor: number): void {
    this._getPluginData(body).native.setGravityScale(factor);
  }

  public getGravityFactor(body: PhysicsBody): number {
    return this._getPluginData(body).native.getGravityScale();
  }

  public setTargetTransform(
    body: PhysicsBody,
    position: Vector3,
    rotation: Quaternion,
  ): void {
    this._getPluginData(body).native.setTargetTransform(
      { position: toB3Vec(position), rotation: toB3Quat(rotation) },
      this._timeStep,
      true,
    );
  }

  private _getPluginData(body: PhysicsBody): Box3DBodyPluginData {
    const data = body._pluginData as Nullable<Box3DBodyPluginData>;
    if (!data) {
      throw new Error(
        'Box3DPlugin: PhysicsBody has not been initialized by this plugin.',
      );
    }
    return data;
  }

  private _destroyAttachments(data: Box3DBodyPluginData): void {
    for (const attachment of data.attachments) {
      this._shapeOwners.delete(attachment.native.getUserData());
      if (attachment.native.isValid()) {
        attachment.native.destroy(false);
      }
    }
    data.attachments = [];
  }

  // -------------------------------------------------------------------
  // Shape
  // -------------------------------------------------------------------

  public initShape(
    shape: PhysicsShape,
    type: PhysicsShapeType,
    options: PhysicsShapeParameters,
  ): void {
    if (
      type === PhysicsShapeType.MESH ||
      type === PhysicsShapeType.HEIGHTFIELD ||
      type === PhysicsShapeType.CYLINDER
    ) {
      throw new Error(
        `Box3DPlugin: shape type ${PhysicsShapeType[type]} is not supported by box3d-wasm.`,
      );
    }
    shape._pluginData = new Box3DShapeDescriptor(type, options);
  }

  public setShapeFilterMembershipMask(
    shape: PhysicsShape,
    membershipMask: number,
  ): void {
    this._getShapeData(shape).filterMembershipMask = membershipMask;
    this._refreshShapeFilters(shape);
  }

  public getShapeFilterMembershipMask(shape: PhysicsShape): number {
    return this._getShapeData(shape).filterMembershipMask;
  }

  public setShapeFilterCollideMask(
    shape: PhysicsShape,
    collideMask: number,
  ): void {
    this._getShapeData(shape).filterCollideMask = collideMask;
    this._refreshShapeFilters(shape);
  }

  public getShapeFilterCollideMask(shape: PhysicsShape): number {
    return this._getShapeData(shape).filterCollideMask;
  }

  public setMaterial(shape: PhysicsShape, material: PhysicsMaterial): void {
    const data = this._getShapeData(shape);
    data.material = material;
    for (const native of this._nativeShapesOf(shape)) {
      native.setFriction(material.friction ?? 0.5);
      native.setRestitution(material.restitution ?? 0);
    }
  }

  public getMaterial(shape: PhysicsShape): PhysicsMaterial {
    return this._getShapeData(shape).material;
  }

  public setDensity(shape: PhysicsShape, density: number): void {
    const data = this._getShapeData(shape);
    data.density = density;
    for (const native of this._nativeShapesOf(shape)) {
      native.setDensity(density, true);
    }
  }

  public getDensity(shape: PhysicsShape): number {
    return this._getShapeData(shape).density;
  }

  public addChild(
    shape: PhysicsShape,
    newChild: PhysicsShape,
    translation?: Vector3,
    rotation?: Quaternion,
    scale?: Vector3,
  ): void {
    const data = this._getShapeData(shape);
    data.children.push({
      shape: newChild,
      translation: translation?.clone() ?? Vector3.Zero(),
      rotation: rotation?.clone() ?? Quaternion.Identity(),
      scale: scale?.clone() ?? Vector3.One(),
    });
    this._reattachOwners(shape);
  }

  public removeChild(shape: PhysicsShape, childIndex: number): void {
    this._getShapeData(shape).children.splice(childIndex, 1);
    this._reattachOwners(shape);
  }

  public getNumChildren(shape: PhysicsShape): number {
    return this._getShapeData(shape).children.length;
  }

  public getBoundingBox(shape: PhysicsShape): BoundingBoxType {
    const { min, max } = computeLocalBounds(this._getShapeData(shape));
    return new BoundingBox(min, max);
  }

  public getBodyBoundingBox(body: PhysicsBody): BoundingBoxType {
    const aabb = this._getPluginData(body).native.computeAABB();
    return new BoundingBox(
      fromB3Vec(aabb.lowerBound),
      fromB3Vec(aabb.upperBound),
    );
  }

  public disposeShape(shape: PhysicsShape): void {
    for (const [owner] of this._ownersOfShape(shape)) {
      const attachmentIndex = owner.attachments.findIndex(
        (a) => a.shape === shape,
      );
      if (attachmentIndex < 0) {
        continue;
      }
      const attachment = owner.attachments.splice(attachmentIndex, 1)[0];
      if (!attachment) {
        continue;
      }
      this._shapeOwners.delete(attachment.native.getUserData());
      if (attachment.native.isValid()) {
        attachment.native.destroy(true);
      }
    }
    shape._pluginData = null;
  }

  public setTrigger(shape: PhysicsShape, isTrigger: boolean): void {
    const data = this._getShapeData(shape);
    data.isTrigger = isTrigger;
    // box3d has no "convert an existing shape to a sensor" setter, so re-create it.
    this._reattachOwners(shape);
  }

  private _getShapeData(shape: PhysicsShape): Box3DShapeDescriptor {
    const data = shape._pluginData as Nullable<Box3DShapeDescriptor>;
    if (!data) {
      throw new Error(
        'Box3DPlugin: PhysicsShape has not been initialized by this plugin.',
      );
    }
    return data;
  }

  private _nativeShapesOf(shape: PhysicsShape): Box3DShape[] {
    const result: Box3DShape[] = [];
    for (const data of this._bodies.values()) {
      for (const attachment of data.attachments) {
        if (attachment.shape === shape) {
          result.push(attachment.native);
        }
      }
    }
    return result;
  }

  private *_ownersOfShape(
    shape: PhysicsShape,
  ): Generator<[Box3DBodyPluginData, PhysicsBody]> {
    for (const [body, data] of this._bodies.entries()) {
      if (data.attachments.some((a) => a.shape === shape)) {
        yield [data, body];
      }
    }
  }

  /** Re-creates every body's attachment tree that (transitively) references `shape`, e.g. after `addChild`/`removeChild`/`setTrigger`. */
  private _reattachOwners(shape: PhysicsShape): void {
    for (const [body, data] of this._bodies.entries()) {
      if (data.shape && shapeTreeContains(data.shape, shape)) {
        this._destroyAttachments(data);
        this._attachShape(
          body,
          data,
          data.shape,
          Vector3.Zero(),
          Quaternion.Identity(),
          Vector3.One(),
        );
        data.native.applyMassFromShapes();
      }
    }
  }

  private _refreshShapeFilters(shape: PhysicsShape): void {
    const data = this._getShapeData(shape);
    for (const native of this._nativeShapesOf(shape)) {
      native.setFilter({
        categoryBits: data.filterMembershipMask,
        maskBits: data.filterCollideMask,
      });
    }
  }

  /** Recursively creates native box3d shapes for `shape` (and, for CONTAINER shapes, its children) on `bodyData.native`, composing local transforms along the way. */
  private _attachShape(
    owner: PhysicsBody,
    bodyData: Box3DBodyPluginData,
    shape: PhysicsShape,
    parentT: Vector3,
    parentR: Quaternion,
    parentS: Vector3,
  ): void {
    const data = this._getShapeData(shape);

    if (data.type !== PhysicsShapeType.CONTAINER) {
      const native = createNativeShape(
        bodyData.native,
        data,
        parentT,
        parentR,
        parentS,
      );
      native.setUserData(nextShapeTag());
      native.enableContactEvents(true);
      native.enableHitEvents(true);
      native.enableSensorEvents(true);
      native.setFilter({
        categoryBits: data.filterMembershipMask,
        maskBits: data.filterCollideMask,
      });
      bodyData.attachments.push({ shape, native });
      this._shapeOwners.set(native.getUserData(), { body: owner, shape });
    }

    for (const child of data.children) {
      const t = parentT.add(
        Vector3.TransformCoordinates(
          child.translation.multiply(parentS),
          Matrix_fromQuaternion(parentR),
        ),
      );
      const r = parentR.multiply(child.rotation);
      const s = parentS.multiply(child.scale);
      this._attachShape(owner, bodyData, child.shape, t, r, s);
    }
  }

  // -------------------------------------------------------------------
  // Constraint
  // -------------------------------------------------------------------

  public initConstraint(
    constraint: PhysicsConstraint,
    body: PhysicsBody,
    childBody: PhysicsBody,
  ): void {
    const bodyDataA = this._getPluginData(body);
    const bodyDataB = this._getPluginData(childBody);
    const options = constraint.options;
    const bodyPair: ConstrainedBodyPair = {
      parentBody: body,
      parentBodyIndex: 0,
      childBody,
      childBodyIndex: 0,
    };

    const buildJoint = createJointFactory(
      this.world,
      bodyDataA.native,
      bodyDataB.native,
      constraint.type,
      options,
    );
    const pluginData = new Box3DConstraintPluginData(
      constraint.type,
      bodyPair,
      buildJoint,
    );
    pluginData.collideConnected = options.collision ?? false;
    constraint._pluginData = pluginData;
    pluginData.rebuild();
  }

  public setEnabled(constraint: PhysicsConstraint, isEnabled: boolean): void {
    const data = this._getConstraintData(constraint);
    data.enabled = isEnabled;
    data.rebuild();
  }

  public getEnabled(constraint: PhysicsConstraint): boolean {
    return this._getConstraintData(constraint).enabled;
  }

  public setCollisionsEnabled(
    constraint: PhysicsConstraint,
    isEnabled: boolean,
  ): void {
    const data = this._getConstraintData(constraint);
    data.collideConnected = isEnabled;
    data.native?.setCollideConnected(isEnabled);
  }

  public getCollisionsEnabled(constraint: PhysicsConstraint): boolean {
    return this._getConstraintData(constraint).collideConnected;
  }

  public setAxisFriction(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    friction: number,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisFriction.set(axis, friction);
    data.rebuild();
  }

  public getAxisFriction(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<number> {
    return this._getConstraintData(constraint).axisFriction.get(axis) ?? null;
  }

  public setAxisMode(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    limitMode: PhysicsConstraintAxisLimitMode,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisLimitMode.set(axis, limitMode);
    data.rebuild();
  }

  public getAxisMode(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<PhysicsConstraintAxisLimitMode> {
    return this._getConstraintData(constraint).axisLimitMode.get(axis) ?? null;
  }

  public setAxisMinLimit(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    minLimit: number,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisMinLimit.set(axis, minLimit);
    data.rebuild();
  }

  public getAxisMinLimit(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<number> {
    return this._getConstraintData(constraint).axisMinLimit.get(axis) ?? null;
  }

  public setAxisMaxLimit(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    limit: number,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisMaxLimit.set(axis, limit);
    data.rebuild();
  }

  public getAxisMaxLimit(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<number> {
    return this._getConstraintData(constraint).axisMaxLimit.get(axis) ?? null;
  }

  public setAxisMotorType(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    motorType: PhysicsConstraintMotorType,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisMotorType.set(axis, motorType);
    data.rebuild();
  }

  public getAxisMotorType(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<PhysicsConstraintMotorType> {
    return this._getConstraintData(constraint).axisMotorType.get(axis) ?? null;
  }

  public setAxisMotorTarget(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    target: number,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisMotorTarget.set(axis, target);
    data.rebuild();
  }

  public getAxisMotorTarget(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<number> {
    return (
      this._getConstraintData(constraint).axisMotorTarget.get(axis) ?? null
    );
  }

  public setAxisMotorMaxForce(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
    maxForce: number,
  ): void {
    const data = this._getConstraintData(constraint);
    data.axisMotorMaxForce.set(axis, maxForce);
    data.rebuild();
  }

  public getAxisMotorMaxForce(
    constraint: PhysicsConstraint,
    axis: PhysicsConstraintAxis,
  ): Nullable<number> {
    return (
      this._getConstraintData(constraint).axisMotorMaxForce.get(axis) ?? null
    );
  }

  public disposeConstraint(constraint: PhysicsConstraint): void {
    const data = this._getConstraintData(constraint);
    if (data.native?.isValid()) {
      data.native.destroy(true);
    }
    constraint._pluginData = null;
  }

  public getBodiesUsingConstraint(
    constraint: PhysicsConstraint,
  ): ConstrainedBodyPair[] {
    return [this._getConstraintData(constraint).bodyPair];
  }

  private _getConstraintData(
    constraint: PhysicsConstraint,
  ): Box3DConstraintPluginData {
    const data = constraint._pluginData as Nullable<Box3DConstraintPluginData>;
    if (!data) {
      throw new Error(
        'Box3DPlugin: PhysicsConstraint has not been initialized by this plugin.',
      );
    }
    return data;
  }

  // -------------------------------------------------------------------
  // Raycast
  // -------------------------------------------------------------------

  public raycast(
    from: Vector3,
    to: Vector3,
    result: PhysicsRaycastResult | Array<PhysicsRaycastResult>,
    query?: IRaycastQuery,
  ): void {
    const target = Array.isArray(result) ? result[0] : result;
    if (!target) {
      return;
    }
    target.reset(from, to);

    const translation = to.subtract(from);
    const hit = this.world.castRayClosest(toB3Vec(from), toB3Vec(translation), {
      categoryBits: query?.membership,
      maskBits: query?.collideWith,
    });
    if (!hit.hit || hit.shapeUserData === undefined) {
      return;
    }
    const owner = this._shapeOwners.get(hit.shapeUserData);
    if (query?.ignoreBody && owner?.body === query.ignoreBody) {
      // box3d-wasm's closest-hit query can't exclude a body up front; the best we can
      // do post-hoc is drop the hit entirely rather than report the wrong one.
      return;
    }
    target.body = owner?.body;
    target.shape = owner?.shape;
    if (hit.normal && hit.point) {
      target.setHitData(hit.normal, hit.point);
    }
    if (hit.fraction !== undefined) {
      target.setHitDistance(hit.fraction * translation.length());
    }
  }

  public dispose(): void {
    for (const body of [...this._bodies.keys()]) {
      this.disposeBody(body);
    }
    this._shapeOwners.clear();
    this.onCollisionObservable.clear();
    this.onCollisionEndedObservable.clear();
    this.onTriggerCollisionObservable.clear();
    if (this.world.isValid()) {
      this.world.destroy();
    }
  }

  // -------------------------------------------------------------------
  // Event dispatch
  // -------------------------------------------------------------------

  private _dispatchEvents(): void {
    const contacts = this.world.getContactEvents();
    for (const begin of contacts.begin) {
      this._notifyCollision(
        begin.shapeUserDataA,
        begin.shapeUserDataB,
        PhysicsEventType.COLLISION_STARTED,
        null,
        null,
        0,
      );
    }
    for (const end of contacts.end) {
      if (end.shapeUserDataA === null || end.shapeUserDataB === null) {
        continue;
      }
      this._notifyCollisionEnded(end.shapeUserDataA, end.shapeUserDataB);
    }
    for (const hit of contacts.hit) {
      this._notifyCollision(
        hit.shapeUserDataA,
        hit.shapeUserDataB,
        PhysicsEventType.COLLISION_CONTINUED,
        fromB3Vec(hit.point),
        fromB3Vec(hit.normal),
        hit.approachSpeed,
      );
    }

    const sensors = this.world.getSensorEvents();
    for (const begin of sensors.begin) {
      this._notifyTrigger(
        begin.sensorUserData,
        begin.visitorUserData,
        PhysicsEventType.TRIGGER_ENTERED,
      );
    }
    for (const end of sensors.end) {
      if (end.sensorUserData === null || end.visitorUserData === null) {
        continue;
      }
      this._notifyTrigger(
        end.sensorUserData,
        end.visitorUserData,
        PhysicsEventType.TRIGGER_EXITED,
      );
    }
  }

  private _notifyCollision(
    tagA: number,
    tagB: number,
    type: PhysicsEventType,
    point: Nullable<Vector3>,
    normal: Nullable<Vector3>,
    impulse: number,
  ): void {
    const ownerA = this._shapeOwners.get(tagA);
    const ownerB = this._shapeOwners.get(tagB);
    if (!ownerA || !ownerB) {
      return;
    }
    const dataA = this._bodies.get(ownerA.body);
    const dataB = this._bodies.get(ownerB.body);
    const event: IPhysicsCollisionEvent = {
      collider: ownerA.body,
      collidedAgainst: ownerB.body,
      colliderIndex: 0,
      collidedAgainstIndex: 0,
      type,
      point,
      normal,
      distance: 0,
      impulse,
    };
    if (dataA?.collisionCBEnabled) {
      dataA.onCollisionObservable.notifyObservers(event);
    }
    if (dataB?.collisionCBEnabled) {
      dataB.onCollisionObservable.notifyObservers({
        ...event,
        collider: ownerB.body,
        collidedAgainst: ownerA.body,
      });
    }
    this.onCollisionObservable.notifyObservers(event);
  }

  private _notifyCollisionEnded(tagA: number, tagB: number): void {
    const ownerA = this._shapeOwners.get(tagA);
    const ownerB = this._shapeOwners.get(tagB);
    if (!ownerA || !ownerB) {
      return;
    }
    const dataA = this._bodies.get(ownerA.body);
    const dataB = this._bodies.get(ownerB.body);
    const event: IBasePhysicsCollisionEvent = {
      collider: ownerA.body,
      collidedAgainst: ownerB.body,
      colliderIndex: 0,
      collidedAgainstIndex: 0,
      type: PhysicsEventType.COLLISION_FINISHED,
    };
    if (dataA?.collisionEndedCBEnabled) {
      dataA.onCollisionEndedObservable.notifyObservers(event);
    }
    if (dataB?.collisionEndedCBEnabled) {
      dataB.onCollisionEndedObservable.notifyObservers({
        ...event,
        collider: ownerB.body,
        collidedAgainst: ownerA.body,
      });
    }
    this.onCollisionEndedObservable.notifyObservers(event);
  }

  private _notifyTrigger(
    sensorTag: number,
    visitorTag: number,
    type: PhysicsEventType,
  ): void {
    const sensorOwner = this._shapeOwners.get(sensorTag);
    const visitorOwner = this._shapeOwners.get(visitorTag);
    if (!sensorOwner || !visitorOwner) {
      return;
    }
    this.onTriggerCollisionObservable.notifyObservers({
      collider: sensorOwner.body,
      collidedAgainst: visitorOwner.body,
      colliderIndex: 0,
      collidedAgainstIndex: 0,
      type,
    });
  }
}

function toBox3DBodyType(
  motionType: PhysicsMotionType,
): 'static' | 'kinematic' | 'dynamic' {
  switch (motionType) {
    case PhysicsMotionType.DYNAMIC:
      return 'dynamic';
    case PhysicsMotionType.ANIMATED:
      // box3d has no equivalent of Havok's "animated" (kinematic that still receives forces
      // applied to it, but ignores incoming ones); kinematic is the closest match.
      return 'kinematic';
    case PhysicsMotionType.STATIC:
    default:
      return 'static';
  }
}

let _nextShapeTag = 1;
function nextShapeTag(): number {
  return _nextShapeTag++;
}

function Matrix_fromQuaternion(q: Quaternion): Matrix {
  return q.toRotationMatrix(new Matrix());
}

function shapeTreeContains(root: PhysicsShape, target: PhysicsShape): boolean {
  if (root === target) {
    return true;
  }
  const data = root._pluginData as Nullable<Box3DShapeDescriptor>;
  if (!data) {
    return false;
  }
  return data.children.some((child: ShapeChild) =>
    shapeTreeContains(child.shape, target),
  );
}

function computeLocalBounds(descriptor: Box3DShapeDescriptor): {
  min: Vector3;
  max: Vector3;
} {
  const p = descriptor.parameters;
  switch (descriptor.type) {
    case PhysicsShapeType.BOX: {
      const extents = p.extents ?? new Vector3(1, 1, 1);
      const center = p.center ?? Vector3.Zero();
      const half = extents.scale(0.5);
      return { min: center.subtract(half), max: center.add(half) };
    }
    case PhysicsShapeType.SPHERE: {
      const radius = p.radius ?? 0.5;
      const center = p.center ?? Vector3.Zero();
      const r = new Vector3(radius, radius, radius);
      return { min: center.subtract(r), max: center.add(r) };
    }
    case PhysicsShapeType.CAPSULE: {
      const radius = p.radius ?? 0.5;
      const a = p.pointA ?? new Vector3(0, -0.5, 0);
      const b = p.pointB ?? new Vector3(0, 0.5, 0);
      const min = Vector3.Minimize(a, b).subtractFromFloats(
        radius,
        radius,
        radius,
      );
      const max = Vector3.Maximize(a, b).addInPlaceFromFloats(
        radius,
        radius,
        radius,
      );
      return { min, max };
    }
    case PhysicsShapeType.CONVEX_HULL: {
      const points = extractHullPoints(p);
      let min = points[0]?.clone() ?? Vector3.Zero();
      let max = points[0]?.clone() ?? Vector3.Zero();
      for (const point of points) {
        min = Vector3.Minimize(min, point);
        max = Vector3.Maximize(max, point);
      }
      return { min, max };
    }
    case PhysicsShapeType.CONTAINER: {
      let min = new Vector3(Infinity, Infinity, Infinity);
      let max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const child of descriptor.children) {
        const childData = child.shape
          ._pluginData as Nullable<Box3DShapeDescriptor>;
        if (!childData) {
          continue;
        }
        const childBounds = computeLocalBounds(childData);
        const worldMin = Vector3.TransformCoordinates(
          childBounds.min.multiply(child.scale),
          Matrix_fromQuaternion(child.rotation),
        ).add(child.translation);
        const worldMax = Vector3.TransformCoordinates(
          childBounds.max.multiply(child.scale),
          Matrix_fromQuaternion(child.rotation),
        ).add(child.translation);
        min = Vector3.Minimize(min, Vector3.Minimize(worldMin, worldMax));
        max = Vector3.Maximize(max, Vector3.Maximize(worldMin, worldMax));
      }
      return { min, max };
    }
    default:
      return { min: Vector3.Zero(), max: Vector3.Zero() };
  }
}

function extractHullPoints(parameters: PhysicsShapeParameters): Vector3[] {
  if (!parameters.mesh) {
    return [];
  }
  const positions = parameters.mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) {
    return [];
  }
  const points: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    points.push(
      new Vector3(
        positions[i] ?? 0,
        positions[i + 1] ?? 0,
        positions[i + 2] ?? 0,
      ),
    );
  }
  return points;
}

/** Creates the native box3d shape for one descriptor, at the given (already-composed) local transform relative to the owning body. */
function createNativeShape(
  nativeBody: Box3DBody,
  descriptor: Box3DShapeDescriptor,
  t: Vector3,
  r: Quaternion,
  s: Vector3,
): Box3DShape {
  const p = descriptor.parameters;
  const shared = {
    density: descriptor.density,
    friction: descriptor.material.friction ?? 0.5,
    restitution: descriptor.material.restitution ?? 0,
    isSensor: descriptor.isTrigger,
    filter: {
      categoryBits: descriptor.filterMembershipMask,
      maskBits: descriptor.filterCollideMask,
    },
  };

  if (Math.abs(s.x - s.y) > 1e-4 || Math.abs(s.y - s.z) > 1e-4) {
    // eslint-disable-next-line no-console
    console.warn(
      'Box3DPlugin: non-uniform shape scaling is not supported; using the average scale factor.',
    );
  }
  const uniformScale = (s.x + s.y + s.z) / 3;

  switch (descriptor.type) {
    case PhysicsShapeType.BOX: {
      const extents = (p.extents ?? new Vector3(1, 1, 1)).scale(uniformScale);
      const center = (p.center ?? Vector3.Zero()).multiply(s);
      const localT = t.add(
        Vector3.TransformCoordinates(center, Matrix_fromQuaternion(r)),
      );
      const localR = r.multiply(p.rotation ?? Quaternion.Identity());
      return nativeBody.createBox({
        ...shared,
        halfExtents: toB3Vec(extents.scale(0.5)),
        offset: toB3Vec(localT),
        rotation: toB3Quat(localR),
      });
    }
    case PhysicsShapeType.SPHERE: {
      const center = (p.center ?? Vector3.Zero()).multiply(s);
      const localT = t.add(
        Vector3.TransformCoordinates(center, Matrix_fromQuaternion(r)),
      );
      return nativeBody.createSphere({
        ...shared,
        radius: (p.radius ?? 0.5) * uniformScale,
        center: toB3Vec(localT),
      });
    }
    case PhysicsShapeType.CAPSULE: {
      const a = (p.pointA ?? new Vector3(0, -0.5, 0)).multiply(s);
      const b = (p.pointB ?? new Vector3(0, 0.5, 0)).multiply(s);
      const worldA = t.add(
        Vector3.TransformCoordinates(a, Matrix_fromQuaternion(r)),
      );
      const worldB = t.add(
        Vector3.TransformCoordinates(b, Matrix_fromQuaternion(r)),
      );
      return nativeBody.createCapsule({
        ...shared,
        radius: (p.radius ?? 0.5) * uniformScale,
        center1: toB3Vec(worldA),
        center2: toB3Vec(worldB),
      });
    }
    case PhysicsShapeType.CONVEX_HULL: {
      const localPoints = extractHullPoints(p);
      const worldPoints = localPoints.map((point) =>
        t.add(
          Vector3.TransformCoordinates(
            point.multiply(s),
            Matrix_fromQuaternion(r),
          ),
        ),
      );
      return nativeBody.createHull({
        ...shared,
        points: worldPoints.map(toB3Vec),
      });
    }
    default:
      throw new Error(
        `Box3DPlugin: shape type ${PhysicsShapeType[descriptor.type]} is not supported by box3d-wasm.`,
      );
  }
}

/**
 * Builds the closure that (re)creates the native box3d joint for a constraint from its cached
 * axis maps. Called on every axis setter and on enable/disable, since box3d's bound joints only
 * take limit/motor parameters at construction time.
 */
function createJointFactory(
  world: Box3DWorld,
  bodyA: Box3DBody,
  bodyB: Box3DBody,
  type: PhysicsConstraintType,
  options: PhysicsConstraintParameters,
): JointFactory {
  const anchorA = options.pivotA ? toB3Vec(options.pivotA) : undefined;
  const anchorB = options.pivotB ? toB3Vec(options.pivotB) : undefined;

  return (data: Box3DConstraintPluginData) => {
    const base = { anchorA, anchorB, collideConnected: data.collideConnected };

    switch (type) {
      case PhysicsConstraintType.BALL_AND_SOCKET: {
        const twist = readLimit(data, PhysicsConstraintAxis.ANGULAR_X);
        const motorSpeed = data.axisMotorTarget.get(
          PhysicsConstraintAxis.ANGULAR_X,
        );
        return world.createSphericalJoint(bodyA, bodyB, {
          ...base,
          enableTwistLimit: twist !== null,
          lowerTwistAngle: twist?.min,
          upperTwistAngle: twist?.max,
          enableMotor: motorSpeed !== undefined,
          motorVelocity:
            motorSpeed !== undefined
              ? { x: motorSpeed, y: 0, z: 0 }
              : undefined,
          maxMotorTorque: data.axisMotorMaxForce.get(
            PhysicsConstraintAxis.ANGULAR_X,
          ),
        });
      }
      case PhysicsConstraintType.DISTANCE: {
        const limit = readLimit(data, PhysicsConstraintAxis.LINEAR_DISTANCE);
        const maxDistance = options.maxDistance ?? limit?.max ?? 0;
        return world.createDistanceJoint(bodyA, bodyB, {
          ...base,
          length: maxDistance,
          enableLimit: true,
          minLength: limit?.min ?? 0,
          maxLength: maxDistance,
          enableMotor:
            data.axisMotorType.get(PhysicsConstraintAxis.LINEAR_DISTANCE) !==
            undefined,
          motorSpeed: data.axisMotorTarget.get(
            PhysicsConstraintAxis.LINEAR_DISTANCE,
          ),
          maxMotorForce: data.axisMotorMaxForce.get(
            PhysicsConstraintAxis.LINEAR_DISTANCE,
          ),
        });
      }
      case PhysicsConstraintType.HINGE: {
        const localFrameA = {
          rotation: toB3Quat(
            quaternionFromXAxis(options.axisA ?? Vector3.Right()),
          ),
        };
        const localFrameB = {
          rotation: toB3Quat(
            quaternionFromXAxis(options.axisB ?? Vector3.Right()),
          ),
        };
        const limit = readLimit(data, PhysicsConstraintAxis.ANGULAR_X);
        const motorType = data.axisMotorType.get(
          PhysicsConstraintAxis.ANGULAR_X,
        );
        const friction = data.axisFriction.get(PhysicsConstraintAxis.ANGULAR_X);
        const useFrictionAsMotor = !motorType && friction !== undefined;
        return world.createRevoluteJoint(bodyA, bodyB, {
          ...base,
          localFrameA,
          localFrameB,
          enableLimit: limit !== null,
          lowerAngle: limit?.min,
          upperAngle: limit?.max,
          enableMotor: motorType !== undefined || useFrictionAsMotor,
          motorSpeed: useFrictionAsMotor
            ? 0
            : data.axisMotorTarget.get(PhysicsConstraintAxis.ANGULAR_X),
          maxMotorTorque: useFrictionAsMotor
            ? friction
            : data.axisMotorMaxForce.get(PhysicsConstraintAxis.ANGULAR_X),
        });
      }
      case PhysicsConstraintType.SLIDER:
      case PhysicsConstraintType.PRISMATIC: {
        const localFrameA = {
          rotation: toB3Quat(
            quaternionFromXAxis(options.axisA ?? Vector3.Right()),
          ),
        };
        const localFrameB = {
          rotation: toB3Quat(
            quaternionFromXAxis(options.axisB ?? Vector3.Right()),
          ),
        };
        const limit = readLimit(data, PhysicsConstraintAxis.LINEAR_X);
        return world.createPrismaticJoint(bodyA, bodyB, {
          ...base,
          localFrameA,
          localFrameB,
          enableLimit: limit !== null,
          lowerTranslation: limit?.min,
          upperTranslation: limit?.max,
          enableMotor:
            data.axisMotorType.get(PhysicsConstraintAxis.LINEAR_X) !==
            undefined,
          motorSpeed: data.axisMotorTarget.get(PhysicsConstraintAxis.LINEAR_X),
          maxMotorForce: data.axisMotorMaxForce.get(
            PhysicsConstraintAxis.LINEAR_X,
          ),
        });
      }
      case PhysicsConstraintType.LOCK:
      case PhysicsConstraintType.SIX_DOF: {
        if (type === PhysicsConstraintType.SIX_DOF) {
          // eslint-disable-next-line no-console
          console.warn(
            'Box3DPlugin: SIX_DOF constraints are approximated with a weld joint; per-axis limits/motors are tracked but not enforced.',
          );
        }
        return world.createWeldJoint(bodyA, bodyB, base);
      }
      default:
        throw new Error(
          `Box3DPlugin: constraint type ${PhysicsConstraintType[type]} is not supported.`,
        );
    }
  };
}

function readLimit(
  data: Box3DConstraintPluginData,
  axis: PhysicsConstraintAxis,
): Nullable<{ min?: number; max?: number }> {
  const mode = data.axisLimitMode.get(axis);
  if (mode === undefined || mode === PhysicsConstraintAxisLimitMode.FREE) {
    return null;
  }
  if (mode === PhysicsConstraintAxisLimitMode.LOCKED) {
    return { min: 0, max: 0 };
  }
  return { min: data.axisMinLimit.get(axis), max: data.axisMaxLimit.get(axis) };
}
