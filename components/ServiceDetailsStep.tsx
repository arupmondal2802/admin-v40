
import React from 'react';
// FIX: Removed obsolete 'PredefinedAddon' from imports.
import { Service, TyreDetail, BatteryDetail, ServiceTemplate, CustomField, UserSubscription, VehicleCategoryTag, CarWashDetails, TyreData, PricingConfig, BaseStepProps } from '../types';
import Input from './ui/Input';
import QuantityInput from './ui/QuantityInput';
import FileUpload from './ui/FileUpload';
import BulkFileUpload from './ui/BulkFileUpload';
import { ValidationErrors } from '../services/validationService';
import Accordion from './ui/Accordion';
import SelfLearningInput from './ui/SelfLearningInput';
import { VEHICLE_CATEGORY_TAGS, WASH_TYPES, DEFAULT_PRICING_CONFIG } from '../constants';

export const ServiceDetailsStep: React.FC<BaseStepProps> = ({ 
  state, 
  updateField, 
  dispatch, 
  googleDriveUploadUrl, 
  serviceTemplates, 
  errors, 
  tyreData, 
  onUpdateTyreData, 
  pricingConfig = DEFAULT_PRICING_CONFIG,
  predefinedServices,
  predefinedServiceCategories
}) => {

  const getPredefinedServicesOfCategoryType = (type: 'wash' | 'care' | 'tyre' | 'battery') => {
    if (!predefinedServices) return [];
    return predefinedServices.filter(svc => {
      const cat = predefinedServiceCategories?.find(c => c.id === svc.categoryId);
      const catName = (cat?.name || '').toLowerCase();
      const svcName = (svc.name || '').toLowerCase();
      
      if (type === 'wash') {
        return catName.includes('wash') || catName.includes('washing') || svcName.includes('wash');
      }
      if (type === 'care') {
        return catName.includes('care') || catName.includes('polish') || catName.includes('ceramic') || catName.includes('detailing');
      }
      if (type === 'tyre') {
        return catName.includes('tyre') || catName.includes('tire') || svcName.includes('tyre') || svcName.includes('tire');
      }
      if (type === 'battery') {
        return catName.includes('battery') || svcName.includes('battery');
      }
      return false;
    });
  };

  const washServices = getPredefinedServicesOfCategoryType('wash');
  const tyreServices = getPredefinedServicesOfCategoryType('tyre');
  const batteryServices = getPredefinedServicesOfCategoryType('battery');

  const handleUpdateTyreDetail = (index: number, field: keyof TyreDetail, value: any) => {
    dispatch({ type: 'UPDATE_TYRE_DETAIL', index, field, value });
  };
  
  const handleUpdateBatteryDetail = (index: number, field: keyof BatteryDetail, value: any) => {
    dispatch({ type: 'UPDATE_BATTERY_DETAIL', index, field, value });
  };
  
  const handleUpdateCustomField = (fieldId: string, value: string | number) => {
    dispatch({ type: 'UPDATE_CUSTOM_FIELD_DATA', fieldId, value });
  };
  
  const handleWashDetailsChange = (field: keyof CarWashDetails, value: any) => {
    const newDetails = { ...state.carWashDetails, [field]: value };
    // If washType is cleared, reset the whole object
    if (field === 'washType' && !value) {
        updateField('carWashDetails', undefined);
    } else {
        updateField('carWashDetails', newDetails);
    }
  };

  const getCustomFieldValue = (fieldId: string): string | number => {
      const fieldData = (state.customFieldData || []).find(f => f.fieldId === fieldId);
      return fieldData ? fieldData.value : '';
  };
  
  const renderCustomField = (field: CustomField) => {
    switch (field.type) {
        case 'TEXT':
            return <Input 
                      label={field.label} 
                      id={field.id} 
                      value={getCustomFieldValue(field.id) as string}
                      onChange={(e) => handleUpdateCustomField(field.id, e.target.value)} 
                    />;
        case 'NUMBER':
            return <Input 
                      label={field.label} 
                      id={field.id} 
                      type="number"
                      value={getCustomFieldValue(field.id)}
                      onChange={(e) => handleUpdateCustomField(field.id, parseFloat(e.target.value) || 0)} 
                    />;
        case 'QUANTITY':
             // FIX: Replaced Input with a proper label and QuantityInput for better UX.
             return (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                  <QuantityInput
                      value={getCustomFieldValue(field.id) as number || 0}
                      onChange={(v) => handleUpdateCustomField(field.id, v)}
                  />
                </div>
            );
        case 'PHOTO':
            return <FileUpload 
                      uploadType="photo" 
                      label={field.label} 
                      fileUrl={getCustomFieldValue(field.id) as string} 
                      onUpload={(url) => handleUpdateCustomField(field.id, url)} 
                      carNumber={state.carNumber} 
                      uploadUrl={googleDriveUploadUrl} 
                    />;
        default:
            return null;
    }
  };

  const dynamicServices = state.serviceSelection.filter(name => !["Car Washing", "Tyre Replacement", "Battery Replacement", "Car Care"].includes(name));

  return (
    <div className="space-y-4">
      {state.serviceSelection.includes("Car Washing") && (
        <Accordion
          title="Car Washing Details"
          summary={<span className="font-semibold">{state.carWashDetails?.washType || 'Select Wash'} - ₹{(state.carWashDetails?.price || 0).toFixed(2)}</span>}
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-6">
              <div>
                <label htmlFor="washType" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wash Type</label>
                <select id="washType" value={state.carWashDetails?.washType || ''} onChange={(e) => handleWashDetailsChange('washType', e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                    <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Wash Type --</option>
                    {washServices.length > 0 
                      ? washServices.map(svc => <option key={svc.id} value={svc.name} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{svc.name}</option>)
                      : WASH_TYPES.map(type => <option key={type} value={type} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{type}</option>)
                    }
                </select>
              </div>
              <div>
                <label htmlFor="vehicleCategoryTagWash" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vehicle Category</label>
                 <select id="vehicleCategoryTagWash" value={state.vehicleCategoryTag || ''} onChange={(e) => updateField('vehicleCategoryTag', e.target.value as VehicleCategoryTag)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                    <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Category --</option>
                    {VEHICLE_CATEGORY_TAGS.map(tag => <option key={tag} value={tag} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{tag}</option>)}
                </select>
              </div>
          </div>
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="space-y-2">
                    <label htmlFor="isSubscription" className="font-medium text-slate-700 flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" id="isSubscription" checked={state.isSubscription} onChange={(e) => updateField('isSubscription', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-accent focus:ring-brand-accent"/>
                        <span>Is this a subscription wash? (Price will be zero)</span>
                    </label>
                </div>
                <div className="text-right flex items-center space-x-3">
                    <div className="w-24">
                        <Input 
                            label="Quantity" 
                            type="number" 
                            id="carwashQuantity"
                            min={1}
                            value={state.carwashQuantity ?? 1} 
                            onChange={(e) => updateField('carwashQuantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="text-center font-bold"
                            error={errors?.carwashQuantity}
                        />
                    </div>
                    <div className="w-32">
                        <Input 
                            label="Total (₹)" 
                            type="number" 
                            id="washTotal"
                            value={state.carWashDetails?.price || 0} 
                            onChange={(e) => handleWashDetailsChange('price', parseFloat(e.target.value) || 0)}
                            className="text-right font-bold"
                        />
                    </div>
                </div>
           </div>
          <div className="space-y-4 mt-6">
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
        </Accordion>
      )}

      {state.serviceSelection.includes("Tyre Replacement") && (
        <Accordion
          title="Tyre Replacement Details"
          summary={<span className="font-semibold">{state.tyreReplacementQuantity} tyre(s) - ₹{state.tyreReplacementTotalAmount.toFixed(2)}</span>}
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6 items-end">
              {tyreServices.length > 0 && (
                <div>
                  <label htmlFor="tyrePackage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Tyre Package</label>
                  <select
                    id="tyrePackage"
                    onChange={(e) => {
                      const selectedName = e.target.value;
                      const svc = tyreServices.find(s => s.name === selectedName);
                      if (svc) {
                        const category = state.vehicleCategoryTag || 'Hatch';
                        const price = svc.pricing?.[category]?.price ?? (svc.pricePerUnit || 0);
                        updateField('tyreReplacementPrice', price);
                        updateField('tyreLaborCost', Number(svc.laborExpense || 0));
                        updateField('tyreMaterialCost', Number(svc.materialExpense || 0));
                        
                        // Apply package details to all tyre items
                        const updatedTyres = (state.tyreDetails || []).map(t => ({
                          ...t,
                          brand: svc.brand || svc.name || t.brand,
                          model: svc.model || t.model,
                          tyreNumber: svc.tyreNumber || t.tyreNumber,
                          pricePerTyre: price,
                          balancingPrice: svc.balancingPrice ?? t.balancingPrice ?? 0,
                        }));
                        updateField('tyreDetails', updatedTyres);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm animate-fadeIn"
                  >
                    <option value="">-- Custom / Choose Package --</option>
                    {tyreServices.map(svc => (
                      <option key={svc.id} value={svc.name}>{svc.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity</label>
                  <QuantityInput value={state.tyreReplacementQuantity} onChange={v => updateField('tyreReplacementQuantity', v)} />
                  {errors.tyreReplacementQuantity && <p className="mt-1 text-xs text-red-600">{errors.tyreReplacementQuantity as string}</p>}
              </div>
              <div>
                <Input
                    label="Price per Tyre (₹)"
                    id="tyreReplacementPrice"
                    type="number"
                    value={state.tyreReplacementPrice}
                    onChange={(e) => updateField('tyreReplacementPrice', parseFloat(e.target.value) || 0)}
                />
              </div>
               <div>
                <Input
                    label="Internal Labor Cost (₹)"
                    id="tyreLaborCost"
                    type="number"
                    value={state.tyreLaborCost}
                    onChange={(e) => updateField('tyreLaborCost', parseFloat(e.target.value) || 0)}
                />
              </div>
               <div>
                <Input
                    label="Internal Material Cost (₹)"
                    id="tyreMaterialCost"
                    type="number"
                    value={state.tyreMaterialCost}
                    onChange={(e) => updateField('tyreMaterialCost', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="lg:col-span-5 flex justify-end pb-2">
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">Total Customer Price: ₹{state.tyreReplacementTotalAmount.toFixed(2)}</p>
              </div>
          </div>
          <div className="space-y-4">
          {(state.tyreDetails || []).map((tyre, index) => (
             <div key={tyre.tyreId} className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Tyre {index + 1} of {state.tyreReplacementQuantity}</h4>
                  <span className="text-xs font-semibold text-brand-accent bg-brand-accent/10 px-2.5 py-1 rounded-full">
                    ₹{((tyre.pricePerTyre ?? state.tyreReplacementPrice ?? 0) + (tyre.balancingPrice || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <SelfLearningInput label="Brand" id={`tyre-brand-${index}`} value={tyre.brand || ''} onChange={v => handleUpdateTyreDetail(index, 'brand', v)} onNewValue={v => onUpdateTyreData?.('brands', v)} suggestions={tyreData?.brands || []} error={errors.tyreDetails?.[index]?.brand} />
                    <SelfLearningInput label="Model" id={`tyre-model-${index}`} value={tyre.model || ''} onChange={v => handleUpdateTyreDetail(index, 'model', v)} onNewValue={v => onUpdateTyreData?.('models', v)} suggestions={tyreData?.models || []} error={errors.tyreDetails?.[index]?.model} />
                    <Input label="Tyre Number / Code" id={`tyre-number-${index}`} value={tyre.tyreNumber || ''} onChange={e => handleUpdateTyreDetail(index, 'tyreNumber', e.target.value)} placeholder="e.g. 185/65 R15" error={errors.tyreDetails?.[index]?.tyreNumber} />
                    <SelfLearningInput label="Tyre Size" id={`tyre-size-${index}`} value={tyre.tyreSize || ''} onChange={v => handleUpdateTyreDetail(index, 'tyreSize', v)} onNewValue={v => onUpdateTyreData?.('sizes', v)} suggestions={tyreData?.sizes || []} error={errors.tyreDetails?.[index]?.tyreSize} />
                    <Input label="DOT Code" id={`tyre-dot-${index}`} value={tyre.dotCode || ''} onChange={e => handleUpdateTyreDetail(index, 'dotCode', e.target.value)} error={errors.tyreDetails?.[index]?.dotCode} />
                    <Input label="Price per Tyre (₹)" id={`tyre-price-${index}`} type="number" value={tyre.pricePerTyre ?? state.tyreReplacementPrice} onChange={e => handleUpdateTyreDetail(index, 'pricePerTyre', parseFloat(e.target.value) || 0)} />
                    <Input label="Balancing Price (₹, if any)" id={`tyre-balancing-${index}`} type="number" value={tyre.balancingPrice || 0} onChange={e => handleUpdateTyreDetail(index, 'balancingPrice', parseFloat(e.target.value) || 0)} />
                </div>
                <FileUpload uploadType="photo" label="Tyre Photo / DOT Serial Image" fileUrl={tyre.dotSerialNumberImage} onUpload={(url) => handleUpdateTyreDetail(index, 'dotSerialNumberImage', url)} carNumber={state.carNumber} uploadUrl={googleDriveUploadUrl} error={errors.tyreDetails?.[index]?.dotSerialNumberImage} isMandatory={true} />
             </div>
          ))}
          </div>
        </Accordion>
      )}

      {state.serviceSelection.includes("Battery Replacement") && (
        <Accordion
            title="Battery Replacement Details"
            summary={<span className="font-semibold">{state.batteryReplacementQuantity} battery(s) - ₹{state.batteryReplacementTotalAmount.toFixed(2)}</span>}
            defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-end">
              {batteryServices.length > 0 && (
                <div>
                  <label htmlFor="batteryPackage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Battery Package</label>
                  <select
                    id="batteryPackage"
                    onChange={(e) => {
                      const selectedName = e.target.value;
                      const svc = batteryServices.find(s => s.name === selectedName);
                      if (svc) {
                        const category = state.vehicleCategoryTag || 'Hatch';
                        const price = svc.pricing?.[category]?.price ?? (svc.pricePerUnit || 0);
                        const updatedBatteryDetails = (state.batteryDetails || []).map(b => ({
                          ...b,
                          brand: svc.brand || svc.name || b.brand,
                          model: svc.model || b.model,
                          newBatteryAmount: price,
                          exchangeValue: svc.exchangeValueDeduction ?? b.exchangeValue ?? 0,
                        }));
                        updateField('batteryDetails', updatedBatteryDetails);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm animate-fadeIn"
                  >
                    <option value="">-- Custom / Choose Package --</option>
                    {batteryServices.map(svc => (
                      <option key={svc.id} value={svc.name}>{svc.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity</label>
                  <QuantityInput value={state.batteryReplacementQuantity} onChange={v => updateField('batteryReplacementQuantity', v)} />
                   {errors.batteryReplacementQuantity && <p className="mt-1 text-xs text-red-600">{errors.batteryReplacementQuantity as string}</p>}
              </div>
              <p className="text-lg font-semibold text-slate-800 dark:text-slate-100 self-center">Total: ₹{state.batteryReplacementTotalAmount.toFixed(2)}</p>
          </div>
          <div className="space-y-4">
            {(state.batteryDetails || []).map((battery, index) => (
              <div key={battery.batteryId} className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                 <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                   <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Battery {index + 1} of {state.batteryReplacementQuantity}</h4>
                   <span className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full">
                     Sub-total: ₹{(battery.newBatteryAmount - battery.exchangeValue).toFixed(2)}
                   </span>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input label="Brand" id={`batt-brand-${index}`} value={battery.brand || ''} onChange={e => handleUpdateBatteryDetail(index, 'brand', e.target.value)} placeholder="e.g. Exide / Amaron" error={errors.batteryDetails?.[index]?.brand} />
                    <Input label="Model" id={`batt-model-${index}`} value={battery.model || ''} onChange={e => handleUpdateBatteryDetail(index, 'model', e.target.value)} placeholder="e.g. DIN55 / Matrix" error={errors.batteryDetails?.[index]?.model} />
                    <Input label="Battery Serial Number" id={`batt-serial-${index}`} value={battery.serialNumber || ''} onChange={e => handleUpdateBatteryDetail(index, 'serialNumber', e.target.value)} placeholder="e.g. BAT-123456" error={errors.batteryDetails?.[index]?.serialNumber} />
                    <Input label="New Battery Price (₹)" id={`batt-new-amt-${index}`} type="number" value={battery.newBatteryAmount} onChange={e => handleUpdateBatteryDetail(index, 'newBatteryAmount', parseFloat(e.target.value) || 0)} error={errors.batteryDetails?.[index]?.newBatteryAmount} />
                    <Input label="Old Battery Replacement Value Deduction (₹)" id={`batt-exchange-${index}`} type="number" value={battery.exchangeValue} onChange={e => handleUpdateBatteryDetail(index, 'exchangeValue', parseFloat(e.target.value) || 0)} />
                 </div>
                 <FileUpload uploadType="photo" label="Battery Photo" fileUrl={battery.batteryPhoto || ''} onUpload={(url) => handleUpdateBatteryDetail(index, 'batteryPhoto', url)} carNumber={state.carNumber} uploadUrl={googleDriveUploadUrl} error={errors.batteryDetails?.[index]?.batteryPhoto} isMandatory={true} />
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* DYNAMIC SERVICE DETAILS */}
      {dynamicServices.map(serviceName => {
        const template = serviceTemplates.find(t => t.name === serviceName);
        if (!template || !template.customFields || template.customFields.length === 0) {
            return null;
        }

        return (
            <Accordion key={template.id} title={`${template.name} Details`} defaultOpen={true}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {template.customFields.map(field => (
                        <div key={field.id}>
                            {renderCustomField(field)}
                        </div>
                    ))}
                </div>
            </Accordion>
        );
      })}
    </div>
  );
};
