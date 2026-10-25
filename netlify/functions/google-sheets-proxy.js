
// This function acts as a proxy to the Google Apps Script for POST requests.
// It solves a common CORS/redirect issue where the browser's `fetch` API
// cannot follow the 302 redirect returned by Google Apps Script in CORS mode.
//
// The browser client POSTs a JSON object here containing the target `sheetsUrl`
// and the `payload` for the script. This function then forwards the `payload`
// to the `sheetsUrl`, follows the redirect automatically (as Node's fetch does),
// gets the final JSON response, and returns it to the client with correct CORS headers.

exports.handler = async function(event) {
  // Common CORS headers required for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*', // Allow requests from any origin
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle CORS Preflight (OPTIONS) request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }
  
  try {
    const { sheetsUrl, payload } = JSON.parse(event.body);

    if (!sheetsUrl || !payload) {
        return { 
          statusCode: 400, 
          headers,
          body: JSON.stringify({ error: 'Missing sheetsUrl or payload in proxy request' }) 
        };
    }

    // Forward the request to the actual Google Apps Script URL
    const response = await fetch(sheetsUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow' // Node's fetch handles this correctly
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Proxy forwarding error:", { status: response.status, body: errorText });
        return { 
          statusCode: response.status, 
          headers,
          body: JSON.stringify({ error: 'Failed to forward request to Google Sheets', details: errorText }) 
        };
    }
    
    const responseText = await response.text();

let data;
try {
  data = JSON.parse(responseText);
} catch (parseError) {
  console.error("Proxy got non-JSON response from Google Apps Script:", response.status, responseText);
  return {
    statusCode: 500,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: 'Google Apps Script returned non-JSON output',
      details: responseText.slice(0, 1000),
    }),
  };
}

    // Return the final data to the original client with CORS headers
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error("Error in google-sheets-proxy function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'The proxy function encountered an error.', details: error.message }),
    };
  }
};
