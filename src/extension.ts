// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Code4i } from './tools';
import { initializeSpooledFileBrowser } from './SpooledFileBrowser';
import { initializeSpooledFileSearchView } from './SpooledFileSearchResults';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	await Code4i.initialize();
		initializeSpooledFileBrowser(context);
		await initializeSpooledFileSearchView(context);
		console.log(`Congratulations, extension "vscode-ibmi-UserSpooledFiles" "Version" :"${context.extension.packageJSON.version}" is now active!`);
}

// this method is called when your extension is deactivated
export function deactivate() { }
