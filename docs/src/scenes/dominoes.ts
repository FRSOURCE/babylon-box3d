import {
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  Vector3,
} from '@babylonjs/core';
import { scene } from '../core/engine';
import { assertDefined, material, palette } from '../utils';
import { rainShapes, shootBall, track } from '../world';
import type { SceneDef } from './types';

export const dominoesScene: SceneDef = {
  label: 'Dominoes',
  help: 'click: cannonball',
  build() {
    const totalAngle = Math.PI * 5;
    const spacing = 1.1;
    let angle = 0;
    let i = 0;
    while (angle < totalAngle && i < 200) {
      const radius = 14 - (angle / totalAngle) * 10;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;
      const mesh = MeshBuilder.CreateBox(
        'domino',
        { width: 0.9, height: 1.5, depth: 0.18 },
        scene,
      );
      mesh.position.set(px, 0.75, pz);
      // Face along the spiral's tangent direction so each domino's flat
      // side is perpendicular to the path and topples into the next one.
      mesh.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), -angle);
      mesh.material = material(assertDefined(palette[i % palette.length]));
      new PhysicsAggregate(
        mesh,
        PhysicsShapeType.BOX,
        { mass: 1, friction: 0.4 },
        scene,
      );
      track(mesh);
      angle += spacing / radius;
      i++;
    }
  },
  onClick(at) {
    shootBall(at);
  },
  onWave() {
    rainShapes({ x: 0, z: 0 }, 20);
  },
};
