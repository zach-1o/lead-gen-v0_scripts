/**
 * kimi_client.gs
 *
 * Client for OpenRouter (Kimi model) for AI scoring, hook generation, and reply drafting.
 */

function _callKimi(systemPrompt, userPrompt, maxTokens) {
  var url = 'https://openrouter.ai/api/v1/chat/completions';
  var headers = {
    'Authorization': 'Bearer ' + getConfig('OPENROUTER_API_KEY'),
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://freightaudit.com'
  };
  
  var payload = {
    model: getConfig('KIMI_MODEL'),
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ],
    max_tokens: maxTokens,
    temperature: 0.3
  };
  
  var options = {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  
  if (code === 429) {
    Logger.log('Kimi rate limited');
    throw new Error('RATE_LIMITED');
  }
  
  if (code !== 200) {
    Logger.log('Kimi API error: ' + response.getContentText());
    throw new Error('KIMI_API_ERROR_' + code);
  }
  
  var data = JSON.parse(response.getContentText());
  return data.choices[0].message.content.trim();
}

function scoreLeadICP(contactObj, companyObj, firecrawlContext) {
  var system = 'You are an expert ICP scorer. Return valid JSON only. No markdown.';
  
  var user = "You are an ICP scorer for a freight audit AI company.\n" +
  "We recover carrier invoice overcharges for US mid-market companies.\n" +
  "Charge model: 20-30% of recovered overcharges. Zero cost if nothing found.\n\n" +
  "Ideal customer profile:\n" +
  "- Industries: logistics, supply chain, 3PL, transportation, freight,\n" +
  "  manufacturing with significant freight operations, wholesale distribution,\n" +
  "  food and beverage distribution, industrial goods distribution\n" +
  "- Company size: 50-2000 employees\n" +
  "- Annual revenue: $10M-$200M\n" +
  "- Location: " + getConfig('TARGET_LOCATIONS') + "\n" +
  "- Best contact titles: VP Supply Chain, Director Logistics, CFO, COO,\n" +
  "  Director Operations, Head of Transportation, Logistics Manager,\n" +
  "  Transportation Manager, VP Operations, Director Supply Chain\n\n" +
  "Scoring guide:\n" +
  "10 = Perfect fit. Logistics/freight industry, right size, senior logistics title,\n" +
  "     strong direct signal (hiring freight auditor, posted freight audit RFP)\n" +
  "8-9 = Strong fit. Right industry and revenue, good title, moderate signal\n" +
  "6-7 = Decent fit. Right industry but size mismatch, or adjacent title (VP Finance at distributor)\n" +
  "4-5 = Weak fit. Adjacent industry (manufacturing but minimal freight context)\n" +
  "1-3 = Poor fit. Wrong industry, too small/large, logistics not significant\n\n" +
  "Contact data:\n" +
  "Name: " + (contactObj.full_name || 'not available') + "\n" +
  "Title: " + (contactObj.job_title || 'not available') + "\n" +
  "Seniority: " + (contactObj.seniority_level || 'not available') + "\n" +
  "Location: " + (contactObj.contact_city || 'not available') + ", " + (contactObj.contact_country || 'not available') + "\n\n" +
  "Company data:\n" +
  "Company: " + (companyObj.company_name || 'not available') + "\n" +
  "Industry: " + (companyObj.industry || 'not available') + "\n" +
  "Size: " + (companyObj.company_size || 'not available') + " employees\n" +
  "Revenue: " + (companyObj.company_annual_revenue_clean || 'not available') + "\n" +
  "Description: " + (companyObj.company_description || 'not available') + "\n" +
  "Website context: " + (firecrawlContext || 'not available') + "\n\n" +
  "Signal that found this contact:\n" +
  "Type: " + (companyObj.signal_type || 'not available') + "\n" +
  "Detail: " + (companyObj.signal_detail || 'not available') + "\n\n" +
  "Return valid JSON only. No markdown. No text outside the JSON.\n" +
  "{\n" +
  "  \"score\": <integer 1-10>,\n" +
  "  \"score_reasons\": \"<2-3 sentences explaining score>\",\n" +
  "  \"freight_spend_estimate\": \"<e.g. $2M-$5M annually>\",\n" +
  "  \"channel\": \"<'linkedin' if score >= 8, 'email' if score 4-7, 'skip' if <= 3>\"\n" +
  "}";
  
  var defaultVal = {
    score: 0,
    score_reasons: 'parse error',
    freight_spend_estimate: 'unknown',
    channel: 'skip'
  };
  
  try {
    var resultText = _callKimi(system, user, 400);
    var parsed = safeJsonParse(resultText, defaultVal);
    
    var score = Number(parsed.score);
    if (isNaN(score) || score < 1 || score > 10 || 
        (parsed.channel !== 'linkedin' && parsed.channel !== 'email' && parsed.channel !== 'skip')) {
      parsed.score = 0;
      parsed.channel = 'skip';
      parsed.score_reasons = (parsed.score_reasons || '') + ' [validation error]';
    }
    
    return parsed;
  } catch(e) {
    if (e.message === 'RATE_LIMITED') {
      throw e;
    }
    return defaultVal;
  }
}

function generateHook(contactObj, companyObj, firecrawlContext) {
  var system = 'Write one opening line for cold outreach. Return only the sentence.';
  
  var user = "Write the opening line of a cold outreach message for a freight audit AI company.\n" +
  "We recover carrier invoice overcharges. Charge % of savings — zero if nothing found.\n\n" +
  "ONE sentence only (max 20 words):\n" +
  "- References something specific about this contact, company, or the signal\n" +
  "- Does NOT mention our product\n" +
  "- Sounds like a peer wrote it, not a sales template\n" +
  "- Creates relevance, not flattery\n\n" +
  "Context:\n" +
  "Contact: " + (contactObj.full_name || '') + ", " + (contactObj.job_title || '') + " at " + (companyObj.company_name || '') + "\n" +
  "Industry: " + (companyObj.industry || '') + "\n" +
  "Revenue: " + (companyObj.company_annual_revenue_clean || '') + "\n" +
  "Signal type: " + (companyObj.signal_type || '') + "\n" +
  "Signal detail: " + (companyObj.signal_detail || '') + "\n" +
  "Company description: " + (companyObj.company_description || '') + "\n" +
  "Website context: " + (firecrawlContext || '') + "\n\n" +
  "Strong examples:\n" +
  "- \"Noticed {company_name} is hiring a freight audit specialist — the role caught my attention.\"\n" +
  "- \"Saw {company_name} recently issued an RFP for transportation audit services.\"\n" +
  "- \"With {company_name}'s distribution scale, multi-carrier invoice reconciliation tends to be a significant ongoing challenge.\"\n\n" +
  "Return only the hook sentence. No quotes. No explanation.";
  
  try {
    var resultText = _callKimi(system, user, 80);
    var hook = resultText.trim();
    if (hook.charAt(0) === '"' && hook.charAt(hook.length - 1) === '"') {
      hook = hook.substring(1, hook.length - 1);
    }
    if (!hook) throw new Error("Empty hook");
    return hook;
  } catch (e) {
    if (e.message === 'RATE_LIMITED') {
      throw e;
    }
    return 'Noticed ' + (companyObj.company_name || 'your company') + ' in the ' + (companyObj.industry || 'logistics') + ' space';
  }
}

function generateSuggestedDm(contactObj, companyObj, hook) {
  var system = 'Write a short LinkedIn DM. Return only the DM text.';
  
  var user = "Write a short LinkedIn DM (3 sentences max) for a freight audit AI company\n" +
  "reaching out to a logistics decision maker.\n\n" +
  "Rules:\n" +
  "- If signal_type is 'linkedin_job': reference the job posting naturally in sentence 1\n" +
  "- If signal_type is 'sam_gov': reference the RFP they posted\n" +
  "- If signal_type is 'rss_news': reference the news/event briefly\n" +
  "- If signal_type is 'icp_match': open with a genuine industry question\n" +
  "- Sentence 2: transition — ask one question about their current audit process\n" +
  "- Sentence 3: offer the free audit as a low-friction next step\n" +
  "- Sound like a peer, not a salesperson\n\n" +
  "Contact: " + (contactObj.full_name ? contactObj.full_name.split(' ')[0] : 'there') + ", " + (contactObj.job_title || '') + " at " + (companyObj.company_name || '') + "\n" +
  "Signal type: " + (companyObj.signal_type || '') + "\n" +
  "Signal detail: " + (companyObj.signal_detail || '') + "\n" +
  "Hook already generated: " + (hook || '') + "\n\n" +
  "Return only the DM text. No subject line.";
  
  try {
    return _callKimi(system, user, 150);
  } catch (e) {
    if (e.message === 'RATE_LIMITED') {
      throw e;
    }
    return (hook || 'Hi') + ' — curious how your team currently handles freight invoice auditing?';
  }
}

function draftReply(replyContext) {
  var system = 'Draft B2B sales reply. Return valid JSON only.';
  
  var user = "You handle B2B sales replies for a freight audit AI company.\n" +
  "Free offer: 30-day audit on carrier invoices. Charge % of savings — zero if nothing.\n\n" +
  "Contact: " + (replyContext.full_name || '') + ", " + (replyContext.job_title || '') + " at " + (replyContext.company_name || '') + "\n" +
  "Freight spend estimate: " + (replyContext.freight_spend_estimate || '') + "\n" +
  "Opening hook used: " + (replyContext.personalization_hook || '') + "\n\n" +
  "Conversation so far:\n" +
  (replyContext.conversation_history || 'none') + "\n\n" +
  "Their latest message:\n" +
  (replyContext.their_message || '') + "\n\n" +
  "Write a reply that:\n" +
  "- Directly responds to what they said\n" +
  "- Moves toward a 20-min call or starting the free audit\n" +
  "- Is warm and human — not scripted\n" +
  "- Is 3-5 sentences maximum\n" +
  "- Pricing questions: explain shared savings in one sentence, offer free audit\n" +
  "- Hesitant: lean on zero-risk free audit offer\n" +
  "- Technical questions: answer briefly, suggest a call for details\n\n" +
  "Classify intent:\n" +
  "hot     = pricing ask, demo request, yes to call, wants to schedule\n" +
  "warm    = interested, asking questions, wants more info\n" +
  "neutral = polite, noncommittal\n" +
  "cold    = not interested, wrong person\n\n" +
  "Return valid JSON only. No markdown.\n" +
  "{\n" +
  "  \"draft_reply\": \"<reply text>\",\n" +
  "  \"intent_classification\": \"<hot|warm|neutral|cold>\",\n" +
  "  \"recommended_action\": \"<book_call|send_audit_offer|follow_up_7_days|close_thread>\"\n" +
  "}";
  
  var defaultVal = {
    draft_reply: 'Thanks for your reply — would a quick 20-minute call work?',
    intent_classification: 'warm',
    recommended_action: 'book_call'
  };
  
  try {
    var resultText = _callKimi(system, user, 500);
    return safeJsonParse(resultText, defaultVal);
  } catch (e) {
    if (e.message === 'RATE_LIMITED') {
      throw e;
    }
    return defaultVal;
  }
}
