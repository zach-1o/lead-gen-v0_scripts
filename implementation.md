# Freight Audit Outreach System
## Complete Implementation Plan for Google Apps Script

---

## How to use this document

This is a step-by-step guide for Claude Code to build the full system in Google Apps Script.
Each phase is a self-contained prompt. Paste it exactly. Verify every checklist item before
moving to the next phase. Do not skip phases — each one is a dependency for the next.

---

## System Overview

### What you do manually (3x per week, ~45 min)
1. Run Apify Leads Finder → download CSV → paste into `raw_leads_finder` tab
2. Run Apify LinkedIn Jobs actor → download CSV → paste into `raw_linkedin_jobs` tab
3. Check SAM.gov bookmark → type new RFPs into `raw_signal_sources` tab
4. Scan Feedly → paste relevant news into `raw_signal_sources` tab
5. For all companies from sources 2/3/4: find their LinkedIn company URL → batch into
   Apify LinkedIn Company Employees actor → download CSV → paste into `raw_employees` tab

### What the machine does automatically after each paste
- Deduplication across all sources by LinkedIn URL and email
- ICP scoring via Kimi K2.5 (1-10)
- Firecrawl website enrichment for score 8-10 leads
- Personalized hook generation per contact
- Channel routing: score 8-10 → LinkedIn Queue, score 4-7 → Email Queue
- Email leads pushed to Instantly API automatically
- Instantly reply webhook → Kimi drafts reply → written to Replies tab
- You approve email drafts → machine sends via Instantly API
- Hot lead detected → email notification to you

### What you do daily (20 min)
- Open LinkedIn Queue → send 20 connection requests → update status in sheet
- Open Replies tab → review AI drafts → approve email drafts → copy LinkedIn drafts and send manually

---

## Critical Column Name Rules

This system reads exact column header names from sheets. These names must match
EXACTLY what Apify outputs. Any mismatch = silent failure.

**Apify Leads Finder uses:** `linkedin` (the contact's LinkedIn profile URL)
**Apify Employees actor uses:** `linkedinUrl` (camelCase, same data different name)

In our unified Contact DB, we normalize both to: `contact_linkedin_url`
This normalization happens in the paste-processing script, not manually.

**Never rename Apify output columns when pasting.** Paste the raw CSV exactly.
The Apps Script reads the raw Apify column names and maps them internally.

---

## Sheet Architecture

Create a Google Sheet named: **Freight Audit Outreach**

### Overview of all tabs

```
RAW INPUT TABS (you paste Apify data here — never rename columns)
├── raw_leads_finder        ← Apify Leads Finder CSV paste target
├── raw_linkedin_jobs       ← Apify LinkedIn Jobs CSV paste target
├── raw_employees           ← Apify LinkedIn Company Employees CSV paste target
└── raw_signal_sources      ← Manual entry: SAM.gov RFPs + RSS/news

PROCESSING TABS (machine writes here)
├── contact_db              ← Single unified contact database (all sources merged)
├── company_db              ← Deduplicated company records with signal context
└── qualification_results   ← ICP scores, hooks, channel assignments

ACTION TABS (you work from these daily)
├── linkedin_queue          ← Your daily LinkedIn outreach list
├── email_queue             ← Contacts pushed to Instantly
└── replies                 ← AI-drafted replies for your review

SYSTEM TABS
├── config                  ← All runtime parameters
└── run_log                 ← Automation run history
```

---

## Tab 1: raw_leads_finder

**Purpose:** Paste target for Apify Leads Finder CSV exports. Do not add or rename columns.
The script reads Apify's exact column names from this tab.

**How to use:** After running Leads Finder in Apify UI, download CSV, paste starting at row 2.
Row 1 must have these exact headers (Apify outputs them automatically in the CSV):

```
A: first_name
B: last_name
C: full_name
D: job_title
E: headline
F: functional_level
G: seniority_level
H: email
I: mobile_number
J: personal_email
K: linkedin
L: city
M: state
N: country
O: company_name
P: company_domain
Q: company_website
R: company_linkedin
S: company_linkedin_uid
T: company_size
U: industry
V: company_description
W: company_annual_revenue
X: company_annual_revenue_clean
Y: company_total_funding
Z: company_total_funding_clean
AA: company_founded_year
AB: company_phone
AC: company_street_address
AD: company_city
AE: company_state
AF: company_country
AG: company_postal_code
AH: company_full_address
AI: company_market_cap
AJ: keywords
AK: company_technologies
AL: _processed          ← ADD THIS COLUMN MANUALLY (not from Apify)
AM: _processed_at       ← ADD THIS COLUMN MANUALLY
```

The two `_processed` columns are added by you when setting up the sheet.
They are NOT from Apify. The underscore prefix marks them as system columns.
When you paste new Apify data, leave these two columns blank — the script fills them.

---

## Tab 2: raw_linkedin_jobs

**Purpose:** Paste target for Apify LinkedIn Jobs Scraper CSV exports.

**Important:** LinkedIn Jobs actor gives you company signals, NOT individual contacts.
Rows here will have `_contact_needed = yes` until you run the Employees actor
and paste results into raw_employees.

Headers (Apify LinkedIn Jobs actor output — paste exactly as downloaded):

```
A: position              ← job title posted
B: company               ← company name
C: companyLinkedInUrl    ← IMPORTANT: use this as input to Employees actor
D: location
E: salary
F: postedAt
G: jobUrl
H: description
I: _processed            ← ADD MANUALLY
J: _processed_at         ← ADD MANUALLY
K: _contact_needed       ← ADD MANUALLY (script sets to 'yes' on all new rows)
L: _employees_run_id     ← ADD MANUALLY (you fill this with Apify run ID after Employees actor run)
```

Note: `companyLinkedInUrl` is the exact field name LinkedIn Jobs actor uses.
This is what you copy into the Employees actor input.

---

## Tab 3: raw_employees

**Purpose:** Paste target for Apify LinkedIn Company Employees actor CSV exports.
You run this actor for companies found in raw_linkedin_jobs, raw_signal_sources.

**Critical:** The Employees actor outputs camelCase field names. Paste exactly as downloaded.

Headers (Apify LinkedIn Company Employees actor — Short mode output):

```
A: id                    ← Apify internal ID
B: publicIdentifier      ← LinkedIn username slug (e.g. "john-smith-123")
C: linkedinUrl           ← Full LinkedIn profile URL (NOTE: camelCase, differs from Leads Finder)
D: firstName
E: lastName
F: headline              ← Their LinkedIn headline
G: location              ← This is a JSON object in raw form: {"linkedinText":"...", "countryCode":"..."}
H: currentPosition       ← JSON array: [{"companyName":"..."}]
I: photo
J: premium
K: verified
L: _source_company_linkedin_url   ← ADD MANUALLY: the company LinkedIn URL you used as input
M: _source_signal_type            ← ADD MANUALLY: 'linkedin_job' | 'sam_gov' | 'rss_news'
N: _source_signal_row             ← ADD MANUALLY: row number in raw_linkedin_jobs or raw_signal_sources
O: _processed                     ← ADD MANUALLY
P: _processed_at                  ← ADD MANUALLY
```

**When you paste:** After downloading the Employees actor CSV, paste starting at row 2.
Then manually fill columns L, M, N for each batch before triggering processing.
Column L = the company LinkedIn URL you ran the actor against
Column M = where the company signal came from
Column N = the row number of that company in raw_linkedin_jobs or raw_signal_sources

This is the link that connects employee contacts back to their company signal.
Without it, the machine cannot generate a personalized hook using the job posting context.

---

## Tab 4: raw_signal_sources

**Purpose:** Manual entry tab for SAM.gov RFPs and RSS/news signals.
You type these in directly — no Apify paste here.

Headers:

```
A: date_found
B: source                ← 'sam_gov' | 'rss_news'
C: company_name
D: company_linkedin_url  ← you look this up on LinkedIn manually
E: signal_title          ← RFP title or news headline
F: signal_detail         ← RFP description or article summary (first 300 chars)
G: signal_url            ← link to the RFP or article
H: contact_name          ← if SAM.gov lists a point of contact
I: contact_email         ← if SAM.gov lists contact email
J: _employees_run_id     ← you fill after running Employees actor
K: _contact_needed       ← 'yes' until Employees actor run is done
L: _processed
M: _processed_at
```

---

## Tab 5: contact_db

**Purpose:** Single unified contact database. Machine writes here after processing
all four raw tabs. One row per unique contact. All sources merged and normalized.
You never paste directly into this tab.

Headers:

```
A: contact_id            ← generated UUID (script creates this)
B: date_added
C: source                ← 'leads_finder' | 'linkedin_job' | 'sam_gov' | 'rss_news'
D: first_name
E: last_name
F: full_name
G: job_title
H: headline
I: seniority_level
J: contact_linkedin_url  ← normalized from 'linkedin' (Leads Finder) or 'linkedinUrl' (Employees)
K: email                 ← from Leads Finder or Employees Full+email mode
L: company_name
M: company_domain
N: company_linkedin_url
O: company_size
P: industry
Q: company_description
R: company_annual_revenue_clean
S: contact_city
T: contact_country
U: signal_type           ← what triggered this contact: 'icp_match' | 'linkedin_job' | 'sam_gov' | 'rss_news'
V: signal_title          ← the specific signal (job title posted, RFP title, news headline)
W: signal_detail         ← full signal context passed to Kimi
X: dedup_key             ← contact_linkedin_url if available, else email, else full_name+company_domain
Y: _qualification_status ← 'pending' | 'scored' | 'skipped' | 'error'
Z: _qualification_run_id ← which qualification run processed this contact
```

**Deduplication rule:** Before writing to contact_db, check dedup_key against existing rows.
If a contact appears in both Leads Finder (with email) and Employees actor (from job signal),
keep the Leads Finder row (more data) and add the signal context from the other source.

---

## Tab 6: company_db

**Purpose:** One row per unique company. Stores the aggregated signal context.
Machine writes here. Used to enrich contact scoring with company-level signals.

Headers:

```
A: company_domain        ← primary dedup key
B: company_name
C: company_linkedin_url
D: company_size
E: industry
F: company_description
G: company_annual_revenue_clean
H: company_country
I: signals_found         ← JSON array of all signals found for this company
J: highest_signal_type   ← 'linkedin_job' > 'sam_gov' > 'rss_news' > 'icp_match'
K: firecrawl_context     ← website scrape result (filled during qualification)
L: firecrawl_status      ← 'pending' | 'done' | 'failed' | 'skipped'
M: first_seen_date
N: last_updated_date
```

---

## Tab 7: qualification_results

**Purpose:** One row per scored contact. Machine writes after ICP scoring.
Links back to contact_db. Source of truth for channel routing decisions.

Headers:

```
A: qualification_id      ← generated UUID
B: contact_id            ← links to contact_db column A
C: date_qualified
D: full_name
E: job_title
F: company_name
G: company_domain
H: contact_linkedin_url
I: email
J: source
K: signal_type
L: signal_detail
M: icp_score             ← 1-10 from Kimi
N: score_reasons         ← Kimi explanation
O: freight_spend_estimate
P: personalization_hook  ← AI-generated opening line
Q: firecrawl_used        ← 'yes' | 'no' | 'failed'
R: channel               ← 'linkedin' | 'email' | 'skip'
S: routing_status        ← 'pending' | 'routed_linkedin' | 'routed_email' | 'skipped'
```

---

## Tab 8: linkedin_queue

**Purpose:** Your daily action tab. One row per contact routed to LinkedIn outreach.
Machine writes new rows. You update status columns manually each morning.

Headers:

```
A: queue_id              ← generated UUID
B: priority_rank         ← lower = higher priority (1 = contact first)
C: date_added
D: full_name
E: first_name
F: job_title
G: contact_linkedin_url  ← you click this to open their LinkedIn profile
H: company_name
I: company_domain
J: icp_score
K: signal_type
L: personalization_hook
M: firecrawl_context     ← website context for crafting your message
N: suggested_dm          ← AI-generated first DM text (you copy-paste this on LinkedIn)
O: connection_sent_date  ← YOU FILL: date you sent the connection request
P: connection_accepted_date ← YOU FILL: date they accepted
Q: dm_sent_date          ← YOU FILL: date you sent first DM
R: their_reply           ← YOU FILL: paste their reply here to trigger AI draft
S: conversation_stage    ← 'not_sent' | 'request_sent' | 'connected' | 'dm_sent' |
                            'replied_warm' | 'replied_cold' | 'interested' | 'hot' |
                            'not_interested' | 'expired'
T: notes
```

**Your daily workflow:**
1. Filter `conversation_stage = not_sent`, sort by `priority_rank` ascending
2. Click `contact_linkedin_url` → send connection request on LinkedIn
3. Update `connection_sent_date` and `conversation_stage = request_sent`
4. For accepted connections: update `connection_accepted_date` → `conversation_stage = connected`
5. Send DM by copying `suggested_dm` text → paste on LinkedIn → update `dm_sent_date`
6. When they reply: paste reply into `their_reply` → machine auto-generates draft in Replies tab
   (onEdit trigger fires when you paste into `their_reply` column)

---

## Tab 9: email_queue

**Purpose:** Machine writes here when contacts are pushed to Instantly.
You read this for pipeline visibility. You do not write to this tab.

Headers:

```
A: queue_id
B: date_added
C: full_name
D: first_name
E: email
F: company_name
G: job_title
H: personalization_hook
I: icp_score
J: freight_spend_estimate
K: contact_linkedin_url  ← included for reference even though channel is email
L: instantly_lead_id     ← filled by machine after Instantly API call
M: sequence_start_date
N: emails_sent_count
O: last_email_date
P: open_count
Q: click_count
R: reply_received        ← 'yes' | 'no'
S: reply_date
T: reply_preview         ← first 100 chars of reply
U: stage                 ← 'queued' | 'active' | 'opened' | 'clicked' | 'replied' |
                            'interested' | 'hot' | 'unsubscribed' | 'bounced' | 'dormant'
V: notes
```

---

## Tab 10: replies

**Purpose:** AI-drafted replies for your review. Machine writes draft rows.
You set `send_status = approved` to trigger sending for email replies.
For LinkedIn replies: you copy the draft and send manually.

Headers:

```
A: reply_id
B: date_received
C: channel               ← 'email' | 'linkedin'
D: full_name
E: company_name
F: job_title
G: contact_linkedin_url
H: email
I: their_message
J: conversation_history  ← all prior messages formatted as text
K: kimi_draft            ← AI-generated reply
L: your_edit             ← you can edit here before approving; if blank, kimi_draft is sent
M: intent_classification ← 'hot' | 'warm' | 'neutral' | 'cold' (from Kimi)
N: recommended_action    ← 'book_call' | 'send_audit_offer' | 'follow_up_7_days' | 'close_thread'
O: send_status           ← 'draft' | 'approved' | 'sent' | 'manual_required' | 'skip' | 'error'
P: sent_at
Q: notes
```

**Your daily workflow:**
1. Filter `send_status = draft`
2. Read `their_message` and `kimi_draft`
3. Edit in `your_edit` column if needed (leave blank to send kimi_draft as-is)
4. Set `send_status = approved` for email replies (machine sends within 10 min)
5. For `channel = linkedin`: copy `kimi_draft` or `your_edit` → send on LinkedIn manually → set `send_status = sent`

---

## Tab 11: config

Column A = key, Column B = value. Fill these manually before running any automation.

| Key | Value | Notes |
|-----|-------|-------|
| OPENROUTER_API_KEY | your key | From openrouter.ai |
| KIMI_MODEL | moonshotai/kimi-k2 | Or moonshotai/kimi-k2-5 if available |
| INSTANTLY_API_KEY | your key | From Instantly dashboard |
| INSTANTLY_CAMPAIGN_ID | your campaign ID | Create campaign first |
| FIRECRAWL_API_KEY | your key | From firecrawl.dev |
| NOTIFICATION_EMAIL | your email | For hot lead alerts |
| ICP_SCORE_THRESHOLD_EMAIL | 4 | Minimum score to enter email queue |
| ICP_SCORE_THRESHOLD_LINKEDIN | 8 | Minimum score for LinkedIn queue |
| FIRECRAWL_SCORE_THRESHOLD | 8 | Only enrich leads scoring this or above |
| DAILY_LINKEDIN_LIMIT | 20 | Max connection requests per day |
| TARGET_LOCATIONS | United States | Comma-separated, read by scoring prompt |
| TARGET_INDUSTRIES | logistics and supply chain,transportation/trucking/railroad,warehousing,wholesale,food & beverages,manufacturing,distribution | Comma-separated |
| SENDER_NAME | your name | Used in email templates |
| SENDER_COMPANY | your company name | Used in email templates |
| BATCH_SIZE | 50 | Max leads to qualify per run |

---

## Tab 12: run_log

Machine writes one row per automation run.

Headers:
```
A: timestamp
B: run_type              ← 'process_leads_finder' | 'process_linkedin_jobs' |
                            'process_employees' | 'process_signals' |
                            'qualification' | 'send_loop' | 'webhook_reply' | 'daily_summary'
C: records_read
D: records_processed
E: records_skipped
F: records_errored
G: routed_linkedin
H: routed_email
I: duration_seconds
J: notes
```

---

## Apps Script File Structure

Open Sheet → Extensions → Apps Script → create these files:

```
Code.gs              ← onOpen menu, doPost webhook entry, onEdit trigger
config.gs            ← getConfig(), config cache
sheets_helper.gs     ← all sheet read/write by header name (never by index)
column_maps.gs       ← Apify column name → contact_db column name mappings
kimi_client.gs       ← callKimi(), scoreLeadICP(), generateHook(), draftReply()
firecrawl_client.gs  ← scrapeWebsite(), extractFreightContext()
dedup.gs             ← isDuplicate(), getOrCreateDedup(), addToDedupCache()
ingestion.gs         ← processLeadsFinder(), processLinkedInJobs(),
                        processEmployees(), processSignalSources()
qualification.gs     ← runQualification(), routeContact()
instantly_client.gs  ← addLead(), pauseLead(), sendReply()
reply_handler.gs     ← processNewReplies(), handleInstantlyWebhook(),
                        handleLinkedInReplyEdit()
notifications.gs     ← sendHotLeadAlert(), writeDailySummary()
scheduler.gs         ← setUpTriggers()
utils.gs             ← generateUUID(), formatDate(), safeJsonParse(),
                        truncateText(), buildConversationHistory()
```

---

## Column Mapping Reference (column_maps.gs)

This is the most critical file. It defines how Apify's exact output column names
map to your normalized contact_db column names. If this is wrong, everything breaks.

```javascript
// Apify Leads Finder column → contact_db column
var LEADS_FINDER_MAP = {
  'first_name':                    'first_name',
  'last_name':                     'last_name',
  'full_name':                     'full_name',
  'job_title':                     'job_title',
  'headline':                      'headline',
  'seniority_level':               'seniority_level',
  'email':                         'email',
  'linkedin':                      'contact_linkedin_url',   // NOTE: 'linkedin' not 'linkedinUrl'
  'city':                          'contact_city',
  'country':                       'contact_country',
  'company_name':                  'company_name',
  'company_domain':                'company_domain',
  'company_linkedin':              'company_linkedin_url',
  'company_size':                  'company_size',
  'industry':                      'industry',
  'company_description':           'company_description',
  'company_annual_revenue_clean':  'company_annual_revenue_clean',
};

// Apify LinkedIn Company Employees column → contact_db column
// NOTE: Employees actor uses camelCase field names
var EMPLOYEES_MAP = {
  'firstName':    'first_name',
  'lastName':     'last_name',
  'linkedinUrl':  'contact_linkedin_url',   // NOTE: 'linkedinUrl' not 'linkedin'
  'headline':     'headline',
  // 'location' is a JSON object — parse it:
  //   location.parsed.country → contact_country
  //   location.parsed.city   → contact_city
  // 'currentPosition' is a JSON array — parse it:
  //   currentPosition[0].companyName → company_name (if not already known)
};

// Fields added from the signal source row (raw_linkedin_jobs or raw_signal_sources)
// These come from the _source_* columns you fill manually in raw_employees
var SIGNAL_CONTEXT_MAP = {
  '_source_signal_type':  'signal_type',
  // signal_title and signal_detail are looked up from the source row
};
```

---

## AI Prompt Templates

### ICP Scoring Prompt

```
You are an ICP scorer for a freight audit AI company.
We recover carrier invoice overcharges for US mid-market companies.
Charge model: 20-30% of recovered overcharges. Zero cost if nothing found.

Ideal customer profile:
- Industries: logistics, supply chain, 3PL, transportation, freight,
  manufacturing with significant freight operations, wholesale distribution,
  food and beverage distribution, industrial goods distribution
- Company size: 50-2000 employees
- Annual revenue: $10M-$200M
- Location: {TARGET_LOCATIONS}
- Best contact titles: VP Supply Chain, Director Logistics, CFO, COO,
  Director Operations, Head of Transportation, Logistics Manager,
  Transportation Manager, VP Operations, Director Supply Chain

Scoring guide:
10 = Perfect fit. Logistics/freight industry, right size, senior logistics title,
     strong direct signal (hiring freight auditor, posted freight audit RFP)
8-9 = Strong fit. Right industry and revenue, good title, moderate signal
6-7 = Decent fit. Right industry but size mismatch, or adjacent title (VP Finance at distributor)
4-5 = Weak fit. Adjacent industry (manufacturing but minimal freight context)
1-3 = Poor fit. Wrong industry, too small/large, logistics not significant

Contact data:
Name: {full_name}
Title: {job_title}
Seniority: {seniority_level}
Location: {contact_city}, {contact_country}

Company data:
Company: {company_name}
Industry: {industry}
Size: {company_size} employees
Revenue: {company_annual_revenue_clean}
Description: {company_description}
Website context: {firecrawl_context}

Signal that found this contact:
Type: {signal_type}
Detail: {signal_detail}

Return valid JSON only. No markdown. No text outside the JSON.
{
  "score": <integer 1-10>,
  "score_reasons": "<2-3 sentences explaining score>",
  "freight_spend_estimate": "<e.g. $2M-$5M annually>",
  "channel": "<'linkedin' if score >= 8, 'email' if score 4-7, 'skip' if <= 3>"
}
```

### Hook Generation Prompt

```
Write the opening line of a cold outreach message for a freight audit AI company.
We recover carrier invoice overcharges. Charge % of savings — zero if nothing found.

ONE sentence only (max 20 words):
- References something specific about this contact, company, or the signal
- Does NOT mention our product
- Sounds like a peer wrote it, not a sales template
- Creates relevance, not flattery

Context:
Contact: {full_name}, {job_title} at {company_name}
Industry: {industry}
Revenue: {company_annual_revenue_clean}
Signal type: {signal_type}
Signal detail: {signal_detail}
Company description: {company_description}
Website context: {firecrawl_context}

Strong examples:
- "Noticed {company_name} is hiring a freight audit specialist — the role caught my attention."
- "Saw {company_name} recently issued an RFP for transportation audit services."
- "With {company_name}'s distribution scale, multi-carrier invoice reconciliation tends to be a significant ongoing challenge."

Return only the hook sentence. No quotes. No explanation.
```

### Suggested DM Prompt (for linkedin_queue.suggested_dm)

```
Write a short LinkedIn DM (3 sentences max) for a freight audit AI company
reaching out to a logistics decision maker.

Rules:
- If signal_type is 'linkedin_job': reference the job posting naturally in sentence 1
- If signal_type is 'sam_gov': reference the RFP they posted
- If signal_type is 'rss_news': reference the news/event briefly
- If signal_type is 'icp_match': open with a genuine industry question
- Sentence 2: transition — ask one question about their current audit process
- Sentence 3: offer the free audit as a low-friction next step
- Sound like a peer, not a salesperson

Contact: {first_name}, {job_title} at {company_name}
Signal type: {signal_type}
Signal detail: {signal_detail}
Hook already generated: {personalization_hook}

Return only the DM text. No subject line.
```

### Reply Drafting Prompt

```
You handle B2B sales replies for a freight audit AI company.
Free offer: 30-day audit on carrier invoices. Charge % of savings — zero if nothing.

Contact: {full_name}, {job_title} at {company_name}
Freight spend estimate: {freight_spend_estimate}
Opening hook used: {personalization_hook}

Conversation so far:
{conversation_history}

Their latest message:
{their_message}

Write a reply that:
- Directly responds to what they said
- Moves toward a 20-min call or starting the free audit
- Is warm and human — not scripted
- Is 3-5 sentences maximum
- Pricing questions: explain shared savings in one sentence, offer free audit
- Hesitant: lean on zero-risk free audit offer
- Technical questions: answer briefly, suggest a call for details

Classify intent:
hot     = pricing ask, demo request, yes to call, wants to schedule
warm    = interested, asking questions, wants more info
neutral = polite, noncommittal
cold    = not interested, wrong person

Return valid JSON only. No markdown.
{
  "draft_reply": "<reply text>",
  "intent_classification": "<hot|warm|neutral|cold>",
  "recommended_action": "<book_call|send_audit_offer|follow_up_7_days|close_thread>"
}
```

---

# PHASES

---

## Phase 1 — Sheet Setup + Config + Sheet Helpers

### Objective
Create all 12 tabs with exact headers. Build config.gs and sheets_helper.gs.
These two modules are used by every other phase — get them exactly right.

### Senior engineer notes
- Headers in row 1 must match this document exactly, including underscores and case
- sheets_helper.gs must address columns by header name, never by index
- Config cache must work — reading the Config tab on every API call adds seconds
- Dedup check must build a Set once per script execution, not scan row-by-row

### Claude Code prompt

```
I am building a Google Apps Script system inside a Google Sheet named
"Freight Audit Outreach". The sheet has 12 tabs. I will give you the
exact header rows for each tab and you will create setup code plus
the two foundational modules.

PART 1: Create a function called setupAllSheets() that:

Creates all 12 tabs if they don't exist, in this order:
raw_leads_finder, raw_linkedin_jobs, raw_employees, raw_signal_sources,
contact_db, company_db, qualification_results, linkedin_queue,
email_queue, replies, config, run_log

For each tab, sets row 1 to these exact headers (I'll give them per tab):

raw_leads_finder headers (columns A onwards):
first_name, last_name, full_name, job_title, headline, functional_level,
seniority_level, email, mobile_number, personal_email, linkedin, city,
state, country, company_name, company_domain, company_website,
company_linkedin, company_linkedin_uid, company_size, industry,
company_description, company_annual_revenue, company_annual_revenue_clean,
company_total_funding, company_total_funding_clean, company_founded_year,
company_phone, company_street_address, company_city, company_state,
company_country, company_postal_code, company_full_address,
company_market_cap, keywords, company_technologies, _processed, _processed_at

raw_linkedin_jobs headers:
position, company, companyLinkedInUrl, location, salary, postedAt,
jobUrl, description, _processed, _processed_at, _contact_needed,
_employees_run_id

raw_employees headers:
id, publicIdentifier, linkedinUrl, firstName, lastName, headline,
location, currentPosition, photo, premium, verified,
_source_company_linkedin_url, _source_signal_type, _source_signal_row,
_processed, _processed_at

raw_signal_sources headers:
date_found, source, company_name, company_linkedin_url, signal_title,
signal_detail, signal_url, contact_name, contact_email,
_employees_run_id, _contact_needed, _processed, _processed_at

contact_db headers:
contact_id, date_added, source, first_name, last_name, full_name,
job_title, headline, seniority_level, contact_linkedin_url, email,
company_name, company_domain, company_linkedin_url, company_size,
industry, company_description, company_annual_revenue_clean,
contact_city, contact_country, signal_type, signal_title,
signal_detail, dedup_key, _qualification_status, _qualification_run_id

company_db headers:
company_domain, company_name, company_linkedin_url, company_size,
industry, company_description, company_annual_revenue_clean,
company_country, signals_found, highest_signal_type, firecrawl_context,
firecrawl_status, first_seen_date, last_updated_date

qualification_results headers:
qualification_id, contact_id, date_qualified, full_name, job_title,
company_name, company_domain, contact_linkedin_url, email, source,
signal_type, signal_detail, icp_score, score_reasons,
freight_spend_estimate, personalization_hook, firecrawl_used,
channel, routing_status

linkedin_queue headers:
queue_id, priority_rank, date_added, full_name, first_name, job_title,
contact_linkedin_url, company_name, company_domain, icp_score,
signal_type, personalization_hook, firecrawl_context, suggested_dm,
connection_sent_date, connection_accepted_date, dm_sent_date,
their_reply, conversation_stage, notes

email_queue headers:
queue_id, date_added, full_name, first_name, email, company_name,
job_title, personalization_hook, icp_score, freight_spend_estimate,
contact_linkedin_url, instantly_lead_id, sequence_start_date,
emails_sent_count, last_email_date, open_count, click_count,
reply_received, reply_date, reply_preview, stage, notes

replies headers:
reply_id, date_received, channel, full_name, company_name, job_title,
contact_linkedin_url, email, their_message, conversation_history,
kimi_draft, your_edit, intent_classification, recommended_action,
send_status, sent_at, notes

config headers:
key, value

run_log headers:
timestamp, run_type, records_read, records_processed, records_skipped,
records_errored, routed_linkedin, routed_email, duration_seconds, notes

After creating all tabs and headers, freeze row 1 on each tab.

PART 2: Create config.gs with:

1. A script-scope variable: var _configCache = null;

2. getConfig(key):
   - If _configCache is null, call _loadConfig()
   - Look up key in _configCache
   - Return value as trimmed string
   - If not found: throw new Error('Config key not found: ' + key)

3. _loadConfig():
   - Read all rows from 'config' tab
   - Build _configCache object from column A (key) and column B (value)
   - Skip rows where column A is empty or equals 'key' (header row)

4. getConfigNumber(key):
   - Calls getConfig(key), converts to Number
   - Throws if result is NaN

5. refreshConfig():
   - Sets _configCache = null, calls _loadConfig()

PART 3: Create sheets_helper.gs with:

1. _headerCache = {} (script-scope)

2. getSheet(tabName):
   Returns sheet object, throws Error if not found

3. getHeaders(tabName):
   - If _headerCache[tabName] exists, return it
   - Read row 1, trim each value, store in cache
   - Return array

4. colIndex(tabName, headerName):
   - Find headerName in getHeaders(tabName) (case-insensitive comparison)
   - Return 1-based column index
   - Throw Error if not found: 'Column "' + headerName + '" not found in ' + tabName

5. appendRow(tabName, dataObj):
   - Get headers
   - Build array of same length, filled with ''
   - For each key in dataObj: find its column index, set array position
   - Ignore keys not in headers (no error)
   - Call sheet.appendRow(array)
   - Return new row number (sheet.getLastRow())

6. updateRow(tabName, rowNum, dataObj):
   - For each key in dataObj: find colIndex, call sheet.getRange(rowNum, col).setValue(val)

7. getCell(tabName, rowNum, headerName):
   - Returns sheet.getRange(rowNum, colIndex(tabName, headerName)).getValue()

8. setCell(tabName, rowNum, headerName, value):
   - sheet.getRange(rowNum, colIndex(tabName, headerName)).setValue(value)

9. getAllRows(tabName):
   - sheet.getDataRange().getValues() → 2D array
   - Row 0 is headers
   - Return array of objects with header keys
   - Skip rows where every value is empty string or null
   - Return with row numbers: [{rowNum: 2, data: {col: val, ...}}, ...]
   Note: rowNum is 1-based and includes the header row offset

10. getRowsByValue(tabName, headerName, value):
    - Return array of {rowNum, data} where data[headerName] matches value
    - Case-insensitive, trimmed comparison

11. findFirstRowByValue(tabName, headerName, value):
    - Return first {rowNum, data} match, or null if not found

PART 4: Create column_maps.gs with exactly these two objects and one function:

LEADS_FINDER_MAP: maps Apify Leads Finder field names to contact_db field names
(use the mapping from the implementation plan spec)

EMPLOYEES_MAP: maps Apify Employees actor field names to contact_db field names
(use the mapping from spec — handle 'location' and 'currentPosition' as JSON strings)

Function mapLeadsFinderRow(apifyRow):
- Takes a row data object with Apify Leads Finder column names as keys
- Returns a contact_db-structured object using LEADS_FINDER_MAP
- For the 'linkedin' field: maps to 'contact_linkedin_url'
- Builds dedup_key: use contact_linkedin_url if not empty, else email,
  else full_name + '|' + company_domain
- Sets source = 'leads_finder'
- Sets signal_type = 'icp_match'
- Sets signal_title = job_title + ' at ' + company_name
- Sets signal_detail = company_description (first 300 chars)
- Returns the mapped object

Function mapEmployeesRow(apifyRow, signalType, signalTitle, signalDetail):
- Takes an Employees actor row + signal context
- Returns a contact_db-structured object using EMPLOYEES_MAP
- For 'linkedinUrl': maps to 'contact_linkedin_url'
- For 'location': safely parse the JSON string (it may be an object or string)
  Extract location.parsed.country → contact_country
  Extract location.parsed.city → contact_city
  If parse fails: use raw string for contact_country, leave contact_city empty
- For 'currentPosition': safely parse JSON array
  Extract currentPosition[0].companyName → use as company_name hint only if company_name empty
- For 'firstName' + 'lastName': combine into full_name
- Sets source based on signalType parameter: 'linkedin_job' | 'sam_gov' | 'rss_news'
- Sets signal_type, signal_title, signal_detail from parameters
- Builds dedup_key: contact_linkedin_url if not empty, else full_name + '|' + company_name
- Returns the mapped object

PART 5: Create Code.gs with:

1. onOpen():
   Menu 'Outreach System':
   - 'Setup: Create All Sheets' → setupAllSheets
   - separator
   - 'Process: Leads Finder Pastes' → processLeadsFinder
   - 'Process: LinkedIn Jobs Pastes' → processLinkedInJobs
   - 'Process: Employees Pastes' → processEmployees
   - 'Process: Signal Sources' → processSignalSources
   - separator
   - 'Run: Qualification Now' → runQualification
   - 'Run: Process Replies Now' → processNewReplies
   - separator
   - 'Setup: Create Triggers' → setUpTriggers
   - 'Test: Config Check' → testConfig

2. testConfig():
   Read and log (first 8 chars only) these keys:
   OPENROUTER_API_KEY, INSTANTLY_API_KEY, FIRECRAWL_API_KEY
   Read and log fully: ICP_SCORE_THRESHOLD_EMAIL, ICP_SCORE_THRESHOLD_LINKEDIN,
   FIRECRAWL_SCORE_THRESHOLD, NOTIFICATION_EMAIL
   Log 'Config check passed' if all succeed

3. doPost(e):
   var payload = JSON.parse(e.postData.contents)
   Call handleInstantlyWebhook(payload)
   Return ContentService.createTextOutput('ok')
   Wrap entire body in try/catch — always return 'ok' even on error

After all code is written, show me:
1. What setupAllSheets() does when the sheet already has some tabs
2. What mapLeadsFinderRow() returns for a row where 'linkedin' is empty but email exists
3. What colIndex('contact_db', 'contact_linkedin_url') returns and how it handles
   the case-insensitive comparison
```

### Verification checklist

- [ ] All 12 tabs exist with row 1 headers exactly matching this document
- [ ] Headers in raw_leads_finder include `_processed` and `_processed_at` as last two columns
- [ ] Headers in raw_employees include `_source_company_linkedin_url`, `_source_signal_type`, `_source_signal_row`
- [ ] `getConfig('INSTANTLY_API_KEY')` returns value without re-reading sheet on second call
- [ ] `colIndex('raw_leads_finder', 'linkedin')` returns correct 1-based index
- [ ] `colIndex('raw_employees', 'linkedinUrl')` returns correct 1-based index (different tab, different name)
- [ ] `mapLeadsFinderRow()` maps `linkedin` → `contact_linkedin_url` correctly
- [ ] `mapEmployeesRow()` maps `linkedinUrl` → `contact_linkedin_url` correctly
- [ ] `mapEmployeesRow()` handles location as JSON string without crashing
- [ ] `appendRow()` ignores keys not present in headers (no error thrown)
- [ ] Custom menu appears after running `onOpen()`
- [ ] `testConfig()` logs all 7 values without errors

---

## Phase 2 — Deduplication Module

### Objective
Build the deduplication system. Before any contact is written to contact_db,
the system must check if that contact already exists using the dedup_key.
This prevents the same person appearing twice from different sources.

### The dedup key logic
1. If contact_linkedin_url is not empty → use it as dedup_key (most reliable)
2. Else if email is not empty → use email
3. Else → use full_name + '|' + company_domain (least reliable, last resort)

This means: a contact found via Leads Finder (with email) and the same contact
found via Employees actor (with LinkedIn URL) will be caught as duplicates
only if they share the same LinkedIn URL OR email. If neither matches,
they may appear twice — acceptable edge case at this stage.

### Claude Code prompt

```
Phase 2: Build dedup.gs.

The project has Code.gs, config.gs, sheets_helper.gs, column_maps.gs from Phase 1.

Create dedup.gs with:

1. Script-scope cache: var _dedupCache = null;
   Structure: {linkedin_urls: Set, emails: Set, name_company_keys: Set}

2. _buildDedupCache():
   - Read all rows from contact_db
   - For each row: extract contact_linkedin_url, email, and
     full_name + '|' + company_domain
   - Add non-empty values to respective Sets (lowercase trimmed)
   - Store in _dedupCache

3. isDuplicate(mappedContactObj):
   - If _dedupCache is null: call _buildDedupCache()
   - Check in this order:
     a. If mappedContactObj.contact_linkedin_url is not empty:
        Check _dedupCache.linkedin_urls — return true if found
     b. Else if mappedContactObj.email is not empty:
        Check _dedupCache.emails — return true if found
     c. Else if full_name and company_domain both not empty:
        Check _dedupCache.name_company_keys — return true if found
   - Return false if none match

4. registerContact(mappedContactObj):
   - After a contact is successfully written to contact_db, call this
   - Adds their identifiers to the cache Sets
   - Ensures subsequent isDuplicate checks in the same run catch them

5. refreshDedupCache():
   - Sets _dedupCache = null, calls _buildDedupCache()

6. getDedupStats():
   - Returns {linkedin_urls: count, emails: count, name_company_keys: count}
   - Used for logging

After writing code, trace this scenario:
- contact_db already has John Smith with linkedinUrl 'linkedin.com/in/johnsmith'
  and email 'john@acme.com'
- New Leads Finder paste has a row with email 'john@acme.com' but NO linkedin field
- New Employees paste has a row with linkedinUrl 'linkedin.com/in/johnsmith' but no email
- Show what isDuplicate() returns for each and why
```

### Verification checklist

- [ ] `isDuplicate()` returns true for LinkedIn URL match even when email is different
- [ ] `isDuplicate()` returns true for email match even when LinkedIn URL is different
- [ ] `isDuplicate()` returns false for completely new contact
- [ ] `registerContact()` updates the cache so subsequent calls in same run catch it
- [ ] `_buildDedupCache()` handles empty contact_db without error

---

## Phase 3 — Ingestion: Processing All Four Raw Tabs

### Objective
Build the four processing functions that read raw Apify paste data,
map column names, run deduplication, and write to contact_db and company_db.
These functions run when you click the menu items or automatically after
a timed trigger.

### How each function works

**processLeadsFinder():**
Reads raw_leads_finder where `_processed` is empty or 'new'.
Maps each row using mapLeadsFinderRow().
Checks isDuplicate() — skips if duplicate.
Writes to contact_db with signal_type = 'icp_match'.
Upserts company into company_db.
Marks raw row `_processed = 'yes'`.

**processLinkedInJobs():**
Reads raw_linkedin_jobs where `_processed` is empty or 'new'.
These rows have company data but NO contact data.
Writes to company_db (or updates if exists) with signal info.
Sets `_contact_needed = 'yes'` (already set by you when you pasted).
Does NOT write to contact_db yet — contacts come from Employees actor.
Marks raw row `_processed = 'pending_employees'`.

**processEmployees():**
Reads raw_employees where `_processed` is empty or 'new'.
Maps each row using mapEmployeesRow() with signal context from
`_source_signal_type` and the referenced source row.
To get signal context: read `_source_signal_row` to get the row number,
then read that row from raw_linkedin_jobs or raw_signal_sources
to get signal_title and signal_detail.
Checks isDuplicate() — skips if found.
Writes to contact_db with correct signal context.
Marks raw row `_processed = 'yes'`.

**processSignalSources():**
Reads raw_signal_sources where `_processed` is empty or 'new'.
Writes to company_db with signal info.
If `contact_email` is filled: also writes a minimal contact_db row.
Sets `_contact_needed = 'yes'` for rows where no email contact exists.
Marks raw row `_processed = 'pending_employees'`.

### Claude Code prompt

```
Phase 3: Build ingestion.gs — four processing functions.

The project has all files from Phases 1 and 2.

Create ingestion.gs:

Helper: upsertCompanyDb(companyData, signalType, signalTitle, signalDetail):
- companyData object has: company_domain, company_name, company_linkedin_url,
  company_size, industry, company_description, company_annual_revenue_clean,
  company_country
- Check if company_domain already exists in company_db:
  findFirstRowByValue('company_db', 'company_domain', company_domain)
- If exists: update the row
  - Load existing signals_found JSON array, add new signal object, save back
  - Update highest_signal_type if new signal is higher priority
    (priority: linkedin_job > sam_gov > rss_news > icp_match)
  - Update last_updated_date
- If not exists: create new row
  - signals_found = JSON.stringify([{type: signalType, title: signalTitle,
    detail: signalDetail, date: today}])
  - highest_signal_type = signalType
  - firecrawl_status = 'pending'
  - first_seen_date = today
  - last_updated_date = today
- Return the company_domain

Helper: writeContactDb(mappedContactObj):
- Generate contact_id using generateUUID()
- Set date_added = today
- Set _qualification_status = 'pending'
- appendRow('contact_db', mappedContactObj + {contact_id, date_added, _qualification_status})
- Call registerContact(mappedContactObj) to update dedup cache
- Return contact_id

Function processLeadsFinder():
- Log start, get start time
- Read all rows from raw_leads_finder via getAllRows()
- Filter for rows where _processed is empty string or 'new'
- Initialize counters: processed=0, skipped_dup=0, skipped_empty=0, errors=0
- For each unprocessed row:
  a. If full_name is empty AND email is empty AND linkedin is empty: skip, errors++, continue
  b. mapped = mapLeadsFinderRow(row.data)
  c. If isDuplicate(mapped): setCell(..., '_processed', 'duplicate'), skipped_dup++, continue
  d. upsertCompanyDb(mapped, 'icp_match', mapped.signal_title, mapped.signal_detail)
  e. writeContactDb(mapped)
  f. setCell('raw_leads_finder', row.rowNum, '_processed', 'yes')
  g. setCell('raw_leads_finder', row.rowNum, '_processed_at', new Date().toISOString())
  h. processed++
- Write to run_log
- Log summary

Function processLinkedInJobs():
- Read raw_linkedin_jobs where _processed is empty or 'new'
- For each row:
  a. companyData = {company_name: row.data.company,
                    company_linkedin_url: row.data.companyLinkedInUrl,
                    company_domain: '',  ← we don't have domain from LinkedIn Jobs
                    company_size: '',
                    industry: '',
                    company_description: row.data.description (first 300 chars),
                    company_annual_revenue_clean: '',
                    company_country: ''}
  b. signal_title = row.data.position + ' (hiring)'
  c. signal_detail = 'Job posted: ' + row.data.position + '. ' + row.data.description (first 200 chars)
  d. For company_domain: try to extract from companyLinkedInUrl
     'linkedin.com/company/acme-logistics' → 'acme-logistics' as placeholder domain
     Use format: 'li_' + slug to mark it as a LinkedIn-derived domain
  e. upsertCompanyDb(companyData, 'linkedin_job', signal_title, signal_detail)
  f. setCell('raw_linkedin_jobs', row.rowNum, '_processed', 'pending_employees')
  g. setCell('raw_linkedin_jobs', row.rowNum, '_processed_at', new Date().toISOString())
  h. setCell('raw_linkedin_jobs', row.rowNum, '_contact_needed', 'yes')
- Write to run_log

Function processEmployees():
- Read raw_employees where _processed is empty or 'new'
- For each row:
  a. Get _source_signal_type from row.data._source_signal_type
  b. Get _source_signal_row from row.data._source_signal_row (convert to number)
  c. Look up signal context:
     If _source_signal_type = 'linkedin_job':
       sourceRow = read row _source_signal_row from raw_linkedin_jobs
       signal_title = sourceRow.position + ' (hiring at ' + sourceRow.company + ')'
       signal_detail = 'Company posted job: ' + sourceRow.position + '. ' + sourceRow.description (first 200 chars)
       company_name = sourceRow.company
       company_linkedin_url = sourceRow.companyLinkedInUrl
     If _source_signal_type = 'sam_gov' or 'rss_news':
       sourceRow = read row _source_signal_row from raw_signal_sources
       signal_title = sourceRow.signal_title
       signal_detail = sourceRow.signal_detail
       company_name = sourceRow.company_name
       company_linkedin_url = sourceRow.company_linkedin_url
  d. mapped = mapEmployeesRow(row.data, _source_signal_type, signal_title, signal_detail)
  e. Fill in company_name from signal context if not already in mapped
  f. If isDuplicate(mapped): mark 'duplicate', skip
  g. writeContactDb(mapped)
  h. setCell('raw_employees', row.rowNum, '_processed', 'yes')
  i. setCell('raw_employees', row.rowNum, '_processed_at', new Date().toISOString())
- Write to run_log

Function processSignalSources():
- Read raw_signal_sources where _processed is empty or 'new'
- For each row:
  a. companyData = {company_name: row.data.company_name,
                    company_linkedin_url: row.data.company_linkedin_url,
                    company_domain: '', ← not available from manual entry
                    ...rest empty}
  b. upsertCompanyDb(companyData, row.data.source, row.data.signal_title, row.data.signal_detail)
  c. If contact_email is not empty:
     Build minimal contact object from contact_name + contact_email + company info
     Check isDuplicate, if not: writeContactDb
  d. If contact_email is empty:
     setCell(..., '_contact_needed', 'yes')
  e. setCell(_processed, 'pending_employees')
- Write to run_log

After writing all code, trace this scenario with 3 pastes happening before
any processing runs:

Paste 1 into raw_leads_finder:
Row: John Smith, VP Supply Chain, john@midwestfood.com, linkedin.com/in/johnsmith,
Midwest Food Distributors, midwestfood.com, food and beverage, 200-500 employees, $45M revenue

Paste 2 into raw_linkedin_jobs:
Row: 'Freight Audit Manager' posted at 'FastShip 3PL', companyLinkedInUrl: 'linkedin.com/company/fastship-3pl'

Paste 3 into raw_employees (after running Employees actor on FastShip 3PL):
Row: Sarah Chen, VP Operations, linkedin.com/in/sarahchen
_source_signal_type: 'linkedin_job', _source_signal_row: 2 (the FastShip row)

Now processLeadsFinder() runs, then processLinkedInJobs(), then processEmployees().
Show every function call, every row written to contact_db and company_db,
and what dedup_key each contact gets.
```

### Verification checklist

- [ ] `processLeadsFinder()` maps `linkedin` column → `contact_linkedin_url` in contact_db
- [ ] `processEmployees()` maps `linkedinUrl` column → `contact_linkedin_url` in contact_db
- [ ] Both functions produce identical `contact_linkedin_url` column name in contact_db
- [ ] `processLinkedInJobs()` does NOT write to contact_db (only company_db)
- [ ] `processEmployees()` correctly reads signal context from the `_source_signal_row` reference
- [ ] `upsertCompanyDb()` updates existing company row when called twice for same domain
- [ ] A contact from Leads Finder and same contact from Employees actor → only one row in contact_db
- [ ] `_processed = 'pending_employees'` set on linkedin_jobs and signal_sources rows

---

## Phase 4 — Kimi Client + Firecrawl Client

### Objective
Build the AI and enrichment clients. Three Kimi functions using exact prompt
templates from this document. One Firecrawl function for website enrichment.
Every function must handle API failures gracefully — a failed AI call must
never crash the qualification pipeline.

### Claude Code prompt

```
Phase 4: Build kimi_client.gs, firecrawl_client.gs, utils.gs.

Create utils.gs:

1. generateUUID():
   Returns a UUID v4 string. Implementation:
   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
     var r = Math.random() * 16 | 0;
     var v = c == 'x' ? r : (r & 0x3 | 0x8);
     return v.toString(16);
   });

2. safeJsonParse(text, defaultVal):
   - Try JSON.parse(text) — return result if successful
   - If fails: try to extract JSON using regex: text.match(/\{[\s\S]*\}/)
   - Try parsing the match if found
   - If all fails: log 'JSON parse failed: ' + text.substring(0, 100)
     Return defaultVal

3. truncateText(text, maxChars):
   - If text is null or undefined: return ''
   - Return text.toString().substring(0, maxChars)

4. formatDateISO():
   Returns new Date().toISOString()

5. buildConversationHistory(contactLinkedinOrEmail, channel):
   - Read all rows from replies tab
   - Filter for rows where:
     email matches OR contact_linkedin_url matches
     AND send_status = 'sent'
   - Sort by date_received ascending
   - Build string:
     For each row: 'You: ' + (row.your_edit || row.kimi_draft) + '\n' +
                   'Them: ' + row.their_message + '\n'
   - Return the string, or empty string if no history

---

Create kimi_client.gs:

Base function _callKimi(systemPrompt, userPrompt, maxTokens):
- URL: https://openrouter.ai/api/v1/chat/completions
- Headers: {
    'Authorization': 'Bearer ' + getConfig('OPENROUTER_API_KEY'),
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://freightaudit.com'
  }
- Payload: JSON.stringify({
    model: getConfig('KIMI_MODEL'),
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ],
    max_tokens: maxTokens,
    temperature: 0.3
  })
- UrlFetchApp.fetch(url, {method:'post', headers:..., payload:..., muteHttpExceptions: true})
- Check getResponseCode():
  If 429: log 'Kimi rate limited', throw new Error('RATE_LIMITED')
  If not 200: log full error, throw new Error('KIMI_API_ERROR_' + code)
- Parse response, return data.choices[0].message.content.trim()

scoreLeadICP(contactObj, companyObj, firecrawlContext):
- contactObj has: full_name, job_title, seniority_level, contact_city, contact_country
- companyObj has: company_name, industry, company_size, company_annual_revenue_clean,
  company_description, signal_type, signal_detail
- firecrawlContext: string (may be empty)
- Build user prompt from ICP Scoring Prompt template in this spec
  Replace all {placeholders} with values. Use 'not available' for empty fields.
  Replace {TARGET_LOCATIONS} with getConfig('TARGET_LOCATIONS')
- System prompt: 'You are an expert ICP scorer. Return valid JSON only. No markdown.'
- Call _callKimi(system, user, 400)
- Parse with safeJsonParse(result, {score:0, score_reasons:'parse error',
  freight_spend_estimate:'unknown', channel:'skip'})
- Validate: score must be integer 1-10. channel must be 'linkedin'|'email'|'skip'
- If invalid: set score=0, channel='skip', add 'validation error' to score_reasons
- Return validated object

generateHook(contactObj, companyObj, firecrawlContext):
- Build user prompt from Hook Generation Prompt template in this spec
- System: 'Write one opening line for cold outreach. Return only the sentence.'
- Call _callKimi(system, user, 80)
- Trim result, remove surrounding quotes if present
- If result is empty or call fails: return fallback:
  'Noticed ' + companyObj.company_name + ' in the ' + companyObj.industry + ' space'
- Return result string

generateSuggestedDm(contactObj, companyObj, hook):
- Build user prompt from Suggested DM Prompt template in this spec
- System: 'Write a short LinkedIn DM. Return only the DM text.'
- Call _callKimi(system, user, 150)
- Return result string
- On failure: return hook + ' — curious how your team currently handles freight invoice auditing?'

draftReply(replyContext):
- replyContext: {full_name, job_title, company_name, freight_spend_estimate,
  personalization_hook, conversation_history, their_message}
- Build user prompt from Reply Drafting Prompt template in this spec
- System: 'Draft B2B sales reply. Return valid JSON only.'
- Call _callKimi(system, user, 500)
- Parse with safeJsonParse(result, {draft_reply: 'Thanks for your reply — would a
  quick 20-minute call work?', intent_classification: 'warm',
  recommended_action: 'book_call'})
- Return result

---

Create firecrawl_client.gs:

scrapeAndExtractFreightContext(domain, companyName):
- This is the only public function — call this from qualification
- If domain is empty or starts with 'li_': return {context: '', status: 'skipped'}
  (li_ prefix means it's a LinkedIn-derived placeholder, not a real domain)
- Build URL: if domain starts with 'http': use as-is, else prepend 'https://'
- POST to https://api.firecrawl.dev/v1/scrape
  Headers: {Authorization: 'Bearer ' + getConfig('FIRECRAWL_API_KEY')}
  Payload: {url: websiteUrl, formats: ['markdown'], onlyMainContent: true}
  muteHttpExceptions: true
- If response code != 200: return {context: '', status: 'failed'}
- Get markdown = response.data.markdown, truncate to 3000 chars
- If markdown is empty: return {context: '', status: 'failed'}
- Call _extractContext(markdown, companyName)
- Return {context: extractedText, status: 'done'}
- Wrap entire function in try/catch: on any error return {context:'', status:'failed'}

_extractContext(markdown, companyName):
- Call _callKimi with:
  system: 'Extract relevant logistics/freight context. Be concise. Return 2-3 sentences or exactly: none_found'
  user: 'From this company website for ' + companyName + ', extract mentions of:
         shipping, freight, carriers, distribution, warehouses, logistics,
         supply chain, transportation, or inventory.
         Return 2-3 sentences of the most relevant context.
         If nothing relevant: return exactly the string: none_found
         
         Text: ' + markdown
  maxTokens: 150
- If result is 'none_found' or empty: return ''
- Return result

---

Add to Code.gs:
Function testAIClients():
- Create sample contactObj and companyObj
- Call scoreLeadICP and log result
- Call generateHook and log result
- Create sample replyContext, call draftReply and log result
- Test firecrawl on a real domain: scrapeAndExtractFreightContext('ups.com', 'UPS')
- Log all results

After writing all code:
1. Show what happens when Kimi returns a 429 rate limit error during qualification —
   does qualification crash or handle it?
2. Show what scrapeAndExtractFreightContext('li_fastship-3pl', 'FastShip 3PL') returns
   and why
3. Show the full scoreLeadICP call for a VP Supply Chain at a $45M food distributor
   with signal_type='linkedin_job' and signal_detail='Hiring Freight Audit Manager'
```

### Verification checklist

- [ ] `_callKimi()` throws `'RATE_LIMITED'` error on 429 — not a generic crash
- [ ] `scoreLeadICP()` returns default skip object on parse failure — never throws
- [ ] `generateHook()` returns fallback string on API failure — never throws
- [ ] `scrapeAndExtractFreightContext('li_fastship-3pl', ...)` returns skipped without API call
- [ ] `scrapeAndExtractFreightContext()` returns `{context:'', status:'failed'}` on Firecrawl error
- [ ] `buildConversationHistory()` returns empty string for contact with no prior replies
- [ ] `safeJsonParse()` extracts JSON from response that has extra text around it

---

## Phase 5 — Qualification Pipeline

### Objective
Build `runQualification()` — reads pending contacts from contact_db, fetches company
context, optionally enriches with Firecrawl, scores with Kimi, generates hooks and
DM text, writes to qualification_results, routes to linkedin_queue or email_queue,
and pushes email contacts to Instantly.

### Execution limit strategy
Apps Script has a 6-minute limit. At ~4 seconds per contact (Kimi calls + sleep),
process 50 contacts per run. Trigger runs every 4 hours. Remaining contacts
are picked up on the next run.

### Claude Code prompt

```
Phase 5: Build qualification.gs and instantly_client.gs.

Create instantly_client.gs:

addLeadToInstantly(contactRow, qualificationRow):
- contactRow: from contact_db. qualificationRow: from qualification_results
- POST https://api.instantly.ai/api/v1/lead/add
- Headers: {Authorization: 'Bearer ' + getConfig('INSTANTLY_API_KEY'),
            Content-Type: 'application/json'}
- Body: {
    api_key: getConfig('INSTANTLY_API_KEY'),
    campaign_id: getConfig('INSTANTLY_CAMPAIGN_ID'),
    skip_if_in_workspace: true,
    leads: [{
      email: contactRow.email,
      first_name: contactRow.first_name || contactRow.full_name.split(' ')[0],
      company_name: contactRow.company_name,
      personalization: qualificationRow.personalization_hook,
      custom_variables: {
        job_title: contactRow.job_title,
        freight_spend: qualificationRow.freight_spend_estimate,
        icp_score: qualificationRow.icp_score.toString()
      }
    }]
  }
- muteHttpExceptions: true
- If 200: parse response, return lead identifier string
- If 400 with 'already exists' in response text: return 'already_exists'
- Any other error: log error details, return null

pauseLeadInInstantly(email):
- POST https://api.instantly.ai/api/v1/lead/pause
- Body: {api_key: ..., campaign_id: ..., email: email}
- muteHttpExceptions: true, log result, never throw

sendReplyViaInstantly(email, replyText):
- POST https://api.instantly.ai/api/v1/reply/send
- Body: {api_key: ..., email: email, reply: replyText}
- muteHttpExceptions: true
- Return true on 200, false otherwise, log on failure

---

Create qualification.gs:

Helper: getCompanyForContact(contactRow):
- Try findFirstRowByValue('company_db', 'company_domain', contactRow.company_domain)
- If not found AND company_linkedin_url exists:
  Try findFirstRowByValue('company_db', 'company_linkedin_url', contactRow.company_linkedin_url)
- If still not found: return a minimal company object built from contactRow fields
- Return the company_db row data object (or minimal fallback)

Helper: runFirecrawlIfNeeded(score, companyRow):
- If score < getConfigNumber('FIRECRAWL_SCORE_THRESHOLD'): return {context:'', status:'skipped'}
- If companyRow.firecrawl_status = 'done': return {context: companyRow.firecrawl_context, status:'cached'}
- If companyRow.company_domain is empty or starts with 'li_': return {context:'', status:'skipped'}
- Call scrapeAndExtractFreightContext(companyRow.company_domain, companyRow.company_name)
- If result.status = 'done':
  Update company_db row: firecrawl_context = result.context, firecrawl_status = 'done'
- Else:
  Update company_db row: firecrawl_status = 'failed'
- Return result

Helper: writeLinkedInQueueRow(contactRow, qualRow, firecrawlContext, priorityRank):
- Build linkedin_queue row object with all fields from spec
- suggested_dm = qualRow.suggested_dm (generated during qualification)
- conversation_stage = 'not_sent'
- appendRow('linkedin_queue', rowObj)

Helper: writeEmailQueueRow(contactRow, qualRow):
- Build email_queue row object
- stage = 'queued'
- appendRow('email_queue', rowObj)
- Return new row number

Helper: getCurrentLinkedInQueueCount():
- Count rows in linkedin_queue where conversation_stage is NOT 'expired' and NOT 'not_interested'
- Return count

Main function runQualification():
1. Log start, record start time
2. Read all contact_db rows where _qualification_status = 'pending'
3. If none: log 'No pending contacts' and return
4. Take first BATCH_SIZE rows (from getConfigNumber('BATCH_SIZE'))
5. Log 'Qualifying batch of ' + batch.length + ' contacts'
6. Counters: scored=0, linkedin=0, email=0, skipped=0, errors=0
7. queueCount = getCurrentLinkedInQueueCount()

8. For each contact in batch:
   a. contactRow = row.data
   b. companyRow = getCompanyForContact(contactRow)
   
   c. Build contactObj and companyObj for Kimi calls:
      contactObj: {full_name, job_title, seniority_level, contact_city, contact_country}
      companyObj: {company_name, industry, company_size, company_annual_revenue_clean,
                   company_description, signal_type: contactRow.signal_type,
                   signal_detail: contactRow.signal_detail}
   
   d. First pass: score with empty firecrawl context
      try {
        scoreResult = scoreLeadICP(contactObj, companyObj, '')
      } catch(e) {
        if (e.message === 'RATE_LIMITED') { Utilities.sleep(60000); try again once }
        else: log error, mark _qualification_status='error', errors++, continue
      }
      Utilities.sleep(1500)
   
   e. If scoreResult.channel = 'skip':
      setCell('contact_db', row.rowNum, '_qualification_status', 'skipped')
      skipped++; continue
   
   f. Firecrawl enrichment (only if score high enough):
      firecrawlResult = runFirecrawlIfNeeded(scoreResult.score, companyRow)
      If firecrawlResult.status = 'done': Utilities.sleep(2000)
      
      If firecrawl returned context AND score was originally < threshold:
        Re-score with firecrawl context:
        scoreResult = scoreLeadICP(contactObj, companyObj, firecrawlResult.context)
        Utilities.sleep(1500)
   
   g. Generate hook:
      hook = generateHook(contactObj, companyObj, firecrawlResult.context || '')
      Utilities.sleep(1500)
   
   h. Generate suggested DM (for linkedin_queue):
      suggestedDm = ''
      If scoreResult.channel = 'linkedin':
        suggestedDm = generateSuggestedDm(contactObj, companyObj, hook)
        Utilities.sleep(1500)
   
   i. Write to qualification_results:
      qualRow = {
        qualification_id: generateUUID(),
        contact_id: contactRow.contact_id,
        date_qualified: formatDateISO(),
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
        suggested_dm: suggestedDm,
        firecrawl_used: firecrawlResult.status === 'done' ? 'yes' :
                        firecrawlResult.status === 'skipped' ? 'no' : 'failed',
        channel: scoreResult.channel,
        routing_status: 'pending'
      }
      appendRow('qualification_results', qualRow)
      qualRowNum = run_log result to get the row number... 
      Actually: after appendRow, find the row just written:
      qualResultRow = findFirstRowByValue('qualification_results', 'contact_id', contactRow.contact_id)
   
   j. Route to queue:
      If scoreResult.channel = 'linkedin':
        queueCount++
        writeLinkedInQueueRow(contactRow, {...qualRow, suggested_dm: suggestedDm},
                               firecrawlResult.context || '', queueCount)
        updateRow('qualification_results', qualResultRow.rowNum, {routing_status: 'routed_linkedin'})
        linkedin++
      
      If scoreResult.channel = 'email':
        If contactRow.email is empty:
          If contactRow.contact_linkedin_url is not empty:
            Route to linkedin instead (fallback)
          Else:
            updateRow('qualification_results', qualResultRow.rowNum, {routing_status: 'skipped'})
            setCell('contact_db', row.rowNum, '_qualification_status', 'skipped')
            skipped++; continue
        Else:
          writeEmailQueueRow(contactRow, qualRow)
          instantlyId = addLeadToInstantly(contactRow, qualRow)
          If instantlyId is not null:
            Find the email_queue row just written, update instantly_lead_id and stage='active'
          updateRow('qualification_results', qualResultRow.rowNum, {routing_status: 'routed_email'})
          email++
   
   k. setCell('contact_db', row.rowNum, '_qualification_status', 'scored')
   k. setCell('contact_db', row.rowNum, '_qualification_run_id', new Date().toISOString())
   l. scored++

9. Log and write run_log row

10. If more contacts remain: log count of remaining

After writing all code, trace this full scenario:
- contact_db has 3 pending contacts:
  Contact A: John Smith, VP Supply Chain, midwestfood.com, signal='icp_match', email available
  Contact B: Sarah Chen, VP Operations, linkedinUrl only no email, signal='linkedin_job:Freight Audit Manager'
  Contact C: Bob Jones, HR Manager, acmetech.com, signal='icp_match'

- Assume Kimi scores: A=8 (linkedin), B=9 (linkedin), C=2 (skip)
- Assume Firecrawl returns freight context for A and B
- Show every function call, every row written across qualification_results,
  linkedin_queue, email_queue, and every status update in contact_db
```

### Verification checklist

- [ ] Contacts with `_qualification_status = 'scored'` are not re-processed
- [ ] Rate limit error (429) triggers a 60-second sleep and one retry — then marks as error
- [ ] Firecrawl skipped for `li_` prefixed domains
- [ ] Contact with no email but with LinkedIn URL routes to linkedin_queue, not skipped
- [ ] `addLeadToInstantly()` 'already_exists' response does not cause error
- [ ] `qualification_results.routing_status` updated after each routing decision
- [ ] `suggested_dm` generated only for linkedin-routed contacts
- [ ] Batch size respected — stops at BATCH_SIZE contacts per run

---

## Phase 6 — Reply Handler + Send Loop + Notifications

### Objective
Build the complete reply handling system:
- Instantly webhook receiver (doPost)
- onEdit trigger for LinkedIn reply drafts
- 10-minute send loop for approved email replies
- Hot lead email notifications

### Claude Code prompt

```
Phase 6: Build reply_handler.gs and notifications.gs. Update Code.gs.

Create reply_handler.gs:

Function handleInstantlyWebhook(payload):
- Only process payload.event = 'reply_received'. All others: return immediately.
- Extract: email = payload.email || payload.lead_email
           from_name = payload.from_name
           reply_text = payload.reply_text || payload.message
- Find contact in email_queue: findFirstRowByValue('email_queue', 'email', email)
- If not found: log 'Unknown Instantly contact: ' + email, return
- Load email_queue row data as emailQueueRow
- Load contact from contact_db: findFirstRowByValue('contact_db', 'email', email)
- Build conversation history: buildConversationHistory(email, 'email')
- Build replyContext: {
    full_name: emailQueueRow.full_name,
    job_title: emailQueueRow.job_title,
    company_name: emailQueueRow.company_name,
    freight_spend_estimate: emailQueueRow.freight_spend_estimate,
    personalization_hook: emailQueueRow.personalization_hook,
    conversation_history: conversationHistory,
    their_message: reply_text
  }
- Call draftReply(replyContext)
- Write to replies tab:
  appendRow('replies', {
    reply_id: generateUUID(),
    date_received: formatDateISO(),
    channel: 'email',
    full_name: emailQueueRow.full_name,
    company_name: emailQueueRow.company_name,
    job_title: emailQueueRow.job_title,
    contact_linkedin_url: emailQueueRow.contact_linkedin_url,
    email: email,
    their_message: reply_text,
    conversation_history: conversationHistory,
    kimi_draft: kimiResult.draft_reply,
    intent_classification: kimiResult.intent_classification,
    recommended_action: kimiResult.recommended_action,
    send_status: 'draft'
  })
- Update email_queue row:
  reply_received='yes', reply_date=now, reply_preview=reply_text.substring(0,100)
  stage = kimiResult.intent_classification === 'hot' ? 'hot' : 'replied'
- Call pauseLeadInInstantly(email)
- If kimiResult.intent_classification === 'hot':
  sendHotLeadAlert(emailQueueRow, reply_text, kimiResult, 'email')

Function handleLinkedInReplyEdit(editedRow, replyText):
This is called from onEdit when 'their_reply' column in linkedin_queue is edited.
- editedRow: {rowNum, data} — the linkedin_queue row that was edited
- replyText: the value just typed/pasted into 'their_reply'
- Load contact from contact_db using contact_linkedin_url
- Build conversation history: buildConversationHistory(editedRow.data.contact_linkedin_url, 'linkedin')
- Build replyContext using linkedin_queue row data
- Call draftReply(replyContext)
- Write to replies tab with channel='linkedin', send_status='draft'
- If intent_classification = 'hot':
  setCell('linkedin_queue', editedRow.rowNum, 'conversation_stage', 'hot')
  sendHotLeadAlert(editedRow.data, replyText, kimiResult, 'linkedin')

Function processNewReplies():
Runs every 10 minutes via trigger. Sends approved email replies.
- Get all rows from replies where send_status = 'approved'
- If none: return (no logging — runs too frequently)
- For each approved row:
  a. If channel = 'email':
     replyToSend = row.data.your_edit || row.data.kimi_draft
     success = sendReplyViaInstantly(row.data.email, replyToSend)
     If success:
       updateRow('replies', row.rowNum, {send_status: 'sent', sent_at: formatDateISO()})
       Find email_queue row, update stage based on intent
     Else:
       updateRow('replies', row.rowNum, {send_status: 'error'})
  b. If channel = 'linkedin':
     updateRow('replies', row.rowNum, {send_status: 'manual_required'})
     (You copy and send manually)

---

Create notifications.gs:

sendHotLeadAlert(contactData, replyText, kimiResult, channel):
- Build email body:
  '🔥 HOT LEAD — ' + channel.toUpperCase() + '\n\n' +
  'Contact: ' + contactData.full_name + ' (' + contactData.job_title + ')\n' +
  'Company: ' + contactData.company_name + '\n' +
  'Channel: ' + channel + '\n' +
  (channel === 'email' ? 'Email: ' + contactData.email + '\n' : '') +
  (contactData.contact_linkedin_url ? 'LinkedIn: ' + contactData.contact_linkedin_url + '\n' : '') +
  'Freight spend estimate: ' + (contactData.freight_spend_estimate || 'not estimated') + '\n\n' +
  'Their message:\n' + replyText + '\n\n' +
  'AI recommended action: ' + kimiResult.recommended_action + '\n\n' +
  'Draft reply is in your Replies tab. Review and approve to send.\n' +
  'Next step: book a 20-minute discovery call.'
- GmailApp.sendEmail(getConfig('NOTIFICATION_EMAIL'),
    '🔥 Hot Lead: ' + contactData.company_name + ' (' + channel + ')', emailBody)
- Log 'Hot lead alert sent: ' + contactData.company_name

writeDailySummary():
- Count contact_db rows by _qualification_status
- Count linkedin_queue rows by conversation_stage
- Count email_queue rows by stage
- Count replies rows by send_status
- Count raw_leads_finder rows added today
- Build and log summary string
- GmailApp.sendEmail(NOTIFICATION_EMAIL, 'Daily Summary - ' + new Date().toDateString(), summary)

---

Update Code.gs:

Update onEdit(e) function:
1. Existing check for raw_leads_finder (Phase 1 — keep it)
2. NEW: Check if edited sheet = 'linkedin_queue'
   AND edited column header = 'their_reply'
   AND new value is not empty
   AND row data has contact_linkedin_url
   Then: call handleLinkedInReplyEdit(editedRowObj, newValue)
   Wrap in try/catch — onEdit must never throw

Update doPost(e):
- Already calls handleInstantlyWebhook(payload)
- Always return ContentService.createTextOutput('ok') even on error

---

Create scheduler.gs:

setUpTriggers():
- Delete all existing project triggers first:
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t) })
- Create:
  runQualification: every 4 hours
  processNewReplies: every 10 minutes
  writeDailySummary: daily at 9am

After writing all code:
1. Trace the complete flow when Instantly fires this webhook:
   {event:'reply_received', email:'john@midwestfood.com',
    from_name:'John Smith',
    reply_text:'This sounds interesting. What kind of errors do you typically find
    and how much does it usually cost to implement?',
    timestamp:'2025-01-20T10:30:00Z'}
   Show: every function called, every row written to replies tab,
   every status update in email_queue, whether hot alert fires or not.

2. Trace what happens when you paste "Yes, let's set up a call — what does
   your calendar look like?" into the their_reply column of a linkedin_queue row
   for Sarah Chen at FastShip 3PL.
   Show: onEdit firing, handleLinkedInReplyEdit, draft written to replies tab,
   hot alert firing (this IS a hot signal).
```

### Verification checklist

- [ ] `doPost` always returns 200 — never throws even on error
- [ ] Reply written to replies tab with `send_status = 'draft'`
- [ ] `pauseLeadInInstantly` called on every email reply
- [ ] `processNewReplies` sends only `send_status = 'approved'` rows
- [ ] LinkedIn replies get `send_status = 'manual_required'` automatically
- [ ] `onEdit` fires `handleLinkedInReplyEdit` when `their_reply` column edited in linkedin_queue
- [ ] Hot classification triggers `sendHotLeadAlert` AND updates queue status to 'hot'
- [ ] `writeDailySummary` sends email with counts from all tabs

---

## Post-Build Checklist (run once after all phases complete)

```
- [ ] Run setupAllSheets() to create all tabs with correct headers
- [ ] Fill Config tab with all 15 key-value pairs
- [ ] Run testConfig() — all 7 values log correctly
- [ ] Run testAIClients() — all 4 AI functions return valid responses
- [ ] Create Instantly campaign with 3-step email templates (D0/D4/D10)
- [ ] Set Instantly webhook URL to your deployed Apps Script web app URL
      Deploy: Extensions → Apps Script → Deploy → New Deployment → Web App
      Execute as: Me | Who has access: Anyone
- [ ] Run setUpTriggers() — confirm 3 triggers created in Triggers panel
- [ ] Paste 5 test rows into raw_leads_finder, run processLeadsFinder()
      Verify 5 rows appear in contact_db with correct column mapping
- [ ] Run runQualification() manually
      Verify rows appear in linkedin_queue or email_queue
- [ ] Check run_log tab shows entries for each run
- [ ] Verify Instantly receives leads via their dashboard
- [ ] Test webhook: send a test POST to your web app URL with a sample payload
```

---

## Weekly Operating Rhythm

**Monday / Wednesday / Friday (~45 min):**
1. Apify UI → run Leads Finder with saved preset → Download CSV → Paste into raw_leads_finder → leave _processed columns blank
2. Apify UI → run LinkedIn Jobs with saved keyword preset → Download CSV → Paste into raw_linkedin_jobs → fill _contact_needed='yes' for all new rows
3. SAM.gov bookmark → type new RFPs into raw_signal_sources
4. Feedly → paste relevant news into raw_signal_sources
5. For all raw_linkedin_jobs and raw_signal_sources rows where _contact_needed='yes':
   - Collect company LinkedIn URLs
   - Batch up to 10 at a time → run LinkedIn Company Employees actor (Short mode) in Apify UI
   - Download CSV → paste into raw_employees
   - Manually fill _source_company_linkedin_url, _source_signal_type, _source_signal_row for each batch
6. Run processLeadsFinder(), processLinkedInJobs(), processEmployees(), processSignalSources()
   from the custom menu (or wait for 4-hour qualification trigger)

**Every morning (~20 min):**
1. Open linkedin_queue → filter conversation_stage='not_sent' → sort priority_rank ascending
2. Send 20 connection requests on LinkedIn → update connection_sent_date and stage='request_sent'
3. Check accepted connections → update accepted_date and stage='connected' → copy suggested_dm → send on LinkedIn → update dm_sent_date
4. Open replies tab → filter send_status='draft' → read kimi_draft → edit if needed in your_edit → set send_status='approved' for email → copy and send LinkedIn drafts manually → set those to 'sent'
```