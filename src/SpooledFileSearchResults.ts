import vscode, { l10n, } from 'vscode';
import { Code4i, getInstance } from "./tools";
import { UserSplfSearch } from './api/spooledFileSearch';
import { UserSplfSearchView } from './views/userSplfsSearchView';
import { IBMiContentSplf } from "./api/IBMiContentSplf";
// import setSearchResults from "@halcyontech/vscode-ibmi-types/instantiate";

interface SearchParms {
  user: any,
  name: any,
  term: any,
  word: any,
};


let userSplfSearchViewProvider = <UserSplfSearchView>{};
export async function initializeSpooledFileSearchView(context: vscode.ExtensionContext) {
  userSplfSearchViewProvider = new UserSplfSearchView(context);
  let search = <SearchParms>{};
  context.subscriptions.push(
    vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.searchSpooledFiles`, async (node) => {
      //Initiate search from Spooled file item
      if (node && (/^spooledfile/.test( node.contextValue))) {
        search.user = node.user;
        search.name = node.name;
        search.word = node.parent.filter;
      }//Initiate search from user filter
      else if (node && (/^splfuser/.test( node.contextValue))) {
        search.user = node.user;
      }
      if (!search.user) {
        const config = getConfig();
        search.user = await vscode.window.showInputBox({
          value: config.currentLibrary,
          prompt: l10n.t(`Enter user to search over`),
          title: l10n.t(`Search user spooled files`),
        });
      }
      if (!search.name) {
        search.name = await vscode.window.showInputBox({
          value: ``,
          prompt: l10n.t(`Enter spooled file name to search over`),
          title: l10n.t(`Search in named spooled file`),
        });
      }

      // if (!search.name) {return;}

      search.term = await vscode.window.showInputBox({
        prompt: l10n.t(`Search in spooled files named {0}`,search.name)
      });

      if (search.term) {
        try {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: l10n.t(`Searching`),
          }, async progress => {
            progress.report({
              message: l10n.t(`'{0}' in {1}, {2} spooled files.`,search.term,search.user,search.name)
            });
            const splfnum = await IBMiContentSplf.getUserSpooledFileCount(search.user, search.name);
            if (Number(splfnum) > 0) {
              // NOTE: if more messages are added, lower the timeout interval
              const timeoutInternal = 9000;
              const searchMessages = [
                l10n.t(`'{0}' in {1} spooled files.`,search.term,search.name),
                l10n.t(`This is taking a while because there are {0} spooled files. Searching '{1}' in {2} still.`,splfnum,search.term,search.user),
                l10n.t(`What's so special about '{0}' anyway?`,search.term),
                l10n.t(`Still searching '{0}' in {1}...`,search.term,search.user),
                l10n.t(`Wow. This really is taking a while. Let's hope you get the result you want.`),
                l10n.t(`How does one end up with {0} spooled files.  Ever heard of cleaning up?`,splfnum),
                l10n.t(`'{0}' in {1}.`,search.term,search.user),
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
              let results = await UserSplfSearch.searchUserSpooledFiles(search.term, search.user, search.name, search.word);

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
                setSearchResultsSplf(`searchUserSpooledFiles`,search.term, results);
                // setSearchResults(search.term, results.sort((a, b) => a.path.localeCompare(b.path)));

              } else {
                vscode.window.showInformationMessage(l10n.t(`No results found searching for '{0}' in {1}.`, search.term,search.name));
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
    vscode.window.registerTreeDataProvider(`UserSplfSearchView`, userSplfSearchViewProvider),
  );
  getInstance()?.onEvent(`connected`, runOnConnection );
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

// let userSplfSearchViewProvider = <UserSplfSearchView>{};
export function setSearchResultsSplf(actionCommand: string, term: string, results: UserSplfSearch.Result[]) {
  userSplfSearchViewProvider.setResults(actionCommand, term, results);
} 

async function runOnConnection(): Promise<void> {
  const library = Code4i.getTempLibrary();
}