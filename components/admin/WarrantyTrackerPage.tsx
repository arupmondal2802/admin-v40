import React, { useState, useMemo } from 'react';
import { WarrantyRecord, Service } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import StatCard from '../ui/StatCard';
import { 
  IconPlus, 
  IconPencil, 
  IconTrash, 
  IconDeviceFloppy, 
  IconSearch, 
  IconFilter, 
  IconShieldCheck, 
  IconAlertTriangle, 
  IconClock, 
  IconCheck, 
  IconX 
} from '../ui/Icon';
import SkeletonLoader from '../ui/SkeletonLoader';

interface Props {
  isLoading?: boolean;
  isHydrated?: boolean;
  warranties: WarrantyRecord[];
  submissions: Service[];
  onUpdateWarranties: (warranties: WarrantyRecord[]) => void;
}

const calculateExpiryDate = (purchaseDateStr: string, months: number): string => {
  if (!purchaseDateStr) return '';
  const date = new Date(purchaseDateStr);
  if (isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth() + months);
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDaysRemaining = (expiryDateStr: string): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const WarrantyTrackerPage: React.FC<Props> = (props) => {
  const { warranties = [], submissions = [], onUpdateWarranties, isLoading, isHydrated } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [editingWarranty, setEditingWarranty] = useState<WarrantyRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states for creating/editing
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState<'Service' | 'Product'>('Product');
  const [serialNumber, setSerialNumber] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [warrantyPeriodMonths, setWarrantyPeriodMonths] = useState(12);
  const [alertDaysBefore, setAlertDaysBefore] = useState(30);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  // Dropdown list of customers from completed services to help autofill
  const autocompleteCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; email?: string }>();
    submissions.forEach(s => {
      if (!s.customerFirstName || s.isDeleted) return;
      const fullName = `${s.customerFirstName} ${s.customerLastName || ''}`.trim();
      const phone = String(s.mobileNumber || '').trim();
      if (phone) {
        map.set(phone, {
          name: fullName,
          phone,
          email: s.customerEmail || ''
        });
      }
    });
    return Array.from(map.values());
  }, [submissions]);

  // Completed services associated with selected customer
  const customerServices = useMemo(() => {
    if (!customerPhone) return [];
    const phoneClean = customerPhone.trim();
    return submissions.filter(s => 
      !s.isDeleted && 
      s.mobileNumber && 
      String(s.mobileNumber).trim() === phoneClean
    );
  }, [customerPhone, submissions]);

  // Handle autofilling from customer list
  const handleSelectAutocompleteCustomer = (cust: { name: string; phone: string; email?: string }) => {
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    if (cust.email) setCustomerEmail(cust.email);
  };

  const handleOpenCreate = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setProductName('');
    setProductType('Product');
    setSerialNumber('');
    setServiceId('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setWarrantyPeriodMonths(12);
    setAlertDaysBefore(30);
    setNotes('');
    setTerms('');
    setIsCreating(true);
    setEditingWarranty({
      id: `warr_${Date.now()}`,
      customerName: '',
      customerPhone: '',
      productName: '',
      productType: 'Product',
      purchaseDate: new Date().toISOString().split('T')[0],
      warrantyPeriodMonths: 12,
      expiryDate: '',
      status: 'Active',
      alertDaysBefore: 30,
      timestamp: new Date().toISOString()
    });
  };

  const handleOpenEdit = (warr: WarrantyRecord) => {
    setCustomerName(warr.customerName);
    setCustomerPhone(warr.customerPhone);
    setCustomerEmail(warr.customerEmail || '');
    setProductName(warr.productName);
    setProductType(warr.productType);
    setSerialNumber(warr.serialNumber || '');
    setServiceId(warr.serviceId || '');
    setPurchaseDate(warr.purchaseDate);
    setWarrantyPeriodMonths(warr.warrantyPeriodMonths);
    setAlertDaysBefore(warr.alertDaysBefore);
    setNotes(warr.notes || '');
    setTerms(warr.terms || '');
    setIsCreating(false);
    setEditingWarranty(warr);
  };

  const handleSave = () => {
    if (!customerName.trim()) {
      alert("Please provide a Customer Name.");
      return;
    }
    if (!customerPhone.trim()) {
      alert("Please provide a Customer Phone Number.");
      return;
    }
    if (!productName.trim()) {
      alert("Please provide the Product or Service Name.");
      return;
    }
    if (warrantyPeriodMonths <= 0) {
      alert("Warranty period must be greater than 0 months.");
      return;
    }

    const calculatedExpiry = calculateExpiryDate(purchaseDate, warrantyPeriodMonths);
    const daysRemaining = getDaysRemaining(calculatedExpiry);
    
    let resolvedStatus: 'Active' | 'Expired' | 'Claimed' = 'Active';
    if (editingWarranty && editingWarranty.status === 'Claimed') {
      resolvedStatus = 'Claimed';
    } else if (daysRemaining < 0) {
      resolvedStatus = 'Expired';
    }

    const recordToSave: WarrantyRecord = {
      id: editingWarranty?.id || `warr_${Date.now()}`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim() || undefined,
      productName: productName.trim(),
      productType,
      serialNumber: serialNumber.trim() || undefined,
      serviceId: serviceId || undefined,
      purchaseDate,
      warrantyPeriodMonths,
      expiryDate: calculatedExpiry,
      status: resolvedStatus,
      alertDaysBefore,
      notes: notes.trim() || undefined,
      terms: terms.trim() || undefined,
      timestamp: editingWarranty?.timestamp || new Date().toISOString()
    };

    let updatedList;
    const exists = warranties.some(w => w.id === recordToSave.id);
    if (exists) {
      updatedList = warranties.map(w => w.id === recordToSave.id ? recordToSave : w);
    } else {
      updatedList = [...warranties, recordToSave];
    }

    onUpdateWarranties(updatedList);
    setEditingWarranty(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this warranty record?")) {
      const updatedList = warranties.filter(w => w.id !== id);
      onUpdateWarranties(updatedList);
    }
  };

  const handleToggleClaimStatus = (warr: WarrantyRecord) => {
    const nextStatus: 'Active' | 'Claimed' | 'Expired' = warr.status === 'Claimed' 
      ? (getDaysRemaining(warr.expiryDate) < 0 ? 'Expired' : 'Active') 
      : 'Claimed';

    const updated = warranties.map(w => {
      if (w.id === warr.id) {
        return { ...w, status: nextStatus };
      }
      return w;
    });
    onUpdateWarranties(updated);
  };

  // Stats calculation
  const stats = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let expired = 0;
    let claimed = 0;

    warranties.forEach(w => {
      if (w.status === 'Claimed') {
        claimed++;
        return;
      }
      const daysLeft = getDaysRemaining(w.expiryDate);
      if (daysLeft < 0) {
        expired++;
      } else {
        active++;
        if (daysLeft <= w.alertDaysBefore) {
          expiringSoon++;
        }
      }
    });

    return {
      total: warranties.length,
      active,
      expiringSoon,
      expired,
      claimed
    };
  }, [warranties]);

  // Filtered warranties
  const filteredWarranties = useMemo(() => {
    return warranties.filter(w => {
      const daysLeft = getDaysRemaining(w.expiryDate);
      
      // Search match
      const query = searchTerm.toLowerCase();
      const matchesSearch = 
        String(w.customerName || '').toLowerCase().includes(query) ||
        (w.customerPhone ? String(w.customerPhone).toLowerCase().includes(query) : false) ||
        String(w.productName || '').toLowerCase().includes(query) ||
        (w.serialNumber && String(w.serialNumber).toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Type filter match
      if (typeFilter !== 'ALL' && w.productType !== typeFilter) return false;

      // Status filter match
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'CLAIMED') {
          return w.status === 'Claimed';
        } else if (statusFilter === 'EXPIRED') {
          return w.status === 'Expired' || (w.status === 'Active' && daysLeft < 0);
        } else if (statusFilter === 'EXPIRING_SOON') {
          return w.status === 'Active' && daysLeft >= 0 && daysLeft <= w.alertDaysBefore;
        } else if (statusFilter === 'ACTIVE') {
          return w.status === 'Active' && daysLeft >= 0;
        }
      }

      return true;
    });
  }, [warranties, searchTerm, statusFilter, typeFilter]);

  if (isLoading || isHydrated === false || !warranties) {
    return <SkeletonLoader view="WARRANTIES" />;
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <IconShieldCheck className="w-8 h-8 text-emerald-600" />
            Digital Warranty Tracker
          </h1>
          <p className="text-slate-500 text-sm">
            Associate and manage warranty coverage for products or parts and track upcoming expirations.
          </p>
        </div>
        <Button onClick={handleOpenCreate} disabled={!!editingWarranty} className="bg-emerald-600 hover:bg-emerald-700">
          <IconPlus className="w-5 h-5 mr-2" />
          Register Warranty
        </Button>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard 
          title="Total Coverage" 
          value={`${stats.total}`} 
          icon={<IconShieldCheck className="w-6 h-6 text-indigo-500" />} 
          iconBg="bg-indigo-50"
        />
        <StatCard 
          title="Active Policies" 
          value={`${stats.active}`} 
          icon={<IconCheck className="w-6 h-6 text-emerald-500" />} 
          iconBg="bg-emerald-50"
        />
        <StatCard 
          title="Expiring Soon" 
          value={`${stats.expiringSoon}`} 
          icon={<IconAlertTriangle className="w-6 h-6 text-amber-500" />} 
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="Expired" 
          value={`${stats.expired}`} 
          icon={<IconX className="w-6 h-6 text-rose-500" />} 
          iconBg="bg-rose-50"
        />
        <StatCard 
          title="Claimed" 
          value={`${stats.claimed}`} 
          icon={<IconClock className="w-6 h-6 text-blue-500" />} 
          iconBg="bg-blue-50"
        />
      </div>

      {/* Editor / Registration form panel */}
      {editingWarranty && (
        <Card title={isCreating ? "Register Digital Warranty" : "Modify Warranty Details"} className="border-emerald-200 bg-emerald-50/10">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Autocomplete selection helper */}
              <div className="md:col-span-3 bg-white p-3 rounded-lg border border-slate-200">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                  Quick Autofill Customer (Completed Services)
                </label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {autocompleteCustomers.map((cust, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectAutocompleteCustomer(cust)}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded text-xs font-medium text-slate-700 transition"
                    >
                      {cust.name} ({cust.phone})
                    </button>
                  ))}
                  {autocompleteCustomers.length === 0 && (
                    <span className="text-xs text-slate-400 italic">No existing customer records found to autocomplete.</span>
                  )}
                </div>
              </div>

              {/* Form elements */}
              <Input
                label="Customer Name *"
                id="customerName"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. John Doe"
              />
              <Input
                label="Customer Phone *"
                id="customerPhone"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="e.g. +91 9876543210"
              />
              <Input
                label="Customer Email (Optional)"
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="e.g. johndoe@gmail.com"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Product/Service Covered *"
                id="productName"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Yokohama BlueEarth tyre, Exide Battery"
              />

              <div className="w-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">Coverage Type</label>
                <select
                  value={productType}
                  onChange={e => setProductType(e.target.value as 'Service' | 'Product')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:border-brand-accent sm:text-sm"
                >
                  <option value="Product">Product / Part</option>
                  <option value="Service">Service / Workmanship</option>
                </select>
              </div>

              <Input
                label="Serial Number / Part ID"
                id="serialNumber"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                placeholder="e.g. SN-8765-ABC"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                label="Purchase / Installation Date *"
                id="purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
              />

              <Input
                label="Warranty Duration (Months) *"
                id="warrantyPeriodMonths"
                type="number"
                min="1"
                value={warrantyPeriodMonths}
                onChange={e => setWarrantyPeriodMonths(parseInt(e.target.value) || 0)}
              />

              <div className="w-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">Calculated Expiry</label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-slate-700 sm:text-sm font-semibold">
                  {calculateExpiryDate(purchaseDate, warrantyPeriodMonths) || 'Pending...'}
                </div>
              </div>

              <Input
                label="Alert Days Before Expiry"
                id="alertDaysBefore"
                type="number"
                min="1"
                value={alertDaysBefore}
                onChange={e => setAlertDaysBefore(parseInt(e.target.value) || 0)}
              />
            </div>

            {/* Service Association Dropdown */}
            {customerServices.length > 0 && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Associate with Customer Service Order
                </label>
                <select
                  value={serviceId}
                  onChange={e => setServiceId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none sm:text-sm"
                >
                  <option value="">-- Do not associate with an order --</option>
                  {customerServices.map(s => {
                    const servicesList = s.serviceSelection.join(', ');
                    const orderDate = new Date(s.timestamp).toLocaleDateString();
                    return (
                      <option key={s.submissionId} value={s.submissionId}>
                        Order #{s.appointmentId || s.submissionId.slice(-6)} on {orderDate} ({servicesList})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes / Internal Comments</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Details regarding installation details, conditions, technician remarks..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warranty Coverage Terms</label>
                <textarea
                  value={terms}
                  onChange={e => setTerms(e.target.value)}
                  placeholder="Warranty coverage policies, exclusions, parts-only terms..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none sm:text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <Button onClick={() => { setEditingWarranty(null); setIsCreating(false); }} variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
                <IconDeviceFloppy className="w-5 h-5 mr-2" /> Save Warranty Record
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter and search block */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="md:col-span-2 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch className="w-5 h-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by customer, phone, product, serial number..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none sm:text-sm"
          />
        </div>

        <div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm bg-white focus:outline-none sm:text-sm"
          >
            <option value="ALL">All Coverage Types</option>
            <option value="Product">Products / Parts Only</option>
            <option value="Service">Services Only</option>
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm bg-white focus:outline-none sm:text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Policies</option>
            <option value="EXPIRING_SOON">Expiring Soon ({"<30"} Days)</option>
            <option value="EXPIRED">Expired Policies</option>
            <option value="CLAIMED">Claimed / Redeemed</option>
          </select>
        </div>
      </div>

      {/* Main warranties inventory grid/table */}
      <Card title="Warranty Ledger" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Info</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Coverage Details</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Period & Timeline</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status & Alerts</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWarranties.map(w => {
                const daysLeft = getDaysRemaining(w.expiryDate);
                const isNearExpiry = w.status === 'Active' && daysLeft >= 0 && daysLeft <= w.alertDaysBefore;
                const isExpired = w.status === 'Expired' || (w.status === 'Active' && daysLeft < 0);
                
                // Expiry calculation helpers
                const totalDays = w.warrantyPeriodMonths * 30.4;
                const percentElapsed = Math.min(100, Math.max(0, ((totalDays - Math.max(0, daysLeft)) / totalDays) * 100));

                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-800">{w.customerName}</div>
                      <div className="text-xs text-slate-500">{w.customerPhone}</div>
                      {w.customerEmail && <div className="text-xs text-slate-400">{w.customerEmail}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          w.productType === 'Service' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {w.productType}
                        </span>
                        <span className="font-medium text-slate-700">{w.productName}</span>
                      </div>
                      {w.serialNumber && (
                        <div className="text-xs text-slate-500 mt-1 font-mono">
                          S/N: {w.serialNumber}
                        </div>
                      )}
                      {w.serviceId && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Assoc. Order: #{w.serviceId.slice(-6)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-slate-600">
                        <span className="font-medium">Purchased:</span> {new Date(w.purchaseDate).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-600 font-semibold mt-0.5">
                        <span className="font-medium text-slate-500">Expires:</span> {new Date(w.expiryDate).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Duration: {w.warrantyPeriodMonths} Months
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {/* Badge and Expiring Timeline status */}
                      {w.status === 'Claimed' ? (
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                          <IconCheck className="w-3.5 h-3.5" /> Claimed / Fulfilled
                        </span>
                      ) : isExpired ? (
                        <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                          <IconX className="w-3.5 h-3.5" /> Expired
                        </span>
                      ) : isNearExpiry ? (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold inline-flex items-center gap-1 animate-pulse">
                          <IconAlertTriangle className="w-3.5 h-3.5" /> Expiring Soon ({daysLeft}d left)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                          <IconCheck className="w-3.5 h-3.5" /> Active ({daysLeft}d left)
                        </span>
                      )}

                      {/* Expiration gauge progress bar (only relevant if active / near expiry) */}
                      {w.status === 'Active' && daysLeft >= 0 && (
                        <div className="w-full mt-2 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              isNearExpiry ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${100 - percentElapsed}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* Toggle Claim button */}
                        <button
                          onClick={() => handleToggleClaimStatus(w)}
                          title={w.status === 'Claimed' ? 'Mark as Coverage Active' : 'Mark as Claimed / Redeemed'}
                          className={`p-1.5 rounded-md border text-xs font-semibold transition ${
                            w.status === 'Claimed' 
                              ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' 
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {w.status === 'Claimed' ? 'Re-activate' : 'Claim'}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(w)}
                          title="Edit coverage details"
                          className="p-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-md border border-slate-200 transition"
                        >
                          <IconPencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(w.id)}
                          title="Delete warranty policy"
                          className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-md border border-slate-200 transition"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredWarranties.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500 italic">
                    {warranties.length === 0 
                      ? 'No digital warranty records have been created yet. Click "Register Warranty" to start coverage.' 
                      : 'No warranty records matched your filters or search query.'
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default WarrantyTrackerPage;
