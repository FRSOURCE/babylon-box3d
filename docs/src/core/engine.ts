import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
} from '@babylonjs/core';
import { Box3DPlugin } from '@frsource/babylon-box3d';
// The threaded ("deluxe") build needs cross-origin-isolation headers GitHub
// Pages doesn't send, and its worker entry doesn't bundle cleanly under
// Vite's default IIFE worker format -- so this demo sticks to the single-
// threaded build unconditionally.
import Box3D from 'box3d-wasm/standard';

const box3d = await Box3D();

export const canvas = document.getElementById(
  'renderCanvas',
) as HTMLCanvasElement;
export const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
export const scene = new Scene(engine);
scene.clearColor = new Color4(0x0b / 0xff, 0x0e / 0xff, 0x14 / 0xff, 1);

export const camera = new ArcRotateCamera(
  'camera',
  Math.PI / 1.4,
  Math.PI / 2.5,
  40,
  new Vector3(0, 3, 0),
  scene,
);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 120;
camera.upperBetaLimit = Math.PI * 0.49;
camera.wheelPrecision = 20;
camera.panningSensibility = 80;
camera.attachControl(canvas, true);
/**
 * Arrow keys/WASD drive the buggy in the driving scene -- strip the
 * camera's own default keyboard-pan input so they don't also steer the
 * camera, leaving mouse orbit/pan/zoom untouched.
 */
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

const sky = new HemisphericLight('sky', new Vector3(0.8, -1.1, -0.6), scene);
sky.intensity = 0.1;
sky.diffuse = Color3.FromHexString('#ffffff');
sky.groundColor = Color3.FromHexString('#000000');

const sun = new DirectionalLight('sun', new Vector3(0.8, -1.1, -0.6), scene);
sun.position = new Vector3(-10, 10, 10);
sun.intensity = 1.1;
sun.diffuse = Color3.FromHexString('#dde4e4');

/**
 * Fixes the shadow frustum instead of letting it auto-fit the shadow
 * casters' bounding box every frame: with `autoUpdateExtends` (the
 * default), the ortho projection subtly resizes as spawned shapes
 * scatter, so the shadow map's texel alignment drifts frame to frame --
 * visible as shimmering "swimming" shadow lines on the ground once
 * enough shapes have spread out.
 */
sun.shadowFrustumSize = 140;
sun.shadowMinZ = -3;
sun.shadowMaxZ = 50;
export const shadows = new ShadowGenerator(2048, sun);
shadows.useCloseExponentialShadowMap = true;
shadows.darkness = 0.4;

const pipeline = new DefaultRenderingPipeline('demoPipeline', false, scene, [
  camera,
]);
pipeline.imageProcessing.contrast = 1.15;
pipeline.imageProcessing.exposure = 1.0;
pipeline.imageProcessing.vignetteEnabled = true;
pipeline.imageProcessing.vignetteWeight = 1;
pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 1);

export const plugin = new Box3DPlugin(box3d);
scene.enablePhysics(new Vector3(0, -10, 0), plugin);
scene.getPhysicsEngine()?.setTimeStep(1 / 60);
