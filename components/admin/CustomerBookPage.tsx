import React, { useState, useMemo } from 'react';
import { 
  Plus, Edit2, Trash2, Search, User, Mail, MapPin, 
  Car, PlusCircle, X, Check, Eye, ChevronRight, Sliders, Database, Calendar, Clock, Activity, FileText, Coins
} from 'lucide-react';
import { 
  AppData, CustomerBookEntry, SavedVehicle, VehicleCategoryTag, Service, ServiceStatus
} from '../../types';
import { saveRecord, deleteRecord } from '../../services/cloudDataService';
import GoogleAddressAutocomplete from '../ui/GoogleAddressAutocomplete';

interface CustomerBookPageProps {
  appData: AppData;
  onRefresh: () => Promise<void>;
  sheetsUrl: string;
}

export const CustomerBookPage: React.FC<CustomerBookPageProps> = ({
  appData,
  onRefresh,
  sheetsUrl
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerBookEntry | null>(null);
  const [selectedTimelineCustomer, setSelectedTimelineCustomer] = useState<CustomerBookEntry | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Basic customer fields
  const [formMobile, setFormMobile] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLatitude, setFormLatitude] = useState<number | ''>('');
  const [formLongitude, setFormLongitude] = useState<number | ''>('');
  const [formELoc, setFormELoc] = useState('');
  const [formLoyaltyScore, setFormLoyaltyScore] = useState<number | ''>('');
  
  // Vehicles sub-list state
  const [formVehicles, setFormVehicles] = useState<SavedVehicle[]>([]);
  const [newCarNumber, setNewCarNumber] = useState('');
  const [newCarBrandModel, setNewCarBrandModel] = useState('');
  const [newVehicleCategory, setNewVehicleCategory] = useState<VehicleCategoryTag>(VehicleCategoryTag.Hatch);

  const customerBook = appData.customerBook || [];

  // Analyze submissions and find out how many need syncing
    const pendingSyncs = useMemo(() => {
    const submissions = appData.submissions || [];
    const currentBook = appData.customerBook || [];
    const currentMap = new Map(currentBook.map(c => [String(c.mobileNumber || '').trim(), c]));
    
    const toSyncMap = new Map<string, {
      mobileNumber: string;
      firstName: string;
      lastName: string;
      streetAddress: string;
      customerEmail?: string;
      latitude?: number;
      longitude?: number;
      eLoc?: string;
      vehicles: Map<string, SavedVehicle>;
    }>();

    submissions.forEach(sub => {
      const phone = String(sub.mobileNumber || '').trim();
      if (!phone) return;

      const vehicleNum = String(sub.carNumber || '').toUpperCase().trim();
      const hasVehicle = vehicleNum && String(sub.carBrandModel || '').trim();
      
      const v: SavedVehicle | null = hasVehicle ? {
        carNumber: vehicleNum,
        carBrandModel: String(sub.carBrandModel || '').trim(),
        vehicleCategoryTag: sub.vehicleCategoryTag || VehicleCategoryTag.Hatch
      } : null;

      const existingInBook = currentMap.get(phone);
      
      if (!existingInBook) {
        if (!toSyncMap.has(phone)) {
          toSyncMap.set(phone, {
            mobileNumber: phone,
            firstName: String(sub.customerFirstName || '').trim() || 'Valued',
            lastName: String(sub.customerLastName || '').trim() || 'Customer',
            streetAddress: String(sub.streetAddress || '').trim() || 'N/A',
            customerEmail: String(sub.customerEmail || '').trim() || undefined,
            latitude: sub.customerLatitude,
            longitude: sub.customerLongitude,
            eLoc: sub.customerELoc,
            vehicles: new Map()
          });
        }
        if (v) {
          toSyncMap.get(phone)!.vehicles.set(v.carNumber, v);
        }
      } else {
        const vehiclesInBook = new Set((existingInBook.savedVehicles || []).map(veh => veh.carNumber.toUpperCase()));
        const isVehicleMissing = v && !vehiclesInBook.has(v.carNumber);
        
        const isEmailMissing = !existingInBook.customerEmail && String(sub.customerEmail || '').trim();
        const isAddressMissing = !existingInBook.streetAddress && String(sub.streetAddress || '').trim();
        const isGeoMissing = !existingInBook.latitude && sub.customerLatitude;

        if (isVehicleMissing || isEmailMissing || isAddressMissing || isGeoMissing) {
          if (!toSyncMap.has(phone)) {
            toSyncMap.set(phone, {
              mobileNumber: phone,
              firstName: existingInBook.firstName || String(sub.customerFirstName || '').trim(),
              lastName: existingInBook.lastName || String(sub.customerLastName || '').trim(),
              streetAddress: existingInBook.streetAddress || String(sub.streetAddress || '').trim(),
              customerEmail: existingInBook.customerEmail || String(sub.customerEmail || '').trim() || undefined,
              latitude: existingInBook.latitude || sub.customerLatitude,
              longitude: existingInBook.longitude || sub.customerLongitude,
              eLoc: existingInBook.eLoc || sub.customerELoc,
              vehicles: new Map((existingInBook.savedVehicles || []).map(veh => [veh.carNumber, veh]))
            });
          }
          if (v) {
            toSyncMap.get(phone)!.vehicles.set(v.carNumber, v);
          }
        }
      }
    });

    return Array.from(toSyncMap.values()).map(item => ({
      id: item.mobileNumber,
      mobileNumber: item.mobileNumber,
      firstName: item.firstName,
      lastName: item.lastName,
      streetAddress: item.streetAddress,
      customerEmail: item.customerEmail,
      latitude: item.latitude,
      longitude: item.longitude,
      eLoc: item.eLoc,
      savedVehicles: Array.from(item.vehicles.values())
    }));
  }, [appData.submissions, appData.customerBook]);

  // Execute synchronization
  const handleAutoSync = async () => {
    if (pendingSyncs.length === 0) return;
    setIsSyncing(true);
    try {
      for (const entry of pendingSyncs) {
        await saveRecord('Customers', entry, sheetsUrl);
      }
      await onRefresh();
    } catch (err) {
      alert('Failed to automatically synchronize profiles');
    } finally {
      setIsSyncing(false);
    }
  };

  const customerServices = useMemo(() => {
    if (!selectedTimelineCustomer) return [];
    return (appData.submissions || [])
      .filter((sub: Service) => String(sub.mobileNumber || '').trim() === String(selectedTimelineCustomer.mobileNumber || '').trim())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [appData.submissions, selectedTimelineCustomer]);

  const totalSpent = useMemo(() => {
    return customerServices.reduce((sum, s) => {
      const washAmt = s.carWashDetails?.price || s.carwashTotalAmount || 0;
      const careAmt = s.carCareDetails?.price || s.carCareTotalAmount || 0;
      return sum + Number(washAmt) + Number(careAmt);
    }, 0);
  }, [customerServices]);

  // Reset form
  const resetForm = (customer: CustomerBookEntry | null = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormMobile(String(customer.mobileNumber || ''));
      setFormFirstName(String(customer.firstName || ''));
      setFormLastName(String(customer.lastName || ''));
      setFormAddress(String(customer.streetAddress || ''));
      setFormEmail(String(customer.customerEmail || ''));
      setFormLatitude(customer.latitude ?? '');
      setFormLongitude(customer.longitude ?? '');
      setFormELoc(customer.eLoc || '');
      setFormVehicles(customer.savedVehicles || []);
      setFormLoyaltyScore(customer.loyaltyScore ?? '');
    } else {
      setEditingCustomer(null);
      setFormMobile('');
      setFormFirstName('');
      setFormLastName('');
      setFormAddress('');
      setFormEmail('');
      setFormLatitude('');
      setFormLongitude('');
      setFormELoc('');
      setFormVehicles([]);
      setFormLoyaltyScore('');
    }
    setNewCarNumber('');
    setNewCarBrandModel('');
    setNewVehicleCategory(VehicleCategoryTag.Hatch);
  };

  // Add vehicle to form state
  const handleAddVehicleToForm = () => {
    if (!newCarNumber.trim() || !newCarBrandModel.trim()) {
      alert('Please enter both Car Number and Brand/Model');
      return;
    }
    
    // Check for duplicate in current form state
    if (formVehicles.some(v => v.carNumber.toUpperCase() === newCarNumber.trim().toUpperCase())) {
      alert('Car with this number is already added to this customer!');
      return;
    }

    const vehicle: SavedVehicle = {
      carNumber: newCarNumber.trim().toUpperCase(),
      carBrandModel: newCarBrandModel.trim(),
      vehicleCategoryTag: newVehicleCategory
    };

    setFormVehicles([...formVehicles, vehicle]);
    setNewCarNumber('');
    setNewCarBrandModel('');
    setNewVehicleCategory(VehicleCategoryTag.Hatch);
  };

  // Remove vehicle from form state
  const handleRemoveVehicleFromForm = (carNum: string) => {
    setFormVehicles(formVehicles.filter(v => v.carNumber !== carNum));
  };

  // Save customer entry
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMobile.trim() || !formFirstName.trim() || !formLastName.trim()) {
      alert('Mobile number, first name, and last name are required!');
      return;
    }

    if (formVehicles.length === 0) {
      alert('Please add at least one vehicle for this customer.');
      return;
    }

    try {
      const customerId = formMobile.trim(); // Phone acts as unique key
      const record: CustomerBookEntry = {
        id: customerId,
        mobileNumber: formMobile.trim(),
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        streetAddress: formAddress.trim(),
        customerEmail: formEmail.trim() || undefined,
        latitude: formLatitude !== '' ? Number(formLatitude) : undefined,
        longitude: formLongitude !== '' ? Number(formLongitude) : undefined,
        eLoc: formELoc.trim() || undefined,
        savedVehicles: formVehicles,
        loyaltyScore: formLoyaltyScore !== '' ? Number(formLoyaltyScore) : undefined
      };

      await saveRecord('Customers', record, sheetsUrl);
      setIsModalOpen(false);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save customer');
    }
  };

  // Delete customer entry
  const handleDeleteCustomer = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer from the customer book? This cannot be undone.')) return;
    try {
      await deleteRecord('Customers', id, sheetsUrl);
      await onRefresh();
    } catch (err) {
      alert('Failed to delete customer');
    }
  };

  // Filter and search
  const filteredCustomers = customerBook.filter(c => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const fullName = `${String(c.firstName || '')} ${String(c.lastName || '')}`.toLowerCase();
    const phone = String(c.mobileNumber || '').toLowerCase();
    const address = String(c.streetAddress || '').toLowerCase();
    
    const matchesVehicle = c.savedVehicles?.some(v => 
      String(v.carNumber || '').toLowerCase().includes(query) || 
      String(v.carBrandModel || '').toLowerCase().includes(query)
    );

    return fullName.includes(query) || phone.includes(query) || address.includes(query) || matchesVehicle;
  });

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <User className="w-8 h-8 text-brand-accent" />
              Customer Book
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Keep customer profiles with multiple vehicles saved. Access vehicle categories and details during booking instantly.
            </p>
          </div>
          
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-brand-accent hover:bg-brand-accent/90 text-brand-blue font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-accent/10"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
            Register Customer
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md bg-slate-800/40 border border-slate-800 rounded-xl flex items-center p-1.5 focus-within:border-brand-accent transition">
          <Search className="w-5 h-5 text-slate-500 ml-3 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, car number..."
            className="w-full bg-transparent px-3 py-1.5 text-sm text-white focus:outline-none placeholder-slate-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Auto Sync Banner */}
        {pendingSyncs.length > 0 && (
          <div className="bg-slate-800/40 border border-brand-accent/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-brand-accent/10 text-brand-accent rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">Customer Book Deduplication Engine</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Found {pendingSyncs.length} non-duplicate customer profiles or vehicles in your recent service orders that aren't on record.
                </p>
              </div>
            </div>
            <button
              onClick={handleAutoSync}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 text-brand-blue font-black px-5 py-2.5 rounded-xl transition shadow-lg shadow-brand-accent/5 cursor-pointer text-xs"
            >
              {isSyncing ? 'Syncing Profiles...' : 'Sync & Deduplicate'}
            </button>
          </div>
        )}

        {/* Customers Table/Grid */}
        {filteredCustomers.length === 0 ? (
          <div className="bg-slate-800/20 border border-slate-800 p-12 text-center rounded-2xl">
            <User className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-300">No Customers Registered</h3>
            <p className="text-slate-500 text-sm mt-1">Get started by clicking 'Register Customer' above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCustomers.map(customer => (
              <div 
                key={customer.id}
                className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-4">
                  
                  {/* Name and Phone */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white leading-tight flex items-center gap-2">
                        {customer.firstName} {customer.lastName}
                        {customer.loyaltyScore !== undefined && (
                          <span className="text-[10px] bg-brand-accent/20 text-brand-accent font-bold px-1.5 py-0.5 rounded-full border border-brand-accent/30 flex items-center gap-0.5">
                            ★ {customer.loyaltyScore}
                          </span>
                        )}
                      </h3>
                      <span className="text-xs font-mono text-brand-accent block mt-1">
                        {customer.mobileNumber}
                      </span>
                    </div>
                    
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {customer.savedVehicles?.length || 0} Saved Vehicles
                    </span>
                  </div>

                  {/* Contact/Address Details */}
                  <div className="space-y-2 text-xs text-slate-400">
                    {customer.customerEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{customer.customerEmail}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2 leading-relaxed">{customer.streetAddress}</span>
                    </div>
                    {(customer.latitude || customer.eLoc) && (
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                        <span>Lat/Lon: {customer.latitude?.toFixed(5) || 'N/A'}, {customer.longitude?.toFixed(5) || 'N/A'}</span>
                        {customer.eLoc && <span className="bg-slate-800 px-1 rounded">eLoc: {customer.eLoc}</span>}
                      </div>
                    )}
                  </div>

                  {/* Saved Vehicles Cards */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    <span className="text-xs font-bold text-slate-400 block tracking-wider uppercase flex items-center gap-1.5 mb-2">
                      <Car className="w-3.5 h-3.5 text-brand-accent" />
                      Vehicles on Record
                    </span>
                    
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {customer.savedVehicles?.map((v, idx) => (
                        <div key={idx} className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-200 block truncate">
                              {v.carNumber}
                            </span>
                            <span className="text-xs text-slate-400 font-medium block truncate">
                              {v.carBrandModel}
                            </span>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/50 uppercase">
                            {v.vehicleCategoryTag}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                 {/* Edit and Delete Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => setSelectedTimelineCustomer(customer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent rounded-lg transition border border-brand-accent/20"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Timeline
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        resetForm(customer);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Modify
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(customer.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-950/40 hover:bg-red-950/80 text-red-400 rounded-lg transition border border-red-900/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Modal: Add/Edit Customer and Vehicles */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
              
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-brand-accent" />
                  {editingCustomer ? 'Edit Customer Profile' : 'Register Customer'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-6 space-y-6">
                
                {/* Section 1: Customer Profile Details */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-accent block border-b border-slate-800 pb-1.5 uppercase">Profile details</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Mobile Number (Primary Key)</label>
                      <input
                        type="text"
                        required
                        disabled={!!editingCustomer}
                        value={formMobile}
                        onChange={(e) => setFormMobile(e.target.value.replace(/[^0-9+]/g, ''))}
                        placeholder="e.g. 9876543210"
                        className="w-full bg-slate-800 disabled:opacity-50 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">First Name</label>
                      <input
                        type="text"
                        required
                        value={formFirstName}
                        onChange={(e) => setFormFirstName(e.target.value)}
                        placeholder="e.g. Rahul"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Last Name</label>
                      <input
                        type="text"
                        required
                        value={formLastName}
                        onChange={(e) => setFormLastName(e.target.value)}
                        placeholder="e.g. Sharma"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Email Address (Optional)</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="e.g. rahul@example.com"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Plus Code / Location Code (Optional)</label>
                      <input
                        type="text"
                        value={formELoc}
                        onChange={(e) => setFormELoc(e.target.value)}
                        placeholder="e.g. 12AB34"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Loyalty Score (Optional)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formLoyaltyScore}
                        onChange={(e) => setFormLoyaltyScore(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 85"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <GoogleAddressAutocomplete
                      label="Street Address (Google Maps Autocomplete)"
                      value={formAddress}
                      onChange={(val) => setFormAddress(val)}
                      latitude={typeof formLatitude === 'number' ? formLatitude : undefined}
                      longitude={typeof formLongitude === 'number' ? formLongitude : undefined}
                      onSelectAddress={(result) => {
                        setFormAddress(result.address);
                        if (result.lat && result.lng) {
                          setFormLatitude(result.lat);
                          setFormLongitude(result.lng);
                        }
                      }}
                      placeholder="Type street, area or landmark via Google Maps..."
                    />
                  </div>

                  {/* Geolocation Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/20 border border-slate-800/60 p-3.5 rounded-xl">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Latitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={formLatitude}
                        onChange={(e) => setFormLatitude(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 22.49814"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Longitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={formLongitude}
                        onChange={(e) => setFormLongitude(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 88.38670"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Saved Vehicles subform */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-accent block border-b border-slate-800 pb-1.5 uppercase">Saved Vehicles ({formVehicles.length})</h4>

                  {/* Inline Add Vehicle controls */}
                  <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-slate-300 block mb-1">Register new vehicle for customer</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Car Number</label>
                        <input
                          type="text"
                          value={newCarNumber}
                          onChange={(e) => setNewCarNumber(e.target.value)}
                          placeholder="e.g. WB02AE1234"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-accent font-mono uppercase"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Brand & Model</label>
                        <input
                          type="text"
                          value={newCarBrandModel}
                          onChange={(e) => setNewCarBrandModel(e.target.value)}
                          placeholder="e.g. Hyundai Creta"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-accent"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Vehicle Category Tag</label>
                        <select
                          value={newVehicleCategory}
                          onChange={(e) => setNewVehicleCategory(e.target.value as VehicleCategoryTag)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-accent"
                        >
                          {Object.values(VehicleCategoryTag).map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleAddVehicleToForm}
                        className="flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent/90 text-brand-blue font-bold px-3 py-1.5 rounded-lg text-xs transition"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add Vehicle
                      </button>
                    </div>
                  </div>

                  {/* Registered list of vehicles in form */}
                  {formVehicles.length === 0 ? (
                    <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                      No vehicles added yet. A customer must have at least one registered vehicle.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                      {formVehicles.map((v, idx) => (
                        <div key={idx} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold font-mono tracking-wider text-slate-200 uppercase block truncate">
                              {v.carNumber}
                            </span>
                            <span className="text-xs text-slate-400 truncate block font-medium">
                              {v.carBrandModel}
                            </span>
                            <span className="text-[9px] uppercase font-bold text-slate-500 mt-1 block tracking-wider">
                              Category: {v.vehicleCategoryTag}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveVehicleFromForm(v.carNumber)}
                            className="p-1 hover:bg-red-950/40 text-slate-500 hover:text-red-400 rounded-lg transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

                {/* Modal footer buttons */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-sm font-bold bg-brand-accent hover:bg-brand-accent/90 text-brand-blue rounded-xl transition shadow-lg"
                  >
                    Save Customer Profile
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

        {/* Modal: Customer Service History Timeline */}
        {selectedTimelineCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
              
              {/* Timeline Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-brand-accent" />
                    <h3 className="text-xl font-bold text-white">
                      Customer Service History & Timeline
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Chronological service record and media logs for <span className="text-white font-bold">{selectedTimelineCustomer.firstName} {selectedTimelineCustomer.lastName}</span> ({selectedTimelineCustomer.mobileNumber})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTimelineCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Stats Overview */}
              <div className="p-6 bg-slate-900/60 border-b border-slate-800/50 grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
                <div className="bg-slate-800/30 border border-slate-800/60 p-4 rounded-xl flex items-center gap-3.5">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Total Business Value</span>
                    <span className="text-lg font-black text-white">₹{totalSpent.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="bg-slate-800/30 border border-slate-800/60 p-4 rounded-xl flex items-center gap-3.5">
                  <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Total Service Orders</span>
                    <span className="text-lg font-black text-white">{customerServices.length} Completed</span>
                  </div>
                </div>

                <div className="bg-slate-800/30 border border-slate-800/60 p-4 rounded-xl flex items-center gap-3.5">
                  <div className="p-3 bg-brand-accent/10 text-brand-accent rounded-lg">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Last Service Opted</span>
                    <span className="text-xs font-bold text-white block mt-1 truncate">
                      {customerServices[0] ? new Date(customerServices[0].timestamp).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'No record'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline Flow */}
              <div className="p-6 overflow-y-auto space-y-6">
                {customerServices.length === 0 ? (
                  <div className="p-12 text-center bg-slate-800/10 border border-dashed border-slate-800 rounded-2xl">
                    <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <h4 className="text-base font-bold text-slate-400">No Services Logged Yet</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Once this customer opts for services and bookings are completed, they will automatically appear here as a service history timeline.
                    </p>
                  </div>
                ) : (
                  <div className="relative pl-6 border-l border-slate-800 space-y-8">
                    {customerServices.map((service, index) => {
                      const serviceDate = new Date(service.timestamp);
                      const formattedDate = serviceDate.toLocaleDateString('en-IN', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      });
                      const formattedTime = serviceDate.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      // Status custom styling
                      const statusColorMap: { [key in ServiceStatus]?: { bg: string, text: string, border: string } } = {
                        [ServiceStatus.Completed]: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                        [ServiceStatus.InProgress]: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
                        [ServiceStatus.Assigned]: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
                        [ServiceStatus.Queued]: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
                        [ServiceStatus.Draft]: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' }
                      };
                      const statusStyle = statusColorMap[service.status] || { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' };

                      return (
                        <div key={service.submissionId} className="relative group">
                          
                          {/* Chronological Circle Node */}
                          <div className={`absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border-4 border-slate-900 bg-slate-800 transition-all group-hover:scale-125 flex items-center justify-center`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${service.status === ServiceStatus.Completed ? 'bg-emerald-400' : 'bg-brand-accent'}`} />
                          </div>

                          <div className="bg-slate-800/20 hover:bg-slate-800/30 border border-slate-800/60 hover:border-slate-800 rounded-2xl p-5 transition duration-200 space-y-4">
                            
                            {/* Card Header Info */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/40 pb-3">
                              <div className="flex items-center gap-2.5">
                                <span className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-md border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                                  {service.status}
                                </span>
                                <span className="text-xs text-slate-500 font-medium font-mono">
                                  ID: {service.submissionId}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{formattedDate}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{formattedTime}</span>
                                </div>
                              </div>
                            </div>

                            {/* Service Selections & Vehicle details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              
                              {/* Left: Opted Services */}
                              <div>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">Opted Services ({service.serviceSelection?.length || 0})</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {service.serviceSelection && service.serviceSelection.length > 0 ? (
                                    service.serviceSelection.map((srv, sIdx) => (
                                      <span key={sIdx} className="bg-slate-900/60 border border-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded-lg">
                                        {srv}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-slate-500 italic">No services specified</span>
                                  )}
                                </div>
                              </div>

                              {/* Right: Vehicle details */}
                              <div>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">Service Vehicle</span>
                                <div className="bg-slate-900/40 border border-slate-800/50 p-2.5 rounded-xl flex items-center justify-between gap-3">
                                  <div>
                                    <span className="text-xs font-mono font-bold text-white block uppercase tracking-wide">
                                      {service.carNumber}
                                    </span>
                                    <span className="text-xs text-slate-400 block font-medium">
                                      {service.carBrandModel}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/30 uppercase">
                                    {service.vehicleCategoryTag || 'N/A'}
                                  </span>
                                </div>
                              </div>

                            </div>

                            {/* Operator Assigned and Notes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                              <div>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">Assigned Operator</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px]">
                                    {service.assignedTo ? service.assignedTo[0].toUpperCase() : 'U'}
                                  </div>
                                  <span className="text-xs font-bold text-slate-300">
                                    {service.assignedTo || 'Unassigned'}
                                  </span>
                                </div>
                              </div>

                              {service.internalNotes && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Internal Notes</span>
                                  <p className="text-xs text-slate-400 italic bg-slate-900/20 border border-slate-800 p-2 rounded-xl">
                                    "{service.internalNotes}"
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Media upload inspection check (Before/After photos) */}
                            <div className="border-t border-slate-800/40 pt-3 space-y-2">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Service Quality Photos</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                
                                {/* Before Wash Image */}
                                <div className="bg-slate-900/30 border border-slate-800/50 p-2 rounded-xl text-center space-y-2">
                                  <span className="text-[10px] font-bold text-slate-500 block uppercase">Before Service</span>
                                  {service.beforeWashingPhoto ? (
                                    <img 
                                      src={service.beforeWashingPhoto} 
                                      alt="Before Service" 
                                      referrerPolicy="no-referrer"
                                      className="rounded-lg object-cover w-full h-36 border border-slate-800/60"
                                    />
                                  ) : (
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800/60 h-36 flex items-center justify-center text-[11px] text-slate-600 italic">
                                      Before Photo not uploaded
                                    </div>
                                  )}
                                </div>

                                {/* After Wash Image */}
                                <div className="bg-slate-900/30 border border-slate-800/50 p-2 rounded-xl text-center space-y-2">
                                  <span className="text-[10px] font-bold text-slate-500 block uppercase">After Service</span>
                                  {service.afterWashingPhoto ? (
                                    <img 
                                      src={service.afterWashingPhoto} 
                                      alt="After Service" 
                                      referrerPolicy="no-referrer"
                                      className="rounded-lg object-cover w-full h-36 border border-slate-800/60"
                                    />
                                  ) : (
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800/60 h-36 flex items-center justify-center text-[11px] text-slate-600 italic">
                                      After Photo not uploaded
                                    </div>
                                  )}
                                </div>

                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Timeline Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-900 flex-shrink-0 flex justify-end">
                <button
                  onClick={() => setSelectedTimelineCustomer(null)}
                  className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 cursor-pointer"
                >
                  Close Timeline
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CustomerBookPage;
