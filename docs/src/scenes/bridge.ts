import {
  BallAndSocketConstraint,
  Color3,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Vector3,
  type PhysicsBody,
} from '@babylonjs/core';
import { scene } from '../core/engine';
import { material } from '../utils';
import { addStaticMesh, rainShapes, track } from '../world';
import type { SceneDef } from './types';

export const bridgeScene: SceneDef = {
  label: 'Bridge',
  help: 'click: rain shapes on the bridge',
  build() {
    const plankCount = 14;
    const plankHalf = 0.55;
    const gapStart = -plankCount * plankHalf;
    const deckY = 5;

    // Bridge runs along world X here (rotated 90 from a world-Z layout)
    // to match the reference framing -- travel direction is X, deck width
    // runs across Z.
    const makeTower = (tx: number) => {
      const mesh = MeshBuilder.CreateBox(
        'tower',
        { width: 2, height: deckY, depth: 4 },
        scene,
      );
      mesh.position.set(tx, deckY / 2, 0);
      mesh.material = material(Color3.FromHexString('#8a8f98'), 0.7);
      const agg = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.BOX,
        { mass: 0 },
        scene,
      );
      addStaticMesh(mesh);
      return agg.body;
    };
    const towerA = makeTower(gapStart - 1);
    const towerB = makeTower(-gapStart + 1);

    /**
     * Local offsets: a tower's deck-side edge is 1 (half-width) across
     * and deckY/2 (half-height) up from its own center; a plank's edges
     * are +-plankHalf from its own center (planks sit flat, so no y
     * offset). Each plank-to-plank edge is connected with a PAIR of
     * BallAndSocketConstraints, one near each side rail (+-railZ),
     * instead of a single HingeConstraint at the center: a single
     * central pivot only pins one point, so nothing stops the plank from
     * twisting about the direction of travel when weight lands on it --
     * exactly the "planks rotate around the bridge axis" symptom. Two
     * points spaced across the width behave like a real rope bridge's
     * twin cables and mechanically prevent that twist, and ball-and-
     * socket joints are the one constraint type in this plugin that's
     * been reliable so far (used for the wrecking-ball chain).
     */
    const railZ = 1.3;
    const connectDeck = (
      bodyA: PhysicsBody,
      localA: Vector3,
      bodyB: PhysicsBody,
      localB: Vector3,
    ): void => {
      for (const side of [-1, 1]) {
        const joint = new BallAndSocketConstraint(
          new Vector3(localA.x, localA.y, side * railZ),
          new Vector3(localB.x, localB.y, side * railZ),
          Vector3.Up(),
          Vector3.Up(),
          scene,
        );
        bodyA.addConstraint(bodyB, joint);
      }
    };

    let prev = towerA;
    let prevLocalAnchor = new Vector3(1, deckY / 2, 0);
    for (let i = 0; i < plankCount; i++) {
      const px = gapStart + plankHalf + i * plankHalf * 2;
      const mesh = MeshBuilder.CreateBox(
        'plank',
        { width: (plankHalf - 0.03) * 2, height: 0.2, depth: 3 },
        scene,
      );
      mesh.position.set(px, deckY, 0);
      mesh.material = material(Color3.FromHexString('#fab387'), 0.6);
      const agg = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.BOX,
        { mass: 1.5, friction: 0.7 },
        scene,
      );
      track(mesh);

      connectDeck(
        prev,
        prevLocalAnchor,
        agg.body,
        new Vector3(-plankHalf, 0, 0),
      );
      prev = agg.body;
      prevLocalAnchor = new Vector3(plankHalf, 0, 0);
    }
    connectDeck(prev, prevLocalAnchor, towerB, new Vector3(-1, deckY / 2, 0));
  },
  onClick(at) {
    rainShapes({ x: at.x, z: at.z }, 6);
  },
  onWave() {
    rainShapes({ x: 0, z: 0 }, 25);
  },
};
