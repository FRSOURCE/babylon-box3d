import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['box3dPlugin.ts'],
      thresholds: {
        statements: 88,
        branches: 65,
        functions: 95,
        lines: 88,
      },
    },
  },
});
