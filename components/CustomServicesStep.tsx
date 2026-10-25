

import React from 'react';
// FIX: Removed obsolete 'PredefinedAddon' import.
import { Service, CustomService, UserSubscription, ServiceTemplate, PricingConfig, BaseStepProps } from '../types';
import Input from './ui/Input';
import Button from './ui/Button';
import { IconPlus, IconTrash } from './ui/Icon';
import { ValidationErrors } from '../services/validationService';

const CustomServicesStep: React.FC<BaseStepProps> = ({ 
  state, 
  dispatch, 
  errors, 
  updateField, 
  predefinedServices = [], 
  predefinedServiceCategories = [] 
}) => {
  const handleAddService = () => {
    dispatch({ type: 'ADD_CUSTOM_SERVICE' });
  };

  const handleRemoveService = (index: number) => {
    dispatch({ type: 'REMOVE_CUSTOM_SERVICE', index });
  };

  const handleUpdateService = (index: number, field: keyof CustomService, value: any) => {
    dispatch({ type: 'UPDATE_CUSTOM_SERVICE', index, field, value });
  };

  const enabledCategories = (predefinedServiceCategories || []).filter(c => c.isEnabled);
  const enabledServices = (predefinedServices || []).filter(s => s.isEnabled);
  const currentCategoryTag = state.vehicleCategoryTag || 'Hatch';

  const getServicePrice = (service: any) => {
    return service.pricing?.[currentCategoryTag]?.price ?? 0;
  };

  const handleTogglePredefinedService = (service: any) => {
    const isSelected = state.customServices.some(cs => cs.serviceDescription === service.name);
    if (isSelected) {
      const updated = state.customServices.filter(cs => cs.serviceDescription !== service.name);
      updateField('customServices', updated);
    } else {
      const price = getServicePrice(service);
      const newService: CustomService = {
        customServiceId: `CS-PRE-${service.id}-${Date.now()}`,
        relatedServiceId: state.submissionId,
        serviceDescription: service.name,
        amount: price
      };
      updateField('customServices', [...state.customServices, newService]);
    }
  };

  // Group predefined services by category
  const categoriesMap = new Map<string, any>();
  enabledCategories.forEach(c => categoriesMap.set(c.id, { ...c, services: [] }));
  
  const uncategorizedServices: any[] = [];
  
  enabledServices.forEach(s => {
    const cat = categoriesMap.get(s.categoryId);
    if (cat) {
      cat.services.push(s);
    } else {
      uncategorizedServices.push(s);
    }
  });

  const groupedCategories = Array.from(categoriesMap.values()).filter(c => c.services.length > 0);
  
  return (
    <div className="space-y-6">
      {/* Predefined Services Section */}
      {enabledServices.length > 0 && (
        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">Predefined Service Catalog</h3>
              <p className="text-xs text-slate-500 font-medium">Select predefined packages with automatic pricing for <span className="font-semibold text-brand-blue">{currentCategoryTag}</span>.</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full uppercase tracking-wider flex-shrink-0">
              {currentCategoryTag}
            </span>
          </div>

          <div className="space-y-3 sm:space-y-4 max-h-[350px] overflow-y-auto pr-1">
            {groupedCategories.map(cat => (
              <div key={cat.id} className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{cat.name}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.services.map((service: any) => {
                    const price = getServicePrice(service);
                    const isSelected = state.customServices.some(cs => cs.serviceDescription === service.name);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleTogglePredefinedService(service)}
                        className={`p-3 text-left rounded-xl border-2 flex items-center justify-between transition-all duration-200 cursor-pointer ${
                          isSelected 
                          ? 'bg-brand-accent/10 border-brand-accent ring-2 ring-brand-accent/50 shadow-sm' 
                          : 'bg-slate-50 border-slate-200 hover:border-brand-accent/50 hover:bg-white'
                        }`}
                        id={`predefined-svc-${service.id}`}
                      >
                        <div className="pr-2 truncate">
                          <p className={`font-bold text-xs sm:text-sm truncate ${isSelected ? 'text-brand-blue' : 'text-slate-700'}`}>{service.name}</p>
                          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">₹{price.toLocaleString()}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-slate-300 bg-white'}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-brand-blue stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {uncategorizedServices.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">General Services</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {uncategorizedServices.map((service: any) => {
                    const price = getServicePrice(service);
                    const isSelected = state.customServices.some(cs => cs.serviceDescription === service.name);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleTogglePredefinedService(service)}
                        className={`p-3 text-left rounded-xl border-2 flex items-center justify-between transition-all duration-200 cursor-pointer ${
                          isSelected 
                          ? 'bg-brand-accent/10 border-brand-accent ring-2 ring-brand-accent/50 shadow-sm' 
                          : 'bg-slate-50 border-slate-200 hover:border-brand-accent/50 hover:bg-white'
                        }`}
                        id={`predefined-svc-${service.id}`}
                      >
                        <div className="pr-2 truncate">
                          <p className={`font-bold text-xs sm:text-sm truncate ${isSelected ? 'text-brand-blue' : 'text-slate-700'}`}>{service.name}</p>
                          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">₹{price.toLocaleString()}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-slate-300 bg-white'}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-brand-blue stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual / Other Custom Services Section */}
      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 sm:space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-800">Additional Custom Services</h3>
          <p className="text-xs text-slate-500 font-medium">Add any customized, on-demand services not available in the catalog.</p>
        </div>

        <div className="space-y-3">
          {(state.customServices || []).map((service, index) => (
            <div key={service.customServiceId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-2">
                  <div className="flex-grow">
                      <Input
                        label="Service Description"
                        id={`custom-desc-${index}`}
                        value={service.serviceDescription}
                        onChange={(e) => handleUpdateService(index, 'serviceDescription', e.target.value)}
                        error={errors.customServices?.[index]?.serviceDescription}
                      />
                  </div>
                  <div className="flex items-end gap-2 w-full sm:w-auto">
                    <div className="flex-grow sm:w-40">
                        <Input
                          label="Amount (₹)"
                          id={`custom-amt-${index}`}
                          type="number"
                          value={service.amount}
                          onChange={(e) => handleUpdateService(index, 'amount', parseFloat(e.target.value) || 0)}
                          error={errors.customServices?.[index]?.amount}
                        />
                    </div>
                    <div className="flex-shrink-0">
                        <Button 
                          variant="danger" 
                          size="sm"
                          onClick={() => handleRemoveService(index)} 
                          className="p-2 h-10 w-10 flex items-center justify-center"
                          aria-label={`Remove ${service.serviceDescription || 'custom service'}`}
                          id={`remove-custom-btn-${index}`}
                        >
                          <IconTrash className="w-4 h-4 sm:w-5 sm:h-5" />
                        </Button>
                    </div>
                  </div>
              </div>
            </div>
          ))}

          <div className="pt-2">
            <Button onClick={handleAddService} variant="ghost" id="add-custom-service-btn" className="w-full sm:w-auto">
              <IconPlus className="w-5 h-5 mr-2" /> Add Custom Service
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 pt-4 border-t border-slate-200 flex justify-between sm:justify-end items-center">
        <span className="text-base sm:text-lg font-bold text-slate-800">Custom Services Total: ₹{state.customServicesTotal.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default CustomServicesStep;