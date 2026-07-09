// box3d-wasm ships no types at all, so this package's own d.ts augments it
// ambiently (box3d-wasm.d.ts / extraJoints.d.ts). tsup's dts bundler (rollup-
// plugin-dts) only follows real import/export edges, not ambient
// `declare module` blocks reached solely via a triple-slash reference -- so
// dist/index.d.{ts,mts} come out of `tsup` referencing `World`/`Box3DModule`
// from 'box3d-wasm' with nothing behind that name for consumers. Prepending
// the ambient declarations here is what actually makes those types resolve
// once this package is installed from npm rather than linked from source.
import { readFileSync, writeFileSync } from 'node:fs';

const ambient = ['box3d-wasm.d.ts', 'extraJoints.d.ts']
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

for (const dtsFile of ['dist/index.d.ts', 'dist/index.d.mts']) {
  const generated = readFileSync(dtsFile, 'utf8');
  writeFileSync(dtsFile, `${ambient}\n${generated}`);
}
