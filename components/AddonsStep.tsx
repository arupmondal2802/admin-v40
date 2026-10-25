

import React from 'react';
import { Service, CategorizedAddon, UserSubscription, ServiceTemplate, PricingConfig, BaseStepProps } from '../types';
import { ADDON_CATEGORIES, DYNAMIC_ADDON_NAMES, DEFAULT_PRICING_CONFIG, DEFAULT_ADDON_PRICING_MATRIX } from '../constants';
import { IconPlus, IconMinus, IconTrash } from './ui/Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import { ValidationErrors } from '../services/validationService';


const AddonItem: React.FC<{
    label: string;
    price: number;
    value: number;
    onChange: (val: number) => void;
}> = ({ label, price, value, onChange }) => (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="w-full sm:w-auto">
            <p className="font-semibold text-slate-800">{label}</p>
            <p className="text-sm text-slate-500">₹{price.toFixed(2)} / unit</p>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end sm:justify-start">
            <Button variant="ghost" size="sm" onClick={() => onChange(Math.max(0, value - 1))} className="p-1 h-8 w-8" aria-label={`Decrease ${label} quantity`}>
              <IconMinus className="w-4 h-4" />
            </Button>
            <span className="text-base font-semibold w-8 text-center" aria-live="polite">{value}</span>
            <Button variant="ghost" size="sm" onClick={() => onChange(value + 1)} className="p-1 h-8 w-8" aria-label={`Increase ${label} quantity`}>
              <IconPlus className="w-4 h-4" />
            </Button>
        </div>
    </div>
);

interface Suggestion {
  name: string;
  isStandard: boolean;
  category?: string;
  defaultPrice: number;
}

const RECOMMENDATIONS_MAP: Record<string, Suggestion[]> = {
  "Car Washing": [
    { name: "Instant Crystal Polish", isStandard: true, defaultPrice: 300 },
    { name: "Windscreen Repellent", isStandard: true, defaultPrice: 200 },
    { name: "Interior Vacuum", isStandard: false, category: "Interior", defaultPrice: 350 },
  ],
  "Car Care": [
    { name: "Trim Restorer", isStandard: true, defaultPrice: 250 },
    { name: "Chrome Polish", isStandard: true, defaultPrice: 300 },
    { name: "Interior Vacuum", isStandard: false, category: "Interior", defaultPrice: 350 },
  ],
  "Tyre Replacement": [
    { name: "Tyre Polish", isStandard: false, category: "Exterior", defaultPrice: 200 },
    { name: "Wiper Blade", isStandard: true, defaultPrice: 400 },
  ],
  "Battery Replacement": [
    { name: "Engine Degreaser", isStandard: true, defaultPrice: 350 },
    { name: "Wiper Blade", isStandard: true, defaultPrice: 400 },
  ]
};

const GENERAL_RECOMMENDATIONS: Suggestion[] = [
  { name: "Interior Vacuum", isStandard: false, category: "Interior", defaultPrice: 350 },
  { name: "Tyre Polish", isStandard: false, category: "Exterior", defaultPrice: 200 },
  { name: "Instant Crystal Polish", isStandard: true, defaultPrice: 300 },
];


const AddonsStep: React.FC<BaseStepProps> = ({ state, updateField, dispatch, errors, pricingConfig = DEFAULT_PRICING_CONFIG, predefinedServices, inventoryItems }) => {

  const addonNamesList = React.useMemo(() => {
    const list: string[] = [];
    if (inventoryItems && inventoryItems.length > 0) {
      inventoryItems.forEach((inv: any) => {
        if (inv.name && !list.includes(inv.name)) list.push(inv.name);
      });
    }
    if (predefinedServices && predefinedServices.length > 0) {
      predefinedServices.forEach((s: any) => {
        if (s.isEnabled && s.name && !list.includes(s.name)) list.push(s.name);
      });
    }
    if (list.length === 0) {
      return DYNAMIC_ADDON_NAMES;
    }
    return list;
  }, [inventoryItems, predefinedServices]);

  const getAddonPrice = (name: string) => {
    const category = state.vehicleCategoryTag;
    const matchedSvc = predefinedServices?.find((s: any) => s.name === name);
    if (matchedSvc && category && matchedSvc.pricing?.[category]) {
      return matchedSvc.pricing[category].price ?? 0;
    }
    const matchedInv = inventoryItems?.find((i: any) => i.name === name);
    if (matchedInv) {
      return matchedInv.costPerUnit ?? 0;
    }
    const priceData = category ? pricingConfig.addons[name]?.[category] : { price: 0, mrp: 0 };
    return priceData?.price || 0;
  };

  const handleDynamicAddonQtyChange = (name: string, quantity: number) => {
    dispatch({ type: 'UPDATE_DYNAMIC_ADDON_QTY', name, quantity });
  };

  const handleAddCategorizedAddon = () => {
    dispatch({ type: 'ADD_CATEGORIZED_ADDON' });
  };

  const handleRemoveCategorizedAddon = (index: number) => {
    dispatch({ type: 'REMOVE_CATEGORIZED_ADDON', index });
  };
  
  const handleUpdateCategorizedAddon = (index: number, field: keyof CategorizedAddon, value: any) => {
    dispatch({ type: 'UPDATE_CATEGORIZED_ADDON', index, field, value });
  };

  // Suggestion logic based on primary services selection
  const activeSuggestions = React.useMemo(() => {
    const suggestions: Suggestion[] = [];
    const addedNames = new Set<string>();

    const services = state.serviceSelection || [];
    services.forEach(service => {
      const recs = RECOMMENDATIONS_MAP[service];
      if (recs) {
        recs.forEach(rec => {
          if (!addedNames.has(rec.name)) {
            suggestions.push(rec);
            addedNames.add(rec.name);
          }
        });
      }
    });

    // If no specific service suggestions are found, use general recommendations
    if (suggestions.length === 0) {
      GENERAL_RECOMMENDATIONS.forEach(rec => {
        if (!addedNames.has(rec.name)) {
          suggestions.push(rec);
          addedNames.add(rec.name);
        }
      });
    }

    return suggestions;
  }, [state.serviceSelection]);

  const handleToggleSuggestion = (suggestion: Suggestion) => {
    if (suggestion.isStandard) {
      const currentItem = (state.dynamicAddons || []).find(item => item.name === suggestion.name);
      const isAdded = currentItem && currentItem.quantity > 0;
      if (isAdded) {
        dispatch({ type: 'UPDATE_DYNAMIC_ADDON_QTY', name: suggestion.name, quantity: 0 });
      } else {
        dispatch({ type: 'UPDATE_DYNAMIC_ADDON_QTY', name: suggestion.name, quantity: 1 });
      }
    } else {
      const existingIndex = state.categorizedAddons.findIndex(item => item.productName === suggestion.name);
      if (existingIndex > -1) {
        dispatch({ type: 'REMOVE_CATEGORIZED_ADDON', index: existingIndex });
      } else {
        updateField('categorizedAddons', [
          ...state.categorizedAddons,
          {
            id: `CA-${Date.now()}`,
            relatedServiceId: state.submissionId,
            category: suggestion.category || 'Interior',
            productName: suggestion.name,
            quantity: 1,
            amount: suggestion.defaultPrice
          }
        ]);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Recommended Add-ons Section */}
      <div className="p-4 bg-cyan-50 border border-cyan-100 rounded-xl space-y-3">
        <div className="flex items-center space-x-2">
          <span className="text-base">💡</span>
          <h4 className="text-sm font-bold text-cyan-900">Recommended Add-ons for current order</h4>
        </div>
        <p className="text-xs text-cyan-700">
          Based on primary services (<strong>{state.serviceSelection.join(', ') || 'General'}</strong>), we suggest adding the following:
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {activeSuggestions.map((suggestion) => {
            const isAdded = suggestion.isStandard
              ? (state.dynamicAddons || []).some(item => item.name === suggestion.name && item.quantity > 0)
              : state.categorizedAddons.some(item => item.productName === suggestion.name);

            // Determine price
            let price = suggestion.defaultPrice;
            if (suggestion.isStandard && state.vehicleCategoryTag) {
              const priceData = pricingConfig.addons[suggestion.name]?.[state.vehicleCategoryTag];
              if (priceData) {
                price = priceData.price;
              }
            }

            return (
              <button
                key={suggestion.name}
                type="button"
                onClick={() => handleToggleSuggestion(suggestion)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                  isAdded
                    ? 'bg-cyan-600 text-white border-cyan-600 hover:bg-cyan-700 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/30'
                }`}
                id={`addon-recommendation-${suggestion.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span>{suggestion.name}</span>
                <span className={isAdded ? 'text-cyan-100' : 'text-slate-400'}>
                  (₹{price})
                </span>
                {isAdded ? (
                  <svg className="w-3 h-3 ml-1 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 ml-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Car Care Add-ons</h3>
         {!state.vehicleCategoryTag && (
                <p className="p-4 bg-yellow-100 text-yellow-800 border border-yellow-200 rounded-lg text-sm">
                    Please select a <strong>Vehicle Category</strong> in the 'Customer Details' step to see accurate pricing for add-ons.
                </p>
            )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {addonNamesList.map(name => {
                const currentItem = (state.dynamicAddons || []).find(item => item.name === name);
                const currentValue = currentItem ? currentItem.quantity : 0;
                const price = getAddonPrice(name);

                return (
                    <AddonItem
                        key={name}
                        label={name}
                        price={price}
                        value={currentValue}
                        onChange={(v) => handleDynamicAddonQtyChange(name, v)}
                    />
                );
            })}
        </div>
      </div>

      <div className="pt-6 sm:pt-8 border-t border-slate-200">
         <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">Other Custom Products/Services</h3>
         <div className="space-y-4">
            {(state.categorizedAddons || []).map((addon, index) => (
                <div key={addon.id} className="p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 sm:space-y-4">
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                       <div>
                            <label htmlFor={`addon-cat-${index}`} className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                            <select
                                id={`addon-cat-${index}`}
                                value={addon.category}
                                onChange={(e) => handleUpdateCategorizedAddon(index, 'category', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                            >
                                {ADDON_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                       </div>
                       <Input 
                            label="Product Name"
                            id={`addon-name-${index}`}
                            value={addon.productName}
                            onChange={(e) => handleUpdateCategorizedAddon(index, 'productName', e.target.value)}
                            error={errors.categorizedAddons?.[index]?.productName}
                        />
                         <Input 
                            label="Quantity"
                            id={`addon-qty-${index}`}
                            type="number"
                            value={addon.quantity}
                            onChange={(e) => handleUpdateCategorizedAddon(index, 'quantity', parseInt(e.target.value) || 0)}
                            error={errors.categorizedAddons?.[index]?.quantity}
                        />
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-end">
                        <Input 
                            label="Value (INR)"
                            id={`addon-amount-${index}`}
                            type="number"
                            value={addon.amount}
                            onChange={(e) => handleUpdateCategorizedAddon(index, 'amount', parseFloat(e.target.value) || 0)}
                            error={errors.categorizedAddons?.[index]?.amount}
                        />
                        <div className="sm:col-span-2 flex justify-between items-center bg-white sm:bg-transparent p-2.5 sm:p-0 rounded-lg border sm:border-0 border-slate-200">
                            <p className="font-bold text-slate-700 text-sm sm:text-base">
                                Sub-total: ₹{(addon.quantity * addon.amount).toFixed(2)}
                            </p>
                            <Button variant="danger" size="sm" onClick={() => handleRemoveCategorizedAddon(index)} className="p-2 h-9 w-9 sm:h-10 sm:w-10" aria-label={`Remove ${addon.productName || 'product'}`}>
                                <IconTrash className="w-4 h-4 sm:w-5 sm:h-5" />
                            </Button>
                        </div>
                   </div>
                </div>
            ))}
             <div className="pt-2">
                <Button onClick={handleAddCategorizedAddon} variant="ghost" className="w-full sm:w-auto">
                    <IconPlus className="w-5 h-5 mr-2" /> Add Other Item
                </Button>
            </div>
         </div>
      </div>

      <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t-2 border-slate-300 flex justify-between sm:justify-end items-center">
          <span className="text-lg sm:text-xl font-bold text-slate-800">Total Add-ons: ₹{state.addonsTotal.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default AddonsStep;