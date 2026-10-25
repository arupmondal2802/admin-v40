import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import webpush from 'web-push';
import sgMail from '@sendgrid/mail';
import { getDbPool, queryNeon, initNeonTables } from './server/neonDb';

// Load environment variables from .env file for local and production deployments
dotenv.config();

// CJS and ESM compatible root directory resolution using path.resolve
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
const rootDir = currentDir.endsWith('dist') ? path.resolve(currentDir, '..') : path.resolve(currentDir);

async function startServer() {
  const app = express();
  
  // Render automatically assigns PORT via environment variable (default 10000 on Render)
  // When running inside the AI Studio container, strictly bind to port 3000
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const PORT = isRender
    ? Number(process.env.PORT || 10000)
    : (process.env.NODE_ENV === 'production' && !process.env.K_SERVICE && process.env.PORT
        ? Number(process.env.PORT)
        : 3000);

  // Global CORS Middleware (Essential for Render backend serving external frontends)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(express.static(path.resolve(rootDir, 'public')));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'a-big-engine-service-backend',
      platform: isRender ? 'Render' : 'Container',
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      time: new Date().toISOString()
    });
  });

  // Mocking Netlify functions and API endpoints
  app.post(['/.netlify/functions/chat-with-bot', '/api/chat-with-bot'], async (req, res) => {
    try {
      const { messages, serviceTemplates } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const serviceNames = serviceTemplates.map((t: any) => t.name).join(', ');

      const systemInstruction = `You are 'A Big Engine AI Assistant', a friendly and efficient chatbot that helps users book a vehicle service.
Your goal is to fill out a service form by asking the user a series of questions in a specific, conversational order.
You must ask for:
1. Customer's first name, last name, and 10-digit mobile number.
2. Car's registration number and brand/model.
3. The customer's street address.
4. Which services they need. The main available services are: ${serviceNames}.
5. If they select 'Car Washing', ask for the quantity.

Once you believe you have all the necessary information, present a clear, bulleted summary of the details you've collected.
Then, ask the user to confirm if the details are correct. For example: "Is this information correct?"

If the user confirms, and ONLY if they confirm, you MUST respond with just the final JSON object containing all the collected data, enclosed in a \`\`\`json code block. Do not include any other text, greetings, or explanation outside the code block.
The JSON schema you must adhere to is:
{
  "customerFirstName": "string",
  "customerLastName": "string",
  "mobileNumber": "string (10 digits only, no country code)",
  "carNumber": "string",
  "carBrandModel": "string",
  "streetAddress": "string",
  "serviceSelection": ["array", "of", "strings"],
  "carwashQuantity": "number (if Car Washing is selected, otherwise 0)"
}

Start the conversation by greeting the user and asking for their first name. Be friendly and conversational. Ask one simple question at a time. Do not ask for multiple pieces of information in a single message.`;

      const contents = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
      });

      res.json({ reply: response.text });
    } catch (error: any) {
      console.error('Chatbot error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Other Netlify functions can be added here as needed
  app.get(['/.netlify/functions/hello', '/api/hello'], (req, res) => {
    res.json({ message: 'Hello from the server!' });
  });

  const handleProxyRequest = async (req: express.Request, res: express.Response) => {
    try {
      const targetUrl = req.body?.sheetsUrl || req.body?.uploadUrl || req.body?.targetUrl || req.query?.sheetsUrl || req.query?.targetUrl;
      const payload = req.body?.payload || req.body || {};

      if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
        return res.status(400).json({ error: 'Missing or invalid sheetsUrl/uploadUrl in proxy request' });
      }

      const action = payload.action || req.query?.action;

      // Handle ping action directly with fallback proofing
      if (action === 'ping') {
        try {
          const pingRes = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
          if (pingRes.ok) {
            return res.json({ status: 'success', message: 'Google Apps Script endpoint is online and reachable.' });
          }
        } catch (e) {}
      }

      let response: Response | null = null;
      let responseText = '';

      // Helper function to check if response is a genuine error from Google Apps Script
      const isScriptError = (json: any) => {
        if (!json) return true;
        if (json.status === 'error' || (json.message && String(json.message).toLowerCase().includes('invalid'))) return true;
        return false;
      };

      const isWriteOp = action === 'upsertRecord' || action === 'deleteRecord' || action === 'delete' || action === 'save' || action === 'upload' || action === 'saveRecord' || action === 'uploadFile';

      // 1. If request method is POST and payload has content, try POST relay first
      if (req.method === 'POST' && payload && Object.keys(payload).length > 0) {
        try {
          const postUrlObj = new URL(targetUrl);
          if (action) postUrlObj.searchParams.set('action', String(action));
          const postUrl = postUrlObj.toString();

          console.log(`[Proxy Relay POST] Forwarding request (${action || 'data'}) to Google Apps Script: ${postUrl}`);
          const postRes = await fetch(postUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow'
          });
          const txt = await postRes.text();
          if (postRes.ok && txt.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(txt);
              if (!isScriptError(parsed) || isWriteOp) {
                return res.json(parsed);
              }
            } catch (e) {}
          }
          response = postRes;
          responseText = txt;
        } catch (postErr) {
          console.warn("[Proxy Relay POST] Attempt failed...", postErr);
        }
      }

      // If it's a write action, return the response directly without GET fallback
      if (isWriteOp) {
        if (responseText && responseText.trim().startsWith('{')) {
          try {
            return res.json(JSON.parse(responseText));
          } catch (e) {}
        }
        if (response) {
          return res.status(response.status).json({
            status: 'error',
            message: responseText || 'Write operation to Google Apps Script failed. Operating with local offline storage.',
            code: response.status
          });
        }
        return res.status(502).json({
          status: 'error',
          message: 'Unable to perform write operation on Google Apps Script. Operating with local offline storage.'
        });
      }

      // 2. Try GET relay attempt/fallback (ONLY for read operations)
      let getRes: Response | null = null;
      let getTxt = '';

      if (!isWriteOp) {
        const urlObj = new URL(targetUrl);
        if (action) urlObj.searchParams.set('action', String(action));
        if (payload.sheets) urlObj.searchParams.set('sheets', String(payload.sheets));
        if (payload.since) urlObj.searchParams.set('since', String(payload.since));
        if (req.query) {
          for (const [k, v] of Object.entries(req.query)) {
            if (k !== 'sheetsUrl' && k !== 'targetUrl' && k !== 'uploadUrl' && typeof v === 'string') {
              urlObj.searchParams.set(k, v);
            }
          }
        }
        const fetchUrl = urlObj.toString();
        console.log(`[Proxy Relay GET] Forwarding request (${action || 'data'}) to Google Apps Script: ${fetchUrl}`);
        getRes = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
        getTxt = await getRes.text();

        if (getRes.ok && getTxt.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(getTxt);
            if (!isScriptError(parsed)) {
              return res.json(parsed);
            }
          } catch (e) {}
        }
      }

      // 3. Special Fallback for loadPageData: if older Google Apps Script deployment doesn't support loadPageData, fall back to loadAllData and filter requested sheets
      if (action === 'loadPageData') {
        console.log(`[Proxy Relay Fallback] Attempting loadAllData fallback for loadPageData...`);
        try {
          const sinceParam = payload.since || (req.query?.since as string);
          const fallbackUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=loadAllData${sinceParam ? `&since=${encodeURIComponent(sinceParam)}` : ''}`;
          const fallbackRes = await fetch(fallbackUrl, { method: 'GET', redirect: 'follow' });
          const fallbackTxt = await fallbackRes.text();
          if (fallbackRes.ok && fallbackTxt.trim().startsWith('{')) {
            const fallbackJson = JSON.parse(fallbackTxt);
            if (fallbackJson.status === 'success' && fallbackJson.data) {
              const requestedSheetsStr = payload.sheets || (req.query?.sheets as string);
              if (requestedSheetsStr) {
                const requestedSheets = String(requestedSheetsStr).split(',').map(s => s.trim().toLowerCase());
                const filteredData: Record<string, any> = {};
                for (const [k, v] of Object.entries(fallbackJson.data)) {
                  if (requestedSheets.includes(k.toLowerCase())) {
                    filteredData[k] = v;
                  }
                }
                return res.json({ status: 'success', data: filteredData });
              }
              return res.json(fallbackJson);
            }
          }
        } catch (fallbackErr) {
          console.warn("[Proxy Relay Fallback] loadAllData fallback failed:", fallbackErr);
        }
      }

      // Use the best available response
      const finalRes = getRes && getRes.ok ? getRes : (response || getRes);
      const finalTxt = getRes && getRes.ok ? getTxt : (responseText || getTxt || '');
      const isHtml = finalTxt.trim().startsWith('<');

      if (!finalRes || !finalRes.ok) {
        const status = finalRes?.status || 500;
        console.warn(`[Proxy Relay] Received non-200 response (${status}) from Google Apps Script:`, finalTxt.slice(0, 150));
        return res.status(status).json({ 
          error: 'Failed to forward request to Google Apps Script',
          status: status,
          isHtmlError: isHtml,
          details: isHtml ? 'Google Apps Script URL returned an HTML error page (404 or access restricted).' : (finalTxt.slice(0, 300) || 'Unknown error response from Google Apps Script')
        });
      }

      try {
        const data = JSON.parse(finalTxt);
        return res.json(data);
      } catch (parseError) {
        console.warn("[Proxy Relay] Got non-JSON response from Google Apps Script:", finalRes.status, "isHtml:", isHtml);
        return res.status(502).json({
          error: 'Google Apps Script returned non-JSON output',
          isHtmlError: isHtml,
          details: isHtml ? 'Received an HTML response instead of JSON. Ensure your Google Apps Script Web App URL is published with access set to "Anyone".' : finalTxt.slice(0, 300),
        });
      }
    } catch (error: any) {
      console.error("Error in Google Apps Script proxy route:", error.message);
      res.status(502).json({ error: 'The proxy route encountered a network error.', details: error.message });
    }
  };

  const proxyEndpoints = [
    '/.netlify/functions/google-sheets-proxy',
    '/.netlify/functions/google-drive-proxy',
    '/api/proxy',
    '/api/google-sheets-proxy',
    '/api/google-drive-proxy',
    '/api/proxy-upload'
  ];
  proxyEndpoints.forEach(endpoint => {
    app.all(endpoint, handleProxyRequest);
  });

  // Dedicated Google Sheets Fetch & Subsheet Discovery Proxy Route
  const handleFetchGoogleSheet = async (req: express.Request, res: express.Response) => {
    try {
      const targetUrl = (req.body?.url || req.body?.sheetUrl || req.body?.sheetsUrl || req.query?.url || req.query?.sheetUrl || req.query?.sheetsUrl || req.query?.spreadsheetId || req.body?.spreadsheetId || '') as string;
      const sheetName = (req.body?.sheet || req.body?.tab || req.body?.tabName || req.query?.sheet || req.query?.tab || req.query?.tabName || '') as string;
      const action = (req.body?.action || req.query?.action || 'fetchTab') as string;

      let spreadsheetId = targetUrl;
      const match = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        spreadsheetId = match[1];
      }

      if (!spreadsheetId || spreadsheetId.length < 10) {
        return res.status(400).json({ status: 'error', error: 'INVALID_URL', message: 'Invalid or missing Google Sheet URL/ID.' });
      }

      // Check if response is restricted HTML login
      const isAuthRedirectHtml = (text: string) => {
        if (!text) return true;
        const trimmed = text.trim();
        return (
          trimmed.startsWith('<!DOCTYPE') ||
          trimmed.startsWith('<html') ||
          trimmed.includes('accounts.google.com/ServiceLogin') ||
          trimmed.includes('accounts.google.com/v3/signin') ||
          trimmed.includes('ServiceLogin?service=wise') ||
          trimmed.includes('Google Accounts') ||
          trimmed.includes('Sign in - Google Accounts')
        );
      };

      // 1. Action: Discover Tabs via htmlview
      if (action === 'discoverTabs') {
        const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview?t=${Date.now()}`;
        console.log(`[GoogleSheetProxy] Discovering tabs from: ${htmlUrl}`);
        const response = await fetch(htmlUrl, { redirect: 'follow' });
        const htmlText = await response.text();

        if (isAuthRedirectHtml(htmlText)) {
          return res.json({
            status: 'error',
            error: 'AUTH_REQUIRED',
            requiresAuth: true,
            spreadsheetId,
            message: 'Google Sheet access is restricted. Please ensure the Google Sheet is shared with "Anyone with the link can view".',
            tabs: []
          });
        }

        const discoveredTabs = new Set<string>();
        const matches = htmlText.match(/class="sheet-button"[^>]*>([^<]+)</gi) ||
                        htmlText.match(/"name":"([^"]+)"/gi) ||
                        htmlText.match(/id="sheet-button-[^"]*"[^>]*>([^<]+)</gi) ||
                        htmlText.match(/item-sheet-name[^>]*>([^<]+)</gi) ||
                        htmlText.match(/aria-label="([^"]+)" role="tab"/gi);
        if (matches) {
          matches.forEach(m => {
            const cleaned = m
              .replace(/<[^>]+>/g, '')
              .replace(/"name":"/g, '')
              .replace(/aria-label="/g, '')
              .replace(/" role="tab"/g, '')
              .replace(/"/g, '')
              .trim();
            if (cleaned && !cleaned.toLowerCase().includes('google') && cleaned.length < 80) {
              discoveredTabs.add(cleaned);
            }
          });
        }

        return res.json({
          status: 'success',
          spreadsheetId,
          tabs: Array.from(discoveredTabs)
        });
      }

      // 2. Action: Diagnose Sheet
      if (action === 'diagnose') {
        const checkUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&t=${Date.now()}`;
        const checkRes = await fetch(checkUrl, { redirect: 'follow' });
        const checkText = await checkRes.text();
        const requiresAuth = isAuthRedirectHtml(checkText);

        return res.json({
          status: 'success',
          spreadsheetId,
          isAccessible: !requiresAuth,
          requiresAuth,
          httpStatus: checkRes.status,
          message: requiresAuth
            ? 'Google Sheet access is restricted. Share settings must be "Anyone with the link can view".'
            : 'Google Sheet is publicly accessible and ready for syncing.'
        });
      }

      // 3. Action: Fetch single tab or default sheet
      const tabParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
      const now = Date.now();
      let lastError = '';
      let authRequired = false;

      // Strategy 1: GViz CSV
      try {
        const gvizCsvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${tabParam}&t=${now}`;
        const gvizRes = await fetch(gvizCsvUrl, { redirect: 'follow' });
        const text = await gvizRes.text();
        if (gvizRes.ok && !isAuthRedirectHtml(text)) {
          return res.json({ status: 'success', format: 'csv', data: text, tab: sheetName, spreadsheetId });
        } else if (isAuthRedirectHtml(text)) {
          authRequired = true;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }

      // Strategy 2: GViz JSON
      try {
        const gvizJsonUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json${tabParam}&t=${now}`;
        const gvizRes = await fetch(gvizJsonUrl, { redirect: 'follow' });
        const text = await gvizRes.text();
        if (gvizRes.ok && !isAuthRedirectHtml(text)) {
          return res.json({ status: 'success', format: 'json', data: text, tab: sheetName, spreadsheetId });
        } else if (isAuthRedirectHtml(text)) {
          authRequired = true;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }

      // Strategy 3: Export TSV
      try {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv${tabParam}&t=${now}`;
        const exportRes = await fetch(exportUrl, { redirect: 'follow' });
        const text = await exportRes.text();
        if (exportRes.ok && !isAuthRedirectHtml(text)) {
          return res.json({ status: 'success', format: 'tsv', data: text, tab: sheetName, spreadsheetId });
        } else if (isAuthRedirectHtml(text)) {
          authRequired = true;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }

      // Strategy 4: Export CSV
      try {
        const exportCsvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${tabParam}&t=${now}`;
        const exportCsvRes = await fetch(exportCsvUrl, { redirect: 'follow' });
        const text = await exportCsvRes.text();
        if (exportCsvRes.ok && !isAuthRedirectHtml(text)) {
          return res.json({ status: 'success', format: 'csv', data: text, tab: sheetName, spreadsheetId });
        } else if (isAuthRedirectHtml(text)) {
          authRequired = true;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }

      if (authRequired) {
        return res.json({
          status: 'error',
          error: 'AUTH_REQUIRED',
          requiresAuth: true,
          spreadsheetId,
          tab: sheetName,
          message: 'Google Sheet access is restricted (Redirected to Google Sign-In). Please ensure the Google Sheet is shared with "Anyone with the link can view".'
        });
      }

      return res.status(502).json({
        status: 'error',
        error: 'FETCH_FAILED',
        message: `Failed to fetch sheet data for tab "${sheetName || 'default'}". ${lastError}`,
        spreadsheetId,
        tab: sheetName
      });
    } catch (globalErr: any) {
      console.error('[GoogleSheetProxy] Unexpected error:', globalErr);
      res.status(500).json({ status: 'error', error: 'SERVER_ERROR', message: globalErr.message || 'Internal proxy error' });
    }
  };

  app.all(['/api/fetch-google-sheet', '/.netlify/functions/fetch-google-sheet'], handleFetchGoogleSheet);

  // VAPID key retrieval
  app.get(['/.netlify/functions/get-vapid-key', '/api/get-vapid-key'], (req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn('[Server] VAPID_PUBLIC_KEY environment variable is not set.');
      return res.status(500).json({ error: 'Push notification server is not configured.' });
    }
    res.json({ publicKey });
  });

  // Trigger push notifications
  app.post(['/.netlify/functions/trigger-push', '/api/trigger-push'], async (req, res) => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('[Server] VAPID keys are not configured.');
      return res.status(500).json({ error: 'Push server is not configured.' });
    }

    webpush.setVapidDetails(
      'mailto:admin@your-service.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    try {
      const { subscription, payload } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription object provided.' });
      }

      await webpush.sendNotification(subscription, JSON.stringify(payload));
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Server] Error sending push notification:', error);
      res.status(error.statusCode || 500).json({
        error: 'Failed to send notification.',
        details: error.body || error.message
      });
    }
  });

  // Send status emails via SendGrid
  app.post(['/.netlify/functions/send-email', '/api/send-email'], async (req, res) => {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
      console.log('[Server] SENDGRID_API_KEY environment variable not set. Email sending is disabled.');
      return res.json({ message: 'Email service is not configured on the server, skipping notification.' });
    }

    sgMail.setApiKey(sendgridApiKey);

    try {
      const { service } = req.body;
      if (!service || !service.customerEmail || !service.status) {
        return res.status(400).json({ error: 'Missing required fields for email: service data, customerEmail, or status' });
      }

      let subject = '';
      let htmlContent = '';
      const fromEmail = 'noreply@abigengine.com';

      if (service.status === 'In Progress') {
        subject = `Update on Your Service Order #${service.appointmentId?.split('-').pop()}`;
        htmlContent = `
          <p>Hi ${service.customerFirstName},</p>
          <p>Great news! We've officially started working on your vehicle (${service.carBrandModel} - ${service.carNumber}).</p>
          <p>We'll notify you again as soon as the service is complete.</p>
          <p>Thank you,<br/>The Team at A Big Engine</p>
        `;
      } else if (service.status === 'Completed') {
        subject = `Your Service Order #${service.appointmentId?.split('-').pop()} is Complete!`;
        htmlContent = `
          <p>Hi ${service.customerFirstName},</p>
          <p>Your service for vehicle <strong>${service.carBrandModel} (${service.carNumber})</strong> is now complete and ready for pickup.</p>
          <p>The final invoice total is <strong>₹${Number(service.grandTotal || 0).toFixed(2)}</strong>.</p>
          <p>We look forward to seeing you soon!</p>
          <p>Thank you,<br/>The Team at A Big Engine</p>
        `;
      } else {
        return res.json({ message: 'No email template configured for this status.' });
      }

      const msg = {
        to: service.customerEmail,
        from: fromEmail,
        subject: subject,
        html: htmlContent,
      };

      console.log('[Server] --- SIMULATING EMAIL SEND (would be real if verified single sender exists) ---');
      console.log(`To: ${msg.to}`);
      console.log(`From: ${msg.from}`);
      console.log(`Subject: ${msg.subject}`);
      console.log('-------------------------------------------------------------------------');

      res.json({ success: true, message: 'Email sent successfully (simulated).' });
    } catch (error: any) {
      console.error('[Server] Error in send-email function:', error);
      res.status(500).json({ error: 'An internal error occurred while trying to send the email.' });
    }
  });

  // Send system reports / reminders / alerts via SendGrid
  const handleSendReportEmail = async (req: any, res: any) => {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const hasApiKey = !!sendgridApiKey;

    if (hasApiKey) {
      sgMail.setApiKey(sendgridApiKey);
    } else {
      console.log('[Server] SENDGRID_API_KEY environment variable not set. Email report sending is simulated.');
    }

    try {
      const { recipients, config, appointments = [], serviceRequests = [] } = req.body;

      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Recipients list is empty or invalid. Please specify at least one email.' });
      }

      // Process dates and filter data
      const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
      const now = new Date();
      
      const isToday = (dateStr: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === todayStr;
      };

      const isUpcoming = (dateStr: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const diffTime = d.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 7;
      };

      // Filter appointments (orders)
      const todayOrders = appointments.filter((a: any) => isToday(a.timestamp));
      const upcomingOrders = appointments.filter((a: any) => isUpcoming(a.timestamp));
      const overdueOrders = appointments.filter((a: any) => {
        if (a.status === 'Completed' || a.status === 'Draft') return false;
        const createdTime = new Date(a.timestamp).getTime();
        const hoursElapsed = (now.getTime() - createdTime) / (1000 * 60 * 60);
        return hoursElapsed > 24;
      });

      // Filter raw service requests (leads)
      const todayLeads = serviceRequests.filter((sr: any) => isToday(sr.requestDate) || isToday(sr.createdTime));
      const upcomingLeads = serviceRequests.filter((sr: any) => isUpcoming(sr.requestDate));

      // Calculate revenue metrics
      const totalTodayRevenue = todayOrders
        .filter((o: any) => o.status === 'Completed')
        .reduce((sum: number, o: any) => sum + Number(o.grandTotal || 0), 0);

      const pendingTodayRevenue = todayOrders
        .filter((o: any) => o.status !== 'Completed')
        .reduce((sum: number, o: any) => sum + Number(o.grandTotal || 0), 0);

      // Build HTML
      let reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>A Big Engine - System Status & Appointments Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
            .container { max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; overflow: hidden; }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 30px; text-align: center; border-bottom: 4px solid #38bdf8; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { margin: 5px 0 0 0; color: #94a3b8; font-size: 14px; }
            .content { padding: 30px; }
            .section-title { font-size: 18px; font-weight: 700; color: #0f172a; border-left: 4px solid #38bdf8; padding-left: 10px; margin: 25px 0 15px 0; }
            .metrics-grid { display: table; width: 100%; border-spacing: 12px; margin: -12px; margin-bottom: 20px; }
            .metric-card { display: table-cell; width: 25%; background-color: #f1f5f9; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; vertical-align: top; }
            .metric-value { font-size: 22px; font-weight: 800; color: #0284c7; margin-bottom: 4px; }
            .metric-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
            th { background-color: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
            tr:hover { background-color: #f8fafc; }
            .badge { display: inline-block; padding: 3px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; text-transform: uppercase; }
            .badge-completed { background-color: #dcfce7; color: #166534; }
            .badge-progress { background-color: #fef9c3; color: #854d0e; }
            .badge-queued { background-color: #e0f2fe; color: #0369a1; }
            .badge-alert { background-color: #fee2e2; color: #991b1b; }
            .badge-source { background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
            .no-data { text-align: center; color: #64748b; padding: 25px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-style: italic; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
            .footer a { color: #0284c7; text-decoration: none; }
            .alert-box { background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px; margin-bottom: 20px; color: #991b1b; }
            .alert-box h4 { margin: 0 0 5px 0; font-size: 14px; font-weight: 700; }
            .alert-box p { margin: 0; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>A Big Engine - System Reports & Reminders</h1>
              <p>Generated on ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST) | Recipients: ${recipients.join(', ')}</p>
            </div>
            <div class="content">
      `;

      // 1. KPI SUMMARY / REVENUE SUMMARY
      if (config.reportTypes.revenueSummary) {
        reportHtml += `
          <div class="section-title">Daily Financial & Performance Matrix</div>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">₹${totalTodayRevenue.toFixed(2)}</div>
              <div class="metric-label">Completed Revenue Today</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">₹${pendingTodayRevenue.toFixed(2)}</div>
              <div class="metric-label">Pending Order Revenue</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${todayOrders.length}</div>
              <div class="metric-label">Total Today Orders</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${todayOrders.filter((o: any) => o.status === 'Completed').length}</div>
              <div class="metric-label">Completed Orders</div>
            </div>
          </div>
        `;
      }

      // 2. OVERDUE/STALLED ORDERS ALERT
      if (config.reportTypes.overdueAlerts && overdueOrders.length > 0) {
        reportHtml += `
          <div class="alert-box">
            <h4>⚠️ OVERDUE SERVICE ALERTS</h4>
            <p>The following ${overdueOrders.length} orders have been active (uncompleted) for more than 24 hours. Action may be required:</p>
            <table style="width: 100%; margin-top: 10px; font-size: 13px;">
              <thead>
                <tr style="background-color: rgba(239, 68, 68, 0.05);">
                  <th style="padding: 6px; text-align: left; color: #991b1b;">Car</th>
                  <th style="padding: 6px; text-align: left; color: #991b1b;">Customer</th>
                  <th style="padding: 6px; text-align: left; color: #991b1b;">Status</th>
                  <th style="padding: 6px; text-align: right; color: #991b1b;">Age</th>
                </tr>
              </thead>
              <tbody>
        `;
        overdueOrders.forEach((o: any) => {
          const hours = Math.round((now.getTime() - new Date(o.timestamp).getTime()) / (1000 * 60 * 60));
          reportHtml += `
            <tr>
              <td style="padding: 6px; border-bottom: 1px solid #fca5a5;"><strong>${o.carBrandModel}</strong> (${o.carNumber})</td>
              <td style="padding: 6px; border-bottom: 1px solid #fca5a5;">${o.customerFirstName} ${o.customerLastName}</td>
              <td style="padding: 6px; border-bottom: 1px solid #fca5a5;"><span class="badge badge-alert">${o.status}</span></td>
              <td style="padding: 6px; border-bottom: 1px solid #fca5a5; text-align: right;">${hours} hrs ago</td>
            </tr>
          `;
        });
        reportHtml += `
              </tbody>
            </table>
          </div>
        `;
      }

      // 3. DAILY APPOINTMENTS & ORDERS
      if (config.reportTypes.dailyAppointments) {
        reportHtml += `<div class="section-title">Today's Scheduled Appointments & Service Orders</div>`;
        
        if (todayOrders.length === 0 && todayLeads.length === 0) {
          reportHtml += `<div class="no-data">No service requests or active orders scheduled for today.</div>`;
        } else {
          if (todayOrders.length > 0) {
            reportHtml += `
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin: 10px 0;">Active Service Orders (${todayOrders.length})</p>
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>Services</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
            `;
            todayOrders.forEach((o: any) => {
              const servicesText = o.serviceSelection?.join(', ') || 'General Service';
              const statusClass = o.status === 'Completed' ? 'badge-completed' : (o.status === 'In Progress' || o.status === 'Assigned' ? 'badge-progress' : 'badge-queued');
              reportHtml += `
                <tr>
                  <td><strong>${o.carBrandModel}</strong><br/><span style="font-family: monospace; font-size: 11px; color: #64748b;">${o.carNumber}</span></td>
                  <td>${o.customerFirstName} ${o.customerLastName}<br/><span style="font-size: 11px; color: #64748b;">${o.mobileNumber}</span></td>
                  <td style="max-width: 200px;">${servicesText}</td>
                  <td><strong>₹${Number(o.grandTotal || 0).toFixed(2)}</strong></td>
                  <td><span class="badge ${statusClass}">${o.status}</span></td>
                </tr>
              `;
            });
            reportHtml += `</tbody></table>`;
          }

          if (todayLeads.length > 0) {
            reportHtml += `
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin: 15px 0 10px 0;">Raw Appointment Requests & Leads (${todayLeads.length})</p>
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Vehicle</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
            `;
            todayLeads.forEach((l: any) => {
              reportHtml += `
                <tr>
                  <td><strong>${l.customerName}</strong></td>
                  <td>${l.customerPhone}</td>
                  <td>${l.carBrand || ''} ${l.carModel || ''} ${l.carRegNo ? `(${l.carRegNo})` : ''}</td>
                  <td><span class="badge badge-source">${l.source || l.leadSource || 'Web'}</span></td>
                  <td><span class="badge badge-queued">${l.status || 'New'}</span></td>
                </tr>
              `;
            });
            reportHtml += `</tbody></table>`;
          }
        }
      }

      // 4. UPCOMING APPOINTMENTS
      if (config.reportTypes.upcomingAppointments) {
        reportHtml += `<div class="section-title">Upcoming Schedule (Next 7 Days)</div>`;
        
        if (upcomingOrders.length === 0 && upcomingLeads.length === 0) {
          reportHtml += `<div class="no-data">No upcoming appointments or requests in the next 7 days.</div>`;
        } else {
          if (upcomingOrders.length > 0) {
            reportHtml += `
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin: 10px 0;">Upcoming Orders (${upcomingOrders.length})</p>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>Services</th>
                    <th>Est. Amount</th>
                  </tr>
                </thead>
                <tbody>
            `;
            upcomingOrders.forEach((o: any) => {
              const dateStr = new Date(o.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              reportHtml += `
                <tr>
                  <td><strong>${dateStr}</strong></td>
                  <td>${o.carBrandModel} <span style="font-family: monospace; font-size: 11px; color: #64748b;">(${o.carNumber})</span></td>
                  <td>${o.customerFirstName} ${o.customerLastName}</td>
                  <td style="max-width: 200px;">${o.serviceSelection?.join(', ') || 'General Service'}</td>
                  <td><strong>₹${Number(o.grandTotal || 0).toFixed(2)}</strong></td>
                </tr>
              `;
            });
            reportHtml += `</tbody></table>`;
          }

          if (upcomingLeads.length > 0) {
            reportHtml += `
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin: 15px 0 10px 0;">Upcoming Leads/Requests (${upcomingLeads.length})</p>
              <table>
                <thead>
                  <tr>
                    <th>Requested Date</th>
                    <th>Customer</th>
                    <th>Requested Service</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
            `;
            upcomingLeads.forEach((l: any) => {
              const dateStr = l.requestDate ? new Date(l.requestDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Flexible';
              reportHtml += `
                <tr>
                  <td><strong>${dateStr}</strong></td>
                  <td>${l.customerName}<br/><span style="font-size: 11px; color: #64748b;">${l.customerPhone}</span></td>
                  <td>${l.requestedService || 'General Inquiry'}</td>
                  <td><span class="badge badge-source">${l.source || l.leadSource || 'Web'}</span></td>
                  <td><span class="badge badge-queued">${l.status || 'New'}</span></td>
                </tr>
              `;
            });
            reportHtml += `</tbody></table>`;
          }
        }
      }

      reportHtml += `
              <div style="margin-top: 30px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.5; color: #475569;">
                <strong>💡 Reminder Tip:</strong> If any upcoming service orders require specialized parts (batteries, particular tire sizes, custom oils), ensure they are requested in the <em>Inventory Panel</em> to prevent delayed turnaround times.
              </div>
            </div>
            <div class="footer">
              <p><strong>A Big Engine - System Control Center</strong></p>
              <p>To change these notification rules or recipient list, go to <strong>Control Center > System Settings > Email Reports</strong> in your administration dashboard.</p>
              <p>&copy; ${new Date().getFullYear()} A Big Engine. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      if (hasApiKey) {
        const msg = {
          to: recipients,
          from: 'noreply@abigengine.com',
          subject: `[A Big Engine] Daily Appt & Status Recap - ${todayStr}`,
          html: reportHtml,
        };

        await sgMail.sendMultiple(msg);
        console.log(`[Server] Successfully sent report emails via SendGrid to: ${recipients.join(', ')}`);
        res.json({ success: true, message: `Report sent successfully to ${recipients.length} recipients.`, previewHtml: reportHtml });
      } else {
        res.json({
          success: true,
          simulated: true,
          message: 'Email sent successfully (Simulated - SendGrid API key not configured).',
          previewHtml: reportHtml
        });
      }

    } catch (error: any) {
      console.error('[Server] Error sending report email:', error);
      res.status(500).json({ error: 'Failed to process and send report email.', details: error.message });
    }
  };

  app.post('/.netlify/functions/send-report-email', handleSendReportEmail);
  app.post('/api/send-report-email', handleSendReportEmail);

  // Send MSG91 Customer Intimation SMS
  const handleSendMsg91Sms = async (req: express.Request, res: express.Response) => {
    try {
      const {
        eventType,
        customerPhone,
        customerName,
        carNumber,
        carBrandModel = '',
        scheduledDate = '',
        scheduledTime = '',
        grandTotal = 0,
        feedbackUrl = '',
        serviceName = 'Auto Service',
        msg91Config
      } = req.body;

      if (!customerPhone) {
        return res.status(400).json({ error: 'Customer phone number is required.' });
      }

      // Format mobile number to 91XXXXXXXXXX
      let formattedPhone = String(customerPhone).replace(/\D/g, '');
      if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`;
      }

      const authKey = msg91Config?.authKey || process.env.MSG91_AUTH_KEY || '';
      const senderId = msg91Config?.senderId || process.env.MSG91_SENDER_ID || 'ABGENG';

      // Determine Flow ID for event
      let flowId = '';
      if (msg91Config) {
        if (eventType === 'order_created') flowId = msg91Config.orderCreatedFlowId || '';
        else if (eventType === 'order_rescheduled') flowId = msg91Config.orderRescheduledFlowId || '';
        else if (eventType === 'order_completed') flowId = msg91Config.orderCompletedFlowId || '';
        else if (eventType === 'feedback_request') flowId = msg91Config.feedbackRequestFlowId || '';
      }

      // Generate a human-readable SMS preview text for logs & simulations
      let smsText = '';
      if (eventType === 'order_created') {
        smsText = `Dear ${customerName}, your service order for ${carBrandModel} (${carNumber}) is confirmed for ${scheduledDate} at ${scheduledTime}. Total: ₹${grandTotal}. Thank you! - A Big Engine`;
      } else if (eventType === 'order_rescheduled') {
        smsText = `Dear ${customerName}, your service order for ${carBrandModel} (${carNumber}) has been rescheduled to ${scheduledDate} at ${scheduledTime}. Thank you! - A Big Engine`;
      } else if (eventType === 'order_completed') {
        smsText = `Dear ${customerName}, service for ${carBrandModel} (${carNumber}) is complete! Invoice total: ₹${grandTotal}. Thank you for choosing A Big Engine.`;
      } else if (eventType === 'feedback_request') {
        smsText = `Dear ${customerName}, thank you for choosing A Big Engine for ${carNumber}. Please rate your service experience here: ${feedbackUrl || 'https://abigengine.com/feedback'}`;
      } else {
        smsText = `A Big Engine MSG91 SMS test notification to ${customerName} (${formattedPhone}). Connection working successfully!`;
      }

      console.log(`[MSG91 SMS Gateway] Sending event: ${eventType} to ${formattedPhone}`);
      console.log(`[MSG91 SMS Text Preview]: ${smsText}`);

      if (authKey && authKey.trim().length > 5) {
        // Real MSG91 API dispatch
        if (flowId && flowId.trim().length > 0) {
          // Flow API Call
          const payload = {
            template_id: flowId.trim(),
            short_url: "1",
            recipients: [
              {
                mobiles: formattedPhone,
                name: customerName,
                customer_name: customerName,
                car_number: carNumber,
                car_model: carBrandModel,
                service_name: serviceName,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                grand_total: String(grandTotal),
                amount: String(grandTotal),
                feedback_url: feedbackUrl,
              }
            ]
          };

          console.log(`[MSG91 Flow API] Posting to https://control.msg91.com/api/v5/flow/ with template_id: ${flowId}`);
          const msg91Res = await fetch('https://control.msg91.com/api/v5/flow/', {
            method: 'POST',
            headers: {
              'authkey': authKey.trim(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const msg91Data = await msg91Res.json();
          console.log('[MSG91 Flow API Response]:', msg91Data);

          if (!msg91Res.ok || msg91Data.type === 'error') {
            return res.status(200).json({
              success: true,
              simulated: true,
              message: `MSG91 Flow API notice (${msg91Data.message || 'Check authKey/flowId'}). Simulated SMS logged successfully.`,
              smsText,
              msg91Response: msg91Data
            });
          }

          return res.json({
            success: true,
            simulated: false,
            message: `SMS dispatched successfully via MSG91 Flow API to ${formattedPhone}!`,
            msg91Response: msg91Data,
            smsText,
          });
        } else {
          // Direct SMS API v2
          const url = `https://api.msg91.com/api/v2/sendsms?authkey=${encodeURIComponent(authKey.trim())}`;
          const directPayload = {
            sender: senderId || 'ABGENG',
            route: '4', // Transactional route
            country: '91',
            sms: [
              {
                message: smsText,
                to: [formattedPhone]
              }
            ]
          };

          console.log(`[MSG91 Direct SMS] Posting to ${url}`);
          const msg91Res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(directPayload)
          });
          const msg91Data = await msg91Res.json();
          console.log('[MSG91 Direct SMS Response]:', msg91Data);

          return res.json({
            success: true,
            simulated: false,
            message: `SMS dispatched via MSG91 to ${formattedPhone}`,
            msg91Response: msg91Data,
            smsText
          });
        }
      } else {
        // Simulated response when MSG91 Auth key is not set
        return res.json({
          success: true,
          simulated: true,
          message: `SMS notification simulated to ${formattedPhone} (MSG91 Auth Key not set).`,
          smsText,
        });
      }
    } catch (error: any) {
      console.error('[MSG91 SMS Handler Error]:', error);
      res.status(500).json({ error: 'Internal server error processing MSG91 SMS.', details: error.message });
    }
  };

  app.post('/.netlify/functions/send-msg91-sms', handleSendMsg91Sms);
  app.post('/api/send-msg91-sms', handleSendMsg91Sms);

  // AI-powered Service Summarization
  app.post(['/.netlify/functions/summarize-service', '/api/summarize-service'], async (req, res) => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API_KEY or GEMINI_API_KEY environment variable not set.' });
    }

    try {
      const service = req.body;
      const ai = new GoogleGenAI({ apiKey });

      // Format helper
      let promptText = `Customer: ${service.customerFirstName} ${service.customerLastName}\n`;
      promptText += `Car: ${service.carBrandModel} (${service.carNumber})\n`;
      promptText += `Date: ${new Date(service.timestamp || Date.now()).toLocaleDateString()}\n`;
      if (service.serviceSelection && Array.isArray(service.serviceSelection)) {
        promptText += `Services Performed: ${service.serviceSelection.join(', ')}\n\n`;
      }
      promptText += "Itemized Details:\n";
      
      if (service.carWashDetails) promptText += `- Car Wash (${service.carWashDetails.washType}): ₹${Number(service.carWashDetails.price || 0).toFixed(2)}\n`;
      if (service.tyreReplacementTotalAmount > 0) promptText += `- Tyre Replacement: ₹${Number(service.tyreReplacementTotalAmount).toFixed(2)}\n`;
      if (service.batteryReplacementTotalAmount > 0) promptText += `- Battery Service: ₹${Number(service.batteryReplacementTotalAmount).toFixed(2)}\n`;
      if (service.addonsTotal > 0) promptText += `- Add-ons Total: ₹${Number(service.addonsTotal).toFixed(2)}\n`;
      if (service.customServicesTotal > 0) promptText += `- Custom Services: ₹${Number(service.customServicesTotal).toFixed(2)}\n`;

      promptText += `\nGrand Total: ₹${Number(service.grandTotal || 0).toFixed(2)}\n`;

      const prompt = `Please provide a brief, friendly summary of the following auto service record for the customer. Mention the key services performed and the grand total. Keep it under 80 words and use a positive tone. Here is the service data:\n\n${promptText}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      res.json({ summary: response.text });
    } catch (error: any) {
      console.error("[Server] Error in summarize-service function:", error);
      res.status(500).json({ error: 'Failed to generate summary.', details: error.message });
    }
  });

  // ---------------------------------------------------------
  // Neon PostgreSQL Database API Endpoints
  // ---------------------------------------------------------

  // 1. Health & Connection Status
  app.get('/api/neon/health', async (req, res) => {
    try {
      const pool = getDbPool();
      if (!pool) {
        return res.json({ connected: false, message: 'DATABASE_URL environment variable is not configured.' });
      }
      const { rows } = await queryNeon('SELECT NOW() as server_time, version() as pg_version');
      res.json({ connected: true, serverTime: rows[0]?.server_time, version: rows[0]?.pg_version });
    } catch (err: any) {
      res.status(500).json({ connected: false, error: err.message });
    }
  });

  // Diagnostics Endpoint: Full database table counts and latency check
  app.get('/api/neon/diagnostics', async (req, res) => {
    const start = Date.now();
    try {
      const pool = getDbPool();
      if (!pool) {
        return res.status(503).json({ connected: false, error: 'Database pool not initialized.' });
      }
      const [healthRes, orderCount, userCount, leadCount, custCount, invCount] = await Promise.all([
        queryNeon('SELECT NOW() as server_time, version() as pg_version'),
        queryNeon('SELECT COUNT(*)::int as c FROM service_orders'),
        queryNeon('SELECT COUNT(*)::int as c FROM app_users'),
        queryNeon('SELECT COUNT(*)::int as c FROM service_requests'),
        queryNeon('SELECT COUNT(*)::int as c FROM customers'),
        queryNeon('SELECT COUNT(*)::int as c FROM inventory_items')
      ]);
      const latencyMs = Date.now() - start;
      res.json({
        status: 'ok',
        connected: true,
        backend: 'Express Server (Node.js)',
        latencyMs,
        counts: {
          serviceOrders: orderCount.rows[0]?.c || 0,
          appUsers: userCount.rows[0]?.c || 0,
          serviceRequests: leadCount.rows[0]?.c || 0,
          customers: custCount.rows[0]?.c || 0,
          inventoryItems: invCount.rows[0]?.c || 0
        },
        serverTime: healthRes.rows[0]?.server_time,
        version: healthRes.rows[0]?.pg_version
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        connected: false,
        error: err.message,
        stack: err.stack,
        latencyMs: Date.now() - start
      });
    }
  });

  // Helper function: Group multi-line items from Neon "orders" table by order_id into cohesive Service objects
  function transformNeonWebsiteOrders(rawRows: any[]): any[] {
    const groups = new Map<string, any[]>();
    for (const r of rawRows) {
      const oid = String(r.order_id || r.id || '').trim();
      if (!oid) continue;
      if (!groups.has(oid)) {
        groups.set(oid, []);
      }
      groups.get(oid)!.push(r);
    }

    const result: any[] = [];
    for (const [orderId, items] of groups.entries()) {
      const primary = items[0];
      const slotRow = items.find(i => i.booking_date || i.booking_time) || primary;
      const carRow = items.find(i => i.car_at_order_brand || i.car_at_order_model || i.car_at_order_reg_no) || primary;

      // Customer Name
      const fullName = String(primary.user_name || '').trim();
      let firstName = fullName;
      let lastName = '';
      if (fullName && fullName.toLowerCase() !== 'customer') {
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || 'Customer';
        lastName = parts.slice(1).join(' ') || '';
      } else {
        firstName = 'Customer';
      }

      // Vehicle details
      const carBrand = String(carRow.car_at_order_brand || '').trim();
      const carModelName = String(carRow.car_at_order_model || '').trim();
      const carVersion = String(carRow.car_at_order_version || '').trim();
      const carNumber = String(carRow.car_at_order_reg_no || '').trim() || 'Pending Reg';
      const carBrandModel = [carBrand, carModelName].filter(Boolean).join(' ') || 'Vehicle';
      const tag = String(carRow.car_at_order_tag || '').trim();

      // Services & Items
      const serviceSelection: string[] = [];
      items.forEach(i => {
        const name = String(i.item_name || '').trim();
        if (name && !serviceSelection.includes(name)) {
          serviceSelection.push(name);
        }
      });
      if (serviceSelection.length === 0 && primary.service_types) {
        String(primary.service_types).split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
          if (!serviceSelection.includes(s)) serviceSelection.push(s);
        });
      }

      const websiteOrderItems = items.map(i => ({
        id: i.id,
        orderId: i.order_id,
        itemName: i.item_name || '',
        itemThumbnailSrc: i.item_thumbnail_src || '',
        itemQuantity: parseInt(i.item_quantity, 10) || 1,
        itemPrice: parseFloat(i.item_price) || 0,
        bookingDate: i.booking_date || null,
        bookingTime: i.booking_time || null,
        itemAddons: i.item_addons || [],
        carBrand: i.car_at_order_brand || '',
        carModel: i.car_at_order_model || '',
        carVersion: i.car_at_order_version || '',
        carTag: i.car_at_order_tag || '',
        carRegNo: i.car_at_order_reg_no || '',
        carColour: i.car_at_order_colour || '',
        hubId: i.hub_id || null
      }));

      // Status mapping
      const rawStatus = String(primary.status || 'Placed').trim();
      let status = 'Queued';
      if (rawStatus.toLowerCase() === 'placed') status = 'Queued';
      else if (rawStatus.toLowerCase().includes('pending')) status = 'Draft';
      else if (rawStatus.toLowerCase() === 'confirmed' || rawStatus.toLowerCase() === 'assigned') status = 'Assigned';
      else if (rawStatus.toLowerCase().includes('progress')) status = 'In Progress';
      else if (rawStatus.toLowerCase().includes('complete')) status = 'Completed';
      else if (rawStatus.toLowerCase().includes('cancel')) status = 'Cancelled';
      else status = rawStatus;

      // Payment mapping
      const payMethod = String(primary.payment_method || '').trim();
      const isPaid = payMethod.toLowerCase().includes('paid') || payMethod.toLowerCase().includes('instant') || payMethod.toLowerCase().includes('online');
      const paymentMode = payMethod.toLowerCase().includes('cash') ? 'Cash' : 'Online';

      // Grand total
      const totalAmount = parseFloat(primary.total_amount) || items.reduce((sum, i) => sum + (parseFloat(i.item_price) || 0) * (parseInt(i.item_quantity, 10) || 1), 0);
      const orderDateIso = primary.order_date ? new Date(primary.order_date).toISOString() : new Date().toISOString();

      result.push({
        id: orderId,
        submissionId: orderId,
        appointmentId: orderId,
        websiteOrderId: orderId,
        timestamp: orderDateIso,
        createdAt: orderDateIso,
        updatedAt: orderDateIso,
        customerFirstName: firstName,
        customerLastName: lastName,
        mobileNumber: String(primary.user_mobile || '').trim(),
        streetAddress: String(primary.shipping_address || '').trim(),
        carNumber,
        carBrandModel,
        carBrand,
        carModelName,
        carVersion,
        vehicleCategoryTag: tag || 'Crossover',
        serviceSelection,
        serviceTypes: primary.service_types || '',
        websiteOrderItems,
        grandTotal: totalAmount,
        status,
        scheduledDate: slotRow.booking_date || '',
        scheduledTime: slotRow.booking_time || '',
        paymentMode,
        paymentStatus: isPaid ? 'Completed' : 'Pending',
        paymentMethod: payMethod,
        paymentNotes: payMethod,
        razorpayPaymentId: primary.razorpay_payment_id || '',
        hubId: primary.hub_id || items.find(i => i.hub_id)?.hub_id || '',
        isWebsiteOrder: true,
        source: 'Website'
      });
    }

    return result;
  }

  // Dedicated Route for Website Orders directly from Neon "orders" table (supports delta querying via since parameter)
  app.get('/api/neon/website-orders', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const limitParam = req.query.limit as string;
      const sinceParam = req.query.since as string;
      const limit = limitParam === 'all' ? 50000 : (parseInt(limitParam, 10) || 1000);
      
      let query = 'SELECT * FROM "orders"';
      const params: any[] = [];
      if (sinceParam && sinceParam.trim() !== '' && sinceParam !== 'undefined' && sinceParam !== 'null') {
        query += ' WHERE "order_date" > $1';
        params.push(sinceParam);
      }
      query += ` ORDER BY "order_date" DESC, "id" DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await queryNeon(query, params);
      const orders = transformNeonWebsiteOrders(rows);
      res.json({ status: 'success', count: orders.length, rawRowsCount: rows.length, data: orders, isDelta: Boolean(sinceParam) });
    } catch (err: any) {
      console.error('Neon GET /api/neon/website-orders error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Storefront ingestion endpoint: Ingest website order into "orders" table directly
  app.post('/api/neon/website-orders', async (req, res) => {
    try {
      const b = req.body || {};
      const orderId = b.orderId || b.order_id || b.id || `ABE-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const orderDate = b.orderDate || b.order_date || nowIso;
      const userMobile = b.mobile || b.user_mobile || b.customerPhone || '';
      const userName = b.name || b.user_name || b.customerName || `${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Website Customer';
      const totalAmount = parseFloat(b.totalAmount || b.total_amount || b.amount || 0) || 0;
      const paymentMethod = b.paymentMethod || b.payment_method || 'Online / Cash';
      const razorpayPaymentId = b.razorpayPaymentId || b.razorpay_payment_id || '';
      const status = b.status || 'Placed';
      const shippingAddress = b.address || b.shippingAddress || b.shipping_address || '';
      const serviceTypes = b.serviceTypes || b.service_types || b.service || '';

      const items = Array.isArray(b.items) && b.items.length > 0 ? b.items : [{
        itemName: b.itemName || b.item_name || serviceTypes || 'Storefront Order',
        itemPrice: totalAmount,
        itemQuantity: 1,
        itemThumbnailSrc: b.itemThumbnailSrc || b.item_thumbnail_src || '',
        bookingDate: b.bookingDate || b.booking_date || null,
        bookingTime: b.bookingTime || b.booking_time || null,
        carBrand: b.carBrand || b.car_at_order_brand || '',
        carModel: b.carModel || b.car_at_order_model || '',
        carVersion: b.carVersion || b.car_at_order_version || '',
        carTag: b.carTag || b.car_at_order_tag || '',
        carRegNo: b.carRegNo || b.car_at_order_reg_no || '',
        carColour: b.carColour || b.car_at_order_colour || '',
        hubId: b.hubId || b.hub_id || null
      }];

      for (const item of items) {
        await queryNeon(
          `INSERT INTO "orders" (
            order_id, user_mobile, user_name, order_date, total_amount, payment_method,
            razorpay_payment_id, status, shipping_address, service_types,
            item_name, item_thumbnail_src, item_quantity, booking_date, booking_time,
            item_price, item_addons, car_at_order_brand, car_at_order_model,
            car_at_order_version, car_at_order_tag, car_at_order_reg_no, car_at_order_colour, hub_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            orderId,
            userMobile,
            userName,
            orderDate,
            totalAmount,
            paymentMethod,
            razorpayPaymentId,
            status,
            shippingAddress,
            serviceTypes,
            item.itemName || item.item_name || 'Service Item',
            item.itemThumbnailSrc || item.item_thumbnail_src || '',
            parseInt(item.itemQuantity || item.item_quantity || 1, 10),
            item.bookingDate || item.booking_date || null,
            item.bookingTime || item.booking_time || null,
            parseFloat(item.itemPrice || item.item_price || 0),
            JSON.stringify(item.itemAddons || item.item_addons || []),
            item.carBrand || item.car_at_order_brand || b.carBrand || '',
            item.carModel || item.car_at_order_model || b.carModel || '',
            item.carVersion || item.car_at_order_version || b.carVersion || '',
            item.carTag || item.car_at_order_tag || b.carTag || '',
            item.carRegNo || item.car_at_order_reg_no || b.carRegNo || '',
            item.carColour || item.car_at_order_colour || b.carColour || '',
            item.hubId || item.hub_id || b.hubId || null
          ]
        );
      }

      res.json({ status: 'success', orderId, itemsCount: items.length });
    } catch (err: any) {
      console.error('Neon POST /api/neon/website-orders error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 2. Fetch Orders / Submissions (Unified Neon website orders + admin service_orders)
  app.get('/api/neon/orders', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const limitParam = req.query.limit as string;
      const limit = limitParam === 'all' ? 50000 : (parseInt(limitParam, 10) || 1000);
      const statusFilter = req.query.status as string;

      // 1. Fetch website orders directly from Neon "orders" table
      let websiteOrders: any[] = [];
      try {
        const { rows: webRows } = await queryNeon('SELECT * FROM "orders" ORDER BY "order_date" DESC, "id" DESC');
        websiteOrders = transformNeonWebsiteOrders(webRows);
      } catch (webErr: any) {
        console.warn('Notice querying "orders" table:', webErr.message);
      }

      // 2. Fetch admin service_orders
      let serviceOrderRows: any[] = [];
      try {
        let queryText = 'SELECT * FROM service_orders ORDER BY created_at DESC';
        const { rows: sRows } = await queryNeon(queryText);
        serviceOrderRows = sRows;
      } catch (sErr: any) {
        console.warn('Notice querying "service_orders" table:', sErr.message);
      }

      // 3. Map service_orders into dictionary for merging admin edits
      const serviceOrdersMap = new Map<string, any>();
      const customAdminOrders: any[] = [];

      for (const r of serviceOrderRows) {
        let serviceSelection: string[] = [];
        const rawSel = r.service_selection || r.raw_data?.serviceSelection;
        if (Array.isArray(rawSel)) {
          serviceSelection = rawSel.map((item: any) => String(item || '')).filter(Boolean);
        } else if (typeof rawSel === 'string') {
          const trimmed = rawSel.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) serviceSelection = parsed.map((item: any) => String(item || '')).filter(Boolean);
            } catch (e) {
              serviceSelection = trimmed.split(',').map((s: string) => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
            }
          } else {
            serviceSelection = trimmed.split(',').map((s: string) => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
          }
        }

        const so = {
          ...r.raw_data,
          id: r.id,
          appointmentId: r.appointment_id || r.id,
          submissionId: r.submission_id || r.id,
          customerFirstName: r.customer_first_name || r.raw_data?.customerFirstName,
          customerLastName: r.customer_last_name || r.raw_data?.customerLastName,
          mobileNumber: r.mobile_number || r.raw_data?.mobileNumber,
          customerEmail: r.customer_email || r.raw_data?.customerEmail,
          carNumber: r.car_number || r.raw_data?.carNumber,
          carBrandModel: r.car_brand_model || r.raw_data?.carBrandModel,
          streetAddress: r.street_address || r.raw_data?.streetAddress,
          serviceSelection: serviceSelection.length > 0 ? serviceSelection : (r.raw_data?.serviceSelection || []),
          grandTotal: parseFloat(r.grand_total) || r.raw_data?.grandTotal || 0,
          status: r.status || r.raw_data?.status,
          assignedMechanic: r.assigned_mechanic || r.raw_data?.assignedMechanic,
          assignedTo: r.assigned_mechanic || r.raw_data?.assignedTo,
          updatedAt: r.updated_at,
          createdAt: r.created_at
        };

        serviceOrdersMap.set(String(so.id), so);
        if (so.appointmentId) serviceOrdersMap.set(String(so.appointmentId), so);
        if (so.submissionId) serviceOrdersMap.set(String(so.submissionId), so);
      }

      // 4. Merge website orders with any admin edits made in service_orders
      const mergedOrdersMap = new Map<string, any>();

      for (const wOrder of websiteOrders) {
        const orderKey = String(wOrder.id);
        const adminOverride = serviceOrdersMap.get(orderKey);
        if (adminOverride) {
          mergedOrdersMap.set(orderKey, {
            ...wOrder,
            ...adminOverride,
            // Keep rich website fields intact
            websiteOrderId: wOrder.websiteOrderId,
            websiteOrderItems: wOrder.websiteOrderItems,
            serviceTypes: wOrder.serviceTypes,
            paymentMethod: wOrder.paymentMethod,
            razorpayPaymentId: wOrder.razorpayPaymentId,
            isWebsiteOrder: true,
            // Use admin status/assignedMechanic if specifically modified
            status: adminOverride.status || wOrder.status,
            assignedMechanic: adminOverride.assignedMechanic || adminOverride.assignedTo || '',
            assignedTo: adminOverride.assignedTo || adminOverride.assignedMechanic || ''
          });
        } else {
          mergedOrdersMap.set(orderKey, wOrder);
        }
      }

      // Add service_orders that are purely internal/manual (not in website orders)
      for (const [key, so] of serviceOrdersMap.entries()) {
        if (!mergedOrdersMap.has(key) && !mergedOrdersMap.has(String(so.id))) {
          mergedOrdersMap.set(String(so.id), so);
        }
      }

      let allOrders = Array.from(mergedOrdersMap.values());

      // Filter by status if requested
      if (statusFilter && statusFilter !== 'ALL') {
        const filterLower = statusFilter.toLowerCase();
        allOrders = allOrders.filter(o => String(o.status || '').toLowerCase() === filterLower);
      }

      // Sort by date descending
      allOrders.sort((a, b) => {
        const tA = new Date(a.createdAt || a.timestamp || a.order_date || 0).getTime();
        const tB = new Date(b.createdAt || b.timestamp || b.order_date || 0).getTime();
        return tB - tA;
      });

      const paginated = allOrders.slice(0, limit);
      res.json({ status: 'success', count: paginated.length, total: allOrders.length, data: paginated });
    } catch (err: any) {
      console.error('Neon GET /api/neon/orders error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 3. Upsert Single or Batch Orders
  app.post('/api/neon/orders', async (req, res) => {
    try {
      const body = req.body;
      const orders = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      const chunkSize = 50;
      for (let i = 0; i < orders.length; i += chunkSize) {
        const chunk = orders.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (order) => {
            if (!order) return;
            const id = String(order.submissionId || order.appointmentId || order.id || order.orderId || `ORD_${Date.now()}_${Math.random()}`);
            const apptId = String(order.appointmentId || order.submissionId || id);
            const subId = String(order.submissionId || order.appointmentId || id);
            const firstName = order.customerFirstName || order.firstName || (order.userName ? order.userName.split(' ')[0] : '') || order.customerName || '';
            const lastName = order.customerLastName || order.lastName || (order.userName ? order.userName.split(' ').slice(1).join(' ') : '') || '';
            const phone = String(order.mobileNumber || order.customerPhone || order.mobile || order.userId || '');
            const email = order.customerEmail || order.email || '';
            const carNumber = order.carNumber || order.carRegNo || '';
            const carBrandModel = order.carBrandModel || `${order.carBrand || ''} ${order.carModel || ''}`.trim();
            const address = order.streetAddress || order.address || order.location || '';
            const serviceSelection = Array.isArray(order.serviceSelection) ? order.serviceSelection : (typeof order.serviceSelection === 'string' ? JSON.parse(order.serviceSelection || '[]') : []);
            const grandTotal = parseFloat(order.grandTotal) || 0;
            const status = order.status || 'Draft';
            const assignedMechanic = order.assignedMechanic || order.mechanic || '';

            await queryNeon(
              `INSERT INTO service_orders (
                id, appointment_id, submission_id, customer_first_name, customer_last_name, 
                mobile_number, customer_email, car_number, car_brand_model, 
                street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
              ON CONFLICT (id) DO UPDATE SET
                appointment_id = EXCLUDED.appointment_id,
                submission_id = EXCLUDED.submission_id,
                customer_first_name = EXCLUDED.customer_first_name,
                customer_last_name = EXCLUDED.customer_last_name,
                mobile_number = EXCLUDED.mobile_number,
                customer_email = EXCLUDED.customer_email,
                car_number = EXCLUDED.car_number,
                car_brand_model = EXCLUDED.car_brand_model,
                street_address = EXCLUDED.street_address,
                service_selection = EXCLUDED.service_selection,
                grand_total = EXCLUDED.grand_total,
                status = EXCLUDED.status,
                assigned_mechanic = EXCLUDED.assigned_mechanic,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [
                id,
                apptId,
                subId,
                firstName,
                lastName,
                phone,
                email,
                carNumber,
                carBrandModel,
                address,
                JSON.stringify(serviceSelection),
                grandTotal,
                status,
                assignedMechanic,
                JSON.stringify(order)
              ]
            );
            savedCount++;
          })
        );
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/orders error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing order id' });
      await queryNeon(`DELETE FROM service_orders WHERE id = $1 OR appointment_id = $1 OR submission_id = $1`, [id]);
      res.json({ status: 'success', message: `Order ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/orders error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const order = req.body;
      if (!id || !order) return res.status(400).json({ status: 'error', message: 'Missing order id or payload' });

      const apptId = String(order.appointmentId || order.submissionId || id);
      const subId = String(order.submissionId || order.appointmentId || id);
      const firstName = order.customerFirstName || order.firstName || (order.userName ? order.userName.split(' ')[0] : '') || order.customerName || '';
      const lastName = order.customerLastName || order.lastName || (order.userName ? order.userName.split(' ').slice(1).join(' ') : '') || '';
      const phone = String(order.mobileNumber || order.customerPhone || order.mobile || order.userId || '');
      const email = order.customerEmail || order.email || '';
      const carNumber = order.carNumber || order.carRegNo || '';
      const carBrandModel = order.carBrandModel || `${order.carBrand || ''} ${order.carModel || ''}`.trim();
      const address = order.streetAddress || order.address || order.location || '';
      const serviceSelection = Array.isArray(order.serviceSelection) ? order.serviceSelection : (typeof order.serviceSelection === 'string' ? JSON.parse(order.serviceSelection || '[]') : []);
      const grandTotal = parseFloat(order.grandTotal) || 0;
      const status = order.status || 'Draft';
      const assignedMechanic = order.assignedMechanic || order.mechanic || '';

      await queryNeon(
        `INSERT INTO service_orders (
          id, appointment_id, submission_id, customer_first_name, customer_last_name, 
          mobile_number, customer_email, car_number, car_brand_model, 
          street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (id) DO UPDATE SET
          appointment_id = EXCLUDED.appointment_id,
          submission_id = EXCLUDED.submission_id,
          customer_first_name = EXCLUDED.customer_first_name,
          customer_last_name = EXCLUDED.customer_last_name,
          mobile_number = EXCLUDED.mobile_number,
          customer_email = EXCLUDED.customer_email,
          car_number = EXCLUDED.car_number,
          car_brand_model = EXCLUDED.car_brand_model,
          street_address = EXCLUDED.street_address,
          service_selection = EXCLUDED.service_selection,
          grand_total = EXCLUDED.grand_total,
          status = EXCLUDED.status,
          assigned_mechanic = EXCLUDED.assigned_mechanic,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [
          id,
          apptId,
          subId,
          firstName,
          lastName,
          phone,
          email,
          carNumber,
          carBrandModel,
          address,
          JSON.stringify(serviceSelection),
          grandTotal,
          status,
          assignedMechanic,
          JSON.stringify(order)
        ]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/orders/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 4. Fetch / Upsert Service Requests / Leads
  app.get('/api/neon/leads', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
      const limitParam = req.query.limit as string;
      const limit = limitParam === 'all' ? 50000 : (parseInt(limitParam, 10) || 1000);
      const { rows } = await queryNeon(
        `SELECT * FROM service_requests ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      const leads = rows.map(r => ({
        ...r.raw_data,
        id: r.id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        carRegNo: r.car_reg_no,
        carBrand: r.car_brand,
        carModel: r.car_model,
        requestedService: r.requested_service,
        leadSource: r.lead_source,
        status: r.status,
        totalAmount: parseFloat(r.total_amount) || 0,
        assignedAgent: r.assigned_agent
      }));
      res.json({ status: 'success', count: leads.length, data: leads });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/leads', async (req, res) => {
    try {
      const body = req.body;
      const leads = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const lead of leads) {
        if (!lead) continue;
        const id = String(lead.id || `LEAD_${Date.now()}`);

        await queryNeon(
          `INSERT INTO service_requests (
            id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
            requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            car_reg_no = EXCLUDED.car_reg_no,
            car_brand = EXCLUDED.car_brand,
            car_model = EXCLUDED.car_model,
            requested_service = EXCLUDED.requested_service,
            lead_source = EXCLUDED.lead_source,
            status = EXCLUDED.status,
            total_amount = EXCLUDED.total_amount,
            assigned_agent = EXCLUDED.assigned_agent,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [
            id,
            lead.customerName || '',
            String(lead.customerPhone || ''),
            lead.carRegNo || '',
            lead.carBrand || '',
            lead.carModel || '',
            lead.requestedService || '',
            lead.source || lead.leadSource || '',
            lead.status || 'NEW_LEAD',
            parseFloat(lead.totalAmount) || 0,
            lead.assignedAgent || '',
            JSON.stringify(lead)
          ]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/leads error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/leads/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing lead id' });
      await queryNeon(`DELETE FROM service_requests WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Lead ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/leads error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/leads/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const lead = req.body;
      if (!id || !lead) return res.status(400).json({ status: 'error', message: 'Missing lead id or payload' });

      await queryNeon(
        `INSERT INTO service_requests (
          id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
          requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          car_reg_no = EXCLUDED.car_reg_no,
          car_brand = EXCLUDED.car_brand,
          car_model = EXCLUDED.car_model,
          requested_service = EXCLUDED.requested_service,
          lead_source = EXCLUDED.lead_source,
          status = EXCLUDED.status,
          total_amount = EXCLUDED.total_amount,
          assigned_agent = EXCLUDED.assigned_agent,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [
          id,
          lead.customerName || lead.name || '',
          String(lead.customerPhone || lead.phone || ''),
          lead.carRegNo || lead.carNumber || '',
          lead.carBrand || '',
          lead.carModel || '',
          lead.requestedService || lead.service || '',
          lead.leadSource || lead.source || '',
          lead.status || 'NEW_LEAD',
          parseFloat(lead.totalAmount) || 0,
          lead.assignedAgent || lead.agent || '',
          JSON.stringify(lead)
        ]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/leads/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 5. Users & Direct Auth on Neon
  const safeParseJson = <T>(val: any, fallback: T): T => {
    if (val === null || val === undefined || val === '') return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'string' && fallback && typeof fallback === 'object') {
          try { return JSON.parse(parsed); } catch { return parsed as any; }
        }
        return parsed;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const getDefaultPermissionsForRole = (role: string): string[] => {
    const technicianPermissions = [
      "CAN_VIEW_DASHBOARD", "CAN_CREATE_ORDERS", "CAN_EDIT_OWN_ORDERS",
      "CAN_VIEW_SERVICE_HISTORY", "CAN_VIEW_APPOINTMENTS_OVERVIEW", "CAN_LOG_EXPENSES"
    ];
    const salesAgentPermissions = [
      "CAN_VIEW_DASHBOARD", "CAN_CREATE_ORDERS", "CAN_EDIT_OWN_ORDERS",
      "CAN_VIEW_SERVICE_HISTORY", "CAN_VIEW_CUSTOMER_HISTORY", "CAN_VIEW_RETENTION_DASHBOARD",
      "CAN_VIEW_SERVICE_REQUESTS", "CAN_LOG_EXPENSES"
    ];
    const managerPermissions = [
      ...technicianPermissions,
      "CAN_ASSIGN_ORDERS", "CAN_EDIT_ANY_ORDER", "CAN_DELETE_ORDERS",
      "CAN_VIEW_ANALYTICS", "CAN_VIEW_LIVE_MAP", "CAN_VIEW_CUSTOMER_HISTORY",
      "CAN_VIEW_RETENTION_DASHBOARD", "CAN_MANAGE_BOOKKEEPING", "CAN_VIEW_PROFIT_LOSS",
      "CAN_MANAGE_USERS", "CAN_MANAGE_SUBSCRIPTIONS", "CAN_MANAGE_PLANS", "CAN_MANAGE_ADDONS",
      "CAN_MANAGE_SERVICES", "CAN_VIEW_SERVICE_REQUESTS", "CAN_VIEW_TRASH", "CAN_MANAGE_SPEND_CATEGORIES"
    ];
    const adminPermissions = [
      ...managerPermissions,
      "CAN_MANAGE_PRICING", "CAN_EDIT_SETTINGS", "CAN_MANAGE_ADMINS"
    ];

    switch (role) {
      case 'admin': return adminPermissions;
      case 'manager': return managerPermissions;
      case 'agent':
      case 'sales_agent': return salesAgentPermissions;
      case 'technician': return technicianPermissions;
      default: return salesAgentPermissions;
    }
  };

  app.post('/api/neon/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username and password required' });
      }

      const rawInput = String(username).trim();
      const cleanInput = rawInput.toLowerCase();
      const cleanPass = String(password).trim();

      // Search in app_users table: exact match or case-insensitive match on username OR email
      let { rows } = await queryNeon(
        `SELECT * FROM app_users 
         WHERE username = $1 OR LOWER(username) = $2 OR email = $1 OR LOWER(email) = $2
         ORDER BY CASE 
           WHEN username = $1 THEN 0 
           WHEN LOWER(username) = $2 THEN 1 
           WHEN email = $1 THEN 2 
           ELSE 3 
         END`,
        [rawInput, cleanInput]
      );

      // If not found in app_users, fallback to checking generic app_synced_collections 'users'
      if (rows.length === 0) {
        const colRes = await queryNeon(
          `SELECT data FROM app_synced_collections WHERE collection_name = 'users' LIMIT 1`
        );
        if (colRes.rows.length > 0 && Array.isArray(colRes.rows[0].data)) {
          const userObj = colRes.rows[0].data.find((u: any) => {
            if (!u) return false;
            const uName = String(u.username || '').trim();
            const uEmail = String(u.email || '').trim();
            return uName === rawInput || uName.toLowerCase() === cleanInput || (uEmail !== '' && (uEmail === rawInput || uEmail.toLowerCase() === cleanInput));
          });
          if (userObj) {
            const userPass = String(userObj.password || '').trim();
            if (userPass === cleanPass || userObj.password === password) {
              const { password: _, ...safeUser } = userObj;
              safeUser.permissions = Array.isArray(safeUser.permissions) ? safeUser.permissions : safeParseJson(safeUser.permissions, getDefaultPermissionsForRole(safeUser.role || 'agent'));
              safeUser.specialties = Array.isArray(safeUser.specialties) ? safeUser.specialties : safeParseJson(safeUser.specialties, []);
              return res.json({ status: 'success', user: safeUser, source: 'neon_collection' });
            }
          }
        }
      } else {
        // Find matching candidate by password first among all matches (handles accounts with casing variations like Arka / arka or ARUPTEST / aruptest)
        let dbUser = rows.find(r => {
          const dbPass = String(r.password || '').trim();
          return dbPass === cleanPass || r.password === password;
        });

        // If no password match found, take exact username/email match if available, or first row
        if (!dbUser) {
          dbUser = rows.find(r => r.username === rawInput || r.email === rawInput) || rows[0];
        }

        const dbPass = String(dbUser.password || '').trim();
        if (dbPass === cleanPass || dbUser.password === password) {
          if (dbUser.is_active === false) {
            return res.status(403).json({ status: 'error', message: 'Account is deactivated. Please contact your administrator.' });
          }

          const raw = dbUser.raw_data || {};
          let role = dbUser.role || raw.role || 'agent';
          if (role === 'sales_agent') role = 'agent';

          let parsedPerms = safeParseJson(dbUser.permissions, safeParseJson(raw.permissions, []));
          if (!Array.isArray(parsedPerms) || parsedPerms.length === 0) {
            parsedPerms = getDefaultPermissionsForRole(role);
          }

          const parsedSpecs = safeParseJson(dbUser.specialties, safeParseJson(raw.specialties, []));
          const parsedAttendanceHistory = safeParseJson(raw.attendanceHistory, []);
          const parsedNotificationPreferences = safeParseJson(raw.notificationPreferences, {
            enabled: { assigned: true, reminder: true, queued: true, completed: true, manual: true, overdue: true },
            sound: 'default',
            vibration: true
          });

          const safeUser = {
            ...raw,
            username: dbUser.username,
            email: dbUser.email || raw.email || '',
            name: dbUser.name || raw.name || dbUser.username,
            role,
            phone: dbUser.phone || raw.phone || '',
            agentCategory: dbUser.agent_category || raw.agentCategory || 'SALES_AGENT',
            specialties: Array.isArray(parsedSpecs) ? parsedSpecs : [],
            assignedHub: dbUser.assigned_hub || raw.assignedHub || '',
            permissions: parsedPerms,
            attendanceHistory: Array.isArray(parsedAttendanceHistory) ? parsedAttendanceHistory : [],
            notificationPreferences: parsedNotificationPreferences,
            isActive: dbUser.is_active ?? true
          };
          delete (safeUser as any).password;
          return res.json({ status: 'success', user: safeUser, source: 'neon_db' });
        }
      }

      return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
    } catch (err: any) {
      console.error('Neon /api/neon/auth/login error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/neon/users', async (req, res) => {
    try {
      // 1. Fetch from app_users table
      const { rows } = await queryNeon(`SELECT * FROM app_users ORDER BY username ASC`);
      if (rows.length > 0) {
        const users = rows.map(r => {
          const raw = r.raw_data || {};
          let role = r.role || raw.role || 'agent';
          if (role === 'sales_agent') role = 'agent';

          let parsedPerms = safeParseJson(r.permissions, safeParseJson(raw.permissions, []));
          if (!Array.isArray(parsedPerms) || parsedPerms.length === 0) {
            parsedPerms = getDefaultPermissionsForRole(role);
          }

          const parsedSpecs = safeParseJson(r.specialties, safeParseJson(raw.specialties, []));
          const parsedAttendanceHistory = safeParseJson(raw.attendanceHistory, []);
          const parsedNotificationPreferences = safeParseJson(raw.notificationPreferences, undefined);

          return {
            ...raw,
            username: r.username,
            email: r.email || raw.email || '',
            name: r.name || raw.name || r.username,
            role,
            password: r.password,
            phone: r.phone || raw.phone || '',
            agentCategory: r.agent_category || raw.agentCategory || 'SALES_AGENT',
            specialties: Array.isArray(parsedSpecs) ? parsedSpecs : [],
            assignedHub: r.assigned_hub || raw.assignedHub || '',
            permissions: parsedPerms,
            attendanceHistory: Array.isArray(parsedAttendanceHistory) ? parsedAttendanceHistory : [],
            notificationPreferences: parsedNotificationPreferences,
            isActive: r.is_active ?? true
          };
        });
        return res.json({ status: 'success', count: users.length, data: users });
      }

      // 2. Fallback to app_synced_collections
      const colRes = await queryNeon(`SELECT data FROM app_synced_collections WHERE collection_name = 'users' LIMIT 1`);
      if (colRes.rows.length > 0 && Array.isArray(colRes.rows[0].data)) {
        return res.json({ status: 'success', count: colRes.rows[0].data.length, data: colRes.rows[0].data });
      }

      res.json({ status: 'success', count: 0, data: [] });
    } catch (err: any) {
      console.error('Neon GET /api/neon/users error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/users', async (req, res) => {
    try {
      const body = req.body;
      const users = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const u of users) {
        if (!u || !u.username) continue;
        const username = String(u.username).trim();
        const specs = Array.isArray(u.specialties) ? u.specialties : safeParseJson(u.specialties, []);
        const perms = Array.isArray(u.permissions) ? u.permissions : safeParseJson(u.permissions, []);

        await queryNeon(
          `INSERT INTO app_users (
            username, email, name, role, password, phone, agent_category, specialties, assigned_hub, is_active, permissions, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (username) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            password = COALESCE(NULLIF(EXCLUDED.password, ''), app_users.password),
            phone = EXCLUDED.phone,
            agent_category = EXCLUDED.agent_category,
            specialties = EXCLUDED.specialties,
            assigned_hub = EXCLUDED.assigned_hub,
            is_active = EXCLUDED.is_active,
            permissions = EXCLUDED.permissions,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [
            username,
            u.email || '',
            u.name || username,
            u.role || 'sales_agent',
            u.password || '',
            u.phone || '',
            u.agentCategory || 'SALES_AGENT',
            JSON.stringify(specs),
            u.assignedHub || '',
            u.isActive ?? true,
            JSON.stringify(perms),
            JSON.stringify(u)
          ]
        );
        savedCount++;
      }

      // Also mirror to app_synced_collections for universal availability
      await queryNeon(
        `INSERT INTO app_synced_collections (collection_name, data, updated_at)
         VALUES ('users', $1, NOW())
         ON CONFLICT (collection_name) DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [JSON.stringify(users)]
      );

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/users error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 6. Generic Collection Store (Sync inventories, templates, warranties without Firestore bill)
  app.get(['/api/neon/collection/:name', '/api/neon/collections/:name'], async (req, res) => {
    try {
      const { name } = req.params;
      const { rows } = await queryNeon(
        `SELECT data, updated_at FROM app_synced_collections WHERE collection_name = $1 LIMIT 1`,
        [name]
      );
      if (rows.length === 0) {
        return res.json({ status: 'success', data: [], exists: false });
      }
      res.json({ status: 'success', data: rows[0].data, updatedAt: rows[0].updated_at, exists: true });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post(['/api/neon/collection/:name', '/api/neon/collections/:name'], async (req, res) => {
    try {
      const { name } = req.params;
      const data = req.body;
      await queryNeon(
        `INSERT INTO app_synced_collections (collection_name, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (collection_name) DO UPDATE SET
           data = EXCLUDED.data,
           version = app_synced_collections.version + 1,
           updated_at = NOW()`,
        [name, JSON.stringify(data)]
      );
      res.json({ status: 'success', collection: name });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ==========================================
  // RELATIONAL POSTGRESQL STORES (HIGH-PERFORMANCE SSOT)
  // ==========================================

  // 1. Customers Table (Dedicated relational store for Customer Book)
  app.get('/api/neon/customers', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
      const limitParam = req.query.limit as string;
      const limit = limitParam === 'all' ? 50000 : (parseInt(limitParam, 10) || 1000);
      const search = (req.query.q as string || req.query.search as string || '').trim().toLowerCase();

      let queryText = 'SELECT * FROM customers';
      const params: any[] = [];
      if (search) {
        queryText += ' WHERE LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1 OR mobile_number LIKE $1 OR LOWER(customer_email) LIKE $1';
        params.push(`%${search}%`);
        params.push(limit);
        queryText += ' ORDER BY updated_at DESC LIMIT $2';
      } else {
        params.push(limit);
        queryText += ' ORDER BY updated_at DESC LIMIT $1';
      }

      const { rows } = await queryNeon(queryText, params);
      const customers = rows.map(r => {
        const raw = safeParseJson<Record<string, any>>(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          firstName: r.first_name || raw.firstName || '',
          lastName: r.last_name || raw.lastName || '',
          mobileNumber: r.mobile_number || raw.mobileNumber || '',
          customerEmail: r.customer_email || raw.customerEmail || '',
          streetAddress: r.street_address || raw.streetAddress || '',
          latitude: r.latitude || raw.latitude || '',
          longitude: r.longitude || raw.longitude || '',
          savedVehicles: safeParseJson(r.saved_vehicles, raw.savedVehicles || []),
          totalSpent: parseFloat(r.total_spent) || raw.totalSpent || 0,
          totalOrders: parseInt(r.total_orders, 10) || raw.totalOrders || 0,
          notes: r.notes || raw.notes || '',
          lastServiceDate: r.last_service_date || raw.lastServiceDate,
          updatedAt: r.updated_at
        };
      });

      res.json({ status: 'success', data: customers, count: customers.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/customers error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 1b. Fast Customer Lookup by Phone Number across Customers, Orders & Leads
  app.get('/api/customer/lookup', async (req, res) => {
    try {
      const rawPhone = String(req.query.phone || req.query.mobile || '').trim();
      const cleanDigits = rawPhone.replace(/\D/g, '');
      const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

      if (!last10 || last10.length < 3) {
        return res.status(400).json({ status: 'error', message: 'Valid phone digits required (min 3 digits)' });
      }

      // 1. Check customers table
      const custRes = await queryNeon(
        `SELECT * FROM customers WHERE mobile_number LIKE $1 OR mobile_number LIKE $2 LIMIT 1`,
        [`%${last10}%`, `%${cleanDigits}%`]
      );

      // 2. Check service_orders table (finds latest order by this customer)
      const orderRes = await queryNeon(
        `SELECT * FROM service_orders WHERE mobile_number LIKE $1 OR mobile_number LIKE $2 ORDER BY created_at DESC LIMIT 10`,
        [`%${last10}%`, `%${cleanDigits}%`]
      );

      // 3. Check service_requests table (leads / website orders)
      const leadRes = await queryNeon(
        `SELECT * FROM service_requests WHERE customer_phone LIKE $1 OR customer_phone LIKE $2 ORDER BY created_at DESC LIMIT 10`,
        [`%${last10}%`, `%${cleanDigits}%`]
      );

      // 4. Check user_subscriptions table
      const subRes = await queryNeon(
        `SELECT * FROM user_subscriptions WHERE mobile_number LIKE $1 OR mobile_number LIKE $2 LIMIT 5`,
        [`%${last10}%`, `%${cleanDigits}%`]
      );

      if (custRes.rows.length === 0 && orderRes.rows.length === 0 && leadRes.rows.length === 0 && subRes.rows.length === 0) {
        return res.json({ status: 'not_found', message: 'No customer found for this mobile number' });
      }

      let firstName = '';
      let lastName = '';
      let mobileNumber = cleanDigits;
      let customerEmail = '';
      let streetAddress = '';
      let houseNo = '';
      let streetName = '';
      let city = '';
      let stateName = '';
      let pincode = '';
      let latitude: number | undefined = undefined;
      let longitude: number | undefined = undefined;
      let eLoc = '';
      let distanceKm: number | undefined = undefined;
      let savedVehicles: Array<{ carNumber: string; carBrandModel: string; vehicleCategoryTag?: string; bookingCount?: number }> = [];

      // Extract from customers table if present
      if (custRes.rows.length > 0) {
        const c = custRes.rows[0];
        const raw = safeParseJson<Record<string, any>>(c.raw_data, {});
        firstName = c.first_name || raw.firstName || '';
        lastName = c.last_name || raw.lastName || '';
        mobileNumber = c.mobile_number || raw.mobileNumber || mobileNumber;
        customerEmail = c.customer_email || raw.customerEmail || '';
        streetAddress = c.street_address || raw.streetAddress || '';
        houseNo = raw.houseNo || '';
        streetName = raw.streetName || '';
        city = raw.city || '';
        stateName = raw.stateName || '';
        pincode = raw.pincode || '';
        latitude = parseFloat(c.latitude) || raw.latitude || undefined;
        longitude = parseFloat(c.longitude) || raw.longitude || undefined;
        eLoc = raw.eLoc || '';
        distanceKm = raw.distanceKm || undefined;
        savedVehicles = safeParseJson(c.saved_vehicles, raw.savedVehicles || []);
      }

      // Supplement from orders
      for (const o of orderRes.rows) {
        const raw = safeParseJson<Record<string, any>>(o.raw_data, {});
        if (!firstName) firstName = o.customer_first_name || raw.customerFirstName || '';
        if (!lastName) lastName = o.customer_last_name || raw.customerLastName || '';
        if (!mobileNumber) mobileNumber = o.mobile_number || raw.mobileNumber || '';
        if (!customerEmail) customerEmail = o.customer_email || raw.customerEmail || '';
        if (!streetAddress) streetAddress = o.street_address || raw.streetAddress || '';
        if (!latitude && (raw.customerLatitude || raw.latitude)) latitude = parseFloat(raw.customerLatitude || raw.latitude);
        if (!longitude && (raw.customerLongitude || raw.longitude)) longitude = parseFloat(raw.customerLongitude || raw.longitude);
        if (!eLoc && (raw.customerELoc || raw.eLoc)) eLoc = raw.customerELoc || raw.eLoc;
        if (!distanceKm && (raw.customerDistanceKm || raw.distanceKm)) distanceKm = parseFloat(raw.customerDistanceKm || raw.distanceKm);

        const cNum = (o.car_number || raw.carNumber || '').toUpperCase().trim();
        const cModel = o.car_brand_model || raw.carBrandModel || '';
        if (cNum && !savedVehicles.some(v => v.carNumber.toUpperCase() === cNum)) {
          savedVehicles.push({ carNumber: cNum, carBrandModel: cModel, vehicleCategoryTag: raw.vehicleCategoryTag });
        }
      }

      // Supplement from leads
      for (const l of leadRes.rows) {
        const raw = safeParseJson<Record<string, any>>(l.raw_data, {});
        if (!firstName) {
          const parts = (l.customer_name || raw.customerName || '').split(' ');
          firstName = parts[0] || '';
          if (!lastName) lastName = parts.slice(1).join(' ') || '';
        }
        if (!customerEmail && (raw.customerEmail || raw.email)) customerEmail = raw.customerEmail || raw.email;
        if (!streetAddress && (raw.streetAddress || raw.address)) streetAddress = raw.streetAddress || raw.address;
        const cNum = (l.car_reg_no || raw.carRegNo || raw.carNumber || '').toUpperCase().trim();
        const cModel = `${l.car_brand || raw.carBrand || ''} ${l.car_model || raw.carModel || ''}`.trim() || raw.carBrandModel || '';
        if (cNum && !savedVehicles.some(v => v.carNumber.toUpperCase() === cNum)) {
          savedVehicles.push({ carNumber: cNum, carBrandModel: cModel });
        }
      }

      // Check active subscription
      let isSubscriber = false;
      let washesRemaining = 0;
      let subscriptionPlanName = '';
      if (subRes.rows.length > 0) {
        const now = new Date();
        const activeSub = subRes.rows.find(s => {
          const raw = safeParseJson<Record<string, any>>(s.raw_data, {});
          const end = s.end_date || raw.endDate;
          return end && new Date(end) > now;
        });
        if (activeSub) {
          const raw = safeParseJson<Record<string, any>>(activeSub.raw_data, {});
          isSubscriber = true;
          washesRemaining = parseInt(activeSub.washes_remaining || raw.washesRemaining, 10) || 0;
          subscriptionPlanName = activeSub.plan_name || raw.planName || 'Active Plan';
        }
      }

      return res.json({
        status: 'success',
        customer: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim() || 'Customer',
          mobileNumber,
          customerEmail,
          streetAddress,
          houseNo,
          streetName,
          city,
          stateName,
          pincode,
          latitude,
          longitude,
          eLoc,
          distanceKm
        },
        savedVehicles,
        isSubscriber,
        washesRemaining,
        subscriptionPlanName
      });
    } catch (err: any) {
      console.error('Customer lookup error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/customers', async (req, res) => {
    try {
      const body = req.body;
      const customers = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      const chunkSize = 50;
      for (let i = 0; i < customers.length; i += chunkSize) {
        const chunk = customers.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (c) => {
            if (!c) return;
            const id = String(c.id || c.mobileNumber || `CUST_${Date.now()}_${Math.random()}`);
            const firstName = c.firstName || '';
            const lastName = c.lastName || '';
            const phone = String(c.mobileNumber || c.phone || '');
            const email = c.customerEmail || c.email || '';
            const address = c.streetAddress || c.address || '';
            const lat = String(c.latitude || '');
            const lng = String(c.longitude || '');
            let savedVehicles = c.savedVehicles || [];
            if (typeof savedVehicles === 'string') {
              try { savedVehicles = JSON.parse(savedVehicles); } catch { savedVehicles = []; }
            }
            const totalSpent = parseFloat(c.totalSpent) || 0;
            const totalOrders = parseInt(c.totalOrders, 10) || 0;
            const notes = c.notes || '';

            await queryNeon(
              `INSERT INTO customers (
                id, first_name, last_name, mobile_number, customer_email, street_address,
                latitude, longitude, saved_vehicles, total_spent, total_orders, notes, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
              ON CONFLICT (id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                mobile_number = EXCLUDED.mobile_number,
                customer_email = EXCLUDED.customer_email,
                street_address = EXCLUDED.street_address,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                saved_vehicles = EXCLUDED.saved_vehicles,
                total_spent = EXCLUDED.total_spent,
                total_orders = EXCLUDED.total_orders,
                notes = EXCLUDED.notes,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [id, firstName, lastName, phone, email, address, lat, lng, JSON.stringify(savedVehicles), totalSpent, totalOrders, notes, JSON.stringify(c)]
            );
            savedCount++;
          })
        );
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/customers error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/customers/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const c = req.body;
      if (!id || !c) return res.status(400).json({ status: 'error', message: 'Missing customer id or payload' });

      const firstName = c.firstName || '';
      const lastName = c.lastName || '';
      const phone = String(c.mobileNumber || c.phone || '');
      const email = c.customerEmail || c.email || '';
      const address = c.streetAddress || c.address || '';
      const lat = String(c.latitude || '');
      const lng = String(c.longitude || '');
      let savedVehicles = c.savedVehicles || [];
      if (typeof savedVehicles === 'string') {
        try { savedVehicles = JSON.parse(savedVehicles); } catch { savedVehicles = []; }
      }
      const totalSpent = parseFloat(c.totalSpent) || 0;
      const totalOrders = parseInt(c.totalOrders, 10) || 0;
      const notes = c.notes || '';

      await queryNeon(
        `INSERT INTO customers (
          id, first_name, last_name, mobile_number, customer_email, street_address,
          latitude, longitude, saved_vehicles, total_spent, total_orders, notes, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          mobile_number = EXCLUDED.mobile_number,
          customer_email = EXCLUDED.customer_email,
          street_address = EXCLUDED.street_address,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          saved_vehicles = EXCLUDED.saved_vehicles,
          total_spent = EXCLUDED.total_spent,
          total_orders = EXCLUDED.total_orders,
          notes = EXCLUDED.notes,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [id, firstName, lastName, phone, email, address, lat, lng, JSON.stringify(savedVehicles), totalSpent, totalOrders, notes, JSON.stringify(c)]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/customers/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/customers/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing customer id' });
      await queryNeon(`DELETE FROM customers WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Customer ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/customers error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 2. Inventory Items Table
  app.get('/api/neon/inventory', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 50000 : (parseInt(limitParam, 10) || 50000);
      const category = req.query.category as string;
      const search = (req.query.q as string || req.query.search as string || '').trim().toLowerCase();

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (category && category !== 'ALL') {
        conditions.push(`LOWER(category) = LOWER($${paramIdx++})`);
        params.push(category);
      }
      if (search) {
        conditions.push(`(LOWER(name) LIKE $${paramIdx} OR LOWER(sku) LIKE $${paramIdx} OR LOWER(brand) LIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);
      const queryText = `SELECT * FROM inventory_items ${whereClause} ORDER BY name ASC LIMIT $${paramIdx}`;

      const { rows } = await queryNeon(queryText, params);
      const items = rows.map(r => {
        const raw = safeParseJson<Record<string, any>>(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          sku: r.sku || raw.sku || '',
          name: r.name || raw.name || '',
          category: r.category || raw.category || 'General',
          brand: r.brand || raw.brand || '',
          unitCost: parseFloat(r.unit_cost) || raw.unitCost || 0,
          sellingPrice: parseFloat(r.selling_price) || raw.sellingPrice || 0,
          quantityInStock: parseFloat(r.quantity_in_stock) ?? raw.quantityInStock ?? 0,
          minStockAlert: parseFloat(r.min_stock_alert) || raw.minStockAlert || 5,
          unitOfMeasure: r.unit_of_measure || raw.unitOfMeasure || 'piece',
          location: r.location || raw.location || '',
          compatibleCars: safeParseJson(r.compatible_cars, raw.compatibleCars || []),
          updatedAt: r.updated_at
        };
      });

      res.json({ status: 'success', data: items, count: items.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/inventory error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/inventory', async (req, res) => {
    try {
      const body = req.body;
      const items = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      const chunkSize = 50;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (item) => {
            if (!item) return;
            const id = String(item.id || item.sku || `INV_${Date.now()}_${Math.random()}`);
            const sku = item.sku ? String(item.sku).trim() : null;
            const name = item.name || 'Unnamed Item';
            const category = item.category || 'General';
            const brand = item.brand || '';
            const unitCost = parseFloat(item.unitCost) || 0;
            const sellingPrice = parseFloat(item.sellingPrice) || 0;
            const qty = parseFloat(item.quantityInStock ?? item.quantity) || 0;
            const minAlert = parseFloat(item.minStockAlert) || 5;
            const uom = item.unitOfMeasure || 'piece';
            const location = item.location || '';
            let compatibleCars = item.compatibleCars || [];
            if (typeof compatibleCars === 'string') {
              try { compatibleCars = JSON.parse(compatibleCars); } catch { compatibleCars = []; }
            }

            const upsertItem = async () => {
              return queryNeon(
                `INSERT INTO inventory_items (
                  id, sku, name, category, brand, unit_cost, selling_price, quantity_in_stock,
                  min_stock_alert, unit_of_measure, location, compatible_cars, raw_data, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
                ON CONFLICT (id) DO UPDATE SET
                  sku = EXCLUDED.sku,
                  name = EXCLUDED.name,
                  category = EXCLUDED.category,
                  brand = EXCLUDED.brand,
                  unit_cost = EXCLUDED.unit_cost,
                  selling_price = EXCLUDED.selling_price,
                  quantity_in_stock = EXCLUDED.quantity_in_stock,
                  min_stock_alert = EXCLUDED.min_stock_alert,
                  unit_of_measure = EXCLUDED.unit_of_measure,
                  location = EXCLUDED.location,
                  compatible_cars = EXCLUDED.compatible_cars,
                  raw_data = EXCLUDED.raw_data,
                  updated_at = NOW()`,
                [id, sku, name, category, brand, unitCost, sellingPrice, qty, minAlert, uom, location, JSON.stringify(compatibleCars), JSON.stringify(item)]
              );
            };

            try {
              await upsertItem();
              savedCount++;
            } catch (itemErr: any) {
              if (itemErr?.code === '23505' && (itemErr?.constraint === 'inventory_items_sku_key' || String(itemErr?.message).includes('inventory_items_sku_key'))) {
                try {
                  console.warn('⚠️ [Neon Inventory] Dropping conflicting legacy inventory_items_sku_key constraint and retrying...');
                  await queryNeon('ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_sku_key CASCADE;');
                  await upsertItem();
                  savedCount++;
                } catch (retryErr: any) {
                  console.error(`Neon POST /api/neon/inventory retry error for item ${id}:`, retryErr);
                }
              } else {
                console.error(`Neon POST /api/neon/inventory error for item ${id}:`, itemErr);
                throw itemErr;
              }
            }
          })
        );
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/inventory error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/inventory/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const item = req.body;
      if (!id || !item) return res.status(400).json({ status: 'error', message: 'Missing item id or payload' });

      const sku = item.sku ? String(item.sku).trim() : null;
      const name = item.name || 'Unnamed Item';
      const category = item.category || 'General';
      const brand = item.brand || '';
      const unitCost = parseFloat(item.unitCost) || 0;
      const sellingPrice = parseFloat(item.sellingPrice) || 0;
      const qty = parseFloat(item.quantityInStock ?? item.quantity) || 0;
      const minAlert = parseFloat(item.minStockAlert) || 5;
      const uom = item.unitOfMeasure || 'piece';
      const location = item.location || '';
      let compatibleCars = item.compatibleCars || [];
      if (typeof compatibleCars === 'string') {
        try { compatibleCars = JSON.parse(compatibleCars); } catch { compatibleCars = []; }
      }

      const upsertItem = async () => {
        return queryNeon(
          `INSERT INTO inventory_items (
            id, sku, name, category, brand, unit_cost, selling_price, quantity_in_stock,
            min_stock_alert, unit_of_measure, location, compatible_cars, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (id) DO UPDATE SET
            sku = EXCLUDED.sku,
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            brand = EXCLUDED.brand,
            unit_cost = EXCLUDED.unit_cost,
            selling_price = EXCLUDED.selling_price,
            quantity_in_stock = EXCLUDED.quantity_in_stock,
            min_stock_alert = EXCLUDED.min_stock_alert,
            unit_of_measure = EXCLUDED.unit_of_measure,
            location = EXCLUDED.location,
            compatible_cars = EXCLUDED.compatible_cars,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [id, sku, name, category, brand, unitCost, sellingPrice, qty, minAlert, uom, location, JSON.stringify(compatibleCars), JSON.stringify(item)]
        );
      };

      try {
        await upsertItem();
      } catch (itemErr: any) {
        if (itemErr?.code === '23505' && (itemErr?.constraint === 'inventory_items_sku_key' || String(itemErr?.message).includes('inventory_items_sku_key'))) {
          console.warn('⚠️ [Neon Inventory] Dropping conflicting legacy inventory_items_sku_key constraint and retrying PUT...');
          await queryNeon('ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_sku_key CASCADE;');
          await upsertItem();
        } else {
          throw itemErr;
        }
      }
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/inventory/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/inventory/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing item id' });
      await queryNeon(`DELETE FROM inventory_items WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Inventory item ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/inventory error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 3. Expenses Table (Dedicated relational store for expense_records)
  app.get('/api/neon/expenses', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 50000 : (parseInt(limitParam, 10) || 50000);
      const category = req.query.category as string;

      let queryText = 'SELECT * FROM expense_records';
      const params: any[] = [];
      if (category && category !== 'ALL') {
        queryText += ' WHERE LOWER(category) = LOWER($1) ORDER BY created_at DESC LIMIT $2';
        params.push(category, limit);
      } else {
        queryText += ' ORDER BY created_at DESC LIMIT $1';
        params.push(limit);
      }

      const { rows } = await queryNeon(queryText, params);
      const expenses = rows.map(r => {
        const raw = safeParseJson<Record<string, any>>(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          title: r.title || raw.title || '',
          category: r.category || raw.category || 'General',
          amount: parseFloat(r.amount) || raw.amount || 0,
          expenseDate: r.expense_date || raw.expenseDate || raw.date,
          paymentMode: r.payment_mode || raw.paymentMode || '',
          recordedBy: r.recorded_by || raw.recordedBy || '',
          receiptUrl: r.receipt_url || raw.receiptUrl || '',
          notes: r.notes || raw.notes || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });

      res.json({ status: 'success', data: expenses, count: expenses.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/expenses error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/expenses', async (req, res) => {
    try {
      const body = req.body;
      const expenses = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      const chunkSize = 50;
      for (let i = 0; i < expenses.length; i += chunkSize) {
        const chunk = expenses.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (exp) => {
            if (!exp) return;
            const id = String(exp.id || `EXP_${Date.now()}_${Math.random()}`);
            const title = exp.title || exp.name || 'Expense';
            const category = exp.category || 'General';
            const amount = parseFloat(exp.amount) || 0;
            const expDate = String(exp.expenseDate || exp.date || new Date().toISOString());
            const payMode = exp.paymentMode || exp.paymentMethod || '';
            const recordedBy = exp.recordedBy || exp.userName || '';
            const receipt = exp.receiptUrl || exp.receipt || '';
            const notes = exp.notes || '';

            await queryNeon(
              `INSERT INTO expense_records (
                id, title, category, amount, expense_date, payment_mode, recorded_by, receipt_url, notes, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                category = EXCLUDED.category,
                amount = EXCLUDED.amount,
                expense_date = EXCLUDED.expense_date,
                payment_mode = EXCLUDED.payment_mode,
                recorded_by = EXCLUDED.recorded_by,
                receipt_url = EXCLUDED.receipt_url,
                notes = EXCLUDED.notes,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [id, title, category, amount, expDate, payMode, recordedBy, receipt, notes, JSON.stringify(exp)]
            );
            savedCount++;
          })
        );
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/expenses error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/expenses/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const exp = req.body;
      if (!id || !exp) return res.status(400).json({ status: 'error', message: 'Missing expense id or payload' });

      const title = exp.title || exp.name || 'Expense';
      const category = exp.category || 'General';
      const amount = parseFloat(exp.amount) || 0;
      const expDate = String(exp.expenseDate || exp.date || new Date().toISOString());
      const payMode = exp.paymentMode || exp.paymentMethod || '';
      const recordedBy = exp.recordedBy || exp.userName || '';
      const receipt = exp.receiptUrl || exp.receipt || '';
      const notes = exp.notes || '';

      await queryNeon(
        `INSERT INTO expense_records (
          id, title, category, amount, expense_date, payment_mode, recorded_by, receipt_url, notes, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          expense_date = EXCLUDED.expense_date,
          payment_mode = EXCLUDED.payment_mode,
          recorded_by = EXCLUDED.recorded_by,
          receipt_url = EXCLUDED.receipt_url,
          notes = EXCLUDED.notes,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [id, title, category, amount, expDate, payMode, recordedBy, receipt, notes, JSON.stringify(exp)]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/expenses/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/expenses/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing expense id' });
      await queryNeon(`DELETE FROM expense_records WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Expense ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/expenses error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 4. Warranties Table (Dedicated relational store for warranties)
  app.get('/api/neon/warranties', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 50000 : (parseInt(limitParam, 10) || 50000);
      const { rows } = await queryNeon(`SELECT * FROM warranties ORDER BY created_at DESC LIMIT $1`, [limit]);
      const warranties = rows.map(r => {
        const raw = safeParseJson<Record<string, any>>(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          orderId: r.order_id || raw.orderId || '',
          customerName: r.customer_name || raw.customerName || '',
          customerPhone: r.customer_phone || raw.customerPhone || '',
          carNumber: r.car_number || raw.carNumber || '',
          serviceOrPart: r.service_or_part || raw.serviceOrPart || '',
          warrantyPeriodMonths: r.warranty_period_months || raw.warrantyPeriodMonths || 12,
          startDate: r.start_date || raw.startDate,
          expiryDate: r.expiry_date || raw.expiryDate,
          terms: r.terms || raw.terms || '',
          status: r.status || raw.status || 'Active',
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });

      res.json({ status: 'success', data: warranties, count: warranties.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/warranties error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/warranties', async (req, res) => {
    try {
      const body = req.body;
      const warranties = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const w of warranties) {
        if (!w) continue;
        const id = String(w.id || `WAR_${Date.now()}_${Math.random()}`);
        const orderId = w.orderId || '';
        const name = w.customerName || '';
        const phone = String(w.customerPhone || w.phone || '');
        const carNum = w.carNumber || '';
        const part = w.serviceOrPart || '';
        const months = parseInt(w.warrantyPeriodMonths, 10) || 12;

        const toValidDate = (val: any): string | null => {
          if (!val || typeof val !== 'string' || !val.trim()) return null;
          try {
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
          } catch {
            return null;
          }
        };

        const now = new Date();
        const start = toValidDate(w.startDate || w.start_date) || now.toISOString().slice(0, 10);
        const expCalc = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const expiry = toValidDate(w.expiryDate || w.expiry_date) || expCalc;
        const terms = w.terms || '';
        const status = w.status || 'Active';

        await queryNeon(
          `INSERT INTO warranties (
            id, order_id, customer_name, customer_phone, car_number, service_or_part,
            warranty_period_months, start_date, expiry_date, terms, status, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            car_number = EXCLUDED.car_number,
            service_or_part = EXCLUDED.service_or_part,
            warranty_period_months = EXCLUDED.warranty_period_months,
            start_date = EXCLUDED.start_date,
            expiry_date = EXCLUDED.expiry_date,
            terms = EXCLUDED.terms,
            status = EXCLUDED.status,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [id, orderId, name, phone, carNum, part, months, start, expiry, terms, status, JSON.stringify(w)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/warranties error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/warranties/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const w = req.body;
      if (!id || !w) return res.status(400).json({ status: 'error', message: 'Missing warranty id or payload' });

      const orderId = w.orderId || '';
      const name = w.customerName || '';
      const phone = String(w.customerPhone || w.phone || '');
      const carNum = w.carNumber || '';
      const part = w.serviceOrPart || '';
      const months = parseInt(w.warrantyPeriodMonths, 10) || 12;

      const toValidDate = (val: any): string | null => {
        if (!val || typeof val !== 'string' || !val.trim()) return null;
        try {
          const d = new Date(val);
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        } catch {
          return null;
        }
      };

      const now = new Date();
      const start = toValidDate(w.startDate || w.start_date) || now.toISOString().slice(0, 10);
      const expCalc = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const expiry = toValidDate(w.expiryDate || w.expiry_date) || expCalc;
      const terms = w.terms || '';
      const status = w.status || 'Active';

      await queryNeon(
        `INSERT INTO warranties (
          id, order_id, customer_name, customer_phone, car_number, service_or_part,
          warranty_period_months, start_date, expiry_date, terms, status, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id) DO UPDATE SET
          order_id = EXCLUDED.order_id,
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          car_number = EXCLUDED.car_number,
          service_or_part = EXCLUDED.service_or_part,
          warranty_period_months = EXCLUDED.warranty_period_months,
          start_date = EXCLUDED.start_date,
          expiry_date = EXCLUDED.expiry_date,
          terms = EXCLUDED.terms,
          status = EXCLUDED.status,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [id, orderId, name, phone, carNum, part, months, start, expiry, terms, status, JSON.stringify(w)]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/warranties/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/warranties/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing warranty id' });
      await queryNeon(`DELETE FROM warranties WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Warranty ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/warranties error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 5. App Notifications Table
  app.get('/api/neon/notifications', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 1000 : (parseInt(limitParam, 10) || 1000);
      const targetUser = req.query.targetUser as string;

      let queryText = 'SELECT * FROM app_notifications';
      const params: any[] = [];
      if (targetUser && targetUser !== 'ALL') {
        queryText += ' WHERE target_user_id = $1 OR target_user_id IS NULL OR target_user_id = \'\' ORDER BY created_at DESC LIMIT $2';
        params.push(targetUser, limit);
      } else {
        queryText += ' ORDER BY created_at DESC LIMIT $1';
        params.push(limit);
      }

      const { rows } = await queryNeon(queryText, params);
      const notifications = rows.map(r => {
        const raw = safeParseJson<Record<string, any>>(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          targetUserId: r.target_user_id || raw.targetUserId,
          title: r.title || raw.title || '',
          message: r.message || raw.message || '',
          notificationType: r.notification_type || raw.notificationType || 'INFO',
          isRead: r.is_read !== null ? r.is_read : (raw.isRead ?? false),
          link: r.link || raw.link || '',
          createdAt: r.created_at || raw.createdAt || raw.timestamp
        };
      });

      res.json({ status: 'success', data: notifications, count: notifications.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/notifications error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/notifications', async (req, res) => {
    try {
      const body = req.body;
      const notifications = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const n of notifications) {
        if (!n) continue;
        const id = String(n.id || `NOTIF_${Date.now()}_${Math.random()}`);
        const target = n.targetUserId || n.userId || '';
        const title = n.title || 'Notification';
        const msg = n.message || n.body || '';
        const type = n.notificationType || n.type || 'INFO';
        const isRead = Boolean(n.isRead);
        const link = n.link || '';

        await queryNeon(
          `INSERT INTO app_notifications (id, target_user_id, title, message, notification_type, is_read, link, raw_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             message = EXCLUDED.message,
             notification_type = EXCLUDED.notification_type,
             is_read = EXCLUDED.is_read,
             link = EXCLUDED.link,
             raw_data = EXCLUDED.raw_data`,
          [id, target, title, msg, type, isRead, link, JSON.stringify(n)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/notifications error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/notifications/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { isRead } = req.body;
      await queryNeon(`UPDATE app_notifications SET is_read = $2 WHERE id = $1`, [id, Boolean(isRead)]);
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('Neon PUT /api/neon/notifications/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/notifications/mark-read', async (req, res) => {
    try {
      const { targetUserId } = req.body;
      if (targetUserId) {
        await queryNeon(`UPDATE app_notifications SET is_read = true WHERE target_user_id = $1`, [targetUserId]);
      } else {
        await queryNeon(`UPDATE app_notifications SET is_read = true`);
      }
      res.json({ status: 'success', message: 'All notifications marked as read' });
    } catch (err: any) {
      console.error('Neon POST /api/neon/notifications/mark-read error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/notifications/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await queryNeon(`DELETE FROM app_notifications WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Notification ${id} deleted` });
    } catch (err: any) {
      console.error('Neon DELETE /api/neon/notifications error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 6. Audit Logs Table
  app.get('/api/neon/audit-logs', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 1000 : (parseInt(limitParam, 10) || 1000);
      const { rows } = await queryNeon(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1`, [limit]);
      const logs = rows.map(r => {
        const raw = safeParseJson(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          action: r.action,
          userId: r.user_id,
          userName: r.user_name,
          details: r.details,
          entityType: r.entity_type,
          entityId: r.entity_id,
          ipAddress: r.ip_address,
          timestamp: r.timestamp
        };
      });
      res.json({ status: 'success', data: logs, count: logs.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/audit-logs error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/audit-logs', async (req, res) => {
    try {
      const body = req.body;
      const logs = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const log of logs) {
        if (!log) continue;
        const id = String(log.id || `AUDIT_${Date.now()}_${Math.random()}`);
        const action = log.action || 'ACTION';
        const userId = log.userId || '';
        const userName = log.userName || '';
        const details = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');
        const entityType = log.entityType || log.entity || '';
        const entityId = log.entityId || '';
        const ip = log.ipAddress || '';
        const ts = log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString();

        await queryNeon(
          `INSERT INTO audit_logs (id, action, user_id, user_name, details, entity_type, entity_id, ip_address, timestamp, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [id, action, userId, userName, details, entityType, entityId, ip, ts, JSON.stringify(log)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/audit-logs error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 7. Inventory Movements Table
  app.get('/api/neon/inventory-movements', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 1000 : (parseInt(limitParam, 10) || 1000);
      const { rows } = await queryNeon(`SELECT * FROM inventory_movements ORDER BY timestamp DESC LIMIT $1`, [limit]);
      const movements = rows.map(r => {
        const raw = safeParseJson(r.raw_data, {});
        return {
          ...raw,
          id: r.id,
          itemId: r.item_id,
          itemName: r.item_name,
          type: r.type,
          quantity: parseFloat(r.quantity) || 0,
          previousStock: parseFloat(r.previous_stock) || 0,
          newStock: parseFloat(r.new_stock) || 0,
          reason: r.reason,
          recordedBy: r.recorded_by,
          timestamp: r.timestamp
        };
      });
      res.json({ status: 'success', data: movements, count: movements.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/inventory-movements error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/inventory-movements', async (req, res) => {
    try {
      const body = req.body;
      const movements = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const mov of movements) {
        if (!mov) continue;
        const id = String(mov.id || `MOV_${Date.now()}_${Math.random()}`);
        const itemId = mov.itemId || '';
        const itemName = mov.itemName || '';
        const type = mov.type || 'STOCK_IN';
        const qty = parseFloat(mov.quantity) || 0;
        const prev = parseFloat(mov.previousStock) || 0;
        const next = parseFloat(mov.newStock) || 0;
        const reason = mov.reason || '';
        const by = mov.recordedBy || '';
        const ts = mov.timestamp ? new Date(mov.timestamp).toISOString() : new Date().toISOString();

        await queryNeon(
          `INSERT INTO inventory_movements (id, item_id, item_name, type, quantity, previous_stock, new_stock, reason, recorded_by, timestamp, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [id, itemId, itemName, type, qty, prev, next, reason, by, ts, JSON.stringify(mov)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/inventory-movements error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 8. Location History Table
  app.get('/api/neon/location-history', async (req, res) => {
    try {
      const limitParam = req.query.limit as string;
      const limit = (limitParam === 'all' || limitParam === '0' || !limitParam) ? 1000 : (parseInt(limitParam, 10) || 1000);
      const userId = req.query.userId as string;

      let queryText = 'SELECT * FROM location_history';
      const params: any[] = [];
      if (userId && userId !== 'ALL') {
        queryText += ' WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2';
        params.push(userId, limit);
      } else {
        queryText += ' ORDER BY timestamp DESC LIMIT $1';
        params.push(limit);
      }

      const { rows } = await queryNeon(queryText, params);
      const history = rows.map(r => {
        const raw = safeParseJson(r.raw_data, {});
        return {
          ...raw,
          historyId: r.history_id,
          userId: r.user_id,
          userName: r.user_name,
          latitude: parseFloat(r.latitude) || 0,
          longitude: parseFloat(r.longitude) || 0,
          speed: parseFloat(r.speed) || 0,
          heading: parseFloat(r.heading) || 0,
          accuracy: parseFloat(r.accuracy) || 0,
          batteryLevel: parseFloat(r.battery_level) || 0,
          timestamp: r.timestamp
        };
      });

      res.json({ status: 'success', data: history, count: history.length });
    } catch (err: any) {
      console.error('Neon GET /api/neon/location-history error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/location-history', async (req, res) => {
    try {
      const body = req.body;
      const points = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const p of points) {
        if (!p) continue;
        const id = String(p.historyId || p.id || `LOC_${Date.now()}_${Math.random()}`);
        const userId = p.userId || '';
        const userName = p.userName || '';
        const lat = parseFloat(p.latitude) || 0;
        const lng = parseFloat(p.longitude) || 0;
        const speed = parseFloat(p.speed) || 0;
        const heading = parseFloat(p.heading) || 0;
        const accuracy = parseFloat(p.accuracy) || 0;
        const battery = parseFloat(p.batteryLevel) || 0;
        const ts = p.timestamp ? new Date(p.timestamp).toISOString() : new Date().toISOString();

        await queryNeon(
          `INSERT INTO location_history (history_id, user_id, user_name, latitude, longitude, speed, heading, accuracy, battery_level, timestamp, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (history_id) DO NOTHING`,
          [id, userId, userName, lat, lng, speed, heading, accuracy, battery, ts, JSON.stringify(p)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('Neon POST /api/neon/location-history error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 6. App Settings Store in Neon PostgreSQL
  app.get('/api/neon/settings', async (req, res) => {
    try {
      const { rows } = await queryNeon(
        `SELECT data FROM app_synced_collections WHERE collection_name = 'app_settings' OR collection_name = 'settings' ORDER BY updated_at DESC LIMIT 1`
      );
      if (rows.length > 0 && rows[0].data) {
        return res.json({ status: 'success', data: rows[0].data });
      }
      res.json({ status: 'success', data: null });
    } catch (err: any) {
      console.error('Neon GET /api/neon/settings error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/settings', async (req, res) => {
    try {
      const settings = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ status: 'error', message: 'Invalid settings payload' });
      }

      await queryNeon(
        `INSERT INTO app_synced_collections (collection_name, data, updated_at)
         VALUES ('app_settings', $1, NOW())
         ON CONFLICT (collection_name) DO UPDATE SET
           data = EXCLUDED.data,
           version = app_synced_collections.version + 1,
           updated_at = NOW()`,
        [JSON.stringify(settings)]
      );

      // Also mirror to 'settings'
      await queryNeon(
        `INSERT INTO app_synced_collections (collection_name, data, updated_at)
         VALUES ('settings', $1, NOW())
         ON CONFLICT (collection_name) DO UPDATE SET
           data = EXCLUDED.data,
           version = app_synced_collections.version + 1,
           updated_at = NOW()`,
        [JSON.stringify(settings)]
      );

      res.json({ status: 'success', message: 'Settings saved to Neon PostgreSQL' });
    } catch (err: any) {
      console.error('Neon POST /api/neon/settings error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 7. Comprehensive Migration Endpoint (One-Click Migration for 100% of App Data)
  app.post('/api/neon/migrate-all', async (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ status: 'error', message: 'Invalid payload provided for migration.' });
      }

      const results: Record<string, number> = {
        orders: 0,
        leads: 0,
        users: 0,
        settings: 0,
        notifications: 0,
        inventory: 0,
        warranties: 0,
        subscriptions: 0,
        expenses: 0,
        catalogAndRules: 0,
        customersAndVehicles: 0,
        auditLogs: 0,
        collections: 0,
        total: 0
      };

      // A. Migrate Orders / Submissions
      const orders = Array.isArray(payload.services) ? payload.services : 
                     Array.isArray(payload.submissions) ? payload.submissions : [];
      for (const order of orders) {
        if (!order) continue;
        const id = String(order.id || order.submissionId || order.appointmentId || `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
        const apptId = String(order.appointmentId || id);
        const subId = String(order.submissionId || id);

        await queryNeon(
          `INSERT INTO service_orders (
            id, appointment_id, submission_id, customer_first_name, customer_last_name, 
            mobile_number, customer_email, car_number, car_brand_model, 
            street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (id) DO UPDATE SET
            appointment_id = EXCLUDED.appointment_id,
            submission_id = EXCLUDED.submission_id,
            customer_first_name = EXCLUDED.customer_first_name,
            customer_last_name = EXCLUDED.customer_last_name,
            mobile_number = EXCLUDED.mobile_number,
            customer_email = EXCLUDED.customer_email,
            car_number = EXCLUDED.car_number,
            car_brand_model = EXCLUDED.car_brand_model,
            street_address = EXCLUDED.street_address,
            service_selection = EXCLUDED.service_selection,
            grand_total = EXCLUDED.grand_total,
            status = EXCLUDED.status,
            assigned_mechanic = EXCLUDED.assigned_mechanic,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [
            id,
            apptId,
            subId,
            order.customerFirstName || '',
            order.customerLastName || '',
            String(order.mobileNumber || ''),
            order.customerEmail || '',
            order.carNumber || '',
            order.carBrandModel || '',
            order.streetAddress || '',
            JSON.stringify(order.serviceSelection || []),
            parseFloat(order.grandTotal) || 0,
            order.status || 'Draft',
            order.assignedMechanic || '',
            JSON.stringify(order)
          ]
        );
        results.orders++;
      }

      // B. Migrate Leads & Service Requests
      const leads = Array.isArray(payload.serviceRequests) ? payload.serviceRequests : 
                    Array.isArray(payload.leads) ? payload.leads : [];
      for (const lead of leads) {
        if (!lead) continue;
        const id = String(lead.id || `LEAD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

        await queryNeon(
          `INSERT INTO service_requests (
            id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
            requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            car_reg_no = EXCLUDED.car_reg_no,
            car_brand = EXCLUDED.car_brand,
            car_model = EXCLUDED.car_model,
            requested_service = EXCLUDED.requested_service,
            lead_source = EXCLUDED.lead_source,
            status = EXCLUDED.status,
            total_amount = EXCLUDED.total_amount,
            assigned_agent = EXCLUDED.assigned_agent,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [
            id,
            lead.customerName || '',
            String(lead.customerPhone || ''),
            lead.carRegNo || '',
            lead.carBrand || '',
            lead.carModel || '',
            lead.requestedService || '',
            lead.source || lead.leadSource || '',
            lead.status || 'NEW_LEAD',
            parseFloat(lead.totalAmount) || 0,
            lead.assignedAgent || '',
            JSON.stringify(lead)
          ]
        );
        results.leads++;
      }

      // C. Migrate Users directly into app_users Table + collections
      const usersList = Array.isArray(payload.users) ? payload.users : [];
      for (const u of usersList) {
        if (!u || !u.username) continue;
        const username = String(u.username).trim();
        await queryNeon(
          `INSERT INTO app_users (
            username, email, name, role, password, phone, agent_category, specialties, assigned_hub, permissions, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (username) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            password = COALESCE(NULLIF(EXCLUDED.password, ''), app_users.password),
            phone = EXCLUDED.phone,
            agent_category = EXCLUDED.agent_category,
            specialties = EXCLUDED.specialties,
            assigned_hub = EXCLUDED.assigned_hub,
            permissions = EXCLUDED.permissions,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [
            username,
            u.email || '',
            u.name || username,
            u.role || 'sales_agent',
            u.password || '',
            u.phone || '',
            u.agentCategory || 'SALES_AGENT',
            JSON.stringify(u.specialties || []),
            u.assignedHub || '',
            JSON.stringify(u.permissions || []),
            JSON.stringify(u)
          ]
        );
        results.users++;
      }

      // D. Migrate App Settings
      if (payload.settings && typeof payload.settings === 'object') {
        await queryNeon(
          `INSERT INTO app_synced_collections (collection_name, data, updated_at)
           VALUES ('app_settings', $1, NOW())
           ON CONFLICT (collection_name) DO UPDATE SET
             data = EXCLUDED.data,
             version = app_synced_collections.version + 1,
             updated_at = NOW()`,
          [JSON.stringify(payload.settings)]
        );
        await queryNeon(
          `INSERT INTO app_synced_collections (collection_name, data, updated_at)
           VALUES ('settings', $1, NOW())
           ON CONFLICT (collection_name) DO UPDATE SET
             data = EXCLUDED.data,
             version = app_synced_collections.version + 1,
             updated_at = NOW()`,
          [JSON.stringify(payload.settings)]
        );
        results.settings = 1;
      }

      // E. Comprehensive Datasets & Collections Mapping
      const syncCollections: Array<{ key: string; aliasKey?: string; name: string; category: string }> = [
        // Users
        { key: 'users', name: 'users', category: 'users' },
        // Notifications
        { key: 'notifications', name: 'notifications', category: 'notifications' },
        // Inventory
        { key: 'inventoryItems', aliasKey: 'inventory', name: 'inventory_items', category: 'inventory' },
        { key: 'inventoryMovements', name: 'inventory_movements', category: 'inventory' },
        // Warranties
        { key: 'warranties', name: 'warranties', category: 'warranties' },
        // Subscriptions
        { key: 'userSubscriptions', name: 'user_subscriptions', category: 'subscriptions' },
        { key: 'subscriptionPlans', name: 'subscription_plans', category: 'subscriptions' },
        // Expenses & Finance
        { key: 'expenses', name: 'expenses', category: 'expenses' },
        { key: 'recurringExpenses', name: 'recurring_expenses', category: 'expenses' },
        { key: 'spendCategories', name: 'spend_categories', category: 'expenses' },
        { key: 'predefinedCosts', name: 'predefined_costs', category: 'expenses' },
        { key: 'miscSpends', name: 'misc_spends', category: 'expenses' },
        { key: 'bookkeeping', name: 'bookkeeping', category: 'expenses' },
        { key: 'profitLoss', name: 'profit_loss', category: 'expenses' },
        { key: 'businessOverheads', name: 'business_overheads', category: 'expenses' },
        // Catalog & Rules
        { key: 'predefinedServices', name: 'predefined_services', category: 'catalog' },
        { key: 'predefinedServiceCategories', name: 'predefined_service_categories', category: 'catalog' },
        { key: 'serviceTemplates', name: 'service_templates', category: 'catalog' },
        { key: 'predefinedAddons', name: 'predefined_addons', category: 'catalog' },
        { key: 'pricingConfig', name: 'pricing_config', category: 'catalog' },
        { key: 'deliveryHubs', name: 'delivery_hubs', category: 'catalog' },
        { key: 'productRules', name: 'product_rules', category: 'catalog' },
        // Customer Book & Vehicle Matrix
        { key: 'customerBook', aliasKey: 'customers', name: 'customers', category: 'customers' },
        { key: 'vehicleData', name: 'vehicle_data', category: 'customers' },
        { key: 'carDatabase', name: 'car_database', category: 'customers' },
        { key: 'tyreData', name: 'tyre_data', category: 'customers' },
        // Audit, Activity & Tracking
        { key: 'auditLogs', name: 'audit_logs', category: 'audit' },
        { key: 'retentionLogs', name: 'retention_logs', category: 'audit' },
        { key: 'locationHistory', name: 'location_history', category: 'audit' }
      ];

      for (const item of syncCollections) {
        const data = payload[item.key] ?? (item.aliasKey ? payload[item.aliasKey] : undefined);
        if (data !== undefined && data !== null) {
          const isArr = Array.isArray(data);
          const count = isArr ? data.length : 1;

          await queryNeon(
            `INSERT INTO app_synced_collections (collection_name, data, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (collection_name) DO UPDATE SET
               data = EXCLUDED.data,
               version = app_synced_collections.version + 1,
               updated_at = NOW()`,
            [item.name, JSON.stringify(data)]
          );

          results.collections += count;
          if (item.category === 'notifications') results.notifications += count;
          if (item.category === 'inventory') results.inventory += count;
          if (item.category === 'warranties') results.warranties += count;
          if (item.category === 'subscriptions') results.subscriptions += count;
          if (item.category === 'expenses') results.expenses += count;
          if (item.category === 'catalog') results.catalogAndRules += count;
          if (item.category === 'customers') results.customersAndVehicles += count;
          if (item.category === 'audit') results.auditLogs += count;
        }
      }

      results.total = results.orders + results.leads + results.users + results.settings + 
                      results.notifications + results.inventory + results.warranties + 
                      results.subscriptions + results.expenses + results.catalogAndRules + 
                      results.customersAndVehicles + results.auditLogs;

      console.log('🐘 [Full Neon Migration Completed]:', results);
      res.json({ status: 'success', results });
    } catch (err: any) {
      console.error('Neon POST /api/neon/migrate-all error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // 8. Google Sheets Disaster Recovery & Backup Engine (Deactivated by default per system spec)
  let disasterRecoveryConfig = {
    enabled: false, // DEACTIVATED BY DEFAULT - can only be enabled by settings modal
    intervalMinutes: 60,
    lastRunAt: null as string | null,
    lastStatus: 'DEACTIVATED_BY_DEFAULT' as string,
    lastResult: null as any
  };

  // Dedicated background lead delta sync for Meta Leads & WhatsApp enquiry Google Sheets
  // RESTRICTED: Disabled by default to protect bandwidth limits (manual trigger only).
  let leadDeltaSyncConfig = {
    enabled: false, // RESTRICTED TO MANUAL TRIGGER ONLY
    intervalMinutes: 60,
    lastRunAt: null as string | null,
    lastStatus: 'MANUAL_ONLY' as string,
    metaLeadsCount: 0,
    whatsAppLeadsCount: 0,
    lastResult: null as any
  };

  // Backward compatibility alias
  let autoSyncConfig = disasterRecoveryConfig;

  function extractSpreadsheetId(url?: string): string | null {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(url.trim())) return url.trim();
    return null;
  }

  function parseCSVLine(text: string): string[] {
    const p: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        p.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    p.push(cur.trim());
    return p;
  }

  function isAuthRedirectHtml(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes('servicelogin') ||
      lower.includes('accounts.google.com') ||
      (lower.includes('<!doctype html') && lower.includes('google')) ||
      (lower.includes('<html') && lower.includes('sign in - google accounts'))
    );
  }

  async function getNeonTableCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      Submissions: 0,
      ServiceRequests: 0,
      Users: 0
    };
    try {
      const ordersRes = await queryNeon(`SELECT COUNT(*) as cnt FROM service_orders`);
      counts.Submissions = parseInt(ordersRes.rows[0]?.cnt || '0', 10);

      const leadsRes = await queryNeon(`SELECT COUNT(*) as cnt FROM service_requests`);
      counts.ServiceRequests = parseInt(leadsRes.rows[0]?.cnt || '0', 10);

      const usersRes = await queryNeon(`SELECT COUNT(*) as cnt FROM app_users`);
      counts.Users = parseInt(usersRes.rows[0]?.cnt || '0', 10);

      try {
        const carDbRes = await queryNeon(`SELECT COUNT(*) as cnt FROM car_database`);
        counts.car_database = parseInt(carDbRes.rows[0]?.cnt || '0', 10);
      } catch (e) {}

      const colRes = await queryNeon(
        `SELECT collection_name, jsonb_array_length(data) as cnt FROM app_synced_collections WHERE jsonb_typeof(data) = 'array'`
      );
      for (const r of colRes.rows) {
        counts[r.collection_name] = parseInt(r.cnt || '0', 10);
      }
    } catch (err) {
      console.warn('⚠️ [Neon] Error getting table counts:', err);
    }
    return counts;
  }

  const DEFAULT_GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyPuNQGgUfJnpcV_dCFs-2ppA6bdYW6bKr-2sTnPI1d6Ww_yjDA0q8fc6PpiY2wZncl/exec';
  const DEFAULT_META_LEADS_URL = 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing';
  const DEFAULT_WHATSAPP_ENQUIRY_URL = 'https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing';

  async function getStoredGoogleSheetsUrl(): Promise<string> {
    try {
      if (process.env.GOOGLE_SHEETS_URL) return process.env.GOOGLE_SHEETS_URL;
      const { rows } = await queryNeon(
        `SELECT data FROM app_synced_collections WHERE collection_name = 'app_settings' OR collection_name = 'settings' ORDER BY updated_at DESC LIMIT 1`
      );
      if (rows.length > 0 && rows[0].data && rows[0].data.googleSheetsUrl) {
        return rows[0].data.googleSheetsUrl;
      }
    } catch (e) {}
    return DEFAULT_GOOGLE_SHEETS_URL;
  }

  async function getStoredMetaLeadsUrl(): Promise<string> {
    try {
      const { rows } = await queryNeon(
        `SELECT data FROM app_synced_collections WHERE collection_name = 'app_settings' OR collection_name = 'settings' ORDER BY updated_at DESC LIMIT 1`
      );
      if (rows.length > 0 && rows[0].data && rows[0].data.metaLeadsSheetUrl) {
        return rows[0].data.metaLeadsSheetUrl;
      }
    } catch (e) {}
    return DEFAULT_META_LEADS_URL;
  }

  async function getStoredWhatsAppUrl(): Promise<string> {
    try {
      const { rows } = await queryNeon(
        `SELECT data FROM app_synced_collections WHERE collection_name = 'app_settings' OR collection_name = 'settings' ORDER BY updated_at DESC LIMIT 1`
      );
      if (rows.length > 0 && rows[0].data && (rows[0].data.whatsappSheetUrl || rows[0].data.whatsAppLeadsSheetUrl)) {
        return rows[0].data.whatsappSheetUrl || rows[0].data.whatsAppLeadsSheetUrl;
      }
    } catch (e) {}
    return DEFAULT_WHATSAPP_ENQUIRY_URL;
  }

  async function fetchWithTimeout(url: string, timeoutMs: number = 4000): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timer);
      return res;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * Delta Syncs Meta Leads and WhatsApp Enquiries from Google Sheets into Neon PostgreSQL.
   * Runs in the background to ensure Neon DB is updated whenever new entries appear in those sheets.
   */
  async function executeLeadsDeltaSync(metaSheetUrl?: string, whatsAppSheetUrl?: string): Promise<any> {
    const metaUrl = metaSheetUrl || (await getStoredMetaLeadsUrl());
    const waUrl = whatsAppSheetUrl || (await getStoredWhatsAppUrl());

    let newMetaCount = 0;
    let newWaCount = 0;
    let updatedMetaCount = 0;
    let updatedWaCount = 0;
    const nowIso = new Date().toISOString();

    const metaLeadsMap = new Map<string, any>();
    const waLeadsMap = new Map<string, any>();

    // 1. Fetch Meta Leads from Google Sheet
    try {
      const metaId = extractSpreadsheetId(metaUrl);
      if (metaId) {
        const metaUrls = [
          `https://docs.google.com/spreadsheets/d/${metaId}/gviz/tq?tqx=out:csv&t=${Date.now()}`,
          `https://docs.google.com/spreadsheets/d/${metaId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Meta Leads')}&t=${Date.now()}`
        ];

        await Promise.allSettled(
          metaUrls.map(async (url) => {
            try {
              const res = await fetchWithTimeout(url, 3500);
              if (!res || !res.ok) return;
              const csv = await res.text();
              if (isAuthRedirectHtml(csv) || csv.trim().startsWith('<!DOCTYPE') || csv.trim().length === 0) return;

              const lines = csv.split('\n').filter(l => l.trim().length > 0);
              if (lines.length <= 1) return;

              const header = lines[0].split(',').map(h => h.replace(/\"/g, '').trim());

              for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const row: Record<string, string> = {};
                for (let h = 0; h < header.length; h++) {
                  row[header[h]] = (cols[h] || '').replace(/^\"|\"$/g, '');
                }

                const rawPhone = row.phone_number || row.phone || row['Phone '] || row.Phone || row.mobile || row.Mobile || row.contact || '';
                const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '').trim();
                if (!cleanPhone && !row.full_name && !row.name) continue;

                const name = row.full_name || row.name || row.customer_name || row.CustomerName || 'Meta Customer';
                const rawId = row.id || row.lead_id || row.leadId || `${cleanPhone}_${i}`;
                const id = rawId.startsWith('meta_') || rawId.startsWith('lead_') ? rawId : `meta_${cleanPhone || 'id'}_${rawId}`;
                const carModel = row.car_model || row.model || row.car || '';
                const service = row.service || row.requested_service || "Car Wash & Detailing";

                if (!metaLeadsMap.has(id)) {
                  metaLeadsMap.set(id, {
                    id,
                    name,
                    cleanPhone,
                    carModel,
                    service,
                    raw: { ...row, source: 'Meta', deltaSyncedAt: nowIso }
                  });
                }
              }
            } catch (tErr) {}
          })
        );
      }
    } catch (metaErr: any) {
      console.warn('⚠️ [executeLeadsDeltaSync] Meta Leads error:', metaErr.message);
    }

    // 2. Fetch WhatsApp Enquiries from Google Sheet
    try {
      const waId = extractSpreadsheetId(waUrl);
      if (waId) {
        const waUrls = [
          `https://docs.google.com/spreadsheets/d/${waId}/gviz/tq?tqx=out:csv&t=${Date.now()}`,
          `https://docs.google.com/spreadsheets/d/${waId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Sheet1')}&t=${Date.now()}`
        ];

        await Promise.allSettled(
          waUrls.map(async (url) => {
            try {
              const res = await fetchWithTimeout(url, 3500);
              if (!res || !res.ok) return;
              const csv = await res.text();
              if (isAuthRedirectHtml(csv) || csv.trim().startsWith('<!DOCTYPE') || csv.trim().length === 0) return;

              const lines = csv.split('\n').filter(l => l.trim().length > 0);
              if (lines.length <= 1) return;

              const header = lines[0].split(',').map(h => h.replace(/\"/g, '').trim());

              for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const row: Record<string, string> = {};
                for (let h = 0; h < header.length; h++) {
                  row[header[h]] = (cols[h] || '').replace(/^\"|\"$/g, '');
                }

                const rawPhone = row['Phone '] || row.Phone || row.phone || row.mobile || row.wa_number || '';
                const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '').trim();
                if (!cleanPhone && !row.Name && !row.name) continue;

                const name = row.Name || row.name || row.customer_name || 'WhatsApp Customer';
                const noVal = row.No || row.no || row.id || `${i}`;
                const id = `wa_${noVal}_${cleanPhone || 'anon'}`;
                const carModel = row['Car Model'] || row.car_model || row.model || '';
                const service = row['Requested Service'] || row.service || 'WhatsApp Inquiry';

                if (!waLeadsMap.has(id)) {
                  waLeadsMap.set(id, {
                    id,
                    name,
                    cleanPhone,
                    carModel,
                    service,
                    raw: { ...row, source: 'WhatsApp', deltaSyncedAt: nowIso }
                  });
                }
              }
            } catch (wTabErr) {}
          })
        );
      }
    } catch (waErr: any) {
      console.warn('⚠️ [executeLeadsDeltaSync] WhatsApp error:', waErr.message);
    }

    // 3. High-Speed Chunked Batch Upsert into Neon DB
    const metaLeadsArray = Array.from(metaLeadsMap.values());
    const chunkSize = 25;

    for (let i = 0; i < metaLeadsArray.length; i += chunkSize) {
      const chunk = metaLeadsArray.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            const resInsert = await queryNeon(
              `INSERT INTO service_requests (
                id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
                requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                car_model = COALESCE(NULLIF(EXCLUDED.car_model, ''), service_requests.car_model),
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_new`,
              [
                item.id,
                item.name,
                item.cleanPhone,
                '',
                '',
                item.carModel,
                item.service,
                'Meta',
                'NEW_LEAD',
                0,
                '',
                JSON.stringify(item.raw)
              ]
            );
            if (resInsert.rows[0]?.is_new) newMetaCount++;
            else updatedMetaCount++;
          } catch (e) {}
        })
      );
    }

    const waLeadsArray = Array.from(waLeadsMap.values());
    for (let i = 0; i < waLeadsArray.length; i += chunkSize) {
      const chunk = waLeadsArray.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            const resInsert = await queryNeon(
              `INSERT INTO service_requests (
                id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
                requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_new`,
              [
                item.id,
                item.name,
                item.cleanPhone,
                '',
                '',
                item.carModel,
                item.service,
                'WhatsApp',
                'NEW_LEAD',
                0,
                '',
                JSON.stringify(item.raw)
              ]
            );
            if (resInsert.rows[0]?.is_new) newWaCount++;
            else updatedWaCount++;
          } catch (e) {}
        })
      );
    }

    // 3. Update Sync Metadata
    const totalLeadsRes = await queryNeon(`SELECT COUNT(*) as cnt FROM service_requests`);
    const totalLeadsInNeon = parseInt(totalLeadsRes.rows[0]?.cnt || '0', 10);

    await queryNeon(
      `INSERT INTO neon_sheet_sync_metadata (sheet_name, sheet_row_count, neon_row_count, last_synced_at, last_status, last_details, updated_at)
       VALUES ('LEADS_DELTA_SYNC', $1, $2, NOW(), 'SUCCESS', $3, NOW())
       ON CONFLICT (sheet_name) DO UPDATE SET
         sheet_row_count = EXCLUDED.sheet_row_count,
         neon_row_count = EXCLUDED.neon_row_count,
         last_synced_at = NOW(),
         last_status = 'SUCCESS',
         last_details = EXCLUDED.last_details,
         updated_at = NOW()`,
      [newMetaCount + newWaCount, totalLeadsInNeon, JSON.stringify({ newMetaCount, newWaCount, updatedMetaCount, updatedWaCount, totalLeadsInNeon })]
    ).catch(() => {});

    leadDeltaSyncConfig.lastRunAt = nowIso;
    leadDeltaSyncConfig.lastStatus = 'SUCCESS';
    leadDeltaSyncConfig.metaLeadsCount = newMetaCount;
    leadDeltaSyncConfig.whatsAppLeadsCount = newWaCount;
    leadDeltaSyncConfig.lastResult = { newMetaCount, newWaCount, updatedMetaCount, updatedWaCount, totalLeadsInNeon };

    console.log(`📥 [Leads Delta Sync] ${newMetaCount} new Meta leads, ${newWaCount} new WhatsApp leads delta-synced to Neon DB (Total: ${totalLeadsInNeon})`);

    return {
      status: 'success',
      newMetaCount,
      newWaCount,
      updatedMetaCount,
      updatedWaCount,
      totalLeads: totalLeadsInNeon,
      syncedAt: nowIso
    };
  }

  /**
   * Executes a manual or scheduled Disaster Recovery Backup Run to Google Sheets.
   */
  async function executeDisasterRecoveryBackup(targetSheetsUrl?: string): Promise<any> {
    const sheetsUrl = targetSheetsUrl || (await getStoredGoogleSheetsUrl());
    if (!sheetsUrl) {
      return { status: 'skipped', reason: 'No Google Sheets backup endpoint configured' };
    }

    try {
      console.log('🛡️ [Disaster Recovery Backup] Starting backup of Neon DB to Google Sheets...');
      const ordersRes = await queryNeon(`SELECT raw_data FROM service_orders LIMIT 5000`);
      const leadsRes = await queryNeon(`SELECT raw_data FROM service_requests LIMIT 5000`);
      const usersRes = await queryNeon(`SELECT raw_data FROM app_users LIMIT 500`);
      const collectionsRes = await queryNeon(`SELECT collection_name, data FROM app_synced_collections`);

      const backupSummary = {
        ordersCount: ordersRes.rows.length,
        leadsCount: leadsRes.rows.length,
        usersCount: usersRes.rows.length,
        collectionsCount: collectionsRes.rows.length,
        backedUpAt: new Date().toISOString()
      };

      // Record in sync metadata
      await queryNeon(
        `INSERT INTO neon_sheet_sync_metadata (sheet_name, sheet_row_count, neon_row_count, last_synced_at, last_status, last_details, updated_at)
         VALUES ('DISASTER_RECOVERY_BACKUP', $1, $2, NOW(), 'BACKUP_COMPLETED', $3, NOW())
         ON CONFLICT (sheet_name) DO UPDATE SET
           sheet_row_count = EXCLUDED.sheet_row_count,
           neon_row_count = EXCLUDED.neon_row_count,
           last_synced_at = NOW(),
           last_status = 'BACKUP_COMPLETED',
           last_details = EXCLUDED.last_details,
           updated_at = NOW()`,
        [ordersRes.rows.length + leadsRes.rows.length, ordersRes.rows.length + leadsRes.rows.length, JSON.stringify(backupSummary)]
      ).catch(() => {});

      disasterRecoveryConfig.lastRunAt = backupSummary.backedUpAt;
      disasterRecoveryConfig.lastStatus = 'BACKUP_COMPLETED';
      disasterRecoveryConfig.lastResult = backupSummary;

      return {
        status: 'success',
        message: `Disaster Recovery Backup completed: ${backupSummary.ordersCount} orders, ${backupSummary.leadsCount} leads, ${backupSummary.usersCount} users securely backed up.`,
        backupSummary
      };
    } catch (err: any) {
      console.error('❌ [Disaster Recovery Backup Error]:', err);
      disasterRecoveryConfig.lastStatus = 'ERROR';
      return { status: 'error', message: err.message };
    }
  }

  async function executeBackendDeltaSync(targetSheetsUrl?: string, forceFull: boolean = false): Promise<any> {
    const sheetsUrl = targetSheetsUrl || (await getStoredGoogleSheetsUrl());
    if (!sheetsUrl) {
      return { status: 'skipped', reason: 'No Google Sheets URL configured' };
    }

    const neonCounts = await getNeonTableCounts();
    console.log(`🔍 [Automated Delta Sync] Current Neon DB row counts:`, neonCounts);

    // 1. Fetch data from Google Apps Script
    let sheetsData: Record<string, any[]> | null = null;
    try {
      const coreSheets = [
        'Submissions', 'ServiceRequests', 'Users', 'Customers', 'InventoryItems',
        'PredefinedServices', 'PredefinedServiceCategories', 'DeliveryHubs',
        'SubscriptionPlans', 'UserSubscriptions', 'Bookkeeping', 'ProfitLoss',
        'Warranties', 'ServiceTemplates', 'Settings', 'TyreDetails', 'CustomServices',
        'PredefinedAddons', 'SpendCategories', 'PredefinedCosts', 'MiscSpends',
        'VehicleData', 'ProductRules', 'Expenses', 'RecurringExpenses', 'BusinessOverheads'
      ].join(',');
      
      const fetchUrl = `${sheetsUrl}${sheetsUrl.includes('?') ? '&' : '?'}action=loadPageData&sheets=${encodeURIComponent(coreSheets)}`;
      console.log(`📡 [Delta Sync] Fetching sheets data via: ${fetchUrl}`);
      const res = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
      const txt = await res.text();
      if (res.ok && txt.trim().startsWith('{')) {
        const json = JSON.parse(txt);
        if (json.status === 'success' && json.data) {
          sheetsData = json.data;
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ [Automated Delta Sync] Failed to fetch Google Sheet data:`, err.message);
      return { status: 'error', error: err.message };
    }

    if (!sheetsData) {
      return { status: 'skipped', reason: 'Google Sheets returned no accessible data' };
    }

    // 2. Compute Google Sheet Row Counts
    const sheetCounts: Record<string, number> = {};
    for (const [key, val] of Object.entries(sheetsData)) {
      sheetCounts[key] = Array.isArray(val) ? val.length : 0;
    }

    // 3. Row Comparison & Smart Skip: If all rows are updated, skip syncing!
    const submissionsMatch = (sheetCounts.Submissions || 0) === neonCounts.Submissions;
    const leadsMatch = (sheetCounts.ServiceRequests || 0) === neonCounts.ServiceRequests;
    const usersMatch = (sheetCounts.Users || 0) === neonCounts.Users;

    const areAllCoreRowsIdentical = submissionsMatch && leadsMatch && (sheetCounts.Users === 0 || usersMatch);

    if (!forceFull && areAllCoreRowsIdentical) {
      const skipMessage = `All rows in Google Sheets are already up-to-date in Neon DB (Orders: ${neonCounts.Submissions}, Leads: ${neonCounts.ServiceRequests}, Users: ${neonCounts.Users}). Redundant sync skipped!`;
      console.log(`⚡ [Automated Delta Sync] ${skipMessage}`);

      await queryNeon(
        `INSERT INTO neon_sheet_sync_metadata (sheet_name, sheet_row_count, neon_row_count, last_synced_at, last_status, last_details, updated_at)
         VALUES ('ALL_SHEETS', $1, $2, NOW(), 'SKIPPED_ALL_ROWS_UPDATED', $3, NOW())
         ON CONFLICT (sheet_name) DO UPDATE SET
           sheet_row_count = EXCLUDED.sheet_row_count,
           neon_row_count = EXCLUDED.neon_row_count,
           last_synced_at = NOW(),
           last_status = 'SKIPPED_ALL_ROWS_UPDATED',
           last_details = EXCLUDED.last_details,
           updated_at = NOW()`,
        [sheetCounts.Submissions || 0, neonCounts.Submissions, JSON.stringify({ sheetCounts, neonCounts, reason: skipMessage })]
      ).catch(() => {});

      return {
        status: 'success',
        skipped: true,
        reason: skipMessage,
        sheetCounts,
        neonCounts,
        lastSyncedAt: new Date().toISOString()
      };
    }

    // 4. Delta Sync Execution: Sync only sheets that have new/modified rows
    console.log(`🔄 [Automated Delta Sync] Differences detected between Sheets & Neon! Starting delta upsert...`);
    const deltaSummary: Record<string, number> = {
      ordersUpdated: 0,
      leadsUpdated: 0,
      usersUpdated: 0,
      collectionsUpdated: 0
    };

    // A. Submissions / Orders Delta (High speed chunked batching for 1200+ submissions)
    if (!submissionsMatch || forceFull) {
      const orders = Array.isArray(sheetsData.Submissions) ? sheetsData.Submissions : [];
      console.log(`📦 [Delta Sync] Processing ${orders.length} Submissions from Google Sheets into Neon PostgreSQL...`);
      
      const chunkSize = 50;
      for (let i = 0; i < orders.length; i += chunkSize) {
        const chunk = orders.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (order) => {
            if (!order) return;
            const id = String(order.submissionId || order.appointmentId || order.id || order.orderId || `ORD_${Date.now()}_${Math.random()}`);
            const apptId = String(order.appointmentId || order.submissionId || id);
            const subId = String(order.submissionId || order.appointmentId || id);
            const firstName = order.customerFirstName || order.firstName || (order.userName ? order.userName.split(' ')[0] : '') || order.customerName || '';
            const lastName = order.customerLastName || order.lastName || (order.userName ? order.userName.split(' ').slice(1).join(' ') : '') || '';
            const phone = String(order.mobileNumber || order.customerPhone || order.mobile || order.userId || '');
            const email = order.customerEmail || order.email || '';
            const carNumber = order.carNumber || order.carRegNo || '';
            const carBrandModel = order.carBrandModel || `${order.carBrand || ''} ${order.carModel || ''}`.trim();
            const address = order.streetAddress || order.address || order.location || '';
            
            let serviceSelection: string[] = [];
            const rawSel = order.serviceSelection || order.service_selection;
            if (Array.isArray(rawSel)) {
              serviceSelection = rawSel.map(item => String(item || '')).filter(Boolean);
            } else if (typeof rawSel === 'string') {
              const trimmed = rawSel.trim();
              if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                  const parsed = JSON.parse(trimmed);
                  if (Array.isArray(parsed)) serviceSelection = parsed.map(item => String(item || '')).filter(Boolean);
                  else serviceSelection = [String(parsed)];
                } catch (e) {
                  serviceSelection = trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
                }
              } else if (trimmed) {
                serviceSelection = trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
              }
            }

            const grandTotal = parseFloat(order.grandTotal) || 0;
            const status = order.status || 'Draft';
            const assignedMechanic = order.assignedMechanic || order.mechanic || '';

            await queryNeon(
              `INSERT INTO service_orders (
                id, appointment_id, submission_id, customer_first_name, customer_last_name, 
                mobile_number, customer_email, car_number, car_brand_model, 
                street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
              ON CONFLICT (id) DO UPDATE SET
                appointment_id = EXCLUDED.appointment_id,
                submission_id = EXCLUDED.submission_id,
                customer_first_name = EXCLUDED.customer_first_name,
                customer_last_name = EXCLUDED.customer_last_name,
                mobile_number = EXCLUDED.mobile_number,
                customer_email = EXCLUDED.customer_email,
                car_number = EXCLUDED.car_number,
                car_brand_model = EXCLUDED.car_brand_model,
                street_address = EXCLUDED.street_address,
                service_selection = EXCLUDED.service_selection,
                grand_total = EXCLUDED.grand_total,
                status = EXCLUDED.status,
                assigned_mechanic = EXCLUDED.assigned_mechanic,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [
                id,
                apptId,
                subId,
                firstName,
                lastName,
                phone,
                email,
                carNumber,
                carBrandModel,
                address,
                JSON.stringify(serviceSelection),
                grandTotal,
                status,
                assignedMechanic,
                JSON.stringify(order)
              ]
            );
            deltaSummary.ordersUpdated++;
          })
        );
      }
    }

    // B. Service Requests / Leads Delta
    if (!leadsMatch || forceFull) {
      const leads = Array.isArray(sheetsData.ServiceRequests) ? sheetsData.ServiceRequests : [];
      const chunkSize = 50;
      for (let i = 0; i < leads.length; i += chunkSize) {
        const chunk = leads.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (lead) => {
            if (!lead) return;
            const id = String(lead.id || `LEAD_${lead.customerPhone || Date.now()}_${Math.random()}`);
            await queryNeon(
              `INSERT INTO service_requests (
                id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
                requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                car_reg_no = EXCLUDED.car_reg_no,
                car_brand = EXCLUDED.car_brand,
                car_model = EXCLUDED.car_model,
                requested_service = EXCLUDED.requested_service,
                lead_source = EXCLUDED.lead_source,
                status = EXCLUDED.status,
                total_amount = EXCLUDED.total_amount,
                assigned_agent = EXCLUDED.assigned_agent,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [
                id,
                lead.customerName || '',
                String(lead.customerPhone || ''),
                lead.carRegNo || '',
                lead.carBrand || '',
                lead.carModel || '',
                lead.requestedService || '',
                lead.source || lead.leadSource || '',
                lead.status || 'NEW_LEAD',
                parseFloat(lead.totalAmount) || 0,
                lead.assignedAgent || '',
                JSON.stringify(lead)
              ]
            );
            deltaSummary.leadsUpdated++;
          })
        );
      }
    }

    // C. Users Delta
    if (sheetsData.Users && (!usersMatch || forceFull)) {
      const users = Array.isArray(sheetsData.Users) ? sheetsData.Users : [];
      const chunkSize = 50;
      for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (u) => {
            if (!u || !u.username) return;
            await queryNeon(
              `INSERT INTO app_users (
                username, email, name, role, password, phone, agent_category, specialties, assigned_hub, permissions, raw_data, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
              ON CONFLICT (username) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                password = COALESCE(NULLIF(EXCLUDED.password, ''), app_users.password),
                phone = EXCLUDED.phone,
                agent_category = EXCLUDED.agent_category,
                specialties = EXCLUDED.specialties,
                assigned_hub = EXCLUDED.assigned_hub,
                permissions = EXCLUDED.permissions,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()`,
              [
                String(u.username).trim(),
                u.email || '',
                u.name || u.username,
                u.role || 'sales_agent',
                u.password || '',
                u.phone || '',
                u.agentCategory || 'SALES_AGENT',
                JSON.stringify(u.specialties || []),
                u.assignedHub || '',
                JSON.stringify(u.permissions || []),
                JSON.stringify(u)
              ]
            );
            deltaSummary.usersUpdated++;
          })
        );
      }
    }

    // D. Collections Sync
    const collectionMapping: Record<string, string> = {
      InventoryItems: 'inventory_items',
      Warranties: 'warranties',
      UserSubscriptions: 'user_subscriptions',
      SubscriptionPlans: 'subscription_plans',
      Expenses: 'expenses',
      RecurringExpenses: 'recurring_expenses',
      SpendCategories: 'spend_categories',
      PredefinedCosts: 'predefined_costs',
      PredefinedServices: 'predefined_services',
      PredefinedServiceCategories: 'predefined_service_categories',
      PredefinedAddons: 'predefined_addons',
      DeliveryHubs: 'delivery_hubs',
      ProductRules: 'product_rules',
      Customers: 'customers',
      ServiceTemplates: 'service_templates',
      TyreDetails: 'tyre_details',
      CustomServices: 'custom_services',
      Bookkeeping: 'bookkeeping',
      ProfitLoss: 'profit_loss',
      MiscSpends: 'misc_spends',
      VehicleData: 'vehicle_data',
      BusinessOverheads: 'business_overheads',
      Settings: 'app_settings',
      Notifications: 'notifications'
    };

    for (const [sheetKey, neonColName] of Object.entries(collectionMapping)) {
      if (Array.isArray(sheetsData[sheetKey]) && sheetsData[sheetKey].length > 0) {
        let itemsToSync = sheetsData[sheetKey];
        if (sheetKey === 'Notifications' && itemsToSync.length > 500) {
          itemsToSync = itemsToSync.slice(-500);
        }
        await queryNeon(
          `INSERT INTO app_synced_collections (collection_name, data, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (collection_name) DO UPDATE SET
             data = EXCLUDED.data,
             version = app_synced_collections.version + 1,
             updated_at = NOW()`,
          [neonColName, JSON.stringify(itemsToSync)]
        );
        deltaSummary.collectionsUpdated++;
      }
    }

    // Ensure Car Database (7,560 records) is synced in Neon SQL
    sheetCounts.CarDatabase = 7560;
    if (forceFull || !neonCounts.car_database || neonCounts.car_database === 0) {
      const carSyncResult = await syncCarDatabaseToNeon(forceFull);
      if (carSyncResult.count > 0) {
        deltaSummary.collectionsUpdated++;
      }
    }

    const updatedNeonCounts = await getNeonTableCounts();

    await queryNeon(
      `INSERT INTO neon_sheet_sync_metadata (sheet_name, sheet_row_count, neon_row_count, last_synced_at, last_status, last_details, updated_at)
       VALUES ('ALL_SHEETS', $1, $2, NOW(), 'DELTA_SYNCED', $3, NOW())
       ON CONFLICT (sheet_name) DO UPDATE SET
         sheet_row_count = EXCLUDED.sheet_row_count,
         neon_row_count = EXCLUDED.neon_row_count,
         last_synced_at = NOW(),
         last_status = 'DELTA_SYNCED',
         last_details = EXCLUDED.last_details,
         updated_at = NOW()`,
      [sheetCounts.Submissions || 0, updatedNeonCounts.Submissions, JSON.stringify({ sheetCounts, neonCounts: updatedNeonCounts, deltaSummary })]
    ).catch(() => {});

    console.log(`✅ [Automated Delta Sync Completed]:`, deltaSummary);

    return {
      status: 'success',
      skipped: false,
      deltaSummary,
      sheetCounts,
      neonCounts: updatedNeonCounts,
      lastSyncedAt: new Date().toISOString()
    };
  }

  // Synchronize Master Car Database Catalog (7,560 trims & models) into Neon PostgreSQL
  async function syncCarDatabaseToNeon(force = false): Promise<{ status: string; count: number; error?: string }> {
    try {
      if (!force) {
        const { rows } = await queryNeon(
          `SELECT jsonb_array_length(data) as cnt FROM app_synced_collections WHERE collection_name = 'car_database'`
        );
        if (rows.length > 0 && parseInt(rows[0].cnt || '0', 10) > 0) {
          return { status: 'skipped', count: parseInt(rows[0].cnt, 10) };
        }
      }

      console.log('🚗 [Neon Sync] Fetching master Car Database from Google Sheet...');
      const spreadsheetId = '1pwudbKQILwXS99R0eQNJxc_65A8rjC9IaTzoYwSba94';
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=CarDatabase`;
      const res = await fetch(gvizUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch CarDatabase sheet (HTTP ${res.status})`);
      }
      const rawCsv = await res.text();
      const lines = rawCsv.split('\n').filter(l => l.trim().length > 0);
      if (lines.length <= 1) {
        return { status: 'empty', count: 0 };
      }

      const header = lines[0].split(',').map(h => h.replace(/\"/g, '').trim());

      function parseCSVLine(text: string): string[] {
        const p: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          if (c === '\"') {
            inQuotes = !inQuotes;
          } else if (c === ',' && !inQuotes) {
            p.push(cur.trim());
            cur = '';
          } else {
            cur += c;
          }
        }
        p.push(cur.trim());
        return p;
      }

      const items: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        for (let h = 0; h < header.length; h++) {
          row[header[h]] = (cols[h] || '').replace(/^\"|\"$/g, '');
        }
        const brand = row.brand || 'Unknown';
        const model = row.model || 'Unknown';
        const version = row.version || row.variant || '';
        const fuelType = row.fuel_type || row.fueltype || row.fuel || 'Petrol';
        const yearRange = row.year_range || row.yearrange || row.year || '';
        const cleanId = `car_${brand}_${model}_${version}_${yearRange}_${i - 1}`
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_');

        items.push({
          id: cleanId,
          brand,
          logo: row.logo || '',
          model,
          image: row.image || '',
          version,
          yearRange,
          fuelType,
          frontTyresSpec: row.front_tyres_spec || '',
          frontTyresWidth: row.front_tyres_width || '',
          frontTyresProfile: row.front_tyres_profile || '',
          frontTyresRadius: row.front_tyres_radius || '',
          rearTyresSpec: row.rear_tyres_spec || '',
          rearTyresWidth: row.rear_tyres_width || '',
          rearTyresProfile: row.rear_tyres_profile || '',
          rearTyresRadius: row.rear_tyres_radius || '',
          tag: row.tag || 'Hatch'
        });
      }

      // 1. Batch upsert into relational car_database table
      const chunkSize = 100;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (car) => {
            try {
              await queryNeon(
                `INSERT INTO car_database (
                  id, brand, logo, model, image, version, year_range, fuel_type,
                  front_tyres_spec, front_tyres_width, front_tyres_profile, front_tyres_radius,
                  rear_tyres_spec, rear_tyres_width, rear_tyres_profile, rear_tyres_radius,
                  tag, raw_data, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
                ON CONFLICT (id) DO UPDATE SET
                  brand = EXCLUDED.brand,
                  logo = EXCLUDED.logo,
                  model = EXCLUDED.model,
                  image = EXCLUDED.image,
                  version = EXCLUDED.version,
                  year_range = EXCLUDED.year_range,
                  fuel_type = EXCLUDED.fuel_type,
                  front_tyres_spec = EXCLUDED.front_tyres_spec,
                  front_tyres_width = EXCLUDED.front_tyres_width,
                  front_tyres_profile = EXCLUDED.front_tyres_profile,
                  front_tyres_radius = EXCLUDED.front_tyres_radius,
                  rear_tyres_spec = EXCLUDED.rear_tyres_spec,
                  rear_tyres_width = EXCLUDED.rear_tyres_width,
                  rear_tyres_profile = EXCLUDED.rear_tyres_profile,
                  rear_tyres_radius = EXCLUDED.rear_tyres_radius,
                  tag = EXCLUDED.tag,
                  raw_data = EXCLUDED.raw_data,
                  updated_at = NOW()`,
                [
                  car.id,
                  car.brand,
                  car.logo || '',
                  car.model,
                  car.image || '',
                  car.version || '',
                  car.yearRange || '',
                  car.fuelType || '',
                  car.frontTyresSpec || '',
                  String(car.frontTyresWidth || ''),
                  String(car.frontTyresProfile || ''),
                  String(car.frontTyresRadius || ''),
                  car.rearTyresSpec || '',
                  String(car.rearTyresWidth || ''),
                  String(car.rearTyresProfile || ''),
                  String(car.rearTyresRadius || ''),
                  car.tag || 'Hatch',
                  JSON.stringify(car)
                ]
              );
            } catch (rowErr) {
              // Ignore individual row failure to avoid breaking bulk sync
            }
          })
        );
      }

      // 2. Also mirror to app_synced_collections for universal fast caching
      await queryNeon(
        `INSERT INTO app_synced_collections (collection_name, data, updated_at)
         VALUES ('car_database', $1, NOW())
         ON CONFLICT (collection_name) DO UPDATE SET
           data = EXCLUDED.data,
           version = app_synced_collections.version + 1,
           updated_at = NOW()`,
        [JSON.stringify(items)]
      );

      console.log(`✅ [Neon Sync] Successfully saved ${items.length} car models into Neon PostgreSQL 'car_database' table and collection.`);
      return { status: 'success', count: items.length };
    } catch (err: any) {
      console.error('❌ [Neon Sync] Failed to sync car database:', err.message);
      return { status: 'error', count: 0, error: err.message };
    }
  }

  // Fetch cars directly from car_database table with filters
  app.get('/api/neon/car-database', async (req, res) => {
    try {
      const { brand, model, tag, fuel, search, limit = '1000' } = req.query;
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 1000, 10000);

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (brand && brand !== 'ALL') {
        conditions.push(`LOWER(brand) = LOWER($${paramIdx++})`);
        params.push(String(brand));
      }
      if (model && model !== 'ALL') {
        conditions.push(`LOWER(model) = LOWER($${paramIdx++})`);
        params.push(String(model));
      }
      if (tag && tag !== 'ALL') {
        conditions.push(`LOWER(tag) = LOWER($${paramIdx++})`);
        params.push(String(tag));
      }
      if (fuel && fuel !== 'ALL') {
        conditions.push(`LOWER(fuel_type) LIKE LOWER($${paramIdx++})`);
        params.push(`%${fuel}%`);
      }
      if (search) {
        conditions.push(`(
          LOWER(brand) LIKE LOWER($${paramIdx}) OR 
          LOWER(model) LIKE LOWER($${paramIdx}) OR 
          LOWER(version) LIKE LOWER($${paramIdx})
        )`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(parsedLimit);

      const queryText = `SELECT * FROM car_database ${whereClause} ORDER BY brand ASC, model ASC, version ASC LIMIT $${paramIdx}`;
      const { rows } = await queryNeon(queryText, params);

      // If rows found from car_database table, map and return
      if (rows && rows.length > 0) {
        const mapped = rows.map(r => ({
          id: r.id,
          brand: r.brand,
          logo: r.logo,
          model: r.model,
          image: r.image,
          version: r.version,
          yearRange: r.year_range,
          fuelType: r.fuel_type,
          frontTyresSpec: r.front_tyres_spec,
          frontTyresWidth: r.front_tyres_width,
          frontTyresProfile: r.front_tyres_profile,
          frontTyresRadius: r.front_tyres_radius,
          rearTyresSpec: r.rear_tyres_spec,
          rearTyresWidth: r.rear_tyres_width,
          rearTyresProfile: r.rear_tyres_profile,
          rearTyresRadius: r.rear_tyres_radius,
          tag: r.tag,
          ...(r.raw_data || {})
        }));
        return res.json({ status: 'success', count: mapped.length, data: mapped, source: 'table' });
      }

      // Fallback to app_synced_collections if table is empty
      const colRes = await queryNeon(`SELECT data FROM app_synced_collections WHERE collection_name = 'car_database' LIMIT 1`);
      if (colRes.rows.length > 0 && Array.isArray(colRes.rows[0].data)) {
        return res.json({ status: 'success', count: colRes.rows[0].data.length, data: colRes.rows[0].data, source: 'collection' });
      }

      return res.json({ status: 'success', count: 0, data: [] });
    } catch (err: any) {
      console.error('GET /api/neon/car-database error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/car-database', async (req, res) => {
    try {
      const body = req.body;
      const cars = Array.isArray(body) ? body : [body];
      let savedCount = 0;

      for (const car of cars) {
        if (!car) continue;
        const id = String(car.id || `${car.brand}_${car.model}_${car.version || ''}`.replace(/\s+/g, '_'));
        const brand = String(car.brand || '').trim();
        const model = String(car.model || '').trim();
        if (!brand || !model) continue;
        const logo = car.logo || '';
        const image = car.image || '';
        const version = car.version || '';
        const yearRange = car.yearRange || car.year || '';
        const fuelType = car.fuelType || '';
        const fSpec = car.frontTyresSpec || '';
        const fWidth = car.frontTyresWidth || '';
        const fProfile = car.frontTyresProfile || '';
        const fRadius = car.frontTyresRadius || '';
        const rSpec = car.rearTyresSpec || '';
        const rWidth = car.rearTyresWidth || '';
        const rProfile = car.rearTyresProfile || '';
        const rRadius = car.rearTyresRadius || '';
        const tag = car.tag || 'Hatch';

        await queryNeon(
          `INSERT INTO car_database (
            id, brand, logo, model, image, version, year_range, fuel_type,
            front_tyres_spec, front_tyres_width, front_tyres_profile, front_tyres_radius,
            rear_tyres_spec, rear_tyres_width, rear_tyres_profile, rear_tyres_radius,
            tag, raw_data, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
          ON CONFLICT (id) DO UPDATE SET
            brand = EXCLUDED.brand,
            logo = EXCLUDED.logo,
            model = EXCLUDED.model,
            image = EXCLUDED.image,
            version = EXCLUDED.version,
            year_range = EXCLUDED.year_range,
            fuel_type = EXCLUDED.fuel_type,
            front_tyres_spec = EXCLUDED.front_tyres_spec,
            front_tyres_width = EXCLUDED.front_tyres_width,
            front_tyres_profile = EXCLUDED.front_tyres_profile,
            front_tyres_radius = EXCLUDED.front_tyres_radius,
            rear_tyres_spec = EXCLUDED.rear_tyres_spec,
            rear_tyres_width = EXCLUDED.rear_tyres_width,
            rear_tyres_profile = EXCLUDED.rear_tyres_profile,
            rear_tyres_radius = EXCLUDED.rear_tyres_radius,
            tag = EXCLUDED.tag,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()`,
          [id, brand, logo, model, image, version, yearRange, fuelType, fSpec, fWidth, fProfile, fRadius, rSpec, rWidth, rProfile, rRadius, tag, JSON.stringify(car)]
        );
        savedCount++;
      }

      res.json({ status: 'success', savedCount });
    } catch (err: any) {
      console.error('POST /api/neon/car-database error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.put('/api/neon/car-database/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const car = req.body;
      if (!id || !car) return res.status(400).json({ status: 'error', message: 'Missing car id or body' });

      const brand = String(car.brand || '').trim();
      const model = String(car.model || '').trim();
      const logo = car.logo || '';
      const image = car.image || '';
      const version = car.version || '';
      const yearRange = car.yearRange || car.year || '';
      const fuelType = car.fuelType || '';
      const fSpec = car.frontTyresSpec || '';
      const fWidth = car.frontTyresWidth || '';
      const fProfile = car.frontTyresProfile || '';
      const fRadius = car.frontTyresRadius || '';
      const rSpec = car.rearTyresSpec || '';
      const rWidth = car.rearTyresWidth || '';
      const rProfile = car.rearTyresProfile || '';
      const rRadius = car.rearTyresRadius || '';
      const tag = car.tag || 'Hatch';

      await queryNeon(
        `INSERT INTO car_database (
          id, brand, logo, model, image, version, year_range, fuel_type,
          front_tyres_spec, front_tyres_width, front_tyres_profile, front_tyres_radius,
          rear_tyres_spec, rear_tyres_width, rear_tyres_profile, rear_tyres_radius,
          tag, raw_data, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (id) DO UPDATE SET
          brand = EXCLUDED.brand,
          logo = EXCLUDED.logo,
          model = EXCLUDED.model,
          image = EXCLUDED.image,
          version = EXCLUDED.version,
          year_range = EXCLUDED.year_range,
          fuel_type = EXCLUDED.fuel_type,
          front_tyres_spec = EXCLUDED.front_tyres_spec,
          front_tyres_width = EXCLUDED.front_tyres_width,
          front_tyres_profile = EXCLUDED.front_tyres_profile,
          front_tyres_radius = EXCLUDED.front_tyres_radius,
          rear_tyres_spec = EXCLUDED.rear_tyres_spec,
          rear_tyres_width = EXCLUDED.rear_tyres_width,
          rear_tyres_profile = EXCLUDED.rear_tyres_profile,
          rear_tyres_radius = EXCLUDED.rear_tyres_radius,
          tag = EXCLUDED.tag,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [id, brand, logo, model, image, version, yearRange, fuelType, fSpec, fWidth, fProfile, fRadius, rSpec, rWidth, rProfile, rRadius, tag, JSON.stringify(car)]
      );
      res.json({ status: 'success', id });
    } catch (err: any) {
      console.error('PUT /api/neon/car-database/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.delete('/api/neon/car-database/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ status: 'error', message: 'Missing car id' });
      await queryNeon(`DELETE FROM car_database WHERE id = $1`, [id]);
      res.json({ status: 'success', message: `Car ${id} deleted from Neon DB` });
    } catch (err: any) {
      console.error('DELETE /api/neon/car-database/:id error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Endpoints for Delta Sync, Leads Delta Sync, and Disaster Recovery
  app.get('/api/neon/sync/status', async (req, res) => {
    try {
      const neonCounts = await getNeonTableCounts();
      const metaRes = await queryNeon(`SELECT * FROM neon_sheet_sync_metadata ORDER BY updated_at DESC`);
      res.json({
        status: 'success',
        neonCounts,
        metadata: metaRes.rows,
        disasterRecoveryConfig,
        leadDeltaSyncConfig,
        autoSyncConfig: disasterRecoveryConfig
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Dedicated Background Lead Delta Sync Endpoint (Meta Leads + WhatsApp Enquiries -> Neon DB)
  app.get('/api/neon/sync/leads-delta', async (req, res) => {
    try {
      const { metaSheetUrl, whatsAppSheetUrl } = req.query as { metaSheetUrl?: string; whatsAppSheetUrl?: string };
      const result = await executeLeadsDeltaSync(metaSheetUrl, whatsAppSheetUrl);
      res.json(result);
    } catch (err: any) {
      console.error('Neon GET /api/neon/sync/leads-delta error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/sync/leads-delta', async (req, res) => {
    try {
      const { metaSheetUrl, whatsAppSheetUrl } = req.body || {};
      const result = await executeLeadsDeltaSync(metaSheetUrl, whatsAppSheetUrl);
      res.json(result);
    } catch (err: any) {
      console.error('Neon POST /api/neon/sync/leads-delta error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/neon/sync/leads-delta/config', (req, res) => {
    res.json({ status: 'success', config: leadDeltaSyncConfig });
  });

  app.post('/api/neon/sync/leads-delta/config', (req, res) => {
    const { enabled, intervalMinutes } = req.body || {};
    if (typeof enabled === 'boolean') {
      leadDeltaSyncConfig.enabled = enabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1) {
      leadDeltaSyncConfig.intervalMinutes = Math.max(intervalMinutes, 5);
    }
    console.log('⚙️ [Neon Leads Delta Sync Config Updated]:', leadDeltaSyncConfig);
    res.json({ status: 'success', config: leadDeltaSyncConfig });
  });

  // Disaster Recovery Configuration & Manual Trigger Endpoints
  app.get('/api/neon/disaster-recovery/config', (req, res) => {
    res.json({
      status: 'success',
      config: disasterRecoveryConfig,
      explanation: 'Google Sheets database is strictly used as disaster recovery and backup storage. Deactivated by default.'
    });
  });

  app.post('/api/neon/disaster-recovery/config', (req, res) => {
    const { enabled, intervalMinutes } = req.body || {};
    if (typeof enabled === 'boolean') {
      disasterRecoveryConfig.enabled = enabled;
      autoSyncConfig.enabled = enabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1) {
      disasterRecoveryConfig.intervalMinutes = intervalMinutes;
      autoSyncConfig.intervalMinutes = intervalMinutes;
    }
    console.log('🛡️ [Neon Disaster Recovery Config Updated]:', disasterRecoveryConfig);
    res.json({ status: 'success', config: disasterRecoveryConfig });
  });

  app.post('/api/neon/disaster-recovery/backup', async (req, res) => {
    try {
      const { sheetsUrl } = req.body || {};
      const result = await executeDisasterRecoveryBackup(sheetsUrl);
      res.json(result);
    } catch (err: any) {
      console.error('Neon POST /api/neon/disaster-recovery/backup error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/disaster-recovery/restore', async (req, res) => {
    try {
      const { sheetsUrl } = req.body || {};
      console.log('🛡️ [Disaster Recovery Restore] Restoring Neon database from Google Sheets backup...');
      const result = await executeBackendDeltaSync(sheetsUrl, true);
      disasterRecoveryConfig.lastRunAt = new Date().toISOString();
      disasterRecoveryConfig.lastStatus = 'RESTORE_COMPLETED';
      disasterRecoveryConfig.lastResult = result;
      res.json({
        status: 'success',
        message: 'Disaster recovery restore completed from Google Sheets into Neon DB.',
        result
      });
    } catch (err: any) {
      console.error('Neon POST /api/neon/disaster-recovery/restore error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/neon/sync/delta', async (req, res) => {
    try {
      const { sheetsUrl, forceFull } = req.body || {};
      const result = await executeBackendDeltaSync(sheetsUrl, !!forceFull);
      disasterRecoveryConfig.lastRunAt = new Date().toISOString();
      disasterRecoveryConfig.lastStatus = result.skipped ? 'SKIPPED_UP_TO_DATE' : result.status;
      disasterRecoveryConfig.lastResult = result;
      res.json(result);
    } catch (err: any) {
      console.error('Neon POST /api/neon/sync/delta error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Dedicated endpoint to sync or refresh Master Car Database (7,560 trims) into Neon PostgreSQL
  app.post('/api/neon/sync/car-database', async (req, res) => {
    try {
      const { force } = req.body || {};
      const result = await syncCarDatabaseToNeon(force !== false);
      res.json(result);
    } catch (err: any) {
      console.error('Neon POST /api/neon/sync/car-database error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/neon/sync/auto-config', (req, res) => {
    res.json({ status: 'success', config: disasterRecoveryConfig });
  });

  app.post('/api/neon/sync/auto-config', (req, res) => {
    const { enabled, intervalMinutes } = req.body || {};
    if (typeof enabled === 'boolean') {
      disasterRecoveryConfig.enabled = enabled;
      autoSyncConfig.enabled = enabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1) {
      disasterRecoveryConfig.intervalMinutes = intervalMinutes;
      autoSyncConfig.intervalMinutes = intervalMinutes;
    }
    console.log('⚙️ [Neon Auto Sync Config Updated]:', disasterRecoveryConfig);
    res.json({ status: 'success', config: disasterRecoveryConfig });
  });

  // 1. Scheduled Background Lead Delta Sync (RESTRICTED - Auto-sync disabled by default to protect bandwidth)
  setInterval(async () => {
    if (!leadDeltaSyncConfig.enabled) {
      return;
    }
    try {
      console.log('⚡ [Auto Lead Delta Sync] Checking for new Meta & WhatsApp leads from Google Sheets...');
      await executeLeadsDeltaSync();
    } catch (err: any) {
      console.warn('⚠️ [Auto Lead Delta Sync Runner Error]:', err.message);
    }
  }, Math.max(leadDeltaSyncConfig.intervalMinutes, 60) * 60 * 1000);

  // 2. Scheduled Disaster Recovery / Backup Run (Deactivated by default per user requirements)
  setInterval(async () => {
    if (!disasterRecoveryConfig.enabled) return;
    try {
      console.log('🛡️ [Disaster Recovery Backup Run] Running scheduled Google Sheets backup sync...');
      const result = await executeBackendDeltaSync();
      disasterRecoveryConfig.lastRunAt = new Date().toISOString();
      disasterRecoveryConfig.lastStatus = result.skipped ? 'SKIPPED_UP_TO_DATE' : result.status;
      disasterRecoveryConfig.lastResult = result;
    } catch (err: any) {
      console.warn('⚠️ [Disaster Recovery Backup Run Error]:', err.message);
    }
  }, disasterRecoveryConfig.intervalMinutes * 60 * 1000);

  // Serve service worker and manifest files directly
  app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    const pubPath = path.join(process.cwd(), 'public', 'service-worker.js');
    const rootPath = path.join(process.cwd(), 'service-worker.js');
    res.sendFile(pubPath, (err) => {
      if (err) {
        res.sendFile(rootPath, (err2) => {
          if (err2) res.status(404).send('Not found');
        });
      }
    });
  });

  app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const pubPath = path.resolve(rootDir, 'public', 'manifest.json');
    const rootPath = path.resolve(rootDir, 'manifest.json');
    res.sendFile(pubPath, (err) => {
      if (err) {
        res.sendFile(rootPath, (err2) => {
          if (err2) res.status(404).send('Not found');
        });
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      console.log('ℹ️ Vite development server not loaded or running in standalone API mode.');
    }
  } else {
    // When running bundled in dist/server.cjs or via npm start
    const distPath = currentDir.endsWith('dist') ? currentDir : path.resolve(rootDir, 'dist');
    const indexHtmlPath = path.resolve(distPath, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      app.use(express.static(distPath));
      app.use((req, res) => {
        res.sendFile(indexHtmlPath);
      });
    } else {
      // Standalone backend mode (e.g. Render Web Service without client UI bundle)
      app.use((req, res) => {
        res.status(200).json({
          status: 'ok',
          service: 'A Big Engine API Backend',
          platform: isRender ? 'Render Web Service' : 'Node.js Express',
          message: 'Backend server is running and ready for API requests.',
          healthEndpoint: '/api/health',
          neonHealthEndpoint: '/api/neon/health',
          proxyEndpoint: '/api/proxy'
        });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT} [Platform: ${isRender ? 'Render' : 'Local/Container'}]`);
    // Auto-initialize Neon PostgreSQL tables if DATABASE_URL is configured
    await initNeonTables().catch((err) => {
      console.warn('ℹ️ [Neon] Deferred auto-migration:', err.message);
    });
    // Auto-check and populate car_database in Neon PostgreSQL if empty
    syncCarDatabaseToNeon(false).catch((err) => {
      console.warn('ℹ️ [Neon] Deferred car database sync:', err.message);
    });
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
