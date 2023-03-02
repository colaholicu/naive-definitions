// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { json } from 'stream/consumers';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';

type Definition = {
	symbol: string;
	file: string;
	location: number;
};

enum SearchStatus {
	setup,
	idle,
	matching,
	found,
	notFound,
}

class Searcher {
	selectedText: string = "";
	potentialDefinition: string = ""; // will be continually replaced until a match is found or none
	searchFiles: vscode.Uri[] = [];
	searchStatus = SearchStatus.setup;

	foundMatch = false;
	definitions:string[] = vscode.workspace.getConfiguration("naive-definitions").definitions;
	fileTypes: string = vscode.workspace.getConfiguration("naive-definitions").fileTypes;
	generalMatcher: string = vscode.workspace.getConfiguration("naive-definitions").generalMatcher;
	triedDefinitions: string[] = [];
	filesSearched = 0;
	triedCurrentFile = false;


	constructor(selectedText: string) {
		this.selectedText = selectedText;
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
			vscode.window.showInformationMessage("No definition found.");
		}
	}

	async search() {
		switch (this.searchStatus) {
			case SearchStatus.setup:
				await this.setupFileFilter();
				break;

			case SearchStatus.idle:
				// tried all definitions -> not found
				if (this.triedDefinitions.length === this.definitions.length) {
					this.setStatus(SearchStatus.notFound);
				}

				// try one more definition
				for (let definition of this.definitions) {
					let found = false;
					for (let triedDefinition of this.triedDefinitions) {
						if (triedDefinition === definition) {
							found = true;
							break;
						}
					}
					if (!found) {
						// if this current definition is a regex (maybe different from the general one) -> has priority
						const regexToken = "${regex}=";
						const definitionToken = "${DEFINITION}";
						const selectedTextToken = "${SELECTED_TEXT}";
						if (definition.indexOf(regexToken) >= 0) {
							this.potentialDefinition = definition.replace(regexToken, "");

							if (definition.indexOf(definitionToken) !== -1) {
								vscode.window.showInformationMessage("Invalid token ${DEFINITION} found in definition " + definition + ". Ignoring!");
								this.triedDefinitions.push(definition);
								continue;
							}

							// the selected text token isn't present -> just append it
							if (this.potentialDefinition.indexOf(selectedTextToken) === -1) {
								this.potentialDefinition += this.selectedText;
							}
							// the selected text token is present -> replace it
							else {
								this.potentialDefinition = this.potentialDefinition.replace(selectedTextToken, this.selectedText);
							}
						}
						// current definition wasn't a regex, but we have a regex expression that's a general matching rule -> replace tokens
						else if (this.generalMatcher.length > 0) {
							this.potentialDefinition = this.generalMatcher;
							this.potentialDefinition = this.potentialDefinition.replace(definitionToken, definition);
							this.potentialDefinition = this.potentialDefinition.replace(selectedTextToken, this.selectedText);
						}
						// no general matching rule, just append selected text to the definition
						else {
							this.potentialDefinition = definition + this.selectedText;
						}

						this.triedDefinitions.push(definition);
						this.setStatus(SearchStatus.matching);
						break;
					}
				}
				break;

			case SearchStatus.matching:
				this.filesSearched = 0;
				// first try all definition inside the current file
				if (!this.triedCurrentFile) {
					if (!this.tryLocalSearch()) {
						// reset and prepare for search in the whole workspace
						if (this.triedDefinitions.length === this.definitions.length) {
							this.triedDefinitions.length = 0;
							this.triedCurrentFile = true;
						}
					}
					// found it -> don't try finding again
					else {
						return;
					}
				}

				// tried all the definitions in the current file -> check the workspace
				if (this.triedCurrentFile) {
					this.tryWorkspaceSearch();
					return;
				}

				// try another definition
				this.setStatus(SearchStatus.idle);
				break;
		}
	}

	getIndexOfPotentialDefinition(documentText : string)
	{
		const matchedLocation = documentText.match(this.potentialDefinition);
		if (matchedLocation && matchedLocation.index !== undefined) {
			return matchedLocation.index;
		}
		
		return -1;
	}

	moveToIndexInDocument(document : vscode.TextDocument, index : number) {
		if (!vscode.window.activeTextEditor) {
			return false;
		}

		const position = document.positionAt(index);
		// move cursor & reveal line
		vscode.window.activeTextEditor.selection = new vscode.Selection(position.line, 0, position.line, document.lineAt(position.line).text.length);
		vscode.commands.executeCommand("revealLine", {
			lineNumber: position.line,
			at: "center",
			revealCursor: true
		});
	}

	tryLocalSearch() {
		if (!vscode.window.activeTextEditor) {
			return false;
		}

		const document = vscode.window.activeTextEditor.document;
		// get the 1st occurrence within the current file
		const indexOfPotentialDefinition = this.getIndexOfPotentialDefinition(document.getText());
		if (indexOfPotentialDefinition !== -1) {
			this.moveToIndexInDocument(document, indexOfPotentialDefinition);
			this.setStatus(SearchStatus.found);
			return true;
		}

		return false;
	}

	tryWorkspaceSearch() {
		this.searchFiles.forEach(async uri => {
			if (this.searchStatus === SearchStatus.found) {
				return;
			}
			
			const fileContents = await vscode.workspace.fs.readFile(uri);
			const indexOfPotentialDefinition = this.getIndexOfPotentialDefinition(fileContents?.toString());
			if (indexOfPotentialDefinition === -1) {
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
			this.moveToIndexInDocument(document, indexOfPotentialDefinition);
			// update found status
			this.setStatus(SearchStatus.found);
		});
	}

	async setupFileFilter() {
		this.searchFiles = await vscode.workspace.findFiles(this.fileTypes);
		if (!this.searchFiles) {
			return;
		}

		this.setStatus(SearchStatus.idle);
	}
}

enum ScrubStatus {
	setup,
	idle,
	scrubbing,
	done,
	complete,
}

class Scrubber {
	selectedText: string = "";
	potentialDefinition: string = "";
	scrubFiles: vscode.Uri[] = [];
	scrubStatus = ScrubStatus.setup;
	definitionsMap = new Map<string, Definition[]>();
	scrubbedFiles = new Map<string, string[]>();

	definitions:string[] = vscode.workspace.getConfiguration("naive-definitions").definitions;
	fileTypes: string = vscode.workspace.getConfiguration("naive-definitions").fileTypes;
	generalMatcher: string = vscode.workspace.getConfiguration("naive-definitions").generalMatcher;
	triedDefinitions: string[] = [];
	filesScrubbed = 0;

	setStatus(status: ScrubStatus) {
		this.scrubStatus = status;

		this.scrub();
	}

	async scrub() {
		switch (this.scrubStatus) {
			case ScrubStatus.setup:
				await this.setupFileFilter();
				break;

			case ScrubStatus.idle:
				this.scrubWorkspace();
				break;

			case ScrubStatus.scrubbing:
				break;

			case ScrubStatus.done:
				let uint8Array = new TextEncoder().encode("iosif");
				vscode.workspace.fs.writeFile(vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "./.naive/def"), uint8Array);
				break;
		}
	}

	scrubWorkspace() {
		// tried all definitions -> we're done
		if (this.triedDefinitions.length === this.definitions.length) {
			this.setStatus(ScrubStatus.done);
		}

		// try one more definition
		for (let definition of this.definitions) {
			let found = false;
			for (let triedDefinition of this.triedDefinitions) {
				if (triedDefinition === definition) {
					found = true;
					break;
				}
			}
			if (!found) {
				this.triedDefinitions.push(definition);
				break;
			}
		}

		let definition = this.triedDefinitions.at(this.triedDefinitions.length - 1);
		if (definition) {
			// if this current definition is a regex (maybe different from the general one) -> has priority
			const regexToken = "${regex}=";
			const definitionToken = "${DEFINITION}";
			const selectedTextToken = "${SELECTED_TEXT}";
			if (definition.indexOf(regexToken) >= 0) {
				this.potentialDefinition = definition.replace(regexToken, "");

				if (definition.indexOf(definitionToken) !== -1) {
					vscode.window.showInformationMessage("Invalid token ${DEFINITION} found in definition " + definition + ". Ignoring!");
					this.setStatus(ScrubStatus.idle);
				}

				// the selected text token isn't present -> just append it
				if (this.potentialDefinition.indexOf(selectedTextToken) === -1) {
					this.potentialDefinition += this.selectedText;
				}
				// the selected text token is present -> replace it
				else {
					this.potentialDefinition = this.potentialDefinition.replace(selectedTextToken, this.selectedText);
				}
			}
			// current definition wasn't a regex, but we have a regex expression that's a general matching rule -> replace tokens
			else if (this.generalMatcher.length > 0) {
				this.potentialDefinition = this.generalMatcher;
				this.potentialDefinition = this.potentialDefinition.replace(definitionToken, definition);
				this.potentialDefinition = this.potentialDefinition.replace(selectedTextToken, this.selectedText);
			}
			// no general matching rule, just append selected text to the definition
			else {
				this.potentialDefinition = definition;
			}
		}

		
		this.scrubFiles.forEach(async uri => {			
			const fileContents = await vscode.workspace.fs.readFile(uri);
			if (fileContents) {
				const regexp = new RegExp("(" + this.potentialDefinition + ")(\\W*)(\\w*)", "g");
                const matches = fileContents.toString().matchAll(regexp);
                for (const match of matches) {
					const symbol = match[3].toString();
					if (!this.definitionsMap.has(symbol)) {
						this.definitionsMap.set(symbol, []);

					}
					
					this.definitionsMap.get(symbol)!.push({ file : uri.toString(), location : match.index!, symbol: ''});
                }
                this.filesScrubbed++;
				// tried all files --> try another definition
				if (this.filesScrubbed === this.scrubFiles.length) {
					this.setStatus(ScrubStatus.done);
					return;
				}
			}
		});

		this.setStatus(ScrubStatus.scrubbing);
	}

	async setupFileFilter() {
		this.scrubFiles = await vscode.workspace.findFiles(this.fileTypes);
		if (!this.scrubFiles) {
			return;
		}

		this.setStatus(ScrubStatus.idle);
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

	let scrubber = new Scrubber();
	scrubber.scrub();
}

// this method is called when your extension is deactivated
export function deactivate() { }