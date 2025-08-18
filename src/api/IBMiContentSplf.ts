import fs from 'fs';
import tmp from 'tmp';
import util from 'util';
import vscode, { l10n, Uri } from 'vscode';
import { breakUpPathFileName, Code4i } from '../tools';
import { IBMiSpooledFile, SplfOpenOptions, IBMiSplfCounts, IBMISplfList } from '../typings';
import { CommandResult } from '@halcyontech/vscode-ibmi-types';
import { SpooledFiles } from '../views/SplfsView';

const tmpFile = util.promisify(tmp.file);
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);


export type SortOptions = {
  order: "name" | "date" | "?"
  ascending?: boolean
};
// Generic filtering function
function filterNodes<T>(
  nodes: T[],
  predicate: (node: T) => boolean // Accepts a predicate function as a parameter.
): T[] {
  return nodes.filter(predicate);
}

function isInvalidPageLength(node: IBMiSpooledFile): boolean {
  return node.pageLength === undefined || node.pageLength === null || node.pageLength === '0';
}

function isInvalidDeviceType(node: IBMiSpooledFile): boolean {
  return node.deviceType === undefined || node.deviceType === ``;
}
export namespace IBMiContentSplf {
  /**
  * @param {IBMISplfList} treeFilter 
  * @param {string} SortOptions
  * @param {string} splfName
  * @param {string} searchFilter
  * @param {number} resultLimit sometimes system can only handle so many results, default is 10000. 
  * @returns {Promise<IBMiSpooledFile[]>} returns array of spooled files for filter criteria of type {@link IBMiSpooledFile}
  */
  export async function getSpooledFileFilter(treeFilter: IBMISplfList, sort: SortOptions, splfName?: string, searchFilter?: string, resultLimit?: number): Promise<IBMiSpooledFile[]> {
    const connection = Code4i.getConnection();

    sort.order = sort.order || 'date';
    if (!sort.ascending) { sort.ascending = false; }
    resultLimit = resultLimit || 10000;
    let queryParm = ``;
    if (treeFilter.type === 'USER') {
      queryParm = `USER_NAME => '${treeFilter.name}'`;
    } else if (treeFilter.type === 'OUTQ') {
      queryParm = `USER_NAME=> '*ALL', OUTPUT_QUEUE => '${treeFilter.library}/${treeFilter.name}'`;
    }

    const objQuery = `select SPE.SPOOLED_FILE_NAME, SPE.SPOOLED_FILE_NUMBER, SPE.STATUS, SPE.CREATION_TIMESTAMP
      , ifnull(SPE.USER_DATA,'') USER_DATA , ifnull(SPE.SIZE,0) SIZE , ifnull(SPE.TOTAL_PAGES,0) TOTAL_PAGES
      , SPE.QUALIFIED_JOB_NAME, SPE.JOB_NAME, SPE.JOB_USER, SPE.JOB_NUMBER, SPE.FORM_TYPE
      , SPE.OUTPUT_QUEUE_LIBRARY, SPE.OUTPUT_QUEUE
      from table (QSYS2.SPOOLED_FILE_INFO(${queryParm}) ) SPE 
      where SPE.FILE_AVAILABLE = '*FILEEND' ${splfName ? ` and SPE.SPOOLED_FILE_NAME = ucase('${splfName}')` : ""}
      order by ${sort.order === 'name' ? 'SPE.SPOOLED_FILE_NAME' : 'SPE.CREATION_TIMESTAMP'} 
      ${!sort.ascending ? 'desc' : 'asc'} 
      , SPE.SPOOLED_FILE_NUMBER ${!sort.ascending ? 'desc' : 'asc'} 
      limit ${resultLimit}`.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);

    if (results.length === 0) {
      return [];
    }

    let searchFilter_ = searchFilter?.split(' ') || [];
    let returnSplfList = results
      .map(result => ({
        name: connection.sysNameInLocal(String(result.SPOOLED_FILE_NAME)),
        number: result.SPOOLED_FILE_NUMBER,
        status: connection.sysNameInLocal(String(result.STATUS)),
        creationTimestamp: result.CREATION_TIMESTAMP,
        userData: connection.sysNameInLocal(String(result.USER_DATA)) ?? undefined,
        size: Number(result.SIZE),
        totalPages: Number(result.TOTAL_PAGES),
        pageLength: String('0'),
        qualifiedJobName: connection.sysNameInLocal(String(result.QUALIFIED_JOB_NAME)),
        jobName: connection.sysNameInLocal(String(result.JOB_NAME)),
        jobUser: connection.sysNameInLocal(String(result.JOB_USER)),
        jobNumber: String(result.JOB_NUMBER),
        formType: connection.sysNameInLocal(String(result.FORM_TYPE)),
        queueLibrary: connection.sysNameInLocal(String(result.OUTPUT_QUEUE_LIBRARY)),
        queue: connection.sysNameInLocal(String(result.OUTPUT_QUEUE)),
      } as IBMiSpooledFile))
      .filter(obj => searchFilter_.length === 0 || searchFilter_.some(term => Object.values(obj).join(" ").includes(term)))
      ;

    return returnSplfList;

  }
  /**
  * Download the contents of a source member
  * 
  * @param {string} pPath 
  * @param {SplfOpenOptions} options 
  * @returns {string} a string containing spooled file data 
  */
  export async function downloadSpooledFileContent(pPath: string, options: SplfOpenOptions): Promise<string> {
    pPath = pPath.replace(/^\/+/, '') || '';
    const parts = breakUpPathFileName(pPath, options.namePattern);

    const connection = Code4i.getConnection();
    const tempRmt = connection.getTempRemote(pPath);
    const tmplclfile = await tmpFile();
    const splfName = options.spooledFileName||parts.get("name") || '';
    const splfNumber = options.spooledFileNumber||parts.get("number") || '';
    const qualifiedJobName = options.qualifiedJobName||parts.get("jobNumber") + '/' + parts.get("jobUser") + '/' + parts.get("jobName");
    let fileExtension = options.fileExtension||parts.get("fileExtension") || 'splf';

    const client = connection.client;
    let openMode: string = 'WithoutSpaces';
    let pageLength: number = 68;
    if (options) {
      openMode = options.openMode ? options.openMode.toString() : openMode;
      pageLength = options.pageLength ? Number(options.pageLength) : pageLength;
      fileExtension = options.fileExtension || fileExtension;
    }

    let retried = false;
    let retry = 1;
    // let fileEncoding :BufferEncoding|null = `utf8`;
    let fileEncoding: string | null = `utf8`;
    let cpysplfCompleted: CommandResult = { code: -1, stdout: ``, stderr: `` };
    let results: string = ``;
    let theStatement: string = ``;
    while (retry > 0) {
      retry--;
      try {
        //If this command fails we need to try again after we delete the temp remote
        switch (fileExtension.toLowerCase()) {
        case `pdf`:
          fileEncoding = null;
          // fileEncoding = ``;
          theStatement = `CPYSPLF FILE(${splfName}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*PDF) STMFOPT(*REPLACE)\nDLYJOB DLY(1)`;
          await connection.runCommand({
            command: theStatement
            , environment: `ile`
          });
          break;
        default:
          // With the use of CPYSPLF and CPY to create a text based stream file in 1208, there are possibilities that the data becomes corrupt
          // in the tempRmt object
          connection.sendCommand({
            command: `rm -f ${tempRmt}`
          });

          // fileExtension = `txt`;
          // DLYJOB to ensure the CPY command completes in time.
          theStatement = `CPYSPLF FILE(${splfName}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*NONE) STMFOPT(*REPLACE)`;
          if (openMode === 'withSpaces') {
            theStatement = theStatement + ` CTLCHAR(*PRTCTL)`;
          }
          theStatement = theStatement + ` \nDLYJOB DLY(1)\nCPY OBJ('${tempRmt}') TOOBJ('${tempRmt}') TOCCSID(1208) DTAFMT(*TEXT) REPLACE(*YES)`;
          cpysplfCompleted = await connection.runCommand({
            command: theStatement
            , environment: `ile`
          });
        }
      } catch (e) {
        if (String(e).startsWith(`CPDA08A`)) {
          if (!retried) {
            await connection.sendCommand({ command: `rm -f ${tempRmt}`, directory: `.` });
            retry++;
            retried = true;
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }

    await client.getFile(tmplclfile, tempRmt);
    results = await readFileAsync(tmplclfile, fileEncoding);
    if (cpysplfCompleted.code === 0 && openMode === 'withSpaces') {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
      }, async progress => {
        progress.report({
          message: l10n.t(`Adding line spacing to spooled file report`),
        });
        results = reWriteWithSpaces(results, pageLength);
      });
    }
    fs.unlink(tmplclfile, (err) => {
      if (err) { throw err; }
      // console.log('tmplclfile was deleted');
    });
    return results;

  }
  /**
   * Get extra Spooled File information, PAGE_LENGTH, for use mostly by the open with line spacing
   * 
   * @param {string} queues[] - OUTQ name
   * @param {string} queueLibraries[] - OUTQ library name
   * @param {string} spflNames[] - Spooled File name
   * @param {string} qualifiedJobName - optional - Spooled File qualified job ID
   * @param {string} spflNum - optional - Spooled File name+job sequence number
   * @returns a promised IBMiSpooledFile array, with the page length value 
  */
  export async function getSpooledPageLength(queues: string[], queueLibraries: string[], splfNames: string[], jobUsers: string[]
    , qualifiedJobName?: string, splfNum?: string): Promise<IBMiSpooledFile[]> {
    const OBJS = queues.map(queue => `'${queue}'`).join(', ');
    const OBJLIBS = queueLibraries.map(queueLibrary => `'${queueLibrary}'`).join(', ');
    const FILES = splfNames?.map(splfName => `'${splfName}'`).join(', ') || '';
    const USERS = jobUsers?.map(jobUser => `'${jobUser}'`).join(', ') || '';
    const objQuery = `select QE.OUTPUT_QUEUE_NAME ,QE.OUTPUT_QUEUE_LIBRARY_NAME
        ,QE.SPOOLED_FILE_NAME ,QE.FILE_NUMBER ,QE.JOB_NAME ,QE.USER_DATA ,QE.USER_NAME
        ,QE.PAGE_LENGTH
      from QSYS2.OUTPUT_QUEUE_ENTRIES QE
      where OUTQLIB in (${OBJLIBS}) and OUTQ in (${OBJS}) 
      ${FILES ? `and QE.SPOOLED_FILE_NAME in (${FILES})` : ``}
      ${USERS ? `and QE.USER_NAME in (${USERS})` : ``}
      ${qualifiedJobName ? ` and QE.JOB_NAME = '${qualifiedJobName}'` : ''}
      ${splfNum ? ` and QE.FILE_NUMBER = ${splfNum}` : ''}
      `.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    let pageLengths: IBMiSpooledFile[] = [];
    if (results.length >= 0) {
      pageLengths = results.map(result => ({
        queue: String(result.OUTPUT_QUEUE_NAME),
        queueLibrary: String(result.OUTPUT_QUEUE_LIBRARY_NAME),
        name: String(result.SPOOLED_FILE_NAME),
        qualifiedJobName: String(result.JOB_NAME),
        number: result.FILE_NUMBER,
        userData: String(result.USER_DATA),
        jobUser: String(result.USER_NAME),
        pageLength: String(result.PAGE_LENGTH)
      } as IBMiSpooledFile));
    } else {
      pageLengths = [];
    }
    return pageLengths;
  }
  /**
   * Get extra Spooled File information, DEVICE_TYPE, needed for determining the open file extension or if Spooled File can be opened
   * 
   * @param {string[]} queues - one or more OUTQ names
   * @param {string[]} queueLibrary - one or more OUTQ library names
   * @param {string} spflName - optional, Spooled File name, use to filter results
   * @param {string} qualifiedJobName - optional, Spooled File qualified job ID, use to filter results
   * @param {string} spflNum - optional, Spooled File name+job sequence number, use to filter results
   * @returns a promised array of type {@link IBMiSpooledFile}, only required entries plus `deviceType`
   */
  export async function getSpooledFileDeviceType(queues: string[], queueLibraries: string[], splfNames?: string[], jobUsers?: string[]
    , qualifiedJobName?: string, splfNum?: string): Promise<IBMiSpooledFile[]> {
    const OBJS = queues.map(queue => `'${queue}'`).join(', ');
    const OBJLIBS = queueLibraries.map(queueLibrary => `'${queueLibrary}'`).join(', ');
    const FILES = splfNames?.map(splfName => `'${splfName}'`).join(', ') || '';
    const USERS = jobUsers?.map(jobUser => `'${jobUser}'`).join(', ') || '';
    const objQuery = `select OUTPUT_QUEUE_NAME, OUTPUT_QUEUE_LIBRARY_NAME, SPOOLED_FILE_NAME, JOB_NAME, FILE_NUMBER, DEVICE_TYPE
      from QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC QE where OUTQLIB in (${OBJLIBS}) and OUTQ in (${OBJS}) 
      ${FILES ? `and QE.SPOOLED_FILE_NAME in (${FILES})` : ``}
      ${USERS ? `and QE.USER_NAME in (${USERS})` : ``}
      ${qualifiedJobName ? `and QE.JOB_NAME = '${qualifiedJobName}'` : ``}
      ${splfNum ? `and QE.FILE_NUMBER = '${splfNum}'` : ``}
      `.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    let treeFilter: IBMiSpooledFile[] = [];
    if (results.length >= 0) {
      treeFilter = results.map(result => ({
        name: String(result.SPOOLED_FILE_NAME),
        number: result.FILE_NUMBER,
        qualifiedJobName: String(result.JOB_NAME),
        queueLibrary: String(result.OUTPUT_QUEUE_LIBRARY_NAME),
        queue: String(result.OUTPUT_QUEUE_NAME),
        deviceType: String(result.DEVICE_TYPE)
      } as IBMiSpooledFile));
    } else {
      treeFilter = [];
    }
    return treeFilter;
    // return String(results[0].DEVICE_TYPE);
  }
  /**
   * Get extra Spooled File information, IBMiSplfCounts, for use mostly by the open with line spacing
   * 
   * @param {IBMISplfList} treeFilter 
   * @param {string} searchWord - optional, Additional words used to filter results
   * @returns a promised array of type, {@link IBMiSplfCounts} 
  */
  export async function getFilterSpooledFileCount(treeFilter: IBMISplfList, searchFilter?: string): Promise<IBMiSplfCounts> {
    let query = ``;
    const searchFilterU = searchFilter?.toLocaleUpperCase() || '';
    let queryParm = ``;
    if (treeFilter.type === 'USER') {
      queryParm = `USER_NAME => '${treeFilter.name}'`;
    } else if (treeFilter.type === 'OUTQ') {
      queryParm = `USER_NAME=> '*ALL', OUTPUT_QUEUE => '${treeFilter.library}/${treeFilter.name}'`;
    }

    if (treeFilter.type === 'USER' || treeFilter.type === 'OUTQ' && searchFilter) {
      query = `select count(*) SPLF_COUNT, sum(TOTAL_PAGES) TOTAL_PAGES
        from table (QSYS2.SPOOLED_FILE_INFO(${queryParm}) ) SPE 
        where FILE_AVAILABLE = '*FILEEND' 
        ${searchFilterU ? ` and (ucase(SPE.SPOOLED_FILE_NAME) like '%${searchFilterU}%'
                              or ucase(SPE.STATUS) like '%${searchFilterU}%'
                              or char(SPE.CREATION_TIMESTAMP) like '%${searchFilterU}%'
                              or ucase(SPE.USER_DATA) like '%${searchFilterU}%'
                              or ucase(SPE.QUALIFIED_JOB_NAME) like '%${searchFilterU}%'
                              or ucase(SPE.JOB_NAME) like '%${searchFilterU}%'
                              or ucase(SPE.JOB_USER) like '%${searchFilterU}%'
                              or ucase(SPE.JOB_NUMBER) like '%${searchFilterU}%'
                              or ucase(SPE.FORM_TYPE) like '%${searchFilterU}%'
                              or ucase(SPE.OUTPUT_QUEUE_LIBRARY) like '%${searchFilterU}%'
                              or ucase(SPE.OUTPUT_QUEUE) like '%${searchFilterU}%'
                        )` : ''}
        `.replace(/\n\s*/g, ' ');
    } else if (treeFilter.type === 'OUTQ' && !searchFilter) {
      query = `select NUMBER_OF_FILES SPLF_COUNT, 0 TOTAL_PAGES 
      from QSYS2.OUTPUT_QUEUE_INFO OQ
      ${treeFilter.library === `*LIBL` ? `inner join QSYS2.LIBRARY_LIST_INFO LL on OQ.OUTPUT_QUEUE_LIBRARY_NAME = LL.SYSTEM_SCHEMA_NAME` : ``}
      where OUTPUT_QUEUE_NAME = '${treeFilter.name}' 
      ${treeFilter.library !== `*LIBL` ? `and OUTPUT_QUEUE_NAME = '${treeFilter.library}'` : ``}
      limit 1`.replace(/\n\s*/g, ' ');
    }
    let results = await Code4i.runSQL(query);
    if (results.length === 0) {
      return { numberOf: ` ${treeFilter.name} has no spooled files`, totalPages: `` };
    }
    return { numberOf: String(results[0].SPLF_COUNT), totalPages: String(results[0].TOTAL_PAGES) };
  }
  /**
   * Get values deemed too expensive to get with the main list of spooled files in the treeview. 
   *  The return array also returns values for matching to in caller routines. 
   * 
   * @param {string[]} name one or more Filter names
   * @param {string} library optional, Filter by library
   * @param {string} type optional, Filter by type, `USER` or `OUTQ`
   * @returns a promised array of type, {@link IBMISplfList} 
  */
  export async function getFilterDescription(names: string[], library?: string, type?: string): Promise<IBMISplfList[]> {
    let OBJS = ``;
    if (Array.isArray(names)) {
      OBJS = names.map(name => `'${name}'`).join(', ');
      library = !library && library !== '*LIBL' ? '*LIBL' : library || '*LIBL';
    } else {
      OBJS = `'${names}'`;
      library = library || '*LIBL';
    }
    const objQuery = `select UT.OBJTEXT OBJECT_TEXT, OBJNAME, OBJLIB
    from table ( QSYS2.OBJECT_STATISTICS(OBJECT_SCHEMA => '${library}'
                                      , OBJTYPELIST => '${type === `OUTQ` ? `*OUTQ` : `*USRPRF,*MSGQ`}'
                                      , OBJECT_NAME => '*ALL') ) UT where OBJNAME in (${OBJS})
    `.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    let treeFilter: IBMISplfList[] = [];
    if (results.length >= 0) {
      treeFilter = results.map(result => ({
        library: String(result.OBJLIB),
        name: String(result.OBJLIB),
        text: String(result.OBJECT_TEXT || ""),
      } as IBMISplfList));
    } else {
      treeFilter = names.map(name => ({
        name: String(name),
        text: ` I dont know where to find the text for ${name}`
      } as IBMISplfList));
    }
    return treeFilter;
  }
  export async function updateNodeSpooledFileDeviceType(nodes: SpooledFiles[]): Promise<SpooledFiles[]> {
    const modifiedNodes: SpooledFiles[] = [];
    let deviceTypes: IBMiSpooledFile[];
    const filteredNodes: IBMiSpooledFile[] = filterNodes(nodes, isInvalidDeviceType);
    const distinctNames: string[] = [...new Set(filteredNodes.map(node => node.name))];
    const distinctUsers: string[] = [...new Set(filteredNodes.map(node => node.jobUser || ''))];
    const distinctQueues: string[] = [...new Set(filteredNodes.map(node => node.queue))];
    const distinctLibraries: string[] = [...new Set(filteredNodes.map(node => node.queueLibrary))];
    if (filteredNodes.length === 1) {
      deviceTypes = await getSpooledFileDeviceType(distinctQueues, distinctLibraries, distinctNames, distinctUsers
        , nodes[0].qualifiedJobName, nodes[0].number);
    } else if (filteredNodes.length > 1) {
      deviceTypes = await getSpooledFileDeviceType(distinctQueues, distinctLibraries, distinctNames, distinctUsers);
    } else {
      return nodes;
    }
    // for each node passed find if its Spooled file is among returned entries then update deviceType
    for (const node of nodes) {
      if (node.deviceType.length === 0) {
        const SPLF = deviceTypes.find(dT => {
          return dT.name === node.name && dT.qualifiedJobName === node.qualifiedJobName && dT.number === node.number;
        });
        node.deviceType = SPLF?.deviceType || node.deviceType || '*SCS';
      }
      modifiedNodes.push(node);
    }
    return modifiedNodes;
  }

  export async function updateNodeSpooledFilePageSize(nodes: SpooledFiles[]): Promise<SpooledFiles[]> {
    const modifiedNodes: SpooledFiles[] = [];
    let pageLengths: IBMiSpooledFile[];
    const filteredNodes: IBMiSpooledFile[] = filterNodes(nodes, isInvalidPageLength);
    const distinctNames: string[] = [...new Set(filteredNodes.map(node => node.name))];
    const distinctUsers: string[] = [...new Set(filteredNodes.map(node => node.jobUser || ''))];
    const distinctQueues: string[] = [...new Set(filteredNodes.map(node => node.queue))];
    const distinctLibraries: string[] = [...new Set(filteredNodes.map(node => node.queueLibrary))];
    if (filteredNodes.length === 1) {
      pageLengths = await getSpooledPageLength(distinctQueues, distinctLibraries, distinctNames, distinctUsers
        , nodes[0].qualifiedJobName, nodes[0].number);
    } else if (filteredNodes.length > 1) {
      pageLengths = await getSpooledPageLength(distinctQueues, distinctLibraries, distinctNames, distinctUsers);
    } else {
      return nodes;
    }
    // Apply the page lengths to the correct node entry.
    for (const node of nodes) {
      if (!node.deviceType || node.deviceType?.length === 0) {
        const SPLF = pageLengths.find(pL => pL.name === node.name
          && pL.queue === node.queue
          && pL.queueLibrary === node.queueLibrary
          && pL.qualifiedJobName === node.qualifiedJobName
          && pL.userData === node.userData
          && pL.number === node.number);
        node.pageLength = SPLF?.pageLength || node.pageLength || '68';
      }
      modifiedNodes.push(node);
    }
    return modifiedNodes;
  }
  export async function updateSpooledFileDeviceType(items: IBMiSpooledFile[]): Promise<IBMiSpooledFile[]> {
    const modifiedSpooledFiles: IBMiSpooledFile[] = [];
    let deviceTypes: IBMiSpooledFile[];
    const filtereditems: IBMiSpooledFile[] = items.filter(item => item.deviceType === undefined || item.deviceType === ``);
    const distinctNames: string[] = [...new Set(filtereditems.map(item => item.name))];
    const distinctUsers: string[] = [...new Set(filtereditems.map(item => item.jobUser || ''))];
    const distinctQueues: string[] = [...new Set(filtereditems.map(item => item.queue))];
    const distinctLibraries: string[] = [...new Set(filtereditems.map(item => item.queueLibrary))];
    if (filtereditems.length === 1) {
      deviceTypes = await getSpooledFileDeviceType(distinctQueues, distinctLibraries, distinctNames, distinctUsers
        , items[0].qualifiedJobName, items[0].number);
    } else if (filtereditems.length > 1) {
      deviceTypes = await getSpooledFileDeviceType(distinctQueues, distinctLibraries, distinctNames, distinctUsers);
    } else {
      return items;
    }
    // Apply device type value to the correct node entry.
    for (const item of items) {
      if (!item.deviceType || item.deviceType?.length === 0) {
        const SPLF = deviceTypes.find(dT => dT.name === item.name && dT.qualifiedJobName === item.qualifiedJobName && dT.number === item.number);
        item.deviceType = SPLF?.deviceType || item.deviceType || '*SCS';
      }
      modifiedSpooledFiles.push(item);
    }
    return modifiedSpooledFiles;
  }

}
function reWriteWithSpaces(originalResults: string, pageLength?: number) {
  let results: string = ``;
  let newLines: string[] = [];
  let lineCount: number = 0;
  let pageCount: number = 0;
  let remainLines: number = 0;
  pageLength = pageLength ? pageLength : 68;
  results = originalResults;
  let lines = originalResults.split(/\r\n|\r|\n/g);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // The value for the skipToLine/spaceToLine values include the actual text line,
    //   reduce by one line because we always print the text
    const skipToLine: number = line.substring(0, 3) === `   ` ? -9 : +line.substring(0, 3) - 1;
    const spaceToLines: number = line.substring(3, 4) === ` ` ? -9 : +line.substring(3, 4) - 1;
    line = line.substring(4);
    //     1. If skipTo is < lineCount then  
    //     -- newPageAction
    //     1. print blank lines for skipTo-1 quantity
    //   else 
    //     if skipTo >= lineCount then 
    //       1. print blank lines for (skipTo-1-lineCount) quantity
    //     else
    //     if spaceTo > 0 then 
    //       1. print blank lines for spaceTo-1 quantity
    //    2. print text line
    if (skipToLine > -9) {
      if (skipToLine < lineCount) {
        // If we have just a few lines to go from last print line to end of page def
        // produce up to three additional blank lines before actual new page content.
        if (pageLength > lineCount) {
          for (let l = 1; l <= 3; l++) { newLines.push(``); }
        }
        // This condition should be every new subsequent page
        for (let l = lineCount; l < lineCount + skipToLine; l++) { newLines.push(``); /*lineCount++;*/ }
        lineCount = 0;
        pageCount++;
      } else {
        if (skipToLine >= lineCount) {
          // Sometimes when reports have more than 3 blank lines the system 
          // does a skipTo line value instead of a space to in the middle of a report page
          // so this acts like a large spaceTo value. 
          for (let l = lineCount; l < skipToLine; l++) { newLines.push(``); lineCount++; }
        }
      }
    }
    else if (spaceToLines === -1) {
      if (lineCount > 0) {
        let newLine = newLines[newLines.length - 1];
        newLines[newLines.length - 1] = overlayLine(newLine, line);
        continue;
      }
    }
    else if (spaceToLines > 0) {
      for (let l = 1; l <= spaceToLines; l++) { newLines.push(``); lineCount++; }
    }

    newLines.push(line);// Each true print line is always put to newLines
    lineCount++;
  }

  results = newLines.join('\r\n');

  return results;
}
function overlayLine(line: string, newLine: string): string {
  const ll = line.length;
  for (let c = 0; c < ll; c++) {
    // Match to any space character
    let newLineSpaceChar: RegExpMatchArray | null = newLine.substring(c, c + 1).match(/[ ]/i);
    // Match to non-alphabet and space chars to replace
    let lineMatchAlphaSpace: RegExpMatchArray | null = line.substring(c, c + 1).match(/[a-z ]/i);
    if (!newLineSpaceChar && !lineMatchAlphaSpace) {
      line = setCharAt(line, c, newLine.substring(c, c + 1));
    }
  }
  return line;
}
function setCharAt(str: string, index: number, chr: string) {
  if (index > str.length - 1) { return str; }
  return str.substring(0, index) + chr + str.substring(index + 1);
}