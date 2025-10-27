import * as vscode from 'vscode';
import * as fs from 'fs/promises'; // For async file operations
import * as path from 'path';

export class TempFileManager {
  private tempFiles: Set<string>; // Stores absolute paths of temp files
  public readonly trackAndCleanupTmp: boolean;

  constructor() {
    this.tempFiles = new Set<string>();
    this.trackAndCleanupTmp = vscode.workspace.getConfiguration('vscode-ibmi-splfbrowser').get<boolean>('tempSpooledFileCleanup') || false;
  }

  /**
   * Registers a new temporary file to be tracked.
   * @param filePath The absolute path of the temporary file.
   */
  public registerTempFile(filePath: string): void {
    if (this.trackAndCleanupTmp) {
      this.tempFiles.add(filePath);
    }
  }


  /* TODO: do I need to look for all %TMP% entries of .SPLF???/
  /**
   * Cleans up all registered temporary files.
   * Should be called during extension deactivation.
   */
  public async cleanUpTempFiles(): Promise<void> {
    if (this.trackAndCleanupTmp) {
      console.log(this.tempFiles.size);
      for (const filePath of this.tempFiles) {
        try {
          fs.unlink(filePath); // Delete the file
          console.log(`Deleted temporary file: ${filePath}`);
        } catch (error: any) {
          // Log the error but continue with other files
          console.error(`Failed to delete temporary file ${filePath}: ${error.message}`);
        }
      }
    }
    // Might not be needed as when extension exits when VS Code closes values will be gone.
    this.tempFiles.clear(); 
  }
}