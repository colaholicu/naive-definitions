import * as vscode from 'vscode';
import { TextEncoder } from 'util';

export type Definition = {
	file: vscode.Uri;
	location: number;
};

export enum ScrubStatus {
	setup,
	idle,
	scrubbing,
	done,
	dump,
	complete,
}

export class Scrubber {
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

    getDefinitionForSymbol(symbol: string) {
        return this.definitionsMap.get(symbol);
    }

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