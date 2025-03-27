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
*  Download spooled file to .TXT or PDF
*  Downloading spooled files to local workspace.
*  Downloading spooled files with added line spacing (text format only).
*  Delete spooled files by user, specific line, specific name, all matching filter. 
*  Move a spooled file to another output queue. 
*  Tool tip hover for number of spooled files for user
*  Tool tip hover for spooled file to show extra attributes
---


## TODOs: 
*  Multi-spooled file selections for all actions.  
---

## Commands 
* IBM i SPLF: Refresh Spooled File Browser 
* IBM i SPLF: Add Spooled File Filter 
* IBM i SPLF: Delete Spooled File Filter 
---

### Building from source

1. This project requires VS Code, Node.js, and Code for IBM i.
2. fork & clone repo
3. Install Code for IBM i types, see: https://codefori.github.io/docs/dev/api/#typings
3. `npm i`
4. 'Run Extension' from vscode debug.

