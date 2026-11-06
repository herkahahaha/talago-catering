import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: true,
  dts: false,
  // pg & pg-boss memakai require dinamis; biarkan di-resolve dari node_modules.
  // Workspace @catering/* dibundel agar image runtime tidak butuh source TypeScript.
  external: ['pg', 'pg-boss'],
  noExternal: [/^@catering\//],
});
