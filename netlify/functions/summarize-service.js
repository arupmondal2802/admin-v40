
// FIX: Updated to follow the latest @google/genai SDK guidelines.
const { GoogleGenAI } = require("@google/genai");

// Helper to format service data into a readable string for the prompt
const formatServiceForPrompt = (service) => {
    let promptText = `Customer: ${service.customerFirstName} ${service.customerLastName}\n`;
    promptText += `Car: ${service.carBrandModel} (${service.carNumber})\n`;
    promptText += `Date: ${new Date(service.timestamp).toLocaleDateString()}\n`;
    promptText += `Services Performed: ${service.serviceSelection.join(', ')}\n\n`;
    promptText += "Itemized Details:\n";
    
    // Add details for each service
    if (service.carWashDetails) promptText += `- Car Wash (${service.carWashDetails.washType}): ₹${service.carWashDetails.price.toFixed(2)}\n`;
    if (service.tyreReplacementTotalAmount > 0) promptText += `- Tyre Replacement: ₹${service.tyreReplacementTotalAmount.toFixed(2)}\n`;
    if (service.batteryReplacementTotalAmount > 0) promptText += `- Battery Service: ₹${service.batteryReplacementTotalAmount.toFixed(2)}\n`;
    if (service.addonsTotal > 0) promptText += `- Add-ons Total: ₹${service.addonsTotal.toFixed(2)}\n`;
    if (service.customServicesTotal > 0) promptText += `- Custom Services: ₹${service.customServicesTotal.toFixed(2)}\n`;

    promptText += `\nGrand Total: ₹${service.grandTotal.toFixed(2)}\n`;
    return promptText;
};

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!process.env.API_KEY) {
      return {
          statusCode: 500,
          body: JSON.stringify({ error: 'API_KEY environment variable not set on Netlify.' }),
      };
  }
  
  try {
    const service = JSON.parse(event.body);
    
    // Guideline: Always use a named parameter for the API key.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const formattedService = formatServiceForPrompt(service);
    const prompt = `Please provide a brief, friendly summary of the following auto service record for the customer. Mention the key services performed and the grand total. Keep it under 80 words and use a positive tone. Here is the service data:\n\n${formattedService}`;

    // Guideline: Use ai.models.generateContent with model and contents.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    // Guideline: Access generated text via the .text property.
    const summary = response.text;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ summary }),
    };

  } catch (error) {
    console.error("Error in summarize-service function:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate summary.', details: errorMessage }),
    };
  }
};
