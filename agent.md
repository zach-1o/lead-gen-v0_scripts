# agent.md — Freight Audit Outreach System
### Semi-Automated Lead Generation Engine for B2B Freight Audit AI (Google Apps Script)

> Read this file **completely** at the start of every session. No exceptions.
> This is not documentation. This is your operating system.

---

## 0. Session Start Ritual

Before touching a single file, complete this checklist in order:

```
- [ ] Read tasks/lessons.md — internalize every rule before writing code
- [ ] Read tasks/todo.md — know which phase you are in and what is left
- [ ] Read project_structure.md — understand what changed last session
- [ ] Identify which layer you are working in:
        ingestion / qualification / outreach / reply_handler / notifications / scheduler
- [ ] Is today's task 3+ steps or architectural? Write the plan to tasks/todo.md FIRST
- [ ] Confirm the phase's verification checklist from implementation.md
        before marking anything done
```

If you skip this, you will repeat mistakes and break things that were working. Do not skip it.

---

## 1. What This Project Is

### The Problem We Solve

US mid-market shippers (companies spending freight budgets at scale) lose 2–4% of their freight spend to carrier billing errors. Our AI agent helps surface and audit those errors. The problem is finding the right companies and starting a conversation. That is what this system does.

### What We Build

A semi-automated B2B lead generation engine built entirely inside **Google Apps Script** connected to a single Google Sheet. Five layers:

| Layer | What it does |
|-------|-------------|
| **Ingestion** | Four raw paste tabs receive Apify CSV exports and manual entries |
| **Deduplication** | Redis-like in-memory Set cache prevents duplicate contacts across sources |
| **Qualification** | Kimi K2 ICP scores each contact 1–10, Firecrawl enriches high-scorers |
| **Outreach routing** | Score 8–10 → LinkedIn Queue (manual sends), Score 4–7 → Email Queue (Instantly auto-sends) |
| **Reply handler** | Instantly webhook → Kimi drafts reply → written to Replies tab; onEdit trigger handles LinkedIn replies |

### One-Sentence Pitch

> We find freight-shipping companies from four signal sources, score each contact with AI, route them to the right channel, and generate AI-drafted replies to every inbound — all inside a Google Sheet with zero infrastructure.

### Critical Difference from a Fullstack System

This is **NOT** a Python backend. There is no server, no Docker, no Redis, no BullMQ.
- All state lives in **Google Sheets tabs**
- All async work is handled by **Apps Script time-based triggers**
- The "queue" is the `contact_db` tab filtered by `_qualification_status = 'pending'`
- The "webhook receiver" is a deployed Apps Script **Web App** (`doPost`)
- The "cron" is **Apps Script trigger** (every 4 hours for qualification, every 10 min for send loop)

---

## 2. Architecture

```
                    ┌─────────────────────────────────────────┐
                    │   Signal Sources (manual, 3x per week)  │
                    │                                         │
                    │  Apify Leads Finder → raw_leads_finder  │
                    │  Apify LinkedIn Jobs → raw_linkedin_jobs │
                    │  Apify Employees → raw_employees         │
                    │  SAM.gov + Feedly → raw_signal_sources   │
                    └──────────────────┬──────────────────────┘
                                       │ you paste CSVs
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │   Processing Functions (menu / trigger) │
                    │                                         │
                    │  processLeadsFinder()                   │
                    │  processLinkedInJobs()                  │
                    │  processEmployees()                     │
                    │  processSignalSources()                 │
                    └──────────────────┬──────────────────────┘
                                       │ dedup → contact_db + company_db
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │   Qualification Pipeline (every 4h)     │
                    │                                         │
                    │  contact_db pending →                   │
                    │  scoreLeadICP (Kimi K2 via OpenRouter)  │
                    │  → Firecrawl enrichment (score ≥ 8)     │
                    │  → generateHook + generateSuggestedDm   │
                    │  → qualification_results                │
                    └──────────┬──────────────────┬───────────┘
                               │ score 8-10       │ score 4-7
                    ┌──────────▼──────┐  ┌────────▼──────────┐
                    │  LinkedIn Queue │  │  Email Queue       │
                    │                 │  │                    │
                    │  You send 20    │  │  Instantly API     │
                    │  connection     │  │  auto-sequence     │
                    │  requests daily │  │  D0/D4/D10         │
                    │  (manual)       │  │                    │
                    └──────────┬──────┘  └────────┬───────────┘
                               │                  │
                    ┌──────────▼──────────────────▼───────────┐
                    │          Reply Handler                    │
                    │                                          │
                    │  Instantly webhook (doPost) → Kimi draft │
                    │  onEdit 'their_reply' → Kimi draft       │
                    │  → replies tab (draft)                   │
                    │  → You approve → processNewReplies sends │
                    │  → Hot lead → GmailApp alert             │
                    └──────────────────────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
                    │         Google Sheet Tabs               │
                    │  raw_leads_finder · raw_linkedin_jobs   │
                    │  raw_employees · raw_signal_sources     │
                    │  contact_db · company_db                │
                    │  qualification_results                  │
                    │  linkedin_queue · email_queue           │
                    │  replies · config · run_log             │
                    └─────────────────────────────────────────┘
```

**Config rule:** All runtime parameters (thresholds, limits, API keys) live in the `config` tab (key/value rows). `getConfig(key)` reads this tab and caches it. **Nothing is hardcoded** in any `.gs` file. Changing a row in the config tab changes system behavior instantly.

---

## 3. Project Structure

```
lead-gen-v0/
│
├── agent.md                         ← THIS FILE. Read every session.
├── implementation.md                ← Phase-by-phase build instructions. SOURCE OF TRUTH.
├── project_structure.md             ← Living changelog. Update after every session.
├── README.md                        ← Setup guide and post-build checklist
│
├── tasks/
│   ├── todo.md                      ← Current phase + remaining checklist items
│   └── lessons.md                   ← Every mistake captured as a rule
│
└── src/                             ← All Google Apps Script source files
    ├── Code.gs                      ← onOpen menu, doPost webhook, onEdit trigger
    ├── config.gs                    ← getConfig(), getConfigNumber(), refreshConfig(), cache
    ├── sheets_helper.gs             ← All sheet I/O by header name (never by index)
    ├── column_maps.gs               ← Apify column name → contact_db column name mappings
    ├── utils.gs                     ← generateUUID(), safeJsonParse(), buildConversationHistory()
    ├── dedup.gs                     ← isDuplicate(), registerContact(), _buildDedupCache()
    ├── ingestion.gs                 ← processLeadsFinder(), processLinkedInJobs(),
    │                                   processEmployees(), processSignalSources()
    ├── kimi_client.gs               ← scoreLeadICP(), generateHook(), generateSuggestedDm(), draftReply()
    ├── firecrawl_client.gs          ← scrapeAndExtractFreightContext(), _extractContext()
    ├── qualification.gs             ← runQualification(), routing logic, Instantly push
    ├── instantly_client.gs          ← addLeadToInstantly(), pauseLeadInInstantly(), sendReplyViaInstantly()
    ├── reply_handler.gs             ← handleInstantlyWebhook(), handleLinkedInReplyEdit(), processNewReplies()
    ├── notifications.gs             ← sendHotLeadAlert(), writeDailySummary()
    └── scheduler.gs                 ← setUpTriggers() — creates all time-based triggers
```

> **Note:** The `src/` folder is your local reference copy. The actual running code lives in the **Google Apps Script editor** (Extensions → Apps Script). Keep these files in sync.

---

## 4. Sheet Architecture (memorize this — every module touches it)

### 12 Tabs Overview

```
RAW INPUT TABS (you paste Apify CSVs here — NEVER rename columns)
├── raw_leads_finder        ← Apify Leads Finder output
├── raw_linkedin_jobs       ← Apify LinkedIn Jobs Scraper output
├── raw_employees           ← Apify LinkedIn Company Employees output
└── raw_signal_sources      ← Manual entry: SAM.gov RFPs + Feedly news

PROCESSING TABS (machine writes here — you never paste here)
├── contact_db              ← Unified contact database, one row per unique contact
├── company_db              ← Deduplicated companies with aggregated signals
└── qualification_results   ← ICP scores, hooks, channel assignments, per-contact

ACTION TABS (you work from these daily)
├── linkedin_queue          ← Your daily LinkedIn outreach list (manual sends)
├── email_queue             ← Auto-pushed to Instantly; pipeline visibility
└── replies                 ← AI-drafted replies for your review and approval

SYSTEM TABS
├── config                  ← All runtime parameters (key/value)
└── run_log                 ← Automation run history
```

### Key Column Details

**`contact_db` — the master contact record:**

| Column | Notes |
|--------|-------|
| `contact_id` | UUID generated by script |
| `contact_linkedin_url` | Normalized from `linkedin` (Leads Finder) OR `linkedinUrl` (Employees actor) |
| `dedup_key` | contact_linkedin_url → email → full_name\|company_domain (priority order) |
| `signal_type` | `icp_match` \| `linkedin_job` \| `sam_gov` \| `rss_news` |
| `_qualification_status` | `pending` \| `scored` \| `skipped` \| `error` |

**`qualification_results` — the scoring record:**

| Column | Notes |
|--------|-------|
| `icp_score` | 1–10 from Kimi |
| `channel` | `linkedin` \| `email` \| `skip` |
| `routing_status` | `pending` \| `routed_linkedin` \| `routed_email` \| `skipped` |
| `personalization_hook` | AI-generated opening line ≤ 20 words |
| `suggested_dm` | AI-generated DM for linkedin_queue (LinkedIn contacts only) |

**`linkedin_queue` — your daily action tab:**

| Column | Notes |
|--------|-------|
| `conversation_stage` | `not_sent` → `request_sent` → `connected` → `dm_sent` → `replied_warm` → `hot` |
| `their_reply` | You paste reply here → onEdit fires → Kimi drafts response in `replies` tab |

**`replies` — AI-drafted responses awaiting approval:**

| Column | Notes |
|--------|-------|
| `send_status` | `draft` → `approved` → `sent` (email) OR `manual_required` (LinkedIn) |
| `your_edit` | If filled, this is sent instead of `kimi_draft` |
| `intent_classification` | `hot` \| `warm` \| `neutral` \| `cold` |

---

## 5. The Critical Column Name Problem

**This is the #1 source of silent failures. Memorize this.**

Apify Leads Finder outputs: `linkedin` (lowercase, no suffix)
Apify Employees actor outputs: `linkedinUrl` (camelCase)

Both map to `contact_linkedin_url` in `contact_db`.

This normalization happens in `column_maps.gs` → `mapLeadsFinderRow()` and `mapEmployeesRow()`.

**Never rename Apify output columns when pasting.** Paste raw CSV exactly as downloaded. The script reads the raw Apify names and maps them internally.

```
LEADS_FINDER_MAP:  'linkedin'    → 'contact_linkedin_url'
EMPLOYEES_MAP:     'linkedinUrl' → 'contact_linkedin_url'
```

If you ever see a `contact_linkedin_url` column that is empty when it should have data, check `column_maps.gs` first.

---

## 6. AI Model Allocation

This system uses **Kimi K2** via OpenRouter for all AI tasks. No Claude, no Groq.

| Task | Function | Tokens |
|------|----------|--------|
| ICP scoring (1–10) + channel decision | `scoreLeadICP()` | 400 |
| Hook generation (≤20 word opening line) | `generateHook()` | 80 |
| LinkedIn DM suggestion | `generateSuggestedDm()` | 150 |
| Reply drafting + intent classification | `draftReply()` | 500 |
| Firecrawl context extraction | `_extractContext()` | 150 |

**Rate limit handling:** `_callKimi()` throws `'RATE_LIMITED'` on HTTP 429. `runQualification()` catches this, sleeps 60 seconds, and retries once. After retry failure: marks contact `_qualification_status = 'error'` and continues the batch.

**Fallback on all AI calls:** Every Kimi function returns a safe default if the call fails. Qualification never crashes due to an AI failure.

---

## 7. Deduplication — How It Works

The dedup cache is built once per script execution from all existing `contact_db` rows.

**Priority order for dedup_key:**
1. `contact_linkedin_url` (most reliable — used if not empty)
2. `email` (used if LinkedIn URL empty)
3. `full_name + '|' + company_domain` (last resort)

**The critical scenario to understand:**
- Contact appears in Leads Finder (has email, no LinkedIn URL)
- Same contact appears in Employees actor (has LinkedIn URL, no email)
- They share the same person but neither key overlaps → **TWO rows** in contact_db

This is an acceptable edge case. The system is designed to minimize it, not eliminate it.

After writing a new contact to `contact_db`, always call `registerContact()` to add them to the in-memory cache — otherwise the same contact could be written again within the same run.

---

## 8. Qualification Pipeline — Execution Flow

```
runQualification() fires (every 4h trigger or manual menu)
│
├── Read all contact_db rows where _qualification_status = 'pending'
├── Take first BATCH_SIZE (from config, default 50)
│
├── For each contact:
│   ├── getCompanyForContact() → match from company_db
│   ├── scoreLeadICP(contactObj, companyObj, '') → first pass, no firecrawl
│   │   └── If channel = 'skip' → mark 'skipped', next contact
│   ├── runFirecrawlIfNeeded() → only if score ≥ FIRECRAWL_SCORE_THRESHOLD
│   │   └── If firecrawl returned context → re-score with context
│   ├── generateHook() → personalization_hook
│   ├── generateSuggestedDm() → only if channel = 'linkedin'
│   ├── Write to qualification_results
│   └── Route:
│       ├── linkedin → writeLinkedInQueueRow() + update routing_status
│       └── email →
│           ├── If no email but has LinkedIn URL → fallback to linkedin_queue
│           ├── Else writeEmailQueueRow() + addLeadToInstantly()
│           └── Update routing_status
│
└── Write to run_log
```

**Execution time budget:** ~4 seconds per contact (Kimi calls + Utilities.sleep sleeps). At BATCH_SIZE=50: ~200 seconds per run. Apps Script 6-minute limit = 360 seconds. Safe margin of ~160 seconds for variation.

---

## 9. AI Prompt Templates (do not deviate from these)

All prompts are defined in `implementation.md` Section "AI Prompt Templates". They are the source of truth. The `.gs` implementations must match them exactly.

### ICP Scoring (scoreLeadICP)
- Returns JSON: `{score, score_reasons, freight_spend_estimate, channel}`
- `channel` = `'linkedin'` if score ≥ 8, `'email'` if score 4–7, `'skip'` if ≤ 3
- Config vars injected: `TARGET_LOCATIONS`, `TARGET_INDUSTRIES`

### Hook Generation (generateHook)
- Returns: one sentence, ≤ 20 words, no quotes
- Fallback: `'Noticed ' + company_name + ' in the ' + industry + ' space'`

### Suggested DM (generateSuggestedDm)
- Returns: 3 sentences max, LinkedIn DM text only
- Signal-type aware: references job posting / RFP / news / ICP match differently

### Reply Drafting (draftReply)
- Returns JSON: `{draft_reply, intent_classification, recommended_action}`
- `intent_classification`: `hot` \| `warm` \| `neutral` \| `cold`
- `hot` = pricing ask, demo request, yes to call → triggers `sendHotLeadAlert()`

---

## 10. Reply Handler — Two Paths

### Path A — Instantly webhook (email reply)
```
Instantly sends email sequence
        ↓ (contact replies)
Instantly fires POST to your Apps Script web app URL
doPost(e) receives payload
handleInstantlyWebhook(payload) called
        ↓
Find contact in email_queue
Build conversation history from replies tab
Call draftReply() → Kimi generates draft + classifies intent
Write to replies tab (send_status = 'draft')
Update email_queue (reply_received='yes', stage='replied' or 'hot')
Call pauseLeadInInstantly() ← CRITICAL: stops sequence on active thread
If intent = 'hot': sendHotLeadAlert() via GmailApp
        ↓
processNewReplies() runs every 10 min
Finds send_status = 'approved' rows (you set this)
Sends via sendReplyViaInstantly()
Updates send_status = 'sent'
```

### Path B — LinkedIn reply (manual onEdit trigger)
```
Contact replies to your LinkedIn DM
You paste their reply into 'their_reply' column in linkedin_queue
        ↓
onEdit trigger fires
Detects sheet = 'linkedin_queue' AND column = 'their_reply'
Calls handleLinkedInReplyEdit(editedRow, replyText)
        ↓
Build conversation history
Call draftReply() → Kimi generates draft
Write to replies tab (channel='linkedin', send_status='draft')
If intent = 'hot': update linkedin_queue stage = 'hot'
                   sendHotLeadAlert()
        ↓
You open replies tab
Copy kimi_draft (or edit in your_edit)
Send manually on LinkedIn
Set send_status = 'sent'
```

**Rule:** `pauseLeadInInstantly()` must be called on EVERY email reply without exception. An active Instantly sequence + ongoing conversation = duplicate emails on a live thread. This is unrecoverable brand damage.

---

## 11. Config Tab — All Runtime Parameters

Fill these in the `config` tab before running any automation:

| Key | Default Value | Notes |
|-----|--------------|-------|
| `OPENROUTER_API_KEY` | your key | From openrouter.ai |
| `KIMI_MODEL` | `moonshotai/kimi-k2` | Or `moonshotai/kimi-k2-5` |
| `INSTANTLY_API_KEY` | your key | From Instantly dashboard |
| `INSTANTLY_CAMPAIGN_ID` | your campaign ID | Create campaign first |
| `FIRECRAWL_API_KEY` | your key | From firecrawl.dev |
| `NOTIFICATION_EMAIL` | your email | For hot lead alerts |
| `ICP_SCORE_THRESHOLD_EMAIL` | `4` | Min score to enter email queue |
| `ICP_SCORE_THRESHOLD_LINKEDIN` | `8` | Min score for LinkedIn queue |
| `FIRECRAWL_SCORE_THRESHOLD` | `8` | Only enrich leads scoring ≥ this |
| `DAILY_LINKEDIN_LIMIT` | `20` | Max connection requests per day |
| `TARGET_LOCATIONS` | `United States` | Injected into ICP scoring prompt |
| `TARGET_INDUSTRIES` | `logistics and supply chain, transportation/trucking/railroad, warehousing, wholesale, food & beverages, manufacturing, distribution` | Injected into ICP scoring prompt |
| `SENDER_NAME` | your name | Used in email templates |
| `SENDER_COMPANY` | your company name | Used in email templates |
| `BATCH_SIZE` | `50` | Max contacts to qualify per run |

---

## 12. Trigger Schedule

| Trigger | Function | Frequency |
|---------|----------|-----------|
| Qualification | `runQualification()` | Every 4 hours |
| Send loop | `processNewReplies()` | Every 10 minutes |
| Daily summary | `writeDailySummary()` | Daily at 9am |

Run `setUpTriggers()` once from the menu after deployment. It deletes all existing triggers first to prevent duplicates.

---

## 13. Workflow Rules

### Rule 1: Plan Before Code
Any task with 3+ steps requires a written plan in `tasks/todo.md` before implementation starts.

```markdown
## Task: [name]
**Phase:** [which phase]
- [ ] Step one (specific function/file)
- [ ] Step two
- [ ] Step three
**Verify by:** [exact check — function call, log output, sheet row]
```

If something breaks mid-task — stop. Re-plan. Never push deeper into a broken state.

### Rule 2: Update `project_structure.md` After Every Session

```markdown
## YYYY-MM-DD — [Short title]
**Phase completed:**
**What changed:**
**Files created or modified:**
**Watch out for:**
**Next session starts at:**
```

### Rule 3: Capture Lessons Immediately

After any correction or bug found → add to `tasks/lessons.md` before continuing:

```markdown
## Lesson [N]
**Mistake:** what went wrong or was misunderstood
**Rule:** the specific rule that prevents it
**Phase:** which phase this surfaced in
**Date:**
```

### Rule 4: Never Mark a Phase Done Without the Checklist

Every phase in `implementation.md` has a verification checklist. Run every item. If one fails, fix it before moving to the next phase.

### Rule 5: Fix Bugs at the Root

Bug found → read the logs → find the root cause → fix the root cause. No patches. No workarounds that mask the real problem.

---

## 14. Hard Rules (Non-Negotiable)

```
1. NEVER address a sheet column by its index number.
   Always use colIndex(tabName, headerName) from sheets_helper.gs.
   Index-based addressing breaks silently when columns are reordered.

2. NEVER hardcode a config value outside config.gs.
   Thresholds, limits, API keys, model names — all come from getConfig().

3. NEVER skip the dedup check before writing to contact_db.
   Duplicate contacts = duplicate outreach = burned leads.

4. NEVER write the AI reply to the replies tab before checking the inbound message.
   Write inbound data first. If Kimi call fails and retries, history must be intact.

5. NEVER skip calling pauseLeadInInstantly() when an email reply is received.
   Active sequence + live conversation = duplicate emails. Unrecoverable.

6. NEVER mark a phase done without manually verifying every checklist item
   in that phase's section of implementation.md.

7. NEVER let doPost() throw an exception.
   Always wrap in try/catch. Always return ContentService.createTextOutput('ok').
   Instantly will retry failed webhooks and create duplicate reply rows.

8. NEVER read config values on every API call.
   _configCache must be populated once per script execution.
   If the cache is null, load it; otherwise use the cached value.

9. NEVER process a raw tab row twice.
   Check _processed column before processing. Set it immediately after writing.
   If the script fails mid-batch, partially processed rows must not be re-processed.

10. NEVER commit real API keys to git.
    Config tab values stay in the Google Sheet. This repo contains no secrets.
```

---

## 15. Failure Handling

| Failure | Behavior |
|---------|---------|
| Kimi API returns 429 | `_callKimi()` throws `'RATE_LIMITED'`. Caller sleeps 60s, retries once. If fails again: mark contact `_qualification_status = 'error'`, continue batch. |
| Kimi returns malformed JSON | `safeJsonParse()` tries regex extraction. If fails: returns safe default object. Never crashes. |
| Firecrawl returns non-200 | `scrapeAndExtractFreightContext()` returns `{context:'', status:'failed'}`. Company row updated. Qualification continues without enrichment. |
| Firecrawl on `li_` domain | Returns `{context:'', status:'skipped'}` immediately. No API call made. |
| Instantly add_lead fails | `addLeadToInstantly()` returns `null`. Email queue row written with no `instantly_lead_id`. Log the failure. Continue. |
| Instantly 'already exists' | Returns `'already_exists'` string. Treat as success. Do not log as error. |
| doPost receives unknown webhook | Log and return `'ok'`. Never error. |
| onEdit fires on unexpected column | Early-return guards in Code.gs prevent unintended Kimi calls. |
| Apps Script 6-minute timeout | `runQualification()` respects `BATCH_SIZE`. Remaining contacts stay `_qualification_status = 'pending'` and are picked up next run. |

---

## 16. Phase Build Order

Never skip a phase. Each one is a dependency for the next.

| Phase | What it builds | Gate to next phase |
|-------|---------------|-------------------|
| **1 — Sheet Setup + Config + Helpers** | All 12 tabs, `config.gs`, `sheets_helper.gs`, `column_maps.gs`, `Code.gs` | All 12 tabs exist; `testConfig()` logs without error |
| **2 — Deduplication** | `dedup.gs` | `isDuplicate()` returns correct results for all 3 scenarios |
| **3 — Ingestion** | `ingestion.gs` — all 4 processing functions | Paste test data → correct rows in contact_db and company_db |
| **4 — AI Clients** | `kimi_client.gs`, `firecrawl_client.gs`, `utils.gs` | `testAIClients()` returns valid responses for all 4 functions |
| **5 — Qualification** | `qualification.gs`, `instantly_client.gs` | `runQualification()` routes contacts to correct queues |
| **6 — Reply Handler + Scheduler** | `reply_handler.gs`, `notifications.gs`, `scheduler.gs` | doPost handles test webhook; onEdit drafts reply; triggers created |

Prompts for each phase are in `implementation.md`. Use them exactly.

---

## 17. Post-Build Checklist (run once after all phases complete)

```
- [ ] Run setupAllSheets() — all 12 tabs created with correct headers, row 1 frozen
- [ ] Fill Config tab with all 15 key-value pairs
- [ ] Run testConfig() — all 7 values log correctly
- [ ] Run testAIClients() — all 4 AI functions return valid responses
- [ ] Create Instantly campaign with 3-step email templates (D0/D4/D10)
- [ ] Deploy as Web App:
      Extensions → Apps Script → Deploy → New Deployment → Web App
      Execute as: Me | Who has access: Anyone
- [ ] Set Instantly webhook URL to your deployed web app URL
- [ ] Run setUpTriggers() — confirm 3 triggers in Triggers panel
- [ ] Paste 5 test rows into raw_leads_finder, run processLeadsFinder()
      Verify 5 rows in contact_db with correct column mapping
- [ ] Run runQualification() manually
      Verify rows appear in linkedin_queue or email_queue
- [ ] Check run_log tab shows entries for each run
- [ ] Verify Instantly receives leads via their dashboard
- [ ] Test webhook: POST a sample payload to your web app URL
      Verify a draft row appears in replies tab
```

---

## 18. Weekly Operating Rhythm

**Monday / Wednesday / Friday (~45 min):**
1. Apify → Leads Finder run → download CSV → paste into `raw_leads_finder` (leave `_processed` blank)
2. Apify → LinkedIn Jobs run → download CSV → paste into `raw_linkedin_jobs`
3. SAM.gov bookmark → type new RFPs into `raw_signal_sources`
4. Feedly → paste relevant news into `raw_signal_sources`
5. For all new rows in `raw_linkedin_jobs` and `raw_signal_sources`:
   - Collect company LinkedIn URLs
   - Run Apify LinkedIn Company Employees actor (Short mode) on each
   - Download CSV → paste into `raw_employees`
   - Manually fill `_source_company_linkedin_url`, `_source_signal_type`, `_source_signal_row`
6. Run all four process functions from the custom menu (or wait for 4h trigger)

**Every morning (~20 min):**
1. Open `linkedin_queue` → filter `conversation_stage = not_sent` → sort `priority_rank` ascending
2. Send 20 connection requests on LinkedIn → update `connection_sent_date` and stage = `request_sent`
3. Check accepted connections → update dates and stage → copy `suggested_dm` → send on LinkedIn
4. Open `replies` tab → filter `send_status = draft`
   - Email: set `send_status = approved` (machine sends within 10 min)
   - LinkedIn: copy draft → send manually → set `send_status = sent`

---

*This file is the project's operating system. Read it fully at the start of every session.*
*For phase-by-phase build instructions: see `implementation.md`.*
*For what changed last session: see `project_structure.md`.*
*For open tasks: see `tasks/todo.md`.*
*Last updated: see `project_structure.md`.*
