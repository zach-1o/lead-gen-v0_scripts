# project_structure.md — Living Changelog

Update this file at the end of every session. One entry per session.

---

## 2026-04-30 — Initial scaffold

**Phase completed:** Pre-phase — project structure created

**What changed:**
- Created `agent.md` — full operating manual tailored to this Google Apps Script project
- Created `project_structure.md` (this file)
- Created `README.md` — setup guide
- Created `tasks/todo.md` — phase tracker
- Created `tasks/lessons.md` — empty, ready to capture mistakes
- Created all `src/` stub files for each `.gs` module:
  - `Code.gs`, `config.gs`, `sheets_helper.gs`, `column_maps.gs`, `utils.gs`
  - `dedup.gs`, `ingestion.gs`, `kimi_client.gs`, `firecrawl_client.gs`
  - `qualification.gs`, `instantly_client.gs`, `reply_handler.gs`
  - `notifications.gs`, `scheduler.gs`

**Files created or modified:**
- `agent.md` [CREATED]
- `project_structure.md` [CREATED]
- `README.md` [CREATED]
- `tasks/todo.md` [CREATED]
- `tasks/lessons.md` [CREATED]
- `src/Code.gs` [CREATED — stub]
- `src/config.gs` [CREATED — stub]
- `src/sheets_helper.gs` [CREATED — stub]
- `src/column_maps.gs` [CREATED — stub]
- `src/utils.gs` [CREATED — stub]
- `src/dedup.gs` [CREATED — stub]
- `src/ingestion.gs` [CREATED — stub]
- `src/kimi_client.gs` [CREATED — stub]
- `src/firecrawl_client.gs` [CREATED — stub]
- `src/qualification.gs` [CREATED — stub]
- `src/instantly_client.gs` [CREATED — stub]
- `src/reply_handler.gs` [CREATED — stub]
- `src/notifications.gs` [CREATED — stub]
- `src/scheduler.gs` [CREATED — stub]

**Watch out for:**
- `implementation.md` is the SOURCE OF TRUTH for all phase prompts — never deviate from it
- Column name mapping is the #1 silent failure source — see agent.md Section 5
- All 14 `src/*.gs` files are local reference copies — actual running code is in Apps Script editor

**Next session starts at:**
- Phase 1: Sheet Setup + Config + Sheet Helpers
- Open `tasks/todo.md` for the checklist
- Paste the Phase 1 prompt from `implementation.md` into the Apps Script editor

---
