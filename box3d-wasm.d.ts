/**
 * box3d-wasm ships no bundled TypeScript types (see
 * https://github.com/monteslu/box3d-wasm). This is a hand-written surface
 * covering exactly the embind API consumed by {@link Box3DPlugin}, derived
 * from the wrapper's glue code (csrc/glue.cpp) and README.
 */
declare module 'box3d-wasm' {
  export interface Vec3 {
    x: number;
    y: number;
    z: number;
  }

  export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
  }

  export interface Box3DTransform {
    position?: Vec3;
    rotation?: Quat;
  }

  export interface Filter {
    categoryBits?: number;
    maskBits?: number;
    groupIndex?: number;
  }

  export interface ShapeMaterialOptions {
    density?: number;
    friction?: number;
    restitution?: number;
    rollingResistance?: number;
    tangentVelocity?: Vec3;
    userMaterialId?: number;
    isSensor?: boolean;
    enableSensorEvents?: boolean;
    enableContactEvents?: boolean;
    enableHitEvents?: boolean;
    invokeContactCreation?: boolean;
    updateBodyMass?: boolean;
    filter?: Filter;
    userData?: number;
  }

  export interface BoxShapeOptions extends ShapeMaterialOptions {
    halfExtents?: Vec3;
    hx?: number;
    hy?: number;
    hz?: number;
    offset?: Vec3;
    rotation?: Quat;
  }

  export interface SphereShapeOptions extends ShapeMaterialOptions {
    center?: Vec3;
    radius?: number;
  }

  export interface CapsuleShapeOptions extends ShapeMaterialOptions {
    radius?: number;
    height?: number;
    center1?: Vec3;
    center2?: Vec3;
  }

  export interface HullShapeOptions extends ShapeMaterialOptions {
    points: Vec3[];
    maxVertices?: number;
  }

  export interface AABB {
    lowerBound: Vec3;
    upperBound: Vec3;
  }

  export interface ShapeRayCastResult {
    hit: boolean;
    point?: Vec3;
    normal?: Vec3;
    fraction?: number;
  }

  export type Box3DShapeType =
    | 'sphere'
    | 'capsule'
    | 'hull'
    | 'mesh'
    | 'heightField'
    | 'compound'
    | 'unknown';

  export class Shape {
    isValid(): boolean;
    destroy(updateBodyMass: boolean): void;
    getType(): Box3DShapeType;
    getUserData(): number;
    setUserData(tag: number): void;
    getFriction(): number;
    setFriction(friction: number): void;
    getRestitution(): number;
    setRestitution(restitution: number): void;
    getDensity(): number;
    setDensity(density: number, updateBodyMass: boolean): void;
    isSensor(): boolean;
    enableSensorEvents(flag: boolean): void;
    enableContactEvents(flag: boolean): void;
    enableHitEvents(flag: boolean): void;
    getFilter(): Required<Filter>;
    setFilter(filter: Filter): void;
    getAABB(): AABB;
    rayCast(origin: Vec3, translation: Vec3): ShapeRayCastResult;
  }

  export interface JointBaseOptions {
    localFrameA?: Box3DTransform;
    localFrameB?: Box3DTransform;
    anchorA?: Vec3;
    anchorB?: Vec3;
    collideConnected?: boolean;
    forceThreshold?: number;
    torqueThreshold?: number;
  }

  export class Joint {
    isValid(): boolean;
    destroy(wakeAttached: boolean): void;
    getType(): string;
    wakeBodies(): void;
    getCollideConnected(): boolean;
    setCollideConnected(flag: boolean): void;
    getLocalFrameA(): Required<Box3DTransform>;
    getLocalFrameB(): Required<Box3DTransform>;
    getConstraintForce(): Vec3;
    getConstraintTorque(): Vec3;
  }

  export interface DistanceJointOptions extends JointBaseOptions {
    length?: number;
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    lowerSpringForce?: number;
    upperSpringForce?: number;
    enableLimit?: boolean;
    minLength?: number;
    maxLength?: number;
    enableMotor?: boolean;
    maxMotorForce?: number;
    motorSpeed?: number;
  }

  export class DistanceJoint extends Joint {
    setLength(length: number): void;
    getLength(): number;
    getCurrentLength(): number;
    enableSpring(flag: boolean): void;
    setSpringHertz(hertz: number): void;
    setSpringDampingRatio(ratio: number): void;
    enableLimit(flag: boolean): void;
    setLengthRange(min: number, max: number): void;
    enableMotor(flag: boolean): void;
    setMotorSpeed(speed: number): void;
    setMaxMotorForce(force: number): void;
  }

  export interface RevoluteJointOptions extends JointBaseOptions {
    targetAngle?: number;
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    enableLimit?: boolean;
    lowerAngle?: number;
    upperAngle?: number;
    enableMotor?: boolean;
    maxMotorTorque?: number;
    motorSpeed?: number;
  }

  export class RevoluteJoint extends Joint {
    getAngle(): number;
    enableSpring(flag: boolean): void;
    setSpringHertz(hertz: number): void;
    setSpringDampingRatio(ratio: number): void;
    setTargetAngle(angle: number): void;
    enableLimit(flag: boolean): void;
    setLimits(lower: number, upper: number): void;
    enableMotor(flag: boolean): void;
    setMotorSpeed(speed: number): void;
    setMaxMotorTorque(torque: number): void;
    getMotorTorque(): number;
  }

  export interface SphericalJointOptions extends JointBaseOptions {
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    targetRotation?: Quat;
    enableConeLimit?: boolean;
    coneAngle?: number;
    enableTwistLimit?: boolean;
    lowerTwistAngle?: number;
    upperTwistAngle?: number;
    enableMotor?: boolean;
    maxMotorTorque?: number;
    motorVelocity?: Vec3;
  }

  export class SphericalJoint extends Joint {
    enableConeLimit(flag: boolean): void;
    setConeLimit(angle: number): void;
    getConeAngle(): number;
    enableTwistLimit(flag: boolean): void;
    setTwistLimits(lower: number, upper: number): void;
    getTwistAngle(): number;
    enableSpring(flag: boolean): void;
    setSpringHertz(hertz: number): void;
    setSpringDampingRatio(ratio: number): void;
    setTargetRotation(rotation: Quat): void;
    enableMotor(flag: boolean): void;
    setMotorVelocity(velocity: Vec3): void;
    setMaxMotorTorque(torque: number): void;
  }

  export interface PrismaticJointOptions extends JointBaseOptions {
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    targetTranslation?: number;
    enableLimit?: boolean;
    lowerTranslation?: number;
    upperTranslation?: number;
    enableMotor?: boolean;
    maxMotorForce?: number;
    motorSpeed?: number;
  }

  export class PrismaticJoint extends Joint {
    getTranslation(): number;
    getSpeed(): number;
    enableSpring(flag: boolean): void;
    setSpringHertz(hertz: number): void;
    setSpringDampingRatio(ratio: number): void;
    setTargetTranslation(translation: number): void;
    enableLimit(flag: boolean): void;
    setLimits(lower: number, upper: number): void;
    enableMotor(flag: boolean): void;
    setMotorSpeed(speed: number): void;
    setMaxMotorForce(force: number): void;
  }

  export interface WeldJointOptions extends JointBaseOptions {
    linearHertz?: number;
    angularHertz?: number;
    linearDampingRatio?: number;
    angularDampingRatio?: number;
  }

  export class WeldJoint extends Joint {
    setLinearHertz(hertz: number): void;
    setLinearDampingRatio(ratio: number): void;
    setAngularHertz(hertz: number): void;
    setAngularDampingRatio(ratio: number): void;
  }

  export interface MotorJointOptions extends JointBaseOptions {
    linearVelocity?: Vec3;
    maxVelocityForce?: number;
    angularVelocity?: Vec3;
    maxVelocityTorque?: number;
    linearHertz?: number;
    linearDampingRatio?: number;
    maxSpringForce?: number;
    angularHertz?: number;
    angularDampingRatio?: number;
    maxSpringTorque?: number;
  }

  export class MotorJoint extends Joint {
    setLinearVelocity(velocity: Vec3): void;
    setAngularVelocity(velocity: Vec3): void;
    setMaxVelocityForce(force: number): void;
    setMaxVelocityTorque(torque: number): void;
    setLinearHertz(hertz: number): void;
    setLinearDampingRatio(ratio: number): void;
    setAngularHertz(hertz: number): void;
    setAngularDampingRatio(ratio: number): void;
    setMaxSpringForce(force: number): void;
    setMaxSpringTorque(torque: number): void;
  }

  export interface MotionLocks {
    linearX?: boolean;
    linearY?: boolean;
    linearZ?: boolean;
    angularX?: boolean;
    angularY?: boolean;
    angularZ?: boolean;
  }

  export type Box3DBodyType = 'static' | 'kinematic' | 'dynamic';

  export interface BodyOptions {
    type?: Box3DBodyType;
    position?: Vec3;
    rotation?: Quat;
    linearVelocity?: Vec3;
    angularVelocity?: Vec3;
    linearDamping?: number;
    angularDamping?: number;
    gravityScale?: number;
    sleepThreshold?: number;
    enableSleep?: boolean;
    isAwake?: boolean;
    isBullet?: boolean;
    isEnabled?: boolean;
    allowFastRotation?: boolean;
    enableContactRecycling?: boolean;
    motionLocks?: MotionLocks;
    userData?: number;
    name?: string;
  }

  export class Body {
    isValid(): boolean;
    destroy(): void;
    getType(): Box3DBodyType;
    setType(type: Box3DBodyType): void;
    getName(): string;
    setName(name: string): void;
    getUserData(): number;
    setUserData(tag: number): void;
    getPosition(): Vec3;
    getRotation(): Quat;
    getTransform(): Required<Box3DTransform>;
    setTransform(position: Vec3, rotation: Quat): void;
    setTargetTransform(
      target: Box3DTransform,
      timeStep: number,
      wake: boolean,
    ): void;
    getLinearVelocity(): Vec3;
    setLinearVelocity(velocity: Vec3): void;
    getAngularVelocity(): Vec3;
    setAngularVelocity(velocity: Vec3): void;
    applyForce(force: Vec3, point: Vec3, wake: boolean): void;
    applyForceToCenter(force: Vec3, wake: boolean): void;
    applyTorque(torque: Vec3, wake: boolean): void;
    applyLinearImpulse(impulse: Vec3, point: Vec3, wake: boolean): void;
    applyLinearImpulseToCenter(impulse: Vec3, wake: boolean): void;
    applyAngularImpulse(impulse: Vec3, wake: boolean): void;
    getMass(): number;
    applyMassFromShapes(): void;
    getLocalCenterOfMass(): Vec3;
    getWorldCenterOfMass(): Vec3;
    getLocalPoint(worldPoint: Vec3): Vec3;
    getWorldPoint(localPoint: Vec3): Vec3;
    getLinearDamping(): number;
    setLinearDamping(damping: number): void;
    getAngularDamping(): number;
    setAngularDamping(damping: number): void;
    getGravityScale(): number;
    setGravityScale(scale: number): void;
    isAwake(): boolean;
    setAwake(awake: boolean): void;
    enableSleep(flag: boolean): void;
    isEnabled(): boolean;
    setEnabled(flag: boolean): void;
    isBullet(): boolean;
    setBullet(flag: boolean): void;
    setMotionLocks(locks: MotionLocks): void;
    getMotionLocks(): Required<MotionLocks>;
    getShapeCount(): number;
    computeAABB(): AABB;
    createSphere(options: SphereShapeOptions): Shape;
    createCapsule(options: CapsuleShapeOptions): Shape;
    createBox(options: BoxShapeOptions): Shape;
    createHull(options: HullShapeOptions): Shape;
  }

  export interface WorldOptions {
    gravity?: Vec3;
    restitutionThreshold?: number;
    hitEventThreshold?: number;
    contactHertz?: number;
    contactDampingRatio?: number;
    contactSpeed?: number;
    maximumLinearSpeed?: number;
    enableSleep?: boolean;
    enableContinuous?: boolean;
    /** Only honored by the `deluxe` (threaded) flavour. */
    workerCount?: number;
  }

  export interface RayCastResult {
    hit: boolean;
    point?: Vec3;
    normal?: Vec3;
    fraction?: number;
    shapeUserData?: number;
    bodyUserData?: number;
    shape?: Shape;
  }

  export interface QueryFilter {
    categoryBits?: number;
    maskBits?: number;
  }

  export interface ExplosionOptions {
    position?: Vec3;
    radius?: number;
    falloff?: number;
    impulsePerArea?: number;
    maskBits?: number;
  }

  export interface BodyMoveEvent {
    userData: number;
    position: Vec3;
    rotation: Quat;
    fellAsleep: boolean;
  }

  export interface ContactBeginEvent {
    shapeUserDataA: number;
    shapeUserDataB: number;
  }

  export interface ContactEndEvent {
    shapeUserDataA: number | null;
    shapeUserDataB: number | null;
  }

  export interface ContactHitEvent {
    shapeUserDataA: number;
    shapeUserDataB: number;
    point: Vec3;
    normal: Vec3;
    approachSpeed: number;
  }

  export interface ContactEvents {
    begin: ContactBeginEvent[];
    end: ContactEndEvent[];
    hit: ContactHitEvent[];
  }

  export interface SensorBeginEvent {
    sensorUserData: number;
    visitorUserData: number;
  }

  export interface SensorEndEvent {
    sensorUserData: number | null;
    visitorUserData: number | null;
  }

  export interface SensorEvents {
    begin: SensorBeginEvent[];
    end: SensorEndEvent[];
  }

  export interface Profile {
    step: number;
    pairs: number;
    collide: number;
    solve: number;
  }

  export class World {
    constructor(options?: WorldOptions);
    isValid(): boolean;
    destroy(): void;
    step(timeStep: number, subStepCount: number): void;
    getGravity(): Vec3;
    setGravity(gravity: Vec3): void;
    enableSleeping(flag: boolean): void;
    enableContinuous(flag: boolean): void;
    getAwakeBodyCount(): number;
    getWorkerCount(): number;
    createBody(options?: BodyOptions): Body;
    createDistanceJoint(
      bodyA: Body,
      bodyB: Body,
      options?: DistanceJointOptions,
    ): DistanceJoint;
    createRevoluteJoint(
      bodyA: Body,
      bodyB: Body,
      options?: RevoluteJointOptions,
    ): RevoluteJoint;
    createSphericalJoint(
      bodyA: Body,
      bodyB: Body,
      options?: SphericalJointOptions,
    ): SphericalJoint;
    createPrismaticJoint(
      bodyA: Body,
      bodyB: Body,
      options?: PrismaticJointOptions,
    ): PrismaticJoint;
    createWeldJoint(
      bodyA: Body,
      bodyB: Body,
      options?: WeldJointOptions,
    ): WeldJoint;
    createMotorJoint(
      bodyA: Body,
      bodyB: Body,
      options?: MotorJointOptions,
    ): MotorJoint;
    castRayClosest(
      origin: Vec3,
      translation: Vec3,
      filter?: QueryFilter,
    ): RayCastResult;
    explode(options: ExplosionOptions): void;
    getBodyEvents(): BodyMoveEvent[];
    getContactEvents(): ContactEvents;
    getSensorEvents(): SensorEvents;
    getProfile(): Profile;
  }

  export interface Box3DModule {
    World: typeof World;
    /** Whether this flavour of the module has wasm threads enabled. */
    threaded: boolean;
    /** Upper bound accepted by `WorldOptions.workerCount`. */
    maxWorkers: number;
  }

  export interface Box3DFactoryOptions {
    locateFile?: (path: string, prefix: string) => string;
    [key: string]: unknown;
  }

  export default function Box3D(
    options?: Box3DFactoryOptions,
  ): Promise<Box3DModule>;
}

declare module 'box3d-wasm/standard' {
  export { default } from 'box3d-wasm';
}

declare module 'box3d-wasm/deluxe' {
  export { default } from 'box3d-wasm';
}
