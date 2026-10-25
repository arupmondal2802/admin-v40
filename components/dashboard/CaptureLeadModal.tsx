import React, { useState } from 'react';
import { ServiceRequest } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import GoogleAddressAutocomplete from '../ui/GoogleAddressAutocomplete';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (lead: Omit<ServiceRequest, 'id' | 'status' | 'requestDate'>) => Promise<void>;
}

const inputClasses = "w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue sm:text-sm";
const selectClasses = "w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue sm:text-sm";

export const CaptureLeadModal: React.FC<Props> = ({ isOpen, onClose, onCapture }) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [requestedService, setRequestedService] = useState('');
  const [leadSource, setLeadSource] = useState<'Web' | 'Meta' | 'Google Ads' | 'Organic' | 'Referral'>('Web');
  const [carRegNo, setCarRegNo] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [customerLatitude, setCustomerLatitude] = useState<number | undefined>(undefined);
  const [customerLongitude, setCustomerLongitude] = useState<number | undefined>(undefined);
  const [customerDistanceKm, setCustomerDistanceKm] = useState<number | undefined>(undefined);
  const [totalAmount, setTotalAmount] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!customerName.trim()) {
      setError('Customer Name is required.');
      return;
    }
    if (!customerPhone.trim()) {
      setError('Customer Phone is required.');
      return;
    }
    if (!requestedService.trim()) {
      setError('Requested Service is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCapture({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        requestedService: requestedService.trim(),
        source: leadSource,
        leadSource: leadSource,
        carRegNo: carRegNo.trim() || undefined,
        carBrand: carBrand.trim() || undefined,
        carModel: carModel.trim() || undefined,
        streetAddress: streetAddress.trim() || undefined,
        customerLatitude,
        customerLongitude,
        customerDistanceKm,
        totalAmount: totalAmount.trim() ? parseFloat(totalAmount) : undefined,
      });
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setRequestedService('');
      setLeadSource('Web');
      setCarRegNo('');
      setCarBrand('');
      setCarModel('');
      setStreetAddress('');
      setCustomerLatitude(undefined);
      setCustomerLongitude(undefined);
      setCustomerDistanceKm(undefined);
      setTotalAmount('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-8 modal-content">
        <Card title="Capture New Lead">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-500 mb-2">
              Enter customer details below to capture a new web lead manually. This lead will be added to the queue and persisted in the Cloud database.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClasses}
                  placeholder="e.g. Rahul Sharma"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Phone *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={inputClasses}
                  placeholder="e.g. 9876543210"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Requested Service *</label>
                <input
                  type="text"
                  required
                  value={requestedService}
                  onChange={(e) => setRequestedService(e.target.value)}
                  className={inputClasses}
                  placeholder="e.g. Full Body Wash"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lead Source *</label>
                <select
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value as any)}
                  className={selectClasses}
                >
                  <option value="Web">Web</option>
                  <option value="Meta">Meta</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="Organic">Organic</option>
                  <option value="Referral">Referral</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-100 my-2 pt-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Vehicle Details (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">Reg No.</label>
                  <input
                    type="text"
                    value={carRegNo}
                    onChange={(e) => setCarRegNo(e.target.value)}
                    className={inputClasses}
                    placeholder="DL 3C AB 1234"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">Brand</label>
                  <input
                    type="text"
                    value={carBrand}
                    onChange={(e) => setCarBrand(e.target.value)}
                    className={inputClasses}
                    placeholder="Maruti, Hyundai..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">Model</label>
                  <input
                    type="text"
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    className={inputClasses}
                    placeholder="Swift, Creta..."
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <GoogleAddressAutocomplete
                  label="Street Address"
                  value={streetAddress}
                  onChange={(val) => {
                    setStreetAddress(val);
                    if (!val) {
                      setCustomerLatitude(undefined);
                      setCustomerLongitude(undefined);
                      setCustomerDistanceKm(undefined);
                    }
                  }}
                  onSelectAddress={(res) => {
                    setStreetAddress(res.address);
                    if (res.lat && res.lng) {
                      setCustomerLatitude(res.lat);
                      setCustomerLongitude(res.lng);
                    }
                    if (res.distanceKm) {
                      setCustomerDistanceKm(res.distanceKm);
                    }
                  }}
                  placeholder="Type street or area via Google Maps..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Amount (₹)</label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className={inputClasses}
                  placeholder="0.00"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-semibold text-center">{error}</p>}

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Capturing...' : 'Capture Lead'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
