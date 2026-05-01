/**
 * notifications.gs — Alerts and Daily Summary
 *
 * Functions:
 *   sendHotLeadAlert(contactData, replyText, kimiResult, channel)
 *     → Sends GmailApp email to NOTIFICATION_EMAIL config value
 *     → Subject: '🔥 Hot Lead: {company_name} ({channel})'
 *     → Body: contact details, their message, AI recommended action
 *     → Triggered when intent_classification = 'hot' in any reply handler
 *
 *   writeDailySummary()
 *     → Counts rows by status across all tabs
 *     → Logs summary string
 *     → Sends GmailApp email with daily pipeline counts
 *     → Triggered at 9am daily via Apps Script trigger
 *
 * Phase 6 build prompt: implementation.md → Phase 6 → "Create notifications.gs"
 */

// ============================================================
// PHASE 6 — TO BE IMPLEMENTED
// ============================================================
