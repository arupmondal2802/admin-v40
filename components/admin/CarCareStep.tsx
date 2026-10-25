
import React from 'react';
import { Service, CarCareDetails, PricingConfig } from '../../types';
import { CAR_CARE_TYPES } from '../../constants';

// FIX: Updated Props interface to resolve spread errors in ServiceForm.
interface Props {
  state: Service;
  updateField: <K extends keyof Service>(field: K, value: Service[K]) => void;
  dispatch: React.Dispatch<any>;
  pricingConfig?: PricingConfig;
  googleDriveUploadUrl?: string;
  userSubscriptions?: any[];
  serviceTemplates?: any[];
  errors?: any;
  allSubmissions?: Service[];
  vehicleData?: any;
  tyreData?: any;
  onUpdateVehicleData?: (brand: string, model: string) => void;
  onUpdateTyreData?: (type: string, value: string) => void;
}

const CarCareStep: React.FC<Props> = ({ state, updateField }) => {

  const handleCareTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const careType = e.target.value;
    if (careType) {
        const newDetails: CarCareDetails = { careType, price: 0, mrp: 0 };
        updateField('carCareDetails', newDetails);
    } else {
        updateField('carCareDetails', undefined);
    }
  };

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
                <label htmlFor="careType" className="block text-sm font-medium text-slate-700 mb-1">
                    Select Car Care Package
                </label>
                <select 
                    id="careType" 
                    value={state.carCareDetails?.careType || ''} 
                    onChange={handleCareTypeChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
                >
                    <option value="">-- No Car Care --</option>
                    {CAR_CARE_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>
             <div className="text-left md:text-right pt-7">
                <p className="text-xs text-slate-500">MRP: ₹{(state.carCareDetails?.mrp || 0).toFixed(2)}</p>
                <p className="text-2xl font-bold text-slate-800">Total: ₹{(state.carCareDetails?.price || 0).toFixed(2)}</p>
            </div>
        </div>
    </div>
  );
};

export default CarCareStep;
