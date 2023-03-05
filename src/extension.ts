// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { Searcher, SearchStatus } from "./searcher";
import { Scrubber, ScrubStatus, Definition } from "./scrubber";

let gScrubber = new Scrubber();

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {				

	// create a new status bar item that we can now manage
	let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	let animatedstatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	animatedstatusBarItem.text = "$(sync~spin)";
	context.subscriptions.push(animatedstatusBarItem);
	context.subscriptions.push(statusBarItem);

	gScrubber.setStatusBarItem(statusBarItem, animatedstatusBarItem);
	gScrubber.scrub();

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

			let searcher = new Searcher(selectedText, gScrubber);
			searcher.search();
		}
	});
	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
		// for now only trigger when scrubbing was complete, might have some desync data, but it's fine
		if (gScrubber.scrubStatus === ScrubStatus.complete) {
			gScrubber.setStatus(ScrubStatus.setup);
		}
	}));
}

// this method is called when your extension is deactivated
export function deactivate() { }