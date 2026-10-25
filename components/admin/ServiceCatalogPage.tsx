import React, { useState } from 'react';
import { 
  Plus, Edit2, Trash2, Check, X, ShieldAlert, 
  Map, DollarSign, Settings, Layers, ListFilter, Percent
} from 'lucide-react';
import { 
  AppData, PredefinedService, PredefinedServiceCategory, 
  VehicleCategoryTag, InventoryItem, InventoryMovement
} from '../../types';
import { saveRecord, deleteRecord } from '../../services/cloudDataService';
import { parseRecipeToIngredients } from '../../services/inventoryService';

interface ServiceCatalogPageProps {
  appData: AppData;
  onRefresh: () => Promise<void>;
  sheetsUrl: string;
}

export const ServiceCatalogPage: React.FC<ServiceCatalogPageProps> = ({
  appData,
  onRefresh,
  sheetsUrl
}) => {
  const [activeTab, setActiveTab] = useState<'services' | 'categories' | 'inventory'>('services');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Bulk Inventory Adjustment state
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [bulkActionType, setBulkActionType] = useState<'price' | 'quantity'>('price');
  const [bulkPercentage, setBulkPercentage] = useState<string>('');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  
  // Category CRUD state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryFormName, setCategoryFormName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);

  // Service Form Modal state
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<PredefinedService | null>(null);
  const [serviceFormName, setServiceFormName] = useState('');
  const [serviceFormCategory, setServiceFormCategory] = useState('');
  const [serviceFormEnabled, setServiceFormEnabled] = useState(true);
  const [serviceFormServiceableRadius, setServiceFormServiceableRadius] = useState<number | ''>('');
  const [serviceFormFreeRadius, setServiceFormFreeRadius] = useState<number | ''>('');
  const [serviceFormConvenienceFee, setServiceFormConvenienceFee] = useState<number | ''>('');
  const [serviceFormBaseConvenienceFee, setServiceFormBaseConvenienceFee] = useState<number | ''>('');
  
  // Recipe and costs state
  const [serviceFormRecipe, setServiceFormRecipe] = useState('');
  const [serviceFormMaterialExpense, setServiceFormMaterialExpense] = useState<number | ''>('');
  const [serviceFormFuelExpense, setServiceFormFuelExpense] = useState<number | ''>('');
  const [serviceFormLaborExpense, setServiceFormLaborExpense] = useState<number | ''>('');
  const [serviceFormOtherExpense, setServiceFormOtherExpense] = useState<number | ''>('');
  
  // Dynamic service specific fields (Tyre / Battery Replacement)
  const [serviceFormBrand, setServiceFormBrand] = useState('');
  const [serviceFormModel, setServiceFormModel] = useState('');
  const [serviceFormTyreNumber, setServiceFormTyreNumber] = useState('');
  const [serviceFormBalancingPrice, setServiceFormBalancingPrice] = useState<number | ''>('');
  const [serviceFormExchangeValueDeduction, setServiceFormExchangeValueDeduction] = useState<number | ''>('');
  const [serviceFormHasPhotoRequirement, setServiceFormHasPhotoRequirement] = useState(true);

  // Pricing matrix state for each vehicle tag
  const [vehiclePricing, setVehiclePricing] = useState<Record<string, { price: number; mrp: number }>>({
    [VehicleCategoryTag.Micro]: { price: 0, mrp: 0 },
    [VehicleCategoryTag.Hatch]: { price: 0, mrp: 0 },
    [VehicleCategoryTag.Prime]: { price: 0, mrp: 0 },
    [VehicleCategoryTag.CrossOver]: { price: 0, mrp: 0 },
    [VehicleCategoryTag.Suv]: { price: 0, mrp: 0 },
    [VehicleCategoryTag.Luxury]: { price: 0, mrp: 0 },
  });
  const [selectedServiceForDetails, setSelectedServiceForDetails] = useState<PredefinedService | null>(null);

  const categories = appData.predefinedServiceCategories || [];
  const services = appData.predefinedServices || [];

  // Reset service form
  const resetServiceForm = (service: PredefinedService | null = null) => {
    if (service) {
      setEditingService(service);
      setServiceFormName(service.name);
      setServiceFormCategory(service.categoryId);
      setServiceFormEnabled(service.isEnabled ?? true);
      setServiceFormServiceableRadius(service.serviceableRadiusKm ?? '');
      setServiceFormFreeRadius(service.freeRadiusKm ?? '');
      setServiceFormConvenienceFee(service.convenienceFeePerKm ?? '');
      setServiceFormBaseConvenienceFee(service.baseConvenienceFee ?? '');
      
      setServiceFormRecipe(service.recipe || '');
      setServiceFormMaterialExpense(service.materialExpense ?? '');
      setServiceFormFuelExpense(service.fuelExpense ?? '');
      setServiceFormLaborExpense(service.laborExpense ?? '');
      setServiceFormOtherExpense(service.otherExpense ?? '');
      
      setServiceFormBrand(service.brand || '');
      setServiceFormModel(service.model || '');
      setServiceFormTyreNumber(service.tyreNumber || '');
      setServiceFormBalancingPrice(service.balancingPrice ?? '');
      setServiceFormExchangeValueDeduction(service.exchangeValueDeduction ?? '');
      setServiceFormHasPhotoRequirement(service.hasPhotoRequirement ?? true);

      const initialPricing: Record<string, { price: number; mrp: number }> = {};
      Object.values(VehicleCategoryTag).forEach(tag => {
        initialPricing[tag] = service.pricing?.[tag] || { price: 0, mrp: 0 };
      });
      setVehiclePricing(initialPricing);
    } else {
      setEditingService(null);
      setServiceFormName('');
      setServiceFormCategory(categories[0]?.id || '');
      setServiceFormEnabled(true);
      setServiceFormServiceableRadius('');
      setServiceFormFreeRadius('');
      setServiceFormConvenienceFee('');
      setServiceFormBaseConvenienceFee('');
      
      setServiceFormRecipe('');
      setServiceFormMaterialExpense('');
      setServiceFormFuelExpense('');
      setServiceFormLaborExpense('');
      setServiceFormOtherExpense('');

      setServiceFormBrand('');
      setServiceFormModel('');
      setServiceFormTyreNumber('');
      setServiceFormBalancingPrice('');
      setServiceFormExchangeValueDeduction('');
      setServiceFormHasPhotoRequirement(true);

      const defaultPricing: Record<string, { price: number; mrp: number }> = {};
      Object.values(VehicleCategoryTag).forEach(tag => {
        defaultPricing[tag] = { price: 0, mrp: 0 };
      });
      setVehiclePricing(defaultPricing);
    }
  };

  // Save Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameToUse = editingCategoryId ? categoryFormName.trim() : newCategoryName.trim();
    if (!nameToUse) return;

    setIsSubmittingCategory(true);
    try {
      const categoryId = editingCategoryId || `cat_${Date.now()}`;
      const record: PredefinedServiceCategory = {
        id: categoryId,
        name: nameToUse,
        isEnabled: editingCategoryId ? (categories.find(c => c.id === editingCategoryId)?.isEnabled ?? true) : true
      };

      await saveRecord('PredefinedServiceCategories', record, sheetsUrl);
      setNewCategoryName('');
      setEditingCategoryId(null);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  // Toggle Category Status
  const handleToggleCategory = async (category: PredefinedServiceCategory) => {
    try {
      const updated = { ...category, isEnabled: !category.isEnabled };
      await saveRecord('PredefinedServiceCategories', updated, sheetsUrl);
      await onRefresh();
    } catch (err) {
      alert('Failed to toggle status');
    }
  };

  // Delete Category
  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this category? All services belonging to this category will lose their reference.')) return;
    try {
      await deleteRecord('PredefinedServiceCategories', id, sheetsUrl);
      await onRefresh();
    } catch (err) {
      alert('Failed to delete category');
    }
  };

  // Save Service
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceFormName.trim()) return;

    try {
      const serviceId = editingService?.id || `srv_${Date.now()}`;
      const record: PredefinedService = {
        id: serviceId,
        name: serviceFormName.trim(),
        categoryId: serviceFormCategory,
        isEnabled: serviceFormEnabled,
        pricing: vehiclePricing,
        serviceableRadiusKm: serviceFormServiceableRadius !== '' ? Number(serviceFormServiceableRadius) : undefined,
        freeRadiusKm: serviceFormFreeRadius !== '' ? Number(serviceFormFreeRadius) : undefined,
        convenienceFeePerKm: serviceFormConvenienceFee !== '' ? Number(serviceFormConvenienceFee) : undefined,
        baseConvenienceFee: serviceFormBaseConvenienceFee !== '' ? Number(serviceFormBaseConvenienceFee) : undefined,
        recipe: serviceFormRecipe.trim() || undefined,
        materialExpense: serviceFormMaterialExpense !== '' ? Number(serviceFormMaterialExpense) : undefined,
        fuelExpense: serviceFormFuelExpense !== '' ? Number(serviceFormFuelExpense) : undefined,
        laborExpense: serviceFormLaborExpense !== '' ? Number(serviceFormLaborExpense) : undefined,
        otherExpense: serviceFormOtherExpense !== '' ? Number(serviceFormOtherExpense) : undefined,
        brand: serviceFormBrand.trim() || undefined,
        model: serviceFormModel.trim() || undefined,
        tyreNumber: serviceFormTyreNumber.trim() || undefined,
        balancingPrice: serviceFormBalancingPrice !== '' ? Number(serviceFormBalancingPrice) : undefined,
        exchangeValueDeduction: serviceFormExchangeValueDeduction !== '' ? Number(serviceFormExchangeValueDeduction) : undefined,
        hasPhotoRequirement: serviceFormHasPhotoRequirement,
      };

      await saveRecord('PredefinedServices', record, sheetsUrl);
      setIsServiceModalOpen(false);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save service');
    }
  };

  // Delete Service
  const handleDeleteService = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    try {
      await deleteRecord('PredefinedServices', id, sheetsUrl);
      await onRefresh();
    } catch (err) {
      alert('Failed to delete service');
    }
  };

  const filteredServices = categoryFilter === 'all' 
    ? services 
    : services.filter(s => s.categoryId === categoryFilter);

  return (
    <div className="p-3 sm:p-6 bg-slate-900 min-h-screen text-slate-100">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 sm:pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5 sm:gap-3">
              <Layers className="w-7 h-7 sm:w-8 sm:h-8 text-brand-accent flex-shrink-0" />
              Service Catalog
            </h1>
            <p className="text-slate-400 mt-1 text-xs sm:text-sm">
              Define vehicle type wise pricing, serviceable zones, and convenience fee structures.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                resetServiceForm();
                setIsServiceModalOpen(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent/90 text-brand-blue font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-accent/10 text-sm"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
              Add Predefined Service
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-800 overflow-x-auto hide-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          <button
            onClick={() => setActiveTab('services')}
            className={`px-4 sm:px-6 py-3 font-semibold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'services'
                ? 'border-brand-accent text-brand-accent bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Services Catalog ({services.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 sm:px-6 py-3 font-semibold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'categories'
                ? 'border-brand-accent text-brand-accent bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Categories ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-4 sm:px-6 py-3 font-semibold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'inventory'
                ? 'border-brand-accent text-brand-accent bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Inventory Ledger ({(appData.inventoryItems || []).length})
          </button>
        </div>

        {/* Tab content: SERVICES */}
        {activeTab === 'services' && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* Filter controls */}
            <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm font-medium flex-shrink-0">
                <ListFilter className="w-4 h-4 text-brand-accent" />
                Filter by Category:
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar w-full pb-1 sm:pb-0">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap flex-shrink-0 ${
                    categoryFilter === 'all'
                      ? 'bg-brand-accent text-brand-blue'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap flex-shrink-0 ${
                      categoryFilter === cat.id
                        ? 'bg-brand-accent text-brand-blue'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Services Grid */}
            {filteredServices.length === 0 ? (
              <div className="bg-slate-800/20 border border-slate-800 p-8 sm:p-12 text-center rounded-2xl">
                <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base sm:text-lg font-bold text-slate-300">No Services Found</h3>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">Get started by creating a predefined service.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {filteredServices.map(service => {
                  const parentCategory = categories.find(c => c.id === service.categoryId);
                  return (
                    <div 
                      key={service.id}
                      className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <div 
                            onClick={() => setSelectedServiceForDetails(service)}
                            className="cursor-pointer group flex-1"
                            title="Click to view full recipe and expense details"
                          >
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 group-hover:border-slate-500 transition">
                              {parentCategory?.name || 'Uncategorized'}
                            </span>
                            <h3 className="text-xl font-bold text-white mt-1.5 group-hover:text-brand-accent transition flex items-center gap-1.5">
                              {service.name}
                              <span className="text-xs font-normal text-slate-500 group-hover:text-slate-400 transition">(view details)</span>
                            </h3>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${service.isEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`}></span>
                            <span className="text-xs text-slate-400 font-semibold">{service.isEnabled ? 'Active' : 'Disabled'}</span>
                          </div>
                        </div>

                        {/* Travel Config summary */}
                        <div className="bg-slate-800/40 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs border border-slate-800/80">
                          <div>
                            <span className="text-slate-500 block mb-0.5">Serviceable Radius</span>
                            <strong className="text-slate-200 flex items-center gap-1">
                              <Map className="w-3.5 h-3.5 text-brand-accent" />
                              {service.serviceableRadiusKm ? `${service.serviceableRadiusKm} Km` : 'Unlimited'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block mb-0.5">Free Radius</span>
                            <strong className="text-slate-200">
                              {service.freeRadiusKm ? `${service.freeRadiusKm} Km` : '0 Km (Standard)'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block mb-0.5">Base Conv. Fee</span>
                            <strong className="text-slate-200 flex items-center gap-0.5">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                              ₹{service.baseConvenienceFee || 0}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block mb-0.5">Fee Per Extra Km</span>
                            <strong className="text-slate-200">
                              ₹{service.convenienceFeePerKm || 0} / Km
                            </strong>
                          </div>
                        </div>

                        {/* Vehicle pricing matrix summary */}
                        <div className="space-y-1.5 pt-2">
                          <span className="text-xs font-bold text-slate-400 block tracking-wider uppercase">Vehicle Pricing Matrix</span>
                          <div className="grid grid-cols-3 gap-2">
                            {Object.values(VehicleCategoryTag).map(tag => {
                              const pricing = service.pricing?.[tag] || { price: 0, mrp: 0 };
                              return (
                                <div key={tag} className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 text-center">
                                  <span className="text-[10px] font-bold text-slate-500 block truncate">{tag}</span>
                                  <div className="text-xs font-bold text-white mt-1">₹{pricing.price || 0}</div>
                                  <div className="text-[9px] text-slate-500 line-through">₹{pricing.mrp || 0}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Product Recipe & Expense details */}
                        {(service.recipe || service.materialExpense !== undefined || service.fuelExpense !== undefined || service.laborExpense !== undefined || service.otherExpense !== undefined) && (
                          <div className="bg-slate-800/20 rounded-xl p-3 border border-slate-800/60 space-y-2 mt-2">
                            {service.recipe && (
                              <div>
                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block mb-0.5">Product Recipe / Service Materials</span>
                                <p className="text-xs text-slate-300 italic bg-slate-900/40 p-2 rounded border border-slate-800/50 whitespace-pre-wrap">{service.recipe}</p>
                              </div>
                            )}
                            
                            {(service.materialExpense !== undefined || service.fuelExpense !== undefined || service.laborExpense !== undefined || service.otherExpense !== undefined) && (
                              <div>
                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block mb-1">Fixed + Variable Expenses</span>
                                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                  {service.materialExpense !== undefined && (
                                    <div className="bg-slate-900/30 px-2 py-1 rounded border border-slate-800/40 flex justify-between">
                                      <span className="text-slate-400">Material Cost:</span>
                                      <strong className="text-slate-200">₹{service.materialExpense}</strong>
                                    </div>
                                  )}
                                  {service.fuelExpense !== undefined && (
                                    <div className="bg-slate-900/30 px-2 py-1 rounded border border-slate-800/40 flex justify-between">
                                      <span className="text-slate-400">Fuel Cost:</span>
                                      <strong className="text-slate-200">₹{service.fuelExpense}</strong>
                                    </div>
                                  )}
                                  {service.laborExpense !== undefined && (
                                    <div className="bg-slate-900/30 px-2 py-1 rounded border border-slate-800/40 flex justify-between">
                                      <span className="text-slate-400">Labor Cost:</span>
                                      <strong className="text-slate-200">₹{service.laborExpense}</strong>
                                    </div>
                                  )}
                                  {service.otherExpense !== undefined && (
                                    <div className="bg-slate-900/30 px-2 py-1 rounded border border-slate-800/40 flex justify-between">
                                      <span className="text-slate-400">Other Cost:</span>
                                      <strong className="text-slate-200">₹{service.otherExpense}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            resetServiceForm(service);
                            setIsServiceModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit Settings
                        </button>
                        <button
                          onClick={() => handleDeleteService(service.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-950/40 hover:bg-red-950/80 text-red-400 rounded-lg transition border border-red-900/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab content: CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Create Category Panel */}
            <div className="bg-slate-800/30 border border-slate-800 p-5 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand-accent" />
                Add Category
              </h3>
              
              <form onSubmit={handleSaveCategory} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Category Name</label>
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Premium Coating, Dry Washing"
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-brand-accent text-white"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmittingCategory}
                  className="w-full flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent/90 disabled:bg-slate-800 text-brand-blue font-bold py-2 px-4 rounded-xl transition text-sm shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  Create Category
                </button>
              </form>
            </div>

            {/* Categories List */}
            <div className="lg:col-span-2 bg-slate-800/20 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                <h3 className="text-sm font-bold text-slate-300">Active Categories List</h3>
              </div>
              
              <div className="divide-y divide-slate-800">
                {categories.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">No categories registered yet.</div>
                ) : (
                  categories.map(category => (
                    <div key={category.id} className="p-4 flex items-center justify-between hover:bg-slate-800/10 transition">
                      {editingCategoryId === category.id ? (
                        <form onSubmit={handleSaveCategory} className="flex-1 flex items-center gap-3">
                          <input
                            type="text"
                            required
                            value={categoryFormName}
                            onChange={(e) => setCategoryFormName(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-accent text-white"
                          />
                          <button
                            type="submit"
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <span className="font-bold text-white">{category.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleCategory(category)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition ${
                                  category.isEnabled 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}
                              >
                                {category.isEnabled ? 'Enabled' : 'Disabled'}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingCategoryId(category.id);
                                setCategoryFormName(category.name);
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                              title="Rename Category"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(category.id)}
                              className="p-1.5 bg-red-950/30 hover:bg-red-950/80 text-red-500 rounded-lg transition"
                              title="Delete Category"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab content: INVENTORY */}
        {activeTab === 'inventory' && (() => {
          const items = appData.inventoryItems || [];
          const movements = [...(appData.inventoryMovements || [])].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          return (
            <div className="space-y-8">
              
              {/* Introduction Banner */}
              <div className="bg-slate-800/20 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-brand-accent"></span>
                    Detailing Material Inventory & Auto-Consumption Ledger
                  </h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-2xl">
                    Track detailing materials, liquids, and tools. When a service job is marked as Completed, ingredients specified in its recipe are automatically deducted from this ledger, and logged below.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs bg-slate-800 text-slate-300 font-bold px-3 py-1.5 rounded-xl border border-slate-700">
                    Total Items tracked: {items.length}
                  </span>
                </div>
              </div>

              {/* Bulk Adjustment Panel */}
              <div className="bg-slate-800/40 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Percent className="w-4 h-4 text-brand-accent" />
                      Bulk Inventory Adjustments
                    </h4>
                    <p className="text-slate-400 text-xs font-medium">
                      Select multiple items using the checkboxes below, then apply a percentage price (cost) or quantity change in a single action.
                    </p>
                  </div>
                  
                  {/* Selection controls */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedInventoryIds.length === items.length) {
                          setSelectedInventoryIds([]);
                        } else {
                          setSelectedInventoryIds(items.map(i => i.id));
                        }
                      }}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-brand-accent" />
                      {selectedInventoryIds.length === items.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedInventoryIds.length > 0 && (
                      <span className="text-xs bg-brand-accent/10 border border-brand-accent/20 text-brand-accent px-3 py-1.5 rounded-xl font-bold font-mono">
                        {selectedInventoryIds.length} Selected
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-800/40">
                  {/* Action Type */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Adjustment Target</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkActionType('price')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer ${
                          bulkActionType === 'price'
                            ? 'bg-brand-accent border-brand-accent text-brand-blue'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        Cost/Price
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkActionType('quantity')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer ${
                          bulkActionType === 'quantity'
                            ? 'bg-brand-accent border-brand-accent text-brand-blue'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        Stock Qty
                      </button>
                    </div>
                  </div>

                  {/* Percentage Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Percentage Change (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="e.g. +10, -5, +2.5"
                        value={bulkPercentage}
                        onChange={(e) => setBulkPercentage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-accent font-mono text-center"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">%</span>
                    </div>
                  </div>

                  {/* Description preview */}
                  <div className="flex flex-col justify-end text-[11px] text-slate-400 font-medium px-1">
                    {bulkPercentage && !isNaN(parseFloat(bulkPercentage)) ? (
                      <span className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 block leading-normal">
                        Will {parseFloat(bulkPercentage) >= 0 ? 'increase' : 'decrease'} {bulkActionType === 'price' ? 'unit cost' : 'current stock'} of {selectedInventoryIds.length} selected items by <strong className="text-white font-mono">{Math.abs(parseFloat(bulkPercentage))}%</strong>.
                      </span>
                    ) : (
                      <span className="italic text-slate-500 text-center py-2">
                        Enter a percentage and select items to proceed.
                      </span>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={isBulkSubmitting || selectedInventoryIds.length === 0 || !bulkPercentage || isNaN(parseFloat(bulkPercentage))}
                      onClick={async () => {
                        const pct = parseFloat(bulkPercentage);
                        if (isNaN(pct)) return;
                        setIsBulkSubmitting(true);
                        try {
                          const multiplier = 1 + (pct / 100);
                          let count = 0;
                          
                          for (const itemId of selectedInventoryIds) {
                            const item = items.find(i => i.id === itemId);
                            if (!item) continue;
                            
                            if (bulkActionType === 'price') {
                              const currentCost = item.costPerUnit || 0;
                              const newCost = Math.max(0, parseFloat((currentCost * multiplier).toFixed(2)));
                              
                              const updatedItem: InventoryItem = {
                                ...item,
                                costPerUnit: newCost
                              };
                              await saveRecord('InventoryItems', updatedItem, sheetsUrl);
                              count++;
                            } else {
                              const currentStock = item.stock;
                              const newStock = Math.max(0, Math.round(currentStock * multiplier));
                              const diff = newStock - currentStock;
                              
                              const updatedItem: InventoryItem = {
                                ...item,
                                stock: newStock
                              };
                              await saveRecord('InventoryItems', updatedItem, sheetsUrl);
                              
                              if (diff !== 0) {
                                const mvtRecord: InventoryMovement = {
                                  id: `mvt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                                  itemId: item.id,
                                  itemName: item.name,
                                  change: diff,
                                  unit: item.unit,
                                  reason: `Bulk stock adjustment (${pct >= 0 ? '+' : ''}${pct}%)`,
                                  timestamp: new Date().toISOString()
                                };
                                await saveRecord('InventoryMovements', mvtRecord, sheetsUrl);
                              }
                              count++;
                            }
                          }
                          
                          setSelectedInventoryIds([]);
                          setBulkPercentage('');
                          await onRefresh();
                          alert(`Successfully adjusted ${count} items!`);
                        } catch (err) {
                          alert("Failed to apply bulk adjustment: " + (err instanceof Error ? err.message : err));
                        } finally {
                          setIsBulkSubmitting(false);
                        }
                      }}
                      className="w-full bg-brand-accent hover:bg-brand-accent/90 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-800 disabled:cursor-not-allowed border border-brand-accent text-brand-blue font-black py-2.5 px-4 rounded-xl text-xs transition uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer animate-pulse-subtle"
                    >
                      {isBulkSubmitting ? 'Applying...' : 'Apply Bulk Change'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {items.map(item => {
                  const isLow = item.stock <= (item.unit === 'pcs' ? 2 : 200);
                  const isCritical = item.stock <= 0;
                  const isSelected = selectedInventoryIds.includes(item.id);

                  return (
                    <div 
                      key={item.id}
                      className={`bg-slate-800/30 border rounded-2xl p-5 space-y-4 transition hover:border-slate-700 flex flex-col justify-between ${
                        isSelected 
                          ? 'border-brand-accent bg-brand-accent/5 shadow-lg shadow-brand-accent/5' 
                          : isCritical ? 'border-red-900/50 bg-red-950/5' : isLow ? 'border-amber-900/30 bg-amber-950/5' : 'border-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedInventoryIds(selectedInventoryIds.filter(id => id !== item.id));
                                } else {
                                  setSelectedInventoryIds([...selectedInventoryIds, item.id]);
                                }
                              }}
                              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-accent focus:ring-brand-accent focus:ring-offset-slate-900 cursor-pointer accent-brand-accent"
                            />
                            <h4 className="text-base font-bold text-white">{item.name}</h4>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isCritical ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            isLow ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {isCritical ? 'Out of Stock' : isLow ? 'Low Stock' : 'Good Stock'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-baseline pt-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-white font-mono">{item.stock}</span>
                            <span className="text-slate-400 text-xs font-semibold uppercase">{item.unit}</span>
                          </div>
                          {item.costPerUnit !== undefined && (
                            <div className="text-right">
                              <span className="text-xs text-slate-500 font-bold">Cost:</span>{' '}
                              <span className="text-sm font-bold text-slate-200 font-mono">₹{item.costPerUnit}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Manual Adjustment form */}
                      <div className="pt-3 border-t border-slate-800/60 space-y-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Quick Restock / Adjust</span>
                        <form 
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const input = form.querySelector('input') as HTMLInputElement;
                            const adjustment = parseInt(input.value);
                            if (isNaN(adjustment) || adjustment === 0) return;

                            try {
                              const updatedStock = Math.max(0, item.stock + adjustment);
                              
                              // Create InventoryMovement
                              const mvtRecord: InventoryMovement = {
                                id: `mvt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                                itemId: item.id,
                                itemName: item.name,
                                change: adjustment,
                                unit: item.unit,
                                reason: adjustment > 0 ? "Manual Restock (Received Supplies)" : "Manual Inventory Adjustment / Correction",
                                timestamp: new Date().toISOString()
                              };

                              // Update InventoryItem
                              const updatedItem: InventoryItem = {
                                ...item,
                                stock: updatedStock
                              };

                              await saveRecord('InventoryItems', updatedItem, sheetsUrl);
                              await saveRecord('InventoryMovements', mvtRecord, sheetsUrl);
                              
                              input.value = '';
                              await onRefresh();
                            } catch (err) {
                              alert("Failed to update inventory: " + (err instanceof Error ? err.message : err));
                            }
                          }}
                          className="flex gap-2"
                        >
                          <input 
                            type="number"
                            placeholder="e.g. +500 or -100"
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-accent text-center font-mono"
                          />
                          <button 
                            type="submit"
                            className="bg-brand-accent hover:bg-brand-accent/90 text-brand-blue font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
                          >
                            Update
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Movement Logs History */}
              <div className="bg-slate-800/20 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Inventory Movements History Ledger</h3>
                  <span className="text-[10px] text-slate-500 font-bold">Showing {movements.length} logged changes</span>
                </div>

                <div className="overflow-x-auto">
                  {movements.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 text-xs italic">
                      No stock movements recorded yet. Movements will automatically list here when orders are Completed or manual restocks are submitted.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-500 uppercase font-bold tracking-wider">
                          <th className="p-3">Timestamp</th>
                          <th className="p-3">Material / Item</th>
                          <th className="p-3">Quantity Changed</th>
                          <th className="p-3">Reason / Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {movements.slice(0, 100).map(mvt => {
                          const isAddition = mvt.change > 0;
                          return (
                            <tr key={mvt.id} className="hover:bg-slate-800/10 transition">
                              <td className="p-3 text-slate-500 font-mono">
                                {new Date(mvt.timestamp).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="p-3 font-bold text-white">{mvt.itemName}</td>
                              <td className="p-3 font-mono">
                                <span className={`font-bold px-2 py-0.5 rounded ${
                                  isAddition ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                  {isAddition ? '+' : ''}{mvt.change} {mvt.unit}
                                </span>
                              </td>
                              <td className="p-3 text-slate-300">{mvt.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Modal: Add/Edit Predefined Service */}
        {isServiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
              
              <div className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20 sticky top-0 backdrop-blur z-10">
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-brand-accent flex-shrink-0" />
                  <span className="truncate">{editingService ? 'Edit Predefined Service' : 'Add Predefined Service'}</span>
                </h3>
                <button
                  onClick={() => setIsServiceModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveService} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                
                {/* Core parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Service Name</label>
                    <input
                      type="text"
                      required
                      value={serviceFormName}
                      onChange={(e) => setServiceFormName(e.target.value)}
                      placeholder="e.g. Ceramic Protection, Eco Wash"
                      className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Category Association</label>
                    <select
                      required
                      value={serviceFormCategory}
                      onChange={(e) => setServiceFormCategory(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Serviceable Radius, Free Radius, and convenience fee inputs */}
                <div className="bg-slate-800/20 border border-slate-800/80 rounded-2xl p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <h4 className="text-xs sm:text-sm font-bold text-brand-accent flex items-center gap-2">
                    <Map className="w-4 h-4 flex-shrink-0" />
                    Serviceable Area & Convenience Charges
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Serviceable Radius (Km)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormServiceableRadius}
                        onChange={(e) => setServiceFormServiceableRadius(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 25"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Blank = unlimited</span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Free Radius (Km)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormFreeRadius}
                        onChange={(e) => setServiceFormFreeRadius(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 15"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Blank = 0 Km</span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Base Conv. Charge (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormBaseConvenienceFee}
                        onChange={(e) => setServiceFormBaseConvenienceFee(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 50"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Flat base fee</span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Fee Per Extra Km (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormConvenienceFee}
                        onChange={(e) => setServiceFormConvenienceFee(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 6"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Charge per km</span>
                    </div>
                  </div>
                </div>

                {/* Tyre / Battery / Dynamic Service Configuration */}
                <div className="bg-slate-800/20 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                  <h4 className="text-sm font-bold text-brand-accent flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Dynamic Product Specifications (Tyre / Battery Services)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Configure default brand, model, tyre specifications, wheel balancing charges, or battery trade-in deductions for this catalog service.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Brand Name</label>
                      <input
                        type="text"
                        value={serviceFormBrand}
                        onChange={(e) => setServiceFormBrand(e.target.value)}
                        placeholder="e.g. Bridgestone / Exide"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Model Name / Series</label>
                      <input
                        type="text"
                        value={serviceFormModel}
                        onChange={(e) => setServiceFormModel(e.target.value)}
                        placeholder="e.g. Turanza T005 / Matrix DIN55"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Tyre Number / Size Code</label>
                      <input
                        type="text"
                        value={serviceFormTyreNumber}
                        onChange={(e) => setServiceFormTyreNumber(e.target.value)}
                        placeholder="e.g. 185/65 R15"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Balancing Price per Tyre (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormBalancingPrice}
                        onChange={(e) => setServiceFormBalancingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 150"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Old Battery Trade-in Deduction (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={serviceFormExchangeValueDeduction}
                        onChange={(e) => setServiceFormExchangeValueDeduction(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 500"
                        className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2 sm:pt-4">
                      <input
                        type="checkbox"
                        id="hasPhotoReq"
                        checked={serviceFormHasPhotoRequirement}
                        onChange={(e) => setServiceFormHasPhotoRequirement(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-brand-accent focus:ring-brand-accent cursor-pointer"
                      />
                      <label htmlFor="hasPhotoReq" className="text-xs font-semibold text-slate-300 cursor-pointer">
                        Require Photo Upload (DOT / Serial / Battery Photo)
                      </label>
                    </div>
                  </div>
                </div>

                {/* VEHICLE TYPE WISE PRICING */}
                <div className="space-y-3 sm:space-y-4">
                  <h4 className="text-xs sm:text-sm font-bold text-brand-accent flex items-center gap-2">
                    <DollarSign className="w-4 h-4 flex-shrink-0" />
                    Vehicle Type Wise Pricing
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {Object.values(VehicleCategoryTag).map(tag => {
                      const pricing = vehiclePricing[tag] || { price: 0, mrp: 0 };
                      return (
                        <div key={tag} className="bg-slate-800/40 border border-slate-800 p-3 sm:p-4 rounded-xl space-y-2.5 sm:space-y-3">
                          <span className="font-bold text-white text-xs block tracking-wider uppercase border-b border-slate-800 pb-1">{tag}</span>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Price (₹)</label>
                              <input
                                type="number"
                                min="0"
                                required
                                value={pricing.price}
                                onChange={(e) => setVehiclePricing({
                                  ...vehiclePricing,
                                  [tag]: { ...pricing, price: Number(e.target.value) }
                                })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">MRP (₹)</label>
                              <input
                                type="number"
                                min="0"
                                required
                                value={pricing.mrp}
                                onChange={(e) => setVehiclePricing({
                                  ...vehiclePricing,
                                  [tag]: { ...pricing, mrp: Number(e.target.value) }
                                })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detailing Recipe & Stock Material Selector */}
                <div className="bg-slate-800/30 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Detailing Recipe & Material Stock Selection
                    </label>
                    <span className="text-[10px] text-slate-400">Select items directly from available stock</span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      onChange={(e) => {
                        const itemId = e.target.value;
                        if (!itemId) return;
                        const item = (appData.inventoryItems || []).find(i => i.id === itemId);
                        if (item) {
                          const addStr = `${item.name}: 1 ${item.unit || 'ml'}`;
                          setServiceFormRecipe(prev => prev ? `${prev}\n${addStr}` : addStr);
                          if (item.costPerUnit) {
                            setServiceFormMaterialExpense(prev => Number(prev || 0) + item.costPerUnit);
                          }
                        }
                        e.target.value = '';
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-accent font-semibold"
                    >
                      <option value="">+ Choose Material from Available Stock...</option>
                      {(appData.inventoryItems || []).map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (In Stock: {item.stock} {item.unit}) - ₹{item.costPerUnit}/{item.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      value={serviceFormRecipe}
                      onChange={(e) => setServiceFormRecipe(e.target.value)}
                      placeholder="e.g. Car Shampoo: 100 ml&#10;Tyre Shine: 40 ml"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-brand-accent font-mono leading-relaxed"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Material ingredients specified above are automatically deducted from stock inventory whenever job cards for this service are completed.
                    </p>
                  </div>
                </div>

                {/* Status toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="serviceFormEnabled"
                    checked={serviceFormEnabled}
                    onChange={(e) => setServiceFormEnabled(e.target.checked)}
                    className="h-4.5 w-4.5 bg-slate-800 rounded border-slate-800 text-brand-accent focus:ring-brand-accent"
                  />
                  <label htmlFor="serviceFormEnabled" className="text-sm font-semibold text-slate-200 cursor-pointer select-none">
                    Enable this service in order creation forms
                  </label>
                </div>

                {/* Modal footer buttons */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-5">
                  <button
                    type="button"
                    onClick={() => setIsServiceModalOpen(false)}
                    className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-sm font-bold bg-brand-accent hover:bg-brand-accent/90 text-brand-blue rounded-xl transition shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

        {/* Modal: Product/Service Details */}
        {selectedServiceForDetails && (() => {
          const service = selectedServiceForDetails;
          const parentCategory = categories.find(c => c.id === service.categoryId);
          const parsedIngredients = parseRecipeToIngredients(service.recipe || '');
          const totalExpenses = Number((
            (service.materialExpense || 0) + 
            (service.fuelExpense || 0) + 
            (service.laborExpense || 0) + 
            (service.otherExpense || 0)
          ).toFixed(2));

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20 sticky top-0 backdrop-blur">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-brand-accent border border-slate-700">
                      {parentCategory?.name || 'Uncategorized'}
                    </span>
                    <h3 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                      <Layers className="w-6 h-6 text-brand-accent" />
                      {service.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedServiceForDetails(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Left: Recipe & Materials */}
                    <div className="space-y-4">
                      <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
                        <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                          Detailing Recipe & Materials
                        </h4>
                        
                        {service.recipe ? (
                          <div className="space-y-3">
                            <p className="text-xs text-slate-400 font-semibold mb-1">Catalog Recipe Text:</p>
                            <blockquote className="text-xs text-slate-300 italic bg-slate-950/50 p-3 rounded-xl border border-slate-800 whitespace-pre-wrap leading-relaxed">
                              {service.recipe}
                            </blockquote>

                            <div className="pt-2">
                              <p className="text-xs text-slate-400 font-semibold mb-2">Parsed Ingredients (Auto-consumption mapping):</p>
                              {parsedIngredients.length > 0 ? (
                                <div className="space-y-2">
                                  {parsedIngredients.map((ing, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-800/30 border border-slate-800/60 p-2.5 rounded-xl text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded bg-brand-accent"></span>
                                        <span className="text-slate-200 font-bold">{ing.itemName}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono text-[10px]">
                                          {ing.quantity} {ing.unit}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">No exact ingredients parsed. Text recipe will be shown only.</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-950/40 p-4 text-center rounded-xl border border-slate-800">
                            <p className="text-xs text-slate-500 italic">No recipe specified for this product.</p>
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                          Service Limits & Radius
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-slate-800/20 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">Serviceable Radius</span>
                            <strong className="text-slate-200">{service.serviceableRadiusKm ? `${service.serviceableRadiusKm} Km` : 'Unlimited'}</strong>
                          </div>
                          <div className="bg-slate-800/20 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">Free Radius</span>
                            <strong className="text-slate-200">{service.freeRadiusKm ? `${service.freeRadiusKm} Km` : '0 Km'}</strong>
                          </div>
                          <div className="bg-slate-800/20 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">Base Conv. Fee</span>
                            <strong className="text-slate-200">₹{service.baseConvenienceFee || 0}</strong>
                          </div>
                          <div className="bg-slate-800/20 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">Extra Charge / Km</span>
                            <strong className="text-slate-200">₹{service.convenienceFeePerKm || 0}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Expenses & Margins */}
                    <div className="space-y-4">
                      <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
                        <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-red-500"></span>
                          Predefined Cost Breakdown
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-slate-800/30 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400">Material Expense</span>
                            <strong className="text-slate-200">₹{service.materialExpense || 0}</strong>
                          </div>
                          <div className="bg-slate-800/30 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400">Fuel Expense</span>
                            <strong className="text-slate-200">₹{service.fuelExpense || 0}</strong>
                          </div>
                          <div className="bg-slate-800/30 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400">Labor Expense</span>
                            <strong className="text-slate-200">₹{service.laborExpense || 0}</strong>
                          </div>
                          <div className="bg-slate-800/30 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400">Other Expense</span>
                            <strong className="text-slate-200">₹{service.otherExpense || 0}</strong>
                          </div>
                        </div>

                        <div className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center mt-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Defined Service Cost:</span>
                          <strong className="text-base font-black text-brand-accent">₹{totalExpenses}</strong>
                        </div>
                      </div>

                      {/* Margin Analysis */}
                      <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                          Gross Margin Analysis
                        </h4>
                        
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {Object.values(VehicleCategoryTag).map(tag => {
                            const pricing = service.pricing?.[tag] || { price: 0, mrp: 0 };
                            const price = pricing.price || 0;
                            const margin = price > 0 ? Number((((price - totalExpenses) / price) * 100).toFixed(1)) : 0;
                            const isPositive = margin >= 0;

                            return (
                              <div key={tag} className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between text-xs">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-white uppercase tracking-wider">{tag}</span>
                                  <span className="text-[10px] text-slate-500 block">Price: ₹{price} | MRP: ₹{pricing.mrp || 0}</span>
                                </div>
                                <div className="text-right">
                                  {price > 0 ? (
                                    <>
                                      <span className={`font-mono font-bold block ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isPositive ? '+' : ''}{margin}% Margin
                                      </span>
                                      <span className="text-[9px] text-slate-500">Profit: ₹{(price - totalExpenses).toFixed(2)}</span>
                                    </>
                                  ) : (
                                    <span className="text-slate-500 italic text-[10px]">No Price Set</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-800 flex justify-end bg-slate-800/10">
                  <button
                    onClick={() => setSelectedServiceForDetails(null)}
                    className="px-6 py-2.5 text-sm font-bold bg-brand-accent hover:bg-brand-accent/90 text-brand-blue rounded-xl transition shadow-lg"
                  >
                    Close Product Details
                  </button>
                </div>

              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default ServiceCatalogPage;
