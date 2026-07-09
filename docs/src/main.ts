// Babylon.js port of monteslu/threejs-box3d-demo, showcasing @frsource/babylon-box3d
//
// ?scene=ragdolls  start on a specific scene (playground, pyramid, ragdolls,
//                  dominoes, bridge, driving)
// click            scene action: rain shapes, fire cannonball, drop a ragdoll
// shift+click      always fires a cannonball from the camera
// double click     explosion at the clicked point
// b                another wave of the scene's spawnable
// r                reset the current scene

import type { Vector3 } from '@babylonjs/core';
import { canvas, engine, plugin, scene } from './core/engine';
import { drive, pressed, updateDrive } from './scenes/driving';
import { SCENES } from './scenes/index';
import { assertDefined } from './utils';
import { getBodyCount, resetWorld, shootBall } from './world';

const params = new URLSearchParams(location.search);

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
      `bodies: ${getBodyCount()}  awake: ${plugin.world.getAwakeBodyCount()}\n` +
      `render: ${Math.round(engine.getFps())} fps\n` +
      `${assertDefined(SCENES[currentScene]).help}   shift+click: cannonball   dblclick: explode   b: more   r: reset`;
  }
});

addEventListener('resize', () => engine.resize());
