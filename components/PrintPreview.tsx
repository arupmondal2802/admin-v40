import React, { useEffect, useMemo } from 'react';
import { Service, ServiceTemplate } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';

interface PrintPreviewProps {
    service: Service;
    onClose: () => void;
    serviceTemplates: ServiceTemplate[];
}

interface PurchaseItem {
    description: string;
    qty: number;
    price: number;
}

const PurchaseSummaryView: React.FC<{ service: Service, serviceTemplates: ServiceTemplate[] }> = ({ service, serviceTemplates }) => {
    const purchaseItems: PurchaseItem[] = useMemo(() => {
        const items: PurchaseItem[] = [];
        if (!service) return items;

        if (service.serviceSelection.includes("Car Washing") && service.carWashDetails) {
            items.push({
                description: `Car Washing: ${service.carWashDetails.washType} ${service.isSubscription ? '(Subscription)' : ''}`,
                qty: 1,
                price: service.carWashDetails.price,
            });
        }
        if (service.serviceSelection.includes("Car Care") && service.carCareDetails) {
            items.push({
                description: `Car Care: ${service.carCareDetails.careType}`,
                qty: 1,
                price: service.carCareDetails.price,
            });
        }
        if (service.serviceSelection.includes("Tyre Replacement") && service.tyreReplacementTotalAmount > 0) {
            items.push({
                description: `Tyre Replacement`,
                qty: service.tyreReplacementQuantity,
                price: service.tyreReplacementTotalAmount
            });
        }
        if (service.serviceSelection && service.serviceSelection.includes("Battery Replacement")) {
            (Array.isArray(service.batteryDetails) ? service.batteryDetails : []).forEach(battery => {
                const netAmount = (battery?.newBatteryAmount || 0) - (battery?.exchangeValue || 0);
                if (netAmount > 0) {
                    items.push({
                        description: `Battery: ${battery?.brand || 'Unspecified Brand'}`,
                        qty: 1,
                        price: netAmount,
                    });
                }
            });
        }

        (service.dynamicAddons || []).forEach(item => {
            if (item.quantity > 0) {
                items.push({
                    description: item.name,
                    qty: item.quantity,
                    price: item.quantity * item.price,
                });
            }
        });

        service.categorizedAddons.forEach(ca => {
            if (ca.amount > 0 && ca.quantity > 0) {
                items.push({ description: `${ca.productName} (${ca.category})`, qty: ca.quantity, price: ca.quantity * ca.amount });
            }
        });
        
        service.customServices.forEach(custom => {
            if (custom.amount > 0) {
                items.push({
                    description: custom.serviceDescription || 'Custom Service',
                    qty: 1,
                    price: custom.amount,
                });
            }
        });

        if (service.travelCharge && service.travelCharge > 0) {
            items.push({
                description: `Doorstep Travel Charge`,
                qty: 1,
                price: service.travelCharge
            });
        }

        return items;
    }, [service]);
    
    const customFieldDetails = useMemo(() => {
        if (!service.customFieldData || service.customFieldData.length === 0) return null;
        const allCustomFields = serviceTemplates.flatMap(st => st.customFields);
        return service.customFieldData.map(data => {
            const fieldDef = allCustomFields.find(f => f.id === data.fieldId);
            if (!fieldDef || !data.value) return null;
            let displayValue: React.ReactNode = data.value;
            if (fieldDef.type === 'PHOTO' && typeof data.value === 'string') {
                displayValue = <a href={data.value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Photo</a>;
            }
            return { label: fieldDef.label, value: displayValue };
        }).filter(Boolean);
    }, [service.customFieldData, serviceTemplates]);


    const DetailItem: React.FC<{ label: string; value: string | React.ReactNode }> = ({ label, value }) => (
      <div>
          <dt className="text-sm font-medium text-slate-500">{label}</dt>
          <dd className="text-base font-semibold text-slate-800 break-words">{value}</dd>
      </div>
    );

    return (
        <div className="space-y-8">
            <Card title="Customer Details" className="print:shadow-none print:border">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    <DetailItem label="Name" value={`${service.customerFirstName} ${service.customerLastName}`} />
                    <DetailItem label="Mobile Number" value={service.mobileNumber} />
                    <DetailItem label="Car" value={`${service.carBrandModel} (${service.carNumber})`} />
                    <DetailItem label="Vehicle Category" value={service.vehicleCategoryTag} />
                    <DetailItem label="Address" value={service.streetAddress} />
                </dl>
            </Card>

            <Card title="Purchase Summary" className="print:shadow-none print:border">
                <div className="flow-root">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">Item / Service</th>
                                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-slate-900">Quantity</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Price</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {purchaseItems.map((item, index) => (
                                <tr key={index} className="even:bg-slate-50">
                                    <td className="w-full max-w-0 py-4 pl-4 pr-3 text-sm font-medium text-slate-900 sm:w-auto sm:max-w-none sm:pl-6">{item.description}</td>
                                    <td className="px-3 py-4 text-sm text-center text-slate-500">{item.qty}</td>
                                    <td className="px-3 py-4 text-sm text-right text-slate-500">₹{item.price.toFixed(2)}</td>
                                </tr>
                            ))}
                            {purchaseItems.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-center py-10 text-slate-500">No services or products selected.</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-300">
                                <th scope="row" colSpan={2} className="pl-4 pr-3 pt-4 text-right text-base font-semibold text-slate-900 sm:pl-6">Grand Total</th>
                                <td className="pl-3 pr-4 pt-4 text-right text-base font-semibold text-slate-900 sm:pr-6">₹{service.grandTotal.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                 {customFieldDetails && customFieldDetails.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-200">
                        <h4 className="text-md font-semibold text-slate-800">Service-Specific Details</h4>
                        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                            {customFieldDetails.map(detail => detail && <DetailItem key={detail.label} label={detail.label} value={detail.value} />)}
                        </dl>
                    </div>
                )}
            </Card>
        </div>
    );
};

export const PrintPreview: React.FC<PrintPreviewProps> = ({ service, onClose, serviceTemplates }) => {
    useEffect(() => {
        window.print();
    }, []);

    return (
        <div className="bg-slate-200 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-white p-8 printable-area">
                <div className="flex justify-between items-center mb-8 no-print">
                    <h1 className="text-xl font-bold text-slate-800">Print Preview</h1>
                    <Button onClick={onClose} variant="secondary">Back to App</Button>
                </div>
                <PurchaseSummaryView service={service} serviceTemplates={serviceTemplates} />
            </div>
        </div>
    );
};