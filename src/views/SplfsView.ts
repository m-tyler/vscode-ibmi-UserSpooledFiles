
import { SortOptions } from '@halcyontech/vscode-ibmi-types/api/IBMiContent';
import vscode, { l10n, TreeDataProvider } from 'vscode';
import { IBMiContentSplf } from "../api/IBMiContentSplf";
import { getSpooledFileUri } from '../filesystem/qsys/SplfFs';
import { Code4i, getMyConfig } from '../tools';
import { IBMISplfList, IBMiSpooledFile } from '../typings';


//https://code.visualstudio.com/api/references/icons-in-labels
const objectIcons: Record<string, string> = {
  'outq': 'server',
  'user': 'server',
  'splf': 'file',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '': 'circle-large-outline'
};

export default class SPLFBrowser implements TreeDataProvider<any> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void>;
  public onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void>;
  private data: IBMISplfList[] = []; // Your data storage

  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh(target?: any) {
    this._onDidChangeTreeData.fire(target);
  }
  // Method to set data when your extension becomes connected
  public populateData(newData: IBMISplfList[]): void {
    this.data = newData;
    this._onDidChangeTreeData.fire(); // Notify VS Code to refresh
  }

  // Method to clear the tree view
  public clearTree(): void {
    this.data = []; // Clear the data
    this._onDidChangeTreeData.fire(); // Notify VS Code to refresh
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
      // const myConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser.spooledFileFilters');

      const config = getConfig();

      if (element) {
        // let filter;
        switch (element.contextValue.split(`_`)[0]) {
        case `splflist`:
          //Fetch spooled files
          try {
            const splfs = await IBMiContentSplf.getSpooledFileFilter({ name: element.name, library: element.library, type: element.type } as IBMISplfList, element.sort, undefined, element.filter);
            items.push(...splfs
              .map((splf: IBMiSpooledFile) => new SpooledFiles(`splf`, element, splf)));
            element.setRecordCount(splfs.length);

          } catch (e: any) {
            // console.log(e);
            vscode.window.showErrorMessage(e.message);
            items.push(new vscode.TreeItem(l10n.t(`Error loading spooled files.`)));
          }
        case `splf`:
          { }
          break;
        }

        // } else if (this.data) { // no context exists in tree yet, get from settings if present
        // items.push( ...this.data.map(
          //     (theFilter: IBMISplfList) => new SpooledFileFilter(`splflist`, element, theFilter, connection.currentUser)
          //   ));
      // }
        } else if (config.SpooledFileConfig) { // no context exists in tree yet, get from settings if present
        items.push(...config.SpooledFileConfig.map(
          (theFilter: IBMISplfList) => new SpooledFileFilter(`splflist`, element, theFilter, connection.currentUser)
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
  async resolveTreeItem(item: SpooledFileFilter | SpooledFiles, element: any, token: vscode.CancellationToken): Promise<vscode.TreeItem> {
    if (item instanceof SpooledFileFilter) {
      const splfNum = await IBMiContentSplf.getFilterSpooledFileCount({ name: item.name, library: item.library, type: item.type } as IBMISplfList
        , item.filter);
      const splfFilterInfo = await IBMiContentSplf.getFilterDescription([item.name], item.library, item.type);
      item.setRecordCount(Number(splfNum.numberOf));
      item.itemText = splfFilterInfo[0].text || ``;
      if (splfFilterInfo[0].library && (item.library === '' || item.library === '*LIBL')) { item.library = splfFilterInfo[0].library; }

      item.tooltip = new vscode.MarkdownString(`<table>`
        .concat(`<thead>${element.library}/${element.name}</thead><hr>`)
        .concat(item.itemText ? `<tr><td>${l10n.t('Text:')}</td><td>&nbsp;${item.itemText}</td></tr>` : ``)
        .concat(splfNum.numberOf ? `<tr><td>${l10n.t('Spooled Files:')}</td><td>&nbsp;${splfNum.numberOf}</td></tr>` : ``)
        .concat(element.filter ? `<tr><td>${l10n.t(`Filter:`)}</td><td>&nbsp;${element.filter}</td></tr>` : ``)
        .concat(`</table>`)
      );
      item.tooltip.supportHtml = true;
    } else if (item instanceof SpooledFiles) {
      const info = await IBMiContentSplf.getSpooledFileDeviceType([item.queue], [item.queueLibrary], [item.name], [item.jobUser]
        , item.qualifiedJobName, item.number);
      const pageLength = await IBMiContentSplf.getSpooledPageLength([item.queue], [item.queueLibrary], [item.name], [item.jobUser]
        , item.qualifiedJobName, item.number);
      item.pageLength = pageLength[0].pageLength||'68';
      item.deviceType = info[0].deviceType || '*SCS';
      item.tooltip = new vscode.MarkdownString(`<table>`
        .concat(`<thead>${item.path.split(`/`)[2]}</thead><hr>`)
        .concat(item.qualifiedJobName ? `<tr><td style="text-align: right;">${l10n.t(`Job:`)}</td><td>&nbsp;${item.qualifiedJobName}</td></tr>` : ``)
        .concat(item.number ? `<tr><td>${l10n.t(`File Number:`)}</td><td>&nbsp;${item.number}</td></tr>` : ``)
        .concat(item.userData ? `<tr><td>${l10n.t(`UserData:`)}</td><td>&nbsp;${item.userData}</td></tr>` : ``)
        .concat(item.creationTimestamp ? `<tr><td>${l10n.t(`Created:`)}</td><td>&nbsp;${item.creationTimestamp}</td></tr>` : ``)
        .concat(item.size ? `<tr><td>${l10n.t(`Size in bytes:`)}</td><td>&nbsp;${item.size}</td></tr>` : ``)
        .concat(item.pageLength ? `<tr><td>${l10n.t(`Page Length:`)}</td><td>&nbsp;${item.pageLength}</td></tr>` : ``)
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
  numberOf: number | undefined;
  readonly sort: SortOptions = { order: "date", ascending: true };
  constructor(contextType: string, parent: vscode.TreeItem, theFilter: IBMISplfList, currentUser: string) {
    super(theFilter.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.name = theFilter.name;
    this.library = theFilter.library || `*LIBL`;
    this.type = theFilter.type;
    const icon = objectIcons[`${this.type.toLocaleLowerCase()}`] || objectIcons[``];
    this.protected = this.name.toLocaleUpperCase() !== currentUser.toLocaleUpperCase() ? true : false;
    this.contextValue = `${contextType}${this.protected ? `_readonly` : ``}`;
    this.path = theFilter.name;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    this.parent = parent;
    this.iconPath = new vscode.ThemeIcon(icon, (this.protected ? new vscode.ThemeColor(`list.errorForeground`) : undefined));

    this._description = `${theFilter.name} ${this.protected ? `(readonly)` : ``}`;
    this.description = this._description;
    this.sortBy(this.sort);

    this.filter = '';
    this.itemText = '';
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
  setRecordCount(amount: number) {this.numberOf = amount;}
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
   * @param {IBMiSpooledFile} inp
   * @param {IBMiSplfUser} filter
   */
  constructor(type: string, parent: SpooledFileFilter, inp: IBMiSpooledFile) {

    const icon = objectIcons[`${type}`] || objectIcons[``];
    super(`${inp.name}.${type}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;

    this.parent = parent;
    this.type = type;
    // Layout of IBMiSpooledFile
    this.name = inp.name;
    this.number = inp.number;
    this.status = inp.status || '';
    this.creationTimestamp = inp.creationTimestamp || '';
    this.userData = inp.userData || '';
    this.size = inp.size || 0;
    this.totalPages = inp.totalPages || 0;
    this.pageLength = inp.pageLength || '';
    this.qualifiedJobName = inp.qualifiedJobName;
    this.jobName = inp.jobName || '';
    this.jobUser = inp.jobUser || '';
    this.jobNumber = inp.jobNumber || '';
    this.formType = inp.formType || '';
    this.queueLibrary = inp.queueLibrary;
    this.queue = inp.queue;

    this.description = l10n.t(`- {0} - Pages: {1}, Time: {2} `, this.status, this.totalPages, this.creationTimestamp.substring(11));
    this.iconPath = new vscode.ThemeIcon(icon);
    this.protected = parent.protected;
    this.contextValue = `spooledfile${this.protected ? `_readonly` : ``}`;
    this.resourceUri = getSpooledFileUri(parent.type, inp, parent.protected ? { readonly: true } : undefined) || '';
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