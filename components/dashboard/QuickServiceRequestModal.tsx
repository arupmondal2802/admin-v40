import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  Car,
  Calendar,
  Clock,
  MapPin,
  Phone,
  User as UserIcon,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Package,
  Wrench,
  AlertCircle,
  Tag,
  FileText,
  CreditCard,
  Check
} from 'lucide-react';
import { ExistingCustomerProfile } from '../../services/customerService';
import { VehicleCategoryTag, UserSubscription, SubscriptionPlan } from '../../types';
import {
  APPOINTMENT_TIME_SLOTS,
  VEHICLE_CATEGORY_TAGS,
  WASH_TYPES,
  CAR_CARE_TYPES,
  DEFAULT_WASH_PRICING_MATRIX,
  DEFAULT_CAR_CARE_PRICING_MATRIX
} from '../../constants';
import { getLocalTodayStr, toISTDateString } from '../../utils/dateTimeUtils';
import { VehicleActivitySummaryItem, VehicleServiceStat } from './RecentVehicleActivitySummary';
import { toast } from 'sonner';

export interface QuickServiceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: VehicleActivitySummaryItem | null;
  customer: ExistingCustomerProfile;
  initialService?: VehicleServiceStat | null;
  userSubscriptions?: UserSubscription[];
  subscriptionPlans?: SubscriptionPlan[];
  onSubmitOrder?: (orderDetails: any) => Promise<any> | void;
  onApplyToForm?: (
    vehicle: {
      carNumber: string;
      carBrandModel: string;
      vehicleCategoryTag?: VehicleCategoryTag;
    },
    service?: {
      name: string;
      category: VehicleServiceStat['category'];
    }
  ) => void;
}

export const QuickServiceRequestModal: React.FC<QuickServiceRequestModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  customer,
  initialService,
  userSubscriptions = [],
  subscriptionPlans = [],
  onSubmitOrder,
  onApplyToForm,
}) => {
  // Local state pre-filled from selected vehicle and customer
  const [carNumber, setCarNumber] = useState('');
  const [carBrandModel, setCarBrandModel] = useState('');
  const [vehicleCategoryTag, setVehicleCategoryTag] = useState<VehicleCategoryTag>(VehicleCategoryTag.Hatch);

  // Customer info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Service Selection
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<'wash' | 'care' | 'other'>('wash');
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const [isSubscriptionWash, setIsSubscriptionWash] = useState(false);

  // Scheduling & Logistics
  const [scheduledDate, setScheduledDate] = useState(getLocalTodayStr());
  const [scheduledTime, setScheduledTime] = useState(APPOINTMENT_TIME_SLOTS[0] || '10:00 AM - 12:00 PM');
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [internalNotes, setInternalNotes] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);

  // Synchronize initial state whenever modal opens or vehicle changes
  useEffect(() => {
    if (!isOpen || !vehicle) return;

    setCarNumber(vehicle.carNumber ? String(vehicle.carNumber) : '');
    setCarBrandModel(vehicle.carBrandModel ? String(vehicle.carBrandModel) : '');
    setVehicleCategoryTag(vehicle.vehicleCategoryTag || VehicleCategoryTag.Hatch);

    setFirstName(customer.firstName ? String(customer.firstName) : (customer.fullName?.split(' ')[0] || ''));
    setLastName(customer.lastName ? String(customer.lastName) : (customer.fullName?.split(' ').slice(1).join(' ') || ''));
    setMobileNumber(customer.mobileNumber ? String(customer.mobileNumber) : '');
    setStreetAddress(customer.streetAddress ? String(customer.streetAddress) : '');
    setCustomerEmail(customer.customerEmail ? String(customer.customerEmail) : '');

    // Check active subscription for this vehicle
    const cleanVeh = String(vehicle.carNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const now = new Date();
    const hasActiveSub = userSubscriptions.some(sub => {
      const p = String(sub.carNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const subPhone = String(sub.mobileNumber || '').replace(/\D/g, '').slice(-10);
      const custPhone = String(customer.mobileNumber || '').replace(/\D/g, '').slice(-10);
      return (
        p === cleanVeh &&
        (!custPhone || subPhone === custPhone) &&
        new Date(sub.endDate) > now
      );
    });
    setIsSubscriptionWash(hasActiveSub);

    // Pick initial service from argument, or vehicle top services, or default wash
    const targetService = initialService || (vehicle.topServices && vehicle.topServices.length > 0 ? vehicle.topServices[0] : null);
    if (targetService) {
      setSelectedServiceName(targetService.serviceName);
      if (targetService.category === 'wash' || (WASH_TYPES as readonly string[]).includes(targetService.serviceName)) {
        setSelectedServiceCategory('wash');
      } else if (targetService.category === 'care' || (CAR_CARE_TYPES as readonly string[]).includes(targetService.serviceName)) {
        setSelectedServiceCategory('care');
      } else {
        setSelectedServiceCategory('other');
      }
    } else {
      setSelectedServiceCategory('wash');
      setSelectedServiceName(WASH_TYPES[0] || 'Daily Spark');
    }

    setScheduledDate(getLocalTodayStr());
    setScheduledTime(APPOINTMENT_TIME_SLOTS[0] || '10:00 AM - 12:00 PM');
    setPriority('Normal');
    setInternalNotes('');
    setIsEditingVehicle(false);
  }, [isOpen, vehicle, customer, initialService, userSubscriptions]);

  // Compute calculated pricing based on vehicle category and selected service
  const priceCalculation = useMemo(() => {
    if (isSubscriptionWash && selectedServiceCategory === 'wash') {
      return { price: 0, mrp: 450, isCovered: true };
    }

    if (selectedServiceCategory === 'wash') {
      const matrix = (DEFAULT_WASH_PRICING_MATRIX as any)[selectedServiceName];
      if (matrix && matrix[vehicleCategoryTag]) {
        return {
          price: matrix[vehicleCategoryTag].price || 350,
          mrp: matrix[vehicleCategoryTag].mrp || 500,
          isCovered: false,
        };
      }
      return { price: 350, mrp: 500, isCovered: false };
    }

    if (selectedServiceCategory === 'care') {
      const matrix = (DEFAULT_CAR_CARE_PRICING_MATRIX as any)[selectedServiceName];
      if (matrix && matrix[vehicleCategoryTag]) {
        return {
          price: matrix[vehicleCategoryTag].price || 1800,
          mrp: matrix[vehicleCategoryTag].mrp || 2500,
          isCovered: false,
        };
      }
      return { price: 1800, mrp: 2500, isCovered: false };
    }

    return { price: 500, mrp: 750, isCovered: false };
  }, [selectedServiceCategory, selectedServiceName, vehicleCategoryTag, isSubscriptionWash]);

  // Quick date helper pills
  const handleSetRelativeDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const dateStr = d.toISOString().split('T')[0];
    setScheduledDate(dateStr);
  };

  if (!isOpen || !vehicle) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!String(carNumber || '').trim()) {
      toast.error('Vehicle registration plate is required.');
      return;
    }
    if (!String(mobileNumber || '').trim()) {
      toast.error('Customer mobile number is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalServiceSelection: string[] = [];
      if (selectedServiceCategory === 'wash') {
        finalServiceSelection.push('Car Washing');
      } else if (selectedServiceCategory === 'care') {
        finalServiceSelection.push('Car Care');
      } else {
        finalServiceSelection.push(selectedServiceName || 'Custom Services');
      }

      const orderPayload = {
        customer: {
          firstName: String(firstName || '').trim() || String(customer.firstName || 'Customer'),
          lastName: String(lastName || '').trim() || String(customer.lastName || ''),
          mobileNumber: String(mobileNumber || '').trim(),
          streetAddress: String(streetAddress || '').trim() || String(customer.streetAddress || 'Service Station / On-site'),
          carNumber: String(carNumber || '').toUpperCase().trim(),
          carBrandModel: String(carBrandModel || '').trim() || 'Vehicle',
          customerEmail: String(customerEmail || '').trim() || String(customer.customerEmail || ''),
          latitude: customer.latitude,
          longitude: customer.longitude,
        },
        vehicleCategoryTag: vehicleCategoryTag,
        serviceSelection: finalServiceSelection,
        scheduledDate: toISTDateString(scheduledDate),
        scheduledTime: scheduledTime,
        priority: priority,
        isSubscription: isSubscriptionWash,
        carWashDetails:
          selectedServiceCategory === 'wash'
            ? {
                washType: selectedServiceName,
                price: priceCalculation.price,
                mrp: priceCalculation.mrp,
              }
            : undefined,
        carCareDetails:
          selectedServiceCategory === 'care'
            ? {
                careType: selectedServiceName,
                price: priceCalculation.price,
                mrp: priceCalculation.mrp,
              }
            : undefined,
        grandTotal: priceCalculation.price,
        tags: [priority === 'Urgent' ? 'Urgent' : 'Quick-Dispatch'],
        internalNotes: internalNotes.trim()
          ? `[Quick Book for ${carNumber}] ${internalNotes.trim()}`
          : `[Quick Book] Rapid dispatch order for ${carNumber}`,
      };

      if (onSubmitOrder) {
        await onSubmitOrder(orderPayload);
      }

      toast.success(`Service request booked successfully for ${carNumber}!`, {
        description: `${selectedServiceName} on ${scheduledDate} (${scheduledTime})`,
      });
      onClose();
    } catch (err: any) {
      console.error('[QuickServiceRequestModal] Booking failed:', err);
      toast.error('Failed to create service request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="quick-service-request-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[94vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300">
              <Zap className="w-4 h-4 fill-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Quick Service Request
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Pre-filled Form
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate max-w-xs sm:max-w-md">
                Fast-track booking for {customer.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Selected Vehicle Banner (Pre-filled) */}
          <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                      {carNumber}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                      {vehicleCategoryTag}
                    </span>
                    {isSubscriptionWash && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Active Plan
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1 truncate">
                    {carBrandModel} • {vehicle.totalBookings} past booking{vehicle.totalBookings === 1 ? '' : 's'}
                    {vehicle.daysAgo !== null && vehicle.daysAgo !== undefined && ` • ${vehicle.daysAgo === 0 ? 'Serviced today' : `${vehicle.daysAgo}d ago`}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingVehicle(prev => !prev)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0 cursor-pointer"
              >
                {isEditingVehicle ? 'Done' : 'Edit'}
              </button>
            </div>

            {/* Expandable vehicle editor if details need adjusting */}
            {isEditingVehicle && (
              <div className="mt-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-900/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    value={carNumber}
                    onChange={e => setCarNumber(e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Brand & Model
                  </label>
                  <input
                    type="text"
                    value={carBrandModel}
                    onChange={e => setCarBrandModel(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Category Tag
                  </label>
                  <select
                    value={vehicleCategoryTag}
                    onChange={e => setVehicleCategoryTag(e.target.value as VehicleCategoryTag)}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {VEHICLE_CATEGORY_TAGS.map(tag => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Customer Summary Bar (Pre-filled) */}
          <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {firstName} {lastName}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400 font-mono">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>{mobileNumber}</span>
            </div>
            {streetAddress && (
              <div className="w-full flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-[11px] truncate pt-0.5">
                <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="truncate">{streetAddress}</span>
              </div>
            )}
          </div>

          {/* Service Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Select Service Package
              </label>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Pre-selected from vehicle history
              </span>
            </div>

            {/* Quick Pills for Top 3 Historical Services */}
            {vehicle.topServices && vehicle.topServices.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Recommended From Vehicle History:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {vehicle.topServices.map((topSvc, idx) => {
                    const isSelected = selectedServiceName === topSvc.serviceName;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedServiceName(topSvc.serviceName);
                          if (topSvc.category === 'wash' || (WASH_TYPES as readonly string[]).includes(topSvc.serviceName)) {
                            setSelectedServiceCategory('wash');
                          } else if (topSvc.category === 'care' || (CAR_CARE_TYPES as readonly string[]).includes(topSvc.serviceName)) {
                            setSelectedServiceCategory('care');
                          } else {
                            setSelectedServiceCategory('other');
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                        }`}
                      >
                        {idx === 0 && <Sparkles className="w-3 h-3 text-amber-300" />}
                        <span>{topSvc.serviceName}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                          isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {topSvc.count}x
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Service Category & Specific Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Service Type
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedServiceCategory('wash');
                      setSelectedServiceName(WASH_TYPES[0]);
                    }}
                    className={`py-1 text-xs font-bold rounded-md transition cursor-pointer text-center ${
                      selectedServiceCategory === 'wash'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Car Wash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedServiceCategory('care');
                      setSelectedServiceName(CAR_CARE_TYPES[0]);
                    }}
                    className={`py-1 text-xs font-bold rounded-md transition cursor-pointer text-center ${
                      selectedServiceCategory === 'care'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Car Care
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Package Name
                </label>
                <select
                  value={selectedServiceName}
                  onChange={e => setSelectedServiceName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {selectedServiceCategory === 'wash' ? (
                    WASH_TYPES.map(wash => (
                      <option key={wash} value={wash}>
                        {wash}
                      </option>
                    ))
                  ) : (
                    CAR_CARE_TYPES.map(care => (
                      <option key={care} value={care}>
                        {care}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Schedule Date & Time Slot */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                Schedule & Timing
              </label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => handleSetRelativeDate(0)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition ${
                    scheduledDate === getLocalTodayStr()
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleSetRelativeDate(1)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 cursor-pointer transition"
                >
                  Tomorrow
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Service Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  min={getLocalTodayStr()}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Time Slot
                </label>
                <select
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {APPOINTMENT_TIME_SLOTS.map(slot => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Priority & Internal Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Order Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
              >
                <option value="Normal">Normal Priority</option>
                <option value="High">High Priority</option>
                <option value="Urgent">Urgent Priority</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Notes / Instructions
              </label>
              <input
                type="text"
                placeholder="e.g. Gate code, key handover at reception..."
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Total & Price Summary */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-300">Estimated Total</span>
                {priceCalculation.isCovered && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-500/30 text-teal-300 border border-teal-400/30">
                    Subscription Wash
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {selectedServiceName} • {vehicleCategoryTag}
              </p>
            </div>

            <div className="text-right">
              {priceCalculation.isCovered ? (
                <div>
                  <span className="text-lg font-black text-teal-300">₹0</span>
                  <span className="text-xs line-through text-slate-400 ml-1.5">
                    ₹{priceCalculation.mrp}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-lg font-black text-amber-400">
                    ₹{priceCalculation.price}
                  </span>
                  {priceCalculation.mrp > priceCalculation.price && (
                    <span className="text-xs line-through text-slate-400 ml-1.5">
                      ₹{priceCalculation.mrp}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-200 dark:border-slate-800">
            {onApplyToForm ? (
              <button
                type="button"
                onClick={() => {
                  onApplyToForm(
                    {
                      carNumber,
                      carBrandModel,
                      vehicleCategoryTag,
                    },
                    {
                      name: selectedServiceName,
                      category: selectedServiceCategory,
                    }
                  );
                  toast.info(`Vehicle details pre-filled into order editor.`);
                  onClose();
                }}
                className="w-full sm:w-auto text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Open in Full Order Form →
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:from-amber-600 hover:to-amber-700 rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Booking...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    Confirm & Book Service
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickServiceRequestModal;
