/**
 * config.gs — Runtime Configuration Cache
 *
 * Reads the 'config' tab (key/value rows) once per script execution and caches it.
 * ALL other modules call getConfig(key) — never read the config tab directly.
 */

var _configCache = null;

function getConfig(key) {
  if (_configCache === null) {
    _loadConfig();
  }
  var value = _configCache[key];
  if (value === undefined) {
    throw new Error('Config key not found: ' + key);
  }
  return String(value).trim();
}

function _loadConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('config');
  if (!sheet) throw new Error("Sheet 'config' not found");
  
  var data = sheet.getDataRange().getValues();
  _configCache = {};
  
  // Skip row 0 (headers)
  for (var i = 1; i < data.length; i++) { 
    var row = data[i];
    var key = row[0];
    var val = row[1];
    if (key && key !== 'key') {
      _configCache[key] = val;
    }
  }
}

function getConfigNumber(key) {
  var val = getConfig(key);
  var num = Number(val);
  if (isNaN(num)) {
    throw new Error('Config value for ' + key + ' is not a valid number: ' + val);
  }
  return num;
}

function refreshConfig() {
  _configCache = null;
  _loadConfig();
}
