import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Bundle the actual domain sources into the deployable function; never maintain a copied scheduler.
await build({
  entryPoints: [fileURLToPath(new URL('../edge/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../functions/schedule/index.js', import.meta.url)),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'info',
});
