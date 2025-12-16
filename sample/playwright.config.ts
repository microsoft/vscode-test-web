import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for vscode-test-web
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	// Test directory
	testDir: './src/web/test-playwright',

	// Test file pattern
	testMatch: '**/*.spec.ts',

	// Maximum time one test can run
	timeout: 60000,

	// Test execution settings
	fullyParallel: false, // Run tests serially to avoid port conflicts
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Single worker to avoid resource contention

	// Reporter configuration
	reporter: [
		['list'],
		['html', { open: 'never', outputFolder: 'playwright-report' }],
	],

	// Shared settings for all projects
	use: {
		// Base URL for navigation
		baseURL: 'http://localhost:3000',

		// Collect trace on failure
		trace: 'on-first-retry',

		// Screenshot on failure
		screenshot: 'only-on-failure',

		// Video on failure
		video: 'retain-on-failure',
	},

	// Test projects for different browsers
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		// Uncomment to test on other browsers
		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] },
		// },
		// {
		// 	name: 'webkit',
		// 	use: { ...devices['Desktop Safari'] },
		// },
	],

	// Output folder for test artifacts
	outputDir: 'test-results/',

	// Start VSCode server before tests
	webServer: {
		command: 'node dist/web/test-playwright/startServer.js',
		url: 'http://localhost:3000',
		timeout: 120000,
		reuseExistingServer: !process.env.CI,
	},
});
