import * as vscode from 'vscode';
import { Scrubber } from './scrubber';

export enum SearchStatus {
	setup,
	idle,
	matching,
	found,
	notFound,
}

export class Searcher {
	selectedText: string = "";
	potentialDefinition: string = ""; // will be continually replaced until a match is found or none
	searchFiles: vscode.Uri[] = [];
	searchStatus = SearchStatus.setup;
	useScrubData = true;
	scrubber: Scrubber;

	foundMatch = false;
	definitions: string[] = vscode.workspace.getConfiguration("naive-definitions-vscode").definitions;
	fileTypes: string = vscode.workspace.getConfiguration("naive-definitions-vscode").fileTypes;
	generalMatcher: string = vscode.workspace.getConfiguration("naive-definitions-vscode").generalMatcher;
	triedDefinitions: string[] = [];
	filesSearched = 0;
	triedCurrentFile = false;

	constructor(selectedText: string, scrubber: any) {
		this.selectedText = selectedText;
		this.scrubber = scrubber;
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
					let scrubDataForSymbol = this.scrubber.getDefinitionForSymbol(this.selectedText);
					if (scrubDataForSymbol) {
						let containingFile = scrubDataForSymbol[0].file;
						let currentDocument = vscode.window.activeTextEditor!.document;
						if (containingFile === currentDocument.uri) {
							this.moveToIndexInDocument(currentDocument, scrubDataForSymbol[0].location);
							this.setStatus(SearchStatus.found);
						}
						else {
							// prioritize current file
							for (let i = 0; i < scrubDataForSymbol.length; i++) {
								if (scrubDataForSymbol[i].file.path === currentDocument.uri.path) {
									containingFile = scrubDataForSymbol[i].file;

									this.moveToIndexInDocument(currentDocument, scrubDataForSymbol[i].location);
									this.setStatus(SearchStatus.found);
									return;
								}
							}

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

	getIndexOfPotentialDefinition(documentText: string) {
		const matchedLocation = documentText.match(this.potentialDefinition);
		if (matchedLocation && matchedLocation.index !== undefined) {
			return matchedLocation.index;
		}

		return -1;
	}

	moveToIndexInDocument(document: vscode.TextDocument, index: number) {
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