import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * ASCEND QA harness (Phase 0 of the QA-hardening brief).
 *
 * Runs against a LOCAL production build — production
 * (ascendtonext.vercel.app) is unreachable from the sandbox browser and
 * tests must never depend on it. The webServer block builds the app and
 * serves it with `next start`. Set QA_BASE_URL to point at an already
 * running server instead (the webServer block is then skipped).
 *
 * Browser binary: Playwright's own Chromium download is heavy and not
 * guaranteed in this sandbox, so launches use the cached Chrome headless
 * shell. Override with QA_CHROME_PATH.
 */
const cachedShell = path.join(
  os.homedir(),
  '.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/chrome-headless-shell-linux64/chrome-headless-shell',
);
const executablePath =
  process.env.QA_CHROME_PATH || (fs.existsSync(cachedShell) ? cachedShell : undefined);

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3100';

const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
};

export default defineConfig({
  testDir: './qa/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'qa/test-results',
  use: {
    baseURL,
    launchOptions,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'pixel-412x915',
      use: {
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'android-360x740',
      use: {
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'small-320x568',
      use: {
        viewport: { width: 320, height: 568 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'iphone-se-375x667',
      use: {
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  ...(process.env.QA_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npx next start -p 3100',
          url: baseURL,
          timeout: 600_000,
          reuseExistingServer: true,
        },
      }),
});
