// imports mocha for the browser, defining the `mocha` global.
require('mocha/mocha');

interface RequireContext {
	keys(): string[];
	(id: string): unknown;
}

interface WebpackRequire {
	context(path: string, deep?: boolean, filter?: RegExp): RequireContext;
}

export function run(): Promise<void> {

	return new Promise((c, e) => {
		mocha.setup({
			ui: 'tdd',
			reporter: undefined
		});

		// bundles all files in the current directory matching `*.test`
		const importAll = (r: RequireContext) => r.keys().forEach(r);
		importAll((require as unknown as WebpackRequire).context('.', true, /\.test$/));

		try {
			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}
