import React, { useState, useMemo, useEffect } from 'react';
import { CarDatabaseItem, Service, VehicleCategoryTag } from '../../types';
import { fetchCarDatabaseFromSheet } from '../../services/googleSheetService';
import { neonDataService } from '../../services/neonDataService';
import { 
  IconSearch, IconRefresh, IconPlus, IconDownload, IconFilter, 
  IconTrash, IconEdit, IconCheckCircle, IconXCircle, IconExternalLink,
  IconSparkles, IconDatabase, IconGrid, IconList, IconShieldCheck
} from '../ui/Icon';

interface CarDatabasePageProps {
  carDatabase?: CarDatabaseItem[];
  onUpdateCarDatabase: (database: CarDatabaseItem[]) => void;
  submissions?: Service[];
  onUpdateSubmissions?: (submissions: Service[]) => void;
  googleSheetsUrl?: string;
}

export const CarDatabasePage: React.FC<CarDatabasePageProps> = ({
  carDatabase = [],
  onUpdateCarDatabase,
  submissions = [],
  onUpdateSubmissions,
  googleSheetsUrl
}) => {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedFuel, setSelectedFuel] = useState('ALL');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('TABLE');
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({
    type: null,
    message: ''
  });

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CarDatabaseItem | null>(null);
  const [mappingCarItem, setMappingCarItem] = useState<CarDatabaseItem | null>(null);
  const [mappingSearch, setMappingSearch] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [viewingDetailItem, setViewingDetailItem] = useState<CarDatabaseItem | null>(null);

  // Form state for Add / Edit
  const [formData, setFormData] = useState<Partial<CarDatabaseItem>>({
    brand: '',
    logo: '',
    model: '',
    image: '',
    version: '',
    yearRange: '',
    fuelType: 'Petrol',
    frontTyresSpec: '185 / 65 R15',
    frontTyresWidth: '185',
    frontTyresProfile: '65',
    frontTyresRadius: '15',
    rearTyresSpec: '185 / 65 R15',
    rearTyresWidth: '185',
    rearTyresProfile: '65',
    rearTyresRadius: '15',
    tag: 'Hatch'
  });

  // Auto-fetch if empty on first load (check Neon DB first, fallback to Sheet)
  useEffect(() => {
    if (carDatabase.length <= 1) {
      neonDataService.loadCarDatabase().then(neonCars => {
        if (Array.isArray(neonCars) && neonCars.length > 0) {
          onUpdateCarDatabase(neonCars);
          setSyncStatus({ 
            type: 'success', 
            message: `Loaded ${neonCars.length.toLocaleString()} vehicle records from Neon PostgreSQL Database!` 
          });
        } else {
          handleSyncFromSheet();
        }
      }).catch(() => {
        handleSyncFromSheet();
      });
    }
  }, []);

  // Fetch / Sync handler
  const handleSyncFromSheet = async () => {
    setIsSyncing(true);
    setSyncStatus({ type: 'info', message: 'Fetching latest car database from website Google Sheet & syncing to Neon PostgreSQL...' });
    try {
      const items = await fetchCarDatabaseFromSheet(googleSheetsUrl);
      if (items && items.length > 0) {
        onUpdateCarDatabase(items);
        // Persist directly to Neon PostgreSQL
        neonDataService.saveCarDatabase(items).catch(err => {
          console.warn('⚠️ [Neon] Failed to mirror car database:', err);
        });
        setSyncStatus({ 
          type: 'success', 
          message: `Successfully synchronized ${items.length.toLocaleString()} vehicle records into Neon PostgreSQL & local cache!` 
        });
      } else {
        setSyncStatus({ type: 'error', message: 'No vehicle records found in Google Sheet.' });
      }
    } catch (err: any) {
      console.error('Failed to sync CarDatabase:', err);
      setSyncStatus({ 
        type: 'error', 
        message: err.message || 'Failed to connect to Google Sheet. Please check spreadsheet access.' 
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Derive unique filter lists
  const brandList = useMemo(() => {
    const brandsMap = new Map<string, { name: string; logo: string; count: number }>();
    carDatabase.forEach(item => {
      const b = item.brand || 'Unknown';
      if (!brandsMap.has(b)) {
        brandsMap.set(b, { name: b, logo: item.logo, count: 1 });
      } else {
        const existing = brandsMap.get(b)!;
        existing.count += 1;
        if (!existing.logo && item.logo) existing.logo = item.logo;
      }
    });
    return Array.from(brandsMap.values()).sort((a, b) => b.count - a.count);
  }, [carDatabase]);

  const fuelTypes = useMemo(() => {
    const fuels = new Set<string>();
    carDatabase.forEach(i => i.fuelType && fuels.add(i.fuelType.trim()));
    return Array.from(fuels).sort();
  }, [carDatabase]);

  const categoryTags = useMemo(() => {
    const tags = new Set<string>();
    carDatabase.forEach(i => i.tag && tags.add(i.tag.trim()));
    return Array.from(tags).sort();
  }, [carDatabase]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return carDatabase.filter(item => {
      const matchesSearch = 
        !searchQuery ||
        item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.fuelType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.frontTyresSpec.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.yearRange.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBrand = selectedBrand === 'ALL' || item.brand === selectedBrand;
      const matchesFuel = selectedFuel === 'ALL' || item.fuelType.toLowerCase().includes(selectedFuel.toLowerCase());
      const matchesTag = selectedTag === 'ALL' || item.tag.toLowerCase() === selectedTag.toLowerCase();

      return matchesSearch && matchesBrand && matchesFuel && matchesTag;
    });
  }, [carDatabase, searchQuery, selectedBrand, selectedFuel, selectedTag]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = carDatabase.length;
    const uniqueBrands = brandList.length;
    const uniqueModels = new Set(carDatabase.map(i => `${i.brand}_${i.model}`)).size;
    const suvCount = carDatabase.filter(i => (i.tag || '').toLowerCase().includes('suv')).length;
    const hatchCount = carDatabase.filter(i => (i.tag || '').toLowerCase().includes('hatch')).length;
    const sedanCount = carDatabase.filter(i => (i.tag || '').toLowerCase().includes('sedan')).length;
    const luxuryCount = carDatabase.filter(i => (i.tag || '').toLowerCase().includes('luxury')).length;

    return { totalCount, uniqueBrands, uniqueModels, suvCount, hatchCount, sedanCount, luxuryCount };
  }, [carDatabase, brandList]);

  // Handle Save (Add or Edit)
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.brand || !formData.model) {
      alert('Brand and Model are required!');
      return;
    }

    if (editingItem) {
      const updated = carDatabase.map(item => 
        item.id === editingItem.id ? { ...editingItem, ...formData } as CarDatabaseItem : item
      );
      onUpdateCarDatabase(updated);
      setSyncStatus({ type: 'success', message: `Updated ${formData.brand} ${formData.model}` });
    } else {
      const newItem: CarDatabaseItem = {
        id: `car_custom_${Date.now()}`,
        brand: formData.brand || '',
        logo: formData.logo || '',
        model: formData.model || '',
        image: formData.image || '',
        version: formData.version || '',
        yearRange: formData.yearRange || '',
        fuelType: formData.fuelType || 'Petrol',
        frontTyresSpec: formData.frontTyresSpec || '',
        frontTyresWidth: formData.frontTyresWidth || '',
        frontTyresProfile: formData.frontTyresProfile || '',
        frontTyresRadius: formData.frontTyresRadius || '',
        rearTyresSpec: formData.rearTyresSpec || '',
        rearTyresWidth: formData.rearTyresWidth || '',
        rearTyresProfile: formData.rearTyresProfile || '',
        rearTyresRadius: formData.rearTyresRadius || '',
        tag: formData.tag || 'Hatch'
      };
      onUpdateCarDatabase([newItem, ...carDatabase]);
      setSyncStatus({ type: 'success', message: `Added new vehicle variant: ${newItem.brand} ${newItem.model}` });
    }

    setIsAddModalOpen(false);
    setEditingItem(null);
  };

  // Handle Delete
  const handleDeleteItem = (id: string) => {
    if (confirm('Are you sure you want to remove this vehicle record from the master car database?')) {
      const updated = carDatabase.filter(item => item.id !== id);
      onUpdateCarDatabase(updated);
      setSyncStatus({ type: 'info', message: 'Vehicle record deleted from database.' });
    }
  };

  // Handle Mapping Vehicle to Existing Orders
  const handleMapVehicleToOrders = () => {
    if (!mappingCarItem) return;
    if (selectedOrderIds.length === 0) {
      alert('Please select at least one existing order to map!');
      return;
    }

    if (!onUpdateSubmissions || !submissions) {
      alert('Orders collection not accessible for mapping.');
      return;
    }

    const updatedSubmissions = submissions.map(sub => {
      if (selectedOrderIds.includes(sub.submissionId)) {
        // Resolve tag
        let resolvedTag = VehicleCategoryTag.Prime;
        const tagLower = (mappingCarItem.tag || '').toLowerCase();
        if (tagLower.includes('micro')) resolvedTag = VehicleCategoryTag.Micro;
        else if (tagLower.includes('hatch')) resolvedTag = VehicleCategoryTag.Hatch;
        else if (tagLower.includes('prime')) resolvedTag = VehicleCategoryTag.Prime;
        else if (tagLower.includes('crossover') || tagLower.includes('cross')) resolvedTag = VehicleCategoryTag.CrossOver;
        else if (tagLower.includes('suv')) resolvedTag = VehicleCategoryTag.Suv;
        else if (tagLower.includes('luxury')) resolvedTag = VehicleCategoryTag.Luxury;

        return {
          ...sub,
          carBrand: mappingCarItem.brand,
          carModelName: mappingCarItem.model,
          carVersion: mappingCarItem.version,
          carFuelType: mappingCarItem.fuelType,
          carYearRange: mappingCarItem.yearRange,
          carLogoUrl: mappingCarItem.logo,
          carImageUrl: mappingCarItem.image,
          frontTyresSpec: mappingCarItem.frontTyresSpec,
          rearTyresSpec: mappingCarItem.rearTyresSpec,
          vehicleCategoryTag: resolvedTag,
          carBrandModel: `${mappingCarItem.brand} - ${mappingCarItem.model} (${mappingCarItem.version || mappingCarItem.fuelType})`
        };
      }
      return sub;
    });

    onUpdateSubmissions(updatedSubmissions);
    alert(`Successfully mapped vehicle specs (${mappingCarItem.brand} ${mappingCarItem.model}) to ${selectedOrderIds.length} order(s)!`);
    setMappingCarItem(null);
    setSelectedOrderIds([]);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (carDatabase.length === 0) return;
    const headers = [
      'brand', 'logo', 'model', 'image', 'version', 'year_range', 'fuel_type',
      'front_tyres_spec', 'front_tyres_width', 'front_tyres_profile', 'front_tyres_radius',
      'rear_tyres_spec', 'rear_tyres_width', 'rear_tyres_profile', 'rear_tyres_radius', 'tag'
    ];
    
    const rows = carDatabase.map(item => [
      `"${item.brand.replace(/"/g, '""')}"`,
      `"${item.logo.replace(/"/g, '""')}"`,
      `"${item.model.replace(/"/g, '""')}"`,
      `"${item.image.replace(/"/g, '""')}"`,
      `"${item.version.replace(/"/g, '""')}"`,
      `"${item.yearRange.replace(/"/g, '""')}"`,
      `"${item.fuelType.replace(/"/g, '""')}"`,
      `"${item.frontTyresSpec.replace(/"/g, '""')}"`,
      `"${item.frontTyresWidth}"`,
      `"${item.frontTyresProfile}"`,
      `"${item.frontTyresRadius}"`,
      `"${item.rearTyresSpec.replace(/"/g, '""')}"`,
      `"${item.rearTyresWidth}"`,
      `"${item.rearTyresProfile}"`,
      `"${item.rearTyresRadius}"`,
      `"${item.tag.replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `car_database_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-blue rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-700/50">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-accent via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-brand-accent text-xs font-black uppercase tracking-widest mb-2">
              <IconDatabase className="w-4 h-4" />
              <span>Master Vehicle Database & Stock Tyre Mapping</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex flex-wrap items-center gap-3">
              Car Database Center
              <span className="text-xs px-3 py-1 rounded-full bg-brand-accent/20 text-brand-accent border border-brand-accent/30 font-bold">
                {stats.totalCount.toLocaleString()} Variants
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Neon SQL Synced
              </span>
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Centralized vehicle database synchronized with your website for vehicle selection, stock tyre filtering, category pricing, and automatic order enrichment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSyncFromSheet}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-accent text-brand-blue font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-brand-accent/90 active:scale-95 transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50"
            >
              <IconRefresh className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync From Website Sheet'}</span>
            </button>

            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({
                  brand: '', logo: '', model: '', image: '', version: '', yearRange: '', fuelType: 'Petrol',
                  frontTyresSpec: '185 / 65 R15', frontTyresWidth: '185', frontTyresProfile: '65', frontTyresRadius: '15',
                  rearTyresSpec: '185 / 65 R15', rearTyresWidth: '185', rearTyresProfile: '65', rearTyresRadius: '15', tag: 'Hatch'
                });
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-white/20 transition-all"
            >
              <IconPlus className="w-4 h-4" />
              <span>Add Vehicle</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-600/60 transition-all"
              title="Export CSV"
            >
              <IconDownload className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Sync Status Toast Notice */}
        {syncStatus.type && (
          <div className={`mt-4 px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            syncStatus.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' :
            syncStatus.type === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-200' :
            'bg-blue-500/20 border-blue-500/40 text-blue-200'
          }`}>
            <span className="flex items-center gap-2">
              {syncStatus.type === 'success' && <IconCheckCircle className="w-4 h-4 text-emerald-400" />}
              {syncStatus.type === 'error' && <IconXCircle className="w-4 h-4 text-red-400" />}
              {syncStatus.message}
            </span>
            <button onClick={() => setSyncStatus({ type: null, message: '' })} className="text-white/60 hover:text-white">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Total Variants</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.totalCount.toLocaleString()}</p>
          <span className="text-[10px] text-emerald-600 font-bold">100% Stock Coverage</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Car Brands</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.uniqueBrands}</p>
          <span className="text-[10px] text-slate-500">Major Manufacturers</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Car Models</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.uniqueModels.toLocaleString()}</p>
          <span className="text-[10px] text-slate-500">Distinct Model Lines</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Hatchbacks</p>
          <p className="text-xl font-black text-brand-blue mt-1">{stats.hatchCount.toLocaleString()}</p>
          <span className="text-[10px] text-slate-400">Micro & Hatch</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">SUVs & Crossovers</p>
          <p className="text-xl font-black text-amber-600 mt-1">{(stats.suvCount).toLocaleString()}</p>
          <span className="text-[10px] text-slate-400">Suv & Crossover</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Luxury Cars</p>
          <p className="text-xl font-black text-purple-600 mt-1">{stats.luxuryCount.toLocaleString()}</p>
          <span className="text-[10px] text-slate-400">Prime & Luxury</span>
        </div>
      </div>

      {/* Brand Selector Ribbon */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <IconFilter className="w-3.5 h-3.5 text-brand-blue" />
            Filter By Brand
          </span>
          <span className="text-xs text-slate-400 font-semibold">{brandList.length} Brands Available</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => setSelectedBrand('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedBrand === 'ALL'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Brands ({carDatabase.length})
          </button>

          {brandList.map(b => (
            <button
              key={b.name}
              onClick={() => setSelectedBrand(b.name)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedBrand === b.name
                  ? 'bg-brand-accent text-brand-blue border-brand-accent shadow-md font-extrabold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {b.logo ? (
                <img src={b.logo} alt={b.name} className="w-4 h-4 object-contain rounded" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-200 text-[9px] flex items-center justify-center font-black">
                  {b.name[0]}
                </span>
              )}
              <span>{b.name}</span>
              <span className="text-[10px] opacity-75 font-normal">({b.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search & Secondary Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search brand, model, version, fuel, tyres (e.g., Swift 185/65)..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs hover:text-slate-600">
              ✕
            </button>
          )}
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Fuel Filter */}
          <select
            value={selectedFuel}
            onChange={e => setSelectedFuel(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <option value="ALL">All Fuel Types</option>
            {fuelTypes.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Category Tag Filter */}
          <select
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <option value="ALL">All Category Tags</option>
            {categoryTags.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <IconList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('GRID')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'GRID' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Grid Card View"
            >
              <IconGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <IconDatabase className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Vehicle Records Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No car database entries match your search filter "{searchQuery}". Try clearing your search query or clicking "Sync From Website Sheet".
          </p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedBrand('ALL'); setSelectedFuel('ALL'); setSelectedTag('ALL'); }}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'TABLE' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-extrabold text-[10px]">
                  <th className="py-3.5 px-4">Vehicle / Brand</th>
                  <th className="py-3.5 px-4">Model & Variant</th>
                  <th className="py-3.5 px-4">Year & Fuel</th>
                  <th className="py-3.5 px-4">Front Tyre Spec</th>
                  <th className="py-3.5 px-4">Rear Tyre Spec</th>
                  <th className="py-3.5 px-4">Category Tag</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredItems.slice(0, 200).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Brand & Logo */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 p-1 flex items-center justify-center flex-shrink-0">
                          {item.logo ? (
                            <img src={item.logo} alt={item.brand} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-[10px] font-black text-slate-400">{item.brand.substring(0, 2)}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900">{item.brand}</p>
                          {item.image && (
                            <button
                              onClick={() => setViewingDetailItem(item)}
                              className="text-[10px] text-brand-blue hover:underline flex items-center gap-0.5 mt-0.5 font-bold"
                            >
                              <span>View Image</span>
                              <IconExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Model & Version */}
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{item.model}</p>
                        <p className="text-[11px] text-slate-500">{item.version || 'Standard'}</p>
                      </div>
                    </td>

                    {/* Year & Fuel */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.fuelType.toLowerCase().includes('petrol') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          item.fuelType.toLowerCase().includes('diesel') ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                          item.fuelType.toLowerCase().includes('cng') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          'bg-purple-50 text-purple-800 border border-purple-200'
                        }`}>
                          {item.fuelType}
                        </span>
                        <p className="text-[10px] text-slate-400 font-medium">{item.yearRange || 'N/A'}</p>
                      </div>
                    </td>

                    {/* Front Tyre Spec */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-800 px-2 py-1 rounded-md border border-slate-200">
                        {item.frontTyresSpec || 'N/A'}
                      </span>
                    </td>

                    {/* Rear Tyre Spec */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-800 px-2 py-1 rounded-md border border-slate-200">
                        {item.rearTyresSpec || item.frontTyresSpec || 'N/A'}
                      </span>
                    </td>

                    {/* Category Tag */}
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        item.tag.toLowerCase().includes('suv') ? 'bg-amber-100 text-amber-900 border-amber-300' :
                        item.tag.toLowerCase().includes('luxury') ? 'bg-purple-100 text-purple-900 border-purple-300' :
                        item.tag.toLowerCase().includes('hatch') ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                        'bg-slate-100 text-slate-800 border-slate-300'
                      }`}>
                        {item.tag}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setMappingCarItem(item); setSelectedOrderIds([]); }}
                          className="px-2.5 py-1 bg-brand-blue text-white rounded-lg text-[11px] font-bold hover:bg-brand-blue/90 transition-all flex items-center gap-1 shadow-sm"
                          title="Map this vehicle specs to an existing order"
                        >
                          <IconSparkles className="w-3 h-3 text-brand-accent" />
                          <span>Map Order</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setFormData(item);
                            setIsAddModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Vehicle Specs"
                        >
                          <IconEdit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Record"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length > 200 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500 font-semibold">
              Showing top 200 records out of {filteredItems.length.toLocaleString()} matching results. Use search or brand filter to narrow down results.
            </div>
          )}
        </div>
      ) : (
        /* GRID CARD VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.slice(0, 100).map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center flex-shrink-0">
                      {item.logo ? (
                        <img src={item.logo} alt={item.brand} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-xs font-black text-slate-400">{item.brand[0]}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{item.brand}</span>
                      <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{item.model}</h4>
                      <p className="text-xs text-slate-500 font-medium">{item.version || 'Standard'}</p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                    item.tag.toLowerCase().includes('suv') ? 'bg-amber-50 text-amber-800 border-amber-200' :
                    item.tag.toLowerCase().includes('luxury') ? 'bg-purple-50 text-purple-800 border-purple-200' :
                    'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {item.tag}
                  </span>
                </div>

                {/* Car Image Preview */}
                {item.image && (
                  <div className="mt-3 h-28 bg-slate-50 rounded-xl border border-slate-100 p-2 flex items-center justify-center overflow-hidden">
                    <img src={item.image} alt={item.model} className="max-h-full max-w-full object-contain hover:scale-105 transition-transform" />
                  </div>
                )}

                {/* Specs Pill List */}
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Fuel & Year</span>
                    <span className="font-bold text-slate-900">{item.fuelType} ({item.yearRange || 'N/A'})</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Front Tyre Spec</span>
                    <span className="font-mono font-bold text-slate-900">{item.frontTyresSpec || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Rear Tyre Spec</span>
                    <span className="font-mono font-bold text-slate-900">{item.rearTyresSpec || item.frontTyresSpec || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => { setMappingCarItem(item); setSelectedOrderIds([]); }}
                  className="px-3 py-1.5 bg-brand-blue text-white rounded-lg text-xs font-bold hover:bg-brand-blue/90 transition-all flex items-center gap-1.5"
                >
                  <IconSparkles className="w-3.5 h-3.5 text-brand-accent" />
                  <span>Map Order</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingItem(item); setFormData(item); setIsAddModalOpen(true); }}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <IconEdit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Add / Edit Vehicle Form */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-black text-slate-900">
                {editingItem ? 'Edit Vehicle Specification' : 'Add New Vehicle Master Record'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Brand Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.brand}
                    onChange={e => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="e.g. Maruti Suzuki, Hyundai"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Model Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                    placeholder="e.g. Swift, Creta, Nexon"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Variant / Version</label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={e => setFormData({ ...formData, version: e.target.value })}
                    placeholder="e.g. Vxi, SX, Petrol MT"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Fuel Type</label>
                  <select
                    value={formData.fuelType}
                    onChange={e => setFormData({ ...formData, fuelType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric / EV</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Year Range</label>
                  <input
                    type="text"
                    value={formData.yearRange}
                    onChange={e => setFormData({ ...formData, yearRange: e.target.value })}
                    placeholder="e.g. 2018-2024"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category Tag</label>
                  <select
                    value={formData.tag}
                    onChange={e => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl"
                  >
                    <option value="Micro">Micro</option>
                    <option value="Hatch">Hatch</option>
                    <option value="Prime">Prime</option>
                    <option value="CrossOver">CrossOver</option>
                    <option value="Suv">Suv</option>
                    <option value="Luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Front Tyre Spec</label>
                  <input
                    type="text"
                    value={formData.frontTyresSpec}
                    onChange={e => setFormData({ ...formData, frontTyresSpec: e.target.value })}
                    placeholder="e.g. 185 / 65 R15"
                    className="w-full px-3 py-2 border rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Rear Tyre Spec</label>
                  <input
                    type="text"
                    value={formData.rearTyresSpec}
                    onChange={e => setFormData({ ...formData, rearTyresSpec: e.target.value })}
                    placeholder="e.g. 185 / 65 R15"
                    className="w-full px-3 py-2 border rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Brand Logo Image URL</label>
                  <input
                    type="url"
                    value={formData.logo}
                    onChange={e => setFormData({ ...formData, logo: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vehicle Picture URL</label>
                  <input
                    type="url"
                    value={formData.image}
                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-accent text-brand-blue font-extrabold rounded-xl shadow-lg shadow-brand-accent/20"
                >
                  Save Vehicle Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Map Vehicle to Existing Orders */}
      {mappingCarItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                {mappingCarItem.logo && (
                  <img src={mappingCarItem.logo} alt={mappingCarItem.brand} className="w-8 h-8 object-contain" />
                )}
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Map Specs: {mappingCarItem.brand} {mappingCarItem.model} ({mappingCarItem.version || 'Standard'})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Front Tyre: <span className="font-mono font-bold text-slate-800">{mappingCarItem.frontTyresSpec}</span> | Fuel: {mappingCarItem.fuelType}
                  </p>
                </div>
              </div>
              <button onClick={() => setMappingCarItem(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-800">
                Search & Select Existing Orders to Enrich with this Vehicle Data:
              </label>
              <input
                type="text"
                value={mappingSearch}
                onChange={e => setMappingSearch(e.target.value)}
                placeholder="Search order ID, customer name, vehicle number..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {submissions.length === 0 ? (
                  <p className="p-4 text-center text-slate-400">No active orders found in memory.</p>
                ) : (
                  submissions
                    .filter(s => 
                      !mappingSearch ||
                      s.submissionId.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                      `${s.customerFirstName} ${s.customerLastName}`.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                      (s.carNumber || '').toLowerCase().includes(mappingSearch.toLowerCase()) ||
                      (s.carBrandModel || '').toLowerCase().includes(mappingSearch.toLowerCase())
                    )
                    .map(s => {
                      const isChecked = selectedOrderIds.includes(s.submissionId);
                      return (
                        <label key={s.submissionId} className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedOrderIds([...selectedOrderIds, s.submissionId]);
                                } else {
                                  setSelectedOrderIds(selectedOrderIds.filter(id => id !== s.submissionId));
                                }
                              }}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-accent"
                            />
                            <div>
                              <p className="font-bold text-slate-900">{s.customerFirstName} {s.customerLastName} ({s.carNumber || 'No Plate'})</p>
                              <p className="text-[10px] text-slate-500">Order #{s.submissionId} • Current: {s.carBrandModel}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {s.status}
                          </span>
                        </label>
                      );
                    })
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="font-bold text-slate-600">Selected: {selectedOrderIds.length} Order(s)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setMappingCarItem(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMapVehicleToOrders}
                  disabled={selectedOrderIds.length === 0}
                  className="px-4 py-2 bg-brand-blue text-white font-extrabold rounded-xl shadow-md disabled:opacity-40"
                >
                  Map Specs to Orders
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: View Image Detail */}
      {viewingDetailItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 text-base">{viewingDetailItem.brand} {viewingDetailItem.model}</h3>
              <button onClick={() => setViewingDetailItem(null)} className="text-slate-400 font-bold hover:text-slate-600">✕</button>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-center min-h-[220px]">
              <img src={viewingDetailItem.image} alt={viewingDetailItem.model} className="max-h-64 object-contain rounded-xl" />
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={() => setViewingDetailItem(null)} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarDatabasePage;
