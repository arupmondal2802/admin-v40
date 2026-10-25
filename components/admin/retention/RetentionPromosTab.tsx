import React, { useState, useMemo } from 'react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { IconSparkles, IconShare, IconCheck, IconX, IconPlus, IconTag, IconPercent, IconCreditCard } from '../../ui/Icon';
import { RetentionCoupon, CouponDiscountType, ServiceTemplate } from '../../../types';

export interface RetentionPromosTabProps {
    coupons?: RetentionCoupon[];
    onSaveCoupon?: (coupon: RetentionCoupon) => void;
    onDeleteCoupon?: (couponId: string) => void;
    serviceTemplates?: ServiceTemplate[];
    predefinedServices?: any[];
    predefinedServiceCategories?: any[];
}

export const DEFAULT_RETENTION_COUPONS: RetentionCoupon[] = [
    {
        id: 'c_retain15',
        code: 'RETAIN15',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        serviceType: 'ALL',
        minOrderValue: 0,
        description: '15% OFF on all retention services',
        isEnabled: true,
    },
    {
        id: 'c_wash20',
        code: 'WASH20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        serviceType: 'Car Washing',
        minOrderValue: 500,
        description: '20% OFF on Car Washing & Exterior Polish',
        isEnabled: true,
    },
    {
        id: 'c_care500',
        code: 'CARE500',
        discountType: 'FIXED',
        discountValue: 500,
        serviceType: 'Car Care',
        minOrderValue: 2000,
        description: 'Flat ₹500 OFF on Interior Detailing & Coating',
        isEnabled: true,
    },
    {
        id: 'c_tyre1000',
        code: 'TYRE1000',
        discountType: 'FIXED',
        discountValue: 1000,
        serviceType: 'Tyre Replacement',
        minOrderValue: 4000,
        description: 'Flat ₹1000 OFF on Tyre Inspection & Replacement',
        isEnabled: true,
    },
    {
        id: 'c_battery10',
        code: 'BATTERY10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        serviceType: 'Battery Replacement',
        minOrderValue: 2500,
        description: '10% OFF on Battery Health Check & Replacement',
        isEnabled: true,
    },
    {
        id: 'c_welcome500',
        code: 'WELCOME500',
        discountType: 'FIXED',
        discountValue: 500,
        serviceType: 'ALL',
        minOrderValue: 2000,
        description: 'Flat ₹500 OFF on Bill Above ₹2,000',
        isEnabled: true,
    },
];

export const RetentionPromosTab: React.FC<RetentionPromosTabProps> = ({
    coupons = [],
    onSaveCoupon,
    onDeleteCoupon,
    serviceTemplates = [],
    predefinedServices = [],
}) => {
    // Combine provided coupons with defaults
    const activeCoupons = useMemo(() => {
        if (!coupons || coupons.length === 0) return DEFAULT_RETENTION_COUPONS;
        return coupons;
    }, [coupons]);

    // Available service types for coupon targeting
    const serviceTypeOptions = useMemo(() => {
        const set = new Set<string>(['ALL', 'Car Washing', 'Car Care', 'Tyre Replacement', 'Battery Replacement', 'Custom Services']);
        (serviceTemplates || []).forEach(t => {
            if (t.name) set.add(t.name);
        });
        (predefinedServices || []).forEach(s => {
            if (s.isEnabled && s.name) set.add(s.name);
        });
        return Array.from(set);
    }, [serviceTemplates, predefinedServices]);

    // Active selected coupon for campaign broadcast preview
    const [selectedCouponCode, setSelectedCouponCode] = useState<string>('RETAIN15');
    const selectedCoupon = useMemo(() => {
        return activeCoupons.find(c => c.code === selectedCouponCode) || activeCoupons[0] || DEFAULT_RETENTION_COUPONS[0];
    }, [activeCoupons, selectedCouponCode]);

    // New coupon form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newDiscountType, setNewDiscountType] = useState<CouponDiscountType>('PERCENTAGE');
    const [newDiscountValue, setNewDiscountValue] = useState<number>(15);
    const [newServiceType, setNewServiceType] = useState<string>('ALL');
    const [newMinOrder, setNewMinOrder] = useState<number>(0);
    const [newDescription, setNewDescription] = useState('');
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Sample customer variables for broadcast preview
    const [sampleCustomerName, setSampleCustomerName] = useState('Rahul Verma');
    const [sampleCarModel, setSampleCarModel] = useState('Hyundai Creta');
    const [filterService, setFilterService] = useState<string>('ALL');
    const [copied, setCopied] = useState(false);

    // Auto-update default description when inputs change
    const updateAutoDescription = (type: CouponDiscountType, value: number, svc: string) => {
        const formattedType = type === 'PERCENTAGE' ? `${value}% OFF` : `Flat ₹${value} OFF`;
        const targetText = svc === 'ALL' ? 'all services' : svc;
        setNewDescription(`${formattedType} on ${targetText}`);
    };

    const handleDiscountTypeChange = (type: CouponDiscountType) => {
        setNewDiscountType(type);
        updateAutoDescription(type, newDiscountValue, newServiceType);
    };

    const handleDiscountValueChange = (val: number) => {
        setNewDiscountValue(val);
        updateAutoDescription(newDiscountType, val, newServiceType);
    };

    const handleServiceTypeChange = (svc: string) => {
        setNewServiceType(svc);
        updateAutoDescription(newDiscountType, newDiscountValue, svc);
    };

    const handleCreateCouponSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        const cleanCode = newCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
        if (!cleanCode) {
            setFormError('Please enter a valid coupon code (e.g. CARE20, WASH500)');
            return;
        }

        if (activeCoupons.some(c => c.code === cleanCode)) {
            setFormError(`Coupon code "${cleanCode}" already exists. Please use a unique code.`);
            return;
        }

        if (newDiscountValue <= 0) {
            setFormError('Discount value must be greater than 0.');
            return;
        }

        const couponToSave: RetentionCoupon = {
            id: `c_${Date.now()}_${cleanCode}`,
            code: cleanCode,
            discountType: newDiscountType,
            discountValue: Number(newDiscountValue),
            serviceType: newServiceType,
            minOrderValue: Number(newMinOrder) || 0,
            description: newDescription || `${newDiscountType === 'PERCENTAGE' ? `${newDiscountValue}% OFF` : `₹${newDiscountValue} OFF`} on ${newServiceType}`,
            isEnabled: true,
            createdAt: new Date().toISOString(),
        };

        if (onSaveCoupon) {
            onSaveCoupon(couponToSave);
        }

        setFormSuccess(`Coupon "${cleanCode}" created successfully!`);
        setSelectedCouponCode(cleanCode);
        setNewCode('');
        setShowCreateForm(false);
        setTimeout(() => setFormSuccess(''), 3000);
    };

    // Filter coupons for the management view
    const filteredCoupons = useMemo(() => {
        if (filterService === 'ALL') return activeCoupons;
        return activeCoupons.filter(c => c.serviceType === filterService || c.serviceType === 'ALL');
    }, [activeCoupons, filterService]);

    // Formatted broadcast message for WhatsApp/SMS
    const generatedWhatsAppText = useMemo(() => {
        const discountLabel = selectedCoupon.discountType === 'PERCENTAGE'
            ? `${selectedCoupon.discountValue}% OFF`
            : `Flat ₹${selectedCoupon.discountValue} OFF`;
        
        const serviceLabel = selectedCoupon.serviceType === 'ALL'
            ? 'entire service bill'
            : selectedCoupon.serviceType;

        const minOrderText = selectedCoupon.minOrderValue && selectedCoupon.minOrderValue > 0
            ? ` (Valid on orders above ₹${selectedCoupon.minOrderValue.toLocaleString('en-IN')})`
            : '';

        return `Hello ${sampleCustomerName}! 👋 Greetings from Big Engine Service.\n\nWe miss your ${sampleCarModel}! To welcome you back, we have unlocked an exclusive retention coupon for you:\n\n✨ Offer: *${discountLabel}* on ${serviceLabel}${minOrderText}\n🎟️ Coupon Code: *${selectedCoupon.code}*\n📝 Note: ${selectedCoupon.description}\n\nBook your slot today or reply here to confirm!\n📲 https://bigengine.in/book?code=${selectedCoupon.code}`;
    }, [sampleCustomerName, sampleCarModel, selectedCoupon]);

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedWhatsAppText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header & Campaign Offer Engine */}
            <Card title="🎟️ Retention Coupon & Discount Engine">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                        <p className="text-xs text-slate-600">
                            Create targeted coupons with <strong>Percentage (%)</strong> or <strong>Fixed Amount (₹)</strong> discounts linked directly to specific service types (Car Washing, Car Care, Tyre, Battery, etc.).
                        </p>
                    </div>
                    <Button
                        onClick={() => {
                            setShowCreateForm(!showCreateForm);
                            setFormError('');
                        }}
                        className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs shrink-0"
                    >
                        {showCreateForm ? <IconX className="w-4 h-4 mr-1.5" /> : <IconPlus className="w-4 h-4 mr-1.5" />}
                        {showCreateForm ? 'Close Creator' : 'Create New Coupon'}
                    </Button>
                </div>

                {formSuccess && (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                        <IconCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        {formSuccess}
                    </div>
                )}

                {/* FORM: Create New Coupon Modal / Panel */}
                {showCreateForm && (
                    <form onSubmit={handleCreateCouponSubmit} className="mt-4 p-4 bg-slate-50 border border-brand-blue/20 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                                <IconSparkles className="w-4 h-4 text-brand-accent" />
                                Configure New Retention Coupon
                            </h4>
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-full">
                                Service Type Specific
                            </span>
                        </div>

                        {formError && (
                            <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                                {formError}
                            </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            {/* Coupon Code */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Coupon Code *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. CARE25 or WASH500"
                                    value={newCode}
                                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-mono font-bold text-brand-blue uppercase bg-white focus:ring-2 focus:ring-brand-accent"
                                />
                            </div>

                            {/* Discount Type: Percentage vs Fixed */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Discount Type *</label>
                                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/60 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => handleDiscountTypeChange('PERCENTAGE')}
                                        className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                                            newDiscountType === 'PERCENTAGE' ? 'bg-white text-brand-blue shadow-xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <IconPercent className="w-3.5 h-3.5" />
                                        Percentage (%)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDiscountTypeChange('FIXED')}
                                        className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                                            newDiscountType === 'FIXED' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <IconCreditCard className="w-3.5 h-3.5" />
                                        Fixed Value (₹)
                                    </button>
                                </div>
                            </div>

                            {/* Discount Amount / Value */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    {newDiscountType === 'PERCENTAGE' ? 'Discount Percentage (%) *' : 'Discount Amount (₹) *'}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        max={newDiscountType === 'PERCENTAGE' ? 100 : 100000}
                                        value={newDiscountValue}
                                        onChange={(e) => handleDiscountValueChange(Number(e.target.value))}
                                        className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-mono font-bold bg-white text-slate-800 pr-8"
                                    />
                                    <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400">
                                        {newDiscountType === 'PERCENTAGE' ? '%' : '₹'}
                                    </span>
                                </div>
                            </div>

                            {/* Target Service Type */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Applicable Service Type *</label>
                                <select
                                    value={newServiceType}
                                    onChange={(e) => handleServiceTypeChange(e.target.value)}
                                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-800 focus:ring-2 focus:ring-brand-accent"
                                >
                                    <option value="ALL">ALL Services (Entire Order)</option>
                                    {serviceTypeOptions.filter(s => s !== 'ALL').map(svc => (
                                        <option key={svc} value={svc}>{svc}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Minimum Order Value */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Min Order Value (₹) (0 for No Min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={newMinOrder}
                                    onChange={(e) => setNewMinOrder(Number(e.target.value))}
                                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-mono bg-white text-slate-800"
                                />
                            </div>

                            {/* Offer Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Campaign Offer Description</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. 20% OFF on Interior Detailing & Coating"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                Save & Activate Coupon
                            </Button>
                        </div>
                    </form>
                )}

                {/* MAIN GRID: Coupons Library & Broadcast Generator */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
                    {/* Left Column: Coupon Library (7 Cols) */}
                    <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <IconTag className="w-4 h-4 text-brand-blue" />
                                Available Coupons ({filteredCoupons.length})
                            </h4>

                            {/* Service Type Filter */}
                            <select
                                value={filterService}
                                onChange={(e) => setFilterService(e.target.value)}
                                className="text-xs p-1.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-700"
                            >
                                <option value="ALL">Filter: All Services</option>
                                <option value="Car Washing">Car Washing</option>
                                <option value="Car Care">Car Care</option>
                                <option value="Tyre Replacement">Tyre Replacement</option>
                                <option value="Battery Replacement">Battery Replacement</option>
                            </select>
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {filteredCoupons.map(coupon => {
                                const isSelected = selectedCoupon.code === coupon.code;
                                return (
                                    <div
                                        key={coupon.id || coupon.code}
                                        onClick={() => setSelectedCouponCode(coupon.code)}
                                        className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                            isSelected
                                                ? 'bg-sky-50/80 border-sky-400 ring-2 ring-sky-300/50 shadow-xs'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-black text-sm text-brand-blue uppercase tracking-wide">
                                                    {coupon.code}
                                                </span>
                                                {/* Discount Type Badge */}
                                                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                                    coupon.discountType === 'PERCENTAGE'
                                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                }`}>
                                                    {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}
                                                </span>
                                                {/* Service Type Target Badge */}
                                                <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${
                                                    coupon.serviceType === 'ALL'
                                                        ? 'bg-slate-100 text-slate-700'
                                                        : coupon.serviceType === 'Car Washing'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : coupon.serviceType === 'Car Care'
                                                        ? 'bg-purple-100 text-purple-800'
                                                        : coupon.serviceType === 'Tyre Replacement'
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-teal-100 text-teal-800'
                                                }`}>
                                                    Target: {coupon.serviceType}
                                                </span>
                                            </div>

                                            {onDeleteCoupon && !DEFAULT_RETENTION_COUPONS.some(d => d.code === coupon.code) && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`Are you sure you want to delete coupon ${coupon.code}?`)) {
                                                            onDeleteCoupon(coupon.id);
                                                        }
                                                    }}
                                                    className="text-slate-400 hover:text-red-600 p-1 rounded"
                                                    title="Delete Coupon"
                                                >
                                                    <IconX className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-xs font-medium text-slate-700 mb-1">
                                            {coupon.description}
                                        </p>

                                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                            <span>
                                                Min Order: {coupon.minOrderValue && coupon.minOrderValue > 0 ? `₹${coupon.minOrderValue}` : 'None'}
                                            </span>
                                            <span className="text-brand-blue font-bold flex items-center gap-1">
                                                {isSelected ? '✓ Selected for Broadcast' : 'Click to preview broadcast →'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}

                            {filteredCoupons.length === 0 && (
                                <div className="text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    <p className="text-xs text-slate-500">No coupons found for the selected service filter.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Live Broadcast Preview & WhatsApp Share (5 Cols) */}
                    <div className="lg:col-span-5 space-y-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                    💬 Campaign Broadcast Preview
                                </h4>
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                    {selectedCoupon.code} ({selectedCoupon.discountType === 'PERCENTAGE' ? `${selectedCoupon.discountValue}%` : `₹${selectedCoupon.discountValue}`})
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Preview Customer</label>
                                    <input
                                        type="text"
                                        value={sampleCustomerName}
                                        onChange={(e) => setSampleCustomerName(e.target.value)}
                                        className="w-full text-xs p-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Preview Car Model</label>
                                    <input
                                        type="text"
                                        value={sampleCarModel}
                                        onChange={(e) => setSampleCarModel(e.target.value)}
                                        className="w-full text-xs p-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="bg-emerald-950 text-emerald-50 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner border border-emerald-800">
                                {generatedWhatsAppText}
                            </div>
                        </div>

                        <div className="space-y-2 pt-3 border-t border-slate-200">
                            {copied && (
                                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                                    <IconCheck className="w-4 h-4 text-emerald-600" />
                                    Copied to clipboard! Ready to send to customer.
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button className="w-1/2 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs" onClick={handleCopy}>
                                    📋 Copy Text
                                </Button>
                                <Button
                                    className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                    onClick={() => {
                                        const url = `https://wa.me/?text=${encodeURIComponent(generatedWhatsAppText)}`;
                                        window.open(url, '_blank');
                                    }}
                                >
                                    <IconShare className="w-3.5 h-3.5 mr-1" />
                                    WhatsApp Share
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default RetentionPromosTab;

