import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['dist/**', 'dist-electron/**', 'node_modules/**'],
    include: ['electron/**/*.test.ts', 'src/services/**/*.test.ts'],
  },
});
