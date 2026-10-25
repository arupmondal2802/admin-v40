

import React from 'react';
import { Service, CarCareDetails, PricingConfig, BaseStepProps } from '../types';
import { CAR_CARE_TYPES } from '../constants';
import BulkFileUpload from './ui/BulkFileUpload';

const CarCareStep: React.FC<BaseStepProps> = ({ state, updateField, googleDriveUploadUrl, errors, predefinedServices, predefinedServiceCategories }) => {

  const careOptions = React.useMemo(() => {
    if (predefinedServices && predefinedServices.length > 0) {
      const careCategoryIds = (predefinedServiceCategories || [])
        .filter((c: any) => c.isEnabled && (c.name.toLowerCase().includes('care') || c.name.toLowerCase().includes('detail')))
        .map((c: any) => c.id);

      const catalogCare = predefinedServices.filter((s: any) => 
        s.isEnabled && (
          careCategoryIds.includes(s.categoryId) ||
          s.name.toLowerCase().includes('care') ||
          s.name.toLowerCase().includes('polish') ||
          s.name.toLowerCase().includes('ceramic') ||
          s.name.toLowerCase().includes('coating')
        )
      ).map((s: any) => s.name);

      if (catalogCare.length > 0) {
        return [...new Set(catalogCare)];
      }
    }
    return CAR_CARE_TYPES;
  }, [predefinedServices, predefinedServiceCategories]);

  const handleCareTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const careType = e.target.value;
    if (careType) {
        // Price is calculated by the hook, just set the type
        const newDetails: CarCareDetails = { careType, price: 0, mrp: 0 };
        updateField('carCareDetails', newDetails);
    } else {
        // Clear details if nothing is selected
        updateField('carCareDetails', undefined);
    }
  };

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
            <div>
                <label htmlFor="careType" className="block text-sm font-medium text-slate-700 mb-1">
                    Select Car Care Package
                </label>
                <select 
                    id="careType" 
                    value={state.carCareDetails?.careType || ''} 
                    onChange={handleCareTypeChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent text-sm"
                >
                    <option value="">-- No Car Care --</option>
                    {careOptions.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>
            <div className="text-left md:text-right pt-2 md:pt-7 bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-xl border border-slate-200 md:border-0">
                <p className="text-xs text-slate-500">MRP: ₹{(state.carCareDetails?.mrp || 0).toFixed(2)}</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-800">Total: ₹{(state.carCareDetails?.price || 0).toFixed(2)}</p>
            </div>
        </div>

        {state.carCareDetails?.careType && (
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200">
            <BulkFileUpload 
              state={state} 
              updateField={updateField} 
              carNumber={state.carNumber} 
              uploadUrl={googleDriveUploadUrl || ''} 
            />
            {errors?.beforeWashingPhoto && (
              <p className="mt-2 text-sm font-semibold text-red-600 animate-pulse">{errors.beforeWashingPhoto as string}</p>
            )}
          </div>
        )}
    </div>
  );
};

export default CarCareStep;