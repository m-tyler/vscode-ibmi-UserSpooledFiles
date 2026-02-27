// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Code4i } from './tools';
import { initializeSpooledFileBrowser } from './SpooledFileBrowser';
import { initializeSpooledFileSearchView } from './SpooledFileSearchResults';
import { TempFileManager } from './tools/tempFileManager';

let tempFileManager: TempFileManager;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	tempFileManager = new TempFileManager();
	await Code4i.initialize(context);
	initializeSpooledFileBrowser(context, tempFileManager);
	await initializeSpooledFileSearchView(context);
	// console.log(`Congratulations, extension "${context.extension.packageJSON.description}", "Version" :"${context.extension.packageJSON.version}" is now active!`);
	const item = { title: 'Upgrade now' };
	const result = await vscode.window.showWarningMessage("This extension is deprecated. Transition to [IBM i Queue Objects Viewer](https://marketplace.visualstudio.com/items?itemName=m-tyler.vscode-ibmi-queues)! Upgrade now for the latest features.", item);
	if (result === item) {
		// await vscode.commands.executeCommand('workbench.extensions.installExtension', 'newPublisher.newExtensionName');
		// await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', 'oldPublisher.oldExtensionName');
		// vscode.commands.executeCommand("workbench.action.reloadWindow");
	}
	let disposable = vscode.commands.registerCommand('extension.showLinkMessage', async () => {
		const option = await vscode.window.showWarningMessage(
			'Important: This extension is deprecated. Transition to [IBM i Queue Objects Viewer](https://marketplace.visualstudio.com/items?itemName=m-tyler.vscode-ibmi-queues)! Upgrade now for the latest features.',
			'Open Docs' // Button Text
		);

		if (option === 'Open Docs') {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://https://marketplace.visualstudio.com/'));
		}
	});

}

// this method is called when your extension is deactivated
export function deactivate() {
	// Clean up temporary files when the extension deactivates
	if (tempFileManager) {
		tempFileManager.cleanUpTempFiles();
	}
}
