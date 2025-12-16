import { startVSCodeServer } from '@vscode/test-web/out/server/playwright';
import * as path from 'path';

async function main() {
	try {
		const serverInfo = await startVSCodeServer({
			extensionDevelopmentPath: path.resolve(__dirname, '../../../'),
			folderPath: path.resolve(__dirname, '../../../test-workspace'),
			printServerLog: true,
			port: 3000,
			host: 'localhost'
		});

		console.log(`VSCode server started at ${serverInfo.endpoint}`);

		// Keep process alive until terminated
		process.on('SIGTERM', () => {
			console.log('Shutting down server...');
			serverInfo.server.close();
			process.exit(0);
		});

		process.on('SIGINT', () => {
			console.log('Shutting down server...');
			serverInfo.server.close();
			process.exit(0);
		});
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
}

main();
