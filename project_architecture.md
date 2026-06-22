# Freight Audit Outreach System
## Complete Architecture Documentation

> This document describes the entire system — every component, every trigger,
> every data flow, and every decision. Read this to understand how the pieces connect.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Signal Sources — What We Monitor and Why](#4-signal-sources)
5. [Apify Actors — What They Are and When They Fire](#5-apify-actors)
6. [Google Sheet Architecture — All 12 Tabs](#6-google-sheet-architecture)
7. [Apps Script Files — Every Module Explained](#7-apps-script-files)
8. [Complete Data Flow — Start to Finish](#8-complete-data-flow)
9. [Trigger Schedule — What Fires When and Why](#9-trigger-schedule)
10. [Qualification Pipeline — How Leads Get Scored](#10-qualification-pipeline)
11. [AI Model Usage — What Goes to Kimi vs Firecrawl](#11-ai-model-usage)
12. [LinkedIn Outreach Flow](#12-linkedin-outreach-flow)
13. [Email Outreach Flow](#13-email-outreach-flow)
14. [Reply Handling — Both Channels](#14-reply-handling)
15. [Hot Lead Detection and Handoff](#15-hot-lead-detection)
16. [Deduplication System](#16-deduplication-system)
17. [Error Handling and Failure Recovery](#17-error-handling)
18. [External Dependencies and APIs](#18-external-dependencies)
19. [What Is Manual vs Automated](#19-manual-vs-automated)
20. [Monthly Cost Breakdown](#20-monthly-cost-breakdown)
21. [Column Mapping — The Critical Detail](#21-column-mapping)
22. [Config Tab — All Runtime Parameters](#22-config-tab)

---

## 1. What This System Does

### The Business Problem

US mid-market shippers (companies spending $2M–$15M/year on freight) lose 2–4% of their
freight spend to carrier billing errors. These errors come from manual audit processes that
are slow, incomplete, and expensive. We offer an AI agent that automates this audit and
charges 20–30% of recovered overcharges — zero cost if nothing is found.

The problem is finding these companies and getting a conversation started at scale.

### What This System Solves

An autonomous B2B lead generation engine that:

1. **Finds** companies that are likely to need freight audit AI using four signal sources
2. **Qualifies** each contact with AI scoring (1–10 ICP fit score)
3. **Routes** high-scoring contacts to LinkedIn, medium-scoring to email
4. **Generates** personalized outreach messages for every contact
5. **Manages** conversations — drafting replies to inbound responses with AI
6. **Alerts** the human when a lead shows buying intent

### What This System Does NOT Do

- Send LinkedIn connection requests automatically (LinkedIn ToS prevents this)
- Run the actual freight audit (that is the product being sold)
- Replace human judgment on hot leads (AI hands off, human closes)

---

## 2. Technology Stack

| Component | Tool | Why |
|-----------|------|-----|
| **Database** | Google Sheets | Zero infrastructure, visual, accessible anywhere |
| **Automation engine** | Google Apps Script | Free, runs on Google's servers, native Sheets integration |
| **Lead scraping** | Apify (3 accounts) | $5 free credit/account/month, best B2B data actors |
| **AI scoring + outreach** | Kimi K2 via OpenRouter | Strong structured JSON output, cheap per token |
| **Website enrichment** | Firecrawl | 500 free pages/month, extracts clean markdown |
| **Email sequencing** | Smartlead or Instantly | Warm-up, deliverability, reply webhook |
| **Scheduling** | Apps Script time triggers | Native, free, reliable |
| **State persistence** | Google Sheets rows + PropertiesService | No external DB needed |

### Why Google Apps Script and not Python

- All data is in Google Sheets — GAS has native, zero-config access
- No server to maintain, no hosting cost, no deployment pipeline
- Webhook receiver (`doPost`) is built in via Web App deployment
- Time triggers are native — no cron service needed
- At this stage, infrastructure complexity is a liability, not an asset

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SIGNAL SOURCES (3x per week)                     │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Apify Leads     │  │  Apify LinkedIn  │  │  SAM.gov API     │  │
│  │  Finder Actor    │  │  Jobs Actor      │  │  + RSS/Feedly    │  │
│  │  (Account 1)     │  │  (Account 2)     │  │  (manual entry)  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│           ▼                     ▼                      ▼            │
│  raw_leads_finder         raw_linkedin_jobs     raw_signal_sources  │
│  (sheet tab)              (sheet tab)           (sheet tab)         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼ Apps Script processes each tab
┌───────────────────────────────────────────────────────────────────────┐
│                       INGESTION PROCESSING                            │
│                                                                       │
│  processLeadsFinder() → maps Apify columns → dedup → contact_db      │
│  processLinkedInJobs() → extracts company signal → company_db         │
│  processEmployees() → maps employee rows → links to signal → contact_db│
│  processSignalSources() → manual entries → company_db + contact_db   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼ contact_db rows have _qualification_status = 'pending'
┌───────────────────────────────────────────────────────────────────────┐
│                     QUALIFICATION PIPELINE                            │
│                                                                       │
│  runQualification() — every 4 hours                                  │
│                                                                       │
│  For each pending contact (batch of 50):                             │
│    1. getCompanyForContact() — fetch company context from company_db  │
│    2. scoreLeadICP() — Kimi K2 scores 1-10, assigns channel          │
│    3. runFirecrawlIfNeeded() — enrich score ≥ 8 with website context │
│    4. generateHook() — Kimi writes personalized opening line         │
│    5. generateSuggestedDm() — Kimi writes LinkedIn DM (if linkedin)  │
│    6. Route:                                                          │
│       score 8-10 → linkedin_queue                                    │
│       score 4-7  → email_queue + push to Smartlead/Instantly        │
│       score ≤ 3  → skipped                                           │
└─────────────────────┬─────────────────────┬──────────────────────────┘
                      │                     │
          ┌───────────▼───────┐   ┌─────────▼──────────┐
          │   LINKEDIN TRACK  │   │    EMAIL TRACK     │
          │                   │   │                    │
          │  linkedin_queue   │   │  email_queue       │
          │  (your daily tab) │   │  Smartlead sends   │
          │                   │   │  D0, D4, D10 auto  │
          │  YOU:             │   │                    │
          │  click URL        │   │                    │
          │  copy suggested_dm│   │                    │
          │  send on LinkedIn │   │                    │
          └───────────┬───────┘   └─────────┬──────────┘
                      │                     │
                      └──────────┬──────────┘
                                 │ reply received
                    ┌────────────▼───────────────────┐
                    │         REPLY HANDLER          │
                    │                                │
                    │  Email: webhook from Smartlead │
                    │  LinkedIn: you paste reply     │
                    │                                │
                    │  → Kimi classifies intent      │
                    │  → Kimi drafts response        │
                    │  → Written to replies tab      │
                    │  → You review + approve        │
                    │                                │
                    │  If HOT: email alert to you    │
                    │  You take over manually        │
                    └────────────────────────────────┘
```

---

## 4. Signal Sources

We monitor four sources. Each represents a different type of buying signal.

### Source 1: Apify Leads Finder Actor
**Signal type:** `icp_match`
**Intent level:** Medium — company matches profile but no specific trigger
**Why we use it:** Builds volume. Finds 100 qualified contacts per run based on
industry, title, revenue, and location filters. Gives us verified emails and
LinkedIn URLs in one shot.

**What it gives us:** first_name, last_name, job_title, email, linkedin (URL),
company_name, company_domain, industry, company_size, company_annual_revenue_clean,
company_description, company_linkedin, and ~25 other fields.

**How it's triggered:** Automatically via `triggerApifyRuns()` on Mon/Wed/Fri 6am.
Uses APIFY_TOKEN_LEADS (Account 1).

---

### Source 2: Apify LinkedIn Jobs Actor
**Signal type:** `linkedin_job`
**Intent level:** High — company is actively hiring for the exact role our AI replaces
**Why we use it:** A company posting "Freight Audit Manager" or "Transportation Billing
Analyst" is advertising their manual process. This is the strongest possible signal
that they need what we sell.

**What it gives us:** position (job title), company (company name), companyLinkedInUrl,
description, postedAt, jobUrl.

**Important:** This actor gives company data, NOT individual contacts. After finding
a company via a job post, you must run the LinkedIn Company Employees actor separately
to find the right person at that company.

**How it's triggered:** Automatically via `triggerApifyRuns()` on Mon/Wed/Fri 6am.
Uses APIFY_TOKEN_JOBS (Account 2).

---

### Source 3: Apify LinkedIn Company Employees Actor
**Signal type:** Inherits from the source that triggered it (`linkedin_job`, `sam_gov`, or `rss_news`)
**Intent level:** Same as the triggering signal — used to find the right PERSON at a company
**Why we use it:** Once we know a company is a target (from source 2 or 4), we need
a decision maker's name and LinkedIn URL. This actor scrapes all employees at a given
company and lets us filter by title.

**What it gives us (Short mode):** linkedinUrl (camelCase), firstName, lastName,
headline, location (JSON object), currentPosition (JSON array), id, publicIdentifier.

**Critical column name difference:** This actor outputs `linkedinUrl` (camelCase).
Leads Finder outputs `linkedin` (lowercase). Both map to `contact_linkedin_url`
in contact_db — the mapping happens in column_maps.gs.

**How it's triggered:** MANUALLY. You run it in the Apify UI for each company batch,
download the CSV, paste into raw_employees tab, and fill in the three _source_* columns.
Uses APIFY_TOKEN_EMPLOYEES (Account 3).

**Why still manual:** The input (company LinkedIn URLs) comes from raw_linkedin_jobs
and raw_signal_sources — sources that accumulate at different rates. Automating this
would require a more complex pipeline. Manual ensures quality control.

---

### Source 4: SAM.gov + RSS/Feedly (Manual Entry)
**Signal type:** `sam_gov` or `rss_news`
**Intent level:** Very high for SAM.gov (active RFP), Medium for news
**Why we use it:**
- SAM.gov: A company posting a freight audit RFP is literally shopping for what we sell
- RSS/News: Funding rounds, acquisitions, new executive hires = change + budget

**What it gives us:** Whatever you manually enter — company name, LinkedIn URL, signal title,
signal detail, contact name and email if listed in the RFP.

**How it's triggered:** You manually enter rows into raw_signal_sources 3x per week.
No automation — takes 10 minutes.

---

## 5. Apify Actors

### Three Accounts Strategy

To maximize free compute credits:

| Account | Token Config Key | Actor Used |
|---------|-----------------|------------|
| Apify Account 1 | APIFY_TOKEN_LEADS | Leads Finder |
| Apify Account 2 | APIFY_TOKEN_JOBS | LinkedIn Jobs Scraper |
| Apify Account 3 | APIFY_TOKEN_EMPLOYEES | LinkedIn Company Employees |

Each account gets $5 free compute monthly. Three accounts = $15 effective free compute.
The Leads Finder costs ~$0.50–1.00 per 100-result run. LinkedIn Jobs costs ~$0.30–0.50.
At 3 runs/week × 4 weeks = 12 runs/month total across both actors ≈ $8–18 compute,
comfortably within free tier when spread across accounts.

### Actor Trigger Sequence

```
6:00 AM Monday/Wednesday/Friday
        │
        ▼
triggerApifyRuns() fires
        │
        ├── START: Leads Finder (APIFY_TOKEN_LEADS + APIFY_LEADS_ACTOR_ID)
        │   Input: title filters + location + industry + revenue range
        │   Returns immediately with runId + datasetId
        │   Saves to PropertiesService
        │
        ├── START: LinkedIn Jobs (APIFY_TOKEN_JOBS + APIFY_JOBS_ACTOR_ID)
        │   Input: keyword list + location
        │   Returns immediately with runId + datasetId
        │   Saves to PropertiesService
        │
        └── CREATE delayed trigger → checkApifyAndProcess() in 4 minutes
                │
                ▼ (4 minutes later)
        checkApifyAndProcess() fires
                │
                ├── Check: Leads Finder status via GET /actor-runs/{runId}
                ├── Check: LinkedIn Jobs status via GET /actor-runs/{runId}
                │
                ├── If ANY still RUNNING:
                │   Create another 4-minute delayed trigger
                │   Return (try again later)
                │
                ├── If any FAILED:
                │   Send email alert
                │   Clear PropertiesService
                │   Return
                │
                └── If ALL SUCCEEDED:
                    Fetch Leads Finder dataset via GET /datasets/{id}/items
                    Write items directly to raw_leads_finder tab
                    Fetch LinkedIn Jobs dataset
                    Write items to raw_linkedin_jobs tab
                    Call processLeadsFinder()
                    Call processLinkedInJobs()
                    Send completion email
                    Clear PropertiesService
```

### Why PropertiesService (Not Sheet Storage)

PropertiesService stores key-value data that persists between separate script executions.
When `triggerApifyRuns()` finishes, the script execution ends. Four minutes later,
when `checkApifyAndProcess()` fires, it's a completely new execution — variables
from the previous run no longer exist. PropertiesService is the bridge.

Google Sheets could also store this state, but PropertiesService is faster to read/write
and doesn't leave residue in your data tabs.

---

## 6. Google Sheet Architecture

The sheet is named **"Freight Audit Outreach"** and has 12 tabs.

### RAW INPUT TABS (you paste or script writes raw Apify output here)

---

#### Tab 1: `raw_leads_finder`
**Purpose:** Paste target for Apify Leads Finder CSV exports.
**Who writes:** Apify API automation (checkApifyAndProcess) OR manual paste
**Column naming:** Uses Apify's exact output names — DO NOT rename columns

Critical columns:
- `linkedin` — contact's LinkedIn URL (note: lowercase, no suffix)
- `email` — verified work email
- `company_domain` — used as company dedup key
- `_processed` — system fills: `yes`, `duplicate`, or empty (new)
- `_processed_at` — timestamp when processed

Total columns: 39 (37 from Apify + 2 system columns)

---

#### Tab 2: `raw_linkedin_jobs`
**Purpose:** Paste target for Apify LinkedIn Jobs Scraper CSV exports.
**Who writes:** Apify API automation OR manual paste
**What it contains:** Company signals (job postings), NOT individual contacts

Critical columns:
- `companyLinkedInUrl` — used as input to Employees actor (note: camelCase)
- `position` — the job title posted (this IS the signal)
- `description` — job description (used to extract signal context)
- `_contact_needed` — set to 'yes' by processLinkedInJobs() (trigger for manual Employees run)
- `_employees_run_id` — you fill this after running Employees actor

---

#### Tab 3: `raw_employees`
**Purpose:** Paste target for Apify LinkedIn Company Employees actor CSV exports.
**Who writes:** You — manually paste after running Employees actor
**Column naming:** Uses Employees actor's camelCase output names exactly

Critical columns:
- `linkedinUrl` — contact's LinkedIn URL (note: camelCase, different from Leads Finder)
- `firstName`, `lastName` — combined into `full_name` during processing
- `location` — raw JSON string: `{"linkedinText":"...","parsed":{"country":"...","city":"..."}}`
- `currentPosition` — raw JSON array: `[{"companyName":"..."}]`
- `_source_company_linkedin_url` — YOU FILL: the company URL you ran the actor against
- `_source_signal_type` — YOU FILL: `linkedin_job` | `sam_gov` | `rss_news`
- `_source_signal_row` — YOU FILL: row number in raw_linkedin_jobs or raw_signal_sources

The three `_source_*` columns are the link connecting an employee contact back to
the company signal that found them. Without these, the system cannot generate
context-aware outreach.

---

#### Tab 4: `raw_signal_sources`
**Purpose:** Manual entry for SAM.gov RFPs and RSS/news items.
**Who writes:** You — manually every Monday/Wednesday/Friday

Key columns:
- `source` — `sam_gov` | `rss_news`
- `company_linkedin_url` — you look this up manually on LinkedIn
- `signal_title` — the RFP title or news headline
- `signal_detail` — description (first 300 chars of RFP or article summary)
- `contact_email` — if SAM.gov lists a point of contact, add it here
- `_contact_needed` — set to 'yes' when no email and Employees actor needed

---

### PROCESSING TABS (machine writes here — never paste directly)

---

#### Tab 5: `contact_db`
**Purpose:** The master contact database. One row per unique contact across all sources.
**Who writes:** ingestion.gs processing functions
**Who reads:** qualification.gs, reply_handler.gs, qualification_results

This is the most important table. Every contact from every source ends up here,
normalized and deduplicated. The `_qualification_status` column drives the
qualification pipeline.

Key columns:
- `contact_id` — UUID generated by script, primary key
- `contact_linkedin_url` — normalized from both `linkedin` (Leads Finder) and `linkedinUrl` (Employees)
- `dedup_key` — `contact_linkedin_url` → `email` → `full_name|company_domain` (priority)
- `signal_type` — `icp_match` | `linkedin_job` | `sam_gov` | `rss_news`
- `signal_detail` — the specific signal text passed to Kimi for context
- `_qualification_status` — `pending` | `scored` | `skipped` | `error`

---

#### Tab 6: `company_db`
**Purpose:** One row per unique company. Aggregates signals and Firecrawl context.
**Who writes:** ingestion.gs (upsertCompanyDb), qualification.gs (Firecrawl update)
**Why it exists:** Multiple contacts from the same company should share the company
context (Firecrawl scrape, all signals found). Run Firecrawl once per company,
not once per contact.

Key columns:
- `company_domain` — primary dedup key (uses `li_` prefix for LinkedIn-only companies)
- `signals_found` — JSON array of all signals ever found for this company
- `highest_signal_type` — priority: `linkedin_job` > `sam_gov` > `rss_news` > `icp_match`
- `firecrawl_context` — extracted freight-relevant website text
- `firecrawl_status` — `pending` | `done` | `failed` | `skipped`

---

#### Tab 7: `qualification_results`
**Purpose:** One row per scored contact. Source of truth for channel routing.
**Who writes:** runQualification()
**Links to:** contact_db via `contact_id`

Key columns:
- `icp_score` — 1–10 from Kimi K2
- `score_reasons` — Kimi's explanation (2–3 sentences)
- `freight_spend_estimate` — Kimi's estimate of company annual freight spend
- `personalization_hook` — AI-generated opening line (≤20 words)
- `channel` — `linkedin` | `email` | `skip`
- `routing_status` — `pending` | `routed_linkedin` | `routed_email` | `skipped`

---

### ACTION TABS (you work from these daily)

---

#### Tab 8: `linkedin_queue`
**Purpose:** Your primary daily workspace. Every LinkedIn outreach target lives here.
**Who writes:** runQualification() (new rows) | You (status updates)

**Your daily routine with this tab:**
1. Filter `conversation_stage = not_sent`, sort `priority_rank` ascending
2. For each row: click `contact_linkedin_url` → opens LinkedIn profile
3. Copy `suggested_dm` text → send as connection request message on LinkedIn
4. Update `connection_sent_date` → change `conversation_stage` to `request_sent`
5. When connection accepted → update `connection_accepted_date` → stage = `connected`
6. Send DM (suggested_dm again or personalization_hook) → update `dm_sent_date`
7. When they reply → paste reply into `their_reply` column
   → onEdit trigger fires → AI draft appears in replies tab within 5 seconds

Key columns:
- `priority_rank` — 1 = highest priority (lower number = contact first)
- `contact_linkedin_url` — click this directly (it's a hyperlink)
- `suggested_dm` — pre-written message to copy-paste as connection request
- `personalization_hook` — shorter alternative opening line
- `firecrawl_context` — website context for crafting your own messages
- `their_reply` — YOU PASTE HERE to trigger AI reply drafting
- `conversation_stage` — `not_sent` → `request_sent` → `connected` → `dm_sent` →
  `replied_warm` | `replied_cold` → `interested` → `hot` | `not_interested` | `expired`

---

#### Tab 9: `email_queue`
**Purpose:** Visibility into email outreach pipeline. Machine manages this.
**Who writes:** runQualification() | Smartlead webhook updates

Key columns:
- `instantly_lead_id` — or `smartlead_lead_id` — reference to the email platform
- `personalization_hook` — the opening line used in the email
- `stage` — `queued` | `active` | `opened` | `clicked` | `replied` | `hot` | `bounced`
- `reply_received` — `yes` | `no`
- `reply_preview` — first 100 chars of their reply

---

#### Tab 10: `replies`
**Purpose:** AI-drafted responses waiting for your review and approval.
**Who writes:** handleInstantlyWebhook() | handleLinkedInReplyEdit()
**Who reads:** You (daily review) | processNewReplies() (send loop)

**Your daily routine:**
1. Filter `send_status = draft`
2. Read `their_message` — what they said
3. Read `kimi_draft` — what Kimi wants to send back
4. If happy with draft: set `send_status = approved` (machine sends within 10 min)
5. If you want to edit: write your version in `your_edit` column → then approve
6. For LinkedIn channel: copy the draft → send on LinkedIn manually → set `send_status = sent`

Key columns:
- `channel` — `email` | `linkedin`
- `their_message` — exactly what they said
- `conversation_history` — all prior messages in this thread
- `kimi_draft` — Kimi's suggested reply
- `your_edit` — your edited version (if blank, kimi_draft is sent for email)
- `intent_classification` — `hot` | `warm` | `neutral` | `cold`
- `recommended_action` — `book_call` | `send_audit_offer` | `follow_up_7_days` | `close_thread`
- `send_status` — `draft` → `approved` → `sent` | `manual_required` | `error`

---

### SYSTEM TABS

---

#### Tab 11: `config`
**Purpose:** All runtime parameters. Column A = key, Column B = value.
**Who reads:** getConfig() — called by every module at runtime
**Why it matters:** Nothing is hardcoded. Change a value here, system behavior changes
immediately on next run. No code deployment needed.

---

#### Tab 12: `run_log`
**Purpose:** Audit trail of every automation run.
**Who writes:** Every processing function writes a summary row after completion

Key columns:
- `run_type` — `process_leads_finder` | `process_linkedin_jobs` | `qualification` | `send_loop` | etc.
- `records_processed` — how many items were handled
- `records_skipped` — duplicates or filtered out
- `routed_linkedin` — how many went to linkedin_queue
- `routed_email` — how many went to email_queue
- `duration_seconds` — how long the run took

---

## 7. Apps Script Files

The Apps Script project has 14 files. Here is what each one does:

### `Code.gs` — Entry Point
**Contains:** onOpen(), doPost(), onEdit(), setupAllSheets(), testConfig(), testAIClients()

- `onOpen()` — creates the "Outreach System" menu when sheet opens
- `doPost(e)` — receives ALL incoming webhooks (Smartlead/Instantly replies).
  Always returns 200. Calls handleInstantlyWebhook(payload).
- `onEdit(e)` — detects when user pastes reply in linkedin_queue.their_reply column.
  Calls handleLinkedInReplyEdit() which triggers AI draft generation.
- `setupAllSheets()` — creates all 12 tabs with correct headers if they don't exist

---

### `config.gs` — Configuration Cache
**Contains:** getConfig(), getConfigNumber(), _loadConfig(), refreshConfig()

Reads the config tab once per script execution and caches it in `_configCache`.
All other modules call `getConfig('KEY_NAME')` — never read the config tab directly.
This matters because reading a sheet cell on every API call would be slow.

---

### `sheets_helper.gs` — Sheet I/O Layer
**Contains:** getSheet(), getHeaders(), colIndex(), appendRow(), updateRow(),
getCell(), setCell(), getAllRows(), getRowsByValue(), findFirstRowByValue()

**Critical design:** Every column is addressed by HEADER NAME, never by index number.
If someone reorders columns in the sheet, index-based code breaks silently.
Header-name-based code continues working.

`appendRow(tabName, dataObj)` takes an object with column names as keys and fills
the correct columns automatically, ignoring any keys that don't match a column header.

---

### `column_maps.gs` — Apify Column Normalization
**Contains:** LEADS_FINDER_MAP, EMPLOYEES_MAP, mapLeadsFinderRow(), mapEmployeesRow()

This is the most critical file for data integrity. It defines exactly how Apify's
output field names map to contact_db column names.

The key mappings:
```
Leads Finder: 'linkedin'    → contact_db: 'contact_linkedin_url'
Employees:    'linkedinUrl' → contact_db: 'contact_linkedin_url'
```

Both Apify actors return the same data (a LinkedIn profile URL) under different field names.
mapLeadsFinderRow() and mapEmployeesRow() normalize these into the same contact_db field.

---

### `utils.gs` — Utility Functions
**Contains:** generateUUID(), safeJsonParse(), truncateText(), formatDateISO(),
buildConversationHistory()

`safeJsonParse(text, defaultVal)` is particularly important — it first tries
JSON.parse(), then tries to extract JSON from surrounding text using regex,
then returns the default value if both fail. Kimi occasionally returns JSON
wrapped in markdown backticks or with a preamble sentence — this handles that.

`buildConversationHistory(contactLinkedinOrEmail, channel)` reads all rows from
the replies tab where send_status = 'sent' for a specific contact, orders them
chronologically, and formats them as "You: [msg]\nThem: [msg]\n" for Kimi's context.

---

### `dedup.gs` — Deduplication Cache
**Contains:** _buildDedupCache(), isDuplicate(), registerContact(), refreshDedupCache(), getDedupStats()

Builds an in-memory Set of all existing contacts at the start of each script execution.
Three Sets: `linkedin_urls`, `emails`, `name_company_keys`.

Priority when checking:
1. If contact has LinkedIn URL → check linkedin_urls Set
2. Else if has email → check emails Set
3. Else → check name_company_keys Set (full_name|company_domain)

After writing a new contact to contact_db, `registerContact()` adds them to the
in-memory Sets immediately — so if the same contact appears again in the same batch,
the second occurrence is caught as a duplicate.

---

### `ingestion.gs` — Data Processing
**Contains:** upsertCompanyDb(), writeContactDb(), processLeadsFinder(),
processLinkedInJobs(), processEmployees(), processSignalSources(),
triggerApifyRuns(), checkApifyAndProcess(), fetchApifyDataset(),
runApifyActor(), checkApifyRunStatus(), clearApifyProperties(), testApifyConnection()

The four `process*()` functions each:
1. Read all rows from their respective raw tab
2. Filter for rows where `_processed` is empty or 'new'
3. Map Apify column names to contact_db column names
4. Check isDuplicate() — skip if found
5. Write to contact_db (and company_db via upsertCompanyDb)
6. Mark the raw row as `_processed = 'yes'`
7. Write a summary to run_log

`upsertCompanyDb()` checks if the company_domain already exists in company_db.
If yes: adds the new signal to the signals_found JSON array, updates highest_signal_type.
If no: creates a new company row with firecrawl_status = 'pending'.

---

### `kimi_client.gs` — AI Functions
**Contains:** _callKimi(), scoreLeadICP(), generateHook(), generateSuggestedDm(), draftReply()

`_callKimi(systemPrompt, userPrompt, maxTokens)` is the base function that calls
OpenRouter → Kimi K2 API. Uses UrlFetchApp with muteHttpExceptions: true.
Throws `new Error('RATE_LIMITED')` on HTTP 429 — never catches and swallows it,
so callers can implement retry logic.

All four public functions are defensive: if _callKimi fails for any reason other
than RATE_LIMITED, they return a safe default value and log the error. Qualification
never crashes due to an AI failure.

---

### `firecrawl_client.gs` — Website Enrichment
**Contains:** scrapeAndExtractFreightContext(), _extractContext()

`scrapeAndExtractFreightContext(domain, companyName)`:
1. Returns immediately with `{context:'', status:'skipped'}` if domain starts with `li_`
   (these are LinkedIn-slug placeholder domains, not real websites)
2. Calls Firecrawl /scrape endpoint to get page markdown (max 3000 chars)
3. Calls _extractContext() which uses Kimi to pull out freight/logistics context
4. Returns `{context: extractedText, status: 'done'}` or `{context:'', status:'failed'}`
5. On ANY error: catches and returns `{context:'', status:'failed'}` — never throws

---

### `qualification.gs` — Scoring Pipeline
**Contains:** getCompanyForContact(), runFirecrawlIfNeeded(), writeLinkedInQueueRow(),
writeEmailQueueRow(), getCurrentLinkedInQueueCount(), runQualification()

`runQualification()` is the heart of the system. Processes up to BATCH_SIZE contacts
per run. The 6-minute Apps Script execution limit is the constraint — at ~4 seconds
per contact (Kimi calls + sleep), BATCH_SIZE=50 takes ~200 seconds, well within limit.

The Utilities.sleep() calls between Kimi requests (1500ms) are rate limiting buffers.
Kimi via OpenRouter has request rate limits — spacing calls prevents 429 errors.

---

### `instantly_client.gs` (or `smartlead_client.gs`) — Email Platform
**Contains:** addLeadToInstantly(), pauseLeadInInstantly(), sendReplyViaInstantly()

`pauseLeadInInstantly(email)` is called on EVERY inbound reply from Instantly.
If you don't pause, the email sequence keeps sending automated follow-ups while
you're in a live conversation. This is a hard rule — never skip it.

---

### `reply_handler.gs` — Inbound Reply Processing
**Contains:** handleInstantlyWebhook(), handleLinkedInReplyEdit(), processNewReplies()

Two entry points:
- Email: `handleInstantlyWebhook(payload)` called from doPost() when Smartlead fires webhook
- LinkedIn: `handleLinkedInReplyEdit(editedRow, replyText)` called from onEdit()

Both paths do the same core thing:
1. Load conversation history
2. Call draftReply() → Kimi classifies intent + writes draft
3. Write to replies tab with send_status = 'draft'
4. If intent = 'hot' → call sendHotLeadAlert()

`processNewReplies()` runs every 10 minutes. Finds rows where send_status = 'approved'.
For email: sends via Smartlead API, marks 'sent'.
For LinkedIn: marks 'manual_required' (you copy and send manually — no API).

---

### `notifications.gs` — Alerts
**Contains:** sendHotLeadAlert(), writeDailySummary()

`sendHotLeadAlert()` uses GmailApp.sendEmail() to your NOTIFICATION_EMAIL.
Includes contact name, company, channel, what they said, freight spend estimate,
and recommended action.

`writeDailySummary()` counts rows by status across all key tabs and sends a
morning email snapshot of pipeline health.

---

### `scheduler.gs` — Trigger Management
**Contains:** setUpTriggers()

Run ONCE after deployment. Deletes all existing triggers first (prevents duplicates),
then creates 6 time-based triggers (see Section 9).

---

## 8. Complete Data Flow — Start to Finish

Tracing a single lead from discovery to discovery call:

```
DAY 0, 6:00 AM MONDAY
triggerApifyRuns() fires
→ Starts Leads Finder run on Apify Account 1
→ Starts LinkedIn Jobs run on Apify Account 2
→ Creates 4-minute delayed trigger

DAY 0, 6:04 AM
checkApifyAndProcess() fires (first check)
→ Leads Finder: RUNNING
→ LinkedIn Jobs: RUNNING
→ Creates another 4-minute delayed trigger

DAY 0, 6:08 AM
checkApifyAndProcess() fires (second check)
→ Leads Finder: SUCCEEDED
→ LinkedIn Jobs: SUCCEEDED
→ Fetches 100 leads from Leads Finder dataset
→ Writes 98 new rows to raw_leads_finder (2 were already in dedup cache)
→ Fetches 12 job postings from LinkedIn Jobs dataset
→ Writes 12 rows to raw_linkedin_jobs
→ Calls processLeadsFinder()
   → Reads 98 new rows from raw_leads_finder
   → For each: mapLeadsFinderRow() normalizes columns
   → isDuplicate() check — 0 duplicates (new batch)
   → upsertCompanyDb() — creates/updates company_db rows
   → writeContactDb() — creates contact_db rows with _qualification_status = 'pending'
   → Marks raw row _processed = 'yes'
   → 98 contacts now pending in contact_db
→ Calls processLinkedInJobs()
   → Reads 12 job posting rows
   → upsertCompanyDb() for each company — marks as linkedin_job signal
   → Sets _contact_needed = 'yes' on each row
   → 12 companies now in company_db needing employee lookup
→ Sends completion email to you

DAY 0, 6:10 AM (manual, you do this)
You open raw_linkedin_jobs
You copy the 12 companyLinkedInUrl values
You run LinkedIn Company Employees actor in Apify UI for batches of 10
You download CSV → paste into raw_employees
You fill in _source_company_linkedin_url, _source_signal_type, _source_signal_row

You click menu → Manual: Process Employees Tab
→ processEmployees() reads raw_employees
→ For each row: looks up source signal row to get job title and company context
→ mapEmployeesRow() maps camelCase fields + location JSON + currentPosition JSON
→ isDuplicate() check — skips anyone already in contact_db
→ writeContactDb() — new contacts added with linkedin_job signal context
→ Example: Sarah Chen, VP Operations at FastShip 3PL
   signal_type = 'linkedin_job'
   signal_detail = 'Company posted job: Freight Audit Manager. We are seeking...'

DAY 0, ~10:00 AM (4-hour trigger fires)
runQualification() fires
→ Reads all contact_db rows where _qualification_status = 'pending'
→ Takes first 50 (BATCH_SIZE)

Processing Sarah Chen (VP Operations, FastShip 3PL, linkedin_job signal):

1. getCompanyForContact() — finds FastShip 3PL in company_db via company_linkedin_url
   companyRow has: description from job posting, signals_found array, firecrawl_status = 'pending'

2. scoreLeadICP(contactObj, companyObj, '') — calls Kimi K2 via OpenRouter
   Prompt includes: title "VP Operations", company in logistics, signal = linkedin_job,
   signal_detail = job description mentioning "carrier invoice auditing"
   Kimi returns: {score: 9, score_reasons: "3PL with direct signal...", channel: "linkedin"}

3. Utilities.sleep(1500) — rate limit buffer

4. scoreResult.channel = 'linkedin' (score 9 ≥ threshold 8)
   → runFirecrawlIfNeeded(9, companyRow)
   → company_domain exists and is not li_ prefix (was enriched from SAM.gov earlier)
   → Calls Firecrawl on fastship3pl.com
   → Firecrawl scrapes homepage → markdown content
   → _extractContext() calls Kimi: extracts "FastShip operates 8 distribution centers
     with 15+ carrier relationships, processing 50,000 shipments monthly"
   → Updates company_db: firecrawl_context = extracted text, firecrawl_status = 'done'
   → Returns {context: "FastShip operates 8 distribution...", status: 'done'}
   → Utilities.sleep(2000)

5. generateHook(contactObj, companyObj, firecrawlContext) — calls Kimi
   Context: VP Operations at a 3PL, linkedin_job signal, FastShip operates 8 DCs with 15+ carriers
   Kimi returns: "Noticed FastShip is hiring a freight audit specialist — the role caught my attention."
   → Utilities.sleep(1500)

6. generateSuggestedDm(contactObj, companyObj, hook) — calls Kimi (linkedin channel only)
   Returns: "Hi Sarah — noticed FastShip is hiring a freight audit specialist.
   We've built an AI agent that automates exactly that — curious, does your team currently
   handle carrier invoice reconciliation in-house or is it split across your carrier team?
   Happy to show you how it works if useful."
   → Utilities.sleep(1500)

7. Write to qualification_results:
   icp_score = 9, channel = 'linkedin', personalization_hook = "Noticed FastShip...",
   routing_status = 'pending'

8. Route: channel = 'linkedin'
   writeLinkedInQueueRow() appends to linkedin_queue:
   full_name = 'Sarah Chen'
   first_name = 'Sarah'
   contact_linkedin_url = 'https://linkedin.com/in/sarahchen'
   company_name = 'FastShip 3PL'
   icp_score = 9
   signal_type = 'linkedin_job'
   personalization_hook = "Noticed FastShip is hiring a freight audit specialist..."
   firecrawl_context = "FastShip operates 8 distribution centers..."
   suggested_dm = "Hi Sarah — noticed FastShip is hiring..."
   conversation_stage = 'not_sent'
   priority_rank = (current queue size + 1)

9. Update contact_db: _qualification_status = 'scored'
   Update qualification_results: routing_status = 'routed_linkedin'

DAY 1 MORNING (you, ~15 minutes)
You open linkedin_queue
Filter conversation_stage = 'not_sent', sort priority_rank ascending
Sarah Chen is near the top (icp_score = 9)
You click her contact_linkedin_url → LinkedIn opens
You copy her suggested_dm text
You send connection request on LinkedIn with that message
You come back to sheet → update connection_sent_date = today, conversation_stage = 'request_sent'

DAY 3
Sarah accepts your connection request
You update connection_accepted_date, conversation_stage = 'connected'
You send the DM (same suggested_dm text or personalization_hook)
You update dm_sent_date, conversation_stage = 'dm_sent'

DAY 5
Sarah replies: "Interesting — we currently have a team of 3 people doing this manually.
What kind of errors do you typically find?"
You open linkedin_queue, find Sarah's row
You paste her reply into the their_reply column

onEdit() fires within seconds
→ Detects: sheet = 'linkedin_queue', column = 'their_reply', value not empty, has linkedin URL
→ Calls handleLinkedInReplyEdit(editedRow, "Interesting — we currently...")
→ Loads conversation history from replies tab (empty — first reply)
→ Builds replyContext with personalization_hook, freight_spend_estimate, etc.
→ Calls draftReply() → Kimi receives full context:
  contact: Sarah Chen, VP Operations, FastShip 3PL
  their message: "we have 3 people doing this manually, what errors do you find?"
  intent: warm (asking a question, not buying signal yet)
→ Kimi returns:
  draft_reply: "Most of what we find falls into three buckets: duplicate charges
  where a carrier bills the same lane twice, fuel surcharge calculation errors
  (the FSC is often applied to the wrong base rate), and incorrect accessorials
  for things like residential delivery or liftgate that don't apply. With 15+
  carriers at FastShip's volume, those errors add up fast. Would a quick call
  work to show you what we found for a similar-sized 3PL last quarter?"
  intent_classification: 'warm'
  recommended_action: 'book_call'
→ Writes to replies tab: channel='linkedin', send_status='draft'
→ Updates linkedin_queue: conversation_stage = 'replied_warm'

You open replies tab within a minute
You read Sarah's message and Kimi's draft
You're happy with it — you copy it and send on LinkedIn
You set send_status = 'sent' in the replies row
You update linkedin_queue: conversation_stage = 'interested'

DAY 7
Sarah replies: "Yes let's set up a call — can you do Thursday at 2pm?"

You paste this into their_reply in linkedin_queue
onEdit fires again
→ Calls handleLinkedInReplyEdit
→ Kimi processes: "yes let's set up a call" = HOT signal
→ Kimi returns: intent_classification = 'hot', recommended_action = 'book_call'
→ Writes to replies tab with intent = 'hot'
→ Calls sendHotLeadAlert():
  → GmailApp.sendEmail('🔥 Hot Lead: FastShip 3PL (linkedin)')
  → Email arrives: Sarah Chen, VP Operations, wants to book Thursday 2pm call
→ Updates linkedin_queue: conversation_stage = 'hot'

YOU TAKE OVER MANUALLY
You confirm the call, run the discovery conversation, pitch the free audit,
close the pilot.
```

---

## 9. Trigger Schedule

Six active triggers run continuously after `setUpTriggers()` is called once.

| Trigger | Function | Schedule | Why This Frequency |
|---------|----------|----------|--------------------|
| Apify Ingestion | `triggerApifyRuns()` | Mon, Wed, Fri at 6am UTC | 3x/week matches Apify free compute budget; daily would exhaust credits faster |
| Qualification | `runQualification()` | Every 4 hours | Processes new contacts added since last run; BATCH_SIZE=50 per run handles volume safely within 6-min limit |
| Reply Send Loop | `processNewReplies()` | Every 10 minutes | You approve replies in the morning; machine sends within 10 minutes — fast enough for a B2B context |
| Daily Summary | `writeDailySummary()` | Daily at 9am | Morning briefing before you start your LinkedIn routine |
| checkApifyAndProcess | `checkApifyAndProcess()` | 4 min after Apify starts (dynamic) | Created and deleted dynamically by triggerApifyRuns(); not a permanent trigger |

### Why the Apify Polling Uses Dynamic Triggers (Not a Loop)

Apps Script cannot sleep for 4+ minutes within a single execution. A `while(true)` polling
loop would time out after 6 minutes and die. The solution is:

- `triggerApifyRuns()` does work and ends (execution 1)
- 4 minutes later, Apps Script automatically starts `checkApifyAndProcess()` (execution 2)
- If still running: creates another trigger and ends (execution 3 scheduled)
- Repeat until done

Each execution is independent. State (run IDs, attempt count) is passed via PropertiesService.

---

## 10. Qualification Pipeline

```
runQualification() — entry point

READ: contact_db rows where _qualification_status = 'pending'
TAKE: first BATCH_SIZE rows (default 50 from config)

FOR EACH contact:

  ┌─────────────────────────────────────────┐
  │  STAGE 1: Get company context           │
  │  getCompanyForContact(contactRow)       │
  │  → checks company_db by company_domain │
  │  → falls back to company_linkedin_url  │
  │  → falls back to minimal object from   │
  │    contact row fields                   │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 2: First ICP score (no Firecrawl)│
  │  scoreLeadICP(contactObj, companyObj,'')│
  │  → Kimi K2 via OpenRouter               │
  │  → Returns {score, reasons, spend, channel}│
  │  Utilities.sleep(1500)                  │
  │                                         │
  │  If channel = 'skip': mark skipped      │
  │  continue to next contact               │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 3: Firecrawl enrichment          │
  │  runFirecrawlIfNeeded(score, companyRow)│
  │                                         │
  │  IF score < FIRECRAWL_SCORE_THRESHOLD:  │
  │    return {context:'', status:'skipped'}│
  │                                         │
  │  IF company_domain starts with 'li_':  │
  │    return {context:'', status:'skipped'}│
  │    (li_ = LinkedIn slug, not real URL)  │
  │                                         │
  │  IF firecrawl_status = 'done' already: │
  │    return cached context (no API call)  │
  │                                         │
  │  ELSE: call Firecrawl + Kimi extract   │
  │    Update company_db                    │
  │    Utilities.sleep(2000)                │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 4: Re-score if enriched          │
  │  If Firecrawl returned useful context   │
  │  AND original score < threshold:        │
  │    scoreLeadICP again with context      │
  │    Utilities.sleep(1500)                │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 5: Generate hook                 │
  │  generateHook(contact, company, context)│
  │  → ≤20 word personalized opening line  │
  │  → References specific signal           │
  │  Utilities.sleep(1500)                  │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 6: Generate suggested DM         │
  │  ONLY if channel = 'linkedin'           │
  │  generateSuggestedDm(contact, company,  │
  │    hook)                                │
  │  → 3 sentence LinkedIn DM              │
  │  → Signal-type aware                   │
  │  Utilities.sleep(1500)                  │
  └─────────────────┬───────────────────────┘
                    │
  ┌─────────────────▼───────────────────────┐
  │  STAGE 7: Write and route               │
  │                                         │
  │  Write to qualification_results         │
  │                                         │
  │  channel = 'linkedin':                  │
  │    writeLinkedInQueueRow()              │
  │    routing_status = 'routed_linkedin'   │
  │                                         │
  │  channel = 'email':                     │
  │    If no email but has LinkedIn URL:    │
  │      route to linkedin_queue instead   │
  │    Else:                                │
  │      writeEmailQueueRow()              │
  │      addLeadToInstantly/Smartlead()    │
  │      routing_status = 'routed_email'   │
  │                                         │
  │  Update contact_db:                     │
  │    _qualification_status = 'scored'     │
  └─────────────────────────────────────────┘
```

### Scoring Thresholds

| Score | Channel | What it means |
|-------|---------|---------------|
| 8–10 | `linkedin` | Strong fit, worth your personal attention daily |
| 4–7 | `email` | Decent fit, appropriate for automated sequence |
| 1–3 | `skip` | Poor fit, not worth outreach at this stage |

### Rate Limit Handling

If Kimi returns HTTP 429 (rate limited):
1. `_callKimi()` throws `new Error('RATE_LIMITED')`
2. `runQualification()` catches it in the score loop
3. `Utilities.sleep(60000)` — waits 60 seconds
4. Retries the score call once
5. If still fails: marks contact `_qualification_status = 'error'`, continues to next

---

## 11. AI Model Usage

All AI calls use **Kimi K2 via OpenRouter**. No other AI providers.

| Task | Function | Max Tokens | Temperature | Fallback if fails |
|------|----------|-----------|-------------|-------------------|
| ICP Scoring | `scoreLeadICP()` | 400 | 0.3 | `{score:0, channel:'skip'}` |
| Hook generation | `generateHook()` | 80 | 0.3 | Generic "Noticed [company] in [industry] space" |
| LinkedIn DM | `generateSuggestedDm()` | 150 | 0.3 | Hook + default question |
| Reply drafting | `draftReply()` | 500 | 0.3 | "Would a quick 20-minute call work?" |
| Firecrawl extract | `_extractContext()` | 150 | 0.3 | Empty string (skips enrichment) |

Temperature 0.3 across all tasks: low enough for consistent, structured outputs;
high enough to avoid robotic, repetitive phrasing.

### Why OpenRouter + Kimi vs Direct Kimi API

OpenRouter is a proxy that routes to multiple model providers. Benefits:
- Single API key for multiple models
- Easy model switching if Kimi goes down (change KIMI_MODEL config key)
- Pay-as-you-go, no subscription
- ~$0.15/M input tokens, ~$0.60/M output — extremely cheap at our volume

### Estimated Monthly AI Cost

- ICP scoring: ~2 Kimi calls × 400 tokens × 300 contacts/month = ~240K tokens
- Hook generation: 1 call × 80 tokens × 150 qualified contacts = ~12K tokens
- DM generation: 1 call × 150 tokens × 100 linkedin contacts = ~15K tokens
- Reply drafting: 1 call × 500 tokens × 20 replies/month = ~10K tokens
- Firecrawl extract: 1 call × 150 tokens × 50 enriched contacts = ~7.5K tokens

**Total: ~285K tokens/month ≈ $0.20/month at Kimi K2 via OpenRouter pricing**

---

## 12. LinkedIn Outreach Flow

```
AUTOMATED (system):
  1. Contact appears in linkedin_queue (from runQualification)
  2. suggested_dm pre-written and stored in row
  3. personalization_hook stored in row
  4. contact_linkedin_url is a clickable link
  5. priority_rank assigned (lower = higher priority)

MANUAL (you, every morning, 15 minutes):
  1. Open linkedin_queue tab
  2. Filter: conversation_stage = 'not_sent'
  3. Sort: priority_rank ascending
  4. For top 20 rows:
     a. Click contact_linkedin_url → LinkedIn opens in new tab
     b. Click "Connect" on their profile
     c. Click "Add a note" (connection request message)
     d. Go back to sheet, copy suggested_dm text (Ctrl+C)
     e. Paste in LinkedIn's note box (Ctrl+V), trim to 300 chars if needed
     f. Click Send
     g. Back in sheet: fill connection_sent_date = today
     h. Change conversation_stage = 'request_sent'

WHEN THEY ACCEPT:
  1. LinkedIn notifies you
  2. In sheet: fill connection_accepted_date, change stage = 'connected'
  3. Send DM on LinkedIn: copy suggested_dm (or personalization_hook)
  4. In sheet: fill dm_sent_date, change stage = 'dm_sent'

WHEN THEY REPLY:
  1. You see their reply in LinkedIn
  2. Go to linkedin_queue, find their row
  3. Paste reply text into their_reply column
  4. onEdit() fires within seconds → AI draft generated in replies tab
  5. Open replies tab → read draft → adjust if needed → copy → send on LinkedIn
  6. In replies tab: set send_status = 'sent'
  7. In linkedin_queue: update conversation_stage appropriately
```

### LinkedIn Connection Message Limit

LinkedIn limits connection request notes to 300 characters. The `suggested_dm` generated
by Kimi is set to 3 sentences max (~200-250 characters). If it exceeds 300 characters,
truncate to the first sentence or use the `personalization_hook` (always ≤20 words, ~120 chars).

### Why No LinkedIn Automation

LinkedIn explicitly prohibits automated connection requests without their official API
(which requires business application approval). Tools that automate this (Heyreach,
Phantombuster, OpenOutreach) violate ToS and risk account restriction. At this stage:
- You have ONE LinkedIn account
- Account restriction = entire LinkedIn channel dead for 30+ days
- 20 manual requests per day takes 15 minutes
- The risk-reward is clear: stay manual

---

## 13. Email Outreach Flow

```
AUTOMATED (system):
  1. Contact appears in email_queue (from runQualification, score 4-7)
  2. addLeadToInstantly/Smartlead() called with:
     - email address
     - first_name
     - company_name
     - personalization_hook (the opening line variable)
  3. Smartlead handles D0/D4/D10 sequence automatically
  4. Sequence stopped automatically on reply (pauseLeadInInstantly called)
  5. Reply webhook fires → AI draft created in replies tab

EMAIL TEMPLATES IN SMARTLEAD:
  (Set these up in Smartlead dashboard, not in code)

  Email 1 (Day 0):
    Subject: {{company_name}}'s freight invoices
    Body: Hi {{first_name}},
          {{personalization}}  ← this is the hook
          We built an AI agent that audits carrier invoices automatically —
          most companies at your freight volume find 2-4% sitting in billing errors.
          We work on shared savings — no recovery, no fee.
          Worth a 20-minute call?

  Email 2 (Day 4):
    Subject: Re: {{company_name}}'s freight invoices
    Body: Quick follow-up — a logistics director at a similar company recovered
          $140K in carrier overcharges in the first quarter.
          Still happy to run that free audit for {{company_name}} if timing works.

  Email 3 (Day 10):
    Subject: Re: {{company_name}}'s freight invoices
    Body: Last note — we work on pure shared savings, no cost unless we find money.
          If freight audit ever becomes a priority: just reply "audit" and I'll set it up.

REPLY HANDLING:
  Smartlead detects reply → fires webhook to Apps Script web app URL
  doPost(e) receives payload → handleInstantlyWebhook(payload)
  → Finds contact in email_queue
  → Calls draftReply() with conversation history
  → Writes draft to replies tab
  → Pauses the email sequence (pauseLeadInInstantly)
  → If hot: sends email alert

  You:
  → Open replies tab, review draft
  → Set send_status = 'approved' for email replies
  → processNewReplies() sends within 10 minutes via Smartlead API
```

---

## 14. Reply Handling

### Path A: Email Reply (Automated Detection)

```
Contact replies to email sequence
         ↓
Smartlead detects reply → fires POST webhook to Apps Script web app URL
         ↓
doPost(e) receives payload
  → Parses JSON
  → Always returns ContentService.createTextOutput('ok')
    (Must always return 200 — Smartlead retries on non-200, creating duplicates)
         ↓
handleInstantlyWebhook(payload)
  → Extracts email, reply text, from_name
  → Finds contact in email_queue by email
  → Builds conversation history from replies tab (prior sent messages)
  → Builds replyContext with all lead details
  → Calls draftReply() → Kimi K2 generates draft + classifies intent
  → Writes to replies tab: send_status = 'draft'
  → Updates email_queue: reply_received='yes', stage='replied' (or 'hot')
  → Calls pauseLeadInInstantly(email) ← CRITICAL, never skip
  → If intent = 'hot': sendHotLeadAlert()
         ↓
processNewReplies() (runs every 10 min)
  → Finds send_status = 'approved' rows
  → Sends via Smartlead API
  → Updates send_status = 'sent'
```

### Path B: LinkedIn Reply (Manual Paste)

```
Contact replies to your LinkedIn DM
         ↓
You see reply in LinkedIn
         ↓
You open linkedin_queue, find their row
You paste reply text into their_reply column
         ↓
onEdit(e) fires (Apps Script native trigger)
  → Detects: sheet = 'linkedin_queue'
  → Detects: edited column = 'their_reply'
  → Detects: new value is not empty
  → Detects: row has contact_linkedin_url
  → Calls handleLinkedInReplyEdit(editedRow, replyText)
         ↓
handleLinkedInReplyEdit()
  → Loads contact from contact_db by contact_linkedin_url
  → Builds conversation history
  → Calls draftReply() → Kimi generates draft + classifies intent
  → Writes to replies tab: channel='linkedin', send_status='draft'
  → Updates linkedin_queue: conversation_stage = 'replied_warm' (or 'hot')
  → If hot: sendHotLeadAlert()
         ↓
You open replies tab within a few minutes
You read Kimi's draft
You edit if needed in your_edit column
You copy the final text
You send it on LinkedIn manually
You set send_status = 'sent' in replies tab
```

### Why LinkedIn Replies Are Manual Send

There is no public API for sending LinkedIn messages outside of LinkedIn's official
Message API (requires business application approval). Even Heyreach and Phantombuster
work by controlling a browser session, which is fragile and violates ToS.
Manual copy-paste with an AI-written draft is the right approach at this stage.

---

## 15. Hot Lead Detection and Handoff

### What Classifies as Hot

Kimi's `draftReply()` returns `intent_classification = 'hot'` when the reply contains:
- Explicit pricing inquiry: "How much does this cost?"
- Demo or meeting request: "Can we set up a call?", "Let's chat"
- Affirmative buying signal: "Yes, let's do the audit", "I'm interested"
- Referral to decision maker: "Let me connect you with our CFO"
- Calendar/scheduling request: "Are you available Thursday?"

### What Happens on Hot Detection

```
1. sendHotLeadAlert() fires:
   GmailApp.sendEmail to NOTIFICATION_EMAIL
   Subject: '🔥 Hot Lead: [Company] ([channel])'
   Body includes:
     - Contact name, title, company
     - Their exact message
     - LinkedIn URL and/or email
     - Freight spend estimate
     - Recommended action (book_call)
     - Where to find the AI draft

2. Queue status updated:
   Email: email_queue.stage = 'hot'
   LinkedIn: linkedin_queue.conversation_stage = 'hot'

3. AI pauses involvement:
   For email: sequence already paused (pauseLeadInInstantly called on all replies)
   For LinkedIn: no more auto-drafts until next paste in their_reply

4. YOU take over:
   Respond personally (not from the AI draft)
   Book the discovery call immediately
   On the call: ask questions for 15 min, pitch free audit at end
   Close: "Can I run a free 30-day audit on your invoices?"
```

---

## 16. Deduplication System

### Why It Matters

The same person can appear from multiple sources:
- Leads Finder finds John Smith (has email, no LinkedIn URL)
- LinkedIn Jobs → Employees actor finds John Smith at the same company (has LinkedIn URL, no email)

Without dedup, John gets two rows in contact_db, and receives outreach twice.

### How It Works

```javascript
_dedupCache = {
  linkedin_urls: Set,  // 'linkedin.com/in/johnsmith' etc (lowercased)
  emails: Set,         // 'john@acme.com' etc (lowercased)
  name_company_keys: Set  // 'john smith|acme.com' (lowercased)
}
```

Built ONCE per script execution from all existing contact_db rows.
Checked before EVERY appendRow() to contact_db.

Priority for matching:
1. If new contact has LinkedIn URL → check linkedin_urls Set
2. Else if has email → check emails Set
3. Else if has full_name + company_domain → check name_company_keys Set

After writing a new contact, `registerContact()` immediately adds to the in-memory Sets.
Same-batch duplicates are caught even before hitting the sheet.

### Known Limitation

If John appears in Leads Finder (email only) and Employees (LinkedIn URL only) with
NO overlap in email or LinkedIn URL, they get TWO rows. This is an acceptable edge case
— the same person gets two rows but qualifies once and gets one outreach (dedup on routing
is not yet implemented). At scale this could be added.

---

## 17. Error Handling and Failure Recovery

### The Core Principle

The system must fail loudly with alerts, not silently. Every failure mode has a defined behavior.

| Failure | Detection | Behavior |
|---------|-----------|---------|
| Apify run fails | checkApifyAndProcess polls → FAILED status | Email alert, clear PropertiesService, stop |
| Apify times out (15 polls × 4 min = 60 min) | APIFY_MAX_POLL_ATTEMPTS counter | Email alert, stop |
| Kimi 429 rate limit | HTTP 429 response | Sleep 60s, retry once, mark 'error' if fails again |
| Kimi returns non-JSON | safeJsonParse fails | Return safe default object, log, continue |
| Firecrawl fails | Non-200 response or exception | Return {context:'', status:'failed'}, continue without enrichment |
| Instantly webhook fails | Non-200 from Instantly | They retry — doPost always returns 200 to prevent retries |
| Apify actor returns 0 results | items.length === 0 | Email alert ("0 results — check Apify dashboard") |
| Apps Script 6-minute timeout | BATCH_SIZE=50 limits work per run | Remaining contacts stay 'pending', picked up next run |
| Duplicate doPost call | Instantly retries on non-200 | doPost always returns 200, duplicate webhook writes duplicate replies row (acceptable) |

### What Never Crashes

- `doPost()` — always returns `ContentService.createTextOutput('ok')` even on exception
- `scoreLeadICP()` — always returns a valid object (score=0 if fails)
- `generateHook()` — always returns a string (fallback if fails)
- `draftReply()` — always returns a valid object with draft_reply
- `scrapeAndExtractFreightContext()` — always returns `{context:'', status:...}` never throws

---

## 18. External Dependencies and APIs

| Service | Purpose | How Used | Auth | Free Tier |
|---------|---------|---------|------|-----------|
| Apify Account 1 | Run Leads Finder actor | REST API (triggerApifyRuns) | APIFY_TOKEN_LEADS | $5 compute/month |
| Apify Account 2 | Run LinkedIn Jobs actor | REST API (triggerApifyRuns) | APIFY_TOKEN_JOBS | $5 compute/month |
| Apify Account 3 | Run Employees actor (manual) | UI only | APIFY_TOKEN_EMPLOYEES | $5 compute/month |
| OpenRouter | Route to Kimi K2 | HTTPS POST (UrlFetchApp) | OPENROUTER_API_KEY | Pay-per-token |
| Firecrawl | Scrape company websites | HTTPS POST (UrlFetchApp) | FIRECRAWL_API_KEY | 500 pages/month |
| Smartlead | Email sequencing + webhooks | REST API (instantly_client.gs) | SMARTLEAD_API_KEY | $39/month |
| GmailApp | Notifications + daily summary | Apps Script native | Uses Google account | Free |
| Google Sheets | All data storage | Apps Script native | Uses Google account | Free |
| Google Apps Script | Automation engine | N/A (runs inside GAS) | Uses Google account | Free |
| SAM.gov | Government tender signals | Manual bookmark check | SAM_GOV_API_KEY | Free |

### Webhook Flow

Smartlead needs to reach your Apps Script to send reply notifications.
You deploy the Apps Script as a Web App:
- Extensions → Apps Script → Deploy → New Deployment → Web App
- Execute as: Me
- Who has access: Anyone
- This gives you a URL like: `https://script.google.com/macros/s/ABC123.../exec`

Paste this URL in Smartlead: Settings → Webhooks → add URL → event: reply_received

**Important:** Every time you modify the `doPost()` function or any function it calls,
you must create a NEW Web App deployment. The webhook URL must point to a deployment,
not the live editor. Old deployment = old code receiving webhooks.

---

## 19. Manual vs Automated

### Fully Automated (no human needed)

| Action | Trigger | Function |
|--------|---------|----------|
| Start Apify actor runs | Mon/Wed/Fri 6am trigger | triggerApifyRuns() |
| Poll Apify completion | 4-min delayed trigger | checkApifyAndProcess() |
| Write Apify results to sheets | After actors complete | checkApifyAndProcess() |
| Process Leads Finder rows | Immediately after write | processLeadsFinder() |
| Process LinkedIn Jobs rows | Immediately after write | processLinkedInJobs() |
| ICP score all pending contacts | Every 4 hours | runQualification() |
| Generate personalization hooks | During qualification | generateHook() |
| Generate LinkedIn DMs | During qualification | generateSuggestedDm() |
| Push email leads to Smartlead | During qualification | addLeadToInstantly() |
| Draft email replies | On webhook from Smartlead | handleInstantlyWebhook() |
| Draft LinkedIn replies | On paste to their_reply | handleLinkedInReplyEdit() |
| Send approved email replies | Every 10 minutes | processNewReplies() |
| Hot lead email alert | On hot classification | sendHotLeadAlert() |
| Daily pipeline summary email | 9am daily | writeDailySummary() |
| Log all automation runs | End of every function | appendRow('run_log',...) |

### Manual (you do these)

| Action | Frequency | Time Required | Why Manual |
|--------|-----------|--------------|------------|
| Check SAM.gov bookmark | 3x per week | 10 min | Low volume, high value, needs judgment |
| Add RSS/news items to raw_signal_sources | 3x per week | 10 min | Judgment needed to filter relevance |
| Run Employees actor in Apify UI | 3x per week | 15 min | Input depends on job/signal accumulation; complex to automate |
| Fill _source_* columns in raw_employees | After each Employees run | 5 min | Links employees to signals; critical for accuracy |
| Send LinkedIn connection requests | Daily | 15 min | LinkedIn ToS prohibits automation |
| Update linkedin_queue status after sends | Daily | 5 min | Part of connection request routine |
| Review and approve AI reply drafts | Daily | 10 min | Quality control before sending |
| Send approved LinkedIn drafts manually | Daily | 5 min | No LinkedIn DM API access |
| Take over hot leads | As they appear | Variable | Closing requires human judgment |

---

## 20. Monthly Cost Breakdown

At steady-state operation (3 Apify runs/week, 100 leads/run, 20 connections/day):

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Apify Account 1 (Leads Finder) | $0 | Free tier $5 compute, ~$3-4 used |
| Apify Account 2 (LinkedIn Jobs) | $0 | Free tier $5 compute, ~$1-2 used |
| Apify Account 3 (Employees) | $0 | Free tier $5 compute, ~$2-3 used |
| OpenRouter (Kimi K2) | ~$0.20 | ~285K tokens/month |
| Firecrawl | $0 | Free tier 500 pages, ~50 used |
| Smartlead Basic | $39 | Email sequencing + webhooks |
| Google Apps Script | $0 | Free |
| Google Sheets | $0 | Free |
| **Total** | **~$39.20/month** | |

### Cost to Close Ratio

One closed client at minimum ACV ($6,000–$15,000/year) covers:
- 12–38 months of system operating cost
- Or: system pays for itself after first client every month thereafter

---

## 21. Column Mapping — The Critical Detail

This is the most common source of silent failures. Memorize it.

### The Problem

Apify Leads Finder outputs the contact's LinkedIn URL as: `linkedin`
Apify LinkedIn Company Employees outputs the same data as: `linkedinUrl`

Both of these need to become `contact_linkedin_url` in contact_db.

### The Solution

`column_maps.gs` defines the mapping:

```javascript
LEADS_FINDER_MAP = {
  'linkedin': 'contact_linkedin_url',  // lowercase, no suffix
  'city': 'contact_city',
  'country': 'contact_country',
  'company_linkedin': 'company_linkedin_url',
  // ... 12 other mappings
}

EMPLOYEES_MAP = {
  'linkedinUrl': 'contact_linkedin_url',  // camelCase, different name
  'firstName': 'first_name',
  'lastName': 'last_name',
  'headline': 'headline'
  // location and currentPosition are JSON — parsed separately
}
```

`mapLeadsFinderRow(apifyRow)` takes a raw Apify row object and returns a contact_db
object with normalized column names.

`mapEmployeesRow(apifyRow, signalType, signalTitle, signalDetail)` does the same
for Employees actor rows, also:
- Parses `location` JSON: `location.parsed.country` → `contact_country`
- Parses `currentPosition` JSON array: `[0].companyName` → hints at `company_name`
- Combines `firstName` + `lastName` → `full_name`

### Raw Tab Column Names Are Sacred

**Never rename columns in raw_leads_finder or raw_employees.**
The Apps Script reads these exact names. Renaming one column silently breaks all
contacts from that run — they get processed but the mapped field is empty.

---

## 22. Config Tab — All Runtime Parameters

All behavior is controlled from the config tab (column A = key, column B = value).
No values are hardcoded in .gs files.

| Key | Example Value | What It Controls |
|-----|--------------|-----------------|
| OPENROUTER_API_KEY | sk-or-... | All Kimi K2 API calls |
| KIMI_MODEL | moonshotai/kimi-k2 | Which model via OpenRouter |
| INSTANTLY_API_KEY | ... | Smartlead or Instantly API calls |
| INSTANTLY_CAMPAIGN_ID | ... | Which campaign to add email leads to |
| FIRECRAWL_API_KEY | fc-... | Website scraping for enrichment |
| NOTIFICATION_EMAIL | amit@email.com | Where alerts and summaries go |
| ICP_SCORE_THRESHOLD_EMAIL | 4 | Minimum score to enter email queue |
| ICP_SCORE_THRESHOLD_LINKEDIN | 8 | Minimum score for LinkedIn queue |
| FIRECRAWL_SCORE_THRESHOLD | 8 | Minimum score to trigger website scrape |
| DAILY_LINKEDIN_LIMIT | 20 | Max connection requests per day (informational) |
| TARGET_LOCATIONS | United States | Injected into ICP scoring prompt |
| TARGET_INDUSTRIES | logistics and supply chain,... | Injected into scoring + Apify filter |
| SENDER_NAME | Amit | Used in email templates |
| SENDER_COMPANY | FreightAuditAI | Used in email templates |
| BATCH_SIZE | 50 | Contacts processed per runQualification() call |
| APIFY_TOKEN_LEADS | apify_api_... | Apify Account 1 token |
| APIFY_TOKEN_JOBS | apify_api_... | Apify Account 2 token |
| APIFY_TOKEN_EMPLOYEES | apify_api_... | Apify Account 3 token |
| APIFY_LEADS_ACTOR_ID | username~leads-finder | Leads Finder actor |
| APIFY_JOBS_ACTOR_ID | username~linkedin-jobs | LinkedIn Jobs actor |
| APIFY_EMPLOYEES_ACTOR_ID | username~li-employees | Employees actor |
| LINKEDIN_JOB_KEYWORDS | freight audit,carrier invoice,... | Search terms for LinkedIn Jobs actor |
| APIFY_FETCH_COUNT | 100 | Max results per Apify run |
| APIFY_MAX_POLL_ATTEMPTS | 15 | Max polling attempts before timeout alert |

### To Change Target Region

Update `TARGET_LOCATIONS` in config tab. Next Apify run and qualification batch
will use the new value. No code changes needed.

### To Pause Email Outreach

Set `ICP_SCORE_THRESHOLD_EMAIL` to `11` (impossible to reach).
All leads will route to linkedin_queue or skip. Change back to `4` to re-enable.

---

*Document version: reflects system state after Phases 1–6 + Apify automation upgrade.*
*For build instructions: see implementation.md*
*For operating instructions: see agent.md*