import {
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
} from '@babylonjs/core';
import { scene } from '../core/engine';
import { assertDefined, material, palette } from '../utils';
import { rainShapes, shootBall, track } from '../world';
import type { SceneDef } from './types';

export const pyramidScene: SceneDef = {
  label: 'Pyramid',
  help: 'click: cannonball',
  build() {
    const h = 0.5;
    const rows = 12;
    for (let row = 0; row < rows; row++) {
      const cols = rows - row;
      for (let c = 0; c < cols; c++) {
        const mesh = MeshBuilder.CreateBox('brick', { size: h * 2 }, scene);
        mesh.position.set(
          (c - cols / 2) * (h * 2 + 0.02) + h,
          h + row * h * 2,
          0,
        );
        mesh.material = material(assertDefined(palette[row % palette.length]));
        new PhysicsAggregate(
          mesh,
          PhysicsShapeType.BOX,
          { mass: 1, friction: 0.6 },
          scene,
        );
        track(mesh);
      }
    }
  },
  onClick(at) {
    shootBall(at);
  },
  onWave() {
    rainShapes({ x: 0, z: 0 }, 25);
  },
};
