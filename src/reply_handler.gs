/**
 * reply_handler.gs — Inbound Reply Processing
 *
 * Handles replies from two channels:
 *   1. Email: Instantly fires a webhook → doPost → handleInstantlyWebhook()
 *   2. LinkedIn: You paste reply into linkedin_queue.their_reply → onEdit → handleLinkedInReplyEdit()
 *
 * Both paths:
 *   - Build conversation history from replies tab (sent rows only)
 *   - Call draftReply() → Kimi classifies intent + drafts reply
 *   - Write draft row to replies tab with send_status = 'draft'
 *   - If intent = 'hot': update queue stage + sendHotLeadAlert()
 *
 * Email-specific:
 *   - ALWAYS calls pauseLeadInInstantly() on every email reply
 *   - Updates email_queue: reply_received='yes', reply_date, reply_preview, stage
 *
 * LinkedIn-specific:
 *   - Sets send_status = 'draft' (you copy and send manually)
 *   - processNewReplies() sets 'manual_required' for channel=linkedin approved rows
 *
 * Functions:
 *   handleInstantlyWebhook(payload)       → Email reply path (called from doPost)
 *   handleLinkedInReplyEdit(editedRow, replyText) → LinkedIn reply path (called from onEdit)
 *   processNewReplies()                   → Send loop: sends approved=email, marks linkedin=manual_required
 *
 * Phase 6 build prompt: implementation.md → Phase 6 → "Create reply_handler.gs"
 */

// ============================================================
// PHASE 6 — TO BE IMPLEMENTED
// ============================================================
