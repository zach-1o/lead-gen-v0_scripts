/**
 * notifications.gs — Phase 6 Outreach Alerts & Daily Digests
 */

/**
 * Send an email alert when a hot lead is identified.
 */
function sendHotLeadAlert(contactData, replyText, kimiResult, channel) {
  try {
    var subject = '🔥 Hot Lead: ' + (contactData.company_name || 'Unknown Company') + ' (' + channel + ')';

    var body = '🔥 HOT LEAD — ' + channel.toUpperCase() + '\n\n' +
      'Contact: ' + (contactData.full_name || 'Unknown') +
        ' (' + (contactData.job_title || 'Unknown title') + ')\n' +
      'Company: ' + (contactData.company_name || 'Unknown') + '\n' +
      'Channel: ' + channel + '\n';

    if (channel === 'email' && contactData.email) {
      body += 'Email: ' + contactData.email + '\n';
    }

    if (contactData.contact_linkedin_url) {
      body += 'LinkedIn: ' + contactData.contact_linkedin_url + '\n';
    }

    if (contactData.freight_spend_estimate) {
      body += 'Freight spend: ' + contactData.freight_spend_estimate + '\n';
    }

    body += '\nTheir message:\n' + replyText + '\n\n' +
      'AI recommended action: ' + (kimiResult.recommended_action || 'N/A') + '\n\n' +
      'Draft reply is in your Replies tab with send_status = draft.\n' +
      'Edit if needed in the your_edit column, then set send_status = approved.\n' +
      'Next step: book a 20-minute discovery call.';

    GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'), subject, body);
    Logger.log('Hot lead alert sent: ' + contactData.company_name);
  } catch (e) {
    Logger.log('Failed to send hot lead alert: ' + e.message);
  }
}

/**
 * Summarize statistics across contacts, queues, and drafts and email a daily digest.
 * Runs daily at 9am.
 */
function writeDailySummary() {
  try {
    var contactDbRows = getAllRows('contact_db');
    var pending = contactDbRows.filter(function(r) { return r.data._qualification_status === 'pending'; }).length;
    var scored = contactDbRows.filter(function(r) { return r.data._qualification_status === 'scored'; }).length;
    var skipped = contactDbRows.filter(function(r) { return r.data._qualification_status === 'skipped'; }).length;

    var linkedinRows = getAllRows('linkedin_queue');
    var notSent = linkedinRows.filter(function(r) { return r.data.conversation_stage === 'not_sent'; }).length;
    var requestSent = linkedinRows.filter(function(r) { return r.data.conversation_stage === 'request_sent'; }).length;
    var connected = linkedinRows.filter(function(r) { return r.data.conversation_stage === 'connected'; }).length;
    var hot = linkedinRows.filter(function(r) { return r.data.conversation_stage === 'hot'; }).length;

    var emailRows = getAllRows('email_queue');
    var emailActive = emailRows.filter(function(r) { return r.data.stage === 'active'; }).length;
    var emailReplied = emailRows.filter(function(r) { return r.data.reply_received === 'yes'; }).length;

    var replyRows = getAllRows('replies');
    var drafts = replyRows.filter(function(r) { return r.data.send_status === 'draft'; }).length;
    var awaitingManual = replyRows.filter(function(r) { return r.data.send_status === 'manual_required'; }).length;

    var summary = 'DAILY OUTREACH SUMMARY — ' + new Date().toDateString() + '\n\n' +
      '📊 CONTACT DATABASE\n' +
      '  Pending qualification: ' + pending + '\n' +
      '  Qualified: ' + scored + '\n' +
      '  Skipped: ' + skipped + '\n\n' +
      '🔗 LINKEDIN QUEUE\n' +
      '  Ready to connect (not_sent): ' + notSent + '\n' +
      '  Connection request sent: ' + requestSent + '\n' +
      '  Connected: ' + connected + '\n' +
      '  Hot leads: ' + hot + '\n\n' +
      '📧 EMAIL QUEUE\n' +
      '  Active sequences: ' + emailActive + '\n' +
      '  Replied: ' + emailReplied + '\n\n' +
      '💬 REPLIES TAB\n' +
      '  Drafts awaiting approval: ' + drafts + '\n' +
      '  LinkedIn manual sends needed: ' + awaitingManual;

    Logger.log(summary);

    GmailApp.sendEmail(
      getConfig('NOTIFICATION_EMAIL'),
      'Daily Outreach Summary — ' + new Date().toDateString(),
      summary
    );
    Logger.log('Daily summary alert email sent.');

    appendRow('run_log', {
      timestamp: formatDateISO(),
      run_type: 'daily_summary',
      notes: summary.substring(0, 200)
    });
  } catch (e) {
    Logger.log('Failed to generate or send daily summary: ' + e.message);
  }
}
