import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/components/**/*.test.tsx', 'jsdom'],
      ['src/pages/**/*.test.tsx', 'jsdom'],
    ],
    exclude: ['dist/**', 'dist-electron/**', 'node_modules/**'],
    include: [
      'electron/**/*.test.ts',
      'src/components/**/*.test.tsx',
      'src/pages/**/*.test.ts',
      'src/pages/**/*.test.tsx',
      'src/services/**/*.test.ts',
    ],
  },
});
