import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const name of ['index.html', 'style.css', 'mark.svg']) {
  await cp(`web/${name}`, `dist/${name}`);
}
await build({
  entryPoints: ['web/app.js'],
  outfile: 'dist/app.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
});
