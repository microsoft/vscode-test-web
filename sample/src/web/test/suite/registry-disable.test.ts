import * as assert from 'assert';
import * as playwright from '@vscode/test-web/playwright';

suite('Playwright registry disable auto clear', () => {

	let sizeAfterFirst: number;

	test('disable auto clear and create handles', async function() {
		this.timeout(5000);
		(playwright as any).disableAutoClearRegistry();
		assert.strictEqual(await (playwright as any).getRegistrySize(), 0);
		await playwright.page.$('.monaco-workbench');
		await playwright.page.$('.activitybar');
		sizeAfterFirst = await (playwright as any).getRegistrySize();
		assert.strictEqual(sizeAfterFirst, 2);
	});

	test('handles persist without auto clear', async function() {
		this.timeout(5000);
		const sizeNow = await (playwright as any).getRegistrySize();
		assert.strictEqual(sizeNow, sizeAfterFirst, 'Registry size should persist when auto clear disabled');
		// Re-enable for any subsequent suites
		(playwright as any).enableAutoClearRegistry();
	});
});
