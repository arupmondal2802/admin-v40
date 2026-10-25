// This function securely provides the VAPID public key to the frontend.
// The public key is safe to expose and is required by the browser to create a push subscription.
// VAPID_PUBLIC_KEY must be set as an environment variable in your Netlify settings.

exports.handler = async function() {
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.error('VAPID_PUBLIC_KEY environment variable is not set.');
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: 'Push notification server is not configured.' }),
    };
  }
  
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY }),
  };
};
