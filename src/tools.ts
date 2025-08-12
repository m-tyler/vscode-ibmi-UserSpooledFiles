import type { MemberParts } from '@halcyontech/vscode-ibmi-types/api/IBMi';
import { FilterType } from '@halcyontech/vscode-ibmi-types/api/Filter';
import { IBMiMember } from '@halcyontech/vscode-ibmi-types';
import { CommandResult, RemoteCommand, IBMiObject } from '@halcyontech/vscode-ibmi-types';
import { SortOrder } from '@halcyontech/vscode-ibmi-types/api/IBMiContent';
import { Tools } from '@halcyontech/vscode-ibmi-types/api/Tools';
import vscode from "vscode";
import { FuncInfo, IBMiSpooledFile, SplfOpenOptions } from './typings';
import { posix } from "path";
import { loadBase, getBase } from './base';


export namespace Code4i {
  export async function initialize(context: vscode.ExtensionContext) {
    loadBase(context);
  }
  export function getInstance() {
    return getBase()!.instance;
  }
  export function getConnection() {
    return getInstance().getConnection();
  }
  export function getConfig() {
    return getInstance().getConnection().getConfig();
  }
  export function getContent() {
    return getInstance().getConnection().getContent();
  }
  export function customUI() {
    return getBase()?.customUI();
  }
  export function getTempLibrary(): string {
    return getConfig().tempLibrary;
  }
  export function parserMemberPath(string: string, checkExtension?: boolean): MemberParts {
    return getInstance().getConnection().parserMemberPath(string, checkExtension);
  }
  export function getObjectList(filters: {
    library: string;
    object?: string;
    types?: string[];
    filterType?: FilterType;
  }, sortOrder?: SortOrder): Promise<IBMiObject[]> {
    return getInstance().getConnection().getContent().getObjectList(filters, sortOrder);
  }
  // export async function getUserProfileText(user: string): Promise<string | undefined> {
  //   return getInstance().getConnection().getContent().getUserProfileText(user);
  // }
  export function sysNameInLocal(string: string): string {
    return getInstance().getConnection().sysNameInLocal(string);
  }

  // export async function getTable(library: string, name: string): Promise<Tools.DB2Row[]> {
  //     return getContent().getTable(library, name, name, true);
  // }

  export async function runSQL(sqlStatement: string, options?: { fakeBindings?: (string | number)[]; forceSafe?: boolean; }): Promise<Tools.DB2Row[]> {
    return getContent().ibmi.runSQL(sqlStatement, options || undefined);
  }

  export async function runCommand(command: RemoteCommand): Promise<CommandResult> {
    return await getConnection().runCommand(command);
  }
  export async function getMemberInfo(library: string, sourceFile: string, member: string): Promise<IBMiMember | undefined> {
    return await getConnection().getContent().getMemberInfo(library, sourceFile, member);
  }
  export function makeid(length?: number) {
    return getBase()!.tools.makeid(length);
  }
  export function getLibraryIAsp(library: string): string | undefined {
    return getConnection().getLibraryIAsp(library);
  }
  export function getCurrentIAspName(): string | undefined {
    return getConnection().getCurrentIAspName();
  }
  export function lookupLibraryIAsp(library: string): Promise<string | undefined> {
    return getConnection().lookupLibraryIAsp(library);
  }
}

export const IBMI_OBJECT_NAME = /^([\w$#@][\w\d$#@_.]{0,9})$/i;

// export function getQSYSObjectPath(library: string, name: string, type: string, member?: string, iasp?: string) {
//   return `${iasp ? `/${iasp.toUpperCase()}` : ''}/QSYS.LIB/${library.toUpperCase()}.LIB/${name.toUpperCase()}.${type.toUpperCase()}${member ? `/${member.toUpperCase()}.MBR` : ''}`;
// }

// export function makeid(length?: number) {
//   return codeForIBMi.tools.makeid(length);
// }
// export function getInstance(): Instance | undefined {
//   return (baseExtension && baseExtension.isActive && baseExtension.exports ? baseExtension.exports.instance : undefined);
// }
export function sanitizeSearchTerm(searchTerm: string): string {
  return searchTerm.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`);
}
export function nthIndex(aString: string, pattern: string, n: number) {
  let index = -1;
  while (n-- && index++ < aString.length) {
    index = aString.indexOf(pattern, index);
    if (index < 0) { break; }
  }
  return index;
}
// export async function checkObject(library: string, name: string, type: string) {
//   return await Code4i.getContent().checkObject({ library, name, type });
// };
export function buildPathFileNamefromPattern(filterType: string, splf: IBMiSpooledFile): string {
  let newName = ``;
  if (filterType === 'OUTQ') {
    newName = `${splf.queueLibrary}/${splf.queue}/`;
  } else {
    newName = `${splf.jobUser}/${splf.queue}/`;
  }
  let counter = 0;
  // get from config
  const splfBrowserConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser');
  let namePattern: string = splfBrowserConfig.get<string>('spooledFileNamePattern') || '';
  if (namePattern.length === 0) { namePattern = `name,jobName,jobUser,jobNumber,number`; }
  // pattern values are separated by commas.  
  const patterns = namePattern.split(/,\s*/);
  // append pattern to end of passed in name.
  patterns.forEach(element => {
    if (counter > 0) {
      newName += '~';
    }
    counter++;
    switch (element) {
    case `name`:
      newName += splf.name;
      break;
    case `number`:
      newName += splf.number;
      break;
    case `status`:
      newName += splf.status;
      break;
    case `creationTimestamp`:
      newName += splf.creationTimestamp;
      break;
    case `userData`:
      newName += splf.userData;
      break;
    case `size`:
      newName += splf.size;
      break;
    case `totalPages`:
      newName += splf.totalPages;
      break;
    case `pageLength`:
      newName += splf.pageLength;
      break;
    // case `qualifiedJobName`:
    //   newName += splf.qualifiedJobName.replace(/[/]/, '-');
    //   break;
    case `jobName`:
      newName += splf.jobName;
      break;
    case `jobUser`:
      newName += splf.jobUser;
      break;
    case `jobNumber`:
      newName += splf.jobNumber;
      break;
    case `formType`:
      newName += splf.formType;
      break;
    case `queueLibrary`:
      newName += splf.queueLibrary;
      break;
    case `queue`:
      newName += splf.queue;
      break;
    default:
    }
  });

  return newName;
}
export function getMyConfig(configName: string) { 
  const myConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser');
  let mySpooledConfig: string = myConfig.get<string>(`${configName}`) || '';

  return mySpooledConfig;
}
export function breakUpPathFileName(pPath: string, namePattern?: string): Map<string,string> {
  const myConfig = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser');
  namePattern = namePattern||myConfig.get<string>('spooledFileNamePattern') || '';
  if (namePattern.length === 0) { namePattern = `name,jobName,jobUser,jobNumber,number`; }
  
  // pattern values are separated by commas.  
  const patterns = namePattern.split(/,\s*/);
  const pathParts = pPath.split('/');
  const nameParts = pathParts.at(-1)?.split(/[~.]/)??[];
  
  const namePartMap: Map<string, string> = new Map();
  // map this user ID
  // map the outq name
  namePartMap.set('userOutqLib',pathParts[0]);
  namePartMap.set('queue',pathParts[1]);
  
  for (let i = 0; i < patterns.length; i++) {
    namePartMap.set(patterns[i],nameParts[i]);
  }

  return namePartMap;
}
export async function whereIsCustomFunc(funcName: string): Promise<FuncInfo> {
  // Look for the custom function somewhere
  let currentUser = '';
  const connection = Code4i.getConnection();
  const content = Code4i.getContent();
  if (connection) {
    currentUser = connection.currentUser;
  }
  let funcLookupRS: Tools.DB2Row[];
  let statement = `select SPECIFIC_SCHEMA,SPECIFIC_NAME,ROUTINE_TEXT,LONG_COMMENT 
    from QSYS2.SYSFUNCS SF 
    inner join table( values(1,'${currentUser}'),(2,'ILEDITOR'),(3,'SYSTOOLS'),(4,'QSYS2') ) LL (Pos, ASCHEMA) 
    on ASCHEMA = SPECIFIC_SCHEMA where ROUTINE_NAME = '${funcName}' limit 1`.replace(/\n\s*/g, ' ');
  funcLookupRS = await Code4i.runSQL(statement);
  return {
    funcSysLib: String(funcLookupRS[0].SPECIFIC_SCHEMA),
    funcSysName: String(funcLookupRS[0].SPECIFIC_NAME),
    text: String(funcLookupRS[0].ROUTINE_TEXT),
    comment: String(funcLookupRS[0].LONG_COMMENT)
  };
}

export async function checkSystemFunctionState(sysFunction: string, action: string): Promise<boolean> {

  let lstate: boolean;
  const content = Code4i.getContent();
  const connection = Code4i.getConnection();

  if (sysFunction !== "SPOOLED_FILE_DATA") {
    return false;
  }
  else {
    let funcInfo: FuncInfo = await whereIsCustomFunc('SPOOLED_FILE_DATA');
    // Check to see if function updated 
    if (funcInfo.funcSysLib !== `ILEDITOR` && action === `add`) {
      return connection.withTempDirectory(async tempDir => {
        const tempSourcePath = posix.join(tempDir, `overrideSPOOLED_FILE_DATA_Funcition.sql`);

        await content.writeStreamfileRaw(tempSourcePath, getSource(`SPOOLED_FILE_DATA`, Code4i.getTempLibrary()));
        const result = await connection.runCommand({
          command: `RUNSQLSTM SRCSTMF('${tempSourcePath}') COMMIT(*NONE) NAMING(*SQL)`,
          cwd: `/`,
          noLibList: true
        });

        if (result.code === 0) {
          lstate = true;
        } else {
          lstate = false;
        }

        return lstate;
      });
    }
    else if (funcInfo.funcSysLib === `ILEDITOR` && action === `drop`) {
      return connection.withTempDirectory(async tempDir => {
        await Code4i.runSQL(`drop function if exists ${Code4i.getTempLibrary()}.SPOOLED_FILE_DATA`);
        return true;
      });
    }
    return true; // Function installed in product library
  }
}
export function buildQueryParms(values:SplfOpenOptions): string {
  let qp = '?readonly='+values.readonly+'&splfName='+values.spooledFileName+'&splfNum='+values.spooledFileNumber
            +'&qjn='+values.qualifiedJobName;
  return qp;
}
export function fillEmptyFields<T extends Record<string,any>>(target: T, source: T):T {
  const result = {...target};
  for (const key in target) {
    const val = target[key];
    const isEmpty = val === undefined || val === null || val === undefined
                    ||(typeof val === 'string' && val.trim() === '')
    ;
    if (isEmpty && source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;

}
export function mergeObjects<T extends Record<string,any>>(target: T, source: T):T {
  const result = {...target};
  for (const key in source) {
    if (!(key in target)) {
      result[key] = source[key];
    }
  }
  return result;

}
function getSource(func: string, library: string) {
  switch (func) {
  case `SPOOLED_FILE_DATA`:
    if (library !== 'ILEDITOR') { return Buffer.from([``].join(`\n`), "utf8"); }
    return Buffer.from([
      `--  Generate SQL `
      , `--  Original Version:           	V7R5M0 220415 `
      , `--  Generated on:              	07/18/24 08:11:06 `
      , `--  Relational Database:       	WIASP `
      , `--  Standards Option:          	Db2 for i `
      , `--  Created to replace system version and add 'FOR MIXED DATA' to create table stmt`
      , `SET PATH "QSYS","QSYS2","SYSPROC","SYSIBMADM" ; `
      , ``
      , `CREATE FUNCTION ${library}.SPOOLED_FILE_DATA ( `
      , `	JOB_NAME VARCHAR(28) , `
      , `	SPOOLED_FILE_NAME VARCHAR(10) DEFAULT  'QPJOBLOG'  , `
      , `	SPOOLED_FILE_NUMBER VARCHAR(6) DEFAULT  '*LAST'  , `
      , `	IGNORE_ERRORS VARCHAR(3) DEFAULT  'YES'  ) `
      , `	RETURNS TABLE ( `
      , `	ORDINAL_POSITION INTEGER , `
      , `	SPOOLED_DATA VARCHAR(378) ) `
      , `	LANGUAGE SQL `
      , `	SPECIFIC ${library}.SPOOL_FILE `
      , `	NOT DETERMINISTIC `
      , `	MODIFIES SQL DATA `
      , `	CALLED ON NULL INPUT `
      , `	NOT FENCED `
      , `	SYSTEM_TIME SENSITIVE NO `
      , `	SET OPTION  ALWBLK = *ALLREAD , ALWCPYDTA = *OPTIMIZE , COMMIT = *NONE , `
      , `	DECRESULT = (31, 31, 00) , DFTRDBCOL = QSYS2 , `
      , `	DLYPRP = *NO , DYNDFTCOL = *NO , DYNUSRPRF = *USER , SRTSEQ = *HEX `
      , `BEGIN `
      , `    DECLARE ERROR_V BIGINT DEFAULT 0 ; `
      , `  IF IGNORE_ERRORS <> 'YES' AND IGNORE_ERRORS <> 'NO' THEN `
      , `    BEGIN `
      , `      SIGNAL SQLSTATE '22023' `
      , `      SET MESSAGE_TEXT = 'IGNORE_ERRORS MUST BE ''YES'' OR ''NO''' ; `
      , `    END ; `
      , `  END IF ; `
      , `  BEGIN `
      , `    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET ERROR_V = 1 ; `
      , `    CREATE OR REPLACE TABLE QTEMP.QIBM_SFD ( SPOOLED_DATA CHAR ( 378 ) FOR MIXED DATA ) `
      , `    ON REPLACE DELETE ROWS ; `
      , `  END ; `
      , `  BEGIN `
      , `    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET ERROR_V = 2 ; `
      , `    CALL QSYS2.QCMDEXC ( 'QSYS/CPYSPLF     FILE(' CONCAT SPOOLED_FILE_NAME CONCAT `
      , `    ') TOFILE(QTEMP/QIBM_SFD) JOB(' CONCAT JOB_NAME CONCAT `
      , `    ') MBROPT(*REPLACE) SPLNBR(' CONCAT SPOOLED_FILE_NUMBER CONCAT ') OPNSPLF(*YES)' ) ; `
      , `  END ; `
      , `  IF ERROR_V > 1 THEN `
      , `    BEGIN `
      , `      IF IGNORE_ERRORS = 'YES' THEN `
      , `        SIGNAL SQLSTATE '01532' `
      , `        SET MESSAGE_TEXT = 'FAILURE ON CPYSPLF' ; `
      , `      ELSE `
      , `        SIGNAL SQLSTATE '42704' `
      , `        SET MESSAGE_TEXT = 'FAILURE ON CPYSPLF' ; `
      , `      END IF ; `
      , `    END ; `
      , `  END IF ; `
      , `  RETURN SELECT RRN ( JL ) , JL . * FROM QTEMP.QIBM_SFD JL ORDER BY RRN ( JL ) ASC ; `
      , `END  ; `
      , ``
      , `COMMENT ON SPECIFIC FUNCTION ${library}.SPOOL_FILE IS 'ILEDITOR-Version-Updated for DBCS SPLFS' ;`
      , ``
      , `COMMENT ON PARAMETER SPECIFIC FUNCTION ${library}.SPOOL_FILE`
      , `( JOB_NAME IS '* or qualified job name - Default: none' ,`
      , `	SPOOLED_FILE_NAME IS 'name - Default: QPJOBLOG' ,`
      , `	SPOOLED_FILE_NUMBER IS 'number, *LAST - Default: *LAST' ,`
      , `	IGNORE_ERRORS IS 'NO, YES - Default: YES' ) ;`
      , ``
      , `GRANT ALTER , EXECUTE ON SPECIFIC FUNCTION ${library}.SPOOL_FILE TO PUBLIC WITH GRANT OPTION ;`
      , `GRANT ALTER , EXECUTE ON SPECIFIC FUNCTION ${library}.SPOOL_FILE TO QSYS WITH GRANT OPTION ; `
    ].join(`\n`), "utf8");
  // break;

  default:
    return Buffer.from([``].join(`\n`), "utf8");
  // break;
  }
}