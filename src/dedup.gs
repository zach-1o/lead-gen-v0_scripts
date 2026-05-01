/**
 * dedup.gs
 *
 * Prevents duplicate contacts from being added across different sources.
 */

var _dedupCache = null;

function _buildDedupCache() {
  _dedupCache = {
    linkedin_urls: new Set(),
    emails: new Set(),
    name_company_keys: new Set()
  };
  
  var rows = getAllRows('contact_db');
  
  for (var i = 0; i < rows.length; i++) {
    var data = rows[i].data;
    
    var linkedin = String(data.contact_linkedin_url || '').trim().toLowerCase();
    if (linkedin) {
      _dedupCache.linkedin_urls.add(linkedin);
    }
    
    var email = String(data.email || '').trim().toLowerCase();
    if (email) {
      _dedupCache.emails.add(email);
    }
    
    var fullName = String(data.full_name || '').trim().toLowerCase();
    var domain = String(data.company_domain || '').trim().toLowerCase();
    if (fullName && domain) {
      _dedupCache.name_company_keys.add(fullName + '|' + domain);
    }
  }
}

function isDuplicate(mappedContactObj) {
  if (_dedupCache === null) {
    _buildDedupCache();
  }
  
  var linkedin = String(mappedContactObj.contact_linkedin_url || '').trim().toLowerCase();
  if (linkedin && _dedupCache.linkedin_urls.has(linkedin)) {
    return true;
  }
  
  var email = String(mappedContactObj.email || '').trim().toLowerCase();
  if (email && _dedupCache.emails.has(email)) {
    return true;
  }
  
  var fullName = String(mappedContactObj.full_name || '').trim().toLowerCase();
  var domain = String(mappedContactObj.company_domain || '').trim().toLowerCase();
  if (fullName && domain && _dedupCache.name_company_keys.has(fullName + '|' + domain)) {
    return true;
  }
  
  return false;
}

function registerContact(mappedContactObj) {
  if (_dedupCache === null) {
    _buildDedupCache();
  }
  
  var linkedin = String(mappedContactObj.contact_linkedin_url || '').trim().toLowerCase();
  if (linkedin) {
    _dedupCache.linkedin_urls.add(linkedin);
  }
  
  var email = String(mappedContactObj.email || '').trim().toLowerCase();
  if (email) {
    _dedupCache.emails.add(email);
  }
  
  var fullName = String(mappedContactObj.full_name || '').trim().toLowerCase();
  var domain = String(mappedContactObj.company_domain || '').trim().toLowerCase();
  if (fullName && domain) {
    _dedupCache.name_company_keys.add(fullName + '|' + domain);
  }
}

function refreshDedupCache() {
  _dedupCache = null;
  _buildDedupCache();
}

function getDedupStats() {
  if (_dedupCache === null) {
    _buildDedupCache();
  }
  return {
    linkedin_urls: _dedupCache.linkedin_urls.size,
    emails: _dedupCache.emails.size,
    name_company_keys: _dedupCache.name_company_keys.size
  };
}
