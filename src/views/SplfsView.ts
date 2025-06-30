
import { SortOptions } from '@halcyontech/vscode-ibmi-types/api/IBMiContent';
import vscode, { l10n, TreeDataProvider } from 'vscode';
import { IBMiContentSplf } from "../api/IBMiContentSplf";
import { getSpooledFileUri } from '../filesystem/qsys/SplfFs';
import { Code4i } from '../tools';
import { IBMiSplf, IBMiSpooledFile } from '../typings';


//https://code.visualstudio.com/api/references/icons-in-labels
const objectIcons: Record<string, string> = {
  'outq': 'server',
  'user': 'server',
  'splf': 'file',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '': 'circle-large-outline'
};

export default class SPLFBrowser implements TreeDataProvider<any> {
  private emitter: vscode.EventEmitter<any>;
  public onDidChangeTreeData: vscode.Event<any>;

  constructor(private context: vscode.ExtensionContext) {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  refresh(target?: any) {
    this.emitter.fire(target);
    vscode.window.showInformationMessage(vscode.l10n.t(`Spooled File Browser refreshed.`));
  }

  /**
   * @param {vscode.TreeItem} element
   * @returns {vscode.TreeItem};
   */
  getTreeItem(element: vscode.TreeItem) {
    return element;
  }

  /**
   * @param {vscode.TreeItem} element
   * @returns {Promise<vscode.TreeItem[]>};
   */
  async getChildren(element: any) {
    const items = [];
    const connection = getConnection();
    if (connection) {
      const content = getContent();
      const config = getConfig();

      if (element) {
        // let filter;
        switch (element.contextValue.split(`_`)[0]) {
        case `splflist`:
          //Fetch spooled files
          try {
            const objects = await IBMiContentSplf.getSpooledFileFilter({ name: element.name, library: element.library, type: element.type } as IBMiSplf, element.sort, undefined, element.filter);
            items.push(...objects
              .map((object: IBMiSpooledFile) => new SpooledFiles(`splf`, element, object)));

          } catch (e: any) {
            // console.log(e);
            vscode.window.showErrorMessage(e.message);
            items.push(new vscode.TreeItem(l10n.t(`Error loading spooled files.`)));
          }
        case `splf`:
          { }
          break;
        }

      } else if (config.SpooledFileConfig) { // no context exists in tree yet, get from settings if present
        items.push(...config.SpooledFileConfig.map(
          (theFilter: IBMiSplf) => new SpooledFileFilter(`splflist`, element, theFilter, connection.currentUser)
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
  getParent(element: any) {
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
  async resolveTreeItem(item: SpooledFileFilter|SpooledFiles, element: any, token: vscode.CancellationToken): Promise<vscode.TreeItem> {
    if (item instanceof SpooledFileFilter) {
      // TypeScript knows 'param' is of type MyClass here
      console.log(`in resolveTreeItem, item is an instance of SpooledFileFilter`);
      const splfNum = await IBMiContentSplf.getFilterSpooledFileCount(item.name, item.library, item.type, item.filter);
      const text = await IBMiContentSplf.getFilterDescription(item.name, item.library, item.type);
      item.numberOf = splfNum.numberOf;
      item.itemText = text || ``;

      item.tooltip = new vscode.MarkdownString(`<table>`
        .concat(`<thead>${element.library}/${element.name}</thead><hr>`)
        .concat(text ? `<tr><td>${l10n.t('Text:')}</td><td>&nbsp;${text}</td></tr>` : ``)
        .concat(splfNum.numberOf ? `<tr><td>${l10n.t('Spooled Files:')}</td><td>&nbsp;${splfNum.numberOf}</td></tr>` : ``)
        .concat(element.filter ? `<tr><td>${l10n.t(`Filter:`)}</td><td>&nbsp;${element.filter}</td></tr>` : ``)
        .concat(`</table>`)
      );
      item.tooltip.supportHtml = true;
    } else if (item instanceof SpooledFiles) {
      console.log(`in resolveTreeItem, 'item' is an instance of SpooledFiles`);
      const text = await IBMiContentSplf.getSpooledFileDeviceType( item.name, item.qualifiedJobName, item.number ,item.queue, item.queueLibrary );
      item.deviceType = text;
      item.tooltip = new vscode.MarkdownString(`<table>`
      .concat(`<thead>${item.path.split(`/`)[2]}</thead><hr>`)
      .concat(item.qualifiedJobName ? `<tr><td style="text-align: right;">${l10n.t(`Job:`)}</td><td>&nbsp;${item.qualifiedJobName}</td></tr>` : ``)
      .concat(item.number ? `<tr><td>${l10n.t(`File Number:`)}</td><td>&nbsp;${item.number}</td></tr>` : ``)
      .concat(item.userData ? `<tr><td>${l10n.t(`UserData:`)}</td><td>&nbsp;${item.userData}</td></tr>` : ``)
      .concat(item.creationTimestamp ? `<tr><td>${l10n.t(`Created:`)}</td><td>&nbsp;${item.creationTimestamp}</td></tr>` : ``)
      .concat(item.size ? `<tr><td>${l10n.t(`Size in bytes:`)}</td><td>&nbsp;${item.size}</td></tr>` : ``)
      .concat(item.formType ? `<tr><td>${l10n.t(`Form Type:`)}</td><td>&nbsp;${item.formType}</td></tr>` : ``)
      .concat(item.queue ? `<tr><td>${l10n.t(`Output Queue:`)}</td><td>&nbsp;${item.queueLibrary, item.queue}</td></tr>` : ``)
      .concat(item.deviceType ? `<tr><td>${l10n.t(`Device Type:`)}</td><td>&nbsp;${item.deviceType}</td></tr>` : ``)
      .concat(item.parent.filter ? `<tr><td>${l10n.t(`Filter:`)}</td><td>&nbsp;${item.parent.filter}</td></tr>` : ``)
      .concat(`</table>`)
    );
    item.tooltip.supportHtml = true;
    }
    return item;
  }
}

export class SpooledFileFilter extends vscode.TreeItem {
  protected: boolean;
  path: string;
  parent: vscode.TreeItem;
  name: string;
  library: string;
  type: string;
  _description: string;
  description: string;
  filter: string; // reduces tree items to matching tokens
  itemText: string;
  numberOf: string;
  readonly sort: SortOptions = { order: "date", ascending: true };
  constructor(conextType: string, parent: vscode.TreeItem, theFilter: IBMiSplf, currentUser: string) {
    super(theFilter.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.name = theFilter.name;
    this.library = theFilter.library || `*LIBL`;
    this.type = theFilter.type;
    const icon = objectIcons[`${this.type.toLocaleLowerCase()}`] || objectIcons[``];
    this.protected = this.name.toLocaleUpperCase() !== currentUser.toLocaleUpperCase() ? true : false;
    this.contextValue = `${conextType}${this.protected ? `_readonly` : ``}`;
    this.path = theFilter.name;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    this.parent = parent;
    this.iconPath = new vscode.ThemeIcon(icon, (this.protected ? new vscode.ThemeColor(`list.errorForeground`) : undefined));

    this._description = `${theFilter.name} ${this.protected ? `(readonly)` : ``}`;
    this.description = this._description;
    this.sortBy(this.sort);

    this.filter = '';
    this.itemText = '';
    this.numberOf = '';
  }
  /** @type {import("../api/IBMiContent").SortOptions}*/
  sortBy(sort: SortOptions) {
    if (this.sort.order !== sort.order) {
      this.sort.order = sort.order;
      this.sort.ascending = true;
    }
    else {
      this.sort.ascending = !this.sort.ascending;
    }
    this.description = `${this._description ? `${this._description} ` : ``}(sort: ${this.sort.order} ${this.sort.ascending ? `🔼` : `🔽`})`;
  }
  setFilter(filter: string) {
    this.filter = filter;
  }
  clearToolTip() { this.tooltip = undefined; }
  // setDescription(value: string | boolean) { this.description = (value?value:``)+this.sortDescription; }
}

export class SpooledFiles extends vscode.TreeItem implements IBMiSpooledFile {
  parent: SpooledFileFilter;
  type: string;
  name: string;
  number: string;
  status: string;
  creationTimestamp: string;
  userData: string;
  size: number;
  totalPages: number;
  pageLength: string;
  qualifiedJobName: string;
  jobName: string;
  jobUser: string;
  jobNumber: string;
  formType: string;
  queueLibrary: string;
  queue: string;
  protected: boolean;
  path: string;
  deviceType: string;
  readonly sort: SortOptions = { order: "date", ascending: true };
  readonly sortBy: (sort: SortOptions) => void;
  /**
   * @param {"splf"} type
   * @param {vscode.TreeItem} parent
   * @param {IBMiSpooledFile} object
   * @param {IBMiSplfUser} filter
   */
  constructor(type: string, parent: SpooledFileFilter, object: IBMiSpooledFile) {

    const icon = objectIcons[`${type}`] || objectIcons[``];
    super(`${object.name}.${type}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;

    this.parent = parent;
    this.type = type;
    // Layout of IBMiSpooledFile
    this.name = object.name;
    this.number = object.number;
    this.status = object.status;
    this.creationTimestamp = object.creationTimestamp;
    this.userData = object.userData;
    this.size = object.size;
    this.totalPages = object.totalPages;
    this.pageLength = object.pageLength;
    this.qualifiedJobName = object.qualifiedJobName;
    this.jobName = object.jobName;
    this.jobUser = object.jobUser;
    this.jobNumber = object.jobNumber;
    this.formType = object.formType;
    this.queueLibrary = object.queueLibrary;
    this.queue = object.queue;

    this.description = l10n.t(`- {0} - Pages: {1}, Time: {2} `, this.status, this.totalPages, this.creationTimestamp.substring(11));
    this.iconPath = new vscode.ThemeIcon(icon);
    this.protected = parent.protected;
    this.contextValue = `spooledfile${this.protected ? `_readonly` : ``}`;
    this.resourceUri = getSpooledFileUri(object, parent.protected ? { readonly: true } : undefined);
    this.path = this.resourceUri.path.substring(1); // removes leading slash for QSYS paths
    this.deviceType = ``;
    
    this.command = {
      command: `vscode-ibmi-splfbrowser.openSplfWithoutLineSpacing`,
      title: `Open Spooled File`,
      arguments: [this]
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