# tasks/todo.md — Phase Tracker

Read this at the start of every session. Know which phase you are in and what is left.

---

## Current Phase: 1 — Sheet Setup + Config + Sheet Helpers

**Status:** ⬜ NOT STARTED

### Checklist

- [ ] Create `setupAllSheets()` — all 12 tabs with exact headers, row 1 frozen
- [ ] Create `config.gs` — `getConfig()`, `getConfigNumber()`, `refreshConfig()`, `_configCache`
- [ ] Create `sheets_helper.gs` — all 10 helper functions (never address columns by index)
- [ ] Create `column_maps.gs` — `LEADS_FINDER_MAP`, `EMPLOYEES_MAP`, `mapLeadsFinderRow()`, `mapEmployeesRow()`
- [ ] Create `Code.gs` — `onOpen()` menu, `doPost()`, `testConfig()`
- [ ] Verify: all 12 tabs exist with row 1 headers exactly matching `implementation.md`
- [ ] Verify: `getConfig('INSTANTLY_API_KEY')` does NOT re-read sheet on second call (cache works)
- [ ] Verify: `colIndex('raw_leads_finder', 'linkedin')` returns correct 1-based index
- [ ] Verify: `colIndex('raw_employees', 'linkedinUrl')` returns correct index (different name!)
- [ ] Verify: `mapLeadsFinderRow()` maps `linkedin` → `contact_linkedin_url`
- [ ] Verify: `mapEmployeesRow()` maps `linkedinUrl` → `contact_linkedin_url`
- [ ] Verify: `mapEmployeesRow()` handles `location` as JSON string without crashing
- [ ] Verify: `appendRow()` ignores keys not in headers (no error thrown)
- [ ] Verify: custom menu appears after `onOpen()`
- [ ] Verify: `testConfig()` logs all 7 values without errors

**Gate to Phase 2:** All 15 checklist items above pass ✓

---

## Phase 2 — Deduplication Module

**Status:** ⬜ NOT STARTED (blocked on Phase 1)

### Checklist

- [ ] Create `dedup.gs` — `_buildDedupCache()`, `isDuplicate()`, `registerContact()`, `refreshDedupCache()`, `getDedupStats()`
- [ ] Verify: `isDuplicate()` returns true for LinkedIn URL match even when email is different
- [ ] Verify: `isDuplicate()` returns true for email match even when LinkedIn URL is different
- [ ] Verify: `isDuplicate()` returns false for completely new contact
- [ ] Verify: `registerContact()` updates cache so subsequent calls in same run catch it
- [ ] Verify: `_buildDedupCache()` handles empty contact_db without error

**Gate to Phase 3:** All 5 verification items pass ✓

---

## Phase 3 — Ingestion: Processing All Four Raw Tabs

**Status:** ⬜ NOT STARTED (blocked on Phase 2)

### Checklist

- [ ] Create `ingestion.gs` — `upsertCompanyDb()`, `writeContactDb()`, 4 process functions
- [ ] Verify: `processLeadsFinder()` maps `linkedin` → `contact_linkedin_url` in contact_db
- [ ] Verify: `processEmployees()` maps `linkedinUrl` → `contact_linkedin_url` in contact_db
- [ ] Verify: Both produce identical `contact_linkedin_url` column name in contact_db
- [ ] Verify: `processLinkedInJobs()` does NOT write to contact_db (only company_db)
- [ ] Verify: `processEmployees()` correctly reads signal context from `_source_signal_row`
- [ ] Verify: `upsertCompanyDb()` updates existing row when called twice for same domain
- [ ] Verify: Same contact from Leads Finder + Employees actor → only ONE row in contact_db
- [ ] Verify: `_processed = 'pending_employees'` set on linkedin_jobs and signal_sources rows

**Gate to Phase 4:** All 8 verification items pass ✓

---

## Phase 4 — AI Clients (Kimi + Firecrawl + Utils)

**Status:** ⬜ NOT STARTED (blocked on Phase 3)

### Checklist

- [ ] Create `utils.gs` — `generateUUID()`, `safeJsonParse()`, `truncateText()`, `formatDateISO()`, `buildConversationHistory()`
- [ ] Create `kimi_client.gs` — `_callKimi()`, `scoreLeadICP()`, `generateHook()`, `generateSuggestedDm()`, `draftReply()`
- [ ] Create `firecrawl_client.gs` — `scrapeAndExtractFreightContext()`, `_extractContext()`
- [ ] Add `testAIClients()` to Code.gs and add to menu
- [ ] Verify: `_callKimi()` throws `'RATE_LIMITED'` on 429 — not a generic crash
- [ ] Verify: `scoreLeadICP()` returns default skip object on parse failure — never throws
- [ ] Verify: `generateHook()` returns fallback string on API failure — never throws
- [ ] Verify: `scrapeAndExtractFreightContext('li_fastship-3pl', ...)` returns skipped, no API call
- [ ] Verify: `scrapeAndExtractFreightContext()` returns `{context:'', status:'failed'}` on error
- [ ] Verify: `buildConversationHistory()` returns empty string for new contact
- [ ] Verify: `safeJsonParse()` extracts JSON from response with extra text around it

**Gate to Phase 5:** `testAIClients()` returns valid responses for all 4 functions ✓

---

## Phase 5 — Qualification Pipeline

**Status:** ⬜ NOT STARTED (blocked on Phase 4)

### Checklist

- [ ] Create `instantly_client.gs` — `addLeadToInstantly()`, `pauseLeadInInstantly()`, `sendReplyViaInstantly()`
- [ ] Create `qualification.gs` — `getCompanyForContact()`, `runFirecrawlIfNeeded()`, `writeLinkedInQueueRow()`, `writeEmailQueueRow()`, `runQualification()`
- [ ] Verify: Contacts with `_qualification_status = 'scored'` are not re-processed
- [ ] Verify: Rate limit 429 triggers 60-second sleep + one retry → marks error if retry fails
- [ ] Verify: Firecrawl skipped for `li_` prefixed domains
- [ ] Verify: Contact with no email but LinkedIn URL → routes to linkedin_queue (not skipped)
- [ ] Verify: `addLeadToInstantly()` 'already_exists' does not cause error
- [ ] Verify: `qualification_results.routing_status` updated after each routing decision
- [ ] Verify: `suggested_dm` generated only for linkedin-routed contacts
- [ ] Verify: Batch size respected — stops at BATCH_SIZE contacts per run

**Gate to Phase 6:** `runQualification()` routes test contacts to correct queues ✓

---

## Phase 6 — Reply Handler + Scheduler

**Status:** ⬜ NOT STARTED (blocked on Phase 5)

### Checklist

- [ ] Create `reply_handler.gs` — `handleInstantlyWebhook()`, `handleLinkedInReplyEdit()`, `processNewReplies()`
- [ ] Create `notifications.gs` — `sendHotLeadAlert()`, `writeDailySummary()`
- [ ] Create `scheduler.gs` — `setUpTriggers()`
- [ ] Update `Code.gs` — add `onEdit()` trigger, update `doPost()`
- [ ] Verify: `doPost` always returns 200 — never throws even on error
- [ ] Verify: Reply written to replies tab with `send_status = 'draft'`
- [ ] Verify: `pauseLeadInInstantly` called on every email reply received
- [ ] Verify: `processNewReplies` sends only `send_status = 'approved'` rows
- [ ] Verify: LinkedIn replies get `send_status = 'manual_required'` automatically
- [ ] Verify: `onEdit` fires `handleLinkedInReplyEdit` when `their_reply` edited in linkedin_queue
- [ ] Verify: Hot classification triggers `sendHotLeadAlert` AND updates queue status to 'hot'
- [ ] Verify: `writeDailySummary` sends email with counts from all tabs
- [ ] Run Post-Build Checklist (see agent.md Section 17)

**Gate to DONE:** Post-build checklist complete, end-to-end test with real data passes ✓

---

## Completed Phases

_(none yet — starting Phase 1)_
