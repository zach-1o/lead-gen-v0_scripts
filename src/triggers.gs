/**
 * triggers.gs
 *
 * Sets up background timers to run the automated processes continuously.
 */

function setUpTriggers() {
  clearAllTriggers();
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Ingestion runs every 4 hours
  ScriptApp.newTrigger('processLeadsFinder').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('processLinkedInJobs').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('processEmployees').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('processSignalSources').timeBased().everyHours(4).create();
  
  // 2. Qualification runs every hour
  ScriptApp.newTrigger('runQualification').timeBased().everyHours(1).create();
  
  // 3. Reply processing runs every 15 minutes
  ScriptApp.newTrigger('processNewReplies').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('sendApprovedReplies').timeBased().everyMinutes(15).create();
  
  SpreadsheetApp.getUi().alert('Success', 'All background triggers have been successfully created.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function clearAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
}
