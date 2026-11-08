import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_ERROR_CODES } from '@2tamago/core';
import { API_ERROR_CODES } from '@2tamago/core/contracts';

/** The web app translates errors from their code: a code must be declared to get a message. */
describe('API error codes', () => {
  it('declares every code the services send', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          for (const match of readFileSync(path, 'utf8').matchAll(
            /statusCode: \d+[^}]*?code: '(\w+)'/gs,
          )) {
            found.add(match[1]!);
          }
        }
      }
    };
    walk(root);
    expect(found.size).toBeGreaterThan(0);
    const declared = new Set<string>([...API_ERROR_CODES, ...GAME_ERROR_CODES]);
    expect([...found].filter((code) => !declared.has(code))).toEqual([]);
  });
});
