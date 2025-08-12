import { stringify, parse, ParsedUrlQueryInput, ParsedUrlQuery } from "querystring";
import vscode, { FilePermission, l10n } from "vscode";
import { Code4i, buildPathFileNamefromPattern, mergeObjects } from "../../tools";
import { IBMiSpooledFile, SplfOpenOptions } from "../../typings";
import { IBMiContentSplf } from "../../api/IBMiContentSplf";
import fs from 'fs';
import os from 'os';
import util from 'util';

const writeFileAsync = util.promisify(fs.writeFile);

export function getSpooledFileUri(filterType: string, splf: IBMiSpooledFile, options?: SplfOpenOptions) {
  let path = buildPathFileNamefromPattern(filterType, splf);
  if (path.length === 0) {
    path = `${splf.jobUser}/${splf.queue}/${splf.name}~${splf.jobName}~${splf.jobUser}~${splf.jobNumber}~${splf.number}`;
  }
  return getUriFromPath(`${path}.${options?.fileExtension ? options?.fileExtension : 'splf'}`, options);
}
export function getUriFromPathSplf(path: string, options?: SplfOpenOptions) {
  return getUriFromPath(path, options);
}

export function getUriFromPath(path: string, options?: SplfOpenOptions) {
  const query = toQueryParms(options as SplfOpenOptions);
  return vscode.Uri.parse(path).with({ scheme: `spooledfile`, path: `/${path}`, query });
}

export function getFilePermission(uri: vscode.Uri): FilePermission | undefined {
  const fsOptions = parseFSOptions(uri);
  if (Code4i.getConfig()?.readOnlyMode || fsOptions.readonly) {
    return FilePermission.Readonly;
  }
}

export function parseFSOptions(uri: vscode.Uri): SplfOpenOptions {
  const parameters = parse(uri.query);
  return {
    readonly: parameters.readonly === `true`,
    openMode: parameters.openMode,
    position: parameters.position,
    pageLength: parameters.pageLength,
    fileExtension: parameters.fileExtension,
    saveToPath: parameters.saveToPath,
    tempPath: parameters.tempPath,
    qualifiedJobName: parameters.qualifiedJobName,
    spooledFileNumber: parameters.spooledFileNumber,
    spooledFileName: parameters.spooledFileName,
  } as SplfOpenOptions;
}

export function isProtectedFilter(filter?: string): boolean {
  return filter && Code4i.getConfig()?.objectFilters.find(f => f.name === filter)?.protected || false;
}

export function toQueryParms(obj: Record<string, any>): string {
  const qp = Object.entries(obj)
    .filter(([_, val]) => val !== undefined && val !== null)
    .map(([key, val]) => {
      if (Array.isArray(val)) {
        return val.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join('&');
      } else {
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`;
      }
    })
    .join('&')
    ;
  return qp ? `?${qp}` : '';
}

export class SplfFS implements vscode.FileSystemProvider {

  private emitterChg = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitterChg.event;

  constructor(context: vscode.ExtensionContext) {

    context.subscriptions.push(
    );

  }

  stat(uri: vscode.Uri): vscode.FileStat {
    return {
      ctime: 0,
      mtime: 0,
      size: 0,
      type: vscode.FileType.File,
      permissions: getFilePermission(uri)
    };
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const contentApi = Code4i.getContent();
    const connection = Code4i.getConnection();
    if (connection && contentApi) {
      const queryStrings = parseFSOptions(uri);
      let options: SplfOpenOptions = {
        openMode: "withoutSpaces",
        fileExtension: `splf`,
        saveToPath: os.tmpdir(),
        namePattern: `name,jobName,jobUser,jobNumber,number`
      } as SplfOpenOptions;
      const openOptions = mergeObjects(options, queryStrings);
      const spooledFileContent = await IBMiContentSplf.downloadSpooledFileContent(uri.path, openOptions);
      if (spooledFileContent !== undefined) {
        return new Uint8Array(Buffer.from(spooledFileContent, `utf8`));
      }
      else {
        throw new Error(`Couldn't read ${uri}; check IBM i connection.`);
      }
    }
    else {
      throw new Error("Not connected to IBM i");
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }) {
    const lpath = uri.path.split(`/`);
    let localFilepath = os.homedir() + `/` + lpath[3] + `.txt`;
    let savFilepath = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(localFilepath) });
    if (savFilepath) {
      let localPath = savFilepath.path;
      if (process.platform === `win32`) {
        //Issue with getFile not working propertly on Windows
        //when there was a / at the start.
        if (localPath[0] === `/`) { localPath = localPath.substring(1); }
      }
      try {
        await writeFileAsync(localPath, content);
        vscode.window.showInformationMessage(`Spooled File, ${uri}, was saved.`);
      } catch (e) {
        vscode.window.showErrorMessage(l10n.t(`Error saving Spoooled File, ${uri}! ${e}`));
      }
    }
    else {
      vscode.window.showErrorMessage(`Spooled file, ${uri}, was not saved.`);
    }
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }

  watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
    return { dispose: () => { } };
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    throw new Error("Method not implemented.");
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }

  delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
}