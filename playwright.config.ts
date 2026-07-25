import { defineConfig, devices } from '@playwright/test';

// Drives the Vite dev server, not the compiled Tauri binary — tauri-driver has
// no macOS support and CDP cannot attach to WKWebView. See docs/DECISIONS.md 009.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Honour a pre-provisioned browser (CI images pin their own build)
        // rather than downloading one per Playwright bump.
        ...(process.env['PLAYWRIGHT_CHROMIUM_PATH']
          ? {
              launchOptions: {
                executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'],
              },
            }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev:web',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
