import  { TreeDataProvider } from "vscode";
import  { Range } from "vscode";
import * as vscode from 'vscode';
import path from 'path';
import { QsysFsOptions } from '@halcyontech/vscode-ibmi-types/';
import { UserSplfSearch } from '../api/spooledFileSearch';
export type OpenEditableOptions = QsysFsOptions & { position?: Range };

export class UserSplfSearchView implements TreeDataProvider<any> {
  private _term = ``;
  private _actionCommand = ``;
  private _results: UserSplfSearch.Result[] = [];
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.refreshSearchView`, async () => {
        this.refresh();
      }),
      vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.closeSearchView`, async () => {
        vscode.commands.executeCommand(`setContext`, `vscode-ibmi-splfbrowser:searchViewVisible`, false);
      }),
      vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.collapseSearchView`, async () => {
        this.collapse();
      }),
      vscode.commands.registerCommand(`vscode-ibmi-splfbrowser.expandSearchView`, async () => {
        this.expand();
      }),
    );
  }

  setViewVisible(visible: boolean) {
    vscode.commands.executeCommand(`setContext`, `vscode-ibmi-splfbrowser:searchViewVisible`, visible);
  }

  setResults(actionCommand :string, term: string, results: UserSplfSearch.Result[]) {
    this._actionCommand = actionCommand;
    this._term = term;
    this._results = results;
    this.refresh();
    this.setViewVisible(true);

    vscode.commands.executeCommand(`UserSplfSearchView.focus`);
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem) {
    return element;
  }

  collapse() {
    vscode.commands.executeCommand(`workbench.actions.treeView.UserSplfSearchView.collapseAll`);
  }
  expand() {
    vscode.commands.executeCommand(`workbench.actions.treeView.UserSplfSearchView.expandAll`);
  }

  async getChildren(hitSource: HitSource): Promise<vscode.TreeItem[]> {
    if (!hitSource) {
      return this._results.map(result => new HitSource(result, this._term));
    } else {
      return hitSource.getChildren();
    }
  }
  // async getChildren(hit: HitCommand): Promise<vscode.TreeItem[]> {
  //   if (!hit) {
  //     return new HitCommand(this._actionCommand, this._results, this._term);
  //   } else {
  //     return hit.getChildren();
  //   }
  // }
}

class HitCommand extends vscode.TreeItem {
  private readonly _actionCommand: string;

  constructor(actionCommand :string, readonly results: UserSplfSearch.Result[], readonly term: string) {
    super(actionCommand, vscode.TreeItemCollapsibleState.Expanded);

    this.contextValue = `hitCommand`;
    this.iconPath = vscode.ThemeIcon.File;
    this.description = `${actionCommand}`;
    this._actionCommand = actionCommand;
  }

  async getChildren(): Promise<HitSource[]> { 
      return this.results.map(result => new HitSource(result, this.term));
  }
}

class HitSource extends vscode.TreeItem {
  private readonly _path: string;
  private readonly _readonly?: boolean;

  constructor(readonly result: UserSplfSearch.Result, readonly term: string) {
    super(result.label ? result.path : path.posix.basename(result.path), vscode.TreeItemCollapsibleState.Expanded);

    const hits = result.lines.length;
    this.contextValue = `hitSource`;
    this.iconPath = vscode.ThemeIcon.File;
    this.description = `${hits} hit${hits === 1 ? `` : `s`}`;
    this._path = result.path;
    this._readonly = result.readonly;
    this.tooltip = result.path;
  }

  async getChildren(): Promise<LineHit[]> {
   
    return this.result.lines.map(line => new LineHit(this.term, this._path, line, this._readonly));
  }
}
class LineHit extends vscode.TreeItem {
  constructor(term: string, readonly path: string, line: UserSplfSearch.Line, readonly?: boolean) {
    const highlights: [number, number][] = [];

    const upperContent = line.content.trim().toUpperCase();
    const upperTerm = term.toUpperCase();
    const openOptions: OpenEditableOptions = { readonly };
    let index = 0;

    // Calculate the highlights
    if (term.length > 0) {
      const positionLine = line.number - 1;
      while (index >= 0) {
        index = upperContent.indexOf(upperTerm, index);
        if (index >= 0) {
          highlights.push([index, index + term.length]);
          if (!openOptions.position) {
            openOptions.position = new vscode.Range(positionLine, index, positionLine, index + term.length);
          }
          index += term.length;
        }
      }
    }

    super({
      label: line.content.trim(),
      highlights
    });

    this.contextValue = `lineHit`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;

    this.description = String(line.number);

    this.command = {
      command: `code-for-ibmi.openEditable`,
      title: `Open`,
      arguments: [this.path, openOptions]
    };
  }
}