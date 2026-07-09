import { Color3, StandardMaterial } from '@babylonjs/core';
import { scene } from './core/engine';

/** Throws if `value` is null/undefined; otherwise narrows and returns it. */
export function assertDefined<T>(
  value: T | undefined | null,
  message = 'unreachable',
): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

export const palette = [
  '#f38ba8',
  '#fab387',
  '#f9e2af',
  '#a6e3a1',
  '#89b4fa',
  '#cba6f7',
  '#94e2d5',
].map((hex) => Color3.FromHexString(hex));

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export const pick = <T>(arr: T[]): T =>
  assertDefined(arr[Math.floor(Math.random() * arr.length)]);

/** Builds a flat-shaded StandardMaterial from a color and a 0-1 roughness. */
export function material(color: Color3, roughness = 0.55): StandardMaterial {
  const mat = new StandardMaterial('m', scene);
  mat.diffuseColor = color;
  mat.specularColor = color.scale(0.5 - roughness);
  return mat;
}
