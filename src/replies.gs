/**
 * replies.gs
 *
 * Handles incoming webhooks, drafts AI responses, and pushes approved replies back out.
 */

function handleInstantlyWebhook(payload) {
  if (payload.event_type === 'reply_received') {
    var email = payload.lead_email;
    var message = payload.text;
    var campaign = payload.campaign_name;
    
    // Find the lead in email_queue to get context
    var rows = getAllRows('email_queue');
    var queueRow = null;
    var rowNum = -1;
    
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].data.email).toLowerCase() === String(email).toLowerCase()) {
        queueRow = rows[i].data;
        rowNum = rows[i].rowNum;
        break;
      }
    }
    
    var replyObj = {
      reply_id: generateUUID(),
      date_received: new Date().toISOString(),
      channel: 'email',
      full_name: queueRow ? queueRow.full_name : '',
      company_name: queueRow ? queueRow.company_name : '',
      job_title: queueRow ? queueRow.job_title : '',
      contact_linkedin_url: queueRow ? queueRow.contact_linkedin_url : '',
      email: email,
      their_message: String(message).substring(0, 1000), // safety truncate
      send_status: 'pending_draft'
    };
    
    appendRow('replies', replyObj);
    
    if (rowNum > -1) {
      setCell('email_queue', rowNum, 'reply_received', 'yes');
      setCell('email_queue', rowNum, 'reply_date', new Date().toISOString());
      setCell('email_queue', rowNum, 'reply_preview', String(message).substring(0, 50));
      setCell('email_queue', rowNum, 'stage', 'replied');
    }
  }
}

function processNewReplies() {
  Logger.log('Starting processNewReplies');
  var startTime = new Date().getTime();
  
  var rows = getRowsByValue('replies', 'send_status', 'pending_draft');
  var drafted = 0;
  var errors = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var data = row.data;
    
    // Find context
    var contactKey = data.channel === 'email' ? data.email : data.contact_linkedin_url;
    var history = buildConversationHistory(contactKey, data.channel);
    
    var replyContext = {
      full_name: data.full_name,
      job_title: data.job_title,
      company_name: data.company_name,
      freight_spend_estimate: '', // pulled from queue below
      personalization_hook: '',
      conversation_history: history,
      their_message: data.their_message
    };
    
    // Attempt to enrich context from queue
    if (data.channel === 'email' && data.email) {
      var qRow = findFirstRowByValue('email_queue', 'email', data.email);
      if (qRow) {
        replyContext.freight_spend_estimate = qRow.data.freight_spend_estimate;
        replyContext.personalization_hook = qRow.data.personalization_hook;
      }
    } else if (data.channel === 'linkedin' && data.contact_linkedin_url) {
       var lRow = findFirstRowByValue('linkedin_queue', 'contact_linkedin_url', data.contact_linkedin_url);
       if (lRow) {
         replyContext.personalization_hook = lRow.data.personalization_hook;
       }
    }
    
    try {
      var draftObj = draftReply(replyContext);
      updateRow('replies', row.rowNum, {
        kimi_draft: draftObj.draft_reply,
        intent_classification: draftObj.intent_classification,
        recommended_action: draftObj.recommended_action,
        send_status: 'drafted_needs_review'
      });
      drafted++;
      Utilities.sleep(1500); // Kimi rate limit buffer
    } catch(e) {
      Logger.log('Drafting failed for reply ' + data.reply_id + ': ' + e.message);
      errors++;
    }
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('processNewReplies completed. Drafted: ' + drafted + ', Errors: ' + errors);
  
  // Notification email if drafts were created
  if (drafted > 0) {
    var email = getConfig('NOTIFICATION_EMAIL');
    if (email) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: 'Freight Audit System: ' + drafted + ' new replies need review',
          body: 'You have ' + drafted + ' new AI-drafted replies waiting for your approval in the "replies" tab.\n\nReview them, make edits in the "your_edit" column, and change status to "approved_to_send".'
        });
      } catch(e) {}
    }
  }
}

// Scheduled function to auto-send approved emails
function sendApprovedReplies() {
  var rows = getRowsByValue('replies', 'send_status', 'approved_to_send');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.data.channel === 'email' && row.data.email) {
      var finalMsg = row.data.your_edit || row.data.kimi_draft;
      var success = sendReplyViaInstantly(row.data.email, finalMsg);
      if (success) {
        updateRow('replies', row.rowNum, {
          send_status: 'sent',
          sent_at: new Date().toISOString()
        });
      } else {
        setCell('replies', row.rowNum, 'send_status', 'send_failed');
      }
    } else if (row.data.channel === 'linkedin') {
      // Manual send for linkedin, update status directly
      updateRow('replies', row.rowNum, {
        send_status: 'sent',
        sent_at: new Date().toISOString(),
        notes: 'Manually sent on LinkedIn'
      });
    }
  }
}
