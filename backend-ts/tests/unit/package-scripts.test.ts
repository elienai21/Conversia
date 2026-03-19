import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('typecheck regenerates Prisma client before compiling TypeScript', async () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(testDir, '..', '..', 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.typecheck, 'prisma generate && tsc --noEmit');
});
