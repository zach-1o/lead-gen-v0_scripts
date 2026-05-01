/**
 * Code.gs
 * 
 * Entry point, webhook listener, and custom menu.
 */

function setupAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = [
    { name: 'raw_leads_finder', headers: ['first_name', 'last_name', 'full_name', 'job_title', 'headline', 'functional_level', 'seniority_level', 'email', 'mobile_number', 'personal_email', 'linkedin', 'city', 'state', 'country', 'company_name', 'company_domain', 'company_website', 'company_linkedin', 'company_linkedin_uid', 'company_size', 'industry', 'company_description', 'company_annual_revenue', 'company_annual_revenue_clean', 'company_total_funding', 'company_total_funding_clean', 'company_founded_year', 'company_phone', 'company_street_address', 'company_city', 'company_state', 'company_country', 'company_postal_code', 'company_full_address', 'company_market_cap', 'keywords', 'company_technologies', '_processed', '_processed_at'] },
    { name: 'raw_linkedin_jobs', headers: ['position', 'company', 'companyLinkedInUrl', 'location', 'salary', 'postedAt', 'jobUrl', 'description', '_processed', '_processed_at', '_contact_needed', '_employees_run_id'] },
    { name: 'raw_employees', headers: ['id', 'publicIdentifier', 'linkedinUrl', 'firstName', 'lastName', 'headline', 'location', 'currentPosition', 'photo', 'premium', 'verified', '_source_company_linkedin_url', '_source_signal_type', '_source_signal_row', '_processed', '_processed_at'] },
    { name: 'raw_signal_sources', headers: ['date_found', 'source', 'company_name', 'company_linkedin_url', 'signal_title', 'signal_detail', 'signal_url', 'contact_name', 'contact_email', '_employees_run_id', '_contact_needed', '_processed', '_processed_at'] },
    { name: 'contact_db', headers: ['contact_id', 'date_added', 'source', 'first_name', 'last_name', 'full_name', 'job_title', 'headline', 'seniority_level', 'contact_linkedin_url', 'email', 'company_name', 'company_domain', 'company_linkedin_url', 'company_size', 'industry', 'company_description', 'company_annual_revenue_clean', 'contact_city', 'contact_country', 'signal_type', 'signal_title', 'signal_detail', 'dedup_key', '_qualification_status', '_qualification_run_id'] },
    { name: 'company_db', headers: ['company_domain', 'company_name', 'company_linkedin_url', 'company_size', 'industry', 'company_description', 'company_annual_revenue_clean', 'company_country', 'signals_found', 'highest_signal_type', 'firecrawl_context', 'firecrawl_status', 'first_seen_date', 'last_updated_date'] },
    { name: 'qualification_results', headers: ['qualification_id', 'contact_id', 'date_qualified', 'full_name', 'job_title', 'company_name', 'company_domain', 'contact_linkedin_url', 'email', 'source', 'signal_type', 'signal_detail', 'icp_score', 'score_reasons', 'freight_spend_estimate', 'personalization_hook', 'firecrawl_used', 'channel', 'routing_status'] },
    { name: 'linkedin_queue', headers: ['queue_id', 'priority_rank', 'date_added', 'full_name', 'first_name', 'job_title', 'contact_linkedin_url', 'company_name', 'company_domain', 'icp_score', 'signal_type', 'personalization_hook', 'firecrawl_context', 'suggested_dm', 'connection_sent_date', 'connection_accepted_date', 'dm_sent_date', 'their_reply', 'conversation_stage', 'notes'] },
    { name: 'email_queue', headers: ['queue_id', 'date_added', 'full_name', 'first_name', 'email', 'company_name', 'job_title', 'personalization_hook', 'icp_score', 'freight_spend_estimate', 'contact_linkedin_url', 'instantly_lead_id', 'sequence_start_date', 'emails_sent_count', 'last_email_date', 'open_count', 'click_count', 'reply_received', 'reply_date', 'reply_preview', 'stage', 'notes'] },
    { name: 'replies', headers: ['reply_id', 'date_received', 'channel', 'full_name', 'company_name', 'job_title', 'contact_linkedin_url', 'email', 'their_message', 'conversation_history', 'kimi_draft', 'your_edit', 'intent_classification', 'recommended_action', 'send_status', 'sent_at', 'notes'] },
    { name: 'config', headers: ['key', 'value'] },
    { name: 'run_log', headers: ['timestamp', 'run_type', 'records_read', 'records_processed', 'records_skipped', 'records_errored', 'routed_linkedin', 'routed_email', 'duration_seconds', 'notes'] }
  ];

  for (var i = 0; i < tabs.length; i++) {
    var tabInfo = tabs[i];
    var sheet = ss.getSheetByName(tabInfo.name);
    if (!sheet) {
      sheet = ss.insertSheet(tabInfo.name);
    }
    // Only set headers if the first row is empty
    var currentHeader = sheet.getRange(1, 1).getValue();
    if (!currentHeader) {
      sheet.getRange(1, 1, 1, tabInfo.headers.length).setValues([tabInfo.headers]);
    }
    sheet.setFrozenRows(1);
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Outreach System')
    .addItem('Setup: Create All Sheets', 'setupAllSheets')
    .addSeparator()
    .addItem('Process: Leads Finder Pastes', 'processLeadsFinder')
    .addItem('Process: LinkedIn Jobs Pastes', 'processLinkedInJobs')
    .addItem('Process: Employees Pastes', 'processEmployees')
    .addItem('Process: Signal Sources', 'processSignalSources')
    .addSeparator()
    .addItem('Run: Qualification Now', 'runQualification')
    .addItem('Run: Process Replies Now', 'processNewReplies')
    .addSeparator()
    .addItem('Setup: Create Triggers', 'setUpTriggers')
    .addItem('Test: Config Check', 'testConfig')
    .addItem('Test: AI Clients', 'testAIClients')
    .addToUi();
}

function testConfig() {
  var ui = SpreadsheetApp.getUi();
  try {
    var keysToLogPartially = ['OPENROUTER_API_KEY', 'INSTANTLY_API_KEY', 'FIRECRAWL_API_KEY'];
    var keysToLogFully = ['ICP_SCORE_THRESHOLD_EMAIL', 'ICP_SCORE_THRESHOLD_LINKEDIN', 'FIRECRAWL_SCORE_THRESHOLD', 'NOTIFICATION_EMAIL'];
    
    var output = [];
    
    for (var i = 0; i < keysToLogPartially.length; i++) {
      var val = getConfig(keysToLogPartially[i]);
      output.push(keysToLogPartially[i] + ': ' + val.substring(0, 8) + '...');
    }
    for (var j = 0; j < keysToLogFully.length; j++) {
      var val = getConfig(keysToLogFully[j]);
      output.push(keysToLogFully[j] + ': ' + val);
    }
    
    Logger.log('Config check passed:\n' + output.join('\n'));
    ui.alert('Success', 'Config check passed!\nCheck Execution Log for details.', ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('Config check failed: ' + e.message);
    ui.alert('Error', 'Config check failed: ' + e.message, ui.ButtonSet.OK);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (typeof handleInstantlyWebhook === 'function') {
      handleInstantlyWebhook(payload);
    }
  } catch (err) {
    Logger.log('Webhook error: ' + err.message);
  }
  return ContentService.createTextOutput('ok');
}



function testAIClients() {
  var ui = SpreadsheetApp.getUi();
  try {
    var contactObj = {
      full_name: 'Jane Doe',
      job_title: 'VP Supply Chain',
      seniority_level: 'VP',
      contact_city: 'Chicago',
      contact_country: 'USA'
    };
    var companyObj = {
      company_name: 'Midwest Distribution',
      industry: 'wholesale, distribution',
      company_size: '200-500',
      company_annual_revenue_clean: '$45M',
      company_description: 'We distribute industrial goods across the Midwest.',
      signal_type: 'linkedin_job',
      signal_detail: 'Hiring Freight Audit Manager'
    };
    
    Logger.log('Testing scoreLeadICP...');
    var scoreRes = scoreLeadICP(contactObj, companyObj, '');
    Logger.log('Score Result: ' + JSON.stringify(scoreRes));
    
    Logger.log('Testing generateHook...');
    var hookRes = generateHook(contactObj, companyObj, '');
    Logger.log('Hook: ' + hookRes);
    
    Logger.log('Testing draftReply...');
    var replyContext = {
      full_name: 'Jane Doe',
      job_title: 'VP Supply Chain',
      company_name: 'Midwest Distribution',
      freight_spend_estimate: scoreRes.freight_spend_estimate || '$5M',
      personalization_hook: hookRes,
      conversation_history: '',
      their_message: 'How much does it cost?'
    };
    var replyRes = draftReply(replyContext);
    Logger.log('Reply Result: ' + JSON.stringify(replyRes));
    
    Logger.log('Testing scrapeAndExtractFreightContext (ups.com)...');
    var firecrawlRes = scrapeAndExtractFreightContext('ups.com', 'UPS');
    Logger.log('Firecrawl Result: ' + JSON.stringify(firecrawlRes));
    
    Logger.log('AI Clients Test Complete.');
    ui.alert('AI Clients Test Complete', 'Check the Execution Log for results.', ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('AI Clients Test Failed: ' + e.message);
    ui.alert('Error', 'AI Clients Test Failed: ' + e.message, ui.ButtonSet.OK);
  }
}
