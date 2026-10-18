import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

try {
  const output = execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url)),
      '--workdir',
      '..',
      'gen',
      'types',
      '--local',
      '--schema',
      'public',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await writeFile(
    new URL('../../frontend/src/app/data/database.types.ts', import.meta.url),
    output,
  );
  console.log('Generated public database TypeScript definitions.');
} catch {
  console.error(
    'Could not generate local database types. Check that the local Supabase stack is running.',
  );
  process.exitCode = 1;
}
