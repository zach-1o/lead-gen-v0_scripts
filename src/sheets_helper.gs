/**
 * sheets_helper.gs
 * 
 * Helper functions to access Google Sheets using column names rather than index.
 */

var _headerCache = {};

function getSheet(tabName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!sheet) throw new Error("Sheet '" + tabName + "' not found");
  return sheet;
}

function getHeaders(tabName) {
  if (_headerCache[tabName]) {
    return _headerCache[tabName];
  }
  var sheet = getSheet(tabName);
  // Get row 1
  var headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
  var headers = headersRange.getValues()[0];
  var trimmed = headers.map(function(h) { return String(h).trim(); });
  _headerCache[tabName] = trimmed;
  return trimmed;
}

function colIndex(tabName, headerName) {
  var headers = getHeaders(tabName);
  var lowerHeader = String(headerName).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === lowerHeader) {
      return i + 1; // 1-based index
    }
  }
  throw new Error('Column "' + headerName + '" not found in ' + tabName);
}

function appendRow(tabName, dataObj) {
  var sheet = getSheet(tabName);
  var headers = getHeaders(tabName);
  var rowArray = new Array(headers.length);
  for (var i = 0; i < rowArray.length; i++) {
    rowArray[i] = ''; // Fill with empty strings
  }
  
  for (var key in dataObj) {
    try {
      var idx = colIndex(tabName, key);
      rowArray[idx - 1] = dataObj[key];
    } catch (e) {
      // Ignore keys not in headers
    }
  }
  
  sheet.appendRow(rowArray);
  return sheet.getLastRow();
}

function updateRow(tabName, rowNum, dataObj) {
  var sheet = getSheet(tabName);
  for (var key in dataObj) {
    try {
      var idx = colIndex(tabName, key);
      sheet.getRange(rowNum, idx).setValue(dataObj[key]);
    } catch (e) {
      // Ignore keys not in headers
    }
  }
}

function getCell(tabName, rowNum, headerName) {
  var sheet = getSheet(tabName);
  var idx = colIndex(tabName, headerName);
  return sheet.getRange(rowNum, idx).getValue();
}

function setCell(tabName, rowNum, headerName, value) {
  var sheet = getSheet(tabName);
  var idx = colIndex(tabName, headerName);
  sheet.getRange(rowNum, idx).setValue(value);
}

function getAllRows(tabName) {
  var sheet = getSheet(tabName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only headers or empty
  
  var headers = data[0];
  var results = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var isEmpty = true;
    var rowObj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      rowObj[headers[j]] = val;
      if (val !== '' && val !== null) {
        isEmpty = false;
      }
    }
    if (!isEmpty) {
      results.push({
        rowNum: i + 1, // 1-based, including header offset
        data: rowObj
      });
    }
  }
  return results;
}

function getRowsByValue(tabName, headerName, value) {
  var rows = getAllRows(tabName);
  var results = [];
  var searchVal = String(value).trim().toLowerCase();
  
  for (var i = 0; i < rows.length; i++) {
    var cellVal = String(rows[i].data[headerName] || '').trim().toLowerCase();
    if (cellVal === searchVal) {
      results.push(rows[i]);
    }
  }
  return results;
}

function findFirstRowByValue(tabName, headerName, value) {
  var results = getRowsByValue(tabName, headerName, value);
  if (results.length > 0) {
    return results[0];
  }
  return null;
}
