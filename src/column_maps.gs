/**
 * column_maps.gs
 * 
 * Maps Apify columns to internal sheet columns.
 */

// Apify Leads Finder column -> contact_db column
var LEADS_FINDER_MAP = {
  'first_name':                    'first_name',
  'last_name':                     'last_name',
  'full_name':                     'full_name',
  'job_title':                     'job_title',
  'headline':                      'headline',
  'seniority_level':               'seniority_level',
  'email':                         'email',
  'linkedin':                      'contact_linkedin_url',
  'city':                          'contact_city',
  'country':                       'contact_country',
  'company_name':                  'company_name',
  'company_domain':                'company_domain',
  'company_linkedin':              'company_linkedin_url',
  'company_size':                  'company_size',
  'industry':                      'industry',
  'company_description':           'company_description',
  'company_annual_revenue_clean':  'company_annual_revenue_clean'
};

// Apify LinkedIn Company Employees column -> contact_db column
var EMPLOYEES_MAP = {
  'firstName':    'first_name',
  'lastName':     'last_name',
  'linkedinUrl':  'contact_linkedin_url',
  'headline':     'headline'
};

function mapLeadsFinderRow(apifyRow) {
  var mapped = {};
  for (var key in LEADS_FINDER_MAP) {
    if (apifyRow.hasOwnProperty(key)) {
      mapped[LEADS_FINDER_MAP[key]] = apifyRow[key];
    }
  }
  
  // Deduplication key
  var dedup_key = '';
  if (mapped.contact_linkedin_url) {
    dedup_key = mapped.contact_linkedin_url;
  } else if (mapped.email) {
    dedup_key = mapped.email;
  } else if (mapped.full_name && mapped.company_domain) {
    dedup_key = mapped.full_name + '|' + mapped.company_domain;
  }
  mapped.dedup_key = dedup_key;
  
  mapped.source = 'leads_finder';
  mapped.signal_type = 'icp_match';
  mapped.signal_title = (mapped.job_title || 'Unknown') + ' at ' + (mapped.company_name || 'Unknown');
  mapped.signal_detail = mapped.company_description ? String(mapped.company_description).substring(0, 300) : '';
  
  return mapped;
}

function mapEmployeesRow(apifyRow, signalType, signalTitle, signalDetail) {
  var mapped = {};
  for (var key in EMPLOYEES_MAP) {
    if (apifyRow.hasOwnProperty(key)) {
      mapped[EMPLOYEES_MAP[key]] = apifyRow[key];
    }
  }
  
  // Handle 'location' JSON
  var contact_country = '';
  var contact_city = '';
  if (apifyRow.location) {
    try {
      var locObj = typeof apifyRow.location === 'string' ? JSON.parse(apifyRow.location) : apifyRow.location;
      if (locObj && locObj.parsed) {
        contact_country = locObj.parsed.country || '';
        contact_city = locObj.parsed.city || '';
      }
    } catch (e) {
      contact_country = String(apifyRow.location);
    }
  }
  mapped.contact_country = contact_country;
  mapped.contact_city = contact_city;
  
  // Handle 'currentPosition' JSON
  var company_name = '';
  if (apifyRow.currentPosition) {
    try {
      var posArray = typeof apifyRow.currentPosition === 'string' ? JSON.parse(apifyRow.currentPosition) : apifyRow.currentPosition;
      if (Array.isArray(posArray) && posArray.length > 0 && posArray[0].companyName) {
        company_name = posArray[0].companyName;
      }
    } catch (e) {
      // Ignore parse failure
    }
  }
  if (!mapped.company_name && company_name) {
    mapped.company_name = company_name;
  }
  
  if (apifyRow.firstName && apifyRow.lastName) {
    mapped.full_name = String(apifyRow.firstName).trim() + ' ' + String(apifyRow.lastName).trim();
  }
  
  mapped.source = signalType;
  mapped.signal_type = signalType;
  mapped.signal_title = signalTitle;
  mapped.signal_detail = signalDetail;
  
  // Deduplication key
  var dedup_key = '';
  if (mapped.contact_linkedin_url) {
    dedup_key = mapped.contact_linkedin_url;
  } else if (mapped.full_name && mapped.company_name) {
    dedup_key = mapped.full_name + '|' + mapped.company_name;
  }
  mapped.dedup_key = dedup_key;
  
  return mapped;
}
