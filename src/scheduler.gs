/**
 * scheduler.gs — Time-Based Trigger Management
 */

function setUpTriggers() {
  try {
    // Delete ALL existing triggers first to prevent duplicates
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }

    // INGESTION: Apify runs Mon/Wed/Fri at 6am UTC
    // Apps Script timezone note: 'at(6)' uses the script's timezone.
    // Set script timezone to UTC in Project Settings for consistency.
    ScriptApp.newTrigger('triggerApifyRuns')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(6)
      .create();

    ScriptApp.newTrigger('triggerApifyRuns')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
      .atHour(6)
      .create();

    ScriptApp.newTrigger('triggerApifyRuns')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.FRIDAY)
      .atHour(6)
      .create();

    // QUALIFICATION: every 4 hours
    ScriptApp.newTrigger('runQualification')
      .timeBased()
      .everyHours(4)
      .create();

    // REPLY SEND LOOP: every 10 minutes
    ScriptApp.newTrigger('processNewReplies')
      .timeBased()
      .everyMinutes(10)
      .create();

    // DAILY SUMMARY: every day at 9am
    ScriptApp.newTrigger('writeDailySummary')
      .timeBased()
      .everyDays(1)
      .atHour(9)
      .create();

    try {
      var ui = SpreadsheetApp.getUi();
      ui.alert('Triggers created',
        '✓ Apify ingestion: Mon/Wed/Fri at 6am\n' +
        '✓ Qualification: every 4 hours\n' +
        '✓ Reply send loop: every 10 minutes\n' +
        '✓ Daily summary: 9am daily\n\n' +
        'Verify in Apps Script → Triggers panel (clock icon).',
        ui.ButtonSet.OK);
    } catch (uiErr) {
      Logger.log('Spreadsheet UI not available for trigger creation alert.');
    }

    Logger.log('All triggers created successfully');
  } catch (err) {
    Logger.log('Error setting up triggers: ' + err.message);
    try {
      SpreadsheetApp.getUi().alert('Error', 'Failed to set up triggers: ' + err.message, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch(e) {}
  }
}
