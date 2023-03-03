// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { json } from 'stream/consumers';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';

type Definition = {
	file: vscode.Uri;
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
	useScrubData = true;

	foundMatch = false;
	definitions:string[] = vscode.workspace.getConfiguration("naive-definitions").definitions;
	fileTypes: string = vscode.workspace.getConfiguration("naive-definitions").fileTypes;
	generalMatcher: string = vscode.workspace.getConfiguration("naive-definitions").generalMatcher;
	triedDefinitions: string[] = [];
	filesSearched = 0;
	triedCurrentFile = false;


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

				if (this.useScrubData) {
					// check scrub data
					let scrubDataForSymbol = gScrubber.definitionsMap.get(this.selectedText);
					if (scrubDataForSymbol) {
						let currentDocument = vscode.window.activeTextEditor!.document;
						let containingFile = scrubDataForSymbol[0].file;
						if (containingFile === currentDocument.uri) {
							this.moveToIndexInDocument(currentDocument, scrubDataForSymbol[0].location);
							this.setStatus(SearchStatus.found);
						}
						else {
							// found our definition => open and show the document				
							const document = await vscode.workspace.openTextDocument(containingFile);
							await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });

							// focus at the line & column
							this.moveToIndexInDocument(document, scrubDataForSymbol[0].location);
							// update found status
							this.setStatus(SearchStatus.found);
						}
						
						return;
					}
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
	dump,
	complete,
}

class Scrubber {
	selectedText: string = "";
	potentialDefinition: string = "";
	scrubFiles: vscode.Uri[] = [];
	scrubStatus = ScrubStatus.setup;
	definitionsMap = new Map<string, Definition[]>();

	definitions:string[] = vscode.workspace.getConfiguration("naive-definitions").definitions;
	fileTypes: string = vscode.workspace.getConfiguration("naive-definitions").fileTypes;
	generalMatcher: string = vscode.workspace.getConfiguration("naive-definitions").generalMatcher;
	triedDefinitions: string[] = [];
	filesScrubbed = 0;

	maximumScrubs = 0;
	currentScrubs = 0;

	statusBarItem : vscode.StatusBarItem | undefined;
	animatedStatusBarItem : vscode.StatusBarItem | undefined;

	updateScrubProgress() {
		if ((this.maximumScrubs <= 0) || !this.statusBarItem) {
			return;
		}

		const progress = (this.currentScrubs / this.maximumScrubs * 100).toFixed(0);
		this.statusBarItem.text = "[Naive] Updating scrub data (" + progress + "%)";
	}

	setStatusBarItem(statusBarItem : vscode.StatusBarItem, animatedStatusBarItem : vscode.StatusBarItem) {
		this.statusBarItem = statusBarItem;
		this.animatedStatusBarItem = animatedStatusBarItem;
	}

	setStatus(status: ScrubStatus) {
		this.scrubStatus = status;

		if (this.scrubStatus === ScrubStatus.complete) {
			this.statusBarItem?.hide();
			this.animatedStatusBarItem?.hide();
			return;			
		}

		this.scrub();
	}

	async scrub() {
		switch (this.scrubStatus) {
			case ScrubStatus.setup:
				this.currentScrubs = 0;
				this.statusBarItem?.show();
				this.animatedStatusBarItem?.show();
				this.updateScrubProgress();
				await this.setupFileFilter();
				break;

			case ScrubStatus.idle:
				this.definitionsMap.clear();
				this.triedDefinitions.length = 0;
			case ScrubStatus.done:
				this.filesScrubbed = 0;
				this.scrubWorkspace();
				break;

			case ScrubStatus.dump:
				let uint8Array = new TextEncoder().encode("iosif");
				vscode.workspace.fs.writeFile(vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "./.naive/def"), uint8Array);				
				this.setStatus(ScrubStatus.complete);
				break;
		}
	}

	scrubWorkspace() {
		// tried all definitions -> we're done
		if (this.triedDefinitions.length === this.definitions.length) {
			this.setStatus(ScrubStatus.done);
		if (this.triedDefinitions.length === this.definitions.length) {			
			this.setStatus(ScrubStatus.complete);
			return;
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
				this.potentialDefinition = this.potentialDefinition.replace(selectedTextToken, "");
			}
			// no general matching rule, just append selected text to the definition
			else {
				this.potentialDefinition = definition;
			}
		}

		
		this.scrubFiles.forEach(async uri => {
			this.currentScrubs++;
			this.updateScrubProgress();
			const fileContents = await vscode.workspace.fs.readFile(uri);
			if (fileContents) {
				const regexp = new RegExp("(" + this.potentialDefinition + ")(\\W*)(\\w*)", "g");
                const matches = fileContents.toString().matchAll(regexp);
                for (const match of matches) {
					const symbol = match[3].toString();
					if (!this.definitionsMap.has(symbol)) {
						this.definitionsMap.set(symbol, []);

					}
					
					this.definitionsMap.get(symbol)!.push({ file : uri, location : match.index! });
                }
                this.filesScrubbed++;
				// tried all files --> try another definition
				if (this.filesScrubbed >= this.scrubFiles.length) {
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

		this.maximumScrubs = this.scrubFiles.length * this.definitions.length;

		this.setStatus(ScrubStatus.idle);
	}
}

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

			let searcher = new Searcher(selectedText);
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