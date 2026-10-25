import { Service } from '../types';
import { formatScheduledDate } from './dateTimeUtils';

interface InvoiceLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

let pdfModulesPromise: Promise<{ jsPDF: any; autoTable: any }> | null = null;

const getPdfModules = async () => {
  if (!pdfModulesPromise) {
    pdfModulesPromise = (async () => {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const autoTable = (autoTableModule as any).default || autoTableModule;
      return { jsPDF, autoTable };
    })();
  }
  return pdfModulesPromise;
};

/**
  Generates and downloads a clean, professionally formatted PDF invoice for a Service Order.
 */
export const downloadOrderInvoicePDF = async (service: Service): Promise<void> => {
  if (!service) return;

  const { jsPDF, autoTable } = await getPdfModules();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const orderId = service.appointmentId 
    ? `#${service.appointmentId.split('-').pop()}` 
    : service.submissionId 
      ? `#${service.submissionId.slice(-6).toUpperCase()}` 
      : '#ORD-001';

  // --- Header Section ---
  // Brand Logo / Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(13, 42, 79); // #0D2A4F Brand Blue
  doc.text('A BIG ENGINE', 14, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(248, 191, 42); // #f8bf2a Brand Accent / Gold
  doc.text('PREMIUM AUTO CARE SPECIALISTS', 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('Doorstep Auto Detailing & Fleet Maintenance', 14, 29);

  // Right-aligned Invoice Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(13, 42, 79);
  doc.text('SERVICE INVOICE', 196, 20, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Order ID: ${orderId}`, 196, 26, { align: 'right' });

  const invoiceDateStr = service.scheduledDate 
    ? formatScheduledDate(service) 
    : service.timestamp 
      ? new Date(service.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${invoiceDateStr}`, 196, 31, { align: 'right' });
  doc.text(`Status: ${service.status || 'Active'}`, 196, 35, { align: 'right' });

  // Divider Line
  doc.setDrawColor(13, 42, 79);
  doc.setLineWidth(0.6);
  doc.line(14, 38, 196, 38);

  // --- Customer & Vehicle Details Box ---
  const startY = 43;

  // Box 1: Customer Info
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(14, startY, 88, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(13, 42, 79);
  doc.text('CUSTOMER DETAILS', 18, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const custName = `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Valued Customer';
  doc.text(custName, 18, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Mobile: ${service.mobileNumber || 'N/A'}`, 18, startY + 18);
  if (service.customerEmail) {
    doc.text(`Email: ${service.customerEmail}`, 18, startY + 23);
  }
  const address = service.streetAddress ? (service.streetAddress.length > 40 ? service.streetAddress.substring(0, 38) + '...' : service.streetAddress) : 'N/A';
  doc.text(`Address: ${address}`, 18, startY + 28);

  // Box 2: Vehicle & Service Schedule Info
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(108, startY, 88, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(13, 42, 79);
  doc.text('VEHICLE & SCHEDULE', 112, startY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Car Reg: ${service.carNumber || 'N/A'}`, 112, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Model: ${service.carBrandModel || 'N/A'}`, 112, startY + 18);
  doc.text(`Category: ${service.vehicleCategoryTag || 'Standard'}`, 112, startY + 23);
  const scheduledTimeStr = service.scheduledTime ? ` at ${service.scheduledTime}` : '';
  doc.text(`Scheduled: ${invoiceDateStr}${scheduledTimeStr}`, 112, startY + 28);
  if (service.assignedTo) {
    doc.text(`Technician: ${service.assignedTo}`, 112, startY + 33);
  }

  // --- Build Line Items ---
  const lineItems: InvoiceLineItem[] = [];

  const selection = Array.isArray(service.serviceSelection) ? service.serviceSelection : [];

  // 1. Car Washing
  if (selection.includes('Car Washing') && service.carWashDetails) {
    const isSub = service.isSubscription ? ' (Subscription Plan)' : '';
    lineItems.push({
      description: `Car Washing: ${service.carWashDetails.washType}${isSub}`,
      qty: 1,
      unitPrice: service.carWashDetails.price || 0,
      totalPrice: service.carWashDetails.price || 0,
    });
  }

  // 2. Car Care
  if (selection.includes('Car Care') && service.carCareDetails) {
    lineItems.push({
      description: `Car Care & Detailing: ${service.carCareDetails.careType}`,
      qty: 1,
      unitPrice: service.carCareDetails.price || 0,
      totalPrice: service.carCareDetails.price || 0,
    });
  }

  // 3. Tyre Replacement
  if (selection.includes('Tyre Replacement') && service.tyreReplacementTotalAmount > 0) {
    const qty = service.tyreReplacementQuantity || 1;
    const total = service.tyreReplacementTotalAmount || 0;
    lineItems.push({
      description: `Tyre Replacement (${qty} Tyre${qty > 1 ? 's' : ''})`,
      qty: qty,
      unitPrice: Math.round(total / qty),
      totalPrice: total,
    });
  }

  // 4. Battery Replacement
  if (selection.includes('Battery Replacement') && Array.isArray(service.batteryDetails)) {
    service.batteryDetails.forEach((battery) => {
      const net = ((battery && battery.newBatteryAmount) || 0) - ((battery && battery.exchangeValue) || 0);
      if (net > 0) {
        lineItems.push({
          description: `Battery Replacement: ${(battery && battery.brand) || 'Battery'} ${battery && battery.serialNumber ? `(S/N: ${battery.serialNumber})` : ''}`,
          qty: 1,
          unitPrice: net,
          totalPrice: net,
        });
      }
    });
  }

  // 5. Dynamic Add-ons
  (Array.isArray(service.dynamicAddons) ? service.dynamicAddons : []).forEach((addon) => {
    if (addon && addon.quantity > 0) {
      lineItems.push({
        description: `Add-on: ${addon.name}`,
        qty: addon.quantity,
        unitPrice: addon.price,
        totalPrice: addon.quantity * addon.price,
      });
    }
  });

  // 6. Categorized Add-ons
  (Array.isArray(service.categorizedAddons) ? service.categorizedAddons : []).forEach((addon) => {
    if (addon && (addon.amount || 0) > 0 && (addon.quantity || 0) > 0) {
      lineItems.push({
        description: `${addon.productName} (${addon.category})`,
        qty: addon.quantity,
        unitPrice: addon.amount,
        totalPrice: addon.quantity * addon.amount,
      });
    }
  });

  // 7. Custom Services
  (Array.isArray(service.customServices) ? service.customServices : []).forEach((custom) => {
    if (custom && (custom.amount || 0) > 0) {
      lineItems.push({
        description: custom.serviceDescription || 'Custom Service',
        qty: 1,
        unitPrice: custom.amount,
        totalPrice: custom.amount,
      });
    }
  });

  // 8. Doorstep Travel Charge
  if (service.travelCharge && service.travelCharge > 0) {
    lineItems.push({
      description: 'Doorstep Travel & Convenience Charge',
      qty: 1,
      unitPrice: service.travelCharge,
      totalPrice: service.travelCharge,
    });
  }

  // Fallback if no specific line item was created but grand total > 0
  if (lineItems.length === 0 && (service.grandTotal || 0) > 0) {
    lineItems.push({
      description: selection.join(', ') || 'Auto Service',
      qty: 1,
      unitPrice: service.grandTotal,
      totalPrice: service.grandTotal,
    });
  }

  // Table Columns
  const tableData = lineItems.map((item, index) => [
    (index + 1).toString(),
    item.description,
    item.qty.toString(),
    `₹${item.unitPrice.toLocaleString('en-IN')}`,
    `₹${item.totalPrice.toLocaleString('en-IN')}`,
  ]);

  // Render Table using autoTable
  autoTable(doc, {
    startY: startY + 44,
    head: [['#', 'Service Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [13, 42, 79],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 95 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    styles: {
      cellPadding: 2.5,
    },
  });

  // Get y-position after table
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : startY + 90;

  // --- Financial Summary & Payment Breakdown Box ---
  const grandTotal = service.grandTotal || lineItems.reduce((acc, i) => acc + i.totalPrice, 0);

  // Summary Box Right Aligned
  const sumBoxWidth = 80;
  const sumBoxX = 196 - sumBoxWidth;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sumBoxX, finalY, sumBoxWidth, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', sumBoxX + 6, finalY + 7);
  doc.text(`₹${grandTotal.toLocaleString('en-IN')}`, 190, finalY + 7, { align: 'right' });

  doc.text(`Payment Mode (${service.paymentMode || 'Cash'}):`, sumBoxX + 6, finalY + 13);
  const modeStatus = service.paymentMode === 'Both' 
    ? `Cash ₹${service.cashAmount || 0} / Online ₹${service.onlineAmount || 0}`
    : service.paymentMode || 'Cash';
  doc.setFontSize(7.5);
  doc.text(modeStatus, 190, finalY + 13, { align: 'right' });

  // Divider inside summary box
  doc.setDrawColor(203, 213, 225);
  doc.line(sumBoxX + 4, finalY + 17, 192, finalY + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(13, 42, 79);
  doc.text('Grand Total:', sumBoxX + 6, finalY + 23);
  doc.text(`₹${grandTotal.toLocaleString('en-IN')}`, 190, finalY + 23, { align: 'right' });

  // Remarks / Notes Box on the left side
  if (service.internalNotes) {
    const notesWidth = sumBoxX - 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(13, 42, 79);
    doc.text('Special Instructions / Remarks:', 14, finalY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const notesText = service.internalNotes;
    const splitNotes = doc.splitTextToSize(notesText, notesWidth);
    doc.text(splitNotes, 14, finalY + 12);
  }

  // --- Terms & Footer ---
  const footerY = 270;

  doc.setDrawColor(226, 232, 240);
  doc.line(14, footerY, 196, footerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 42, 79);
  doc.text('Thank you for choosing A Big Engine!', 105, footerY + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('This is a computer-generated invoice. For support, please contact customer care.', 14, footerY + 5);

  // Save the PDF file
  const fileName = `Invoice_${service.carNumber ? service.carNumber.replace(/[^a-zA-Z0-9]/g, '') : 'Order'}_${orderId.replace('#', '')}.pdf`;
  doc.save(fileName);
};
