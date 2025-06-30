import * as vscode from 'vscode';
import { TreeDataProvider } from "vscode";
import path from 'path';
import { SplfSearch } from '../api/spooledFileSearch';
import { getUriFromPathSplf } from "../filesystem/qsys/SplfFs";
import { SplfOpenOptions } from '../typings';

export class SplfSearchView implements TreeDataProvider<any> {
  private _term = ``;
  private _actionCommand = ``;
  private _results: SplfSearch.Result[] = [];
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

  setResults(actionCommand: string, term: string, results: SplfSearch.Result[]) {
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

  constructor(actionCommand: string, readonly results: SplfSearch.Result[], readonly term: string) {
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

  constructor(readonly result: SplfSearch.Result, readonly term: string) {
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
  constructor(term: string, readonly path: string, line: SplfSearch.Line, readonly?: boolean) {
    let highlights: [number, number][] = [];

    const upperContent = line.content.toUpperCase();
    const upperTerm = term.toUpperCase();
    let openOptions: SplfOpenOptions = { };
    let index = 0;

    // Calculate the highlights
    if (term.length > 0) {
      const positionLine = line.number - 1;
      while (index >= 0) {
        index = upperContent.indexOf(upperTerm, index);
        if (index >= 0) {
          if (!openOptions.position) {
            openOptions.position = new vscode.Range(positionLine, index-1, positionLine, index-1 +term.length);
          }
          index += term.length;
        }
      }
    }
    highlights = computeHighlights(upperTerm ,upperContent.trim());
    // let firstThirtyChars = line.content.substring(0 ,30);
    // if (line.content.length > 30) {
    //   firstThirtyChars = `...`+line.content.substring(highlights[0][0]-15 ,30);
    // }
    super({
      // label: firstThirtyChars,
      label: line.content.trim(),
      highlights
    });
    openOptions = {
      readonly: readonly || false,
      openMode: "withoutSpaces",
      position: openOptions?.position || undefined,
      fileExtension: 'SPLF', 
      saveToPath: undefined,
      tempPath: undefined
    };
    this.resourceUri = getUriFromPathSplf(this.path, openOptions);

    this.contextValue = `lineHit`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;

    this.description = String(line.number);

    this.command = {
      // command: `vscode-ibmi-splfbrowser. openSplfWithoutLineSpacing`,
      command: `vscode.openWith`,
      title: `Open Spooled File`,
      tooltip: `Open Spooled File`,
      // arguments: [this.path, `default`,{ selection: openOptions.position } as vscode.TextDocumentShowOptions ]
      arguments: [this.resourceUri, `default`,{ selection: openOptions.position } as vscode.TextDocumentShowOptions ]
    };
    console.log(this);
  }
}
/**
 * Computes where to highlight the search result label text
 */
function computeHighlights (term: string, line: string) :[number, number][]{
  let index = 0;
  let HI :[number,number][] = [];
  while (index >= 0) {
    index = line.indexOf(term, index);
    if (index >= 0) {
      HI.push([index, index +term.length]);
      index += term.length;
    }
  }
  return HI;
}