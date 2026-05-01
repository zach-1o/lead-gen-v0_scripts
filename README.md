# Freight Audit Outreach System

## What This Is

A semi-automated B2B lead generation engine for a freight audit AI company, built entirely in **Google Apps Script** connected to a single Google Sheet.

- **Signal ingestion:** Four paste tabs receive Apify CSV exports and manual entries
- **Qualification:** Kimi K2 ICP scores each contact 1–10 via OpenRouter
- **Email outreach:** Score 4–7 contacts auto-pushed to Instantly API
- **LinkedIn outreach:** Score 8–10 contacts queued for your manual daily sends
- **Reply handling:** Instantly webhook + onEdit trigger → Kimi drafts replies → you approve

No servers. No Docker. No deployment infrastructure. All state in Google Sheets.

---

## Quick Setup (do this once)

### 1. Google Sheet
- Create a new Google Sheet named: **Freight Audit Outreach**
- Open Extensions → Apps Script

### 2. Add all script files
Create these files in the Apps Script editor (one per file):

```
Code.gs
config.gs
sheets_helper.gs
column_maps.gs
utils.gs
dedup.gs
ingestion.gs
kimi_client.gs
firecrawl_client.gs
qualification.gs
instantly_client.gs
reply_handler.gs
notifications.gs
scheduler.gs
```

Paste the contents from the corresponding files in the `src/` folder of this repo.

### 3. Run setup
- Refresh the sheet → the **Outreach System** menu appears
- Click **Setup: Create All Sheets** → creates all 12 tabs with headers

### 4. Fill config tab
Open the `config` tab and add key-value pairs. See agent.md Section 11 for the full list.

Required minimum to start:
- `OPENROUTER_API_KEY`
- `KIMI_MODEL` = `moonshotai/kimi-k2`
- `INSTANTLY_API_KEY`
- `INSTANTLY_CAMPAIGN_ID`
- `FIRECRAWL_API_KEY`
- `NOTIFICATION_EMAIL`

### 5. Test config
Click **Test: Config Check** in the menu. All 7 values should log without errors.

### 6. Deploy as Web App (for Instantly webhook)
- Extensions → Apps Script → Deploy → New Deployment
- Type: Web App
- Execute as: **Me**
- Who has access: **Anyone**
- Copy the web app URL

### 7. Set up Instantly webhook
In your Instantly dashboard → Settings → Webhooks → add your web app URL.
Event: `reply_received`

### 8. Set up triggers
Click **Setup: Create Triggers** in the menu.
Verify 3 triggers are created in the Apps Script Triggers panel:
- `runQualification` — every 4 hours
- `processNewReplies` — every 10 minutes
- `writeDailySummary` — daily at 9am

### 9. Test the pipeline
- Paste 5 test rows into `raw_leads_finder`
- Click **Process: Leads Finder Pastes**
- Verify rows appear in `contact_db`
- Click **Run: Qualification Now**
- Verify rows appear in `linkedin_queue` or `email_queue`

---

## Daily Operating Workflow

See `agent.md` Section 18 for the full weekly rhythm.

**Every morning (~20 min):**
1. Open `linkedin_queue` → filter `conversation_stage = not_sent` → send 20 connection requests
2. Check accepted connections → send DM by copying `suggested_dm`
3. Open `replies` → approve email drafts → manually send LinkedIn drafts

---

## External Dependencies

| Service | What it does | Free tier? |
|---------|-------------|-----------|
| [OpenRouter](https://openrouter.ai) | Routes to Kimi K2 | Pay-per-token |
| [Firecrawl](https://firecrawl.dev) | Website scraping for enrichment | 500 pages/mo free |
| [Instantly](https://instantly.ai) | Email sequence automation | Paid |
| [Apify](https://apify.com) | Lead scrapers (Leads Finder, LinkedIn Jobs, Employees) | Paid actors |

---

## File Reference

| File | Description |
|------|-------------|
| `agent.md` | Operating manual — read every session |
| `implementation.md` | Phase-by-phase build instructions — source of truth |
| `project_structure.md` | Living changelog — update after every session |
| `tasks/todo.md` | Current phase + remaining checklist |
| `tasks/lessons.md` | Captured mistakes as rules |
| `src/*.gs` | Local reference copies of all Apps Script files |
