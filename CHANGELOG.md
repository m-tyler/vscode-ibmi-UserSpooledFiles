# Change Log

## Version 0.2.1
  * Opening / Downloading spooled files stopped working because of some misspelled values
  
## Version 0.2.0
  * Added open feature to open spooled files as local files so saving can be simpler.
  * Downloading of spooled files will check to see if name already exists and offer a new sequenced name.
  * Added functionality to save spooled file to open workspace.
  * Added feature to open spooled file as PDF in edit tab (requires PDF viewer extension)
  * Spooled files open in tab are downloaded to users temp folder. (Only tested on a Windows 11 system).
  * Added progress to open and download of spooled files.  Nice for larger spooled files so you know it still working.
  * Cleaned up extra commands appearing in pallet.

## Version 0.1.3
  * Fix some entry refresh issues
  * Improved spooled file list performance
  * Limit quantity of spooled files returned to 10000 by default. Not limiting causes loading issues where tree fails to partially load.
  * Minor code clean up

## Version 0.1.2
  * Show user amount of work during spooled file search
  * Clear tool tip at refresh state so spooled file quantity is updated
  * Fixed token highlight on search results tree
  * Fixed token highlight in opened editor after selection from search view

## Version 0.1.1
  * Added command to delete spooled file item with inline trash icon
## Version 0.1.0
  * Added code to overlay spooled file lines that are meant to overprint. 
## Version 0.0.9
  * Fixed bug that prevented the tool tip hover from appearing for user level items in the spooled file browser.
  
## Version 0.0.8
  * Replaced SYS version of SPOOLED_FILE_DATA, added FOR MIXED DATA to script.
  * updated version of vscode-ibmi-types.
  * added refresh action and icon to top tree items.
  * new command to create new replacement version of SPOOLED_FILE_DATA into ILEDITOR library.
  * new command to drop replacement version of SPOOLED_FILE_DATA from ILEDITOR library.
  * Fixed search box pop ups to change when searching one versus' ALL spooled files.
  * Allow code to dismiss prompts and stop when esc is pressed for search command.

## Version 0.0.7
  * Add PR https://github.com/m-tyler/vscode-ibmi-UserSpooledFiles/pull/3 to replace deprecated code and updated base types version

## Version 0.0.6
  * Added the refresh icon to each filter line
  * Download with line spacing in effect.
  * Default sort order by date descending
  
## Version 0.0.5
  * Merged PR #2, to only allow processing array map when user filters present

## Version 0.0.4
  * Renamed project identifiers and author details

## Version 0.0.3
  * Minor updates/fixes

## Version 0.0.2
  * First commit and publish

## Version 0.0.1
  * Initial project space release