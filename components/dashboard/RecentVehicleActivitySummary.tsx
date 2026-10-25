import React, { useState, useMemo } from 'react';
import {
  Car,
  Sparkles,
  Wrench,
  Clock,
  Check,
  ShieldCheck,
  Package,
  BatteryCharging,
  Disc,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ArrowRight,
  Plus,
  Calendar,
  History,
  Zap
} from 'lucide-react';
import { ExistingCustomerProfile, SavedVehicleDetail, getDaysAgo } from '../../services/customerService';
import { Service, UserSubscription, SubscriptionPlan, VehicleCategoryTag } from '../../types';
import { WASH_TYPES, CAR_CARE_TYPES } from '../../constants';

const QuickServiceRequestModal = React.lazy(() => import('./QuickServiceRequestModal'));

export interface VehicleServiceStat {
  serviceName: string;
  count: number;
  percentage: number;
  category: 'wash' | 'care' | 'addon' | 'tyre_battery' | 'custom' | 'subscription' | 'other';
  lastServicedDate?: string;
}

export interface VehicleActivitySummaryItem {
  carNumber: string;
  carBrandModel: string;
  vehicleCategoryTag?: VehicleCategoryTag;
  totalBookings: number;
  lastServiceDate?: string;
  daysAgo?: number | null;
  topServices: VehicleServiceStat[];
  allServicesCount: number;
  activeSubscriptionPlan?: string;
  isCurrentVehicle: boolean;
}

interface RecentVehicleActivitySummaryProps {
  customer: ExistingCustomerProfile;
  allSubmissions: Service[];
  userSubscriptions?: UserSubscription[];
  subscriptionPlans?: SubscriptionPlan[];
  currentCarNumber?: string;
  onSelectVehicle?: (vehicle: {
    carNumber: string;
    carBrandModel: string;
    vehicleCategoryTag?: VehicleCategoryTag;
  }) => void;
  onApplyService?: (serviceName: string, category: VehicleServiceStat['category'], vehicle: {
    carNumber: string;
    carBrandModel: string;
    vehicleCategoryTag?: VehicleCategoryTag;
  }) => void;
  onQuickBook?: (vehicle: VehicleActivitySummaryItem, service?: VehicleServiceStat) => void;
  onCreateOrder?: (orderDetails: any) => Promise<any> | void;
}

const cleanPlate = (s?: any) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const cleanPhone = (s?: any) => String(s ?? '').replace(/\D/g, '').slice(-10);

export const RecentVehicleActivitySummary: React.FC<RecentVehicleActivitySummaryProps> = ({
  customer,
  allSubmissions,
  userSubscriptions = [],
  subscriptionPlans = [],
  currentCarNumber,
  onSelectVehicle,
  onApplyService,
  onQuickBook,
  onCreateOrder,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isQuickBookModalOpen, setIsQuickBookModalOpen] = useState(false);
  const [selectedQuickBookVehicle, setSelectedQuickBookVehicle] = useState<VehicleActivitySummaryItem | null>(null);
  const [selectedQuickBookService, setSelectedQuickBookService] = useState<VehicleServiceStat | null>(null);

  const handleOpenQuickBook = (vehicle: VehicleActivitySummaryItem, service?: VehicleServiceStat) => {
    setSelectedQuickBookVehicle(vehicle);
    setSelectedQuickBookService(service || (vehicle.topServices.length > 0 ? vehicle.topServices[0] : null));
    setIsQuickBookModalOpen(true);
    if (onQuickBook) {
      onQuickBook(vehicle, service);
    }
  };

  // Compute the last 3 vehicles and their top 3 most common services
  const vehicleSummaries: VehicleActivitySummaryItem[] = useMemo(() => {
    if (!customer) return [];

    const custPhone = cleanPhone(customer.mobileNumber);
    const vehicleMap = new Map<string, {
      carNumber: string;
      carBrandModel: string;
      vehicleCategoryTag?: VehicleCategoryTag;
      lastUsedDate?: string;
      daysAgo?: number | null;
      bookingCount: number;
    }>();

    // 1. Seed vehicles from savedVehicles in profile
    (customer.savedVehicles || []).forEach(v => {
      const plate = cleanPlate(v.carNumber);
      if (plate) {
        vehicleMap.set(plate, {
          carNumber: String(v.carNumber || '').trim(),
          carBrandModel: String(v.carBrandModel || '').trim(),
          vehicleCategoryTag: v.vehicleCategoryTag,
          lastUsedDate: v.lastUsedDate,
          daysAgo: v.daysAgo,
          bookingCount: v.bookingCount || 0,
        });
      }
    });

    // 2. Discover any additional vehicles from historical submissions for this customer phone
    (allSubmissions || []).forEach(sub => {
      if (!sub.carNumber) return;
      const subPhone = cleanPhone(sub.mobileNumber);
      const isCustOrder = Boolean(custPhone && subPhone && subPhone === custPhone);
      const plate = cleanPlate(sub.carNumber);

      if (plate && (isCustOrder || vehicleMap.has(plate))) {
        const subDate = sub.scheduledDate || (sub as any).createdAt || sub.timestamp;
        const existing = vehicleMap.get(plate);
        if (existing) {
          existing.bookingCount += 1;
          if (subDate && (!existing.lastUsedDate || subDate > existing.lastUsedDate)) {
            existing.lastUsedDate = subDate;
            existing.daysAgo = getDaysAgo(subDate);
          }
          if (!existing.carBrandModel && sub.carBrandModel) {
            existing.carBrandModel = String(sub.carBrandModel);
          }
          if (!existing.vehicleCategoryTag && sub.vehicleCategoryTag) {
            existing.vehicleCategoryTag = sub.vehicleCategoryTag;
          }
        } else if (isCustOrder) {
          vehicleMap.set(plate, {
            carNumber: String(sub.carNumber || '').trim(),
            carBrandModel: String(sub.carBrandModel || '').trim(),
            vehicleCategoryTag: sub.vehicleCategoryTag,
            lastUsedDate: subDate,
            daysAgo: getDaysAgo(subDate),
            bookingCount: 1,
          });
        }
      }
    });

    // Also check user subscriptions for this customer
    (userSubscriptions || []).forEach(sub => {
      const subPhone = cleanPhone(sub.mobileNumber);
      if (custPhone && subPhone && subPhone === custPhone && sub.carNumber) {
        const plate = cleanPlate(sub.carNumber);
        if (plate && !vehicleMap.has(plate)) {
          vehicleMap.set(plate, {
            carNumber: String(sub.carNumber || '').trim(),
            carBrandModel: String(sub.carBrandModel || ''),
            lastUsedDate: sub.startDate,
            daysAgo: getDaysAgo(sub.startDate),
            bookingCount: 1,
          });
        }
      }
    });

    const allVehicles = Array.from(vehicleMap.values());

    // Sort to get the last vehicles: most recent first (daysAgo ascending, nulls last), then booking count descending
    allVehicles.sort((a, b) => {
      const aDays = a.daysAgo ?? 99999;
      const bDays = b.daysAgo ?? 99999;
      if (aDays !== bDays) return aDays - bDays;
      return (b.bookingCount || 0) - (a.bookingCount || 0);
    });

    // Take the last 3 vehicles
    const last3Vehicles = allVehicles.slice(0, 3);

    // Compute top 3 services for each of the last 3 vehicles
    return last3Vehicles.map(veh => {
      const vehPlate = cleanPlate(veh.carNumber);
      const isCurrent = cleanPlate(currentCarNumber) === vehPlate;

      // Filter all submissions matching this vehicle
      const matchingSubmissions = (allSubmissions || []).filter(sub => {
        const subPlate = cleanPlate(sub.carNumber);
        if (subPlate && vehPlate && subPlate === vehPlate) return true;
        // Check phone + model fallback
        const subPhone = cleanPhone(sub.mobileNumber);
        if (custPhone && subPhone && subPhone === custPhone) {
          const m1 = String(veh.carBrandModel || '').toLowerCase().trim();
          const m2 = String(sub.carBrandModel || '').toLowerCase().trim();
          if (m1 && m2 && (m1 === m2 || m1.includes(m2) || m2.includes(m1))) return true;
        }
        return false;
      });

      // Frequency map of service names
      const serviceCounts = new Map<string, {
        count: number;
        category: VehicleServiceStat['category'];
        lastDate?: string;
      }>();

      const recordService = (name: any, category: VehicleServiceStat['category'], date?: string) => {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        const existing = serviceCounts.get(cleanName);
        if (existing) {
          existing.count += 1;
          if (date && (!existing.lastDate || date > existing.lastDate)) {
            existing.lastDate = date;
          }
        } else {
          serviceCounts.set(cleanName, { count: 1, category, lastDate: date });
        }
      };

      for (const sub of matchingSubmissions) {
        const orderDate = sub.scheduledDate || (sub as any).createdAt || sub.timestamp;

        // 1. Car Wash Details (washType)
        if (sub.carWashDetails?.washType) {
          recordService(sub.carWashDetails.washType, 'wash', orderDate);
        } else if (sub.serviceSelection && sub.serviceSelection.includes('Car Wash')) {
          recordService(sub.isSubscription ? 'Subscription Wash' : 'Car Wash', 'wash', orderDate);
        }

        // 2. Car Care Details (careType)
        if (sub.carCareDetails?.careType) {
          recordService(sub.carCareDetails.careType, 'care', orderDate);
        } else if (sub.serviceSelection && sub.serviceSelection.includes('Car Care')) {
          recordService('Car Care Detailing', 'care', orderDate);
        }

        // 3. Dynamic Addons
        if (Array.isArray(sub.dynamicAddons)) {
          for (const addon of sub.dynamicAddons) {
            if (addon.name) {
              recordService(addon.name, 'addon', orderDate);
            }
          }
        }

        // 4. Categorized Addons
        if (Array.isArray(sub.categorizedAddons)) {
          for (const addon of sub.categorizedAddons) {
            if (addon.productName) {
              recordService(addon.productName, 'addon', orderDate);
            }
          }
        }

        // 5. Custom Services
        if (Array.isArray(sub.customServices)) {
          for (const custom of sub.customServices) {
            const desc = custom.serviceDescription || (custom as any).name;
            if (desc) {
              recordService(desc, 'custom', orderDate);
            }
          }
        }

        // 6. Tyre Replacement
        if (sub.tyreReplacementQuantity && sub.tyreReplacementQuantity > 0) {
          recordService('Tyre Replacement', 'tyre_battery', orderDate);
        }

        // 7. Battery Replacement
        if (sub.batteryReplacementQuantity && sub.batteryReplacementQuantity > 0) {
          recordService('Battery Replacement', 'tyre_battery', orderDate);
        }

        // 8. Other non-standard serviceSelection entries
        if (Array.isArray(sub.serviceSelection)) {
          for (const s of sub.serviceSelection) {
            if (
              s !== 'Car Wash' &&
              s !== 'Car Care' &&
              s !== 'Tyre Replacement' &&
              s !== 'Battery Replacement' &&
              s !== 'Addons'
            ) {
              recordService(s, 'other', orderDate);
            }
          }
        }
      }

      // Also check active subscriptions for this vehicle
      const now = new Date();
      const activeSub = (userSubscriptions || []).find(sub => {
        const p = cleanPlate(sub.carNumber);
        return p && p === vehPlate && new Date(sub.endDate) > now;
      });

      const matchedPlan = activeSub ? subscriptionPlans.find(p => p.id === activeSub.planId) : undefined;
      const planDisplayName = matchedPlan ? `${matchedPlan.name} Plan` : (activeSub ? 'Subscription Plan' : undefined);

      if (activeSub && serviceCounts.size === 0) {
        recordService(planDisplayName || 'Active Subscription Plan', 'subscription', activeSub.startDate);
      }

      const totalServiceOccurrences = Array.from(serviceCounts.values()).reduce((sum, item) => sum + item.count, 0);

      // Sort services by count descending
      const sortedServices = Array.from(serviceCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3) // TOP 3 MOST COMMON SERVICES
        .map(([name, data]) => ({
          serviceName: name,
          count: data.count,
          percentage: totalServiceOccurrences > 0 ? Math.round((data.count / totalServiceOccurrences) * 100) : 100,
          category: data.category,
          lastServicedDate: data.lastDate,
        }));

      return {
        carNumber: veh.carNumber,
        carBrandModel: veh.carBrandModel || 'Vehicle',
        vehicleCategoryTag: veh.vehicleCategoryTag,
        totalBookings: Math.max(matchingSubmissions.length, veh.bookingCount || 0),
        lastServiceDate: veh.lastUsedDate,
        daysAgo: veh.daysAgo,
        topServices: sortedServices,
        allServicesCount: totalServiceOccurrences,
        activeSubscriptionPlan: planDisplayName,
        isCurrentVehicle: isCurrent,
      };
    });
  }, [customer, allSubmissions, userSubscriptions, subscriptionPlans, currentCarNumber]);

  if (!customer || vehicleSummaries.length === 0) {
    return null;
  }

  const getCategoryBadgeStyle = (category: VehicleServiceStat['category']) => {
    switch (category) {
      case 'wash':
        return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'care':
        return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'addon':
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'tyre_battery':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'subscription':
        return 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getCategoryIcon = (category: VehicleServiceStat['category']) => {
    switch (category) {
      case 'wash':
        return <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
      case 'care':
        return <ShieldCheck className="w-3 h-3 text-purple-600 dark:text-purple-400" />;
      case 'addon':
        return <Package className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />;
      case 'tyre_battery':
        return <BatteryCharging className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
      case 'subscription':
        return <Check className="w-3 h-3 text-teal-600 dark:text-teal-400" />;
      default:
        return <Wrench className="w-3 h-3 text-slate-500" />;
    }
  };

  return (
    <div
      id="recent-vehicle-activity-summary"
      className="mt-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all"
    >
      {/* Header bar */}
      <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                Recent Vehicle Activity
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Top Services • Last {vehicleSummaries.length} Vehicle{vehicleSummaries.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Past service breakdown for {customer.fullName} • Click any vehicle or service to apply
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {customer.savedVehicles.length > 3 && (
            <span className="hidden sm:inline-block text-[11px] text-slate-400 font-medium">
              +{customer.savedVehicles.length - 3} more on file
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={isExpanded ? 'Collapse vehicle activity' : 'Expand vehicle activity'}
            aria-label="Toggle Recent Vehicle Activity"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content Grid: Last 3 Vehicles */}
      {isExpanded && (
        <div className="p-3.5 sm:p-4">
          <div className={`grid grid-cols-1 ${
            vehicleSummaries.length === 1
              ? 'md:grid-cols-1 max-w-xl mx-auto'
              : vehicleSummaries.length === 2
              ? 'md:grid-cols-2'
              : 'md:grid-cols-3'
          } gap-3 sm:gap-4`}>
            {vehicleSummaries.map((veh, idx) => {
              const maxCount = veh.topServices.length > 0 ? Math.max(...veh.topServices.map(s => s.count)) : 1;

              return (
                <div
                  key={veh.carNumber || idx}
                  className={`rounded-xl border transition-all flex flex-col justify-between overflow-hidden ${
                    veh.isCurrentVehicle
                      ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 hover:border-indigo-300 dark:hover:border-indigo-700/70'
                  }`}
                >
                  {/* Vehicle Header & Metadata */}
                  <div className="p-3.5 pb-2.5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                            {veh.carNumber}
                          </span>
                          {veh.vehicleCategoryTag && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {veh.vehicleCategoryTag}
                            </span>
                          )}
                        </div>
                        <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate mt-1">
                          {veh.carBrandModel}
                        </h5>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenQuickBook(veh)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-2xs hover:shadow-xs transition cursor-pointer"
                          title={`Quick Book service for ${veh.carNumber}`}
                        >
                          <Zap className="w-3 h-3 fill-current" />
                          Quick Book
                        </button>

                        {veh.isCurrentVehicle ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-600 text-white shadow-2xs flex-shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                          </span>
                        ) : onSelectVehicle ? (
                          <button
                            type="button"
                            onClick={() => onSelectVehicle({
                              carNumber: veh.carNumber,
                              carBrandModel: veh.carBrandModel,
                              vehicleCategoryTag: veh.vehicleCategoryTag,
                            })}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer flex-shrink-0"
                          >
                            Select
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Booking Stats / Recency */}
                    <div className="flex items-center space-x-3 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        <TrendingUp className="w-3 h-3 text-indigo-500" />
                        {veh.totalBookings} order{veh.totalBookings === 1 ? '' : 's'}
                      </span>
                      {veh.daysAgo !== null && veh.daysAgo !== undefined ? (
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {veh.daysAgo === 0 ? 'Serviced today' : `${veh.daysAgo}d ago`}
                        </span>
                      ) : (
                        <span className="text-slate-400">First registration</span>
                      )}
                    </div>
                  </div>

                  {/* Top 3 Common Services Breakdown */}
                  <div className="px-3.5 py-2.5 bg-white dark:bg-slate-850 border-t border-slate-200/70 dark:border-slate-800/80 flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-slate-400" />
                        Top 3 Common Services
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {veh.topServices.length} recorded
                      </span>
                    </div>

                    {veh.topServices.length > 0 ? (
                      <div className="space-y-2">
                        {veh.topServices.map((service, sIdx) => {
                          const relativeWidth = Math.max(15, Math.round((service.count / maxCount) * 100));
                          const rankColors = [
                            'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                            'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                            'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
                          ];

                          return (
                            <div
                              key={sIdx}
                              className="group p-2 rounded-lg bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 hover:border-indigo-200 dark:hover:border-indigo-800 transition"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                                  <span className={`w-4 h-4 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border flex-shrink-0 ${rankColors[sIdx] || rankColors[2]}`}>
                                    #{sIdx + 1}
                                  </span>
                                  <div className="flex items-center space-x-1 min-w-0">
                                    {getCategoryIcon(service.category)}
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                      {service.serviceName}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1 flex-shrink-0">
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {service.count}x
                                  </span>
                                  {onApplyService && (
                                    <button
                                      type="button"
                                      onClick={() => onApplyService(service.serviceName, service.category, {
                                        carNumber: veh.carNumber,
                                        carBrandModel: veh.carBrandModel,
                                        vehicleCategoryTag: veh.vehicleCategoryTag,
                                      })}
                                      className="opacity-80 group-hover:opacity-100 px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition cursor-pointer flex items-center gap-0.5"
                                      title={`Apply ${service.serviceName} to order`}
                                    >
                                      <Plus className="w-2.5 h-2.5" /> Apply
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickBook(veh, service)}
                                    className="opacity-80 group-hover:opacity-100 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white border border-amber-200 dark:border-amber-800 transition cursor-pointer flex items-center gap-0.5"
                                    title={`Quick book ${service.serviceName} for ${veh.carNumber}`}
                                  >
                                    <Zap className="w-2.5 h-2.5 fill-current" /> Book
                                  </button>
                                </div>
                              </div>

                              {/* Frequency bar */}
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    sIdx === 0
                                      ? 'bg-amber-500'
                                      : sIdx === 1
                                      ? 'bg-indigo-500'
                                      : 'bg-slate-400 dark:bg-slate-600'
                                  }`}
                                  style={{ width: `${relativeWidth}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <Sparkles className="w-5 h-5 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {veh.activeSubscriptionPlan
                            ? `Covered by ${veh.activeSubscriptionPlan}`
                            : 'No past service history recorded'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Ready for initial booking
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bottom Card Action Bar */}
                  <div className="p-2 bg-slate-50/90 dark:bg-slate-800/40 border-t border-slate-200/70 dark:border-slate-800 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenQuickBook(veh)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      Quick Book
                    </button>

                    {!veh.isCurrentVehicle && onSelectVehicle && (
                      <button
                        type="button"
                        onClick={() => onSelectVehicle({
                          carNumber: veh.carNumber,
                          carBrandModel: veh.carBrandModel,
                          vehicleCategoryTag: veh.vehicleCategoryTag,
                        })}
                        className="py-1.5 px-2.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                        title={`Switch active form vehicle to ${veh.carNumber}`}
                      >
                        <Car className="w-3 h-3 text-indigo-500" />
                        Switch
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Book Service Request Form Modal */}
      {isQuickBookModalOpen && selectedQuickBookVehicle && (
        <React.Suspense fallback={null}>
          <QuickServiceRequestModal
            isOpen={isQuickBookModalOpen}
            onClose={() => {
              setIsQuickBookModalOpen(false);
              setSelectedQuickBookVehicle(null);
              setSelectedQuickBookService(null);
            }}
            vehicle={selectedQuickBookVehicle}
            customer={customer}
            initialService={selectedQuickBookService}
            userSubscriptions={userSubscriptions}
            subscriptionPlans={subscriptionPlans}
            onSubmitOrder={onCreateOrder}
            onApplyToForm={(vehDetails, svcDetails) => {
              if (onSelectVehicle) {
                onSelectVehicle(vehDetails);
              }
              if (svcDetails && onApplyService) {
                onApplyService(svcDetails.name, svcDetails.category, vehDetails);
              }
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default React.memo(RecentVehicleActivitySummary);
