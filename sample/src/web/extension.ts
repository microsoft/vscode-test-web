// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-test-web-sample" is now active in the web extension host!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vscode-test-web-sample.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from vscode-test-web-sample in a web extension host!');
	});

	context.subscriptions.push(disposable);

	let findFilesDisposable = vscode.commands.registerCommand('vscode-test-web-sample.findFiles', () => {
		vscode.window.showInputBox({ title: 'Enter a pattern', placeHolder: '**/*.md' })
			.then((pattern) => {
				return pattern ? vscode.workspace.findFiles(pattern) : undefined;
			})
			.then((results) => {
				if (!results) {
					return vscode.window.showErrorMessage('Find files returned undefined');
				}
				let summary = `Found:\n${results.map(uri => `  - ${uri.path}`).join('\n')}`;
				return vscode.window.showInformationMessage(summary);
			});
	});

	context.subscriptions.push(findFilesDisposable);

}

// this method is called when your extension is deactivated
export function deactivate() { }
