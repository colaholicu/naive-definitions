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
			// only work with workspaces
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders === undefined) {
				return;
			}

			// Get the word within the selection
			const selectedText = editor.document.getText(editor.selection);
			if (selectedText.length === 0) {
				vscode.window.showInformationMessage("No text selected.");
				return;
			}

			// searchText is the processed symbol based on the selection (very naive)
			let searchText = "";
			if (selectedText.indexOf("C_") === 0) {
				// condition
				searchText = "anim.Condition(\"" + selectedText;
			} else {
				// the rest is be treated as a state task
				searchText = "StateTaskType(\"" + selectedText;
			}

			// get the 1st occurrence within the current file
			const documentText = editor.document.getText();
			const indexOfSearchText = documentText.indexOf(searchText);
			if (indexOfSearchText !== -1) {
				const position = editor.document.positionAt(indexOfSearchText);
				// move cursor & reveal line
				editor.selection = new vscode.Selection(position, position);
				vscode.commands.executeCommand("revealLine", {
					lineNumber: position.line
				});
				return;
			}

			// find all .ts documents in src/ folders
			const documents = await vscode.workspace.findFiles('**/*.py', '**/*.al');
			if (!documents) {
				return;
			}

			// fire read job for each document
			let foundDefinition = false;
			documents.forEach(async uri => {
				const fileContents = await vscode.workspace.fs.readFile(uri);
				const documentText = fileContents?.toString();
				if (documentText.length && !foundDefinition) {
					const indexOfSearchText = documentText.indexOf(searchText);
					if (indexOfSearchText === -1) {
						return;
					}

					// found our definition => open and show the document
					foundDefinition = true;
					const document = await vscode.workspace.openTextDocument(uri);
					await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });

					// focus at the line & column
					const position = document.positionAt(indexOfSearchText);					
					if (vscode.window.activeTextEditor) {
						vscode.window.activeTextEditor.selection = new vscode.Selection(position.line, 0, position.line, document.lineAt(position.line).text.length);
						vscode.commands.executeCommand("revealLine", {
							lineNumber: position.line,
							at: "center",
							revealCursor: true
						});
					}
				}
			});
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
