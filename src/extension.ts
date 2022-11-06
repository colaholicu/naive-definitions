// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

enum SearchStatus {
	setup,
	idle,
	matching,
	found,
	notFound,
}

class Searcher {
	searchText: string = "";
	potentialDefinition: string = ""; // will be continually replaced until a match is found or none
	searchFiles: vscode.Uri[] = [];
	searchStatus = SearchStatus.setup;

	foundMatch = false;
	definitions = vscode.workspace.getConfiguration("naive-definitions").definitionMappings;
	triedDefinitions: string[] = [];
	triedExactMatch = false;
	triedEquality = false; // TBD
	filesSearched = 0;

	constructor(searchText: string) {
		this.searchText = searchText;
	}

	setStatus(status: SearchStatus) {
		this.searchStatus = status;
		if (status === SearchStatus.found) {
			return;
		}

		if (status !== SearchStatus.notFound) {
			this.search();
		}
		else {
			vscode.window.showInformationMessage("No definition found selected.");
		}
	}

	async search() {
		switch (this.searchStatus) {
			case SearchStatus.setup:
				await this.setupFileFilter();
				break;

			case SearchStatus.idle:
				if (this.triedExactMatch) {
					// tried all definitions -> try equality ops, otherwise -> not found
					if (this.triedDefinitions.length === this.definitions.length) {
						if (this.triedEquality) {
							this.setStatus(SearchStatus.notFound);
						}
						else {
							this.potentialDefinition = "= \"" + this.searchText;
							this.triedEquality = true;
							this.setStatus(SearchStatus.matching);
						}
						break;
					}

					// try one more definition
					for (let mapping of this.definitions) {
						let found = false;
						for (let triedDefinition of this.triedDefinitions) {
							if (triedDefinition === mapping.definition) {
								found = true;
								break;
							}
						}
						if (!found) {
							this.potentialDefinition = mapping.definition + this.searchText;
							this.triedDefinitions.push(mapping.definition);
							this.setStatus(SearchStatus.matching);
							break;
						}
					}
				}
				else {
					// try exact match first
					for (let mapping of this.definitions) {
						if (this.searchText.indexOf(mapping.prefix) === 0) {
							this.potentialDefinition = mapping.definition + this.searchText;
							this.triedExactMatch = true;
							this.triedDefinitions.push(mapping.definition);
							this.setStatus(SearchStatus.matching);
							break;
						}
					}

					// didn't find any matches -> go through all
					if (!this.triedExactMatch) {
						this.triedExactMatch = true;
						this.setStatus(SearchStatus.idle);
					}
				}
				break;

			case SearchStatus.matching:
				this.filesSearched = 0;
				if (this.tryLocalSearch()) {
					this.setStatus(SearchStatus.found);
				}

				this.tryWorkspaceSearch();
				break;
		}
	}

	tryLocalSearch() {
		if (!vscode.window.activeTextEditor) {
			return false;
		}

		// get the 1st occurrence within the current file
		const documentText = vscode.window.activeTextEditor.document.getText();
		const indexOfPotentialDefinition = documentText.indexOf(this.potentialDefinition);
		if (indexOfPotentialDefinition !== -1) {
			const position = vscode.window.activeTextEditor.document.positionAt(indexOfPotentialDefinition);
			// move cursor & reveal line
			vscode.window.activeTextEditor.selection = new vscode.Selection(position.line, 0, position.line, vscode.window.activeTextEditor.document.lineAt(position.line).text.length);
			vscode.commands.executeCommand("revealLine", {
				lineNumber: position.line,
				at: "center",
				revealCursor: true
			});
			return true;
		}

		return false;
	}

	tryWorkspaceSearch() {
		this.searchFiles.forEach(async uri => {
			const fileContents = await vscode.workspace.fs.readFile(uri);
			const documentText = fileContents?.toString();

			if (documentText.length && this.searchStatus !== SearchStatus.found) {
				const indexOfSearchText = documentText.indexOf(this.potentialDefinition);
				if (indexOfSearchText === -1) {
					this.filesSearched++;
					// tried all files, nothing found --> try another definition
					if (this.filesSearched === this.searchFiles.length) {
						this.setStatus(SearchStatus.idle);
					}
					return;
				}

				// found our definition => open and show the document				
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

					// found our file
					this.setStatus(SearchStatus.found);
				}
				else {
					// an error occurred 
					this.setStatus(SearchStatus.notFound);
				}
			}
		});
	}

	async setupFileFilter() {
		// only for debugging
		this.definitions = [{ prefix: "C_", definition: "anim.Condition(\"" }, { prefix: "macarena", definition: "CACA" }];
		// only for debugging

		this.searchFiles = await vscode.workspace.findFiles('**/*.{py,al}');
		if (!this.searchFiles) {
			return;
		}

		this.setStatus(SearchStatus.idle);
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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

			let searcher = new Searcher(selectedText);
			searcher.search();
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }