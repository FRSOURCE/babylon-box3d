import {
  BallAndSocketConstraint,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Vector3,
  type PhysicsBody,
} from '@babylonjs/core';
import { scene } from '../core/engine';
import { material, palette, pick, rand } from '../utils';
import { track } from '../world';
import type { SceneDef } from './types';

/**
 * A jointed ragdoll. Every joint is ball-and-socket, including
 * elbows/knees, which the original demo modeled as hinges: this plugin's
 * HingeConstraint hits the same axis-unreliability bug worked around
 * elsewhere in this demo (windmill rotor, seesaw plank, bridge deck), but
 * those workarounds don't transfer here -- limbs must react dynamically
 * to falls/collisions (ruling out scripted-kinematic motion), and a
 * limb's capsule radius (~0.05-0.07) is too thin to give a paired-anchor
 * twist-resistance trick any real lever arm (unlike the bridge's flat,
 * wide deck). Ball-and-socket sacrifices the one-directional elbow/knee
 * bend but is the one joint type that's been reliable throughout this
 * codebase.
 */
function spawnRagdoll(x: number, y: number, z: number): void {
  const skin = material(pick(palette), 0.5);

  function part(
    px: number,
    py: number,
    pz: number,
    radius: number,
    height: number,
    mass: number,
  ): PhysicsBody {
    const mesh = MeshBuilder.CreateCapsule(
      'part',
      { radius, height: height + radius * 2 },
      scene,
    );
    mesh.position.set(x + px, y + py, z + pz);
    mesh.material = skin;
    const agg = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.CAPSULE,
      { mass, friction: 0.5 },
      scene,
    );
    track(mesh);
    return agg.body;
  }

  const pelvis = part(0, 1.0, 0, 0.14, 0.1, 1.2);
  const torso = part(0, 1.35, 0, 0.15, 0.3, 1.0);
  const head = part(0, 1.72, 0, 0.11, 0.05, 0.8);
  const upperLegL = part(-0.1, 0.72, 0, 0.07, 0.32, 1.0);
  const upperLegR = part(0.1, 0.72, 0, 0.07, 0.32, 1.0);
  const lowerLegL = part(-0.1, 0.32, 0, 0.06, 0.3, 1.0);
  const lowerLegR = part(0.1, 0.32, 0, 0.06, 0.3, 1.0);
  const upperArmL = part(-0.26, 1.38, 0, 0.05, 0.24, 0.8);
  const upperArmR = part(0.26, 1.38, 0, 0.05, 0.24, 0.8);
  const lowerArmL = part(-0.26, 1.05, 0, 0.045, 0.24, 0.8);
  const lowerArmR = part(0.26, 1.05, 0, 0.045, 0.24, 0.8);

  const socket = (
    a: PhysicsBody,
    b: PhysicsBody,
    anchorA: Vector3,
    anchorB: Vector3,
  ) => {
    const joint = new BallAndSocketConstraint(
      anchorA,
      anchorB,
      Vector3.Up(),
      Vector3.Up(),
      scene,
    );
    a.addConstraint(b, joint);
  };

  socket(pelvis, torso, new Vector3(0, 0.15, 0), new Vector3(0, -0.2, 0));
  socket(torso, head, new Vector3(0, 0.22, 0), new Vector3(0, -0.12, 0));
  socket(pelvis, upperLegL, new Vector3(-0.1, -0.1, 0), new Vector3(0, 0.2, 0));
  socket(pelvis, upperLegR, new Vector3(0.1, -0.1, 0), new Vector3(0, 0.2, 0));
  socket(
    upperLegL,
    lowerLegL,
    new Vector3(0, -0.2, 0),
    new Vector3(0, 0.19, 0),
  );
  socket(
    upperLegR,
    lowerLegR,
    new Vector3(0, -0.2, 0),
    new Vector3(0, 0.19, 0),
  );
  socket(
    torso,
    upperArmL,
    new Vector3(-0.18, 0.15, 0),
    new Vector3(0, 0.16, 0),
  );
  socket(torso, upperArmR, new Vector3(0.18, 0.15, 0), new Vector3(0, 0.16, 0));
  socket(
    upperArmL,
    lowerArmL,
    new Vector3(0, -0.16, 0),
    new Vector3(0, 0.16, 0),
  );
  socket(
    upperArmR,
    lowerArmR,
    new Vector3(0, -0.16, 0),
    new Vector3(0, 0.16, 0),
  );

  torso.setAngularVelocity(new Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3)));
}

export const ragdollsScene: SceneDef = {
  label: 'Ragdolls',
  help: 'click: drop a ragdoll',
  build() {
    for (let i = 0; i < 8; i++)
      spawnRagdoll(rand(-6, 6), 6 + i * 2.5, rand(-4, 4));
  },
  onClick(at) {
    spawnRagdoll(at.x, 10, at.z);
  },
  onWave() {
    for (let i = 0; i < 5; i++)
      spawnRagdoll(rand(-6, 6), 8 + i * 3, rand(-4, 4));
  },
};
