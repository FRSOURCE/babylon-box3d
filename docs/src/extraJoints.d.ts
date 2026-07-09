/**
 * Joint types box3d-wasm's compiled binary exposes (wheel joint: car
 * suspension + steering + drive in a single joint; filter joint: pure
 * collision-filtering between two bodies; parallel joint: constrains a body's
 * rotation to match another's, e.g. for parallel linkages) that aren't used
 * by `Box3DPlugin` -- Babylon's V2 physics API has no equivalent constraint
 * type to wrap any of them in, so they're absent from `box3d-wasm.d.ts`.
 * Consumers that want them access box3d directly through
 * `Box3DPlugin.world` (bypassing the `IPhysicsEnginePluginV2` abstraction)
 * and this augments the base declaration with the missing surface.
 * Verified present by instantiating the compiled `box3d-wasm@0.2.0` binary
 * and inspecting the live prototypes (`Object.getOwnPropertyNames`) --
 * upstream ships no types at all, so nothing here is derived from a
 * declaration file that could be stale.
 */
declare module 'box3d-wasm' {
  export interface WheelJointOptions extends JointBaseOptions {
    enableSuspensionSpring?: boolean;
    suspensionHertz?: number;
    suspensionDampingRatio?: number;
    enableSuspensionLimit?: boolean;
    lowerSuspensionLimit?: number;
    upperSuspensionLimit?: number;
    enableSpinMotor?: boolean;
    maxSpinTorque?: number;
    spinMotorSpeed?: number;
    enableSteering?: boolean;
    steeringHertz?: number;
    steeringDampingRatio?: number;
    maxSteeringTorque?: number;
    enableSteeringLimit?: boolean;
    lowerSteeringLimit?: number;
    upperSteeringLimit?: number;
    targetSteeringAngle?: number;
  }

  export class WheelJoint extends Joint {
    getSpinSpeed(): number;
    enableSpinMotor(flag: boolean): void;
    setSpinMotorSpeed(speed: number): void;
    setMaxSpinTorque(torque: number): void;
    getSteeringAngle(): number;
    enableSteering(flag: boolean): void;
    setTargetSteeringAngle(angle: number): void;
    enableSteeringLimit(flag: boolean): void;
    setSteeringLimits(lower: number, upper: number): void;
    setMaxSteeringTorque(torque: number): void;
    setSteeringHertz(hertz: number): void;
    setSteeringDampingRatio(ratio: number): void;
    enableSuspension(flag: boolean): void;
    enableSuspensionLimit(flag: boolean): void;
    setSuspensionLimits(lower: number, upper: number): void;
    setSuspensionHertz(hertz: number): void;
    setSuspensionDampingRatio(ratio: number): void;
  }

  export type FilterJointOptions = JointBaseOptions;

  export class FilterJoint extends Joint {}

  export interface ParallelJointOptions extends JointBaseOptions {
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    maxTorque?: number;
  }

  export class ParallelJoint extends Joint {
    setMaxTorque(torque: number): void;
    setSpringHertz(hertz: number): void;
    setSpringDampingRatio(ratio: number): void;
  }

  export interface World {
    createWheelJoint(
      bodyA: Body,
      bodyB: Body,
      options?: WheelJointOptions,
    ): WheelJoint;
    createFilterJoint(
      bodyA: Body,
      bodyB: Body,
      options?: FilterJointOptions,
    ): FilterJoint;
    createParallelJoint(
      bodyA: Body,
      bodyB: Body,
      options?: ParallelJointOptions,
    ): ParallelJoint;
  }
}
