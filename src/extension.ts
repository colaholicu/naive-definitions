// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "naive-definitions" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('naive-definitions.goToDefinition', async () => {
		// The code you place here will be executed every time your command is executed

		// Get the active text editor
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			// Get the word within the selection
			// const selectedText = document.getText(editor.selection);
			// for testing purposes -> find the 1st occurrence of the the getConfig() function in the opengrok workspace
			const selectedText = "function getConfig()";
			if (selectedText.length === 0) {
				vscode.window.showInformationMessage("No text selected.");
				return;
			}

			// only work with workspaces
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders === undefined) {
				return;
			}

			// get the 1st occurrence within the current file
			const documentText = editor.document.getText();
			const indexOfSelectedText = documentText.indexOf(selectedText);
			if (indexOfSelectedText !== -1) {
				const position = editor.document.positionAt(indexOfSelectedText);
				// move cursor & reveal line
				editor.selection = new vscode.Selection(position, position);
				vscode.commands.executeCommand("revealLine", {
					lineNumber: position.line
				});
				return;
			}

			// find all .ts documents in src/ folders
			const documents = await vscode.workspace.findFiles('**/src/**/*.ts');
			if (!documents) {
				return;
			}

			// fire read job for each document
			let foundDefinition = false;
			documents.forEach(async uri => {
				const fileContents = await vscode.workspace.fs.readFile(uri);
				const documentText = fileContents?.toString();
				if (documentText.length && !foundDefinition) {
					const indexOfSelectedText = documentText.indexOf(selectedText);
					if (indexOfSelectedText === -1) {
						return;
					}

					// found our definition => open and show the document
					foundDefinition = true;
					const document = await vscode.workspace.openTextDocument(uri);
					await vscode.window.showTextDocument(document, { preview: false });

					// focus at the line & column
					const position = editor.document.positionAt(indexOfSelectedText);
					editor.selection = new vscode.Selection(position, position);
					vscode.commands.executeCommand("revealLine", {
						lineNumber: position.line
					});
				}
			});
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
