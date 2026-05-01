/**
 * utils.gs
 *
 * General utility functions.
 */

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function safeJsonParse(text, defaultVal) {
  try {
    return JSON.parse(text);
  } catch(e) {
    var match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch(e2) {
        // fall through
      }
    }
    Logger.log('JSON parse failed: ' + String(text).substring(0, 100));
    return defaultVal;
  }
}

function truncateText(text, maxChars) {
  if (text === null || text === undefined) return '';
  return String(text).substring(0, maxChars);
}

function formatDateISO() {
  return new Date().toISOString();
}

function buildConversationHistory(contactLinkedinOrEmail, channel) {
  var rows = getAllRows('replies');
  var relevantRows = [];
  var searchKey = String(contactLinkedinOrEmail).trim().toLowerCase();
  
  if (!searchKey) return '';
  
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].data;
    if (String(r.send_status).toLowerCase() === 'sent') {
      var emailMatch = r.email && String(r.email).toLowerCase() === searchKey;
      var linkMatch = r.contact_linkedin_url && String(r.contact_linkedin_url).toLowerCase() === searchKey;
      if (emailMatch || linkMatch) {
        relevantRows.push(r);
      }
    }
  }
  
  relevantRows.sort(function(a, b) {
    return new Date(a.date_received).getTime() - new Date(b.date_received).getTime();
  });
  
  var history = '';
  for (var j = 0; j < relevantRows.length; j++) {
    var row = relevantRows[j];
    var myMsg = row.your_edit || row.kimi_draft;
    history += 'You: ' + myMsg + '\n';
    history += 'Them: ' + row.their_message + '\n';
  }
  
  return history;
}
