/* eslint-disable @typescript-eslint/naming-convention */
import { FocusOptions } from '@halcyontech/vscode-ibmi-types/';
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import vscode, { l10n, TextDocumentShowOptions } from 'vscode';
import { SplfFS } from "../src/filesystem/qsys/SplfFs";
import { IBMiContentSplf } from "./api/IBMiContentSplf";
import { Code4i, getInstance, makeid } from "./tools";
import { IBMiSpooledFile, SplfOpenOptions } from './typings';
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.addUserSpooledFileFilter`, async () => {
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
            vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.sortUserSpooledFileFilter`);
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
                  vscode.commands.executeCommand(`vscode-ibmi-splfbrowser.refreshSPLFBrowser`);
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
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileWithLineSpacing`, async (node, options?: SplfOpenOptions) => {
      options = {
        readonly: options?.readonly || node.protected || false,
        openMode: options?.openMode || "withSpaces",
        position: options?.position || undefined,
        fileExtension: options?.fileExtension || undefined, 
        saveToPath: options?.saveToPath || undefined,
        tempPath: options?.tempPath || false
      };
      return vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, options);
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.downloadSpooledFileDefault`, async (node, options: SplfOpenOptions) => {
      options = {
        readonly: options?.readonly || node.protected || false,
        openMode: options?.openMode || "withoutSpaces",
        position: options?.position || undefined,
        fileExtension: options?.fileExtension || undefined, 
        saveToPath: options?.saveToPath || undefined,
        tempPath: options?.tempPath || false
      };
      if (node) {
        if (!options?.fileExtension || options?.fileExtension === "") {
          options.fileExtension = await vscode.window.showInputBox({
            // prompt: `Type of file to create, SPLF, TXT, PDF`,
            prompt: l10n.t(`Type of file to create, SPLF, TXT, PDF`),
            value: `splf`
          });
        }
        else { }
        if (!options?.fileExtension) { return; }
        options.fileExtension = options.fileExtension.toLowerCase();
        options.pageLength = node.pageLength;
        options.openMode = (options.openMode || "withoutSpaces");
        let splfContent:string = ``;
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          // title: l10n.t(`Downloading spooled file content`),
        }, async progress => {
          progress.report({
            message: l10n.t(`Downloading spooled file contents`),
          });
          splfContent = await IBMiContentSplf.downloadSpooledFileContent(node.path, node.name, node.qualifiedJobName
            , node.number, options);
        });
        const tmpExt = path.extname(node.path);
        const fileName = path.basename(node.path, tmpExt);
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
        let localFileUri: vscode.Uri | undefined;
        if (!options.tempPath) {
          localFileUri = vscode.Uri.file( generateSequencedFileName( vscode.Uri.file( localFilePathBase ) ) );
        }
        else {
          localFileUri = vscode.Uri.file( localFilePathBase );
        }
        if (!options.saveToPath) {
          localFileUri = await vscode.window.showSaveDialog({ defaultUri: localFileUri });
        }
        else {
        }
        if (localFileUri) {
          let localPath = localFileUri.path;
          if (process.platform === `win32`) {
            //Issue with getFile not working propertly on Windows
            //when there was a / at the start.
            if (localPath[0] === `/`) { localPath = localPath.substring(1); }
          }
          try {
            let fileEncoding: BufferEncoding | null = `utf8`;
            switch (options.fileExtension) {
            case `pdf`:
              fileEncoding = null;
              break;
            default:
            }
            await writeFileAsync(localPath, splfContent, fileEncoding);
            if (!options.saveToPath) {
              vscode.window.showInformationMessage(l10n.t(`Spooled File was downloaded.`));
            }
          } catch (e: unknown) {
            if (e instanceof Error) {
              vscode.window.showErrorMessage(l10n.t(`Error downloading Spoooled File! {0}.`, e));
            }
          }
          return localFileUri;
        }

      } else {
        //Running from command pallet (F1).
      }
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithLineSpacing", async (node, options?: SplfOpenOptions) => {
      options = {
        readonly: options?.readonly || node.protected || false,
        openMode: options?.openMode || "withSpaces",
        position: options?.position || undefined,
        fileExtension: options?.fileExtension || `SPLF`,
        saveToPath: options?.saveToPath || os.tmpdir(),
        tempPath: true
      };
      node.pageLength = await IBMiContentSplf.getSpooledPageLength(node.user, node.name
        , node.qualifiedJobName, node.number
        , node.queue, node.queueLibrary);
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileWithLineSpacing", node, options)
        .then(async (localFileUri) => {
          try {
            await vscode.commands.executeCommand(`vscode.open`, localFileUri);
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
    }),
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfWithoutLineSpacing", async (node, options?: SplfOpenOptions) => {
      options = {
        readonly: options?.readonly || node.protected || false,
        openMode: options?.openMode || "withoutSpaces",
        position: options?.position || undefined,
        fileExtension: options?.fileExtension || `SPLF`,
        saveToPath: options?.saveToPath || os.tmpdir(),
        tempPath: true
      };
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, options)
        .then(async (localFileUri) => {
          try {
            if(options.position){
              await vscode.commands.executeCommand(`vscode.openWith`, localFileUri, `default`, { selection: options.position } as TextDocumentShowOptions);
            }
            else {
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
    vscode.commands.registerCommand("vscode-ibmi-splfbrowser.openSplfasPDF", async (node) => {
      let options: SplfOpenOptions = {};
      options = {
        readonly: options?.readonly || node.protected || false,
        openMode: "withSpaces",
        position: options?.position || undefined,
        fileExtension: `PDF`,
        saveToPath: os.tmpdir(),
        tempPath: true
      };
      vscode.commands.executeCommand("vscode-ibmi-splfbrowser.downloadSpooledFileDefault", node, options)
        .then(async (localFileUri) => {
          try {
            await vscode.commands.executeCommand(`vscode.open`, localFileUri);
            return true;
          } catch (e) {
            console.log(e);
            return false;
          }
        })
        ;
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
function generateSequencedFileName( uri: vscode.Uri ): string {
  const dir = path.dirname( uri.fsPath );
  const baseName = path.basename( uri.fsPath, path.extname( uri.fsPath ) );
  const extensionName = path.extname( uri.fsPath );

  let sequenceName = `${baseName}${extensionName}`;
  let sequence = 1;

  while ( fs.existsSync( path.join( dir, sequenceName ))) {
    sequenceName = `${baseName} (${sequence})${extensionName}`;
    sequence++;
  }
  return path.join( dir, sequenceName );
}