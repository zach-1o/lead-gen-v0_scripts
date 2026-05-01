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
