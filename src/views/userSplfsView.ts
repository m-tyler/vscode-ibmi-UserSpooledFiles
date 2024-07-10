
import vscode, { l10n, TreeDataProvider } from 'vscode';
import { getSpooledFileUri } from '../filesystem/qsys/SplfFs';
import { Code4i } from '../tools';
import { IBMiSpooledFile,IBMiSplfUser } from '../typings';
import { IBMiContentSplf } from "../api/IBMiContentSplf";
import { SortOptions } from '@halcyontech/vscode-ibmi-types/api/IBMiContent';


//https://code.visualstudio.com/api/references/icons-in-labels
const objectIcons: Record<string, string> = {
  'OUTQ': 'server',
  'SPLF': 'file',
  '': 'circle-large-outline'
}

export default class SPLFBrowser implements TreeDataProvider<any> {
  private emitter: vscode.EventEmitter<any>;
  public onDidChangeTreeData: vscode.Event<any>;

  constructor(private context: vscode.ExtensionContext) {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;

  }


  refresh(target? :any) {
    this.emitter.fire(target);
  }

  /**
   * @param {vscode.TreeItem} element
   * @returns {vscode.TreeItem};
   */
  getTreeItem(element :vscode.TreeItem) {
    return element;
  }

  /**
   * @param {vscode.TreeItem} element
   * @returns {Promise<vscode.TreeItem[]>};
   */
  async getChildren(element :any) {
    const items = [];
    const connection = getConnection();
    if (connection) {
      const content = getContent();
      const config = getConfig();

      if (element) { //Chosen USER??
        // let filter;
        switch (element.contextValue.split(`_`)[0]) {
        case `splfuser`:
          //Fetch spooled files
          try {
            const objects = await IBMiContentSplf.getUserSpooledFileFilter(element.user, element.sort, undefined ,element.filter );
            items.push(...objects
              .map((object: IBMiSpooledFile) => new UserSpooledFiles(`SPLF`, element, object)));

          } catch (e: any) {
            // console.log(e);
            vscode.window.showErrorMessage(e.message);
            items.push(new vscode.TreeItem(l10n.t(`Error loading user spooled files.`)));
          }
        case `SPLF`:
          { }
          break;
        }

      } else { // no context exists in tree yet, get from settings
        items.push(...config.usersSpooledFile.map(
          (theUser: any) => new SpooledFileUser(element, { user: theUser, }, connection.currentUser)
        ));
      }
    }
    return items;
  }
  /**
   * getParemt
   * required implementation for TreeDataProvider
   *
   */
  getParent(element :any) {
    return element.parent;
  }
  /**
   * Called on hover to resolve the {@link TreeItem.tooltip TreeItem} property if it is undefined.
   * Called on tree item click/open to resolve the {@link TreeItem.command TreeItem} property if it is undefined.
   * Only properties that were undefined can be resolved in `resolveTreeItem`.
   * Functionality may be expanded later to include being called to resolve other missing
   * properties on selection and/or on open.
   *
   * Will only ever be called once per TreeItem.
   *
   * onDidChangeTreeData should not be triggered from within resolveTreeItem.
   *
   * *Note* that this function is called when tree items are already showing in the UI.
   * Because of that, no property that changes the presentation (label, description, etc.)
   * can be changed.
   *
   * @param item Undefined properties of `item` should be set then `item` should be returned.
   * @param element The object associated with the TreeItem.
   * @param token A cancellation token.
   * @return The resolved tree item or a thenable that resolves to such. It is OK to return the given
   * `item`. When no result is returned, the given `item` will be used.
   * @param {vscode.TreeItem} item
   * @param {vscode.TreeDataProvider<T>} element
   * @param {vscode.CancellationToken} token
   * @returns {ProviderResult<vscode.TreeItem>};
   */
  async resolveTreeItem(item :SpooledFileUser, element :any, token :vscode.CancellationToken) :Promise<vscode.TreeItem>
  {
    const splfNum = await IBMiContentSplf.getUserSpooledFileCount(item.user);
    const userText = await IBMiContentSplf.getUserProfileText(item.user);
    item.tooltip = ``
      .concat(userText ?  l10n.t(`User Text\t\t\t:  {0}`,userText) :``)
      .concat(userText ?  l10n.t(`\nSpooled Fiile Count: {0}`,splfNum) :``)
    return item;
  }
}

export class SpooledFileUser extends vscode.TreeItem {
  protected: boolean;
  path: string;
  parent: vscode.TreeItem;
  user: string;
  _description: string;
  description: string;
  filter: string; // reduces tree items to matching tokens
  readonly sort: SortOptions = { order: "name", ascending: true };
  constructor(parent: vscode.TreeItem, theUser: IBMiSplfUser, currentUser: string) {
    super(theUser.user, vscode.TreeItemCollapsibleState.Collapsed);
    this.user = theUser.user;
    const icon = objectIcons[`OUTQ`] || objectIcons[``];
    this.protected = this.user.toLocaleUpperCase() !== currentUser.toLocaleUpperCase() ? true : false;
    this.contextValue = `splfuser${this.protected ? `_readonly` : ``}`;
    this.path = theUser.user;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    this.parent = parent;
    this.iconPath = new vscode.ThemeIcon(icon, (this.protected ? new vscode.ThemeColor(`list.errorForeground`) : undefined));

    this._description = `${theUser.user} ${this.protected ? `(readonly)` : ``}`;
    this.description = this._description;

    this.filter = '';
    /** @type {import("../api/IBMiContent").SortOptions}*/
    this.tooltip = ``
  }
  sortBy( sort: SortOptions ) {
    if (this.sort.order !== sort.order) {
      this.sort.order = sort.order;
      this.sort.ascending = true;
    }
    else {
      this.sort.ascending = !this.sort.ascending
    }
    this.description = `${this._description ? `${this._description} ` : ``}(sort: ${this.sort.order} ${this.sort.ascending ? `🔼` : `🔽`})`;
  }
  setFilter( filter: string ) {this.filter = filter;}
}

export class UserSpooledFiles extends vscode.TreeItem implements IBMiSpooledFile{
  parent: SpooledFileUser;
  type: string;
  user: string;
  name: string;
  number: number;
  status: string;
  creationTimestamp: string;
  userData: string;
  size: number;
  totalPages: number;
  pageLength: number;
  qualifiedJobName: string;
  jobName: string;
  jobUser: string;
  jobNumber: string;
  formType: string;
  queueLibrary: string;
  queue: string;
  protected: boolean;
  path: string;
  readonly sort: SortOptions = { order: "name", ascending: true };
  readonly sortBy: (sort: SortOptions) => void;
  /**
   * @param {"SPLF"} type
   * @param {vscode.TreeItem} parent
   * @param {IBMiSpooledFile} object
   * @param {IBMiSplfUser} filter
   */
  constructor(type: string, parent: SpooledFileUser, object: IBMiSpooledFile) {

    const icon = objectIcons[`${type}`] || objectIcons[``];
    super(`${object.name}.${type}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;

    this.parent = parent;
    this.type = type;
    // Layout of IBMiSpooledFile
    this.user = parent.path;
    this.name = object.name
    this.number = object.number
    this.status = object.status
    this.creationTimestamp = object.creationTimestamp
    this.userData = object.userData
    this.size = object.size
    this.totalPages = object.totalPages
    this.pageLength = object.pageLength 
    this.qualifiedJobName = object.qualifiedJobName
    this.jobName = object.jobName
    this.jobUser = object.jobUser
    this.jobNumber = object.jobNumber
    this.formType = object.formType
    this.queueLibrary = object.queueLibrary
    this.queue = object.queue

    this.description = l10n.t(`- {0} - Pages: {1}, Time: {2} `,this.status ,this.totalPages ,this.creationTimestamp.substring(11));
    this.iconPath = new vscode.ThemeIcon(icon);
    this.protected = parent.protected;
    this.contextValue = `spooledfile${this.protected ? `_readonly` : ``}`;
    this.resourceUri = getSpooledFileUri(object, parent.protected ? { readonly: true } : undefined);
    this.path = this.resourceUri.path.substring(1); // removes leading slash for QSYS paths
    this.tooltip = ``
      .concat(object.qualifiedJobName  ?  l10n.t(`Job:\t\t\t {0}`,object.qualifiedJobName ) :``)
      .concat(object.number  ?  l10n.t(`\nFile Number:\t {0}`,object.number ) :``)
      .concat(object.userData  ?  l10n.t(`\nUser Data:\t {0}`,object.userData ) :``)
      .concat(object.creationTimestamp  ?  l10n.t(`\nCreated:\t\t {0}`,object.creationTimestamp ) :``)
      .concat(object.size  ?  l10n.t(`\nSize in bytes:\t {0}`,object.size ) :``)
      .concat(object.formType  ?  l10n.t(`\nForm Type:\t {0}`,object.formType ) :``)
      .concat(object.queue  ?  l10n.t(`\nOutput Queue: {0}/{1}`,object.queueLibrary,object.queue ) :``)
      .concat(object.pageLength  ?  l10n.t(`\nPage Length:\t {0}`,object.pageLength ) :``)
    ;
    this.command = {
      command: `vscode.open`,
      title: `Open Spooled File`,
      arguments: [this.resourceUri]
    };
    this.iconPath = new vscode.ThemeIcon(icon, (this.protected ? new vscode.ThemeColor(`list.errorForeground`) : undefined));
    this.sortBy = (sort: SortOptions) => parent.sortBy(sort);
  }
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