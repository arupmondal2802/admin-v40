
import React, { useMemo, useEffect, useState } from 'react';
import { Service, ServiceTemplate, PaymentMode, BaseStepProps, Permission } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { IconPrint, IconCreditCard, IconCamera, IconCheck, IconX, IconAlertTriangle } from './ui/Icon';
import { FileText } from 'lucide-react';
import { downloadOrderInvoicePDF } from '../utils/pdfGenerator';
import Checkbox from './ui/Checkbox';
import Input from './ui/Input';
import SignaturePad from './ui/SignaturePad';
import LocationPickerModal from './ui/LocationPickerModal';
import LocationPreviewMap from './ui/LocationPreviewMap';
import OrderTagsManager from './ui/OrderTagsManager';

interface PurchaseItem {
    description: string;
    qty: number;
    price: number;
}

export const SummaryStep: React.FC<BaseStepProps> = ({ state, updateField, serviceTemplates, currentUser }) => {
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const purchaseItems: PurchaseItem[] = useMemo(() => {
    const items: PurchaseItem[] = [];

    const selection = Array.isArray(state.serviceSelection) ? state.serviceSelection : [];

    // Car Washing Service
    if (selection.includes("Car Washing") && state.carWashDetails) {
        items.push({
            description: `Car Washing: ${state.carWashDetails.washType} ${state.isSubscription ? '(Subscription)' : ''}`,
            qty: 1,
            price: state.carWashDetails.price,
        });
    }
    
    // Car Care Service
    if (selection.includes("Car Care") && state.carCareDetails) {
        items.push({
            description: `Car Care: ${state.carCareDetails.careType}`,
            qty: 1,
            price: state.carCareDetails.price,
        });
    }

    // Tyre Replacement Service (itemized)
    if (selection.includes("Tyre Replacement")) {
        if (state.tyreReplacementTotalAmount > 0) {
             items.push({
                description: `Tyre Replacement`,
                qty: state.tyreReplacementQuantity,
                price: state.tyreReplacementTotalAmount
            });
        }
    }

    // Battery Replacement Service (itemized)
    if (selection.includes("Battery Replacement")) {
        (Array.isArray(state.batteryDetails) ? state.batteryDetails : []).forEach(battery => {
            const netAmount = ((battery && battery.newBatteryAmount) || 0) - ((battery && battery.exchangeValue) || 0);
            if (netAmount > 0) {
                items.push({
                    description: `Battery: ${(battery && battery.brand) || 'Unspecified Brand'}`,
                    qty: 1,
                    price: netAmount,
                });
            }
        });
    }

    // Dynamic Add-ons
    (Array.isArray(state.dynamicAddons) ? state.dynamicAddons : []).forEach(item => {
        if (item && item.quantity > 0) {
            items.push({
                description: item.name,
                qty: item.quantity,
                price: item.quantity * (item.price || 0),
            });
        }
    });


    // Categorized (Custom) Add-ons
    (Array.isArray(state.categorizedAddons) ? state.categorizedAddons : []).forEach(addon => {
        if (addon && (addon.amount || 0) > 0 && (addon.quantity || 0) > 0) {
            items.push({
                description: `${addon.productName} (${addon.category})`,
                qty: addon.quantity,
                price: addon.quantity * addon.amount,
            });
        }
    });


    // Custom Services (itemized)
    (Array.isArray(state.customServices) ? state.customServices : []).forEach(custom => {
        if (custom && (custom.amount || 0) > 0) {
            items.push({
                description: custom.serviceDescription || 'Custom Service',
                qty: 1,
                price: custom.amount,
            });
        }
    });

    // Travel Charge
    if (state.travelCharge && state.travelCharge > 0) {
        items.push({
            description: `Doorstep Travel Charge`,
            qty: 1,
            price: state.travelCharge
        });
    }

    return items;
  }, [state]);

  // Effect to update payment amounts when grand total changes or payment mode changes
  useEffect(() => {
    if (state.paymentMode === 'Cash') {
        updateField('cashAmount', state.grandTotal);
        updateField('onlineAmount', 0);
    } else if (state.paymentMode === 'Online') {
        updateField('cashAmount', 0);
        updateField('onlineAmount', state.grandTotal);
    }
    // If 'Both', we don't auto-update to avoid overwriting user input, unless amounts are 0/0
    else if (state.paymentMode === 'Both') {
         if ((state.cashAmount || 0) + (state.onlineAmount || 0) !== state.grandTotal) {
             // Optional: could auto-balance here, but usually safer to let user type
         }
    }
  }, [state.paymentMode, state.grandTotal]);


  const customFieldDetails = useMemo(() => {
        if (!state.customFieldData || state.customFieldData.length === 0) return null;
        
        const allCustomFields = serviceTemplates.flatMap(st => st.customFields);

        return state.customFieldData.map(data => {
            const fieldDef = allCustomFields.find(f => f.id === data.fieldId);
            if (!fieldDef || !data.value) return null;

            let displayValue: React.ReactNode = data.value;
            if (fieldDef.type === 'PHOTO' && typeof data.value === 'string') {
                displayValue = <a href={data.value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Photo</a>;
            }
            
            return {
                label: fieldDef.label,
                value: displayValue
            };
        }).filter(Boolean);
    }, [state.customFieldData, serviceTemplates]);

  const photoChecklist = useMemo(() => {
    const list: {
      id: string;
      label: string;
      serviceName: string;
      isUploaded: boolean;
      url?: string;
      isMandatory: boolean;
    }[] = [];

    const selection = Array.isArray(state.serviceSelection) ? state.serviceSelection : [];
    const isWashOrCare = selection.includes('Car Washing') || selection.includes('Car Care');

    if (isWashOrCare) {
      list.push({
        id: 'beforeWashingPhoto',
        label: 'Inspection Photo (Before Washing / Care)',
        serviceName: selection.filter(s => s === 'Car Washing' || s === 'Car Care').join(', '),
        isUploaded: !!state.beforeWashingPhoto,
        url: state.beforeWashingPhoto,
        isMandatory: true,
      });

      list.push({
        id: 'afterWashingPhoto',
        label: 'Completion Photo (After Washing / Care)',
        serviceName: selection.filter(s => s === 'Car Washing' || s === 'Car Care').join(', '),
        isUploaded: !!state.afterWashingPhoto,
        url: state.afterWashingPhoto,
        isMandatory: false,
      });
    }

    if (selection.includes('Tyre Replacement')) {
      if (state.tyreDetails && state.tyreDetails.length > 0) {
        state.tyreDetails.forEach((tyre, idx) => {
          list.push({
            id: `tyre-dot-${idx}`,
            label: `Tyre #${idx + 1} DOT Serial Number Photo ${tyre.brand ? `(${tyre.brand})` : ''}`,
            serviceName: 'Tyre Replacement',
            isUploaded: !!tyre.dotSerialNumberImage,
            url: tyre.dotSerialNumberImage,
            isMandatory: true,
          });
        });
      } else {
        list.push({
          id: 'tyre-dot-default',
          label: 'Tyre DOT Serial Number Photo',
          serviceName: 'Tyre Replacement',
          isUploaded: false,
          isMandatory: true,
        });
      }
    }

    if (list.length === 0) {
      list.push({
        id: 'beforeWashingPhoto',
        label: 'Inspection Photo',
        serviceName: 'General Inspection',
        isUploaded: !!state.beforeWashingPhoto,
        url: state.beforeWashingPhoto,
        isMandatory: false,
      });
      list.push({
        id: 'afterWashingPhoto',
        label: 'Completion Photo',
        serviceName: 'General Completion',
        isUploaded: !!state.afterWashingPhoto,
        url: state.afterWashingPhoto,
        isMandatory: false,
      });
    }

    return list;
  }, [state]);

  const missingMandatoryPhotos = useMemo(() => {
    return photoChecklist.filter(item => item.isMandatory && !item.isUploaded);
  }, [photoChecklist]);

  const missingOptionalPhotos = useMemo(() => {
    return photoChecklist.filter(item => !item.isMandatory && !item.isUploaded);
  }, [photoChecklist]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.permissions?.includes(Permission.CAN_EDIT_ANY_ORDER);
  const isAgentOrSales = currentUser?.role === 'agent' || currentUser?.agentCategory === 'SALES_AGENT' || !isAdmin;


  const DetailItem: React.FC<{ label: string; value: string | React.ReactNode }> = ({ label, value }) => (
      <div>
          <dt className="text-sm font-medium text-slate-500">{label}</dt>
          <dd className="text-base font-semibold text-slate-800 break-words">{value}</dd>
      </div>
  );

  const handlePrint = () => {
    window.print();
  };

  const handlePaymentModeChange = (mode: PaymentMode) => {
      updateField('paymentMode', mode);
  };

  const paymentBalance = (state.cashAmount || 0) + (state.onlineAmount || 0) - state.grandTotal;
  const isPaymentBalanced = Math.abs(paymentBalance) < 0.01;

  return (
    <div className="space-y-8 printable-area">
      {/* Customer Details */}
      <Card title="Customer Details" className="print:shadow-none print:border space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <DetailItem label="Name" value={`${state.customerFirstName} ${state.customerLastName}`} />
              <DetailItem label="Mobile Number" value={state.mobileNumber} />
              <DetailItem label="Car" value={`${state.carBrandModel} (${state.carNumber})`} />
              <DetailItem label="Vehicle Category" value={state.vehicleCategoryTag} />
              <DetailItem label="Address" value={state.streetAddress} />
              <DetailItem 
                label="Assigned Labor / Technicians" 
                value={
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {state.assignedTo ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                        🔧 {state.assignedTo} (Primary)
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal italic">Unassigned</span>
                    )}
                    {state.secondaryAssignee && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                        🤝 {state.secondaryAssignee} (Helper)
                      </span>
                    )}
                  </div>
                } 
              />
          </dl>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 no-print">
            <LocationPreviewMap
              latitude={state.customerLatitude}
              longitude={state.customerLongitude}
              address={state.streetAddress}
              onOpenPicker={() => setIsLocationPickerOpen(true)}
              title="Verified Customer Doorstep Map Preview"
              height="180px"
            />
          </div>
      </Card>

      {/* Purchase Summary */}
      <Card title="Purchase Summary" className="print:shadow-none print:border">
          <div className="flex flex-wrap items-center justify-end gap-2 mb-4 -mt-2 no-print">
            <Button onClick={() => downloadOrderInvoicePDF(state as Service)} variant="secondary" size="sm" className="text-xs">
                <FileText className="w-4 h-4 mr-1.5 text-blue-600" />
                Download PDF
            </Button>
            <Button onClick={handlePrint} variant="ghost" size="sm" className="text-xs">
                <IconPrint className="w-4 h-4 mr-1.5" />
                Print Summary
            </Button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
                <table className="min-w-full">
                    <thead className="bg-slate-50">
                        <tr>
                            <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs sm:text-sm font-semibold text-slate-900 sm:pl-6">Item / Service</th>
                            <th scope="col" className="px-2 sm:px-3 py-3 text-center text-xs sm:text-sm font-semibold text-slate-900">Qty</th>
                            <th scope="col" className="px-3 sm:px-4 py-3 text-right text-xs sm:text-sm font-semibold text-slate-900">Price</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {purchaseItems.map((item, index) => (
                            <tr key={index} className="even:bg-slate-50 border-b border-slate-200 last:border-b-0">
                                <td className="py-3 pl-4 pr-3 text-xs sm:text-sm font-medium text-slate-900 sm:pl-6 break-words">{item.description}</td>
                                <td className="px-2 sm:px-3 py-3 text-xs sm:text-sm text-center text-slate-500">{item.qty}</td>
                                <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-right text-slate-700 font-semibold">₹{item.price.toFixed(2)}</td>
                            </tr>
                        ))}
                        {purchaseItems.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-8 text-xs sm:text-sm text-slate-500">No services or products selected.</td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50/50">
                            <th scope="row" colSpan={2} className="pl-4 pr-3 py-3 text-right text-sm sm:text-base font-bold text-slate-900 sm:pl-6">Grand Total</th>
                            <td className="pl-3 pr-4 py-3 text-right text-base sm:text-lg font-black text-brand-blue sm:pr-6">₹{state.grandTotal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
          </div>
          {customFieldDetails && customFieldDetails.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
                 <h4 className="text-sm sm:text-md font-semibold text-slate-800">Service-Specific Details</h4>
                 <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {customFieldDetails.map(detail => detail && <DetailItem key={detail.label} label={detail.label} value={detail.value} />)}
                 </dl>
            </div>
          )}
      </Card>

      {/* Inspection & Photo Requirements Checklist Card */}
      <Card title="Photo Requirements & Status Summary" className="print:shadow-none print:border">
        {missingMandatoryPhotos.length > 0 ? (
          <div className="p-4 mb-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 flex items-start space-x-3">
            <IconAlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">
                {missingMandatoryPhotos.length} Mandatory Photo{missingMandatoryPhotos.length > 1 ? 's' : ''} Still Missing
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {isAgentOrSales 
                  ? 'Agents and Sales team members must upload required photos before completing the order.'
                  : 'Mandatory photo validation applies to agents and sales representatives.'
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 mb-4 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-start space-x-3">
            <IconCheck className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">All Mandatory Photos Verified</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {missingOptionalPhotos.length > 0 
                  ? `All mandatory inspection photos are uploaded. (${missingOptionalPhotos.length} optional completion photo pending)`
                  : 'All inspection and completion photos are uploaded successfully.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {photoChecklist.map((item) => (
            <div 
              key={item.id} 
              className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                item.isUploaded 
                  ? 'bg-slate-50 border-slate-200' 
                  : item.isMandatory 
                  ? 'bg-red-50/60 border-red-200' 
                  : 'bg-slate-50/50 border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0 pr-2">
                <div className={`p-2 rounded-md ${
                  item.isUploaded 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : item.isMandatory 
                    ? 'bg-red-100 text-red-700' 
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  <IconCamera className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-slate-800 truncate">{item.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {item.serviceName} • {item.isMandatory ? 'Mandatory' : 'Optional'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                {item.isUploaded ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <IconCheck className="w-3 h-3 mr-1 text-emerald-600" /> Captured
                    </span>
                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    )}
                  </div>
                ) : (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                    item.isMandatory 
                      ? 'bg-red-100 text-red-800 border-red-200 animate-pulse' 
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}>
                    <IconX className="w-3 h-3 mr-1" /> {item.isMandatory ? 'Missing' : 'Pending'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Order Tags & Custom Labels */}
      <div className="mb-6 no-print">
        <OrderTagsManager
          tags={state.tags || []}
          onChange={(newTags) => updateField('tags', newTags)}
          title="Order Tags & Handling Labels"
          description="Confirm or adjust priority labels (e.g. VIP, Urgent, Return-Visit) before completing this order."
        />
      </div>
      
      {/* Payment Details */}
      <Card title="Payment Details" className="no-print">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      {['Cash', 'Online', 'Both'].map((mode) => (
                          <label key={mode} className={`flex items-center justify-center space-x-2 p-2.5 sm:p-3 rounded-xl border cursor-pointer transition-all ${state.paymentMode === mode ? 'bg-brand-accent/10 border-brand-accent ring-2 ring-brand-accent/50' : 'bg-white border-slate-300 hover:bg-slate-50'}`}>
                              <input 
                                  type="radio" 
                                  name="paymentMode" 
                                  value={mode} 
                                  checked={state.paymentMode === mode} 
                                  onChange={() => handlePaymentModeChange(mode as PaymentMode)}
                                  className="h-4 w-4 text-brand-accent focus:ring-brand-accent"
                              />
                              <span className="font-semibold text-xs sm:text-sm text-slate-800">{mode}</span>
                          </label>
                      ))}
                  </div>
              </div>

              {state.paymentMode === 'Both' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <Input 
                          label="Cash Amount (₹)" 
                          id="cashAmount" 
                          type="number" 
                          value={state.cashAmount} 
                          onChange={(e) => updateField('cashAmount', parseFloat(e.target.value) || 0)} 
                      />
                      <Input 
                          label="Online Amount (₹)" 
                          id="onlineAmount" 
                          type="number" 
                          value={state.onlineAmount} 
                          onChange={(e) => updateField('onlineAmount', parseFloat(e.target.value) || 0)} 
                      />
                      <div className={`sm:col-span-2 text-right text-sm font-semibold ${!isPaymentBalanced ? 'text-red-600' : 'text-green-600'}`}>
                          {!isPaymentBalanced ? `Mismatch: ₹${paymentBalance.toFixed(2)}` : 'Amounts match Grand Total'}
                      </div>
                  </div>
              )}
              
              <div>
                  <label htmlFor="paymentNotes" className="block text-sm font-medium text-slate-700 mb-1">
                      Payment Notes / Transaction ID
                  </label>
                  <textarea
                      id="paymentNotes"
                      value={state.paymentNotes || ''}
                      onChange={(e) => updateField('paymentNotes', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                      placeholder={state.paymentMode === 'Both' ? 'e.g., Wash cash, parts online via UPI...' : 'Optional details...'}
                  />
              </div>
          </div>
      </Card>

      {/* Customer Digital Sign-Off & Acknowledgement */}
      <Card title="Customer Sign-Off & Verification" className="mt-6 no-print">
        <div className="space-y-4">
          <SignaturePad
            value={state.customerSignature}
            onChange={(signatureDataUrl) => updateField('customerSignature', signatureDataUrl)}
            label="Customer Digital Signature"
            required={isAgentOrSales}
            customerName={`${state.customerFirstName || ''} ${state.customerLastName || ''}`.trim()}
          />

          <div className="pt-3 border-t border-slate-100">
            <Checkbox
              id="acknowledgement"
              checked={state.acknowledgement}
              onChange={(checked) => updateField('acknowledgement', checked)}
              label="I acknowledge that all the information entered is correct and have verified the details with the customer before final submission."
            />
          </div>
        </div>
      </Card>

      {/* Printable Signature Block for Printed Invoices */}
      {state.customerSignature && (
        <div className="hidden print:block mt-8 pt-4 border-t border-slate-300">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs font-bold text-slate-700">Customer Authorization & Sign-Off</p>
              <p className="text-[10px] text-slate-500">I confirm receipt of services and accuracy of order details.</p>
            </div>
            <div className="text-right">
              <img src={state.customerSignature} alt="Customer Signature" className="h-14 max-w-[180px] object-contain mb-1 border-b border-slate-400" />
              <p className="text-[11px] font-semibold text-slate-800">{`${state.customerFirstName || ''} ${state.customerLastName || ''}`.trim() || 'Customer'}</p>
              <p className="text-[9px] text-slate-400">Signed on Device Screen</p>
            </div>
          </div>
        </div>
      )}

      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        initialLat={state.customerLatitude}
        initialLng={state.customerLongitude}
        initialAddress={state.streetAddress}
        onConfirm={(lat, lng, address) => {
          updateField('customerLatitude', lat);
          updateField('customerLongitude', lng);
          if (address) {
            updateField('streetAddress', address);
          }
        }}
      />
    </div>
  );
};
