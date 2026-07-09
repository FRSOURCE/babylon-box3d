import { bridgeScene } from './bridge';
import { dominoesScene } from './dominoes';
import { drivingScene } from './driving';
import { playgroundScene } from './playground';
import { pyramidScene } from './pyramid';
import { ragdollsScene } from './ragdolls';
import type { SceneDef } from './types';

export type { SceneDef };

export const SCENES: Record<string, SceneDef> = {
  playground: playgroundScene,
  pyramid: pyramidScene,
  ragdolls: ragdollsScene,
  dominoes: dominoesScene,
  bridge: bridgeScene,
  driving: drivingScene,
};
