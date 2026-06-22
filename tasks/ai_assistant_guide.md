# AI Assistant Build Guide
## Freight Audit Outreach System — Full Automation Upgrade

---

## HOW TO USE THIS GUIDE

You are an AI coding assistant helping build a Google Apps Script automation system.
Read this entire document before writing a single line of code.

The system already exists with working code. You are making targeted additions and changes.
Do not rewrite working files unless explicitly told to. Add to them.

The existing codebase is in the documents attached to this conversation.
Read every existing file before making changes. Understand what each function does.

---

## WHAT EXISTS (DO NOT BREAK THESE)

These files are complete and working. Read them. Do not modify unless told to:

- `config.gs` — getConfig(), getConfigNumber(), refreshConfig() ✓
- `sheets_helper.gs` — all sheet read/write helpers ✓
- `column_maps.gs` — Apify column → contact_db mapping ✓
- `utils.gs` — generateUUID(), safeJsonParse(), buildConversationHistory() ✓
- `dedup.gs` — isDuplicate(), registerContact() ✓
- `kimi_client.gs` — scoreLeadICP(), generateHook(), generateSuggestedDm(), draftReply() ✓
- `firecrawl_client.gs` — scrapeAndExtractFreightContext() ✓
- `qualification.gs` — runQualification() ✓
- `instantly_client.gs` — addLeadToInstantly(), pauseLeadInInstantly(), sendReplyViaInstantly() ✓

These files exist as STUBS — they have comments but no real code. Build them:

- `reply_handler.gs` — PHASE 6 stub, needs full implementation
- `notifications.gs` — PHASE 6 stub, needs full implementation
- `scheduler.gs` — PHASE 6 stub, needs full implementation

These files need ADDITIONS on top of existing code:

- `ingestion.gs` — has manual-paste processing functions, needs Apify API functions added
- `Code.gs` — has menu and doPost, needs onEdit and menu updates
- `triggers.gs` — has basic triggers, needs to be replaced with the new scheduler

---

## WHAT WE ARE BUILDING

### The Goal

Full automation of the ingestion layer. Instead of manually running Apify actors in the UI,
downloading CSVs, and pasting into sheets, the system now:

1. Triggers Apify actor runs automatically via API on a schedule
2. Polls for completion using PropertiesService + delayed triggers
3. Fetches results and writes directly to the correct sheet tabs
4. Immediately runs qualification on new data
5. LinkedIn queue is populated automatically with pre-written connection messages
6. User only needs to: open linkedin_queue tab, click each profile URL, send the pre-written message

### Multiple Apify Accounts Strategy

To maximize free tier compute credits across multiple Apify accounts,
each actor type uses its own API token:

- Leads Finder actor → APIFY_TOKEN_LEADS
- LinkedIn Jobs actor → APIFY_TOKEN_JOBS
- LinkedIn Company Employees actor → APIFY_TOKEN_EMPLOYEES

Each token comes from a different Apify account. Each account gets $5 free compute monthly.
This triples the free tier capacity.

### The Automated Flow

```
MONDAY / WEDNESDAY / FRIDAY 6:00 AM UTC
        ↓
triggerApifyRuns() fires (time-based trigger)
        ↓
Starts Leads Finder actor using APIFY_TOKEN_LEADS
Starts LinkedIn Jobs actor using APIFY_TOKEN_JOBS
Saves both run IDs to PropertiesService
Creates a delayed trigger: checkApifyAndProcess() fires in 4 minutes
        ↓
checkApifyAndProcess() fires
        ↓
Polls status of both runs
If still running: creates another 4-minute delayed trigger (max 15 retries)
If any failed: sends email alert, stops
If all succeeded: fetches dataset items, writes to sheets, runs processing
        ↓
processLeadsFinder() runs immediately → contact_db populated
processLinkedInJobs() runs immediately → company_db populated
        ↓
runQualification() fires (existing 4-hour trigger picks it up, or immediate call)
        ↓
linkedin_queue populated with:
  - contact_linkedin_url (clickable link)
  - suggested_dm (pre-written connection message to copy-paste)
  - personalization_hook (opening line)
  - icp_score and signal context
        ↓
USER MORNING ROUTINE (10-15 minutes):
  Open linkedin_queue tab
  Filter conversation_stage = 'not_sent', sort by priority_rank
  For each row: click contact_linkedin_url, open LinkedIn
                copy suggested_dm text
                send connection request with that message
                update connection_sent_date and conversation_stage = 'request_sent'

SAM.GOV and RSS remain manual entries in raw_signal_sources
LinkedIn Company Employees lookups remain manual (for signal sources 2/3/4)
```

---

## CONFIG TAB CHANGES

Add these new keys to the config tab. The user will fill in the values manually.

New keys to add (instruct the user at the end of your implementation):

| Key | Description |
|-----|-------------|
| APIFY_TOKEN_LEADS | Apify API token from Account 1 (for Leads Finder) |
| APIFY_TOKEN_JOBS | Apify API token from Account 2 (for LinkedIn Jobs) |
| APIFY_TOKEN_EMPLOYEES | Apify API token from Account 3 (for Employees actor) |
| APIFY_LEADS_ACTOR_ID | Actor ID for Leads Finder (format: username~actor-name) |
| APIFY_JOBS_ACTOR_ID | Actor ID for LinkedIn Jobs Scraper |
| APIFY_EMPLOYEES_ACTOR_ID | Actor ID for LinkedIn Company Employees |
| LINKEDIN_JOB_KEYWORDS | freight audit,carrier invoice,transportation billing,freight billing analyst |
| APIFY_FETCH_COUNT | 100 |
| APIFY_MAX_POLL_ATTEMPTS | 15 |

Existing keys that stay unchanged:
OPENROUTER_API_KEY, KIMI_MODEL, INSTANTLY_API_KEY, INSTANTLY_CAMPAIGN_ID,
FIRECRAWL_API_KEY, NOTIFICATION_EMAIL, ICP_SCORE_THRESHOLD_EMAIL,
ICP_SCORE_THRESHOLD_LINKEDIN, FIRECRAWL_SCORE_THRESHOLD, DAILY_LINKEDIN_LIMIT,
TARGET_LOCATIONS, TARGET_INDUSTRIES, SENDER_NAME, SENDER_COMPANY, BATCH_SIZE

---

## BUILD TASK 1: Update ingestion.gs

Read the existing ingestion.gs completely first. It has:
- upsertCompanyDb()
- writeContactDb()
- processLeadsFinder()
- processLinkedInJobs()
- processEmployees()
- processSignalSources()

DO NOT modify any of these functions. Add the following new functions at the bottom of the file.

### Function: runApifyActor(actorId, token, inputJson)

```
Purpose: Start an Apify actor run via REST API and return the run metadata.

Implementation:
- URL: 'https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + token
- Method: POST
- Headers: Content-Type: application/json
- Payload: JSON.stringify(inputJson)
- muteHttpExceptions: true
- If response code !== 201: log full error response, return null
- Parse response JSON
- Return {runId: data.data.id, datasetId: data.data.defaultDatasetId}
- Wrap in try/catch: on any error log and return null
```

### Function: checkApifyRunStatus(runId, token)

```
Purpose: Check if an Apify actor run is complete.

Implementation:
- URL: 'https://api.apify.com/v2/actor-runs/' + runId + '?token=' + token
- Method: GET
- muteHttpExceptions: true
- If response code !== 200: return 'FAILED'
- Parse response JSON
- Return data.data.status as string: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT'
- On any error: return 'FAILED'
```

### Function: fetchApifyDataset(datasetId, token)

```
Purpose: Fetch all results from a completed Apify run dataset.

Implementation:
- URL: 'https://api.apify.com/v2/datasets/' + datasetId + '/items?token=' + token + '&format=json&clean=true&limit=200'
- Method: GET
- muteHttpExceptions: true
- If response code !== 200: log error, return []
- Parse response JSON — it is a direct array of objects (not wrapped)
- Return the array
- On any error: log and return []
```

### Function: triggerApifyRuns()

```
Purpose: Start all Apify actor runs and schedule the polling check.
Called by the Mon/Wed/Fri 6am time trigger.

Implementation:

1. Check required config keys exist. If any missing, log error and send email alert:
   - APIFY_TOKEN_LEADS, APIFY_LEADS_ACTOR_ID
   - APIFY_TOKEN_JOBS, APIFY_JOBS_ACTOR_ID
   On missing key: GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'),
     'Apify ingestion failed: missing config key', key + ' not found in config tab')
   Return early.

2. Build Leads Finder input from config:
   leadsInput = {
     contact_job_title: getConfig('TARGET_JOB_TITLES_ARRAY') — read TARGET_JOB_TITLES,
       split by comma, trim each value, create array.
       Wait — TARGET_JOB_TITLES may not exist as a key. Use this hardcoded list as fallback:
       ['VP Supply Chain', 'Director of Logistics', 'Head of Transportation',
        'VP Operations', 'Director Supply Chain', 'Logistics Manager',
        'Transportation Manager', 'Director of Operations', 'CFO', 'VP Procurement']
       Try getConfig('TARGET_JOB_TITLES') — if key not found, use fallback. Use try/catch.
     contact_location: getConfig('TARGET_LOCATIONS').split(',').map(function(s){return s.trim()}),
     company_industry: getConfig('TARGET_INDUSTRIES').split(',').map(function(s){return s.trim()}),
     min_revenue: 10000000,
     max_revenue: 200000000,
     email_status: ['validated'],
     fetch_count: getConfigNumber('APIFY_FETCH_COUNT')
   }

3. Build LinkedIn Jobs input from config:
   jobsInput = {
     queries: getConfig('LINKEDIN_JOB_KEYWORDS').split(',').map(function(k){return k.trim()}),
     locationName: 'United States',
     datePosted: 'past-month'
   }
   Note: The exact input format for the LinkedIn Jobs actor varies by actor version.
   Use this structure — if actor ID doesn't match, the user will need to adjust.

4. Start Leads Finder run:
   var leadsRun = runApifyActor(
     getConfig('APIFY_LEADS_ACTOR_ID'),
     getConfig('APIFY_TOKEN_LEADS'),
     leadsInput
   )
   If leadsRun is null: log error, send alert email, return

5. Start LinkedIn Jobs run:
   var jobsRun = runApifyActor(
     getConfig('APIFY_JOBS_ACTOR_ID'),
     getConfig('APIFY_TOKEN_JOBS'),
     jobsInput
   )
   If jobsRun is null: log warning (jobs run failed, will continue with leads only)
   Don't return — leads run still has value

6. Save to PropertiesService:
   var props = PropertiesService.getScriptProperties()
   props.setProperty('APIFY_LEADS_RUN_ID', leadsRun.runId)
   props.setProperty('APIFY_LEADS_DATASET_ID', leadsRun.datasetId)
   props.setProperty('APIFY_LEADS_TOKEN', getConfig('APIFY_TOKEN_LEADS'))
   If jobsRun is not null:
     props.setProperty('APIFY_JOBS_RUN_ID', jobsRun.runId)
     props.setProperty('APIFY_JOBS_DATASET_ID', jobsRun.datasetId)
     props.setProperty('APIFY_JOBS_TOKEN', getConfig('APIFY_TOKEN_JOBS'))
   props.setProperty('APIFY_POLL_ATTEMPTS', '0')

7. Create delayed trigger for checkApifyAndProcess:
   var trigger = ScriptApp.newTrigger('checkApifyAndProcess')
     .timeBased()
     .after(4 * 60 * 1000)
     .create()
   props.setProperty('APIFY_CHECK_TRIGGER_ID', trigger.getUniqueId())

8. Log 'Apify runs started. Leads run: ' + leadsRun.runId
   If jobsRun: log 'Jobs run: ' + jobsRun.runId
```

### Function: checkApifyAndProcess()

```
Purpose: Poll Apify run status, fetch results when done, write to sheets.
Called by delayed trigger from triggerApifyRuns() and recursively re-schedules itself.

Implementation:

1. Get PropertiesService:
   var props = PropertiesService.getScriptProperties()

2. Delete the trigger that called this function:
   var triggerIdToDelete = props.getProperty('APIFY_CHECK_TRIGGER_ID')
   If triggerIdToDelete exists:
     var allTriggers = ScriptApp.getProjectTriggers()
     For each trigger: if trigger.getUniqueId() === triggerIdToDelete: ScriptApp.deleteTrigger(trigger)
   props.deleteProperty('APIFY_CHECK_TRIGGER_ID')

3. Get run IDs and tokens:
   var leadsRunId = props.getProperty('APIFY_LEADS_RUN_ID')
   var leadsDatasetId = props.getProperty('APIFY_LEADS_DATASET_ID')
   var leadsToken = props.getProperty('APIFY_LEADS_TOKEN')
   var jobsRunId = props.getProperty('APIFY_JOBS_RUN_ID') // may be null
   var jobsDatasetId = props.getProperty('APIFY_JOBS_DATASET_ID')
   var jobsToken = props.getProperty('APIFY_JOBS_TOKEN')

   If leadsRunId is empty or null:
     Log 'No pending Apify runs found — nothing to check'
     Return

4. Increment poll attempts:
   var attempts = parseInt(props.getProperty('APIFY_POLL_ATTEMPTS') || '0') + 1
   props.setProperty('APIFY_POLL_ATTEMPTS', attempts.toString())
   var maxAttempts = getConfigNumber('APIFY_MAX_POLL_ATTEMPTS')

   If attempts > maxAttempts:
     Log 'Max poll attempts reached — Apify runs may have timed out'
     GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'),
       'Apify runs timed out after ' + maxAttempts + ' checks',
       'Runs did not complete within expected time. Check Apify dashboard.')
     clearApifyProperties(props)
     Return

5. Check leads run status:
   var leadsStatus = checkApifyRunStatus(leadsRunId, leadsToken)
   Log 'Attempt ' + attempts + ': Leads status = ' + leadsStatus

6. Check jobs run status (if exists):
   var jobsStatus = jobsRunId ? checkApifyRunStatus(jobsRunId, jobsToken) : 'SUCCEEDED'
   If jobsRunId: Log 'Jobs status = ' + jobsStatus

7. If any run is still 'RUNNING':
   Schedule next check:
   var nextTrigger = ScriptApp.newTrigger('checkApifyAndProcess')
     .timeBased().after(4 * 60 * 1000).create()
   props.setProperty('APIFY_CHECK_TRIGGER_ID', nextTrigger.getUniqueId())
   Log 'Still running. Next check in 4 minutes.'
   Return

8. If leads run FAILED (status is not SUCCEEDED):
   GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'),
     'Apify Leads Finder run FAILED',
     'Run ID: ' + leadsRunId + '. Check Apify dashboard.')
   clearApifyProperties(props)
   Return

9. All runs complete — fetch and write results:

   LEADS FINDER:
   var leadsItems = fetchApifyDataset(leadsDatasetId, leadsToken)
   Log 'Fetched ' + leadsItems.length + ' leads from Leads Finder'

   For each item in leadsItems:
     Build a row object matching raw_leads_finder headers exactly:
     The Apify Leads Finder returns fields with these exact names:
     first_name, last_name, full_name, job_title, headline, functional_level,
     seniority_level, email, mobile_number, personal_email, linkedin, city, state,
     country, company_name, company_domain, company_website, company_linkedin,
     company_linkedin_uid, company_size, industry, company_description,
     company_annual_revenue, company_annual_revenue_clean, company_total_funding,
     company_total_funding_clean, company_founded_year, company_phone,
     company_street_address, company_city, company_state, company_country,
     company_postal_code, company_full_address, company_market_cap, keywords,
     company_technologies

     CRITICAL: The Apify item object has these exact field names — they match the
     raw_leads_finder tab headers exactly. Use appendRow() directly with the item
     after adding _processed = '' (empty, not 'new').

     Before appending: check isDuplicate() using item.linkedin as contact_linkedin_url
     and item.email. If duplicate: skip with log.

     If not duplicate: appendRow('raw_leads_finder', item)
     Note: _processed and _processed_at will be empty — processLeadsFinder() fills them.

   Log 'Written N new leads, M duplicates skipped'

   LINKEDIN JOBS (if jobsRunId exists and jobsStatus = SUCCEEDED):
   var jobsItems = fetchApifyDataset(jobsDatasetId, jobsToken)
   Log 'Fetched ' + jobsItems.length + ' LinkedIn job postings'

   For each item in jobsItems:
     The LinkedIn Jobs actor returns: position, company, companyLinkedInUrl,
     location, salary, postedAt, jobUrl, description

     appendRow('raw_linkedin_jobs', {
       position: item.position || item.title,
       company: item.company || item.companyName,
       companyLinkedInUrl: item.companyLinkedInUrl || item.companyUrl,
       location: item.location,
       salary: item.salary || '',
       postedAt: item.postedAt || item.publishedAt || '',
       jobUrl: item.jobUrl || item.url,
       description: item.description || item.descriptionText || ''
       // _processed, _processed_at, _contact_needed, _employees_run_id left empty
     })

   Note: LinkedIn Jobs actor field names may vary by actor version. The code above
   tries multiple field name variants. If items have different field names, log a
   warning with the actual field names found: Object.keys(jobsItems[0])

10. Run processing functions immediately:
    Log 'Starting processing of fetched data...'
    processLeadsFinder()
    processLinkedInJobs()
    Log 'Processing complete. Qualification will run at next 4h trigger or can be run manually.'

11. Clean up PropertiesService:
    clearApifyProperties(props)

12. Send summary email:
    GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'),
      'Apify ingestion complete: ' + leadsItems.length + ' leads',
      'Leads Finder: ' + leadsItems.length + ' fetched\n' +
      'LinkedIn Jobs: ' + (jobsItems ? jobsItems.length : 0) + ' fetched\n' +
      'Check your sheet — linkedin_queue will update after next qualification run.\n' +
      'Run qualification manually from the menu: Run: Qualification Now')
```

### Function: clearApifyProperties(props)

```
Purpose: Clean up PropertiesService after a run completes or fails.

Implementation:
props.deleteProperty('APIFY_LEADS_RUN_ID')
props.deleteProperty('APIFY_LEADS_DATASET_ID')
props.deleteProperty('APIFY_LEADS_TOKEN')
props.deleteProperty('APIFY_JOBS_RUN_ID')
props.deleteProperty('APIFY_JOBS_DATASET_ID')
props.deleteProperty('APIFY_JOBS_TOKEN')
props.deleteProperty('APIFY_POLL_ATTEMPTS')
props.deleteProperty('APIFY_CHECK_TRIGGER_ID')
```

### Function: testApifyConnection()

```
Purpose: Test that Apify API tokens are valid without starting a real run.

Implementation:
- For each of APIFY_TOKEN_LEADS, APIFY_TOKEN_JOBS, APIFY_TOKEN_EMPLOYEES:
  GET https://api.apify.com/v2/users/me?token={token}
  If 200: log 'Token valid: ' + token.substring(0,8) + '...'
  If not 200: log 'Token INVALID: ' + response.getContentText()
- Show a UI alert with results
```

---

## BUILD TASK 2: Build reply_handler.gs

Replace the stub completely. Build these three functions.

### Function: handleInstantlyWebhook(payload)

```
Purpose: Process reply_received webhook from Instantly.
Called by doPost() in Code.gs.

Implementation:

1. Check payload.event value:
   Instantly may use different event field names. Check both:
   - payload.event
   - payload.event_type
   If neither equals 'reply_received': log and return immediately.

2. Extract contact info:
   var email = payload.email || payload.lead_email || payload.to_email
   var replyText = payload.reply_text || payload.message || payload.body || ''
   var fromName = payload.from_name || ''

   If email is empty: log 'Webhook received with no email' and return

3. Find contact in email_queue:
   var queueResult = findFirstRowByValue('email_queue', 'email', email)
   If not found: log 'Unknown contact replied: ' + email and return
   var emailQueueRow = queueResult.data
   var emailQueueRowNum = queueResult.rowNum

4. Build conversation history:
   var history = buildConversationHistory(email, 'email')

5. Build replyContext:
   var replyContext = {
     full_name: emailQueueRow.full_name || fromName,
     job_title: emailQueueRow.job_title || '',
     company_name: emailQueueRow.company_name || '',
     freight_spend_estimate: emailQueueRow.freight_spend_estimate || '',
     personalization_hook: emailQueueRow.personalization_hook || '',
     conversation_history: history,
     their_message: replyText
   }

6. Call Kimi to draft reply:
   var kimiResult = draftReply(replyContext)

7. Write to replies tab:
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
   })

8. Update email_queue row:
   updateRow('email_queue', emailQueueRowNum, {
     reply_received: 'yes',
     reply_date: formatDateISO(),
     reply_preview: replyText.substring(0, 100),
     stage: kimiResult.intent_classification === 'hot' ? 'hot' : 'replied'
   })

9. CRITICAL: Pause the Instantly sequence:
   pauseLeadInInstantly(email)
   (If this fails, the sequence keeps sending while you're in a conversation)

10. If hot lead: send alert
    If kimiResult.intent_classification === 'hot':
      sendHotLeadAlert(emailQueueRow, replyText, kimiResult, 'email')

11. Log 'Webhook processed: reply from ' + email + ' | Intent: ' + kimiResult.intent_classification
```

### Function: handleLinkedInReplyEdit(editedRow, replyText)

```
Purpose: Called from onEdit when user pastes a reply into their_reply column of linkedin_queue.

Parameters:
- editedRow: {rowNum: number, data: object} — the linkedin_queue row that was edited
- replyText: string — the text pasted into their_reply column

Implementation:

1. Validate inputs:
   If replyText is empty or null: return
   If editedRow.data.contact_linkedin_url is empty: log and return

2. Find contact in contact_db to get full context:
   var contactResult = findFirstRowByValue(
     'contact_db', 'contact_linkedin_url', editedRow.data.contact_linkedin_url
   )
   var contactRow = contactResult ? contactResult.data : {}

3. Build conversation history:
   var history = buildConversationHistory(editedRow.data.contact_linkedin_url, 'linkedin')

4. Build replyContext:
   var replyContext = {
     full_name: editedRow.data.full_name || '',
     job_title: editedRow.data.job_title || '',
     company_name: editedRow.data.company_name || '',
     freight_spend_estimate: contactRow.freight_spend_estimate || '',
     personalization_hook: editedRow.data.personalization_hook || '',
     conversation_history: history,
     their_message: replyText
   }

5. Call Kimi:
   var kimiResult = draftReply(replyContext)

6. Write to replies tab:
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
   })

7. Update linkedin_queue row:
   setCell('linkedin_queue', editedRow.rowNum, 'conversation_stage',
     kimiResult.intent_classification === 'hot' ? 'hot' : 'replied_warm')

8. If hot: send alert
   If kimiResult.intent_classification === 'hot':
     sendHotLeadAlert(editedRow.data, replyText, kimiResult, 'linkedin')

9. Log 'LinkedIn reply draft created for ' + editedRow.data.full_name
```

### Function: processNewReplies()

```
Purpose: Send approved email replies via Instantly. Mark LinkedIn replies as manual.
Runs every 10 minutes via trigger.

Implementation:

1. Get all rows where send_status = 'approved':
   var approvedRows = getRowsByValue('replies', 'send_status', 'approved')
   If approvedRows.length === 0: return (no logging — runs too frequently)

2. Initialize counters: sent=0, manual=0, errors=0

3. For each approved row:

   If channel = 'email':
     var messageToSend = row.data.your_edit || row.data.kimi_draft
     If messageToSend is empty: updateRow with send_status='error', continue
     var success = sendReplyViaInstantly(row.data.email, messageToSend)
     If success:
       updateRow('replies', row.rowNum, {
         send_status: 'sent',
         sent_at: formatDateISO()
       })
       Find email_queue row and update stage:
         var queueResult = findFirstRowByValue('email_queue', 'email', row.data.email)
         If found:
           var newStage = row.data.intent_classification === 'hot' ? 'hot' : 'replied'
           setCell('email_queue', queueResult.rowNum, 'stage', newStage)
       sent++
     Else:
       updateRow('replies', row.rowNum, {send_status: 'error'})
       errors++

   If channel = 'linkedin':
     updateRow('replies', row.rowNum, {send_status: 'manual_required'})
     manual++
     (User copies the draft from kimi_draft or your_edit and sends on LinkedIn manually)

4. If any activity: log 'processNewReplies: sent=' + sent + ', manual=' + manual + ', errors=' + errors
```

---

## BUILD TASK 3: Build notifications.gs

Replace the stub completely.

### Function: sendHotLeadAlert(contactData, replyText, kimiResult, channel)

```
Parameters:
- contactData: object with full_name, job_title, company_name, email, contact_linkedin_url,
               freight_spend_estimate
- replyText: string — what they said
- kimiResult: object with recommended_action, intent_classification
- channel: 'email' | 'linkedin'

Implementation:

var subject = '🔥 Hot Lead: ' + contactData.company_name + ' (' + channel + ')'

var body = '🔥 HOT LEAD — ' + channel.toUpperCase() + '\n\n' +
  'Contact: ' + (contactData.full_name || 'Unknown') +
    ' (' + (contactData.job_title || 'Unknown title') + ')\n' +
  'Company: ' + (contactData.company_name || 'Unknown') + '\n' +
  'Channel: ' + channel + '\n'

If channel === 'email' and contactData.email:
  body += 'Email: ' + contactData.email + '\n'

If contactData.contact_linkedin_url:
  body += 'LinkedIn: ' + contactData.contact_linkedin_url + '\n'

If contactData.freight_spend_estimate:
  body += 'Freight spend: ' + contactData.freight_spend_estimate + '\n'

body += '\nTheir message:\n' + replyText + '\n\n' +
  'AI recommended action: ' + kimiResult.recommended_action + '\n\n' +
  'Draft reply is in your Replies tab with send_status = draft.\n' +
  'Edit if needed in the your_edit column, then set send_status = approved.\n' +
  'Next step: book a 20-minute discovery call.'

try {
  GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'), subject, body)
  Logger.log('Hot lead alert sent: ' + contactData.company_name)
} catch (e) {
  Logger.log('Failed to send hot lead alert: ' + e.message)
}
```

### Function: writeDailySummary()

```
Implementation:

Runs daily at 9am via trigger.

Count and summarize:
var contactDbRows = getAllRows('contact_db')
var pending = contactDbRows.filter(r => r.data._qualification_status === 'pending').length
var scored = contactDbRows.filter(r => r.data._qualification_status === 'scored').length
var skipped = contactDbRows.filter(r => r.data._qualification_status === 'skipped').length

var linkedinRows = getAllRows('linkedin_queue')
var notSent = linkedinRows.filter(r => r.data.conversation_stage === 'not_sent').length
var requestSent = linkedinRows.filter(r => r.data.conversation_stage === 'request_sent').length
var connected = linkedinRows.filter(r => r.data.conversation_stage === 'connected').length
var hot = linkedinRows.filter(r => r.data.conversation_stage === 'hot').length

var emailRows = getAllRows('email_queue')
var emailActive = emailRows.filter(r => r.data.stage === 'active').length
var emailReplied = emailRows.filter(r => r.data.reply_received === 'yes').length

var replyRows = getAllRows('replies')
var drafts = replyRows.filter(r => r.data.send_status === 'draft').length
var awaitingManual = replyRows.filter(r => r.data.send_status === 'manual_required').length

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
  '  LinkedIn manual sends needed: ' + awaitingManual

Logger.log(summary)

try {
  GmailApp.sendEmail(
    getConfig('NOTIFICATION_EMAIL'),
    'Daily Outreach Summary — ' + new Date().toDateString(),
    summary
  )
} catch(e) {
  Logger.log('Failed to send daily summary: ' + e.message)
}

appendRow('run_log', {
  timestamp: formatDateISO(),
  run_type: 'daily_summary',
  notes: summary.substring(0, 200)
})
```

---

## BUILD TASK 4: Build scheduler.gs

Replace the existing scheduler.gs stub AND the existing triggers.gs completely.
Keep only ONE file: scheduler.gs. Delete triggers.gs content (or leave it empty with a comment).

```javascript
/**
 * scheduler.gs — Time-Based Trigger Management
 */

function setUpTriggers() {
  // Delete ALL existing triggers first to prevent duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t)
  })

  // INGESTION: Apify runs Mon/Wed/Fri at 6am UTC
  // Apps Script timezone note: 'at(6)' uses the script's timezone.
  // Set script timezone to UTC in Project Settings for consistency.
  ScriptApp.newTrigger('triggerApifyRuns')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create()

  ScriptApp.newTrigger('triggerApifyRuns')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(6)
    .create()

  ScriptApp.newTrigger('triggerApifyRuns')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(6)
    .create()

  // QUALIFICATION: every 4 hours
  ScriptApp.newTrigger('runQualification')
    .timeBased()
    .everyHours(4)
    .create()

  // REPLY SEND LOOP: every 10 minutes
  ScriptApp.newTrigger('processNewReplies')
    .timeBased()
    .everyMinutes(10)
    .create()

  // DAILY SUMMARY: every day at 9am
  ScriptApp.newTrigger('writeDailySummary')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create()

  var ui = SpreadsheetApp.getUi()
  ui.alert('Triggers created',
    '✓ Apify ingestion: Mon/Wed/Fri at 6am\n' +
    '✓ Qualification: every 4 hours\n' +
    '✓ Reply send loop: every 10 minutes\n' +
    '✓ Daily summary: 9am daily\n\n' +
    'Verify in Apps Script → Triggers panel (clock icon).',
    ui.ButtonSet.OK)

  Logger.log('All triggers created successfully')
}
```

---

## BUILD TASK 5: Update Code.gs

Read the existing Code.gs. It already has:
- setupAllSheets()
- onOpen() with menu items
- testConfig()
- doPost()
- testAIClients()

Make these specific changes:

### Change 1: Update onOpen() menu

Replace the existing menu creation with this expanded version:

```javascript
function onOpen() {
  var ui = SpreadsheetApp.getUi()
  ui.createMenu('Outreach System')
    .addItem('Setup: Create All Sheets', 'setupAllSheets')
    .addItem('Setup: Create Triggers', 'setUpTriggers')
    .addSeparator()
    .addItem('▶ Run: Apify Ingestion Now', 'triggerApifyRuns')
    .addItem('▶ Run: Qualification Now', 'runQualification')
    .addItem('▶ Run: Process Replies Now', 'processNewReplies')
    .addSeparator()
    .addItem('Manual: Process Leads Finder Tab', 'processLeadsFinder')
    .addItem('Manual: Process LinkedIn Jobs Tab', 'processLinkedInJobs')
    .addItem('Manual: Process Employees Tab', 'processEmployees')
    .addItem('Manual: Process Signal Sources Tab', 'processSignalSources')
    .addSeparator()
    .addItem('Test: Config Check', 'testConfig')
    .addItem('Test: AI Clients', 'testAIClients')
    .addItem('Test: Apify Connection', 'testApifyConnection')
    .addToUi()
}
```

### Change 2: Add onEdit() function

Add this new function to Code.gs. Do not remove any existing functions:

```javascript
function onEdit(e) {
  try {
    if (!e || !e.source) return

    var sheet = e.source.getActiveSheet()
    var sheetName = sheet.getName()
    var editedRow = e.range.getRow()
    var editedCol = e.range.getColumn()

    // Guard: only row 1 onwards (not header)
    if (editedRow <= 1) return

    // LinkedIn reply handler: fires when 'their_reply' is edited in linkedin_queue
    if (sheetName === 'linkedin_queue') {
      var headers = getHeaders('linkedin_queue')
      var theirReplyColIndex = headers.indexOf('their_reply') + 1
      if (editedCol === theirReplyColIndex) {
        var newValue = e.value || e.range.getValue()
        if (newValue && String(newValue).trim().length > 0) {
          var rowData = {}
          var allValues = sheet.getRange(editedRow, 1, 1, headers.length).getValues()[0]
          for (var i = 0; i < headers.length; i++) {
            rowData[headers[i]] = allValues[i]
          }
          if (rowData.contact_linkedin_url) {
            handleLinkedInReplyEdit({rowNum: editedRow, data: rowData}, String(newValue).trim())
          }
        }
      }
    }

  } catch (err) {
    // onEdit must never throw — silent failure is better than breaking the sheet
    Logger.log('onEdit error: ' + err.message)
  }
}
```

---

## IMPORTANT NOTES FOR THE AI ASSISTANT

### Note 1: PropertiesService scope

Use `PropertiesService.getScriptProperties()` not `getUserProperties()`.
Script properties persist across all executions of the script, which is required
for passing state between the trigger that starts Apify runs and the trigger
that polls for completion.

### Note 2: Apify free tier per account

Each Apify account on the free plan gets $5 of monthly compute credit.
The code uses three separate API tokens (APIFY_TOKEN_LEADS, APIFY_TOKEN_JOBS,
APIFY_TOKEN_EMPLOYEES) so each actor type draws from a different account's credit.
This effectively triples the free monthly capacity.

### Note 3: Apify actor run flow timing

Apify actor runs are asynchronous. Starting a run returns immediately with a runId.
The actual computation happens on Apify's servers over the next few minutes.
The polling loop (checkApifyAndProcess) checks every 4 minutes.
At 15 max attempts × 4 minutes = 60 minutes maximum wait time.
Most Leads Finder runs complete in 5-15 minutes.

### Note 4: The delayed trigger trick

Apps Script cannot sleep for minutes within a single execution (only Utilities.sleep
up to a few seconds before it becomes impractical). The correct pattern for long waits is:

1. Function A runs, starts work, creates a time-based trigger for Function B in N minutes
2. Function A finishes (returns)
3. N minutes later, Apps Script invokes Function B automatically
4. Function B deletes the trigger that called it (to prevent it from running again)
5. Function B either schedules another check or completes the work

This is exactly what triggerApifyRuns() and checkApifyAndProcess() implement.

### Note 5: LinkedIn queue is the user's daily workspace

After qualification runs, the linkedin_queue tab contains everything the user needs:
- contact_linkedin_url: they click this to open LinkedIn in a new tab
- suggested_dm: they copy this text to use as the connection message
- personalization_hook: they can also use this as a shorter alternative
- icp_score: shows how strong this lead is (higher = connect first)
- conversation_stage: 'not_sent' means not yet contacted

The user's daily routine is:
1. Filter linkedin_queue by conversation_stage = 'not_sent'
2. Sort by priority_rank ascending (lower number = higher priority)
3. For each row: click the URL, send connection request with the suggested_dm text
4. Update connection_sent_date and change conversation_stage to 'request_sent'

No automation is needed for the connection request itself — LinkedIn does not
allow programmatic connection requests without their official API (which requires
application approval). Manual sending is the correct approach.

### Note 6: Existing code in replies.gs

There is an existing `replies.gs` file with some code. This is an earlier draft
that conflicts with `reply_handler.gs`. The correct implementation should be in
`reply_handler.gs`. The `replies.gs` file should either be deleted or emptied
(replace all content with a comment saying "see reply_handler.gs").

### Note 7: Error handling philosophy

Every external API call (Apify, Kimi, Firecrawl, Instantly, GmailApp) must be
wrapped in try/catch with muteHttpExceptions: true.

The system must NEVER crash silently. If something fails, it must either:
a) Log the error and continue processing other items
b) Send an email alert and stop gracefully
c) Return a safe default value

doPost() must ALWAYS return ContentService.createTextOutput('ok') even on error.
Instantly retries webhooks on non-200 responses, which would create duplicate replies.

---

## VERIFICATION STEPS

After implementing all changes, run these tests in order:

**Test 1: Config check**
Menu → Test: Config Check
Expected: All original keys log. New Apify keys will fail with 'not found' until user fills them.
That is expected — just verify the function runs without crashing.

**Test 2: Apify connection test** (after user fills Apify tokens)
Menu → Test: Apify Connection
Expected: Each token shows as valid/invalid with user count info from Apify.

**Test 3: AI clients test**
Menu → Test: AI Clients
Expected: scoreLeadICP, generateHook, draftReply all return valid JSON.
Firecrawl returns context or 'failed' status (never crashes).

**Test 4: Manual ingestion still works**
Paste 3 rows into raw_leads_finder manually.
Menu → Manual: Process Leads Finder Tab
Expected: 3 rows appear in contact_db with _qualification_status = 'pending'

**Test 5: Qualification**
Menu → Run: Qualification Now
Expected: contact_db rows get scored, appear in linkedin_queue or email_queue.
linkedin_queue rows have non-empty suggested_dm column.

**Test 6: Trigger setup**
Menu → Setup: Create Triggers
Expected: Alert shows 6 trigger confirmations.
Verify in Apps Script editor → Triggers panel: should see exactly 6 triggers.

**Test 7: LinkedIn reply flow**
In linkedin_queue, find a row and type test text into their_reply column.
Expected: Within 5 seconds, a new row appears in replies tab with send_status = 'draft'
and a valid kimi_draft reply.

**Test 8: Apify automated run** (after user fills actor IDs and tokens)
Menu → Run: Apify Ingestion Now (calls triggerApifyRuns directly)
Expected: Email arrives saying "Apify runs started"
4 minutes later: checkApifyAndProcess fires (can be seen in Apps Script execution log)
After completion: email arrives with ingestion summary

---

## USER SETUP INSTRUCTIONS

After the AI assistant completes all code changes, tell the user to do these things:

**Step 1: Fill new config keys**

Open the config tab and add these rows:
```
APIFY_TOKEN_LEADS        → API token from Apify Account 1
APIFY_TOKEN_JOBS         → API token from Apify Account 2
APIFY_TOKEN_EMPLOYEES    → API token from Apify Account 3
APIFY_LEADS_ACTOR_ID     → From Leads Finder actor URL on Apify
APIFY_JOBS_ACTOR_ID      → From LinkedIn Jobs actor URL on Apify
APIFY_EMPLOYEES_ACTOR_ID → From Employees actor URL on Apify
LINKEDIN_JOB_KEYWORDS    → freight audit,carrier invoice,transportation billing,freight billing analyst
APIFY_FETCH_COUNT        → 100
APIFY_MAX_POLL_ATTEMPTS  → 15
```

To find an actor ID: open the actor on apify.com → look at the URL
Example: apify.com/apify/leads-finder → actor ID is 'apify~leads-finder'
Or find it in the actor's API tab under "Actor ID"

**Step 2: Set Apps Script timezone to UTC**

In Apps Script editor → Project Settings (gear icon) → Time zone → set to UTC
This ensures the 6am Mon/Wed/Fri triggers fire at the right time.

**Step 3: Re-run setUpTriggers**

Menu → Setup: Create Triggers
This replaces old triggers with the new schedule.

**Step 4: Test the connection**

Menu → Test: Apify Connection
All three tokens should show as valid.

**Step 5: Test full flow manually**

Menu → Run: Apify Ingestion Now
Wait 10-15 minutes.
Check email for completion notification.
Check raw_leads_finder and raw_linkedin_jobs tabs for new data.
Menu → Run: Qualification Now
Check linkedin_queue — new rows should appear with suggested_dm filled.

**Step 6: Your daily routine (unchanged)**

Open linkedin_queue every morning.
Filter conversation_stage = 'not_sent', sort priority_rank ascending.
For each row: click contact_linkedin_url, copy suggested_dm, send connection request on LinkedIn.
Update connection_sent_date and conversation_stage to 'request_sent'.
Check replies tab for any AI-drafted responses needing approval.

---

## WHAT STAYS MANUAL (AND WHY)

These items remain manual and should not be automated:

1. **LinkedIn connection requests** — LinkedIn's ToS prohibits automated connection
   requests without official API access. Manual sending is required. The system
   makes this fast by pre-generating the exact message to copy-paste.

2. **SAM.gov entries** — Low volume (1-3 per week), high value. Manual entry
   ensures quality control and proper signal context.

3. **LinkedIn Company Employees lookups** — For companies found via job posts and
   SAM.gov, you still need to manually run the Employees actor and fill the
   source signal columns. This happens maybe once per week, 15 minutes.

4. **LinkedIn reply sends** — You copy the AI draft and send manually on LinkedIn.
   The system generates the draft instantly when you paste their reply.
```