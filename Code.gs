// =================================================================
//                    CONFIGURATION
// =================================================================
// IMPORTANT: Fill in your Spreadsheet ID and Google Drive Root Folder ID.

// The ID of the Google Sheets spreadsheet used as the database.
const SPREADSHEET_ID = "18Ydr-fAVQduyxRKT_mwn9x2YaoxTqA_mLvVavFkMix8"; 

// The ID of the root folder in Google Drive where car washing/care media will be saved.
// Subfolders will automatically be created inside this folder for each Car Registration Number.
const ROOT_FOLDER_ID = "13KP2Pnsc2zHxAjUt7WNyTDlDWLDIouQx";
const DRIVE_FOLDER_ID = ROOT_FOLDER_ID; // Alias for compatibility with standalone scripts

// --- Website Lead Sync Configuration ---
const WEBSITE_SHEET_ID = "14zDpoeSGXNk6s0vra9Y5NwrrNdfhSYWxCvLwT-DdW2Tg";
const WEBSITE_ORDERS_SHEET_NAME = "Orders";
const WEBSITE_USERS_SHEET_NAME = "Users"; 
const WEBSITE_COLUMN_MAPPING = {
  id: 'orderId',
  name: 'userName',
  phone: 'userId',
  service: 'itemsJson',
  timestamp: 'orderDate'
};

// A list of all sheets the application will use.
const SHEET_NAMES = [
  'Submissions', 'TyreDetails', 'BatteryDetails', 'CustomServices', 
  'CategorizedAddons', 'PredefinedAddonQuantities', 'CustomFieldData', 
  'Users', 'Settings', 'SubscriptionPlans', 'UserSubscriptions', 'PredefinedAddons',
  'ServiceTemplates', 'ServiceTemplateFields', 'ServiceRequests', 'Notifications',
  'LocationHistory', 'MiscSpends', 'Bookkeeping', 'VehicleData', 'TyreData',
  'PredefinedServiceCategories', 'PredefinedServices', 'DeliveryHubs', 'ProductRules',
  'Customers', 'Expenses', 'PredefinedCosts', 'PricingConfig', 'ProfitLoss', 
  'RecurringExpenses', 'SpendCategories', 'BusinessOverheads', 'InventoryItems',
  'InventoryMovements', 'AuditLogs', 'Warranties', 'MediaManifest'
];

// =================================================================
//                  MAIN ROUTER FUNCTIONS (doGet, doPost)
// =================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sync Tools')
    .addItem('Sync Website Leads', 'syncWebsiteRequests')
    .addItem('Sync Drive Files to Sheet', 'syncDriveFilesToSheet')
    .addToUi();
}

function doGet(e) {
  try {
    if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") {
        throw new Error("SPREADSHEET_ID is not configured in the script.");
    }
    const action = e.parameter ? e.parameter.action : null;
    const since = e.parameter ? (e.parameter.since || e.parameter.lastModified || e.parameter.lastSyncedAt) : null;
    if (action === 'loadAllData') {
      const data = loadAllData(since);
      return createJsonResponse({ status: 'success', data: data, isDelta: !!since, serverTime: new Date().toISOString() });
    }
    if (action === 'loadPageData') {
      const sheetsParam = e.parameter.sheets;
      if (!sheetsParam) {
        throw new Error("Missing 'sheets' parameter for loadPageData action.");
      }
      const requestedSheets = sheetsParam.split(',').map(function(s) { return s.trim(); });
      const data = loadSpecificSheets(requestedSheets, since);
      return createJsonResponse({ status: 'success', data: data, isDelta: !!since, serverTime: new Date().toISOString() });
    }
    return createJsonResponse({ status: 'success', message: 'Google Apps Script Service Active.' });
  } catch (error) {
    Logger.log('doGet Error: ' + error.message);
    return createJsonResponse({ status: 'error', message: error.message, stack: error.stack });
  }
}

function doPost(e) {
  let response;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No POST payload received.");
    }

    const requestData = JSON.parse(e.postData.contents);
    const since = requestData.since || requestData.lastModified || requestData.lastSyncedAt || (e.parameter ? e.parameter.since : null);
    
    // Check if payload is a file upload request
    if (requestData.filename && requestData.base64) {
      const targetFolderId = ROOT_FOLDER_ID || DRIVE_FOLDER_ID;
      if (!targetFolderId || targetFolderId === "YOUR_ROOT_FOLDER_ID_HERE" || targetFolderId === "YOUR_FOLDER_ID_HERE") {
        throw new Error("CRITICAL: DRIVE_FOLDER_ID / ROOT_FOLDER_ID is not configured in the script.");
      }
      response = handleFileUpload(requestData);
    } 
    else if (requestData.action === 'upsertRecord') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      handleUpsertRecord(requestData.sheetName, requestData.record, requestData.idField);
      response = { status: 'success', message: `Record upserted in ${requestData.sheetName}.`, last_modified: requestData.record.last_modified };
    }
    else if (requestData.action === 'deleteRecord') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      handleDeleteRecord(requestData.sheetName, requestData.recordId, requestData.idField);
      response = { status: 'success', message: `Record deleted from ${requestData.sheetName}.` };
    }
    else if (requestData.action === 'loadAllData') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      const data = loadAllData(since);
      response = { status: 'success', data: data, isDelta: !!since, serverTime: new Date().toISOString() };
    }
    else if (requestData.action === 'loadPageData') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      const sheetsParam = requestData.sheets;
      if (!sheetsParam) throw new Error("Missing 'sheets' parameter for loadPageData action.");
      const requestedSheets = typeof sheetsParam === 'string' ? sheetsParam.split(',').map(function(s) { return s.trim(); }) : sheetsParam;
      const data = loadSpecificSheets(requestedSheets, since);
      response = { status: 'success', data: data, isDelta: !!since, serverTime: new Date().toISOString() };
    }
    else {
      throw new Error("Invalid POST action or payload specified.");
    }
    
  } catch (error) {
    Logger.log('doPost Error: ' + error.message + (error.stack ? ' Stack: ' + error.stack : ''));
    response = { status: 'error', message: 'Failed to process request: ' + error.message };
  }
  return createJsonResponse(response);
}

// =================================================================
//            ENHANCED MEDIA UPLOAD & FOLDER LOGIC
// =================================================================

/**
 * Handles uploading pictures & videos into Google Drive folders named after Car Registration Numbers.
 */
function handleFileUpload(data) {
  const filename = data.filename || `upload_${Date.now()}`;
  let rawBase64 = data.base64 || "";
  
  // Extract Car Registration Number (Subfolder Name)
  const rawCarNo = data.subFolderName || data.carNumber || data.vehicleNumber || data.carNo || data.folderName || "Uncategorized_Vehicles";
  // Clean up car number for path safety (uppercase, replace slashes/colons)
  const carFolder = rawCarNo.toString().trim().toUpperCase().replace(/[\/\\:*?"<>|]/g, "_");

  if (!rawBase64) {
    throw new Error("No base64 file data supplied in payload.");
  }

  // 1. Parse base64 header and extract MIME type safely
  let mimeType = data.mimeType || "";
  let base64Data = rawBase64;

  if (rawBase64.indexOf(",") !== -1) {
    const parts = rawBase64.split(",");
    const headerMatch = parts[0].match(/:(.*?);/);
    if (headerMatch && headerMatch[1]) {
      mimeType = headerMatch[1];
    }
    base64Data = parts[1];
  }

  // Fallback MIME Type detection by extension for pictures & videos
  if (!mimeType || mimeType === "application/octet-stream") {
    const extMatch = filename.match(/\.([0-9a-z]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'heic': 'image/heic',
      'heif': 'image/heif',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      '3gp': 'video/3gpp',
      'webm': 'video/webm',
      'avi': 'video/x-msvideo',
      'm4v': 'video/x-m4v'
    };
    mimeType = mimeMap[ext] || 'application/octet-stream';
  }

  // 2. Locate Root Drive Folder
  const rootFolderId = ROOT_FOLDER_ID || DRIVE_FOLDER_ID;
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  if (!rootFolder) {
    throw new Error(`Google Drive root folder ID "${rootFolderId}" not found or permission denied.`);
  }

  // 3. Find or Create Car Registration Subfolder
  let subFolder;
  const existingFolders = rootFolder.getFoldersByName(carFolder);
  if (existingFolders.hasNext()) {
    subFolder = existingFolders.next();
  } else {
    subFolder = rootFolder.createFolder(carFolder);
  }

  // 4. Decode base64 and create file
  const decodedData = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decodedData, mimeType, filename);
  const file = subFolder.createFile(blob);

  // 5. Grant public view access via direct link
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (sharingErr) {
    Logger.log("Warning setting public share link: " + sharingErr.message);
  }

  const fileUrl = file.getUrl();

  // 6. Optional: Log to MediaManifest in Spreadsheet
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE") {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      let sheet = ss.getSheetByName("MediaManifest");
      if (!sheet) {
        sheet = ss.insertSheet("MediaManifest");
        sheet.appendRow(["Car Number", "File Name", "File URL", "MIME Type", "Date Uploaded"]);
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([carFolder, file.getName(), fileUrl, mimeType, new Date().toISOString()]);
    }
  } catch (sheetErr) {
    Logger.log("Non-blocking manifest sheet error: " + sheetErr.message);
  }

  return {
    status: 'success',
    url: fileUrl,
    name: file.getName(),
    fileId: file.getId(),
    carFolder: carFolder,
    mimeType: mimeType
  };
}

// =================================================================
//                  CORE DATA HANDLING LOGIC
// =================================================================

function handleUpsertRecord(sheetName, record, idField) {
  if (!sheetName) throw new Error("Sheet name was not provided to handleUpsertRecord.");
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    SpreadsheetApp.flush();
  }
  
  const recordId = record[idField];
  if (!recordId) throw new Error(`Record is missing the required ID field: "${idField}" for sheet "${sheetName}".`);

  // Ensure last_modified timestamp is tracked on all entities
  if (!record.last_modified) {
    record.last_modified = new Date().toISOString();
  }

  const headers = getHeaders(sheet);
  let idColIndex = headers.indexOf(idField);
  
  if (idColIndex === -1 && headers.length > 0) {
      sheet.getRange(1, headers.length + 1).setValue(idField);
      headers.push(idField);
      idColIndex = headers.length - 1;
  } else if (headers.length === 0) {
      sheet.getRange(1, 1).setValue(idField);
      headers.push(idField);
      idColIndex = 0;
  }
  
  const allIds = (sheet.getLastRow() > 1) ? sheet.getRange(2, idColIndex + 1, sheet.getLastRow() - 1, 1).getValues().flat() : [];
  const rowIndex = allIds.indexOf(recordId);

  const newHeaders = Object.keys(record);
  const updatedHeaders = addMissingHeaders(sheet, headers, newHeaders);
  
  const rowValues = updatedHeaders.map(header => {
      const value = record[header];
      if (value === undefined || value === null) return "";
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
  });

  if (rowIndex !== -1) {
    sheet.getRange(rowIndex + 2, 1, 1, updatedHeaders.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function handleDeleteRecord(sheetName, recordId, idField) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;

  const headers = getHeaders(sheet);
  const idColIndex = headers.indexOf(idField);
  if (idColIndex === -1) return;

  const allIds = sheet.getRange(2, idColIndex + 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const rowIndex = allIds.indexOf(recordId);

  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex + 2);
  }
}

/**
 * Checks if a record was modified at or after sinceMs.
 */
function isRecordNewerThan(record, sinceMs) {
  if (!sinceMs || isNaN(sinceMs)) return true;
  const timeFields = ['last_modified', 'updatedAt', 'timestamp', 'requestDate', 'createdTime', 'syncedAt', 'lastLocationUpdate', 'date'];
  for (let i = 0; i < timeFields.length; i++) {
    const val = record[timeFields[i]];
    if (val) {
      const t = new Date(val).getTime();
      if (!isNaN(t) && t >= sinceMs) {
        return true;
      }
    }
  }
  return false;
}

function loadAllData(sinceTimestamp) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const allData = {};
  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : null;
  const filterByTime = sinceMs !== null && !isNaN(sinceMs) && sinceMs > 0;
  
  SHEET_NAMES.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
    }
    
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() < 2) {
        allData[sheetName] = [];
        return;
    }
    
    const values = dataRange.getValues();
    const headers = values.shift();
    let records = values.map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (index < row.length) ? row[index] : "";
      });
      return record;
    });

    if (filterByTime) {
      records = records.filter(function(r) { return isRecordNewerThan(r, sinceMs); });
    }

    allData[sheetName] = records;
  });

  return allData;
}

function loadSpecificSheets(requestedSheets, sinceTimestamp) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const allData = {};
  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : null;
  const filterByTime = sinceMs !== null && !isNaN(sinceMs) && sinceMs > 0;
  
  requestedSheets.forEach(sheetName => {
    if (SHEET_NAMES.indexOf(sheetName) === -1) {
      return;
    }

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
    }
    
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() < 2) {
        allData[sheetName] = [];
        return;
    }
    
    const values = dataRange.getValues();
    const headers = values.shift();
    let records = values.map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (index < row.length) ? row[index] : "";
      });
      return record;
    });

    if (filterByTime) {
      records = records.filter(function(r) { return isRecordNewerThan(r, sinceMs); });
    }

    allData[sheetName] = records;
  });

  return allData;
}

// =================================================================
//                     WEBSITE SYNC LOGIC
// =================================================================

function getSheetDataAsObjects(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return data.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

function syncWebsiteRequests() {
  try {
    const adminSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const serviceRequestsSheet = adminSpreadsheet.getSheetByName('ServiceRequests');
    if (!serviceRequestsSheet) throw new Error("ServiceRequests sheet not found in admin app.");

    const existingRequestIds = serviceRequestsSheet.getLastRow() > 1 
      ? new Set(serviceRequestsSheet.getRange(2, 1, serviceRequestsSheet.getLastRow() - 1, 1).getValues().flat()) 
      : new Set();

    const websiteSpreadsheet = SpreadsheetApp.openById(WEBSITE_SHEET_ID);
    const ordersSheet = websiteSpreadsheet.getSheetByName(WEBSITE_ORDERS_SHEET_NAME);
    if (!ordersSheet) throw new Error("Website Orders sheet not found.");
    
    const ordersData = getSheetDataAsObjects(ordersSheet);
    const newRequests = [];

    ordersData.forEach(order => {
      const orderId = `web_${order[WEBSITE_COLUMN_MAPPING.id]}`;
      if (!existingRequestIds.has(orderId)) {
        let serviceName = 'Unknown Service';
        try {
          const items = JSON.parse(order[WEBSITE_COLUMN_MAPPING.service]);
          if (Array.isArray(items) && items.length > 0) {
            serviceName = items.map(item => item.name).join(', ');
          }
        } catch(e) {/* Ignore parse error, use default */}

        newRequests.push([
          orderId,
          order[WEBSITE_COLUMN_MAPPING.name] || 'N/A',
          order[WEBSITE_COLUMN_MAPPING.phone] || 'N/A',
          serviceName,
          order[WEBSITE_COLUMN_MAPPING.timestamp] ? new Date(order[WEBSITE_COLUMN_MAPPING.timestamp]).toISOString() : new Date().toISOString(),
          'Website',
          'New'
        ]);
      }
    });

    if (newRequests.length > 0) {
      if (serviceRequestsSheet.getLastRow() === 0) {
        serviceRequestsSheet.appendRow(['id', 'customerName', 'customerPhone', 'requestedService', 'requestDate', 'source', 'status']);
      }
      serviceRequestsSheet.getRange(serviceRequestsSheet.getLastRow() + 1, 1, newRequests.length, newRequests[0].length).setValues(newRequests);
      Logger.log(`Synced ${newRequests.length} new service requests from website.`);
    } else {
      Logger.log("No new service requests from website to sync.");
    }
  } catch (err) {
    Logger.log("Error during website sync: " + err.message);
  }
}

// =================================================================
//                     UTILITY & HELPER FUNCTIONS
// =================================================================

function getHeaders(sheet) {
  if (sheet.getLastRow() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn() > 0 ? sheet.getLastColumn() : 1).getValues()[0];
}

function addMissingHeaders(sheet, currentHeaders, newHeaders) {
    const updatedHeaders = [...currentHeaders];
    newHeaders.forEach(header => {
        if (!currentHeaders.includes(header)) {
            const newCol = updatedHeaders.length + 1;
            sheet.getRange(1, newCol).setValue(header);
            updatedHeaders.push(header);
        }
    });
    return updatedHeaders;
}

function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}

function syncDriveFilesToSheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE" || !ROOT_FOLDER_ID || ROOT_FOLDER_ID === "YOUR_ROOT_FOLDER_ID_HERE") {
    SpreadsheetApp.getUi().alert("Setup Required", "SPREADSHEET_ID or ROOT_FOLDER_ID has not been set in the script.", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const manifestSheetName = "MediaManifest";
  let sheet = ss.getSheetByName(manifestSheetName) || ss.insertSheet(manifestSheetName);

  sheet.clear();
  sheet.appendRow(["Car Number (Folder)", "File Name", "File URL", "MIME Type", "Date Created"]);
  sheet.setFrozenRows(1);
  
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const subFolders = rootFolder.getFolders();
  let fileCount = 0;
  
  try {
    while (subFolders.hasNext()) {
      const subFolder = subFolders.next();
      const files = subFolder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        sheet.appendRow([subFolder.getName(), file.getName(), file.getUrl(), file.getMimeType(), file.getDateCreated()]);
        fileCount++;
      }
    }
    SpreadsheetApp.getUi().alert("Sync Complete", `Found and listed ${fileCount} files in the "${manifestSheetName}" sheet.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log("Error during file sync: " + e.toString());
    SpreadsheetApp.getUi().alert("Sync Error", "An error occurred during sync: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

