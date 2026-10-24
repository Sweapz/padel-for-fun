import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise the optimized build under its generated Pages headers, without a database.
it(
  'loads lazy pages under CSP and blocks an unauthorized inline script',
  async () => {
    const dist = path.resolve(
      fileURLToPath(new URL('../../frontend/dist/padel-americano/browser/', import.meta.url)),
    );
    const rules = [];

    for (const line of (await readFile(path.join(dist, '_headers'), 'utf8')).split('\n')) {
      if (line.startsWith('/')) {
        rules.push({ pattern: line.trim(), headers: [] });
      } else if (line.trim()) {
        const colon = line.indexOf(':');
        rules.at(-1).headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
      }
    }

    const server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://localhost').pathname;

        for (const rule of rules) {
          const [prefix, suffix] = rule.pattern.split('*');
          const matches =
            suffix === undefined
              ? pathname === prefix
              : pathname.startsWith(prefix) && pathname.endsWith(suffix);

          if (matches) {
            for (const [name, value] of rule.headers) {
              const existing = response.getHeader(name);
              response.setHeader(name, existing ? `${existing}, ${value}` : value);
            }
          }
        }

        if (pathname === '/app-config.json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ mode: 'local' }));

          return;
        }

        let file = path.resolve(dist, '.' + decodeURIComponent(pathname));
        let content;

        if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html');

        try {
          content = await readFile(file);
        } catch {
          file = path.join(dist, 'index.html');
          content = await readFile(file);
        }

        if (file.endsWith('index.html') && request.url.includes('security-probe=1')) {
          content = content
            .toString()
            .replace('</body>', '<script>window.unauthorizedScriptExecuted = true</script></body>');
        }

        response.setHeader(
          'Content-Type',
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
          }[path.extname(file)] ?? 'text/html',
        );
        response.end(content);
      } catch {
        response.writeHead(500);
        response.end();
      }
    });
    let browser;

    try {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const origin = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.policyViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.policyViolations.push(event.effectiveDirective);
        });
      });

      const response = await page.goto(`${origin}/players`);
      assert.match(response.headers()['content-security-policy'], /frame-ancestors 'none'/);
      assert.equal(response.headers()['cache-control'], 'no-cache');
      assert.ok(await page.locator('meta[http-equiv="Content-Security-Policy"]').count());
      await page.getByRole('heading', { name: 'Add a player' }).waitFor();
      await page.getByLabel('Name', { exact: true }).fill('Hosting check');
      await page.getByRole('button', { name: 'Add player', exact: true }).click();
      await page.getByRole('link', { name: /Hosting check/ }).waitFor();
      await page.getByRole('link', { name: 'Clubhouse', exact: true }).click();
      await page.getByRole('heading', { name: 'padel for fun', exact: true }).waitFor();

      const themeSwitch = page.getByRole('switch', { name: 'Dark mode' });
      assert.equal(await themeSwitch.getAttribute('aria-checked'), 'true');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
        'rgb(16, 27, 23)',
      );
      await themeSwitch.focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      assert.equal(await themeSwitch.getAttribute('aria-checked'), 'false');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
        'rgb(247, 248, 242)',
      );

      await page.reload();
      await page.getByRole('heading', { name: 'padel for fun', exact: true }).waitFor();
      assert.equal(await themeSwitch.getAttribute('aria-checked'), 'false');

      await themeSwitch.click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      assert.equal(await themeSwitch.getAttribute('aria-checked'), 'true');

      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.policyViolations), []);

      await page.goto(`${origin}/players?security-probe=1`);
      await page.waitForFunction(() =>
        window.policyViolations.some((directive) => directive.startsWith('script-src')),
      );
      assert.equal(await page.evaluate(() => window.unauthorizedScriptExecuted), undefined);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
  { timeout: 30000 },
);
