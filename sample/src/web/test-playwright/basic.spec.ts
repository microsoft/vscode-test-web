import { test, expect } from '@playwright/test';

test.describe('VSCode Web - Basic', () => {
	test('should load VSCode workbench', async ({ page }) => {
		// Navigate to VSCode (server started by playwright.config.ts)
		await page.goto('/');

		// Wait for VSCode workbench to load
		await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 30000 });
		console.log('✓ VSCode workbench loaded');

		// Verify page title contains "Visual Studio Code"
		await expect(page).toHaveTitle(/Visual Studio Code/);
		console.log('✓ Page title verified');
	});

	test('should have extension host worker', async ({ page }) => {
		await page.goto('/');

		// Wait for workbench
		await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 30000 });

		// Wait a bit for workers to initialize
		await page.waitForTimeout(2000);

		// Get all workers
		const workers = page.workers();
		console.log(`Found ${workers.length} worker(s)`);

		// Log worker URLs for debugging
		workers.forEach((worker, index) => {
			console.log(`  Worker ${index}: ${worker.url()}`);
		});

		// Verify at least one worker exists
		expect(workers.length).toBeGreaterThan(0);
		console.log('✓ Extension host worker(s) present');
	});

	test('should display activity bar and sidebar', async ({ page }) => {
		await page.goto('/');

		// Wait for workbench
		await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 30000 });

		// Check for activity bar
		const activityBar = page.locator('.activitybar');
		await expect(activityBar).toBeVisible({ timeout: 5000 });
		console.log('✓ Activity bar visible');

		// Check for sidebar
		const sidebar = page.locator('.sidebar');
		await expect(sidebar).toBeVisible({ timeout: 5000 });
		console.log('✓ Sidebar visible');
	});
});
