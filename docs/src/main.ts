// Babylon.js port of monteslu/threejs-box3d-demo, showcasing
// @frsource/babylon-box3d instead of hand-rolled box3d-wasm glue.
//
// ?scene=ragdolls  start on a specific scene (playground, pyramid, ragdolls,
//                  dominoes, bridge, driving)
// click            scene action: rain shapes, fire cannonball, drop a ragdoll
// shift+click      always fires a cannonball from the camera
// double click     explosion at the clicked point
// b                another wave of the scene's spawnable
// r                reset the current scene

import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  ArcRotateCamera,
  HingeConstraint,
  BallAndSocketConstraint,
  type PhysicsBody,
} from '@babylonjs/core';
import { Box3DPlugin } from '@frsource/babylon-box3d';
// The threaded ("deluxe") build needs cross-origin-isolation headers GitHub
// Pages doesn't send, and its worker entry doesn't bundle cleanly under
// Vite's default IIFE worker format -- so this demo sticks to the single-
// threaded build unconditionally.
import Box3D from 'box3d-wasm/standard';

const params = new URLSearchParams(location.search);

const box3d = await Box3D();

function assertDefined<T>(
  value: T | undefined | null,
  message = 'unreachable',
): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

// ---------------------------------------------------------------------------
// Babylon setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0x0b / 0xff, 0x0e / 0xff, 0x14 / 0xff, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0x0b / 0xff, 0x0e / 0xff, 0x14 / 0xff);
scene.fogDensity = 0.012;

const camera = new ArcRotateCamera(
  'camera',
  -Math.PI / 2 - 0.4,
  Math.PI / 3.1,
  32,
  new Vector3(0, 3, 0),
  scene,
);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 120;
camera.upperBetaLimit = Math.PI * 0.49;
camera.wheelPrecision = 20;
camera.panningSensibility = 80;
camera.attachControl(canvas, true);

new HemisphericLight('sky', new Vector3(0.3, 1, 0.2), scene).intensity = 0.7;
const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.35), scene);
sun.position = new Vector3(25, 40, 15);
sun.intensity = 2.2;
const shadows = new ShadowGenerator(2048, sun);
shadows.usePercentageCloserFiltering = true;

const plugin = new Box3DPlugin(box3d);
scene.enablePhysics(new Vector3(0, -10, 0), plugin);
scene.getPhysicsEngine()?.setTimeStep(1 / 60);

const palette = [
  '#f38ba8',
  '#fab387',
  '#f9e2af',
  '#a6e3a1',
  '#89b4fa',
  '#cba6f7',
  '#94e2d5',
].map((hex) => Color3.FromHexString(hex));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(arr: T[]): T =>
  assertDefined(arr[Math.floor(Math.random() * arr.length)]);

function material(color: Color3, roughness = 0.55): StandardMaterial {
  const mat = new StandardMaterial('m', scene);
  mat.diffuseColor = color;
  mat.specularColor = color.scale(1 - roughness);
  return mat;
}

// ---------------------------------------------------------------------------
// world lifecycle: dispose every scene mesh/body between scene switches
// ---------------------------------------------------------------------------

let sceneMeshes: Mesh[] = [];
let bodyCount = 0;

function track(mesh: Mesh): Mesh {
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh);
  sceneMeshes.push(mesh);
  bodyCount++;
  return mesh;
}

function addStaticMesh(mesh: Mesh): Mesh {
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh);
  sceneMeshes.push(mesh);
  return mesh;
}

function resetWorld(): void {
  for (const mesh of sceneMeshes) mesh.dispose();
  sceneMeshes = [];
  bodyCount = 0;

  const ground = MeshBuilder.CreateBox(
    'ground',
    { width: 60, height: 2, depth: 60 },
    scene,
  );
  ground.position.y = -1;
  ground.material = material(Color3.FromHexString('#2a2f3a'), 0.9);
  new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, friction: 0.7 },
    scene,
  );
  addStaticMesh(ground);
}

// ---------------------------------------------------------------------------
// spawnables
// ---------------------------------------------------------------------------

function spawnShape(x: number, y: number, z: number): void {
  const mat = material(pick(palette));
  const kind = Math.random();
  let mesh: Mesh;
  let agg: PhysicsAggregate;

  if (kind < 0.45) {
    const w = rand(0.5, 1.2);
    const h = rand(0.5, 1.2);
    const d = rand(0.5, 1.2);
    mesh = MeshBuilder.CreateBox(
      'shape',
      { width: w, height: h, depth: d },
      scene,
    );
    agg = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: 1, friction: 0.5 },
      scene,
    );
  } else if (kind < 0.8) {
    const r = rand(0.25, 0.5);
    mesh = MeshBuilder.CreateSphere(
      'shape',
      { diameter: r * 2, segments: 16 },
      scene,
    );
    agg = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      { mass: 1, friction: 0.4, restitution: 0.3 },
      scene,
    );
  } else {
    const r = rand(0.2, 0.35);
    const h = rand(0.5, 1.0);
    mesh = MeshBuilder.CreateCapsule(
      'shape',
      { radius: r, height: h + r * 2 },
      scene,
    );
    agg = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.CAPSULE,
      { mass: 1, friction: 0.5 },
      scene,
    );
  }
  void agg;
  mesh.material = mat;
  mesh.position.set(x, y, z);
  track(mesh);
}

function rainShapes(at: { x: number; z: number }, count: number): void {
  for (let i = 0; i < count; i++) {
    spawnShape(
      at.x + rand(-1.2, 1.2),
      12 + rand(0, 3) + i * 0.8,
      at.z + rand(-1.2, 1.2),
    );
  }
}

function shootBall(target?: Vector3): void {
  const dir = target
    ? target.subtract(camera.position).normalize()
    : camera.getForwardRay().direction;
  const from = camera.position.add(dir.scale(2));
  const mesh = MeshBuilder.CreateSphere(
    'cannonball',
    { diameter: 1.2, segments: 16 },
    scene,
  );
  mesh.position.copyFrom(from);
  const white = material(Color3.White(), 0.2);
  mesh.material = white;
  const agg = new PhysicsAggregate(
    mesh,
    PhysicsShapeType.SPHERE,
    { mass: 12, friction: 0.4, restitution: 0.4 },
    scene,
  );
  agg.body.setLinearVelocity(dir.scale(40));
  // box3d-wasm needs a bullet flag (CCD) for fast-moving small spheres -- no
  // Babylon V2 equivalent, so this drops to the raw box3d body.
  (
    agg.body._pluginData as { native: { setBullet(flag: boolean): void } }
  ).native.setBullet(true);
  track(mesh);
}

/** A jointed ragdoll. Ball-and-socket for the spine/shoulders/hips, hinge for
 * elbows/knees -- the same joint split as the original demo, expressed
 * through Babylon's own constraint classes. */
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
  const hinge = (
    a: PhysicsBody,
    b: PhysicsBody,
    anchorA: Vector3,
    anchorB: Vector3,
    lo: number,
    hi: number,
  ) => {
    const joint = new HingeConstraint(
      anchorA,
      anchorB,
      Vector3.Right(),
      Vector3.Right(),
      scene,
    );
    a.addConstraint(b, joint);
    void lo;
    void hi;
  };

  socket(pelvis, torso, new Vector3(0, 0.15, 0), new Vector3(0, -0.2, 0));
  socket(torso, head, new Vector3(0, 0.22, 0), new Vector3(0, -0.12, 0));
  socket(pelvis, upperLegL, new Vector3(-0.1, -0.1, 0), new Vector3(0, 0.2, 0));
  socket(pelvis, upperLegR, new Vector3(0.1, -0.1, 0), new Vector3(0, 0.2, 0));
  hinge(
    upperLegL,
    lowerLegL,
    new Vector3(0, -0.2, 0),
    new Vector3(0, 0.19, 0),
    0,
    2.2,
  );
  hinge(
    upperLegR,
    lowerLegR,
    new Vector3(0, -0.2, 0),
    new Vector3(0, 0.19, 0),
    0,
    2.2,
  );
  socket(
    torso,
    upperArmL,
    new Vector3(-0.18, 0.15, 0),
    new Vector3(0, 0.16, 0),
  );
  socket(torso, upperArmR, new Vector3(0.18, 0.15, 0), new Vector3(0, 0.16, 0));
  hinge(
    upperArmL,
    lowerArmL,
    new Vector3(0, -0.16, 0),
    new Vector3(0, 0.16, 0),
    -2.2,
    0,
  );
  hinge(
    upperArmR,
    lowerArmR,
    new Vector3(0, -0.16, 0),
    new Vector3(0, 0.16, 0),
    -2.2,
    0,
  );

  torso.setAngularVelocity(new Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3)));
}

// ---------------------------------------------------------------------------
// joint toys for the playground
// ---------------------------------------------------------------------------

function buildToys(): void {
  // motorized windmill that flings whatever lands near it
  const post = MeshBuilder.CreateBox(
    'post',
    { width: 0.5, height: 2.2, depth: 0.5 },
    scene,
  );
  post.position.set(-8, 1.1, 0);
  post.material = material(Color3.FromHexString('#8a8f98'), 0.6);
  const postAgg = new PhysicsAggregate(
    post,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  addStaticMesh(post);

  const rotor = MeshBuilder.CreateBox(
    'rotor',
    { width: 8, height: 0.3, depth: 0.7 },
    scene,
  );
  rotor.position.set(-8, 2.4, 0);
  rotor.material = material(Color3.FromHexString('#f9e2af'), 0.4);
  const rotorAgg = new PhysicsAggregate(
    rotor,
    PhysicsShapeType.BOX,
    { mass: 20 },
    scene,
  );
  track(rotor);

  // pivotA/pivotB are LOCAL offsets from each body's own center (see
  // IPhysicsEnginePlugin's PhysicsConstraintParameters), not world points --
  // the post's attachment point is 1.3 above its own center, the rotor
  // hinges about its own center, and the axis is world-up so it spins flat.
  const windmill = new HingeConstraint(
    new Vector3(0, 1.3, 0),
    Vector3.Zero(),
    Vector3.Up(),
    Vector3.Up(),
    scene,
  );
  postAgg.body.addConstraint(rotorAgg.body, windmill);

  // wrecking ball on a chain of ball-and-socket joints, released with a
  // swing. Every link is a vertical capsule, so its own top/bottom anchor
  // offsets are the same fixed local constants regardless of world position.
  const anchor = MeshBuilder.CreateBox('anchor', { size: 0.1 }, scene);
  anchor.position.set(8, 12, 0);
  anchor.isVisible = false;
  const anchorAgg = new PhysicsAggregate(
    anchor,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  addStaticMesh(anchor);

  const linkCount = 6;
  let prevBody = anchorAgg.body;
  let prevLocalBottom = Vector3.Zero();
  for (let i = 0; i < linkCount; i++) {
    const link = MeshBuilder.CreateCapsule(
      'link',
      { radius: 0.15, height: 0.7 + 0.3 },
      scene,
    );
    link.position.set(8, 11.5 - i, 0);
    link.material = material(Color3.FromHexString('#9399b2'), 0.4);
    const linkAgg = new PhysicsAggregate(
      link,
      PhysicsShapeType.CAPSULE,
      { mass: 2 },
      scene,
    );
    track(link);

    const joint = new BallAndSocketConstraint(
      prevLocalBottom,
      new Vector3(0, 0.5, 0),
      Vector3.Up(),
      Vector3.Up(),
      scene,
    );
    prevBody.addConstraint(linkAgg.body, joint);
    prevBody = linkAgg.body;
    prevLocalBottom = new Vector3(0, -0.5, 0);
  }
  const ball = MeshBuilder.CreateSphere(
    'wreckingball',
    { diameter: 1.8, segments: 16 },
    scene,
  );
  ball.position.set(8, 11.5 - linkCount - 0.6, 0);
  ball.material = material(Color3.FromHexString('#b4befe'), 0.25);
  const ballAgg = new PhysicsAggregate(
    ball,
    PhysicsShapeType.SPHERE,
    { mass: 12, friction: 0.4 },
    scene,
  );
  ballAgg.body.setLinearVelocity(new Vector3(-8, 0, 0));
  track(ball);
  const ballJoint = new BallAndSocketConstraint(
    prevLocalBottom,
    new Vector3(0, 0.9, 0),
    Vector3.Up(),
    Vector3.Up(),
    scene,
  );
  prevBody.addConstraint(ballAgg.body, ballJoint);

  // seesaw on a limited hinge
  const pivot = MeshBuilder.CreateBox(
    'pivot',
    { width: 0.6, height: 1.2, depth: 0.6 },
    scene,
  );
  pivot.position.set(0, 0.6, -9);
  pivot.material = material(Color3.FromHexString('#8a8f98'), 0.6);
  const pivotAgg = new PhysicsAggregate(
    pivot,
    PhysicsShapeType.BOX,
    { mass: 0 },
    scene,
  );
  addStaticMesh(pivot);

  const plank = MeshBuilder.CreateBox(
    'plank',
    { width: 8, height: 0.3, depth: 2 },
    scene,
  );
  plank.position.set(0, 1.35, -9);
  plank.material = material(Color3.FromHexString('#a6e3a1'), 0.5);
  const plankAgg = new PhysicsAggregate(
    plank,
    PhysicsShapeType.BOX,
    { mass: 6, friction: 0.7 },
    scene,
  );
  track(plank);

  // pivot's own center is at y=0.6, the plank's hinge point sits 0.75 above
  // that (local to pivot); the plank hinges about its own center (local zero).
  const seesaw = new HingeConstraint(
    new Vector3(0, 0.75, 0),
    Vector3.Zero(),
    Vector3.Forward(),
    Vector3.Forward(),
    scene,
  );
  pivotAgg.body.addConstraint(plankAgg.body, seesaw);

  for (let i = 0; i < 3; i++) {
    spawnShape(3 + rand(-0.2, 0.2), 3 + i * 1.2, -9 + rand(-0.2, 0.2));
  }
}

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

interface SceneDef {
  label: string;
  help: string;
  build(): void;
  onClick(at: Vector3): void;
  onWave(): void;
}

const SCENES: Record<string, SceneDef> = {
  playground: {
    label: 'Playground',
    help: 'click: rain shapes',
    build() {
      buildToys();
      const side = 6;
      for (let i = 0; i < 150; i++) {
        const gx = (i % side) - side / 2;
        const gz = (Math.floor(i / side) % side) - side / 2;
        const gy = Math.floor(i / (side * side));
        spawnShape(
          gx * 1.3 + rand(-0.1, 0.1),
          6 + gy * 1.3,
          gz * 1.3 + rand(-0.1, 0.1),
        );
      }
    },
    onClick(at) {
      rainShapes(at, 8);
    },
    onWave() {
      rainShapes({ x: 0, z: 0 }, 50);
    },
  },

  pyramid: {
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
          mesh.material = material(
            assertDefined(palette[row % palette.length]),
          );
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
  },

  ragdolls: {
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
  },

  dominoes: {
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
        mesh.rotationQuaternion = Quaternion.RotationAxis(
          Vector3.Up(),
          -angle / 2,
        );
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
  },

  bridge: {
    label: 'Bridge',
    help: 'click: rain shapes on the bridge',
    build() {
      const plankCount = 14;
      const plankHalf = 0.55;
      const gapStart = -plankCount * plankHalf;
      const deckY = 5;

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

      // Local offsets: a tower's deck-side edge is 1 (half-width) across and
      // deckY/2 (half-height) up from its own center; a plank's edges are
      // +-plankHalf from its own center (planks sit flat, so no y offset).
      // Hinge axis is world Z -- perpendicular to both the deck's direction
      // of travel (X) and gravity (Y) -- so weight actually sags the deck
      // instead of the joint fighting an unrelated rotation axis.
      const axis = Vector3.Forward();
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

        const joint = new HingeConstraint(
          prevLocalAnchor,
          new Vector3(-plankHalf, 0, 0),
          axis,
          axis,
          scene,
        );
        prev.addConstraint(agg.body, joint);
        prev = agg.body;
        prevLocalAnchor = new Vector3(plankHalf, 0, 0);
      }
      const closing = new HingeConstraint(
        prevLocalAnchor,
        new Vector3(-1, deckY / 2, 0),
        axis,
        axis,
        scene,
      );
      prev.addConstraint(towerB, closing);
    },
    onClick(at) {
      rainShapes({ x: at.x, z: at.z }, 6);
    },
    onWave() {
      rainShapes({ x: 0, z: 0 }, 25);
    },
  },

  driving: {
    label: 'Driving',
    help: 'drive: arrows or wasd   click: rain obstacles',
    build() {
      drive.active = true;
      buildBuggy(0, 1.2, 6);
      const ramp = MeshBuilder.CreateBox(
        'ramp',
        { width: 8, height: 0.3, depth: 6 },
        scene,
      );
      ramp.position.set(-8, 0.8, -4);
      ramp.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.3);
      ramp.material = material(Color3.FromHexString('#8a8f98'), 0.7);
      new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, scene);
      addStaticMesh(ramp);
      for (let i = 0; i < 40; i++)
        spawnShape(rand(-10, 10), 1 + (i % 4), rand(-12, 2));
    },
    onClick(at) {
      rainShapes(at, 6);
    },
    onWave() {
      rainShapes({ x: 0, z: 0 }, 20);
    },
  },
};

// drivable buggy: box3d's wheel joint has no Babylon V2 equivalent, so this
// drops to plugin.world directly -- see the package README's "Raw box3d
// access" section.
const drive: {
  active: boolean;
  wheels: import('box3d-wasm').WheelJoint[];
  steer: import('box3d-wasm').WheelJoint[];
} = { active: false, wheels: [], steer: [] };
const pressed = new Set<string>();

function buildBuggy(x: number, y: number, z: number): void {
  const chassis = MeshBuilder.CreateBox(
    'chassis',
    { width: 1.8, height: 0.4, depth: 1.0 },
    scene,
  );
  chassis.position.set(x, y, z);
  chassis.material = material(Color3.FromHexString('#f38ba8'), 0.35);
  const chassisAgg = new PhysicsAggregate(
    chassis,
    PhysicsShapeType.BOX,
    { mass: 40, friction: 0.3 },
    scene,
  );
  track(chassis);
  const chassisNative = (
    chassisAgg.body._pluginData as {
      native: import('box3d-wasm').Body;
    }
  ).native;
  chassisNative.enableSleep(false);

  const wheelMat = material(Color3.FromHexString('#1e1e2e'), 0.9);
  for (const [wx, wz, steers] of [
    [0.7, 0.62, true],
    [0.7, -0.62, true],
    [-0.7, 0.62, false],
    [-0.7, -0.62, false],
  ] as const) {
    const wheelMesh = MeshBuilder.CreateSphere(
      'wheel',
      { diameter: 0.7, segments: 12 },
      scene,
    );
    wheelMesh.position.set(x + wx, y - 0.25, z + wz);
    wheelMesh.material = wheelMat;
    const wheelAgg = new PhysicsAggregate(
      wheelMesh,
      PhysicsShapeType.SPHERE,
      { mass: 4, friction: 1.2 },
      scene,
    );
    track(wheelMesh);
    const wheelNative = (
      wheelAgg.body._pluginData as { native: import('box3d-wasm').Body }
    ).native;
    wheelNative.enableSleep(false);
    wheelNative.setBullet(true);

    // chassis frame A x maps onto world y (suspension), frame B z is the
    // axle (spin about world z) -- matches the original demo's convention.
    const qXtoY = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const joint = plugin.world.createWheelJoint(chassisNative, wheelNative, {
      localFrameA: { position: { x: wx, y: -0.25, z: wz }, rotation: qXtoY },
      localFrameB: { position: { x: 0, y: 0, z: 0 } },
      enableSuspensionSpring: true,
      suspensionHertz: 4,
      suspensionDampingRatio: 0.7,
      enableSuspensionLimit: true,
      lowerSuspensionLimit: -0.25,
      upperSuspensionLimit: 0.1,
      enableSpinMotor: true,
      maxSpinTorque: 60,
      enableSteering: steers,
      steeringHertz: 8,
      steeringDampingRatio: 1,
      maxSteeringTorque: 80,
      enableSteeringLimit: true,
      lowerSteeringLimit: -0.5,
      upperSteeringLimit: 0.5,
    });
    drive.wheels.push(joint);
    if (steers) drive.steer.push(joint);
  }
}

function updateDrive(): void {
  if (!drive.active) return;
  const forward =
    (pressed.has('ArrowUp') || pressed.has('w') ? 1 : 0) -
    (pressed.has('ArrowDown') || pressed.has('s') ? 1 : 0);
  const turn =
    (pressed.has('ArrowLeft') || pressed.has('a') ? 1 : 0) -
    (pressed.has('ArrowRight') || pressed.has('d') ? 1 : 0);
  for (const joint of drive.wheels) joint.setSpinMotorSpeed(forward * -25);
  for (const joint of drive.steer) joint.setTargetSteeringAngle(turn * 0.45);
}

// ---------------------------------------------------------------------------
// menu, scene switching
// ---------------------------------------------------------------------------

const requestedScene = params.get('scene');
let currentScene =
  requestedScene && SCENES[requestedScene] ? requestedScene : 'playground';

function loadScene(name: string): void {
  currentScene = name;
  drive.active = false;
  drive.wheels.length = 0;
  drive.steer.length = 0;
  resetWorld();
  assertDefined(SCENES[name]).build();
  for (const btn of document.querySelectorAll<HTMLButtonElement>(
    '#menu button',
  )) {
    btn.classList.toggle('active', btn.dataset.scene === name);
  }
}

const menu = assertDefined(document.getElementById('menu'));
for (const [name, def] of Object.entries(SCENES)) {
  const btn = document.createElement('button');
  btn.textContent = def.label;
  btn.dataset.scene = name;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadScene(name);
  });
  menu.appendChild(btn);
}
{
  const btn = document.createElement('button');
  btn.textContent = 'Reset';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadScene(currentScene);
  });
  menu.appendChild(btn);
}

loadScene(currentScene);

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

function groundPoint(clientX: number, clientY: number): Vector3 | null {
  const pick = scene.pick(clientX, clientY);
  return pick?.pickedPoint ?? null;
}

let downAt: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return; // camera drag, not a click

  if (e.shiftKey) {
    shootBall();
    return;
  }
  const at = groundPoint(e.clientX, e.clientY);
  if (at) assertDefined(SCENES[currentScene]).onClick(at);
});

canvas.addEventListener('dblclick', (e) => {
  const at = groundPoint(e.clientX, e.clientY);
  if (!at) return;
  plugin.world.explode({
    position: { x: at.x, y: at.y + 0.5, z: at.z },
    radius: 5,
    falloff: 4,
    impulsePerArea: 25,
  });
});

addEventListener('keydown', (e) => {
  pressed.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === 'b') assertDefined(SCENES[currentScene]).onWave();
  if (e.key === 'r') loadScene(currentScene);
});
addEventListener('keyup', (e) => {
  pressed.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------

const hud = assertDefined(document.getElementById('hud'));
let hudLast = 0;

engine.runRenderLoop(() => {
  updateDrive();
  scene.render();

  const now = performance.now();
  if (now - hudLast > 500) {
    hudLast = now;
    hud.textContent =
      `Box3D by Erin Catto, via @frsource/babylon-box3d (single threaded)\n` +
      `bodies: ${bodyCount}  awake: ${plugin.world.getAwakeBodyCount()}\n` +
      `render: ${Math.round(engine.getFps())} fps\n` +
      `${assertDefined(SCENES[currentScene]).help}   shift+click: cannonball   dblclick: explode   b: more   r: reset`;
  }
});

addEventListener('resize', () => engine.resize());
