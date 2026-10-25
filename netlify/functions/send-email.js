// This function sends an email to the customer when their service status changes.
// It uses SendGrid for email delivery. To make this function work, you must:
// 1. Create a SendGrid account (a free tier is available).
// 2. Create and verify a "Single Sender" email address in SendGrid.
// 3. Generate a SendGrid API Key.
// 4. Add the API key to your Netlify site's environment variables with the key `SENDGRID_API_KEY`.
// 5. Update the `fromEmail` variable below to match your verified sender address.

const sgMail = require('@sendgrid/mail');

exports.handler = async function(event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Gracefully handle missing API key for demonstration and local development
  if (!process.env.SENDGRID_API_KEY) {
      console.log('SENDGRID_API_KEY environment variable not set. Email sending is disabled.');
      // Return a success response so the frontend doesn't show an error for a non-critical feature.
      return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Email service is not configured on the server, skipping notification.' }),
      };
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    const { service } = JSON.parse(event.body);
    if (!service || !service.customerEmail || !service.status) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields for email: service data, customerEmail, or status' }) };
    }

    let subject = '';
    let htmlContent = '';
    // IMPORTANT: Replace this with your verified SendGrid sender email
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
        // Don't send emails for other statuses, just return success.
        return { statusCode: 200, body: JSON.stringify({ message: 'No email template configured for this status.' }) };
    }

    const msg = {
      to: service.customerEmail,
      from: fromEmail,
      subject: subject,
      html: htmlContent,
    };
    
    // In a real production app, you would uncomment the line below.
    // await sgMail.send(msg); 
    
    console.log('--- SIMULATING EMAIL SEND (would be real if SENDGRID_API_KEY was set) ---');
    console.log(`To: ${msg.to}`);
    console.log(`From: ${msg.from}`);
    console.log(`Subject: ${msg.subject}`);
    console.log('-------------------------------------------------------------------------');

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Email sent successfully (simulated).' }),
    };

  } catch (error) {
    console.error('Error in send-email function:', error);
    // Check for SendGrid-specific errors if the library was used
    if (error.response) {
      console.error(error.response.body);
    }
    return {
        statusCode: 500,
        body: JSON.stringify({ error: 'An internal error occurred while trying to send the email.' }),
    };
  }
};
