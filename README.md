# vscode-ibmi-UserSpooledFiles

This extension provides views and tools for listing a user's spooled file and managing them (one at a time).  

## Current functionality

Has support for:
*  Listing user spooled files
*  Adding addition users to view spooled file for in read-only mode
*  Reading spooled file in editor tab with or without line spacing. OPened spooled files will be downloaded to local %TMP% folder.
*  Open spooled file in PDF format in edit tab.  Requires PDF viewer extension.
*  Searching through spooled files
*  Filtering list based on certain criteria in spooled file attribute, like job number.
*  Sorting spooled file list by name or date in ascending or descending order. 
*  Download spooled file to .TXT, .SPLF or .PDF
*  Downloading spooled files to local workspace.
*  Downloading spooled files with added line spacing (text format only).
*  Delete spooled files by user, specific line, specific name, all matching filter. 
*  Move a spooled file to another output queue. 
*  Tool tip hover for number of spooled files for user
*  Tool tip hover for spooled file to show extra attributes
*  Multi-spooled file selections for many actions.  
*  Configuration for supplying a opened/downloaded spooled file name, see config name `vscode-ibmi-splfbrowser.spooledFileNamePattern`.
*  Configuration option to clean up temporary spooled files, see config name `vscode-ibmi-splfbrowser.tempSpooledFileCleanup`.
---

## Dependencies
*  You need to install a PDF viewer to open PDFs within VS Code.

## NOTES:
  * There is a small issue in an IBM view this extension is using, in that if the OUTQ the spooled file is in is too large (100000+ entries for example) some functionality will appear to slow down.  I am using the QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC to retrieve the spooled file device type so that the extension can prevent non-*SCS types from being searched or open *AFPDS as PDF types by default.  It does not matter if I ask for a details of single spooled file using very specific criteria or the whole set of spooled files in an OUTQ with a enormous number of spooled files. 

## TODOs: 
---

## Commands 
 * IBM i: Focus on User SPLF Browser View 
 * IBM i SPLF: add Spooled File Filter 
 * IBM i SPLF: close 
 * IBM i SPLF: collapse All 
 * IBM i SPLF: Delete Spooled File Filter 
 * IBM i SPLF: Refresh Spooled File Browser 
---

### Building from source

1. This project requires VS Code, Node.js, and Code for IBM i.
2. fork & clone repo
3. Install Code for IBM i types, see: https://codefori.github.io/docs/dev/api/#typings
3. `npm i`
4. 'Run Extension' from vscode debug.

