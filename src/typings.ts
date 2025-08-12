import { Range } from "vscode";

export interface IBMiSpooledFile {
  name: string
  number: string
  status?: string
  creationTimestamp?: string
  userData?: string
  size?: number
  totalPages?: number
  pageLength?: string
  qualifiedJobName :string
  jobName?: string
  jobUser?: string
  jobNumber?: string
  formType?: string
  queueLibrary: string
  queue: string
  deviceType?: string
}  
export interface IBMISplfList {
  name: string
  library: string
  text?: string
  type: string
}  
export interface IBMiSplfCounts {
  numberOf: string
  totalPages: string
}  

export type SplfDefaultOpenMode = "withSpaces" | "withoutSpaces";

export interface SplfOpenOptions {
  readonly?: boolean;
  openMode?: SplfDefaultOpenMode;
  position?: Range|undefined;
  pageLength?: string|undefined;
  fileExtension?: string|undefined;
  saveToPath?: string|undefined;
  tempPath?: boolean|undefined;
  qualifiedJobName :string
  spooledFileNumber: string
  spooledFileName: string
  namePattern?: string
}

export interface FuncInfo {
  funcSysLib: string
  funcSysName: string
  text: string
  comment: string
}
