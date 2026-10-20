import { mkdir, writeFile } from 'node:fs/promises';
import { publicSettings } from './public-settings.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--production')) {
  throw new Error('Unsupported configuration generation option.');
}

// Validate everything before replacing the generated file or invoking Angular.
const production = args.includes('--production');
const settings = publicSettings(process.env, { production });

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../public/app-config.json', import.meta.url),
  JSON.stringify(settings, null, 2) + '\n',
);
console.log(
  `Prepared ${settings.mode} application settings (${production ? 'production' : 'local development'}).`,
);
