/* eslint-disable @typescript-eslint/naming-convention */
import { FocusOptions } from '@halcyontech/vscode-ibmi-types/';
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import vscode, { l10n, } from 'vscode';
import { SplfFS, getUriFromPath_Splf, parseFSOptions } from "../src/filesystem/qsys/SplfFs";
import { IBMiContentSplf } from "./api/IBMiContentSplf";
import { Code4i, findExistingDocumentUri, getInstance, makeid } from "./tools";
import { IBMiSpooledFile, SplfDefaultOpenMode, SplfOpenOptions } from './typings';
import SPLFBrowser, { SpooledFileUser, UserSpooledFiles } from './views/userSplfsView';

const writeFileAsync = util.promisify(fs.writeFile);

export function initializeSpooledFileBrowser(context: vscode.ExtensionContext) {
  const splfBrowserObj = new SPLFBrowser(context);
  const splfBrowserViewer = vscode.window.createTreeView(
    `splfBrowser`, {
    treeDataProvider: splfBrowserObj,
    showCollapseAll: true,
    canSelectMany: true,
  });
  context.subscriptions.push(
    splfBrowserViewer,
    vscode.workspace.registerFileSystemProvider(`spooledfile`, new SplfFS(context), {
      isCaseSensitive: false
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.sortSPLFSFilesByName`, (node: SpooledFileUser | UserSpooledFiles) => {
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.addUserSpooledFileFilter`, async (node) => {
      const config = getConfig();
      const connection = getConnection();

      let newUserSplfs;

      let usersSpooledFile = config[`usersSpooledFile`] || [];;
      if (config.usersSpooledFile) {
        usersSpooledFile = config.usersSpooledFile;
      }

      newUserSplfs = await vscode.window.showInputBox({
        prompt: l10n.t(`User to show Spooled Files`),
        value: connection.currentUser
      });

      try {
        if (newUserSplfs) {
          newUserSplfs = newUserSplfs.trim().toUpperCase().toUpperCase();

          if (!usersSpooledFile.includes(newUserSplfs)) {
            usersSpooledFile.push(newUserSplfs);
            config.usersSpooledFile = usersSpooledFile;
            getInstance()!.setConfig(config);
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.sortUserSpooledFileFilter`, node);
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
          }
        }
      } catch (e) {
        // console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteUserSpooledFileFilter`, async (node) => {
      const config = getConfig();

      let removeUser: string | undefined;
      let usersSpooledFile = config.usersSpooledFile;

      if (node) {
        removeUser = node.path;
      } else {
        removeUser = await vscode.window.showQuickPick(usersSpooledFile, {
          placeHolder: l10n.t('Select filter name to remove'),
        });
      }

      try {
        if (removeUser) {
          removeUser = removeUser.trim();
          let message = l10n.t(`Are you sure you want to delete the user spooled file filter,'{0}'?`, removeUser);
          let detail = ``;
          vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`))
            .then(async result => {
              if (result === l10n.t(`Yes`)) {
                const inx = usersSpooledFile.indexOf(removeUser);

                if (inx >= 0) {
                  usersSpooledFile.splice(inx, 1);
                  config.usersSpooledFile = usersSpooledFile;
                  getInstance()!.setConfig(config);
                  vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
                  // splfBrowserObj.refresh( node );
                }
              }
            });
        }
      } catch (e) {
        // console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.sortUserSpooledFileFilter`, async (node) => {
      /** @type {ConnectionConfiguration.Parameters} */
      const config = getConfig();

      let usersSpooledFile = config.usersSpooledFile;

      try {

        usersSpooledFile.sort(function (a: string, b: string): number {
          let x = a.toLowerCase();
          let y = b.toLowerCase();
          if (x < y) { return -1; }
          if (x > y) { return 1; }
          return 0;
        });
        config.usersSpooledFile = usersSpooledFile;
        getInstance()!.setConfig(config);
        vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
        // splfBrowserObj.refresh();
      } catch (e) {
        // console.log(e);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteSpooledFile`, async (node) => {
      if (node) {
        const config = getConfig();
        //Running from right click

        const message = l10n.t('Are you sure you want to delete {0}?', node.path);
        const detail = undefined;
        // let result = await vscode.window.showWarningMessage(l10n.t(`Are you sure you want to delete spooled file {0}?`, node.path), l10n.t(`Yes`), l10n.t(`Cancel`));
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`Cancel`));

        if (result === `Yes`) {

          const connection = getConnection();

          try {
            await connection.runCommand({
              command: `DLTSPLF FILE(${node.name}) JOB(${node.jobNumber}/${node.jobUser}/${node.jobName}) SPLNBR(${node.number})`
              , environment: `ile`
            });

            vscode.window.showInformationMessage(l10n.t(`Deleted {0}.`, node.path));

            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting user spooled file! {0}.`, e));
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteNamedSpooledFiles`, async (node) => {
      if (node) {
        //Running from right click
        let deleteCount = 0;
        let message = l10n.t(`Are you sure you want to delete ALL spooled files named {0}?`, node.name);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {
          const connection = getConnection();
          const content = getContent();
          const TempFileName = makeid();
          const TempMbrName = makeid();
          const asp = ``;
          const tempLib = Code4i.getTempLibrary();
          let objects: IBMiSpooledFile[] = [];

          if (result === `Yes`) {
            objects = await IBMiContentSplf.getUserSpooledFileFilter(node.user, node.sort, node.name);
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
            await content.uploadMemberContent(asp, tempLib, TempFileName, TempMbrName, dltCmdSrc);
            let dltCommands = `SBMJOB CMD(RUNSQLSTM SRCFILE(${tempLib}/${TempFileName}) SRCMBR(${TempMbrName}) COMMIT(*NC) MARGINS(*SRCFILE) OPTION(*NOLIST)) JOB(DLTSPLFS) JOBQ(QUSRNOMAX) MSGQ(*NONE)`
              ;
            const commandResult = await connection.runCommand({
              command: dltCommands
              , environment: `ile`
            });
            if (commandResult) {
              // vscode.window.showInformationMessage(` ${commandResult.stdout}.`);
              if (commandResult.code === 0 || commandResult.code === null) {
              } else {
              }
            }

          }
          catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting user spooled file! {0}.`, e));
            }
          }
          if (deleteCount > 0) {
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
            vscode.window.showInformationMessage(l10n.t(`Deleted {0} spooled files.`, deleteCount));
            await connection.runCommand({
              command: `DLTF FILE(${tempLib}/${TempFileName}) `
              , environment: `ile`
            });
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteFilteredSpooledFiles`, async (node) => {
      if (node) {
        //Running from right click
        let deleteCount = 0;
        let message = l10n.t(`Are you sure you want to delete ALL spooled files filtered by value {1}?`, node.name, node.parent.filter);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {
          const connection = getConnection();
          const content = getContent();
          const TempFileName = makeid();
          const TempMbrName = makeid();
          const asp = ``;
          const tempLib = Code4i.getTempLibrary();
          let objects: IBMiSpooledFile[] = [];

          if (result === `Yes`) {
            objects = await IBMiContentSplf.getUserSpooledFileFilter(node.user, node.sort, undefined, node.parent.filter);
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
            await content.uploadMemberContent(asp, tempLib, TempFileName, TempMbrName, dltCmdSrc);
            let dltCommands = `SBMJOB CMD(RUNSQLSTM SRCFILE(${tempLib}/${TempFileName}) SRCMBR(${TempMbrName}) COMMIT(*NC) MARGINS(*SRCFILE) OPTION(*NOLIST)) JOB(DLTSPLFS) JOBQ(QUSRNOMAX) MSGQ(*NONE)`
              ;
            const commandResult = await connection.runCommand({
              command: dltCommands
              , environment: `ile`
            });
            if (commandResult) {
              // vscode.window.showInformationMessage(` ${commandResult.stdout}.`);
              if (commandResult.code === 0 || commandResult.code === null) {
              } else {
              }
            }

          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting user spooled file! {0}.`, e));
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
          }

        }
        else {
          vscode.window.showInformationMessage(l10n.t('Deletion canceled.'));
        }
      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.deleteUserSpooledFiles`, async (node) => {
      if (node) {
        //Running from right click
        let message = l10n.t(`Are you sure you want to delete ALL spooled files for user {0}?`, node.user);
        let detail = ``;
        let result = await vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`));

        if (result === `Yes`) {

          const connection = getConnection();

          try {
            const commandResult = await connection.runCommand({
              command: `DLTSPLF FILE(*SELECT) SELECT(*CURRENT)`
              , environment: `ile`
            });
            if (commandResult) {
              // vscode.window.showInformationMessage(` ${commandResult.stdout}.`);
              if (commandResult.code === 0 || commandResult.code === null) {
              } else {
              }
            }

            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node);
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error deleting user spooled file! {0}.`, e));
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.moveSpooledFile`, async (node) => {
      if (node) {
        //Running from right click

        const newQueue = await vscode.window.showInputBox({
          // prompt: `Name of new OUTQ`,
          prompt: l10n.t(`Name of new OUTQ`),
          value: node.queue
        });

        if (newQueue) {
          const connection = getConnection();

          try {
            await connection.runCommand({
              command: `CHGSPLFA FILE(${node.name}) JOB(${node.qualifiedJobName}) SPLNBR(${node.number}) OUTQ(${newQueue})`
              , environment: `ile`
            });
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);

          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error moving user spooled file! {0}.`, e));
            }
          }
        }

      } else {
        //Running from command
        // console.log(this);
      }
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.filterSpooledFiles`, async (node) => {
      const content = getContent();

      let searchUser: any;
      let searchTerm: any;
      if (node) {
        searchUser = node.user;
      }

      if (!searchUser) { return; }

      searchTerm = await vscode.window.showInputBox({
        // prompt: `Filter ${searchUser}'s spooled files. Delete value to clear filter.`,
        prompt: l10n.t(`Filter {0}'s spooled files. Delete value to clear filter.`, searchUser),
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
              message: l10n.t(`Filtering spooled files for {0}, using these words, {1} spooled files.`, searchUser, searchTerm),
            });
            searchTerm = searchTerm.toLocaleUpperCase();
            const splfnum = await IBMiContentSplf.getUserSpooledFileCount(searchUser);
            if (Number(splfnum) > 0) {
              if (node.contextValue === `spooledfile`) {
                node.parent.setFilter(searchTerm);
                vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`, node.parent);
              } else {
                node.setFilter(searchTerm);
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileWithLineSpacing`, async (node) => {
      return vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, "withSpace" as SplfDefaultOpenMode);
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileDefault`, async (node, overrideMode?: SplfDefaultOpenMode) => {
      const config = getConfig();
      const contentApi = getContent();
      const connection = getConnection();
      const client = connection.client;

      if (node) {
        let fileExtension = await vscode.window.showInputBox({
          // prompt: `Type of file to create, TXT, PDF`,
          prompt: l10n.t(`Type of file to create, TXT, PDF`),
          value: `TXT`
        });
        if (!fileExtension) { return; }
        fileExtension = fileExtension.toLowerCase();
        switch (fileExtension) {
          case `pdf`:
          // case `html`:
          case `txt`:
            fileExtension.toLowerCase();
            break;
          default:
            fileExtension = `txt`;
        }
        let options: SplfOpenOptions = {};
        options.pageLength = node.pageLength;
        options.openMode = (overrideMode || "withoutSpaces");

        const splfContent = await IBMiContentSplf.downloadSpooledFileContent(node.path, node.name, node.qualifiedJobName
          , node.number, fileExtension, options);
        const tmpExt = path.extname(node.path);
        const fileName = path.basename(node.path, tmpExt);
        // let localFilePathBase = os.homedir() +`\\` +extraFolder +`\\` +fileName +`.`+fileExtension; //FUTURE: in case we let user pick another download loc
        let localFilePathBase = os.homedir() + `\\` + fileName + `.` + fileExtension;
        const localFile = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(localFilePathBase) });
        // console.log();
        if (localFile) {
          let localPath = localFile.path;
          if (process.platform === `win32`) {
            //Issue with getFile not working propertly on Windows
            //when there was a / at the start.
            if (localPath[0] === `/`) { localPath = localPath.substring(1); }
          }
          try {
            let fileEncoding: BufferEncoding | null = `utf8`;
            switch (fileExtension.toLowerCase()) {
              case `pdf`:
                fileEncoding = null;
                break;
              default:
            }
            await writeFileAsync(localPath, splfContent, fileEncoding);
            vscode.window.showInformationMessage(l10n.t(`Spooled File was downloaded.`));
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error downloading Spoooled File! {0}.`, e));
            }
          }
        }

      } else {
        //Running from command.
      }
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithLineSpacing", async (node) => {
      return vscode.commands.executeCommand("vscode-ibmi-splfbrowser.openSpooledFile", node, "withSpace" as SplfDefaultOpenMode);
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithoutLineSpacing", async (node) => {
      return vscode.commands.executeCommand("vscode-ibmi-splfbrowser.openSpooledFile", node, "withoutSpace" as SplfDefaultOpenMode);
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSpooledFile", async (item, overrideMode?: SplfDefaultOpenMode) => {
      let options: SplfOpenOptions = {};
      options.openMode = (overrideMode || "withoutSpaces");
      options.readonly = item.parent.protected;
      const uri = getUriFromPath_Splf(item.path, options);
      const existingUri = findExistingDocumentUri(uri);

      if (existingUri) {
        const existingOptions = parseFSOptions(existingUri);
        if (existingOptions.readonly !== options.readonly) {
          vscode.window.showWarningMessage(`The file is already opened in another mode.`);
          vscode.window.showTextDocument(existingUri);
          return false;
        }
      }

      try {
        await vscode.commands.executeCommand(`vscode.open`, uri);
        return true;
      } catch (e) {
        console.log(e);
        return false;
      }

    })

  );
  getInstance()?.subscribe(context, `connected`, "Refresh spooled file browser", run_on_connection);
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
async function run_on_connection(): Promise<void> {
  // Promise.all([vscode.commands.executeCommand("code-for-ibmi.refreshSPLFBrowser")
  // ]);
}