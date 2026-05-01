/**
 * instantly_client.gs
 *
 * Interacts with the Instantly.ai API for email sequence management.
 */

function addLeadToInstantly(contactRow, qualificationRow) {
  var url = 'https://api.instantly.ai/api/v1/lead/add';
  var headers = {
    'Authorization': 'Bearer ' + getConfig('INSTANTLY_API_KEY'),
    'Content-Type': 'application/json'
  };
  
  var payload = {
    api_key: getConfig('INSTANTLY_API_KEY'),
    campaign_id: getConfig('INSTANTLY_CAMPAIGN_ID'),
    skip_if_in_workspace: true,
    leads: [{
      email: contactRow.email,
      first_name: contactRow.first_name || String(contactRow.full_name || '').split(' ')[0],
      company_name: contactRow.company_name,
      personalization: qualificationRow.personalization_hook,
      custom_variables: {
        job_title: contactRow.job_title,
        freight_spend: qualificationRow.freight_spend_estimate,
        icp_score: String(qualificationRow.icp_score)
      }
    }]
  };
  
  var options = {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    
    if (code === 200) {
      var data = JSON.parse(text);
      return data.id || 'added';
    } else if (code === 400 && text.toLowerCase().indexOf('already exists') !== -1) {
      return 'already_exists';
    } else {
      Logger.log('Instantly API error (' + code + '): ' + text);
      return null;
    }
  } catch (e) {
    Logger.log('Instantly request failed: ' + e.message);
    return null;
  }
}

function pauseLeadInInstantly(email) {
  var url = 'https://api.instantly.ai/api/v1/lead/pause';
  var payload = {
    api_key: getConfig('INSTANTLY_API_KEY'),
    campaign_id: getConfig('INSTANTLY_CAMPAIGN_ID'),
    email: email
  };
  
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + getConfig('INSTANTLY_API_KEY'),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log('Pause lead response: ' + response.getContentText());
  } catch (e) {
    Logger.log('Pause lead failed: ' + e.message);
  }
}

function sendReplyViaInstantly(email, replyText) {
  var url = 'https://api.instantly.ai/api/v1/reply/send';
  var payload = {
    api_key: getConfig('INSTANTLY_API_KEY'),
    email: email,
    reply: replyText
  };
  
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + getConfig('INSTANTLY_API_KEY'),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('Send reply error: ' + response.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('Send reply failed: ' + e.message);
    return false;
  }
}
