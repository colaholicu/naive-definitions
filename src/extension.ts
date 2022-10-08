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
	let disposable = vscode.commands.registerCommand('naive-definitions.goToDefinition', () => {
		// The code you place here will be executed every time your command is executed
		
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			const document = editor.document;
			const selection = editor.selection;

			// Get the word within the selection
			const selectedText = document.getText(selection);
			if (selectedText.length === 0) {
				vscode.window.showInformationMessage("No text selected.");
				return;
			}
			
			// get the 1st occurrence within the current file
			const documentText = document.getText();
			const indexOfSelectedText = documentText.indexOf(selectedText);
			const position = editor.document.positionAt(indexOfSelectedText);

			// move cursor & reveal line
			editor.selection = new vscode.Selection(position, position);
			vscode.commands.executeCommand("revealLine", {
				lineNumber: position.line
			});			
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
