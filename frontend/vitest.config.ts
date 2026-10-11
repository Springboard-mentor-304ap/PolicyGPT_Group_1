import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Test-only Angular transform for raw `vitest` runs.
 *
 * `ng test` (Angular unit-test builder) inlines external component
 * resources via its own compiler pipeline. Plain vitest has no such
 * transform, so JIT TestBed compilation fails with
 * "Component ... is not resolved" for `templateUrl`/`styleUrl(s)`.
 *
 * This plugin replaces `templateUrl` with the file's inline template
 * and drops `styleUrl(s)` (styles are irrelevant to logic tests).
 * Application code is untouched.
 */
function inlineAngularResources(): Plugin {
  return {
    name: 'policygpt-inline-angular-resources',
    enforce: 'pre',
    transform(code: string, id: string) {
      const file = id.split('?')[0];
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || !file.includes('/src/')) {
        return;
      }
      if (
        !code.includes('templateUrl') &&
        !code.includes('styleUrl') &&
        !code.includes('styleUrls')
      ) {
        return;
      }
      const dir = path.dirname(file);
      let out = code;
      out = out.replace(
        /templateUrl\s*:\s*['"]([^'"]+)['"]/g,
        (_match, rel: string) => {
          const full = path.resolve(dir, rel);
          const template = fs.readFileSync(full, 'utf8');
          return `template: ${JSON.stringify(template)}`;
        },
      );
      out = out.replace(/styleUrl\s*:\s*['"]([^'"]+)['"]\s*,?/g, '');
      out = out.replace(/styleUrls\s*:\s*\[[^\]]*\]\s*,?/g, '');
      if (out !== code) {
        return { code: out, map: null };
      }
    },
  };
}

// Shared vitest configuration for direct `npx vitest run` invocations.
// `ng test` (Angular unit-test builder) supplies its own equivalent
// environment and setup; this file only affects raw vitest runs.
export default defineConfig({
  plugins: [inlineAngularResources()],
  test: {
    environment: 'jsdom',
    // Legacy specs use describe/it/expect/vi without importing 'vitest'.
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
  },
});
