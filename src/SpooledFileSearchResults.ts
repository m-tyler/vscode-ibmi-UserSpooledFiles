import vscode, { l10n, } from 'vscode';
import { IBMiContentSplf } from "./api/IBMiContentSplf";
import { SplfSearch } from './api/spooledFileSearch';
import { Code4i, checkSystemFunctionState } from "./tools";
import { SplfSearchView } from './views/SplfsSearchView';
import { IBMiSplfCounts } from './typings';

interface SearchParms {
  item: any,
  library: any,
  type: any,
  splfName: any,
  term: any,
  word: any,
};


let splfSearchViewProvider = <SplfSearchView>{};
export async function initializeSpooledFileSearchView(context: vscode.ExtensionContext) {
  splfSearchViewProvider = new SplfSearchView(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.searchSpooledFiles`, async (node) => {
      let search = <SearchParms>{};
      //Initiate search from Spooled file item
      if (node && (/^spooledfile/.test(node.contextValue))) {
        search.item = node.parent.name; // USER or OUTQ name
        search.library = node.parent.library; // USER or OUTQ library
        search.type = node.parent.type; // USER or OUTQ 
        search.splfName = node.name;
        search.word = node.parent.filter;
      }
      else if (node && (/^splflist/.test(node.contextValue))) {
        search.item = node.name; // USER or OUTQ name
        search.library = node.library; // USER or OUTQ library
        search.type = node.type; // USER or OUTQ 
      }
      if (!search.item) {
        const config = getConfig();
        // TODO: how do I ask for type of input, like whether its a user or OUTQ??
        search.item = await vscode.window.showInputBox({
          value: config.currentLibrary,
          prompt: l10n.t(`If no library given then assumed *LIBL.`),
          title: l10n.t(`Search User or OUTQ spooled files`),
        });
        const splitUp = search.item.split('/');
        if (splitUp.Length === 2) {
          search.library = splitUp[0];
          search.item = splitUp[0];
        } else {
          search.item = splitUp[0];
        }
        if (await IBMiContentSplf.getFilterDescription(search.item, search.library)/* find if a user profile */) {
          search.item = `USER`;
        }
        else if (await IBMiContentSplf.getFilterDescription(search.item, search.library, '*OUTQ') /* is this an OUTQ?? */) {
          search.item = `OUTQ`;
        }
      }
      // const nodesChildren = node.getChildren(node);
      if (!search.splfName) {
        search.splfName = await vscode.window.showInputBox({
          placeHolder: `*ALL`,
          value: ``,
          prompt: l10n.t(`Enter spooled file name to search over, or blank for *ALL`),
          title: l10n.t(`Search in named spooled file`),
        });
      }

      if (!search.splfName && search.splfName !== ``) { return; }

      if (search.splfName !== ``) {
        search.term = await vscode.window.showInputBox({
          prompt: l10n.t(`Search for string in spooled files named {0}`, search.splfName)
        });
      } else {
        search.term = await vscode.window.showInputBox({
          prompt: l10n.t(`Search for string in *ALL spooled files`)
        });
      }

      if (search.term) {
        try {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: l10n.t(`Searching`),
          }, async progress => {
            progress.report({
              message: l10n.t(`'{0}' in {1}, {2} spooled files.`, search.term, search.item, search.splfName)
            });
            let splf: IBMiSplfCounts;
            splf = await IBMiContentSplf.getFilterSpooledFileCount(search.item, search.library, search.type, search.term);
            if (Number(splf.numberOf) > 0) {
              // NOTE: if more messages are added, lower the timeout interval
              const timeoutInternal = 9000;
              const searchMessages = [
                l10n.t(`'{0}' in {1} spooled files.`, search.term, search.splfName),
                l10n.t(`This is taking a while because there are {0} spooled files with a total page count of {1}. Searching '{2}' in {3} still.`, splf.numberOf, splf.totalPages, search.term, search.item),
                l10n.t(`What's so special about '{0}' anyway?`, search.term),
                l10n.t(`Still searching '{0}' in {1}...`, search.term, search.item),
                l10n.t(`Wow. This really is taking a while. Let's hope you get the result you want.`),
                l10n.t(`Did you know that I'm searching through {0} pages of spooled file data?  This might take a little bit.`, splf.totalPages),
                l10n.t(`How does one end up with {0} spooled files.  Ever heard of cleaning up?`, splf.numberOf),
                l10n.t(`'{0}' in {1}.`, search.term, search.item),
              ];
              let currentMessage = 0;
              const messageTimeout = setInterval(() => {
                if (currentMessage < searchMessages.length) {
                  progress.report({
                    message: searchMessages[currentMessage]
                  });
                  currentMessage++;
                } else {
                  clearInterval(messageTimeout);
                }
              }, timeoutInternal);

              let results = await SplfSearch.searchSpooledFiles(search.term, {name:search.item, library:search.library, type:search.type}, search.splfName, search.word);
              if (results.length > 0) {
                results.forEach(result => {
                  // if (objectNamesLower === true) {
                  //   result.path = result.path.toLowerCase();
                  // }
                  result.label = result.path;
                });
                results = results.sort((a, b) => {
                  return a.path.localeCompare(b.path);
                });
                setSearchResultsSplf(`searchUserSpooledFiles`, search.term, results);
                // setSearchResults(search.term, results.sort((a, b) => a.path.localeCompare(b.path)));

              } else {
                vscode.window.showInformationMessage(l10n.t(`No results found searching for '{0}' in {1}.`, search.term, search.splfName));
              }
            } else {
              vscode.window.showErrorMessage(l10n.t(`No spooled files to search.`));
            }
          });

        } catch (e) {
          console.log(e);
          vscode.window.showErrorMessage(l10n.t(`Error searching spooled files.`));
        }
      }

    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.dropUpdatedSPOOLED_FILE_DATA_TF`, async () => {
      await checkSystemFunctionState('SPOOLED_FILE_DATA', 'drop');
    }),
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.createUpdatedSPOOLED_FILE_DATA_TF`, async (node) => {
      let message = l10n.t(`Are you having troubles searching through spooled files?`);
      let detail = ``;
      vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`))
        .then(async result => {
          if (result === l10n.t(`Yes`)) {
            let message = l10n.t(`Do you want to install a varient of function SYSTOOLS.SPOOOLED_FILE_DATA into ILEDITOR?`);
            vscode.window.showWarningMessage(message, { modal: true, detail }, l10n.t(`Yes`), l10n.t(`No`))
              .then(async result => {
                if (result === l10n.t(`Yes`)) {
                  await checkSystemFunctionState('SPOOLED_FILE_DATA', 'add');
                }
              });
          }
        });
    }),
    vscode.window.registerTreeDataProvider(`UserSplfSearchView`, splfSearchViewProvider),
  );
  Code4i.getInstance()?.subscribe(context, `connected`, "Get temporary library", runOnConnection);
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
export function setSearchResultsSplf(actionCommand: string, term: string, results: SplfSearch.Result[]) {
  splfSearchViewProvider.setResults(actionCommand, term, results);
}

async function runOnConnection(): Promise<void> {
  const library = Code4i.getTempLibrary();
}