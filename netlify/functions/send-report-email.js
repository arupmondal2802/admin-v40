const sgMail = require('@sendgrid/mail');

exports.handler = async function(event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const hasApiKey = !!sendgridApiKey;

  if (hasApiKey) {
    sgMail.setApiKey(sendgridApiKey);
  } else {
    console.log('[Serverless] SENDGRID_API_KEY not configured. Simulating report email send.');
  }

  try {
    const { recipients, config, appointments = [], serviceRequests = [] } = JSON.parse(event.body);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Recipients list is empty or invalid. Please specify at least one email.' })
      };
    }

    // Process dates and filter data
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const now = new Date();
    
    // Helper to check if a date is today
    const isToday = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === todayStr;
    };

    // Helper to check if a date is in the upcoming 7 days (tomorrow onwards)
    const isUpcoming = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const diffTime = d.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 7;
    };

    // Filter appointments (orders)
    const todayOrders = appointments.filter(a => isToday(a.timestamp));
    const upcomingOrders = appointments.filter(a => isUpcoming(a.timestamp));
    const overdueOrders = appointments.filter(a => {
      if (a.status === 'Completed' || a.status === 'Draft') return false;
      // If order is active (Queued, Assigned, In Progress) and created more than 24 hours ago
      const createdTime = new Date(a.timestamp).getTime();
      const hoursElapsed = (now.getTime() - createdTime) / (1000 * 60 * 60);
      return hoursElapsed > 24;
    });

    // Filter raw service requests (leads/leads bookings)
    const todayLeads = serviceRequests.filter(sr => isToday(sr.requestDate) || isToday(sr.createdTime));
    const upcomingLeads = serviceRequests.filter(sr => isUpcoming(sr.requestDate));

    // Calculate revenue metrics
    const totalTodayRevenue = todayOrders
      .filter(o => o.status === 'Completed')
      .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

    const pendingTodayRevenue = todayOrders
      .filter(o => o.status !== 'Completed')
      .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

    // Build the HTML Content
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
            <div class="metric-value">${todayOrders.filter(o => o.status === 'Completed').length}</div>
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
      overdueOrders.forEach(o => {
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
          todayOrders.forEach(o => {
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
          todayLeads.forEach(l => {
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
          upcomingOrders.forEach(o => {
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
          upcomingLeads.forEach(l => {
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
        from: 'noreply@abigengine.com', // Verified single sender address
        subject: `[A Big Engine] Daily Appt & Status Recap - ${todayStr}`,
        html: reportHtml,
      };

      await sgMail.sendMultiple(msg);
      console.log(`[Serverless] Successfully sent report emails via SendGrid to: ${recipients.join(', ')}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: `Report sent successfully to ${recipients.length} recipients.`, previewHtml: reportHtml })
      };
    } else {
      console.log('[Serverless] Email sending is simulated. Returning generated HTML to user for preview.');
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          simulated: true,
          message: 'Email sent successfully (Simulated - SendGrid API key not configured).',
          previewHtml: reportHtml
        })
      };
    }

  } catch (error) {
    console.error('[Serverless] Error compiling/sending email reports:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process report email.', details: error.message })
    };
  }
};
