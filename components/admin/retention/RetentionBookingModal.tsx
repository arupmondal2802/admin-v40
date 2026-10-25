import React, { useState, useMemo, useEffect } from 'react';
import { User, Service, ServiceStatus, ServiceTemplate, RetentionCoupon } from '../../../types';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { IconX, IconCalendar, IconCheck, IconUser, IconSparkles, IconCreditCard, IconTag } from '../../ui/Icon';
import { CustomerFollowUpTarget } from './FollowUpLoggerModal';
import { DEFAULT_RETENTION_COUPONS } from './RetentionPromosTab';

interface RetentionBookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    target: CustomerFollowUpTarget | null;
    currentUser?: User;
    users?: User[];
    onCreateOrder?: (serviceData: any) => Promise<any> | void;
    onSaveLog?: (log: any) => void;
    serviceTemplates?: ServiceTemplate[];
    predefinedServices?: any[];
    predefinedServiceCategories?: any[];
    coupons?: RetentionCoupon[];
}

const DEFAULT_CORE_SERVICES = [
    { id: 'Car Washing', name: 'Car Washing', label: 'Car Washing & Exterior Polish', basePrice: 499 },
    { id: 'Car Care', name: 'Car Care', label: 'Car Care (Interior Detailing & Coating)', basePrice: 2500 },
    { id: 'Tyre Replacement', name: 'Tyre Replacement', label: 'Tyre Inspection & Replacement', basePrice: 4200 },
    { id: 'Battery Replacement', name: 'Battery Replacement', label: 'Battery Health Check & Replacement', basePrice: 3500 },
    { id: 'Custom Services', name: 'Custom Services', label: 'General Diagnostic & Repairs', basePrice: 1200 },
];

export const RetentionBookingModal: React.FC<RetentionBookingModalProps> = ({
    isOpen,
    onClose,
    target,
    currentUser,
    users = [],
    onCreateOrder,
    onSaveLog,
    serviceTemplates = [],
    predefinedServices = [],
    predefinedServiceCategories = [],
    coupons = [],
}) => {
    // Active available coupons
    const availableCoupons = useMemo(() => {
        return coupons && coupons.length > 0 ? coupons : DEFAULT_RETENTION_COUPONS;
    }, [coupons]);

    // Filter and build predefined service options strictly matching the booking order model (excluding products)
    const serviceOptions = useMemo(() => {
        const options: Array<{ id: string; name: string; label: string; basePrice: number }> = [];

        // 1. Core booking service templates (predefined service models)
        if (serviceTemplates && serviceTemplates.length > 0) {
            serviceTemplates.filter(t => t.isEnabled !== false).forEach(template => {
                const matchedDefault = DEFAULT_CORE_SERVICES.find(
                    d => d.id === template.id || d.name.toLowerCase() === String(template.name || '').toLowerCase()
                );
                options.push({
                    id: template.name,
                    name: template.name,
                    label: matchedDefault ? matchedDefault.label : template.name,
                    basePrice: matchedDefault ? matchedDefault.basePrice : 1000
                });
            });
        }

        // Fallback or ensure default core booking services are always present
        DEFAULT_CORE_SERVICES.forEach(def => {
            if (!options.some(o => o.id === def.name || o.name === def.name)) {
                options.push({
                    id: def.name,
                    name: def.name,
                    label: def.label,
                    basePrice: def.basePrice
                });
            }
        });

        return options;
    }, [serviceTemplates]);

    // Initial selected service derived from target.dueService
    const initialService = useMemo(() => {
        if (target?.dueService) {
            const dueSrvLower = String(target.dueService || '').toLowerCase();
            const matched = serviceOptions.find(o => 
                o.id.toLowerCase() === dueSrvLower ||
                o.name.toLowerCase().includes(dueSrvLower) ||
                (dueSrvLower && dueSrvLower.includes(o.id.toLowerCase()))
            );
            if (matched) return [matched.id];
        }
        return [serviceOptions[0]?.id || 'Car Washing'];
    }, [target?.dueService, serviceOptions]);

    const [selectedServices, setSelectedServices] = useState<string[]>(initialService);

    useEffect(() => {
        setSelectedServices(initialService);
    }, [target?.dueService, serviceOptions]);

    const [bookingDate, setBookingDate] = useState(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    });
    const [bookingTime, setBookingTime] = useState('10:00 AM');
    const [assignedTechnician, setAssignedTechnician] = useState('');

    // Coupon Selection State
    const [selectedCouponCode, setSelectedCouponCode] = useState<string>('RETAIN15');
    const [isManualDiscount, setIsManualDiscount] = useState<boolean>(false);
    const [manualDiscountType, setManualDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
    const [manualDiscountVal, setManualDiscountVal] = useState<number>(15);

    const [customerRemarks, setCustomerRemarks] = useState(
        `Retention booking initiated from dashboard for ${target?.dueService || 'regular maintenance'}.`
    );

    useEffect(() => {
        if (target) {
            setCustomerRemarks(`Retention booking initiated from dashboard for ${target.dueService || 'regular maintenance'}.`);
        }
    }, [target?.dueService]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const toggleService = (srvId: string) => {
        setSelectedServices(prev =>
            prev.includes(srvId) ? prev.filter(s => s !== srvId) : [...prev, srvId]
        );
    };

    const subtotal = useMemo(() => {
        return selectedServices.reduce((sum, srvId) => {
            const found = serviceOptions.find(o => o.id === srvId || o.name === srvId);
            return sum + (found ? found.basePrice : 1000);
        }, 0);
    }, [selectedServices, serviceOptions]);

    // Calculate discount based on Coupon (Percentage/Fixed & Service Type) OR Manual Discount
    const discountInfo = useMemo(() => {
        if (isManualDiscount) {
            let amt = 0;
            if (manualDiscountType === 'PERCENTAGE') {
                amt = Math.round((subtotal * manualDiscountVal) / 100);
            } else {
                amt = Math.min(manualDiscountVal, subtotal);
            }
            return {
                amount: amt,
                isValid: true,
                label: manualDiscountType === 'PERCENTAGE' ? `${manualDiscountVal}% Manual Discount` : `Flat ₹${manualDiscountVal} Manual Discount`,
                warning: ''
            };
        }

        const activeCoupon = availableCoupons.find(c => c.code === selectedCouponCode);
        if (!activeCoupon) {
            return { amount: 0, isValid: true, label: 'No Coupon Applied', warning: '' };
        }

        // Check Min Order Requirement
        if (activeCoupon.minOrderValue && subtotal < activeCoupon.minOrderValue) {
            return {
                amount: 0,
                isValid: false,
                label: `Coupon ${activeCoupon.code} requires Min Order ₹${activeCoupon.minOrderValue}`,
                warning: `Min order value of ₹${activeCoupon.minOrderValue} required for this coupon (Current: ₹${subtotal}).`
            };
        }

        // Determine applicable base price amount based on service type target
        let applicableSubtotal = 0;
        if (activeCoupon.serviceType === 'ALL' || !activeCoupon.serviceType) {
            applicableSubtotal = subtotal;
        } else {
            // Find selected services matching the target service type
            const matchingServices = selectedServices.filter(srvId => {
                const opt = serviceOptions.find(o => o.id === srvId || o.name === srvId);
                const sName = opt ? opt.name : srvId;
                return sName.toLowerCase().includes(activeCoupon.serviceType.toLowerCase()) ||
                       activeCoupon.serviceType.toLowerCase().includes(sName.toLowerCase());
            });

            if (matchingServices.length === 0) {
                return {
                    amount: 0,
                    isValid: false,
                    label: `Coupon ${activeCoupon.code} applies to ${activeCoupon.serviceType}`,
                    warning: `This coupon requires "${activeCoupon.serviceType}" service to be selected.`
                };
            }

            applicableSubtotal = matchingServices.reduce((sum, srvId) => {
                const found = serviceOptions.find(o => o.id === srvId || o.name === srvId);
                return sum + (found ? found.basePrice : 1000);
            }, 0);
        }

        // Calculate discount amount
        let calculatedDiscount = 0;
        if (activeCoupon.discountType === 'PERCENTAGE') {
            calculatedDiscount = Math.round((applicableSubtotal * activeCoupon.discountValue) / 100);
        } else {
            calculatedDiscount = Math.min(activeCoupon.discountValue, applicableSubtotal);
        }

        const labelText = activeCoupon.discountType === 'PERCENTAGE'
            ? `${activeCoupon.code} (${activeCoupon.discountValue}% OFF on ${activeCoupon.serviceType})`
            : `${activeCoupon.code} (Flat ₹${activeCoupon.discountValue} OFF on ${activeCoupon.serviceType})`;

        return {
            amount: calculatedDiscount,
            isValid: true,
            label: labelText,
            warning: ''
        };
    }, [isManualDiscount, manualDiscountType, manualDiscountVal, availableCoupons, selectedCouponCode, subtotal, selectedServices, serviceOptions]);

    const discountAmount = discountInfo.amount;
    const grandTotal = Math.max(0, subtotal - discountAmount);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target) return;

        if (selectedServices.length === 0) {
            alert('Please select at least one service to book.');
            return;
        }

        if (!discountInfo.isValid) {
            alert(discountInfo.warning || 'The selected coupon is not applicable to this booking.');
            return;
        }

        setIsSubmitting(true);
        const nameParts = (target.customerName || 'Customer').split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';

        const appliedCode = isManualDiscount ? `MANUAL_${manualDiscountVal}` : selectedCouponCode;

        const newServicePayload: any = {
            customer: {
                firstName,
                lastName,
                mobileNumber: target.customerPhone,
                carNumber: target.carNumber || '',
                carBrandModel: target.carBrandModel || '',
                streetAddress: target.streetAddress || '',
                customerEmail: target.customerEmail || '',
            },
            customerFirstName: firstName,
            customerLastName: lastName,
            mobileNumber: target.customerPhone,
            carNumber: target.carNumber || '',
            carBrandModel: target.carBrandModel || '',
            streetAddress: target.streetAddress || '',
            customerEmail: target.customerEmail || '',
            serviceSelection: selectedServices,
            scheduledDate: `${bookingDate} ${bookingTime}`,
            submittedBy: currentUser?.username || 'sales_agent',
            assignedTo: assignedTechnician || undefined,
            status: ServiceStatus.Queued,
            subtotalPrice: subtotal,
            discountPrice: discountAmount,
            grandTotal: grandTotal,
            isFollowUp: true,
            isAutoScheduled: false,
            tags: ['Return-Visit', 'Retention'],
            customerRemarks: customerRemarks,
            promoCode: appliedCode,
        };

        try {
            if (onCreateOrder) {
                await onCreateOrder(newServicePayload);
            }

            if (onSaveLog) {
                onSaveLog({
                    id: `ret_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    timestamp: new Date().toISOString(),
                    customerPhone: target.customerPhone,
                    customerName: target.customerName,
                    carNumber: target.carNumber,
                    carBrandModel: target.carBrandModel,
                    agentUsername: currentUser?.username || 'system',
                    actionType: 'BOOKING_CREATED',
                    outcome: 'BOOKED',
                    notes: `Direct retention booking converted for ₹${grandTotal}. Scheduled: ${bookingDate} ${bookingTime}. Coupon Used: ${appliedCode}. Services: ${selectedServices.join(', ')}.`,
                    promoCodeUsed: appliedCode,
                    dueService: target.dueService,
                });
            }

            setSuccessMsg(`🎉 Booking created successfully for ${target.customerName}! Grand Total: ₹${grandTotal}`);
            setTimeout(() => {
                onClose();
            }, 1200);
        } catch (err) {
            console.error('Error creating retention booking:', err);
            alert('Failed to save booking. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const technicians = users.filter(u => u.role === 'technician' || u.agentCategory === 'TECHNICIAN' || u.role === 'agent');

    if (!isOpen || !target) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden modal-content max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-brand-blue to-indigo-800 text-white p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-white/20 rounded-xl text-white">
                            <IconCalendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-white">Create Retention Service Booking</h3>
                            <p className="text-xs text-sky-100">Schedule appointment & apply retention coupon</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors">
                        <IconX className="w-5 h-5" />
                    </button>
                </div>

                {/* Customer Banner */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                    <div>
                        <span className="font-bold text-slate-800 text-sm">{target.customerName}</span>
                        <span className="ml-2 font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">📞 {target.customerPhone}</span>
                        <span className="ml-2 font-medium text-slate-700">🚗 {target.carBrandModel || 'Vehicle'} ({target.carNumber || 'No Plate'})</span>
                    </div>
                </div>

                {/* Booking Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Services selection */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-bold text-slate-700">Select Services to Book</label>
                            <span className="text-[10px] text-slate-400 font-medium">Predefined Service Models Only</span>
                        </div>
                        <div className="space-y-2">
                            {serviceOptions.map(opt => {
                                const isSelected = selectedServices.includes(opt.id);
                                return (
                                    <div
                                        key={opt.id}
                                        onClick={() => toggleService(opt.id)}
                                        className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                                            isSelected ? 'bg-sky-50/80 border-sky-400 text-sky-900 font-bold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {}}
                                                className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                                            />
                                            <span>{opt.label}</span>
                                        </div>
                                        <span className="font-mono font-bold text-slate-700">₹{opt.basePrice}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date, Time & Tech */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Scheduled Date</label>
                            <input
                                type="date"
                                required
                                value={bookingDate}
                                onChange={(e) => setBookingDate(e.target.value)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white font-medium text-slate-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Time Slot</label>
                            <select
                                value={bookingTime}
                                onChange={(e) => setBookingTime(e.target.value)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white font-medium text-slate-800"
                            >
                                <option value="09:00 AM">09:00 AM</option>
                                <option value="10:00 AM">10:00 AM</option>
                                <option value="11:30 AM">11:30 AM</option>
                                <option value="02:00 PM">02:00 PM</option>
                                <option value="04:00 PM">04:00 PM</option>
                                <option value="05:30 PM">05:30 PM</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Technician</label>
                            <select
                                value={assignedTechnician}
                                onChange={(e) => setAssignedTechnician(e.target.value)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white text-slate-800"
                            >
                                <option value="">Auto-Assign Later</option>
                                {technicians.map(t => (
                                    <option key={t.username} value={t.username}>{t.username}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Retention Coupon & Discount Configurator */}
                    <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                <IconTag className="w-4 h-4 text-indigo-600" />
                                Apply Retention Coupon or Custom Discount
                            </label>
                            <button
                                type="button"
                                onClick={() => setIsManualDiscount(!isManualDiscount)}
                                className="text-[10px] text-indigo-700 font-bold hover:underline"
                            >
                                {isManualDiscount ? '← Choose Active Coupon' : '+ Custom Discount'}
                            </button>
                        </div>

                        {!isManualDiscount ? (
                            <div>
                                <select
                                    value={selectedCouponCode}
                                    onChange={(e) => setSelectedCouponCode(e.target.value)}
                                    className="w-full text-xs font-bold p-2.5 border border-indigo-200 rounded-lg bg-white text-indigo-900"
                                >
                                    <option value="">No Coupon (Standard Pricing)</option>
                                    {availableCoupons.map(c => {
                                        const typeLabel = c.discountType === 'PERCENTAGE' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`;
                                        return (
                                            <option key={c.code} value={c.code}>
                                                {c.code} — {typeLabel} ({c.serviceType === 'ALL' ? 'All Services' : c.serviceType})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Discount Type</label>
                                    <select
                                        value={manualDiscountType}
                                        onChange={(e) => setManualDiscountType(e.target.value as any)}
                                        className="w-full text-xs font-bold p-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                                    >
                                        <option value="PERCENTAGE">Percentage (%)</option>
                                        <option value="FIXED">Fixed Amount (₹)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Value</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={manualDiscountVal}
                                        onChange={(e) => setManualDiscountVal(Number(e.target.value))}
                                        className="w-full text-xs font-bold p-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                                    />
                                </div>
                            </div>
                        )}

                        {discountInfo.warning && (
                            <p className="text-[11px] font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                                ⚠️ {discountInfo.warning}
                            </p>
                        )}

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-indigo-100 text-slate-700">
                            <span>Subtotal: <strong className="font-mono">₹{subtotal}</strong></span>
                            <span>Discount: <strong className="font-mono text-emerald-700">-₹{discountAmount}</strong></span>
                            <span className="text-sm font-bold text-brand-blue">Total: <span className="font-mono">₹{grandTotal}</span></span>
                        </div>
                    </div>

                    {/* Customer Remarks */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Instructions</label>
                        <input
                            type="text"
                            value={customerRemarks}
                            onChange={(e) => setCustomerRemarks(e.target.value)}
                            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white text-slate-800"
                        />
                    </div>

                    {successMsg && (
                        <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-xs text-emerald-900 font-bold flex items-center gap-2">
                            <IconCheck className="w-4 h-4 text-emerald-700" />
                            {successMsg}
                        </div>
                    )}

                    {/* Modal Footer */}
                    <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || (!discountInfo.isValid && !isManualDiscount)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                        >
                            <IconCreditCard className="w-4 h-4 mr-1.5" />
                            {isSubmitting ? 'Creating Booking...' : `Confirm Booking (₹${grandTotal})`}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RetentionBookingModal;

