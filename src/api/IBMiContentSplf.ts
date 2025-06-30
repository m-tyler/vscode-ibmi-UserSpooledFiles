import fs from 'fs';
import tmp from 'tmp';
import util from 'util';
import vscode, { l10n, } from 'vscode';
import { Code4i } from '../tools';
import { IBMiSpooledFile, SplfOpenOptions, IBMiSplfCounts, IBMiSplf } from '../typings';
import { CommandResult } from '@halcyontech/vscode-ibmi-types';

const tmpFile = util.promisify(tmp.file);
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);


export type SortOptions = {
  order: "name" | "date" | "?"
  ascending?: boolean
};
export namespace IBMiContentSplf {
  /**
  * @param {IBMiSplf} item 
  * @param {string} SortOptions
  * @param {string=} splfName
  * @returns {Promise<IBMiSpooledFile[]>}
  */
  export async function getSpooledFileFilter(item: IBMiSplf
    , sort: SortOptions = { order: "date", ascending: true }
    , splfName?: string
    , searchWords?: string
    , resultLimit?: number
  ): Promise<IBMiSpooledFile[]> {
    const connection = Code4i.getConnection();

    sort.order = sort.order || { order: 'date', ascending: 'asc' };
    resultLimit = resultLimit || 10000;
    let queryParm = ``;
    if (item.type === 'USER') {
      queryParm = `USER_NAME => '${item.name}'`;
    } else if (item.type === 'OUTQ') {
      queryParm = `USER_NAME=> '*ALL', OUTPUT_QUEUE => '${item.library}/${item.name}'`;
    }

    const objQuery = `select SPE.SPOOLED_FILE_NAME, SPE.SPOOLED_FILE_NUMBER, SPE.STATUS, SPE.CREATION_TIMESTAMP
    , SPE.USER_DATA, SPE.SIZE, SPE.TOTAL_PAGES, SPE.QUALIFIED_JOB_NAME, SPE.JOB_NAME, SPE.JOB_USER, SPE.JOB_NUMBER, SPE.FORM_TYPE
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
    // results = results.sort((a, b) => String(a.MBSPOOLED_FILE_NAMENAME).localeCompare(String(b.SPOOLED_FILE_NAME)));

    let searchWords_ = searchWords?.split(' ') || [];

    // return results
    let returnSplfList = results
      .map(object => ({
        name: connection.sysNameInLocal(String(object.SPOOLED_FILE_NAME)),
        number: object.SPOOLED_FILE_NUMBER,
        status: connection.sysNameInLocal(String(object.STATUS)),
        creationTimestamp: object.CREATION_TIMESTAMP,
        userData: connection.sysNameInLocal(String(object.USER_DATA)),
        size: Number(object.SIZE),
        totalPages: Number(object.TOTAL_PAGES),
        pageLength: String('0'),
        qualifiedJobName: connection.sysNameInLocal(String(object.QUALIFIED_JOB_NAME)),
        jobName: connection.sysNameInLocal(String(object.JOB_NAME)),
        jobUser: connection.sysNameInLocal(String(object.JOB_USER)),
        jobNumber: String(object.JOB_NUMBER),
        formType: connection.sysNameInLocal(String(object.FORM_TYPE)),
        queueLibrary: connection.sysNameInLocal(String(object.OUTPUT_QUEUE_LIBRARY)),
        queue: connection.sysNameInLocal(String(object.OUTPUT_QUEUE)),
      } as IBMiSpooledFile))
      .filter(obj => searchWords_.length === 0 || searchWords_.some(term => Object.values(obj).join(" ").includes(term)))
      ;

    return returnSplfList;

  }
  /**
  * Download the contents of a source member
  * @param {string} uriPath 
  * @param {SplfOpenOptions} options 
  * @returns {string} a string containing spooled file data 
  */
  export async function downloadSpooledFileContent(uriPath: string, options: SplfOpenOptions) {
    const path = uriPath.split(`/`);
    const nameParts = path[2].split(`~`);
    const name = nameParts[0];
    const qualifiedJobName = nameParts[3] + '/' + nameParts[2] + '/' + nameParts[1];
    const splfNumber = nameParts[4].replace(`.splf`, ``);

    const connection = Code4i.getConnection();
    const tempRmt = connection.getTempRemote(uriPath);
    const tmplclfile = await tmpFile();

    const client = connection.client;
    let openMode: string = 'WithoutSpaces';
    let pageLength: number = 68;
    let fileExtension = `splf`;
    if (options) {
      openMode = options.openMode ? options.openMode.toString() : openMode;
      pageLength = options.pageLength ? Number(options.pageLength) : pageLength;
      fileExtension = options.fileExtension ? options.fileExtension : fileExtension;
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
          theStatement = `CPYSPLF FILE(${name}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*PDF) STMFOPT(*REPLACE)\nDLYJOB DLY(1)`;
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
          theStatement = `CPYSPLF FILE(${name}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*NONE) STMFOPT(*REPLACE)`;
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
  */
  export async function getSpooledPageLength(splfName: string, qualifiedJobName: string, splfNum: string
                                          , queue: string, queueLibrary: string): Promise<string> {
    const objQuery = `select PAGE_LENGTH
    from table (QSYS2.OUTPUT_QUEUE_ENTRIES(OUTQ_LIB => '${queueLibrary}', OUTQ_NAME => '${queue}', DETAILED_INFO => 'YES') ) QE 
    where QE.SPOOLED_FILE_NAME = '${splfName}' and QE.JOB_NAME = '${qualifiedJobName}' and QE.FILE_NUMBER = ${splfNum}`.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    if (results.length === 0) {
      return ` Spooled file ${splfName} in job ${qualifiedJobName} report number ${splfNum} was not found.`;
    }
    return String(results[0].PAGE_LENGTH);
  }
  export async function getSpooledFileDeviceType(splfName: string, qualifiedJobName: string, splfNum: string
                                                    , queue: string, queueLibrary: string): Promise<string> {
    const objQuery = `select DEVICE_TYPE
    from table (QSYS2.OUTPUT_QUEUE_ENTRIES(OUTQ_LIB => '${queueLibrary}', OUTQ_NAME => '${queue}', DETAILED_INFO => 'YES') ) QE 
    where QE.SPOOLED_FILE_NAME = '${splfName}' and QE.JOB_NAME = '${qualifiedJobName}' and QE.FILE_NUMBER = ${splfNum}`.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    if (results.length === 0) {
      return ` Spooled file ${splfName} in job ${qualifiedJobName} report number ${splfNum} was not found.`;
    }
    return String(results[0].DEVICE_TYPE);
  }
  /**
  * @param {string} name
  * @param {string} library
  * @param {string} type
  * @returns {Promise<String>} a string with the count of spooled file for `name`
  */
  export async function getFilterSpooledFileCount(name: string, library: string,type: string, searchWord?: string): Promise<IBMiSplfCounts> {
    let queryParm = ``;
    if (type === 'USER') {
      queryParm = `USER_NAME => '${name}'`;
    } else if (type === 'OUTQ') {
      queryParm = `USER_NAME=> '*ALL', OUTPUT_QUEUE => '${library}/${name}'`;
    }
    let objQuery = `select count(*) SPLF_COUNT, sum(TOTAL_PAGES) TOTAL_PAGES
      from table (QSYS2.SPOOLED_FILE_INFO(${queryParm}) ) SPE 
      where FILE_AVAILABLE = '*FILEEND' 
      `.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    if (results.length === 0) {
      return { numberOf: ` ${name} has no spooled files`, totalPages: `` };
    }
    return { numberOf: String(results[0].SPLF_COUNT), totalPages: String(results[0].TOTAL_PAGES) };
  }
  /**
  * @param {string} name
  * @param {string} library?
  * @param {string} type?
  * @returns a promised string for item.name text 
  */
  export async function getFilterDescription(name: string, library?: string, type?: string): Promise<string | undefined> {
    const objQuery = `select regexp_replace(UT.OBJTEXT,'Programmer - ','',1,0,'i') USER_PROFILE_TEXT
    from table ( QSYS2.OBJECT_STATISTICS(OBJECT_SCHEMA => '${library?library:`*LIBL`}'
                                      , OBJTYPELIST => '${type===`OUTQ`?`*OUTQ`:`*MSGQ`}'
                                      , OBJECT_NAME => '${name}') ) UT 
    limit 1`.replace(/\n\s*/g, ' ');
    let results = await Code4i.runSQL(objQuery);
    if (results.length === 0) {
      return ` I dont know where to find the text for ${name}`;
    }
    const itemText: string = String(results[0].USER_PROFILE_TEXT);
    return itemText;
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