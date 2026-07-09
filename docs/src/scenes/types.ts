import type { Vector3 } from '@babylonjs/core';

export interface SceneDef {
  label: string;
  help: string;
  build(): void;
  onClick(at: Vector3): void;
  onWave(): void;
}
