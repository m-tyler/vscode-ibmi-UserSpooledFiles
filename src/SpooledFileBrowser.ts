/* eslint-disable @typescript-eslint/naming-convention */
import { FocusOptions } from '@halcyontech/vscode-ibmi-types/';
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import sanitize from 'sanitize-filename';
import vscode, { l10n, TextDocumentShowOptions } from 'vscode';
import { SplfFS } from "../src/filesystem/qsys/SplfFs";
import { IBMiContentSplf } from "./api/IBMiContentSplf";
import { Code4i, mergeObjects, numberToWords, toTitleCase } from "./tools";
import { IBMISplfList, IBMiSpooledFile, SplfOpenOptions } from './typings';
import SPLFBrowser, { SpooledFileFilter, SpooledFiles } from './views/SplfsView';
import { TempFileManager } from './tools/tempFileManager';

const writeFileAsync = util.promisify(fs.writeFile);

const splfBrowserObj = new SPLFBrowser();
const splfBrowserViewer = vscode.window.createTreeView(
  `splfBrowser`, {
  treeDataProvider: splfBrowserObj,
  showCollapseAll: true,
  canSelectMany: true,
});
export function initializeSpooledFileBrowser(context: vscode.ExtensionContext, tempFileManager: TempFileManager) {
  context.subscriptions.push(
    splfBrowserViewer,
    vscode.workspace.registerFileSystemProvider(`spooledfile`, new SplfFS(context), {
      isCaseSensitive: false
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.sortSPLFSFilesByName`, (node: SpooledFileFilter | SpooledFiles) => {
      node.sortBy({ order: "name" });
      if (node.contextValue === `spooledfile`) {
        splfBrowserObj.refresh(node.parent);
      }
      else {
        splfBrowserObj.refresh(node);
      }
      splfBrowserViewer.reveal(node, { expand: true });
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.sortSPLFSFilesByDate`, (node) => {
      node.sortBy({ order: "date" });
      if (node.contextValue === `spooledfile`) {
        splfBrowserObj.refresh(node.parent);
      }
      else {
        splfBrowserObj.refresh(node);
      }
      splfBrowserViewer.reveal(node, { expand: true });
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, (node) => splfBrowserObj.refresh(node)),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.revealSPLFBrowser`, async (item: vscode.TreeItem, options?: FocusOptions) => {
      splfBrowserViewer.reveal(item, options);
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.addUserSpooledFileFilter`, async () => {
      const config = getConnection().getConfig();
      const myConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser');
      let mySpooledFileConfig = myConfig[`spooledFileFilters`] || [];
      let SpooledFileConfig = config[`SpooledFileConfig`] || [];

      const userInput = await vscode.window.showInputBox({
        title: l10n.t(`Add new spooled file filter for User`),
        prompt: l10n.t(`If no library given then assumed *LIBL.`),
        value: getConnection().currentUser,
        placeHolder: `Library/USERNAME`
      });

      try {
        if (userInput) {
          const newUserSplfs = userInput.trim().toUpperCase().toUpperCase().split(`/`);
          const i = newUserSplfs.length;
          // Split value
          const newEntry: IBMISplfList = { name: newUserSplfs[i - 1], library: i > 1 ? newUserSplfs[i - 1] : '*LIBL', type: 'USER' };

          if (!SpooledFileConfig.includes(newEntry)) {
            SpooledFileConfig.push(newEntry);
            config.SpooledFileConfig = SpooledFileConfig;
            Code4i.getInstance()!.setConfig(config);
          }

          if (!mySpooledFileConfig.includes(newEntry)) {
            mySpooledFileConfig.push(newEntry);
            myConfig.update('vscode-ibmi-splfbrowser', mySpooledFileConfig, vscode.ConfigurationTarget.Global);
          }
          vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.sortSpooledFileFilter`);
        }
      } catch (e) {
        console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.addOUTQSpooledFileFilter`, async () => {
      const connection = getConnection();
      const config = connection.getConfig();
      const myConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser');

      let mySpooledFileConfig = myConfig[`spooledFileFilters`] || [];
      let SpooledFileConfig = config[`SpooledFileConfig`] || [];

      const userInput = await vscode.window.showInputBox({
        title: l10n.t(`OUTQ to show Spooled Files`),
        prompt: l10n.t(`If no library given then assumed *LIBL.`),
        value: ``,
        placeHolder: `Library/OUTQ`
      });

      try {
        if (userInput) {
          let newOUTQ = userInput.trim().toUpperCase().toUpperCase().split(`/`);
          const i = newOUTQ.length;
          // Split value
          const newEntry: IBMISplfList = { name: newOUTQ[i - 1], library: i > 1 ? newOUTQ[i - 1] : '*LIBL', type: 'OUTQ' };

          if (!SpooledFileConfig.includes(newEntry)) {
            SpooledFileConfig.push(newEntry);
            config.SpooledFileConfig = SpooledFileConfig;
            Code4i.getInstance()!.setConfig(config);
          }
          if (!mySpooledFileConfig.includes(newEntry)) {
            mySpooledFileConfig.push(newEntry);
            myConfig.update('vscode-ibmi-splfbrowser', mySpooledFileConfig, vscode.ConfigurationTarget.Global);
          }
          vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.sortSpooledFileFilter`);
        }
      } catch (e) {
        // console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteSpooledFileFilter`, async (node) => {
      const config = getConfig();

      let removeItem: string | undefined;
      let SpooledFileConfig = config.SpooledFileConfig;

      if (node) {
        removeItem = node.path;
      } else {
        removeItem = await vscode.window.showQuickPick(SpooledFileConfig, {
          placeHolder: l10n.t('Select filter name to remove'),
        });
      }

      try {
        if (removeItem) {
          removeItem = removeItem.trim();
          let message = l10n.t(`Are you sure you want to delete the spooled file filter,'{0}'?`, removeItem);
          let detail = ``;
          vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`))
            .then(async result => {
              // let isPresent = false;
              if (result === l10n.t(`Yes`)) {
                if (SpooledFileConfig) {
                }
                const index = SpooledFileConfig.findIndex((f: IBMISplfList) => f.name === removeItem);
                if (index > -1) {
                  SpooledFileConfig.splice(index, 1);
                  config.SpooledFileConfig = SpooledFileConfig;
                  Code4i.getInstance()!.setConfig(config);
                  vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`);
                }
              }
            });
        }
      } catch (e) {
        // console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.sortSpooledFileFilter`, async (node) => {
      /** @type {ConnectionConfiguration.Parameters} */
      const config = Code4i.getConfig();
      let spooledFileConfig: IBMISplfList[] = config[`messageQueues`] || [];

      spooledFileConfig.sort(
        (filter1: IBMISplfList, filter2: IBMISplfList) => {
          const primarySort = filter1.library.toLowerCase().localeCompare(filter2.library.toLowerCase());

          // If the primary sort results in a difference (not equal)
          if (primarySort !== 0) {
            return primarySort;
          }

          // If the primary sort is equal (primarySort === 0), then sort by the second condition
          // Assuming 'priority' is a number, for descending order
          return filter1.name.toLowerCase().localeCompare(filter2.name.toLowerCase());
        }
      );
      try {

        Code4i.getInstance()!.setConfig(config);
        vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
      } catch (e) {
        console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteSpooledFile`, async (node: any, nodes?: any[]) => {
      // put single selection into array and just use array for further work
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (nodes && nodes.length > 0) {
        //Running from right click
        const pathString = nodes.map(node => node.path).join(', ');
        const message = l10n.t('Are you sure you want to delete the following spooled file(s) {0}?', pathString);
        const detail = undefined;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`Cancel`));

        if (result === `Yes`) {

          const connection = getConnection();
          let commands: string = '';
          try {
            for (let node of nodes) {
              commands += `DLTSPLF FILE(${node.name}) JOB(${node.jobNumber}/${node.jobUser}/${node.jobName}) SPLNBR(${node.number})\n`;
            }
            await connection.runCommand({
              command: commands
              , environment: `ile`
            });

            vscode.window.showInformationMessage(l10n.t(`Deleted {0}.`, pathString));

            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, nodes[0].parent);
            splfBrowserViewer.reveal(nodes[0].parent, { focus: true, select: true });
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting spooled file! {0}.`, e));
            }
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteNamedSpooledFiles`, async (node: any, nodes?: any[]) => {
      if (nodes && nodes.length > 0) {
        vscode.window.showWarningMessage(l10n.t(`'Delete like NAMED spooled files' is not valid for multiple selections. `));
        return;
      }
      if (node) {
        //Running from right click
        let deleteCount = 0;
        let message = l10n.t(`Are you sure you want to delete ALL spooled files named {0}?`, node.name);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {
          const connection = getConnection();
          const TempFileName = Code4i.makeid();
          const TempMbrName = Code4i.makeid();
          const asp = ``;
          const tempLib = Code4i.getTempLibrary();
          let objects: IBMiSpooledFile[] = [];

          if (result === `Yes`) {
            const treeFilter = {
              name: node.parent.name,
              library: node.parent.library,
              type: node.parent.type,
            } as IBMISplfList;
            objects = await IBMiContentSplf.getSpooledFileFilter(treeFilter, node.sort, node.name);
          }
          try {
            let commands = objects.map((o: any) => (
              `cl:DLTSPLF FILE(${o.name}) JOB(${o.qualifiedJobName}) SPLNBR(${o.number});`
            ));
            deleteCount = commands.length;
            let dltCmdSrc = commands.join(`\n`);
            await connection.runCommand({
              command: `CRTSRCPF FILE(${tempLib}/${TempFileName}) MBR(${TempMbrName}) RCDLEN(112)`
              , environment: `ile`
            });
            await Code4i.getContent().uploadMemberContent(tempLib, TempFileName, TempMbrName, dltCmdSrc);
            let dltCommands = `SBMJOB CMD(RUNSQLSTM SRCFILE(${tempLib}/${TempFileName}) SRCMBR(${TempMbrName}) COMMIT(*NC) MARGINS(*SRCFILE) OPTION(*NOLIST)) JOB(DLTSPLFS) JOBQ(QUSRNOMAX) MSGQ(*NONE)`
              ;
            await connection.runCommand({
              command: dltCommands
              , environment: `ile`
            });

          }
          catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting named spooled file! {0}.`, e));
            }
          }
          if (deleteCount > 0) {
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
            vscode.window.showInformationMessage(l10n.t(`Deleted {0} spooled files.`, deleteCount));
            await connection.runCommand({
              command: `DLTF FILE(${tempLib}/${TempFileName}) `
              , environment: `ile`
            });
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
            splfBrowserViewer.reveal(node.parent, { focus: true, select: true });
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteFilteredSpooledFiles`, async (node: any, nodes?: any[]) => {
      if (nodes && nodes.length > 0) {
        vscode.window.showWarningMessage(l10n.t(`'Delete like FILTERED spooled files' is not valid for multiple selections. `));
        return;
      }
      if (node) {
        //Running from right click
        let deleteCount = 0;
        let message = l10n.t(`Are you sure you want to delete ALL spooled files filtered by value {1}?`, node.name, node.parent.filter);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {
          const connection = getConnection();
          const content = getContent();
          const TempFileName = Code4i.makeid();
          const TempMbrName = Code4i.makeid();
          const asp = ``;
          const tempLib = Code4i.getTempLibrary();
          let objects: IBMiSpooledFile[] = [];

          if (result === `Yes`) {
            const treeFilter = {
              name: node.parent.name,
              library: node.parent.library,
              type: node.parent.type,
            } as IBMISplfList;
            objects = await IBMiContentSplf.getSpooledFileFilter(treeFilter, node.sort, undefined, node.parent.filter);
          }
          try {
            let commands = objects.map((o: any) => (
              `cl:DLTSPLF FILE(${o.name}) JOB(${o.qualifiedJobName}) SPLNBR(${o.number});`
            ));
            deleteCount = commands.length;
            let dltCmdSrc = commands.join(`\n`);
            await connection.runCommand({
              command: `CRTSRCPF FILE(${tempLib}/${TempFileName}) MBR(${TempMbrName}) RCDLEN(112)`
              , environment: `ile`
            });
            await Code4i.getContent().uploadMemberContent(tempLib, TempFileName, TempMbrName, dltCmdSrc);
            let dltCommands = `SBMJOB CMD(RUNSQLSTM SRCFILE(${tempLib}/${TempFileName}) SRCMBR(${TempMbrName}) COMMIT(*NC) MARGINS(*SRCFILE) OPTION(*NOLIST)) JOB(DLTSPLFS) JOBQ(QUSRNOMAX) MSGQ(*NONE)`
              ;
            await connection.runCommand({
              command: dltCommands
              , environment: `ile`
            });

          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting Filtered spooled files! {0}.`, e));
            }
          }
          if (deleteCount > 0) {
            node.parent.setFilter(``);
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
            vscode.window.showInformationMessage(l10n.t(`Deleted {0} spooled files.`, deleteCount));
            await connection.runCommand({
              command: `DLTF FILE(${tempLib}/${TempFileName}) `
              , environment: `ile`
            });
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
            splfBrowserViewer.reveal(node.parent, { focus: true, select: true });
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteAllSpooledFiles`, async (node, nodes?: any[]) => {
      if (nodes && nodes.length > 0) {
        vscode.window.showWarningMessage(l10n.t(`'Delete all spooled files' is not valid for multiple selections. `));
        return;
      }
      if (node) {
        if (node.type === 'OUTQ') {
          vscode.window.showWarningMessage(l10n.t(`'Delete all spooled files' is not valid for OUTQs.`));
          return;
        }
        //Running from right click
        let message = l10n.t(`Are you sure you want to delete _ALL_ spooled files for {0}?`, node.name);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {

          const connection = getConnection();

          try {
            await connection.runCommand({
              command: `DLTSPLF FILE(*SELECT) SELECT(*CURRENT)`
              , environment: `ile`
            });

            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting ALL spooled file! {0}.`, e));
            }
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.moveSpooledFile`, async (node, nodes?: any[]) => {
      // put single selection into array and just use array for further work
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (nodes && nodes.length > 0) {
        //Running from right click

        const newQueue = await vscode.window.showInputBox({
          // prompt: `Name of new OUTQ`,
          prompt: l10n.t(`Name of new OUTQ`),
          value: node.queue
        });

        if (newQueue) {
          const connection = getConnection();
          let commands: string = '';
          try {
            for (let node of nodes) {
              commands += `CHGSPLFA FILE(${node.name}) JOB(${node.qualifiedJobName}) SPLNBR(${node.number}) OUTQ(${newQueue})\n`;
            }
            await connection.runCommand({
              command: commands
              , environment: `ile`
            });
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, nodes[0].parent);
            splfBrowserViewer.reveal(nodes[0].parent, { focus: true, select: true });

          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error moving spooled file! {0}.`, e));
            }
          }
        }

      } else {
        //Running from command
        // console.log(this);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.filterSpooledFiles`, async (node) => {
      let searchName: any;
      let searchTerm: any;
      if (node) {
        searchName = node.name;
      }

      if (!searchName) { return; }

      searchTerm = await vscode.window.showInputBox({
        // prompt: `Filter ${searchUser}'s spooled files. Delete value to clear filter.`,
        prompt: l10n.t(`Filter {0}'s spooled files. Delete value to clear filter.`, searchName),
        value: `${node.contextValue === `spooledfile` ? node.parent.filter : node.filter}`
      });

      if (searchTerm) {
        try {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: l10n.t(`Filtering list of spooled files`),
          }, async progress => {
            progress.report({
              // message: `Filtering spooled files for ${searchUser}, using these words, ${searchTerm} spooled files.`
              message: l10n.t(`Filtering spooled files for {0}, using these words, {1} spooled files.`, searchName, searchTerm),
            });
            searchTerm = searchTerm.toLocaleUpperCase();
            const splfnum = await IBMiContentSplf.getFilterSpooledFileCount({ name: searchName, library: node.library, type: node.type } as IBMISplfList);
            if (Number(splfnum.numberOf) > 0) {
              if (node.contextValue === `spooledfile`) {
                node.parent.setFilter(searchTerm);
                node.parent.clearToolTip();
                vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
              } else {
                node.setFilter(searchTerm);
                node.clearToolTip();
                vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
              }
            } else {
              vscode.window.showErrorMessage(l10n.t(`No spooled files to filter.`));
            }
          });

        } catch (e) {
          console.log(e);
          vscode.window.showErrorMessage(l10n.t(`Error filtering spooled files.`));
        }
      }
      else {
        node.setFilter('');
        vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`);
      }

    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileWithLineSpacing`, async (node: SpooledFiles, nodes?: SpooledFiles[], options?: SplfOpenOptions) => {
      nodes = nodes || [];
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      options = {
        openMode: options?.openMode || "withSpaces",
        tempPath: options?.tempPath || false
      } as SplfOpenOptions;
      return vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, nodes, options);
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileDefault`, async (node: SpooledFiles, nodes?: SpooledFiles[], options?: SplfOpenOptions) => {
      // put single selection into array and just use array for further work
      if (node && (!nodes || nodes.length === 0)) {
        nodes = [];
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      const globalOptions = {
        readonly: options?.readonly || nodes[0].protected || false,
        openMode: options?.openMode || "withoutSpaces",
        tempPath: options?.tempPath || false,
      } as SplfOpenOptions;
      options = options || {} as SplfOpenOptions;
      options = mergeObjects(options, globalOptions);
      // // if (node) {
      if (!options?.fileExtension || options?.fileExtension === "") {
        options.fileExtension = await vscode.window.showInputBox({
          // prompt: `Type of file to create, SPLF, TXT, PDF`,
          prompt: l10n.t(`Type of file to create, SPLF, TXT, PDF`),
          value: `splf`
        });
      }
      else { }
      if (!options?.fileExtension) { return; }
      let defaultFileExtension = options.fileExtension.toLowerCase();
      let splfContent: string = ``;
      let localFileUri: vscode.Uri | undefined;
      let localFileUris: vscode.Uri[] = [];
      const newNodes = await IBMiContentSplf.updateNodeSpooledFileDeviceType(nodes);
      let fileSaveNumber = 0;
      for (let node of newNodes) {
        if (node.deviceType === '*AFPDS') {options.fileExtension = 'pdf';} else {options.fileExtension = defaultFileExtension;}
        if (node.deviceType === '*USERASCII') {
          vscode.window.showWarningMessage(l10n.t(`Spooled File {0} in {1} is not eligible for operation.`, node.name, node.queue));
          continue;
        }
        const tmpExt = path.extname(node.path);
        const fileName = sanitize(path.basename(node.path, tmpExt));
        let localFilePathBase: string = '';
        if (!options.saveToPath) {
          if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length !== 1) {
            localFilePathBase = os.homedir() + `\\` + fileName + `.` + options.fileExtension;
          }
          else {
            localFilePathBase = vscode.workspace.workspaceFolders[0].uri.fsPath + `\\` + fileName + `.` + options.fileExtension;
          }
        } else {
          localFilePathBase = options.saveToPath + `\\` + fileName + `.` + options.fileExtension;
        }
        if (!options.tempPath) {
          localFileUri = vscode.Uri.file(generateSequencedFileName(vscode.Uri.file(localFilePathBase)));
        }
        else {
          localFileUri = vscode.Uri.file(localFilePathBase);
        }
        if (!options.saveToPath) {
          localFileUri = await vscode.window.showSaveDialog({ defaultUri: localFileUri });
        }
        else {
        }
        if (localFileUri) {
          fileSaveNumber++;
          let localFilePath = localFileUri.path;
          options.saveToPath = path.dirname(localFilePath);
          if (process.platform === `win32`) {
            //Issue with getFile not working propertly on Windows
            //when there was a / at the start.
            if (localFilePath[0] === `/`) { localFilePath = localFilePath.substring(1); }
          }
          try {
            let fileEncoding: BufferEncoding | null = `utf8`;
            switch (options.fileExtension) {
            case `pdf`:
              fileEncoding = null;
              break;
            default:
            }
            await vscode.window.withProgress({
              location: vscode.ProgressLocation.Window,
              // title: l10n.t(`Downloading spooled file content`),
            }, async progress => {
              progress.report({
                message: l10n.t(`Downloading spooled file contents (${fileSaveNumber})`),
              });
              const openOptions = mergeObjects(options, node.openQueryparms);
              splfContent = await IBMiContentSplf.downloadSpooledFileContent(node.resourceUri?.path || '', openOptions);
            });
            await writeFileAsync(localFilePath, splfContent, fileEncoding);
            tempFileManager.registerTempFile(localFilePath);
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error downloading Spoooled File! {0}.`, e));
            }
          }
          localFileUris.push(localFileUri);
        }
      }

      // } else {
      //   //Running from command pallet (F1).
      // }
      if (!options.tempPath) {
        let msg = '';
        // Temp paths are used for just opening spooled reports.  So assume its a downloaded file.
        if (localFileUris.length > 0 && newNodes.length > 0) {
          if (localFileUris.length === 1) {
            msg = path.basename(localFileUris[0].path);
            vscode.window.showInformationMessage(l10n.t(`${msg} spooled file(s) downloaded.`));
          } else {  
            msg = toTitleCase(numberToWords(localFileUris.length));
            vscode.window.showInformationMessage(l10n.t(`${msg} spooled file(s) downloaded.`));
          }
        } else
          if (localFileUris.length > 0 && newNodes.length > 0 && localFileUris.length !== newNodes.length) {
            const not = newNodes.length - localFileUris.length;
            msg = toTitleCase(numberToWords(localFileUris.length));
            vscode.window.showInformationMessage(l10n.t(`${msg} spooled file(s) downloaded. But there were ${numberToWords(not)} that did not.`));
          } else
            if (localFileUris.length === 0) {
              vscode.window.showInformationMessage(l10n.t(`No spooled file(s) downloaded.`));
            }
      }
      return localFileUris;
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithLineSpacing", async (node: SpooledFiles, nodes?: SpooledFiles[], options?: SplfOpenOptions) => {
      nodes = nodes || [];
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      options = {
        openMode: options?.openMode || "withSpaces",
        fileExtension: options?.fileExtension || `SPLF`,
        saveToPath: options?.saveToPath || os.tmpdir(),
        tempPath: true,
      } as SplfOpenOptions;
      nodes = await IBMiContentSplf.updateNodeSpooledFilePageSize(nodes);
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, nodes, options)
        .then(async (localFileUris) => {
          try {
            for (let localFileUri of localFileUris as vscode.Uri[]) {
              await vscode.commands.executeCommand(`vscode.open`, localFileUri);
            }
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithDefault", async (node: SpooledFiles, nodes?: SpooledFiles[], options?: SplfOpenOptions) => {
      nodes = nodes || [];
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      options = {
        openMode: options?.openMode || "withSpaces",
        fileExtension: options?.fileExtension || `SPLF`,
        saveToPath: options?.saveToPath || os.tmpdir(),
        tempPath: true,
      } as SplfOpenOptions;
      nodes = await IBMiContentSplf.updateNodeSpooledFilePageSize(nodes);
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, nodes, options)
        .then(async (localFileUris) => {
          try {
            for (let localFileUri of localFileUris as vscode.Uri[]) {
              await vscode.commands.executeCommand(`vscode.open`, localFileUri);
            }
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithoutLineSpacing", async (node: SpooledFiles, nodes?: SpooledFiles[], options?: SplfOpenOptions) => {
      nodes = nodes || [];
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      options = {
        openMode: options?.openMode || "withoutSpaces",
        fileExtension: options?.fileExtension || `SPLF`,
        saveToPath: options?.saveToPath || os.tmpdir(),
        tempPath: true,
      } as SplfOpenOptions;
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, nodes, options)
        .then(async (localFileUris) => {
          try {
            for (let localFileUri of localFileUris as vscode.Uri[]) {
              if (options.position) {
                await vscode.commands.executeCommand(`vscode.openWith`, localFileUri, `default`, { selection: options.position } as TextDocumentShowOptions);
              }
              else {
                await vscode.commands.executeCommand(`vscode.open`, localFileUri);
              }
            }
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfasPDF", async (node: SpooledFiles, nodes?: SpooledFiles[]) => {
      nodes = nodes || [];
      if (node && nodes && nodes.length === 0) {
        nodes.push(node);
      }
      if (!nodes || nodes.length === 0) { return; }
      // let options: SplfOpenOptions = {};
      const options = {
        openMode: "withSpaces",
        fileExtension: `PDF`,
        saveToPath: os.tmpdir(),
        tempPath: true
      } as SplfOpenOptions;
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, nodes, options)
        .then(async (localFileUris) => {
          try {
            for (let localFileUri of localFileUris as vscode.Uri[]) {
              await vscode.commands.executeCommand(`vscode.open`, localFileUri);
            }
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
    })
  );
  Code4i.getInstance().subscribe(context, `connected`, "Refresh spooled file browser", run_on_connection);
  Code4i.getInstance().subscribe(context, `disconnected`, "clear spooled file browser", run_on_disconnection);
}

function getConfig() {
  const config = Code4i.getConfig();
  if (config) {
    return config;
  }
  else {
    throw new Error(l10n.t('Not connected to an IBM i'));
  }
}

function getConnection() {
  const connection = Code4i.getConnection();
  if (connection) {
    return connection;
  }
  else {
    throw new Error(l10n.t('Not connected to an IBM i'));
  }
}

function getContent() {
  const content = Code4i.getContent();
  if (content) {
    return content;
  }
  else {
    throw new Error(l10n.t('Not connected to an IBM i'));
  }
}
function run_on_connection() {
  const config = getConfig();
  let oldFilterConfig: string[] = config[`usersSpooledFile`];
  if (oldFilterConfig) {
    try {
      // look for old format style config and reformat into IBMISplfList object type
      // if (!oldFilterConfig) { return; }
      let SpooledFileConfig: IBMISplfList[] = [];
      // first time there shouldnt be any but better not destroy them if there happen to be some. 
      if (config[`SpooledFileConfig`]) {
        SpooledFileConfig = config[`SpooledFileConfig`];
      }
      oldFilterConfig.forEach(filter => {
        const item = filter.trim().toUpperCase().toUpperCase().split(`/`);
        const i = item.length;
        const newEntry: IBMISplfList = { name: item[i - 1], library: i > 1 ? item[i - 1] : '*LIBL', type: 'USER' };
        let isPresent = false;
        if (SpooledFileConfig) {
          isPresent = SpooledFileConfig.some(obj => obj.library === newEntry.library && obj.name === newEntry.name && obj.type === newEntry.type);
        }
        if (!isPresent) {
          SpooledFileConfig.push(newEntry);
          config.SpooledFileConfig = SpooledFileConfig;
          Code4i.getInstance()!.setConfig(config);
        }
        // Drop old config
        const inx = oldFilterConfig.indexOf(filter);
        if (inx >= 0) {
          oldFilterConfig.splice(inx, 1);
          config.usersSpooledFile = oldFilterConfig;
          Code4i.getInstance()!.setConfig(config);
        }
      });
      delete config[`usersSpooledFile`];
      Code4i.getInstance()!.setConfig(config);
      // const code4iConfig = vscode.workspace.getConfiguration('code-for-ibmi.connectionSettings');
      // const oldSettingValue = code4iConfig.get('usersSpooledFile');
      // code4iConfig.upate('usersSpooledFile', undefined, vscode.ConfigurationTarget.Global);
    } catch (e: any) {
      console.log(e);
      vscode.window.showErrorMessage(e.message);
    }
  }
}
function run_on_disconnection() {
  vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`);
}
function generateSequencedFileName(uri: vscode.Uri): string {
  const dir = path.dirname(uri.fsPath);
  const baseName = path.basename(uri.fsPath, path.extname(uri.fsPath));
  const extensionName = path.extname(uri.fsPath);

  let sequenceName = `${baseName}${extensionName}`;
  let sequence = 1;

  while (fs.existsSync(path.join(dir, sequenceName))) {
    sequenceName = `${baseName} (${sequence})${extensionName}`;
    sequence++;
  }
  return path.join(dir, sequenceName);
}