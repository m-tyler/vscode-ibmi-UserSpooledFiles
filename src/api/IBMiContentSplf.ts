import fs from 'fs';
import tmp from 'tmp';
import util from 'util';
import { Code4i, makeid } from '../tools';
import { IBMiSpooledFile, SplfOpenOptions } from '../typings';
import { CommandResult } from '@halcyontech/vscode-ibmi-types';
const tmpFile = util.promisify(tmp.file);
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);


export type SortOrder = `name` | `type`;

export type SortOptions = {
  order: "name" | "date" | "?"
  ascending?: boolean
}
export namespace IBMiContentSplf {
  /**
  * @param {string} user 
  * @param {string} sortOrder
  * @param {string=} splfName
  * @returns {Promise<IBMiSpooledFile[]>}
  */
  export async function getUserSpooledFileFilter(user: string, sort: SortOptions = { order: "date" }, splfName?: string, searchWords?: string): Promise<IBMiSpooledFile[]> {
    const connection = Code4i.getConnection();

    sort.order = sort.order || { order: 'date' ,ascending:'asc'};
    user = user.toUpperCase();

    var objQuery;
    // let results: Tools.DB2Row[];

    objQuery = `select SPE.SPOOLED_FILE_NAME, SPE.SPOOLED_FILE_NUMBER, SPE.STATUS, SPE.CREATION_TIMESTAMP, SPE.USER_DATA, SPE.SIZE, SPE.TOTAL_PAGES, SPE.QUALIFIED_JOB_NAME, SPE.JOB_NAME, SPE.JOB_USER, SPE.JOB_NUMBER, SPE.FORM_TYPE, SPE.OUTPUT_QUEUE_LIBRARY, SPE.OUTPUT_QUEUE, QE.PAGE_LENGTH from table (QSYS2.SPOOLED_FILE_INFO(USER_NAME => ucase('${user}')) ) SPE left join TABLE(QSYS2.OUTPUT_QUEUE_ENTRIES( SPE.OUTPUT_QUEUE_LIBRARY, SPE.OUTPUT_QUEUE,  DETAILED_INFO => 'YES')) QE on QE.SPOOLED_FILE_NAME = SPE.SPOOLED_FILE_NAME and QE.JOB_NAME = SPE.QUALIFIED_JOB_NAME and QE.FILE_NUMBER = SPE.SPOOLED_FILE_NUMBER where SPE.FILE_AVAILABLE = '*FILEEND' ${splfName ? ` and SPE.SPOOLED_FILE_NAME = ucase('${splfName}')` : ""}
    order by ${sort.order === 'name' ? 'SPE.SPOOLED_FILE_NAME' : 'SPE.CREATION_TIMESTAMP'} ${!sort.ascending ? 'desc' : 'asc'}`;
    let results = await Code4i!.runSQL(objQuery);

    if (results.length === 0) {
      return [];
    }
    results = results.sort((a, b) => String(a.MBSPOOLED_FILE_NAMENAME).localeCompare(String(b.SPOOLED_FILE_NAME)));

    let searchWords_ = searchWords?.split(' ') || [];

    // return results
    let returnSplfList = results
      .map(object => ({
        user: user,
        name: connection.sysNameInLocal(String(object.SPOOLED_FILE_NAME)),
        number: Number(object.SPOOLED_FILE_NUMBER),
        status: connection.sysNameInLocal(String(object.STATUS)),
        creationTimestamp: object.CREATION_TIMESTAMP,
        userData: connection.sysNameInLocal(String(object.USER_DATA)),
        size: Number(object.SIZE),
        totalPages: Number(object.TOTAL_PAGES),
        pageLength: Number(object.PAGE_LENGTH),
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
  * @param {string} name 
  * @param {string} qualifiedJobName 
  * @param {string} splfNumber 
  * @param {string} fileExtension 
  * @param {string=} additionalPath 
  * @returns {string} a string containing spooled file data 
  */
  export async function downloadSpooledFileContent(uriPath: string, name: string, qualifiedJobName: string, splfNumber: string
    , fileExtension: string, options?: SplfOpenOptions, additionalPath?: string) {
    name = name.toUpperCase();
    qualifiedJobName = qualifiedJobName.toUpperCase();
    const connection = Code4i.getConnection();

    const tempRmt = connection.getTempRemote(uriPath);
    const tmplclfile = await tmpFile();

    // const tmpName = path.basename(tempRmt);
    // const tmpFolder = path.dirname(tempRmt) + (additionalPath ? `/${additionalPath}` : ``);
    // const path = homeDirectory +(folder !== undefined ? '/'+folder :'');

    const client = connection.client;
    let openMode: string = 'WithSpaces';
    let pageLength: number = 68;
    if (options) {
      openMode = options.openMode ? options.openMode.toString() : ``;
      pageLength = options.pageLength ? options.pageLength : 68;
    }

    let retried = false;
    let retry = 1;
    // let fileEncoding :BufferEncoding|null = `utf8`;
    let fileEncoding = `utf8`;
    let cpysplfCompleted: CommandResult = { code: -1, stdout: ``, stderr: `` };
    let results: string = ``;
    while (retry > 0) {
      retry--;
      try {
        //If this command fails we need to try again after we delete the temp remote
        switch (fileExtension.toLowerCase()) {
          case `pdf`:
            // fileEncoding = null;
            fileEncoding = ``;
            await connection.runCommand({
              command: `CPYSPLF FILE(${name}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*PDF) STMFOPT(*REPLACE)\nDLYJOB DLY(1)`
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
            cpysplfCompleted = await connection.runCommand({
              command: `CPYSPLF FILE(${name}) TOFILE(*TOSTMF) JOB(${qualifiedJobName}) SPLNBR(${splfNumber}) TOSTMF('${tempRmt}') WSCST(*NONE) STMFOPT(*REPLACE) ${openMode == 'withSpace' ? `CTLCHAR(*PRTCTL)` : ``} \nDLYJOB DLY(1)\nCPY OBJ('${tempRmt}') TOOBJ('${tempRmt}') TOCCSID(1208) DTAFMT(*TEXT) REPLACE(*YES)`
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
    if (cpysplfCompleted.code === 0 && openMode == 'withSpace') {
      // todo: need to read first temp file, process control characters and write a new tempfile to pass to rest of code
      const tempRmt2 = connection.getTempRemote(uriPath);
      results = reWriteWithSpaces(results, pageLength); 
      // results = reWriteWithSpaces(results);
    }
    return results

  }
  /**
  * @param {string} user
  * @param {string=} splfName
  * @returns {Promise<String>} a string with the count of spooled file for user
  */
  export async function getUserSpooledFileCount(user: string, splfName?: string, searchWord?: string): Promise<string> {
    user = user.toUpperCase();

    // let results: Tools.DB2Row[];

    const objQuery = `select count(*) USER_SPLF_COUNT
    from table (QSYS2.SPOOLED_FILE_INFO(USER_NAME => '${user}') ) SPE 
    where FILE_AVAILABLE = '*FILEEND' ${splfName ? `and SPE.SPOOLED_FILE_NAME = ucase('${splfName}')` : ""} 
    group by SPE.JOB_USER` ;
    let results = await Code4i!.runSQL(objQuery);
    if (results.length === 0) {
      return ` ${user} user has no spooled files`;
    }
    // const resultSet = await Code4i!.runSQL(`SELECT * FROM QSYS2.ASP_INFO`);
    return String(results[0].USER_SPLF_COUNT);
  }
  /**
  * @param {string} user
  * @returns a promised string for user profile text 
  */
  export async function getUserProfileText(user: string): Promise<string | undefined> {
    user = user.toUpperCase();

    // let results: Tools.DB2Row[];

    // Note: this line does not work for most *USRPRFs because as a regular programmer I dont have access to see the profile
    // from table ( QSYS2.OBJECT_STATISTICS(OBJECT_SCHEMA => 'QSYS', OBJTYPELIST => '*USRPRF', OBJECT_NAME => '${user}') ) UT 
    const objQuery = `select regexp_replace(UT.OBJTEXT,'Programmer - ','',1,0,'i') USER_PROFILE_TEXT
    from table ( QSYS2.OBJECT_STATISTICS(OBJECT_SCHEMA => '*LIBL', OBJTYPELIST => '*MSGQ', OBJECT_NAME => '${user}') ) UT 
    limit 1`;
    let results = await Code4i!.runSQL(objQuery);
    if (results.length === 0) {
      return ` I dont know where to find the text for ${user}`;
    }
    const userText: string = String(results[0].USER_PROFILE_TEXT);
    return userText;
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
    const skipToLine: number = line.substring(0, 3) == `   ` ? -1 : +line.substring(0, 3) - 1;
    const spaceToLines: number = line.substring(3, 4) == ` ` ? -1 : +line.substring(3, 4) - 1;
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
    if (skipToLine > -1) {
      if (skipToLine < lineCount) {
        // If we have just a few lines to go from last print line to end of page def
        // produce up to three additional blank lines before actual new page content.
        if (pageLength >lineCount) {
          for (let l = 1; l <= 3; l++) { newLines.push(``); }
        }
        // This condition shold be every new subsequent page
        for (let l = lineCount; l < lineCount+skipToLine; l++) { newLines.push(``); lineCount++; }
        lineCount = 0;
        pageCount++;
      } else {
        if (skipToLine >= lineCount) {
          // Somethimes when reports have more than 3 blank lines the system 
          // does a skipTo line value instead of a space to in the middle of a report page
          // so this acts like a large spaceTo value. 
          for (let l = lineCount; l < skipToLine; l++) { newLines.push(``); lineCount++; }
        }
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