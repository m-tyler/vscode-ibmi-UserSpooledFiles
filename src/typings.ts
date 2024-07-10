import { QsysFsOptions } from "@halcyontech/vscode-ibmi-types"

export interface IBMiSpooledFile {
  user: string
  name: string
  number: number
  status: string
  creationTimestamp: string
  userData: string
  size: number
  totalPages: number
  pageLength: number
  qualifiedJobName :string
  jobName: string
  jobUser: string
  jobNumber: string
  formType: string
  queueLibrary: string
  queue: string
}  
export interface IBMiSplfUser {
  user: string
  text?: string
}  

export type SplfDefaultOpenMode = "withSpaces" | "withoutSpaces";

export interface SplfOpenOptions {
  readonly?: boolean;
  openMode?: SplfDefaultOpenMode;
  position?: Range;
  pageLength?: number;
}