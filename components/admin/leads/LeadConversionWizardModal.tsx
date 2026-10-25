import React, { useState } from 'react';
import {
  X,
  Plus,
  CheckCircle2,
  Car,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  User,
  ShieldCheck,
  Building2,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import { findNearestHubForLead, normalizePhoneNumber } from './leadUtils';

interface LeadConversionWizardModalProps {
  lead: ServiceRequest | null;
  onClose: () => void;
  onConfirmConversion: (convertedData: {
    leadId: string;
    customerName: string;
    customerPhone: string;
    serviceAddress: string;
    carBrand: string;
    carModel: string;
    carRegNo: string;
    requestedService: string;
    totalAmount: number;
    appointmentDate: string;
    appointmentSlot: string;
    assignedHubId: string;
    assignedTechnician: string;
    paymentMethod: string;
    remarks: string;
  }) => void;
  activeHubs: DeliveryHub[];
  users: UserType[];
}

export const LeadConversionWizardModal: React.FC<LeadConversionWizardModalProps> = ({
  lead,
  onClose,
  onConfirmConversion,
  activeHubs,
  users
}) => {
  const defaultHub = lead ? findNearestHubForLead(lead, activeHubs)?.hub : null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDateStr = tomorrow.toISOString().split('T')[0];

  const [customerName, setCustomerName] = useState(lead?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(
    lead ? normalizePhoneNumber(lead.customerPhone || (lead as any).mobileNumber) : ''
  );
  const [serviceAddress, setServiceAddress] = useState(lead?.streetAddress || '');
  const [carBrand, setCarBrand] = useState(lead?.carBrand || '');
  const [carModel, setCarModel] = useState(lead?.carModel || '');
  const [carRegNo, setCarRegNo] = useState(lead?.carRegNo || '');
  const [requestedService, setRequestedService] = useState(
    lead?.requestedService || 'Complete Car Spa & Interior Detailing'
  );
  const [totalAmount, setTotalAmount] = useState<number>(lead?.totalAmount || 1999);
  const [appointmentDate, setAppointmentDate] = useState(defaultDateStr);
  const [appointmentSlot, setAppointmentSlot] = useState('10:00 AM - 12:00 PM');
  const [assignedHubId, setAssignedHubId] = useState(defaultHub?.id || (activeHubs[0]?.id ?? ''));
  const [assignedTechnician, setAssignedTechnician] = useState(lead?.assignedAgent || users[0]?.username || '');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'ONLINE_UPI' | 'CARD'>('ONLINE_UPI');
  const [remarks, setRemarks] = useState(lead?.remarks || 'Converted from CRM pipeline');

  if (!lead) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) return;

    onConfirmConversion({
      leadId: lead.id,
      customerName,
      customerPhone,
      serviceAddress,
      carBrand,
      carModel,
      carRegNo,
      requestedService,
      totalAmount,
      appointmentDate,
      appointmentSlot,
      assignedHubId,
      assignedTechnician,
      paymentMethod,
      remarks
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                1-Click Lead-to-Order Conversion Wizard
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Converts lead <strong className="font-mono text-slate-700">{lead.id}</strong> into an active scheduled service order without retyping data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Customer Info */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              Customer Contact Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone Number (+91) *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Service Address / Doorstep Location</label>
                <input
                  type="text"
                  value={serviceAddress}
                  onChange={e => setServiceAddress(e.target.value)}
                  placeholder="Street, Apartment, Locality, City..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-indigo-600" />
              Vehicle Specification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Car Brand</label>
                <input
                  type="text"
                  value={carBrand}
                  onChange={e => setCarBrand(e.target.value)}
                  placeholder="e.g. Honda, Hyundai, BMW"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Car Model</label>
                <input
                  type="text"
                  value={carModel}
                  onChange={e => setCarModel(e.target.value)}
                  placeholder="e.g. City, Creta, 3-Series"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Registration No.</label>
                <input
                  type="text"
                  value={carRegNo}
                  onChange={e => setCarRegNo(e.target.value.toUpperCase())}
                  placeholder="e.g. KA01AB1234"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Service & Pricing */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Service Package & Pricing
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Service Package</label>
                <input
                  type="text"
                  value={requestedService}
                  onChange={e => setRequestedService(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total Quotation (₹)</label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={e => setTotalAmount(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-black text-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Scheduling & Dispatch Assignment */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Schedule & Service Hub Dispatch
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Appointment Date</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={e => setAppointmentDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Time Slot</label>
                <select
                  value={appointmentSlot}
                  onChange={e => setAppointmentSlot(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="08:00 AM - 10:00 AM">08:00 AM - 10:00 AM (Early Slot)</option>
                  <option value="10:00 AM - 12:00 PM">10:00 AM - 12:00 PM (Morning Slot)</option>
                  <option value="01:00 PM - 03:00 PM">01:00 PM - 03:00 PM (Afternoon Slot)</option>
                  <option value="03:30 PM - 05:30 PM">03:30 PM - 05:30 PM (Evening Slot)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assigned Delivery Hub</label>
                <select
                  value={assignedHubId}
                  onChange={e => setAssignedHubId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {activeHubs.map(h => (
                    <option key={h.id} value={h.id}>
                      🏢 {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assign Lead Technician / Agent</label>
                <select
                  value={assignedTechnician}
                  onChange={e => setAssignedTechnician(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {users.map(u => (
                    <option key={u.username} value={u.username}>
                      👤 {u.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Service Order Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Create Service Order</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
