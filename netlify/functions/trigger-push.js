const webpush = require('web-push');

// This function sends a push notification using the web-push library.
// It requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to be set as
// environment variables in your Netlify site settings.
// You can generate these keys by running `npx web-push generate-vapid-keys` in your terminal.

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.error('VAPID keys are not configured on the server.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Push server is not configured.' }) };
    }

    // You should replace this email with a valid contact email for your service.
    webpush.setVapidDetails(
        'mailto:admin@your-service.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );

    try {
        const { subscription, payload } = JSON.parse(event.body);
        
        if (!subscription || !subscription.endpoint) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Invalid subscription object provided.' }) };
        }

        await webpush.sendNotification(subscription, JSON.stringify(payload));
        
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
        console.error('Error sending push notification:', error);
        
        // If the subscription is no longer valid, the push service will return a 410 Gone status.
        if (error.statusCode === 410) {
            console.log('Subscription has expired or is no longer valid.');
        }

        return { 
            statusCode: error.statusCode || 500, 
            body: JSON.stringify({ 
                error: 'Failed to send notification.', 
                details: error.body || error.message 
            }) 
        };
    }
};