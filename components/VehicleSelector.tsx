import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Input from './ui/Input';
import { CAR_BRANDS } from '../data/vehicleData';
import { FormErrorValue, CarDatabaseItem } from '../types';

interface VehicleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  error?: FormErrorValue | string;
  vehicleData: Record<string, string[]>;
  carDatabase?: CarDatabaseItem[];
  onUpdateVehicleData?: (brand: string, model: string) => void;
  onSelectCarVariant?: (variant: CarDatabaseItem) => void;
}

const POPULAR_BRANDS = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Kia', 'Toyota', 'Honda'];
const DEBOUNCE_DELAY = 250;

const VehicleSelector: React.FC<VehicleSelectorProps> = ({ 
  value, 
  onChange, 
  error, 
  vehicleData, 
  carDatabase = [],
  onUpdateVehicleData,
  onSelectCarVariant 
}) => {
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  
  const debounceRef = useRef<number | null>(null);
  const lastPropagatedValueRef = useRef<string | null>(null);

  // Merge brands from vehicleData and carDatabase
  const { popularBrandsList, otherBrandsList } = useMemo(() => {
    const dbBrands = carDatabase.map(c => c.brand);
    const allBrands = Array.from(new Set([...Object.keys(vehicleData), ...dbBrands]))
      .filter(b => b !== 'Other')
      .sort();

    const popular = allBrands.filter(b => POPULAR_BRANDS.includes(b));
    const others = allBrands.filter(b => !POPULAR_BRANDS.includes(b));
    return { popularBrandsList: popular, otherBrandsList: others };
  }, [vehicleData, carDatabase]);

  // Sync incoming value -> internal state
  useEffect(() => {
    if (value === lastPropagatedValueRef.current) {
      return;
    }
    lastPropagatedValueRef.current = value;

    if (value && value.includes(' - ')) {
      const parts = value.split(' - ');
      const brand = parts[0];
      const modelWithVersion = parts[1] || '';
      
      let model = modelWithVersion;
      let version = '';
      if (modelWithVersion.includes('(') && modelWithVersion.endsWith(')')) {
        const match = modelWithVersion.match(/^(.*?)\s*\((.*?)\)$/);
        if (match) {
          model = match[1].trim();
          version = match[2].trim();
        }
      }

      const allBrands = Array.from(new Set([...Object.keys(vehicleData), ...carDatabase.map(c => c.brand)]));

      if (allBrands.includes(brand)) {
        setSelectedBrand(prev => (prev === brand ? prev : brand));
        setSelectedModel(prev => (prev === model ? prev : model));
        setSelectedVersion(prev => (prev === version ? prev : version));
      } else {
        setSelectedBrand('Other');
        setCustomBrand(brand);
        setSelectedModel('Other/Not Listed');
        setCustomModel(model);
      }
    } else {
      setSelectedBrand('');
      setSelectedModel('');
      setSelectedVersion('');
      setCustomBrand('');
      setCustomModel('');
    }
  }, [value, vehicleData, carDatabase]);

  // Models for selected brand
  const availableModels = useMemo(() => {
    if (!selectedBrand) return [];
    const fromVehicleData = vehicleData[selectedBrand] || [];
    const fromCarDb = carDatabase.filter(c => c.brand === selectedBrand).map(c => c.model);
    const combined = Array.from(new Set([...fromVehicleData, ...fromCarDb])).sort();
    if (!combined.includes('Other/Not Listed')) {
      return [...combined, 'Other/Not Listed'];
    }
    return combined;
  }, [selectedBrand, vehicleData, carDatabase]);

  // Matching CarDatabase Items for selected Brand & Model
  const matchingCarItems = useMemo(() => {
    if (!selectedBrand || !selectedModel || selectedBrand === 'Other' || selectedModel === 'Other/Not Listed') {
      return [];
    }
    return carDatabase.filter(c => c.brand === selectedBrand && c.model === selectedModel);
  }, [selectedBrand, selectedModel, carDatabase]);

  // Active Car Item
  const activeCarItem = useMemo(() => {
    if (matchingCarItems.length === 0) return null;
    if (selectedVersion) {
      const match = matchingCarItems.find(c => c.version === selectedVersion);
      if (match) return match;
    }
    return matchingCarItems[0];
  }, [matchingCarItems, selectedVersion]);

  // Debounced parent update
  const updateParent = useCallback(() => {
    const finalBrand = (selectedBrand === 'Other' ? customBrand.trim() : selectedBrand);
    const finalModel = (selectedModel === 'Other/Not Listed' ? customModel.trim() : selectedModel);
    
    let formattedValue = '';
    if (finalBrand) {
      formattedValue = `${finalBrand} - ${finalModel}` + (selectedVersion ? ` (${selectedVersion})` : '');
    }

    if (value !== formattedValue) {
      lastPropagatedValueRef.current = formattedValue;
      onChange(formattedValue);
      if (onUpdateVehicleData) {
        onUpdateVehicleData(finalBrand, finalModel);
      }
      if (activeCarItem && onSelectCarVariant) {
        onSelectCarVariant(activeCarItem);
      }
    }
  }, [selectedBrand, selectedModel, selectedVersion, customBrand, customModel, onChange, onUpdateVehicleData, onSelectCarVariant, activeCarItem, value]);

  // Debounce effect
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      updateParent();
    }, DEBOUNCE_DELAY);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [updateParent]);

  const handleBrandChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBrand = e.target.value;
    setSelectedBrand(newBrand);
    setSelectedModel('');
    setSelectedVersion('');
    setCustomModel('');
    if (newBrand !== 'Other') {
      setCustomBrand('');
    }
  }, []);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    setSelectedVersion('');
    if (newModel !== 'Other/Not Listed') {
      setCustomModel('');
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="carBrand" className="block text-sm font-bold text-slate-700 mb-1">
            Car Brand
          </label>
          <select
            id="carBrand"
            value={selectedBrand}
            onChange={handleBrandChange}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl shadow-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent text-sm"
          >
            <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Brand --</option>
            <optgroup label="Popular Brands" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100 font-semibold">
                {popularBrandsList.map(brand => (
                    <option key={brand} value={brand} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{brand}</option>
                ))}
            </optgroup>
            <optgroup label="All Brands" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100 font-semibold">
                {otherBrandsList.map(brand => (
                    <option key={brand} value={brand} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{brand}</option>
                ))}
            </optgroup>
             <option value="Other" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">Other...</option>
          </select>
        </div>

        <div>
          <label htmlFor="carModel" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
            Car Model
          </label>
          <select
            id="carModel"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={!selectedBrand || selectedBrand === 'Other'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl shadow-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent text-sm disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Model --</option>
            {availableModels.map(model => (
              <option key={model} value={model} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{model}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Version dropdown if multiple variants in database */}
      {matchingCarItems.length > 1 && (
        <div>
          <label htmlFor="carVersion" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Variant / Version
          </label>
          <select
            id="carVersion"
            value={selectedVersion}
            onChange={e => setSelectedVersion(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-accent"
          >
            <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Variant / Fuel Type --</option>
            {matchingCarItems.map(item => (
              <option key={item.id} value={item.version} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                {item.version || 'Standard'} ({item.fuelType} • {item.frontTyresSpec || 'Tyres Spec'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Car Variant Live Specs Preview Card */}
      {activeCarItem && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl p-1.5 flex items-center justify-center flex-shrink-0 shadow-sm">
              {activeCarItem.logo ? (
                <img src={activeCarItem.logo} alt={activeCarItem.brand} className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="font-black text-xs text-slate-800">{activeCarItem.brand[0]}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-brand-accent tracking-wider">{activeCarItem.brand}</span>
                <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase">{activeCarItem.tag}</span>
              </div>
              <h4 className="font-extrabold text-sm text-white">{activeCarItem.model} <span className="text-slate-300 font-normal">({activeCarItem.version || activeCarItem.fuelType})</span></h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Front Tyre Spec: <span className="font-mono font-bold text-brand-accent">{activeCarItem.frontTyresSpec || 'N/A'}</span>
              </p>
            </div>
          </div>

          {activeCarItem.image && (
            <div className="h-16 w-24 bg-white/5 rounded-xl border border-white/10 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src={activeCarItem.image} alt={activeCarItem.model} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      )}

      {(selectedBrand === 'Other' || selectedModel === 'Other/Not Listed') && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          {selectedBrand === 'Other' && (
            <Input
              label="New Brand Name"
              value={customBrand}
              onChange={(e) => setCustomBrand(e.target.value)}
              placeholder="e.g., Tesla"
            />
          )}
          {(selectedBrand && selectedModel === 'Other/Not Listed') && (
             <Input
                label="New Model Name"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g., Model 3"
                className={selectedBrand === 'Other' ? '' : 'sm:col-start-2'}
            />
          )}
        </div>
      )}
      
      {error && typeof error === 'string' && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default VehicleSelector;