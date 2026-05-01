/**
 * qualification.gs
 *
 * Runs the qualification pipeline, scoring leads via AI and routing them to queues.
 */

function getCompanyForContact(contactRow) {
  var companyRow = null;
  if (contactRow.company_domain) {
    companyRow = findFirstRowByValue('company_db', 'company_domain', contactRow.company_domain);
  }
  if (!companyRow && contactRow.company_linkedin_url) {
    companyRow = findFirstRowByValue('company_db', 'company_linkedin_url', contactRow.company_linkedin_url);
  }
  
  if (companyRow) {
    return companyRow.data;
  }
  
  return {
    company_name: contactRow.company_name,
    company_domain: contactRow.company_domain,
    company_linkedin_url: contactRow.company_linkedin_url,
    company_size: contactRow.company_size,
    industry: contactRow.industry,
    company_description: contactRow.company_description,
    company_annual_revenue_clean: contactRow.company_annual_revenue_clean,
    company_country: contactRow.contact_country,
    signal_type: contactRow.signal_type,
    signal_detail: contactRow.signal_detail
  };
}

function runFirecrawlIfNeeded(score, companyRow) {
  var threshold = getConfigNumber('FIRECRAWL_SCORE_THRESHOLD');
  if (score < threshold) {
    return {context: '', status: 'skipped'};
  }
  if (companyRow.firecrawl_status === 'done') {
    return {context: companyRow.firecrawl_context, status: 'cached'};
  }
  if (!companyRow.company_domain || String(companyRow.company_domain).indexOf('li_') === 0) {
    return {context: '', status: 'skipped'};
  }
  
  var result = scrapeAndExtractFreightContext(companyRow.company_domain, companyRow.company_name);
  
  var updateRowObj = findFirstRowByValue('company_db', 'company_domain', companyRow.company_domain);
  if (updateRowObj) {
    if (result.status === 'done') {
      updateRow('company_db', updateRowObj.rowNum, {
        firecrawl_context: result.context,
        firecrawl_status: 'done'
      });
    } else {
      updateRow('company_db', updateRowObj.rowNum, {
        firecrawl_status: 'failed'
      });
    }
  }
  
  return result;
}

function writeLinkedInQueueRow(contactRow, qualRow, firecrawlContext, priorityRank) {
  var rowObj = {
    queue_id: generateUUID(),
    priority_rank: priorityRank,
    date_added: new Date().toISOString(),
    full_name: qualRow.full_name,
    first_name: contactRow.first_name || String(contactRow.full_name || '').split(' ')[0],
    job_title: qualRow.job_title,
    contact_linkedin_url: qualRow.contact_linkedin_url,
    company_name: qualRow.company_name,
    company_domain: qualRow.company_domain,
    icp_score: qualRow.icp_score,
    signal_type: qualRow.signal_type,
    personalization_hook: qualRow.personalization_hook,
    firecrawl_context: firecrawlContext,
    suggested_dm: qualRow.suggested_dm || '',
    conversation_stage: 'not_sent'
  };
  appendRow('linkedin_queue', rowObj);
}

function writeEmailQueueRow(contactRow, qualRow) {
  var rowObj = {
    queue_id: generateUUID(),
    date_added: new Date().toISOString(),
    full_name: qualRow.full_name,
    first_name: contactRow.first_name || String(contactRow.full_name || '').split(' ')[0],
    email: qualRow.email,
    company_name: qualRow.company_name,
    job_title: qualRow.job_title,
    personalization_hook: qualRow.personalization_hook,
    icp_score: qualRow.icp_score,
    freight_spend_estimate: qualRow.freight_spend_estimate,
    contact_linkedin_url: qualRow.contact_linkedin_url,
    stage: 'queued'
  };
  return appendRow('email_queue', rowObj);
}

function getCurrentLinkedInQueueCount() {
  var rows = getAllRows('linkedin_queue');
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    var stage = String(rows[i].data.conversation_stage || '').trim().toLowerCase();
    if (stage !== 'expired' && stage !== 'not_interested') {
      count++;
    }
  }
  return count;
}

function runQualification() {
  Logger.log('Starting runQualification');
  var startTime = new Date().getTime();
  
  var pendingRows = getRowsByValue('contact_db', '_qualification_status', 'pending');
  if (pendingRows.length === 0) {
    Logger.log('No pending contacts');
    return;
  }
  
  var batchSize = getConfigNumber('BATCH_SIZE');
  var batch = pendingRows.slice(0, batchSize);
  Logger.log('Qualifying batch of ' + batch.length + ' contacts');
  
  var scored = 0, linkedin = 0, emailCount = 0, skipped = 0, errors = 0;
  var queueCount = getCurrentLinkedInQueueCount();
  var qualRunId = generateUUID();
  
  for (var i = 0; i < batch.length; i++) {
    var row = batch[i];
    var contactRow = row.data;
    var companyRow = getCompanyForContact(contactRow);
    
    var contactObj = {
      full_name: contactRow.full_name,
      job_title: contactRow.job_title,
      seniority_level: contactRow.seniority_level,
      contact_city: contactRow.contact_city,
      contact_country: contactRow.contact_country
    };
    
    var companyObj = {
      company_name: companyRow.company_name,
      industry: companyRow.industry,
      company_size: companyRow.company_size,
      company_annual_revenue_clean: companyRow.company_annual_revenue_clean,
      company_description: companyRow.company_description,
      signal_type: contactRow.signal_type,
      signal_detail: contactRow.signal_detail
    };
    
    var scoreResult = null;
    try {
      scoreResult = scoreLeadICP(contactObj, companyObj, '');
    } catch(e) {
      if (e.message === 'RATE_LIMITED') {
        Utilities.sleep(60000);
        try {
          scoreResult = scoreLeadICP(contactObj, companyObj, '');
        } catch (e2) {
          Logger.log('Rate limit retry failed: ' + e2.message);
          setCell('contact_db', row.rowNum, '_qualification_status', 'error');
          errors++;
          continue;
        }
      } else {
        Logger.log('Score error: ' + e.message);
        setCell('contact_db', row.rowNum, '_qualification_status', 'error');
        errors++;
        continue;
      }
    }
    Utilities.sleep(1500);
    
    if (scoreResult.channel === 'skip') {
      setCell('contact_db', row.rowNum, '_qualification_status', 'skipped');
      setCell('contact_db', row.rowNum, '_qualification_run_id', qualRunId);
      skipped++;
      continue;
    }
    
    var firecrawlResult = runFirecrawlIfNeeded(scoreResult.score, companyRow);
    if (firecrawlResult.status === 'done') {
      Utilities.sleep(2000);
    }
    
    var threshold = getConfigNumber('FIRECRAWL_SCORE_THRESHOLD');
    if (firecrawlResult.context && scoreResult.score < threshold) {
      try {
        scoreResult = scoreLeadICP(contactObj, companyObj, firecrawlResult.context);
        Utilities.sleep(1500);
      } catch (e) {
        // Ignore and keep old score
      }
    }
    
    var hook = '';
    try {
      hook = generateHook(contactObj, companyObj, firecrawlResult.context || '');
      Utilities.sleep(1500);
    } catch (e) {
      hook = 'Noticed ' + (companyObj.company_name || 'your company') + ' in the ' + (companyObj.industry || 'logistics') + ' space';
    }
    
    var suggestedDm = '';
    if (scoreResult.channel === 'linkedin') {
      try {
        suggestedDm = generateSuggestedDm(contactObj, companyObj, hook);
        Utilities.sleep(1500);
      } catch (e) {
        // ignore
      }
    }
    
    var qualRow = {
      qualification_id: generateUUID(),
      contact_id: contactRow.contact_id,
      date_qualified: new Date().toISOString(),
      full_name: contactRow.full_name,
      job_title: contactRow.job_title,
      company_name: contactRow.company_name,
      company_domain: contactRow.company_domain,
      contact_linkedin_url: contactRow.contact_linkedin_url,
      email: contactRow.email,
      source: contactRow.source,
      signal_type: contactRow.signal_type,
      signal_detail: contactRow.signal_detail,
      icp_score: scoreResult.score,
      score_reasons: scoreResult.score_reasons,
      freight_spend_estimate: scoreResult.freight_spend_estimate,
      personalization_hook: hook,
      firecrawl_used: firecrawlResult.status === 'done' ? 'yes' : (firecrawlResult.status === 'failed' ? 'failed' : 'no'),
      channel: scoreResult.channel,
      routing_status: 'pending'
    };
    
    qualRow.suggested_dm = suggestedDm; // temp var
    
    var routingStatus = 'skipped';
    if (scoreResult.channel === 'linkedin') {
      queueCount++;
      var priorityRank = queueCount;
      writeLinkedInQueueRow(contactRow, qualRow, firecrawlResult.context || '', priorityRank);
      routingStatus = 'routed_linkedin';
      linkedin++;
    } else if (scoreResult.channel === 'email') {
      if (!contactRow.email && contactRow.contact_linkedin_url) {
        queueCount++;
        var priorityRank2 = queueCount;
        writeLinkedInQueueRow(contactRow, qualRow, firecrawlResult.context || '', priorityRank2);
        routingStatus = 'routed_linkedin';
        linkedin++;
      } else {
        var newRowNum = writeEmailQueueRow(contactRow, qualRow);
        var instantlyId = addLeadToInstantly(contactRow, qualRow);
        if (instantlyId && instantlyId !== 'already_exists') {
          setCell('email_queue', newRowNum, 'instantly_lead_id', instantlyId);
        }
        routingStatus = 'routed_email';
        emailCount++;
      }
    }
    
    qualRow.routing_status = routingStatus;
    delete qualRow.suggested_dm;
    appendRow('qualification_results', qualRow);
    
    setCell('contact_db', row.rowNum, '_qualification_status', 'scored');
    setCell('contact_db', row.rowNum, '_qualification_run_id', qualRunId);
    scored++;
  }
  
  var duration = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('Qualification completed. Scored: ' + scored + ', LinkedIn: ' + linkedin + ', Email: ' + emailCount + ', Skipped: ' + skipped + ', Errors: ' + errors);
  
  appendRow('run_log', {
    timestamp: new Date().toISOString(),
    run_type: 'qualification',
    records_read: batch.length,
    records_processed: scored,
    records_skipped: skipped,
    records_errored: errors,
    routed_linkedin: linkedin,
    routed_email: emailCount,
    duration_seconds: duration
  });
}
