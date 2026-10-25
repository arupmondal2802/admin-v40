# A Big Engine – Service Form

A multi-step, dynamic form for service agents to log new service requests for customers, including customer details, service selection, add-ons, and invoice generation. This application is designed for a service center, providing a comprehensive solution for managing service jobs from creation to invoicing.

## Features

-   **Progressive Web App (PWA):** The app is installable on mobile devices via the browser's "Add to Home Screen" feature, providing an app-like experience with an icon and offline access.
-   **Multi-Step Service Form:** Guides the service agent through a logical workflow for creating a new service request.
-   **Customer Management:** Search for existing customers by mobile number to pre-fill details, or create new customer records.
-   **Dynamic Service Selection:** The form adapts based on the services selected (Car Washing, Tyre Replacement, Battery Replacement, Add-ons).
-   **Detailed Service Logging:** Capture specific details for each service, including quantities, prices, and media uploads.
-   **File Uploads:** Upload photos and videos (e.g., before/after shots, inventory videos) directly to a designated Google Drive folder.
-   **AI-Powered Summaries:** Uses the Google Gemini API to generate a friendly, concise summary of the services performed for the customer.
-   **Push Notifications:** Agents receive real-time push notifications for upcoming service reminders, new assignments, and other important events, even when the app is closed.
-   **Cloud Data Sync:** All application data (services, users, settings) is synced with a Google Sheet, providing a persistent and accessible database.
-   **User Roles & Management:** Supports 'admin' and 'user' roles, with an admin panel for creating new users.
-   **Invoice & Printing:** Generate a clean, printable invoice summary at the end of the process.
-   **Offline First:** The application loads data from cloud storage but can function and save changes locally, syncing when a connection is available.
-   **Metrics Dashboard:** View key metrics like total revenue, number of services, and service type breakdown.
-   **Data Export:** Export all application data to an Excel file (`.xlsx`).

---

## Full Setup & Deployment Instructions

Follow these steps carefully to get the application fully running with all features.

### Part A: Google Cloud Backend Setup (Unified Script)

This app uses a single, powerful Google Apps Script to handle both data storage in Google Sheets and file uploads to Google Drive.

1.  **Create a Google Sheet:** 
    *   Go to [sheets.new](https://sheets.new) to create a new, blank spreadsheet. Name it something descriptive, like "Service App Database".
    *   **Copy the Spreadsheet ID:** Look at the URL in your browser's address bar. It will look like `https://docs.google.com/spreadsheets/d/1a2b3c_YOUR_ID_HERE_4d5e6f/edit`. Copy the long string of characters that is your unique ID. Save this for a later step.

2.  **Create a Root Google Drive Folder:**
    *   In your Google Drive, create a new folder to store all media uploads. Name it "Service App Uploads" or similar.
    *   **Copy the Folder ID:** Open the folder and copy the ID from the URL bar (it's the long string of characters after `/folders/`). Save this for a later step.

3.  **Open Apps Script:** In your "Service App Database" Google Sheet, click `Extensions` > `Apps Script`. A new browser tab will open with the script editor.

4.  **Paste the Unified Script:** Delete any existing code in the `Code.gs` file and paste the entire unified script below into the editor.

<details>
<summary>Click to view the Updated Google Apps Script (v4.0 - Granular & Offline)</summary>

```javascript
// =================================================================
//                    CONFIGURATION
// =================================================================
// IMPORTANT: You must fill in these values before deploying.

// The ID of the spreadsheet to use as the database.
const SPREADSHEET_ID = "18Ydr-fAVQduyxRKT_mwn9x2YaoxTqA_mLvVavFkMix8"; 

// The ID of the root folder in Google Drive where all service media will be stored.
const ROOT_FOLDER_ID = "Y3KP2Pnsc2zHxAjUt7WNyTDlDWLDIouQx";

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
  'LocationHistory', 'MiscSpends', 'Bookkeeping', 'VehicleData', 'TyreData'
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
    const action = e && e.parameter ? e.parameter.action : null;
    if (action === 'loadAllData') {
      const data = loadAllData();
      return createJsonResponse({ status: 'success', data: data });
    }
    if (action === 'loadPageData') {
      const sheetsParam = e.parameter.sheets;
      if (!sheetsParam) {
        throw new Error("Missing 'sheets' parameter for loadPageData action.");
      }
      const requestedSheets = sheetsParam.split(',').map(function(s) { return s.trim(); });
      const data = loadSpecificSheets(requestedSheets);
      return createJsonResponse({ status: 'success', data: data });
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
    
    if (requestData.filename && requestData.base64) {
      if (!ROOT_FOLDER_ID || ROOT_FOLDER_ID === "YOUR_ROOT_FOLDER_ID_HERE") throw new Error("ROOT_FOLDER_ID is not configured.");
      response = handleFileUpload(requestData);
    } 
    else if (requestData.action === 'upsertRecord') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      handleUpsertRecord(requestData.sheetName, requestData.record, requestData.idField);
      response = { status: 'success', message: `Record upserted in ${requestData.sheetName}.` };
    }
    else if (requestData.action === 'deleteRecord') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      handleDeleteRecord(requestData.sheetName, requestData.recordId, requestData.idField);
      response = { status: 'success', message: `Record deleted from ${requestData.sheetName}.` };
    }
    else if (requestData.action === 'loadAllData') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      const data = loadAllData();
      response = { status: 'success', data: data };
    }
    else if (requestData.action === 'loadPageData') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID is not configured.");
      const sheetsParam = requestData.sheets;
      if (!sheetsParam) throw new Error("Missing 'sheets' parameter for loadPageData action.");
      const requestedSheets = typeof sheetsParam === 'string' ? sheetsParam.split(',').map(function(s) { return s.trim(); }) : sheetsParam;
      const data = loadSpecificSheets(requestedSheets);
      response = { status: 'success', data: data };
    }
    else {
      response = { status: 'success', message: 'Google Apps Script POST active.' };
    }
    
  } catch (error) {
    Logger.log('doPost Error: ' + error.message + (error.stack ? ' Stack: ' + error.stack : ''));
    response = { status: 'error', message: 'Failed to process POST request: ' + error.message };
  }
  return createJsonResponse(response);
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
    SpreadsheetApp.flush(); // IMPORTANT: Force sheet creation to complete before proceeding
  }
  
  const recordId = record[idField];
  if (!recordId) throw new Error(`Record is missing the required ID field: "${idField}" for sheet "${sheetName}".`);

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

function loadAllData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const allData = {};
  
  SHEET_NAMES.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        SpreadsheetApp.flush();
    }
    
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() < 2) {
        allData[sheetName] = [];
        return;
    }
    
    const values = dataRange.getValues();
    const headers = values.shift();
    const records = values.map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (index < row.length) ? row[index] : "";
      });
      return record;
    });
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

function handleFileUpload(data) {
    const { filename, mimeType, base64, subFolderName } = data;
    if (!base64 || !filename || !mimeType || !subFolderName) throw new Error("Missing required data for file upload.");
    
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    let subFolder;
    const existingFolders = rootFolder.getFoldersByName(subFolderName);
    subFolder = existingFolders.hasNext() ? existingFolders.next() : rootFolder.createFolder(subFolderName);

    const decoded = Utilities.base64Decode(base64.split(',')[1]);
    const blob = Utilities.newBlob(decoded, mimeType, filename);
    const file = subFolder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { status: 'success', name: file.getName(), url: file.getUrl() };
}

function syncDriveFilesToSheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE" || !ROOT_FOLDER_ID || ROOT_FOLDER_ID === "YOUR_ROOT_FOLDER_ID_HERE") {
    SpreadsheetApp.getUi().alert("Setup Required", "SPREDSHEET_ID or ROOT_FOLDER_ID has not been set in the script.", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const manifestSheetName = "MediaManifest";
  let sheet = ss.getSheetByName(manifestSheetName) || ss.insertSheet(manifestSheetName);

  sheet.clear();
  sheet.appendRow(["Car Number (Folder)", "File Name", "File URL", "Date Created"]);
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
        sheet.appendRow([subFolder.getName(), file.getName(), file.getUrl(), file.getDateCreated()]);
        fileCount++;
      }
    }
    SpreadsheetApp.getUi().alert("Sync Complete", `Found and listed ${fileCount} files in the "${manifestSheetName}" sheet.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log("Error during file sync: " + e.toString());
    SpreadsheetApp.getUi().alert("Sync Error", "An error occurred during sync: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
```

</details>

5.  **Configure the Script:**
    *   In the Apps Script editor, find the `CONFIGURATION` section at the top.
    *   Make sure `SPREADSHEET_ID`, `ROOT_FOLDER_ID`, and all `WEBSITE_*` variables are correct.
    *   Click the **Save project** icon (looks like a floppy disk).

6.  **Deploy the Script:**
    *   Click the **Deploy** button in the top right, then select **New deployment**.
    *   Click the gear icon next to "Select type" and choose **Web app**.
    *   In the dialog:
        *   **Description:** `Service App Backend v4.0 (Granular)`
        *   **Execute as:** `Me`
        *   **Who has access:** `Anyone` (**IMPORTANT:** For simplicity. For production, you'd restrict this).
    *   Click **Deploy**.
    *   Authorize the script's permissions when prompted.
    *   **Copy the Web app URL**. This is your single Backend URL for the app settings.

7.  **Set Up Automatic Website Sync (Optional but Recommended):**
    *   In the Apps Script editor, click the **Triggers** icon (looks like a clock) on the left sidebar.
    *   Click **+ Add Trigger** in the bottom right.
    *   Configure the trigger as follows:
        *   **Choose which function to run:** `syncWebsiteRequests`
        *   **Choose which deployment should run:** `Head`
        *   **Select event source:** `Time-driven`
        *   **Select type of time based trigger:** `Hour timer`
        *   **Select hour interval:** `Every hour`
    *   Click **Save**. This will now automatically check for new website leads every hour.

### Part B: Get Your Gemini API Key

1.  Go to [Google AI Studio](https://aistudio.google.com/).
2.  Click **"Get API key"** and create a new API key.
3.  Copy the key and keep it somewhere safe.

### Part C: Generate VAPID Keys for Push Notifications

Push notifications require a set of public and private keys (VAPID keys) to securely identify your application server.

1.  **Open your project terminal:** Navigate to your local project folder in your terminal.
2.  **Run the key generator:** Execute the following command.
    ```bash
    npx web-push generate-vapid-keys
    ```
3.  **Copy the Keys:** The command will output a public and a private key. Copy both for the next step.

### Part D: Deploy to Netlify

1.  **Push to GitHub:** Ensure your project is in a GitHub repository.
2.  **Connect to Netlify:** Import your project from GitHub into Netlify.
3.  **Add Environment Variables:**
    *   Go to your site's settings: `Site settings` > `Build & deploy` > `Environment`.
    *   Click **"Edit variables"** and add the following:
        *   `API_KEY`: Your Google Gemini API key from **Part B**.
        *   `VAPID_PUBLIC_KEY`: The Public Key from **Part C**.
        *   `VAPID_PRIVATE_KEY`: The Private Key from **Part C**.
4.  **Deploy:** Trigger a new deploy from the deploys page.

### Part E: Configure the Live Application

1.  **Open Your Site:** Once deployment is finished, open your new Netlify site URL.
2.  **Log In:** The default login is `admin` / `admin@123`.
3.  **Enter Settings:**
    *   Click the **Settings icon** in the sidebar.
    *   Paste the **Web app URL** from **Part A, Step 6** into **BOTH** input fields (`Cloud Data App URL` and `Google Drive Upload URL`).
    *   Click **Save Settings**.

Your application is now fully configured and operational with the new, robust backend!