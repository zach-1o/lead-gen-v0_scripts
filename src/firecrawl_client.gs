/**
 * firecrawl_client.gs
 *
 * Client for Firecrawl to extract logistics context from company websites.
 */

function scrapeAndExtractFreightContext(domain, companyName) {
  try {
    if (!domain || String(domain).indexOf('li_') === 0) {
      return {context: '', status: 'skipped'};
    }
    
    var websiteUrl = domain;
    if (websiteUrl.indexOf('http') !== 0) {
      websiteUrl = 'https://' + websiteUrl;
    }
    
    var url = 'https://api.firecrawl.dev/v1/scrape';
    var headers = {
      'Authorization': 'Bearer ' + getConfig('FIRECRAWL_API_KEY'),
      'Content-Type': 'application/json'
    };
    
    var payload = {
      url: websiteUrl,
      formats: ['markdown'],
      onlyMainContent: true
    };
    
    var options = {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    
    if (code !== 200) {
      Logger.log('Firecrawl error: ' + response.getContentText());
      return {context: '', status: 'failed'};
    }
    
    var data = JSON.parse(response.getContentText());
    if (!data || !data.data || !data.data.markdown) {
      return {context: '', status: 'failed'};
    }
    
    var markdown = String(data.data.markdown).substring(0, 3000);
    if (!markdown.trim()) {
      return {context: '', status: 'failed'};
    }
    
    var extractedText = _extractContext(markdown, companyName);
    return {context: extractedText, status: 'done'};
    
  } catch (e) {
    Logger.log('Firecrawl client error: ' + e.message);
    return {context: '', status: 'failed'};
  }
}

function _extractContext(markdown, companyName) {
  var system = 'Extract relevant logistics/freight context. Be concise. Return 2-3 sentences or exactly: none_found';
  var user = 'From this company website for ' + (companyName || 'the company') + ', extract mentions of:\n' +
             'shipping, freight, carriers, distribution, warehouses, logistics,\n' +
             'supply chain, transportation, or inventory.\n' +
             'Return 2-3 sentences of the most relevant context.\n' +
             'If nothing relevant: return exactly the string: none_found\n\n' +
             'Text: ' + markdown;
             
  try {
    var resultText = _callKimi(system, user, 150);
    var text = resultText.trim();
    if (text === 'none_found' || text === '') {
      return '';
    }
    return text;
  } catch (e) {
    return '';
  }
}
