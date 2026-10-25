import React from 'react';
// FIX: Removed obsolete 'PredefinedAddon' import.
import { Service, ServiceTemplate, UserSubscription, PricingConfig, BaseStepProps } from '../types';
import { ValidationErrors } from '../services/validationService';

const ServiceSelectionStep: React.FC<BaseStepProps> = ({ state, updateField, serviceTemplates, errors }) => {
  const handleToggle = (selection: string) => {
    const currentSelections = state.serviceSelection;
    const newSelections = currentSelections.includes(selection)
      ? currentSelections.filter(s => s !== selection)
      : [...currentSelections, selection];
    updateField('serviceSelection', newSelections);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Select all services the customer requires. Details for each service will be collected in the next step.</p>
      {errors.serviceSelection && <p className="text-sm text-red-600 font-semibold">{errors.serviceSelection as string}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {serviceTemplates.filter(t => t.isEnabled).map(template => {
          const isSelected = state.serviceSelection.includes(template.name);
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => handleToggle(template.name)}
              className={`p-4 sm:p-5 text-left rounded-xl border-2 transition-all duration-200 active:scale-[0.99] cursor-pointer min-h-[60px] flex items-center justify-between ${
                isSelected 
                ? 'bg-brand-accent/10 border-brand-accent ring-2 ring-brand-accent/50 shadow-sm' 
                : 'bg-white border-slate-200 hover:border-brand-accent/70 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <span className={`font-bold text-sm sm:text-base truncate ${isSelected ? 'text-brand-blue font-extrabold' : 'text-slate-700'}`}>
                  {template.name}
                </span>
              </div>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-colors ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-slate-300 bg-slate-50'}`}>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-brand-blue stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceSelectionStep;