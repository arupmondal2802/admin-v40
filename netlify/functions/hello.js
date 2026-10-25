// Example Netlify function.
// This is not used by the app yet, but sets up the structure
// for future backend logic, such as integrating with the Gemini API.
// To access this function, you would fetch `/.netlify/functions/hello` from the frontend.

exports.handler = async function(event, context) {
  // Example of accessing an environment variable on Netlify.
  // The Gemini API key should be stored as a Netlify environment variable
  // and would be accessed here like this:
  // const geminiApiKey = process.env.API_KEY;

  const exampleSecret = process.env.EXAMPLE_SECRET || 'not set';

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // Allow requests from any origin for example purposes
    },
    body: JSON.stringify({ 
      message: `Hello from your Netlify Function!`,
      details: "This is a sample function showing backend capability.",
      secretStatus: `The example secret is ${exampleSecret === 'not set' ? 'not set. Add EXAMPLE_SECRET to your Netlify environment variables.' : 'set successfully!'}`
    }),
  };
};
