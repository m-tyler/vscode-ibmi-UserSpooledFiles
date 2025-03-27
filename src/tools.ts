import { CodeForIBMi, CommandResult, RemoteCommand } from '@halcyontech/vscode-ibmi-types';
import Instance from "@halcyontech/vscode-ibmi-types/api/Instance";
import { Tools } from '@halcyontech/vscode-ibmi-types/api/Tools';
// import { ComponentState } from '@halcyontech/vscode-ibmi-types/components/component';
import * as vscode from 'vscode';
import { Extension, extensions } from "vscode";
import { FuncInfo } from './typings';
import { posix } from "path";

let codeForIBMi: CodeForIBMi;
let baseExtension: Extension<CodeForIBMi> | undefined;

export namespace Code4i {
  export async function initialize() {
    baseExtension = (extensions ? extensions.getExtension(`halcyontechltd.code-for-ibmi`) : undefined);
    if (baseExtension) {
      codeForIBMi = (baseExtension.isActive ? baseExtension.exports : await baseExtension.activate());
    }
    else {
      throw new Error("halcyontechltd.code-for-ibmi not found or cannot be activated");
    }
  }

  export function getConnection() {
    return codeForIBMi.instance.getConnection();
  }

  export function getConfig() {
    return codeForIBMi.instance.getConfig();
  }

  export function getContent() {
    return codeForIBMi.instance.getContent();
  }

  export function getTempLibrary(): string {
    return getConfig().tempLibrary;
  }

  export async function getTable(library: string, name: string): Promise<Tools.DB2Row[]> {
    return getContent().getTable(library, name, name, true);
  }

  export async function runSQL(sqlStatement: string): Promise<Tools.DB2Row[]> {
    return getContent().ibmi.runSQL(sqlStatement);
  }

  export async function runCommand(command: RemoteCommand): Promise<CommandResult> {
    return await getConnection().runCommand(command);
  }
}

export const IBMI_OBJECT_NAME = /^([\w$#@][\w\d$#@_.]{0,9})$/i;

export function getQSYSObjectPath(library: string, name: string, type: string, member?: string, iasp?: string) {
  return `${iasp ? `/${iasp.toUpperCase()}` : ''}/QSYS.LIB/${library.toUpperCase()}.LIB/${name.toUpperCase()}.${type.toUpperCase()}${member ? `/${member.toUpperCase()}.MBR` : ''}`;
}

export function makeid(length?: number) {
  return codeForIBMi.tools.makeid(length);
}
export function getInstance(): Instance | undefined {
  return (baseExtension && baseExtension.isActive && baseExtension.exports ? baseExtension.exports.instance : undefined);
}
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
export async function checkObject(library: string, name: string, type: string) {
  return await Code4i.getContent().checkObject({ library, name, type });
};
export async function whereIsCustomFunc(funcName: string): Promise<FuncInfo> {
  // Look for the custom function somewhere
  let currentUser = '';
  const connection = Code4i.getConnection();
  const content = Code4i.getContent();
  if (connection) {
    currentUser = connection.currentUser;
  }
  let funcLookupRS: Tools.DB2Row[];
  let statement = `select SPECIFIC_SCHEMA,SPECIFIC_NAME,ROUTINE_TEXT,LONG_COMMENT from QSYS2.SYSFUNCS SF inner join table( values(1,'${currentUser}'),(2,'ILEDITOR'),(3,'SYSTOOLS'),(4,'QSYS2') ) LL (Pos, ASCHEMA) on ASCHEMA = SPECIFIC_SCHEMA where ROUTINE_NAME = '${funcName}' limit 1`;
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
function getSource(func: string, library: string) {
  switch (func) {
  case `SPOOLED_FILE_DATA`:
    if (library !== 'ILEDITOR') {return Buffer.from([``].join(`\n`), "utf8");}
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