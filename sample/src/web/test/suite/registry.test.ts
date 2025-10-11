import * as assert from 'assert';
import * as playwright from '@vscode/test-web/playwright';

suite('Playwright registry management', () => {

	test('generates 3 handles in a test', async function() {
		this.timeout(5000);
		// Will be 0 at start of test due to beforeEach clear but isolated here for clarity.
		const sizeBefore = await (playwright as any).getRegistrySize();
		const h1 = await playwright.page.$('.monaco-workbench');
		const h2 = await playwright.page.$('.activitybar');
		const h3 = await playwright.page.$('.sidebar');
		assert.ok(h1, 'Expected .monaco-workbench element');
		assert.ok(h2, 'Expected .activitybar element');
		assert.ok(h3, 'Expected .sidebar element');
		const sizeAfter = await (playwright as any).getRegistrySize();
		assert.strictEqual(sizeAfter, sizeBefore + 3, `Registry size should be exactly 3 after creating three handles (was ${sizeAfter})`);
	});

	test('manual clear resets registry to 0', async function() {
		this.timeout(5000);
		// Will be 0 at start of test due to beforeEach clear but isolated here for clarity.
		const sizeBefore = await ((playwright as any).getRegistrySize());
		await playwright.page.$('.monaco-workbench');
		await playwright.page.$('.activitybar');
		assert.strictEqual(await (playwright as any).getRegistrySize(), sizeBefore + 2);
		await (playwright as any).clearRegistry();
		assert.strictEqual(await (playwright as any).getRegistrySize(), 0, 'Registry should be 0 after manual clear');
	});

	test('registry cleared between tests (size == 0)', async function() {
		this.timeout(5000);
		const sizeNow = await (playwright as any).getRegistrySize();
		assert.strictEqual(sizeNow, 0, `Registry expected to be 0 at start of new test (was ${sizeNow})`);
	});
});
