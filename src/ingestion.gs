/**
 * ingestion.gs
 *
 * Processes raw data pasted from Apify and writes it into contact_db and company_db.
 */

function upsertCompanyDb(companyData, signalType, signalTitle, signalDetail) {
  var domain = companyData.company_domain;
  var existingRow = null;
  
  if (domain) {
    existingRow = findFirstRowByValue('company_db', 'company_domain', domain);
  }
  
  var today = new Date().toISOString();
  var newSignal = {
    type: signalType,
    title: signalTitle,
    detail: signalDetail,
    date: today
  };
  
  var priorityMap = {
    'linkedin_job': 4,
    'sam_gov': 3,
    'rss_news': 2,
    'icp_match': 1
  };
  
  if (existingRow) {
    var signals = [];
    try {
      signals = JSON.parse(existingRow.data.signals_found || '[]');
    } catch(e) {}
    signals.push(newSignal);
    
    var currentHighest = existingRow.data.highest_signal_type;
    var newHighest = currentHighest;
    if ((priorityMap[signalType] || 0) > (priorityMap[currentHighest] || 0)) {
      newHighest = signalType;
    }
    
    updateRow('company_db', existingRow.rowNum, {
      signals_found: JSON.stringify(signals),
      highest_signal_type: newHighest,
      last_updated_date: today
    });
    
    return domain;
  } else {
    // New row
    var rowObj = {
      company_domain: domain,
      company_name: companyData.company_name,
      company_linkedin_url: companyData.company_linkedin_url,
      company_size: companyData.company_size,
      industry: companyData.industry,
      company_description: companyData.company_description,
      company_annual_revenue_clean: companyData.company_annual_revenue_clean,
      company_country: companyData.company_country,
      signals_found: JSON.stringify([newSignal]),
      highest_signal_type: signalType,
      firecrawl_status: 'pending',
      first_seen_date: today,
      last_updated_date: today
    };
    appendRow('company_db', rowObj);
    return domain;
  }
}

function writeContactDb(mappedContactObj) {
  // Temporary UUID generator until utils.gs is fully loaded in Phase 4
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
     var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
     return v.toString(16);
  });
  
  var contactId = typeof generateUUID === 'function' ? generateUUID() : uuid;
  
  mappedContactObj.contact_id = contactId;
  mappedContactObj.date_added = new Date().toISOString();
  mappedContactObj._qualification_status = 'pending';
  
  appendRow('contact_db', mappedContactObj);
  registerContact(mappedContactObj); // Updates dedup cache
  return contactId;
}

function processLeadsFinder() {
  Logger.log('Starting processLeadsFinder');
  var startTime = new Date().getTime();
  
  var rows = getAllRows('raw_leads_finder');
  var processed = 0, skipped_dup = 0, skipped_empty = 0, errors = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var pStatus = String(row.data._processed || '').trim().toLowerCase();
    
    if (pStatus === '' || pStatus === 'new') {
      var fullName = String(row.data.full_name || '').trim();
      var email = String(row.data.email || '').trim();
      var linkedin = String(row.data.linkedin || '').trim();
      
      if (!fullName && !email && !linkedin) {
        skipped_empty++;
        errors++;
        continue;
      }
      
      var mapped = mapLeadsFinderRow(row.data);
      if (isDuplicate(mapped)) {
        setCell('raw_leads_finder', row.rowNum, '_processed', 'duplicate');
        skipped_dup++;
        continue;
      }
      
      upsertCompanyDb(mapped, 'icp_match', mapped.signal_title, mapped.signal_detail);
      writeContactDb(mapped);
      
      setCell('raw_leads_finder', row.rowNum, '_processed', 'yes');
      setCell('raw_leads_finder', row.rowNum, '_processed_at', new Date().toISOString());
      processed++;
    }
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('processLeadsFinder completed. Processed: ' + processed + ', Dups: ' + skipped_dup + ', Errors: ' + errors);
  
  appendRow('run_log', {
    timestamp: new Date().toISOString(),
    run_type: 'process_leads_finder',
    records_read: rows.length,
    records_processed: processed,
    records_skipped: skipped_dup + skipped_empty,
    records_errored: errors,
    duration_seconds: duration
  });
}

function processLinkedInJobs() {
  Logger.log('Starting processLinkedInJobs');
  var startTime = new Date().getTime();
  
  var rows = getAllRows('raw_linkedin_jobs');
  var processed = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var pStatus = String(row.data._processed || '').trim().toLowerCase();
    
    if (pStatus === '' || pStatus === 'new') {
      var companyLinkedInUrl = String(row.data.companyLinkedInUrl || '').trim();
      var domain = '';
      if (companyLinkedInUrl) {
        var match = companyLinkedInUrl.match(/company\/([^\/?#]+)/i);
        if (match && match[1]) {
          domain = 'li_' + match[1];
        }
      }
      
      var companyData = {
        company_name: row.data.company,
        company_linkedin_url: companyLinkedInUrl,
        company_domain: domain,
        company_size: '',
        industry: '',
        company_description: String(row.data.description || '').substring(0, 300),
        company_annual_revenue_clean: '',
        company_country: ''
      };
      
      var signal_title = row.data.position + ' (hiring)';
      var signal_detail = 'Job posted: ' + row.data.position + '. ' + String(row.data.description || '').substring(0, 200);
      
      upsertCompanyDb(companyData, 'linkedin_job', signal_title, signal_detail);
      
      setCell('raw_linkedin_jobs', row.rowNum, '_processed', 'pending_employees');
      setCell('raw_linkedin_jobs', row.rowNum, '_processed_at', new Date().toISOString());
      setCell('raw_linkedin_jobs', row.rowNum, '_contact_needed', 'yes');
      processed++;
    }
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('processLinkedInJobs completed. Processed: ' + processed);
  
  appendRow('run_log', {
    timestamp: new Date().toISOString(),
    run_type: 'process_linkedin_jobs',
    records_read: rows.length,
    records_processed: processed,
    records_skipped: rows.length - processed,
    records_errored: 0,
    duration_seconds: duration
  });
}

function processEmployees() {
  Logger.log('Starting processEmployees');
  var startTime = new Date().getTime();
  
  var rows = getAllRows('raw_employees');
  var processed = 0, skipped_dup = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var pStatus = String(row.data._processed || '').trim().toLowerCase();
    
    if (pStatus === '' || pStatus === 'new') {
      var sourceSignalType = row.data._source_signal_type;
      var sourceSignalRow = Number(row.data._source_signal_row);
      
      var signal_title = '';
      var signal_detail = '';
      var company_name = '';
      var company_linkedin_url = '';
      
      if (sourceSignalType === 'linkedin_job' && sourceSignalRow) {
        var position = getCell('raw_linkedin_jobs', sourceSignalRow, 'position');
        var company = getCell('raw_linkedin_jobs', sourceSignalRow, 'company');
        var description = getCell('raw_linkedin_jobs', sourceSignalRow, 'description');
        var clUrl = getCell('raw_linkedin_jobs', sourceSignalRow, 'companyLinkedInUrl');
        
        signal_title = position + ' (hiring at ' + company + ')';
        signal_detail = 'Company posted job: ' + position + '. ' + String(description || '').substring(0, 200);
        company_name = company;
        company_linkedin_url = clUrl;
      } else if ((sourceSignalType === 'sam_gov' || sourceSignalType === 'rss_news') && sourceSignalRow) {
        signal_title = getCell('raw_signal_sources', sourceSignalRow, 'signal_title');
        signal_detail = getCell('raw_signal_sources', sourceSignalRow, 'signal_detail');
        company_name = getCell('raw_signal_sources', sourceSignalRow, 'company_name');
        company_linkedin_url = getCell('raw_signal_sources', sourceSignalRow, 'company_linkedin_url');
      }
      
      var mapped = mapEmployeesRow(row.data, sourceSignalType, signal_title, signal_detail);
      if (!mapped.company_name && company_name) {
        mapped.company_name = company_name;
      }
      if (!mapped.company_linkedin_url && company_linkedin_url) {
        mapped.company_linkedin_url = company_linkedin_url;
      }
      
      if (isDuplicate(mapped)) {
        setCell('raw_employees', row.rowNum, '_processed', 'duplicate');
        skipped_dup++;
        continue;
      }
      
      writeContactDb(mapped);
      
      setCell('raw_employees', row.rowNum, '_processed', 'yes');
      setCell('raw_employees', row.rowNum, '_processed_at', new Date().toISOString());
      processed++;
    }
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('processEmployees completed. Processed: ' + processed + ', Dups: ' + skipped_dup);
  
  appendRow('run_log', {
    timestamp: new Date().toISOString(),
    run_type: 'process_employees',
    records_read: rows.length,
    records_processed: processed,
    records_skipped: skipped_dup + (rows.length - processed - skipped_dup),
    records_errored: 0,
    duration_seconds: duration
  });
}

function processSignalSources() {
  Logger.log('Starting processSignalSources');
  var startTime = new Date().getTime();
  
  var rows = getAllRows('raw_signal_sources');
  var processed = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var pStatus = String(row.data._processed || '').trim().toLowerCase();
    
    if (pStatus === '' || pStatus === 'new') {
      var companyData = {
        company_name: row.data.company_name,
        company_linkedin_url: row.data.company_linkedin_url,
        company_domain: ''
      };
      
      upsertCompanyDb(companyData, row.data.source, row.data.signal_title, row.data.signal_detail);
      
      if (row.data.contact_email) {
        var contactObj = {
          full_name: row.data.contact_name || '',
          email: row.data.contact_email,
          company_name: row.data.company_name,
          company_linkedin_url: row.data.company_linkedin_url,
          source: row.data.source,
          signal_type: row.data.source,
          signal_title: row.data.signal_title,
          signal_detail: row.data.signal_detail,
          dedup_key: row.data.contact_email
        };
        if (!isDuplicate(contactObj)) {
          writeContactDb(contactObj);
        }
      } else {
        setCell('raw_signal_sources', row.rowNum, '_contact_needed', 'yes');
      }
      
      setCell('raw_signal_sources', row.rowNum, '_processed', 'pending_employees');
      setCell('raw_signal_sources', row.rowNum, '_processed_at', new Date().toISOString());
      processed++;
    }
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('processSignalSources completed. Processed: ' + processed);
  
  appendRow('run_log', {
    timestamp: new Date().toISOString(),
    run_type: 'process_signals',
    records_read: rows.length,
    records_processed: processed,
    records_skipped: rows.length - processed,
    records_errored: 0,
    duration_seconds: duration
  });
}

/**
 * Start an Apify actor run via REST API and return the run metadata.
 */
function runApifyActor(actorId, token, inputJson) {
  try {
    var url = 'https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + token;
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(inputJson),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 201) {
      Logger.log('runApifyActor error (code ' + code + '): ' + response.getContentText());
      return null;
    }
    var data = JSON.parse(response.getContentText());
    return {
      runId: data.data.id,
      datasetId: data.data.defaultDatasetId
    };
  } catch (e) {
    Logger.log('runApifyActor exception: ' + e.message);
    return null;
  }
}

/**
 * Check if an Apify actor run is complete.
 */
function checkApifyRunStatus(runId, token) {
  try {
    var url = 'https://api.apify.com/v2/actor-runs/' + runId + '?token=' + token;
    var options = {
      method: 'get',
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('checkApifyRunStatus error (code ' + code + '): ' + response.getContentText());
      return 'FAILED';
    }
    var data = JSON.parse(response.getContentText());
    return data.data.status;
  } catch (e) {
    Logger.log('checkApifyRunStatus exception: ' + e.message);
    return 'FAILED';
  }
}

/**
 * Fetch all results from a completed Apify run dataset.
 */
function fetchApifyDataset(datasetId, token) {
  try {
    var url = 'https://api.apify.com/v2/datasets/' + datasetId + '/items?token=' + token + '&format=json&clean=true&limit=200';
    var options = {
      method: 'get',
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('fetchApifyDataset error (code ' + code + '): ' + response.getContentText());
      return [];
    }
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('fetchApifyDataset exception: ' + e.message);
    return [];
  }
}

/**
 * Start all Apify actor runs and schedule the polling check.
 * Called by the Mon/Wed/Fri 6am time trigger.
 */
function triggerApifyRuns() {
  var requiredKeys = [
    'APIFY_TOKEN_LEADS', 'APIFY_LEADS_ACTOR_ID',
    'APIFY_TOKEN_JOBS', 'APIFY_JOBS_ACTOR_ID',
    'NOTIFICATION_EMAIL'
  ];
  
  for (var i = 0; i < requiredKeys.length; i++) {
    try {
      getConfig(requiredKeys[i]);
    } catch (err) {
      var notificationEmail = '';
      try {
        notificationEmail = getConfig('NOTIFICATION_EMAIL');
      } catch (e) {}
      
      if (notificationEmail) {
        GmailApp.sendEmail(
          notificationEmail,
          'Apify ingestion failed: missing config key',
          requiredKeys[i] + ' not found in config tab'
        );
      }
      Logger.log('Apify ingestion failed: missing config key ' + requiredKeys[i]);
      return;
    }
  }

  // Build Leads Finder input from config
  var jobTitles = [
    'VP Supply Chain', 'Director of Logistics', 'Head of Transportation',
    'VP Operations', 'Director Supply Chain', 'Logistics Manager',
    'Transportation Manager', 'Director of Operations', 'CFO', 'VP Procurement'
  ];
  try {
    var titlesStr = getConfig('TARGET_JOB_TITLES');
    if (titlesStr) {
      jobTitles = titlesStr.split(',').map(function(s) { return s.trim(); });
    }
  } catch (e) {
    // fallback to hardcoded list if key is missing
  }

  var leadsInput = {
    contact_job_title: jobTitles,
    contact_location: getConfig('TARGET_LOCATIONS').split(',').map(function(s) { return s.trim(); }),
    company_industry: getConfig('TARGET_INDUSTRIES').split(',').map(function(s) { return s.trim(); }),
    min_revenue: 10000000,
    max_revenue: 200000000,
    email_status: ['validated'],
    fetch_count: getConfigNumber('APIFY_FETCH_COUNT')
  };

  // Build LinkedIn Jobs input from config
  var jobsInput = {
    queries: getConfig('LINKEDIN_JOB_KEYWORDS').split(',').map(function(k) { return k.trim(); }),
    locationName: 'United States',
    datePosted: 'past-month'
  };

  // Start Leads Finder run
  var leadsRun = runApifyActor(
    getConfig('APIFY_LEADS_ACTOR_ID'),
    getConfig('APIFY_TOKEN_LEADS'),
    leadsInput
  );

  if (leadsRun === null) {
    Logger.log('Apify Leads Finder run failed to start.');
    GmailApp.sendEmail(
      getConfig('NOTIFICATION_EMAIL'),
      'Apify Leads Finder run failed to start',
      'Check execution logs. Failed to start Leads Finder actor.'
    );
    return;
  }

  // Start LinkedIn Jobs run
  var jobsRun = runApifyActor(
    getConfig('APIFY_JOBS_ACTOR_ID'),
    getConfig('APIFY_TOKEN_JOBS'),
    jobsInput
  );

  if (jobsRun === null) {
    Logger.log('Warning: Jobs run failed to start. Continuing with leads finder only.');
  }

  // Save to PropertiesService
  var props = PropertiesService.getScriptProperties();
  props.setProperty('APIFY_LEADS_RUN_ID', leadsRun.runId);
  props.setProperty('APIFY_LEADS_DATASET_ID', leadsRun.datasetId);
  props.setProperty('APIFY_LEADS_TOKEN', getConfig('APIFY_TOKEN_LEADS'));
  
  if (jobsRun !== null) {
    props.setProperty('APIFY_JOBS_RUN_ID', jobsRun.runId);
    props.setProperty('APIFY_JOBS_DATASET_ID', jobsRun.datasetId);
    props.setProperty('APIFY_JOBS_TOKEN', getConfig('APIFY_TOKEN_JOBS'));
  }
  
  props.setProperty('APIFY_POLL_ATTEMPTS', '0');

  // Create delayed trigger for checkApifyAndProcess
  var trigger = ScriptApp.newTrigger('checkApifyAndProcess')
    .timeBased()
    .after(4 * 60 * 1000)
    .create();
  props.setProperty('APIFY_CHECK_TRIGGER_ID', trigger.getUniqueId());

  Logger.log('Apify runs started. Leads run: ' + leadsRun.runId + (jobsRun ? ', Jobs run: ' + jobsRun.runId : ''));
}

/**
 * Poll Apify run status, fetch results when done, write to sheets.
 * Called by delayed trigger from triggerApifyRuns() and recursively re-schedules itself.
 */
function checkApifyAndProcess() {
  var props = PropertiesService.getScriptProperties();

  // Delete the trigger that called this function
  var triggerIdToDelete = props.getProperty('APIFY_CHECK_TRIGGER_ID');
  if (triggerIdToDelete) {
    var allTriggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < allTriggers.length; i++) {
      if (allTriggers[i].getUniqueId() === triggerIdToDelete) {
        ScriptApp.deleteTrigger(allTriggers[i]);
      }
    }
    props.deleteProperty('APIFY_CHECK_TRIGGER_ID');
  }

  // Get run IDs and tokens
  var leadsRunId = props.getProperty('APIFY_LEADS_RUN_ID');
  var leadsDatasetId = props.getProperty('APIFY_LEADS_DATASET_ID');
  var leadsToken = props.getProperty('APIFY_LEADS_TOKEN');
  var jobsRunId = props.getProperty('APIFY_JOBS_RUN_ID');
  var jobsDatasetId = props.getProperty('APIFY_JOBS_DATASET_ID');
  var jobsToken = props.getProperty('APIFY_JOBS_TOKEN');

  if (!leadsRunId) {
    Logger.log('No pending Apify runs found — nothing to check');
    return;
  }

  // Increment poll attempts
  var attempts = parseInt(props.getProperty('APIFY_POLL_ATTEMPTS') || '0', 10) + 1;
  props.setProperty('APIFY_POLL_ATTEMPTS', attempts.toString());
  var maxAttempts = getConfigNumber('APIFY_MAX_POLL_ATTEMPTS');

  if (attempts > maxAttempts) {
    Logger.log('Max poll attempts reached — Apify runs may have timed out');
    GmailApp.sendEmail(
      getConfig('NOTIFICATION_EMAIL'),
      'Apify runs timed out after ' + maxAttempts + ' checks',
      'Runs did not complete within expected time. Check Apify dashboard.'
    );
    clearApifyProperties(props);
    return;
  }

  // Check leads run status
  var leadsStatus = checkApifyRunStatus(leadsRunId, leadsToken);
  Logger.log('Attempt ' + attempts + ': Leads status = ' + leadsStatus);

  // Check jobs run status (if exists)
  var jobsStatus = jobsRunId ? checkApifyRunStatus(jobsRunId, jobsToken) : 'SUCCEEDED';
  if (jobsRunId) {
    Logger.log('Jobs status = ' + jobsStatus);
  }

  // If any run is still running or ready
  if (leadsStatus === 'RUNNING' || leadsStatus === 'READY' || jobsStatus === 'RUNNING' || jobsStatus === 'READY') {
    // Schedule next check
    var nextTrigger = ScriptApp.newTrigger('checkApifyAndProcess')
      .timeBased()
      .after(4 * 60 * 1000)
      .create();
    props.setProperty('APIFY_CHECK_TRIGGER_ID', nextTrigger.getUniqueId());
    Logger.log('Still running. Next check in 4 minutes.');
    return;
  }

  // If leads run failed
  if (leadsStatus !== 'SUCCEEDED') {
    GmailApp.sendEmail(
      getConfig('NOTIFICATION_EMAIL'),
      'Apify Leads Finder run FAILED',
      'Run ID: ' + leadsRunId + '. Status: ' + leadsStatus + '. Check Apify dashboard.'
    );
    clearApifyProperties(props);
    return;
  }

  // Leads dataset processing
  var leadsItems = fetchApifyDataset(leadsDatasetId, leadsToken);
  Logger.log('Fetched ' + leadsItems.length + ' leads from Leads Finder');

  var leadsWritten = 0;
  var leadsDups = 0;

  for (var k = 0; k < leadsItems.length; k++) {
    var item = leadsItems[k];
    var mapped = mapLeadsFinderRow(item);
    
    if (isDuplicate(mapped)) {
      leadsDups++;
      continue;
    }
    
    item._processed = '';
    item._processed_at = '';
    appendRow('raw_leads_finder', item);
    leadsWritten++;
  }
  Logger.log('Written ' + leadsWritten + ' new leads, ' + leadsDups + ' duplicates skipped');

  // Jobs dataset processing
  var jobsItemsCount = 0;
  if (jobsRunId && jobsStatus === 'SUCCEEDED') {
    var jobsItems = fetchApifyDataset(jobsDatasetId, jobsToken);
    Logger.log('Fetched ' + jobsItems.length + ' LinkedIn job postings');
    jobsItemsCount = jobsItems.length;
    
    for (var m = 0; m < jobsItems.length; m++) {
      var jobItem = jobsItems[m];
      appendRow('raw_linkedin_jobs', {
        position: jobItem.position || jobItem.title || '',
        company: jobItem.company || jobItem.companyName || '',
        companyLinkedInUrl: jobItem.companyLinkedInUrl || jobItem.companyUrl || '',
        location: jobItem.location || '',
        salary: jobItem.salary || '',
        postedAt: jobItem.postedAt || jobItem.publishedAt || '',
        jobUrl: jobItem.jobUrl || jobItem.url || '',
        description: jobItem.description || jobItem.descriptionText || '',
        _processed: '',
        _processed_at: '',
        _contact_needed: '',
        _employees_run_id: ''
      });
    }
    
    if (jobsItems.length > 0) {
      Logger.log('LinkedIn jobs field names check keys: ' + Object.keys(jobsItems[0]).join(', '));
    }
  }

  // Run processing functions immediately
  Logger.log('Starting processing of fetched data...');
  processLeadsFinder();
  processLinkedInJobs();
  Logger.log('Processing complete.');

  // Clean up
  clearApifyProperties(props);

  // Send summary email
  GmailApp.sendEmail(
    getConfig('NOTIFICATION_EMAIL'),
    'Apify Ingestion Complete: ' + leadsWritten + ' leads',
    'Leads Finder: ' + leadsItems.length + ' fetched (' + leadsWritten + ' written, ' + leadsDups + ' duplicates skipped)\n' +
    'LinkedIn Jobs: ' + jobsItemsCount + ' fetched\n\n' +
    'Check your sheet — linkedin_queue will update after next qualification run.\n' +
    'Run qualification manually from the menu: Run: Qualification Now'
  );
}

/**
 * Clean up PropertiesService after a run completes or fails.
 */
function clearApifyProperties(props) {
  props.deleteProperty('APIFY_LEADS_RUN_ID');
  props.deleteProperty('APIFY_LEADS_DATASET_ID');
  props.deleteProperty('APIFY_LEADS_TOKEN');
  props.deleteProperty('APIFY_JOBS_RUN_ID');
  props.deleteProperty('APIFY_JOBS_DATASET_ID');
  props.deleteProperty('APIFY_JOBS_TOKEN');
  props.deleteProperty('APIFY_POLL_ATTEMPTS');
  props.deleteProperty('APIFY_CHECK_TRIGGER_ID');
}

/**
 * Test that Apify API tokens are valid without starting a real run.
 */
function testApifyConnection() {
  var ui = SpreadsheetApp.getUi();
  var results = [];
  var tokens = [
    { key: 'APIFY_TOKEN_LEADS', label: 'Leads' },
    { key: 'APIFY_TOKEN_JOBS', label: 'Jobs' },
    { key: 'APIFY_TOKEN_EMPLOYEES', label: 'Employees' }
  ];
  
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    try {
      var token = getConfig(t.key);
      var url = 'https://api.apify.com/v2/users/me?token=' + token;
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var code = response.getResponseCode();
      if (code === 200) {
        var data = JSON.parse(response.getContentText());
        results.push('✓ ' + t.label + ' Token valid. User: ' + data.data.username);
        Logger.log('Token valid: ' + token.substring(0, 8) + '...');
      } else {
        results.push('✗ ' + t.label + ' Token INVALID. Response: ' + response.getContentText().substring(0, 100));
        Logger.log('Token INVALID: ' + token.substring(0, 8) + '...');
      }
    } catch (e) {
      results.push('✗ ' + t.label + ' Error: ' + e.message);
      Logger.log('Token connection test failed for ' + t.key + ': ' + e.message);
    }
  }
  
  ui.alert('Apify Connection Test Results', results.join('\n'), ui.ButtonSet.OK);
}

