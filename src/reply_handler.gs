/**
 * reply_handler.gs — Phase 6 Reply Processing Pipeline
 */

/**
 * Process reply_received webhook from Instantly.
 * Called by doPost() in Code.gs.
 */
function handleInstantlyWebhook(payload) {
  try {
    var eventVal = payload.event || payload.event_type || '';
    if (eventVal !== 'reply_received') {
      Logger.log('handleInstantlyWebhook: ignoring event ' + eventVal);
      return;
    }

    var email = payload.email || payload.lead_email || payload.to_email || '';
    var replyText = payload.reply_text || payload.message || payload.body || '';
    var fromName = payload.from_name || '';

    if (!email) {
      Logger.log('Webhook received with no email');
      return;
    }

    // Find contact in email_queue
    var queueResult = findFirstRowByValue('email_queue', 'email', email);
    if (!queueResult) {
      Logger.log('Unknown contact replied: ' + email);
      return;
    }
    var emailQueueRow = queueResult.data;
    var emailQueueRowNum = queueResult.rowNum;

    // Build conversation history
    var history = buildConversationHistory(email, 'email');

    // Build replyContext
    var replyContext = {
      full_name: emailQueueRow.full_name || fromName,
      job_title: emailQueueRow.job_title || '',
      company_name: emailQueueRow.company_name || '',
      freight_spend_estimate: emailQueueRow.freight_spend_estimate || '',
      personalization_hook: emailQueueRow.personalization_hook || '',
      conversation_history: history,
      their_message: replyText
    };

    // Call Kimi to draft reply
    var kimiResult = draftReply(replyContext);

    // Write to replies tab
    appendRow('replies', {
      reply_id: generateUUID(),
      date_received: formatDateISO(),
      channel: 'email',
      full_name: emailQueueRow.full_name || fromName,
      company_name: emailQueueRow.company_name,
      job_title: emailQueueRow.job_title,
      contact_linkedin_url: emailQueueRow.contact_linkedin_url,
      email: email,
      their_message: replyText,
      conversation_history: history,
      kimi_draft: kimiResult.draft_reply,
      intent_classification: kimiResult.intent_classification,
      recommended_action: kimiResult.recommended_action,
      send_status: 'draft'
    });

    // Update email_queue row
    updateRow('email_queue', emailQueueRowNum, {
      reply_received: 'yes',
      reply_date: formatDateISO(),
      reply_preview: replyText.substring(0, 100),
      stage: kimiResult.intent_classification === 'hot' ? 'hot' : 'replied'
    });

    // Pause the Instantly sequence
    try {
      pauseLeadInInstantly(email);
    } catch (e) {
      Logger.log('Failed to pause lead in Instantly: ' + e.message);
    }

    // If hot lead: send alert
    if (kimiResult.intent_classification === 'hot') {
      try {
        sendHotLeadAlert(emailQueueRow, replyText, kimiResult, 'email');
      } catch (err) {
        Logger.log('Failed to send hot lead alert: ' + err.message);
      }
    }

    Logger.log('Webhook processed: reply from ' + email + ' | Intent: ' + kimiResult.intent_classification);
  } catch (err) {
    Logger.log('Error handling Instantly webhook: ' + err.message);
  }
}

/**
 * Called from onEdit when user pastes a reply into their_reply column of linkedin_queue.
 */
function handleLinkedInReplyEdit(editedRow, replyText) {
  try {
    if (!replyText || String(replyText).trim().length === 0) {
      return;
    }
    if (!editedRow.data.contact_linkedin_url) {
      Logger.log('handleLinkedInReplyEdit: no contact_linkedin_url found in row');
      return;
    }

    // Find contact in contact_db to get full context
    var contactResult = findFirstRowByValue(
      'contact_db', 'contact_linkedin_url', editedRow.data.contact_linkedin_url
    );
    var contactRow = contactResult ? contactResult.data : {};

    // Build conversation history
    var history = buildConversationHistory(editedRow.data.contact_linkedin_url, 'linkedin');

    // Build replyContext
    var replyContext = {
      full_name: editedRow.data.full_name || '',
      job_title: editedRow.data.job_title || '',
      company_name: editedRow.data.company_name || '',
      freight_spend_estimate: contactRow.freight_spend_estimate || '',
      personalization_hook: editedRow.data.personalization_hook || '',
      conversation_history: history,
      their_message: replyText
    };

    // Call Kimi to draft reply
    var kimiResult = draftReply(replyContext);

    // Write to replies tab
    appendRow('replies', {
      reply_id: generateUUID(),
      date_received: formatDateISO(),
      channel: 'linkedin',
      full_name: editedRow.data.full_name,
      company_name: editedRow.data.company_name,
      job_title: editedRow.data.job_title,
      contact_linkedin_url: editedRow.data.contact_linkedin_url,
      email: contactRow.email || '',
      their_message: replyText,
      conversation_history: history,
      kimi_draft: kimiResult.draft_reply,
      intent_classification: kimiResult.intent_classification,
      recommended_action: kimiResult.recommended_action,
      send_status: 'draft'
    });

    // Update linkedin_queue row
    setCell('linkedin_queue', editedRow.rowNum, 'conversation_stage',
      kimiResult.intent_classification === 'hot' ? 'hot' : 'replied_warm');

    // If hot lead: send alert
    if (kimiResult.intent_classification === 'hot') {
      try {
        sendHotLeadAlert(editedRow.data, replyText, kimiResult, 'linkedin');
      } catch (err) {
        Logger.log('Failed to send hot lead alert: ' + err.message);
      }
    }

    Logger.log('LinkedIn reply draft created for ' + editedRow.data.full_name);
  } catch (err) {
    Logger.log('Error handling LinkedIn reply edit: ' + err.message);
  }
}

/**
 * Send approved email replies via Instantly. Mark LinkedIn replies as manual.
 * Runs every 10 minutes via trigger.
 */
function processNewReplies() {
  try {
    var approvedRows = getRowsByValue('replies', 'send_status', 'approved');
    if (approvedRows.length === 0) {
      return;
    }

    var sent = 0;
    var manual = 0;
    var errors = 0;

    for (var i = 0; i < approvedRows.length; i++) {
      var row = approvedRows[i];
      
      if (row.data.channel === 'email') {
        var messageToSend = row.data.your_edit || row.data.kimi_draft || '';
        if (messageToSend.trim().length === 0) {
          updateRow('replies', row.rowNum, { send_status: 'error' });
          errors++;
          continue;
        }

        var success = false;
        try {
          success = sendReplyViaInstantly(row.data.email, messageToSend);
        } catch (e) {
          Logger.log('sendReplyViaInstantly failed for ' + row.data.email + ': ' + e.message);
        }

        if (success) {
          updateRow('replies', row.rowNum, {
            send_status: 'sent',
            sent_at: formatDateISO()
          });

          // Find email_queue row and update stage
          var queueResult = findFirstRowByValue('email_queue', 'email', row.data.email);
          if (queueResult) {
            var newStage = row.data.intent_classification === 'hot' ? 'hot' : 'replied';
            setCell('email_queue', queueResult.rowNum, 'stage', newStage);
          }
          sent++;
        } else {
          updateRow('replies', row.rowNum, { send_status: 'error' });
          errors++;
        }
      }

      if (row.data.channel === 'linkedin') {
        updateRow('replies', row.rowNum, { send_status: 'manual_required' });
        manual++;
      }
    }

    if (sent > 0 || manual > 0 || errors > 0) {
      Logger.log('processNewReplies: sent=' + sent + ', manual=' + manual + ', errors=' + errors);
    }
  } catch (err) {
    Logger.log('Error processing new replies: ' + err.message);
  }
}
