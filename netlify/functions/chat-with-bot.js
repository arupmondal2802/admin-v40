
// FIX: Updated to follow the latest @google/genai SDK guidelines.
const { GoogleGenAI } = require("@google/genai");

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!process.env.API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API_KEY environment variable not set on Netlify.' }),
    };
  }
  
  try {
    const { messages, serviceTemplates } = JSON.parse(event.body);
    
    // Guideline: Always use a named parameter for the API key.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const serviceNames = serviceTemplates.map(t => t.name).join(', ');

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

    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
    
    // Guideline: Use ai.models.generateContent with model, contents, and config.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
    });
    
    // Guideline: Access generated text via the .text property.
    const text = response.text;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ reply: text }),
    };

  } catch (error) {
    console.error("Error in chat-with-bot function:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get response from AI.', details: errorMessage }),
    };
  }
};
