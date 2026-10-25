
// FIX: Imports are now valid as types.ts has been updated.
import { VehicleCategory, PlanName, VehicleCategoryTag, PricingConfig, DeliveryHub } from './types';

export const SERVICE_PRICES = {
  carWashBase: 0,
  carWashSubscriptionDiscount: 0.2, // 20% discount
  tyreReplacement: 0,
};

export const VEHICLE_CATEGORY_TAGS: VehicleCategoryTag[] = Object.values(VehicleCategoryTag);

export const WASH_TYPES = [
    "Daily Spark",
    "Prime Polish",
    "CoreCare Wash",
    "Deluxe",
    "A Big Engine 360° Car Care",
];

// FIX: Renamed matrices for internal consistency and easier fallback in hook.
export const DEFAULT_WASH_PRICING_MATRIX = {
    "Daily Spark": {
        [VehicleCategoryTag.Micro]: { price: 300.00, mrp: 427.50 },
        [VehicleCategoryTag.Hatch]: { price: 329.00, mrp: 450.00 },
        [VehicleCategoryTag.Prime]: { price: 350.00, mrp: 487.50 },
        [VehicleCategoryTag.CrossOver]: { price: 350.00, mrp: 525.00 },
        [VehicleCategoryTag.Suv]: { price: 375.00, mrp: 562.50 },
        [VehicleCategoryTag.Luxury]: { price: 450.00, mrp: 675.00 },
    },
    "Prime Polish": {
        [VehicleCategoryTag.Micro]: { price: 400.00, mrp: 577.50 },
        [VehicleCategoryTag.Hatch]: { price: 429.00, mrp: 600.00 },
        [VehicleCategoryTag.Prime]: { price: 450.00, mrp: 637.50 },
        [VehicleCategoryTag.CrossOver]: { price: 450.00, mrp: 675.00 },
        [VehicleCategoryTag.Suv]: { price: 479.00, mrp: 712.50 },
        [VehicleCategoryTag.Luxury]: { price: 550.00, mrp: 825.00 },
    },
    "CoreCare Wash": {
        [VehicleCategoryTag.Micro]: { price: 600.00, mrp: 877.50 },
        [VehicleCategoryTag.Hatch]: { price: 629.00, mrp: 900.00 },
        [VehicleCategoryTag.Prime]: { price: 650.00, mrp: 937.50 },
        [VehicleCategoryTag.CrossOver]: { price: 650.00, mrp: 975.00 },
        [VehicleCategoryTag.Suv]: { price: 675.00, mrp: 1012.50 },
        [VehicleCategoryTag.Luxury]: { price: 750.00, mrp: 1125.00 },
    },
    "Deluxe Spa": {
        [VehicleCategoryTag.Micro]: { price: 1100.00, mrp: 1777.50 },
        [VehicleCategoryTag.Hatch]: { price: 1300.00, mrp: 1950.00 },
        [VehicleCategoryTag.Prime]: { price: 1500.00, mrp: 2250.00 },
        [VehicleCategoryTag.CrossOver]: { price: 1800.00, mrp: 2700.00 },
        [VehicleCategoryTag.Suv]: { price: 2000.00, mrp: 3000.00 },
        [VehicleCategoryTag.Luxury]: { price: 3000.00, mrp: 4500.00 },
    },
    "A Big Engine 360° Car Care": {
        [VehicleCategoryTag.Micro]: { price: 1850.00, mrp: 2775.00 },
        [VehicleCategoryTag.Hatch]: { price: 2200.00, mrp: 3300.00 },
        [VehicleCategoryTag.Prime]: { price: 2300.00, mrp: 3450.00 },
        [VehicleCategoryTag.CrossOver]: { price: 2600.00, mrp: 3900.00 },
        [VehicleCategoryTag.Suv]: { price: 2800.00, mrp: 4200.00 },
        [VehicleCategoryTag.Luxury]: { price: 3500.00, mrp: 5250.00 },
    }
};

export const CAR_CARE_TYPES = [
    "Polish (Interior & Exterior)",
    "Polish (Interior Only)",
    "Exterior Polish",
    "Hybrid Ceramic Polish (Interior & Exterior)",
    "Pure Ceramic Coating 1year",
    "Pure Ceramic Coating 2year",
    "Pure Ceramic Coating 3year"
];

export const DEFAULT_CAR_CARE_PRICING_MATRIX = {
    "Polish (Interior & Exterior)": {
        [VehicleCategoryTag.Micro]: { price: 1850, mrp: 2775 },
        [VehicleCategoryTag.Hatch]: { price: 2200, mrp: 3300 },
        [VehicleCategoryTag.Prime]: { price: 2300, mrp: 3450 },
        [VehicleCategoryTag.CrossOver]: { price: 2600, mrp: 3900 },
        [VehicleCategoryTag.Suv]: { price: 2800, mrp: 4200 },
        [VehicleCategoryTag.Luxury]: { price: 3500, mrp: 5250 },
    },
    "Polish (Interior Only)": {
        [VehicleCategoryTag.Micro]: { price: 555, mrp: 832.5 },
        [VehicleCategoryTag.Hatch]: { price: 660, mrp: 990 },
        [VehicleCategoryTag.Prime]: { price: 690, mrp: 1035 },
        [VehicleCategoryTag.CrossOver]: { price: 780, mrp: 1170 },
        [VehicleCategoryTag.Suv]: { price: 840, mrp: 1260 },
        [VehicleCategoryTag.Luxury]: { price: 1050, mrp: 1575 },
    },
    "Exterior Polish": {
        [VehicleCategoryTag.Micro]: { price: 1295, mrp: 1942.5 },
        [VehicleCategoryTag.Hatch]: { price: 1540, mrp: 2310 },
        [VehicleCategoryTag.Prime]: { price: 1610, mrp: 2415 },
        [VehicleCategoryTag.CrossOver]: { price: 1820, mrp: 2730 },
        [VehicleCategoryTag.Suv]: { price: 1960, mrp: 2940 },
        [VehicleCategoryTag.Luxury]: { price: 2450, mrp: 3675 },
    },
    "Hybrid Ceramic Polish (Interior & Exterior)": {
        [VehicleCategoryTag.Micro]: { price: 2850, mrp: 4275 },
        [VehicleCategoryTag.Hatch]: { price: 3400, mrp: 5100 },
        [VehicleCategoryTag.Prime]: { price: 3300, mrp: 4950 },
        [VehicleCategoryTag.CrossOver]: { price: 3600, mrp: 5400 },
        [VehicleCategoryTag.Suv]: { price: 3500, mrp: 5250 },
        [VehicleCategoryTag.Luxury]: { price: 6000, mrp: 9000 },
    },
    "Pure Ceramic Coating 1year": {
        [VehicleCategoryTag.Micro]: { price: 9999, mrp: 19999 },
        [VehicleCategoryTag.Hatch]: { price: 10999, mrp: 19999 },
        [VehicleCategoryTag.Prime]: { price: 11999, mrp: 19999 },
        [VehicleCategoryTag.CrossOver]: { price: 12999, mrp: 19999 },
        [VehicleCategoryTag.Suv]: { price: 13999, mrp: 19999 },
        [VehicleCategoryTag.Luxury]: { price: 16999, mrp: 19999 },
    },
    "Pure Ceramic Coating 2year": {
        [VehicleCategoryTag.Micro]: { price: 15999, mrp: 25999 },
        [VehicleCategoryTag.Hatch]: { price: 16999, mrp: 25999 },
        [VehicleCategoryTag.Prime]: { price: 17999, mrp: 25999 },
        [VehicleCategoryTag.CrossOver]: { price: 18999, mrp: 25999 },
        [VehicleCategoryTag.Suv]: { price: 19999, mrp: 25999 },
        [VehicleCategoryTag.Luxury]: { price: 16999, mrp: 25999 },
    },
    "Pure Ceramic Coating 3year": {
        [VehicleCategoryTag.Micro]: { price: 18999, mrp: 30999 },
        [VehicleCategoryTag.Hatch]: { price: 19999, mrp: 30999 },
        [VehicleCategoryTag.Prime]: { price: 21999, mrp: 30999 },
        [VehicleCategoryTag.CrossOver]: { price: 12999, mrp: 30999 },
        [VehicleCategoryTag.Suv]: { price: 23999, mrp: 30999 },
        [VehicleCategoryTag.Luxury]: { price: 30999, mrp: 30999 },
    }
};

export const DYNAMIC_ADDON_NAMES = [
    "Wiper Blade",
    "Windscreen Repellent",
    "Engine Degreaser",
    "Instant Crystal Polish",
    "Trim Restorer",
    "Chrome Polish",
];

export const DEFAULT_ADDON_PRICING_MATRIX = {
    "Wiper Blade": {
        [VehicleCategoryTag.Micro]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.Hatch]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.Prime]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.CrossOver]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.Suv]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.Luxury]: { price: 400, mrp: 480 },
    },
    "Windscreen Repellent": {
        [VehicleCategoryTag.Micro]: { price: 300, mrp: 360 },
        [VehicleCategoryTag.Hatch]: { price: 300, mrp: 360 },
        [VehicleCategoryTag.Prime]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.CrossOver]: { price: 450, mrp: 540 },
        [VehicleCategoryTag.Suv]: { price: 500, mrp: 600 },
        [VehicleCategoryTag.Luxury]: { price: 600, mrp: 720 },
    },
    "Engine Degreaser": {
        [VehicleCategoryTag.Micro]: { price: 1200, mrp: 1440 },
        [VehicleCategoryTag.Hatch]: { price: 1200, mrp: 1440 },
        [VehicleCategoryTag.Prime]: { price: 1200, mrp: 1440 },
        [VehicleCategoryTag.CrossOver]: { price: 1200, mrp: 1440 },
        [VehicleCategoryTag.Suv]: { price: 1200, mrp: 1440 },
        [VehicleCategoryTag.Luxury]: { price: 1200, mrp: 1440 },
    },
    "Instant Crystal Polish": {
        [VehicleCategoryTag.Micro]: { price: 100, mrp: 120 },
        [VehicleCategoryTag.Hatch]: { price: 150, mrp: 180 },
        [VehicleCategoryTag.Prime]: { price: 150, mrp: 180 },
        [VehicleCategoryTag.CrossOver]: { price: 150, mrp: 180 },
        [VehicleCategoryTag.Suv]: { price: 150, mrp: 180 },
        [VehicleCategoryTag.Luxury]: { price: 300, mrp: 360 },
    },
    "Trim Restorer": {
        [VehicleCategoryTag.Micro]: { price: 400, mrp: 480 },
        [VehicleCategoryTag.Hatch]: { price: 500, mrp: 600 },
        [VehicleCategoryTag.Prime]: { price: 600, mrp: 720 },
        [VehicleCategoryTag.CrossOver]: { price: 600, mrp: 720 },
        [VehicleCategoryTag.Suv]: { price: 700, mrp: 840 },
        [VehicleCategoryTag.Luxury]: { price: 700, mrp: 840 },
    },
    "Chrome Polish": {
        [VehicleCategoryTag.Micro]: { price: 200, mrp: 240 },
        [VehicleCategoryTag.Hatch]: { price: 200, mrp: 240 },
        [VehicleCategoryTag.Prime]: { price: 200, mrp: 240 },
        [VehicleCategoryTag.CrossOver]: { price: 250, mrp: 300 },
        [VehicleCategoryTag.Suv]: { price: 300, mrp: 360 },
        [VehicleCategoryTag.Luxury]: { price: 700, mrp: 840 },
    },
};

export const ADDON_CATEGORIES = [
    "Parts",
    "Lubricants",
    "Accessories",
    "Labor",
    "Other",
    "Legacy Add-on"
];

export const APPOINTMENT_TIME_SLOTS = [
    "00:00 - 01:00",
    "01:00 - 02:00",
    "02:00 - 03:00",
    "03:00 - 04:00",
    "04:00 - 05:00",
    "05:00 - 06:00",
    "06:00 - 07:00",
    "07:00 - 08:00",
    "08:00 - 09:00",
    "09:00 - 10:00",
    "10:00 - 11:00",
    "11:00 - 12:00",
    "12:00 - 13:00",
    "13:00 - 14:00",
    "14:00 - 15:00",
    "15:00 - 16:00",
    "16:00 - 17:00",
    "17:00 - 18:00",
    "18:00 - 19:00",
    "19:00 - 20:00",
    "20:00 - 21:00",
    "21:00 - 22:00",
    "22:00 - 23:00",
    "23:00 - 00:00"
];

// --- Subscription Constants ---
export const VEHICLE_CATEGORIES: VehicleCategory[] = Object.values(VehicleCategory);
export const PLAN_NAMES: PlanName[] = Object.values(PlanName);

export const ALL_PLAN_FEATURES = [
    "Interior Cleaning",
    "Underbody Spray",
    "Dashboard Polish",
    "Priority Booking",
    "Tyre Shine",
    "Wax Coating",
    
];

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
    wash: DEFAULT_WASH_PRICING_MATRIX,
    carCare: DEFAULT_CAR_CARE_PRICING_MATRIX,
    addons: DEFAULT_ADDON_PRICING_MATRIX
};

// =====================================================
// DYNAMIC HUBS & SERVICE RULES
// =====================================================

export const DEFAULT_DELIVERY_HUBS: DeliveryHub[] = [
    {
        id: "HUB-KOLKATA",
        name: "Kolkata Hub",
        latitude: 22.4981461,
        longitude: 88.3867093,
        type: "both"
    },
    {
        id: "HUB-KRISHNANAGAR",
        name: "Krishnanagar Hub",
        latitude: 23.4063,
        longitude: 88.5022,
        type: "both"
    }
];

export const HUBS = {
    washing: DEFAULT_DELIVERY_HUBS.map(h => ({ id: h.id, name: h.name, lat: h.latitude, lon: h.longitude })),
    detailing: DEFAULT_DELIVERY_HUBS.map(h => ({ id: h.id, name: h.name, lat: h.latitude, lon: h.longitude }))
};

export interface ProductRule {
    type: string;
    category: string;
    priority?: number;
    hub?: string;
    freeRadius?: number;
    maxRadius?: number;
    chargePerKm?: number;
    roundTrip?: boolean;
    requiresMainService?: boolean;
}

export const PRODUCT_RULES: Record<string, ProductRule> = {
    daily_spark: {
        type: "main",
        category: "washing",
        priority: 10,
        hub: "washing",
        freeRadius: 15,
        maxRadius: 15,
        chargePerKm: 6,
        roundTrip: true
    },
    prime_polish: {
        type: "main",
        category: "washing",
        priority: 20,
        hub: "washing",
        freeRadius: 15,
        maxRadius: 15,
        chargePerKm: 6,
        roundTrip: true
    },
    corecare_wash: {
        type: "main",
        category: "washing",
        priority: 30,
        hub: "washing",
        freeRadius: 15,
        maxRadius: 15,
        chargePerKm: 6,
        roundTrip: true
    },
    deluxe_spa: {
        type: "main",
        category: "washing",
        priority: 40,
        hub: "washing",
        freeRadius: 20,
        maxRadius: 20,
        chargePerKm: 6,
        roundTrip: true
    },
    abe360: {
        type: "main",
        category: "washing",
        priority: 50,
        hub: "washing",
        freeRadius: 25,
        maxRadius: 25,
        chargePerKm: 6,
        roundTrip: true
    },
    polish_interior: {
        type: "main",
        category: "detailing",
        priority: 60,
        hub: "detailing",
        freeRadius: 15,
        maxRadius: 45,
        chargePerKm: 6,
        roundTrip: true
    },
    polish_exterior: {
        type: "main",
        category: "detailing",
        priority: 70,
        hub: "detailing",
        freeRadius: 25,
        maxRadius: 45,
        chargePerKm: 6,
        roundTrip: true
    },
    polish_full: {
        type: "main",
        category: "detailing",
        priority: 80,
        hub: "detailing",
        freeRadius: 25,
        maxRadius: 45,
        chargePerKm: 6,
        roundTrip: true
    },
    hybrid_ceramic: {
        type: "main",
        category: "detailing",
        priority: 90,
        hub: "detailing",
        freeRadius: 35,
        maxRadius: 45,
        chargePerKm: 6,
        roundTrip: true
    },
    ceramic_1yr: {
        type: "main",
        category: "ceramic",
        priority: 100,
        hub: "detailing",
        freeRadius: 100,
        maxRadius: 100,
        chargePerKm: 0,
        roundTrip: false
    },
    ceramic_2yr: {
        type: "main",
        category: "ceramic",
        priority: 110,
        hub: "detailing",
        freeRadius: 100,
        maxRadius: 100,
        chargePerKm: 0,
        roundTrip: false
    },
    graphene_3yr: {
        type: "main",
        category: "ceramic",
        priority: 120,
        hub: "detailing",
        freeRadius: 100,
        maxRadius: 100,
        chargePerKm: 0,
        roundTrip: false
    },
    trim_restoration: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    },
    headlight_restoration: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    },
    chrome_polish: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    },
    bug_tar: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    },
    odor_blaster: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    },
    ac_cleaning: {
        type: "addon",
        category: "addon",
        requiresMainService: true
    }
};

export function mapServiceToPricingRule(
    serviceSelectionName: string,
    subType?: string,
    customServices?: any[]
): string | null {
    if (customServices && customServices.length > 0) {
        const match = customServices.find(s => 
            s.name.toLowerCase() === serviceSelectionName.toLowerCase() ||
            (subType && s.name.toLowerCase() === `${serviceSelectionName} (${subType})`.toLowerCase()) ||
            (subType && s.name.toLowerCase() === subType.toLowerCase())
        );
        if (match && match.pricingCode) {
            return match.pricingCode;
        }
    }

    if (!serviceSelectionName) return null;
    const nameLower = serviceSelectionName.toLowerCase();
    
    if (nameLower.includes("washing") || nameLower === "car washing") {
        if (!subType) return "daily_spark";
        const typeLower = subType.toLowerCase();
        if (typeLower.includes("daily spark") || typeLower.includes("daily_spark")) return "daily_spark";
        if (typeLower.includes("prime polish") || typeLower.includes("prime_polish")) return "prime_polish";
        if (typeLower.includes("corecare") || typeLower.includes("corecare_wash")) return "corecare_wash";
        if (typeLower.includes("deluxe")) return "deluxe_spa";
        if (typeLower.includes("360") || typeLower.includes("abe360")) return "abe360";
        return "daily_spark";
    }
    
    if (nameLower.includes("care") || nameLower === "car care") {
        if (!subType) return "polish_interior";
        const typeLower = subType.toLowerCase();
        if (typeLower.includes("interior only") || typeLower.includes("interior_only") || typeLower.includes("polish_interior")) return "polish_interior";
        if (typeLower.includes("exterior polish") || typeLower.includes("polish_exterior")) return "polish_exterior";
        if (typeLower.includes("interior & exterior") || typeLower.includes("polish_full")) return "polish_full";
        if (typeLower.includes("hybrid ceramic") || typeLower.includes("hybrid_ceramic")) return "hybrid_ceramic";
        if (typeLower.includes("1year") || typeLower.includes("1 yr") || typeLower.includes("ceramic_1yr")) return "ceramic_1yr";
        if (typeLower.includes("2year") || typeLower.includes("2 yr") || typeLower.includes("ceramic_2yr")) return "ceramic_2yr";
        if (typeLower.includes("3year") || typeLower.includes("3 yr") || typeLower.includes("graphene_3yr")) return "graphene_3yr";
        return "polish_interior";
    }
    
    if (nameLower.includes("trim")) return "trim_restoration";
    if (nameLower.includes("headlight")) return "headlight_restoration";
    if (nameLower.includes("chrome")) return "chrome_polish";
    if (nameLower.includes("bug")) return "bug_tar";
    if (nameLower.includes("odor")) return "odor_blaster";
    if (nameLower.includes("ac")) return "ac_cleaning";
    
    return null;
}

export function calculateGeodesicDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

export function findNearestHub(hubType: string, lat: number, lon: number, customHubs?: any[]) {
    const hubsToSearch = (customHubs && customHubs.length > 0) ? customHubs : DEFAULT_DELIVERY_HUBS;
    
    let filtered = hubsToSearch.filter(h => {
        const type = (h.type || 'both').toLowerCase();
        const targetType = (hubType || '').toLowerCase();
        return type === 'both' || type === targetType || !targetType;
    });

    if (filtered.length === 0) {
        filtered = hubsToSearch;
    }

    let nearest = filtered[0];
    let nearestLat = nearest.latitude ?? nearest.lat ?? 0;
    let nearestLon = nearest.longitude ?? nearest.lon ?? 0;
    let minDistance = calculateGeodesicDistanceKm(lat, lon, nearestLat, nearestLon);

    for (let i = 1; i < filtered.length; i++) {
        const hLat = filtered[i].latitude ?? filtered[i].lat ?? 0;
        const hLon = filtered[i].longitude ?? filtered[i].lon ?? 0;
        const dist = calculateGeodesicDistanceKm(lat, lon, hLat, hLon);
        if (dist < minDistance) {
            minDistance = dist;
            nearest = filtered[i];
            nearestLat = hLat;
            nearestLon = hLon;
        }
    }

    return {
        hub: {
            id: nearest.id,
            name: nearest.name,
            lat: nearestLat,
            lon: nearestLon,
            type: nearest.type || 'both'
        },
        distanceKm: minDistance
    };
}

export interface TravelChargeCalculationResult {
    serviceCharges: {
        serviceName: string;
        pricingCode: string;
        hubName: string;
        distanceKm: number;
        freeRadius: number;
        maxRadius: number;
        charge: number;
        isOutOfRange: boolean;
    }[];
    hubSummaries: Record<string, {
        hubId: string;
        hubName: string;
        distanceKm: number;
        maxCharge: number;
        hasOutOfRange: boolean;
    }>;
    totalTravelCharge: number;
    isOutOfRangeAny: boolean;
}

export function calculateTravelCharges(
    serviceSelection: string[],
    lat: number | undefined,
    lon: number | undefined,
    carWashType?: string,
    carCareType?: string,
    customHubs?: any[],
    customRules?: any[],
    customServices?: any[]
): TravelChargeCalculationResult {
    const result: TravelChargeCalculationResult = {
        serviceCharges: [],
        hubSummaries: {},
        totalTravelCharge: 0,
        isOutOfRangeAny: false
    };

    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
        return result;
    }

    const rulesLookup = customRules && customRules.length > 0
        ? customRules.reduce((acc, r) => {
            acc[r.id] = r;
            return acc;
          }, {} as Record<string, any>)
        : PRODUCT_RULES;

    serviceSelection.forEach(serviceName => {
        let subType: string | undefined = undefined;
        if (serviceName === "Car Washing") subType = carWashType;
        if (serviceName === "Car Care") subType = carCareType;

        const pricingCode = mapServiceToPricingRule(serviceName, subType, customServices) || 'custom_predefined';
        const rule = rulesLookup[pricingCode];

        const customServiceMatch = customServices?.find(s => 
            s.name.toLowerCase() === serviceName.toLowerCase() || 
            (subType && s.name.toLowerCase() === `${serviceName} (${subType})`.toLowerCase()) ||
            (subType && s.name.toLowerCase() === subType.toLowerCase())
        );

        if (!rule && !customServiceMatch) return;
        if (rule && rule.type !== "main" && !customServiceMatch) return;

        const hubType = rule?.hub || "washing";
        const nearest = findNearestHub(hubType, lat, lon, customHubs && customHubs.length > 0 ? customHubs : DEFAULT_DELIVERY_HUBS);

        const dist = nearest.distanceKm;
        let freeRad = rule?.freeRadius !== undefined ? parseFloat(rule.freeRadius) : 0;
        let maxRad = rule?.maxRadius !== undefined ? parseFloat(rule.maxRadius) : 0;
        let chargePerKm = rule?.chargePerKm !== undefined ? parseFloat(rule.chargePerKm) : 0;
        let baseFee = 0;
        let roundTrip = rule?.roundTrip === true || String(rule?.roundTrip).toUpperCase() === 'TRUE';

        if (customServiceMatch) {
            if (customServiceMatch.freeRadiusKm !== undefined && customServiceMatch.freeRadiusKm !== null) {
                freeRad = parseFloat(customServiceMatch.freeRadiusKm);
            }
            if (customServiceMatch.serviceableRadiusKm !== undefined && customServiceMatch.serviceableRadiusKm !== null) {
                maxRad = parseFloat(customServiceMatch.serviceableRadiusKm);
            }
            if (customServiceMatch.convenienceFeePerKm !== undefined && customServiceMatch.convenienceFeePerKm !== null) {
                chargePerKm = parseFloat(customServiceMatch.convenienceFeePerKm);
            }
            if (customServiceMatch.baseConvenienceFee !== undefined && customServiceMatch.baseConvenienceFee !== null) {
                baseFee = parseFloat(customServiceMatch.baseConvenienceFee);
            }
        }

        const isOutOfRange = maxRad > 0 && dist > maxRad;

        let charge = 0;
        if (dist > freeRad) {
            const extraKm = dist - freeRad;
            charge = baseFee + (extraKm * chargePerKm);
            if (roundTrip) {
                charge *= 2;
            }
        } else {
            charge = baseFee;
        }

        result.serviceCharges.push({
            serviceName,
            pricingCode: rule ? pricingCode : 'custom_predefined',
            hubName: nearest.hub.name,
            distanceKm: dist,
            freeRadius: freeRad,
            maxRadius: maxRad,
            charge,
            isOutOfRange
        });

        if (isOutOfRange) {
            result.isOutOfRangeAny = true;
        }

        const hubId = nearest.hub.id;
        if (!result.hubSummaries[hubId]) {
            result.hubSummaries[hubId] = {
                hubId,
                hubName: nearest.hub.name,
                distanceKm: dist,
                maxCharge: charge,
                hasOutOfRange: isOutOfRange
            };
        } else {
            const summary = result.hubSummaries[hubId];
            summary.maxCharge = Math.max(summary.maxCharge, charge);
            summary.hasOutOfRange = summary.hasOutOfRange || isOutOfRange;
        }
    });

    let total = 0;
    Object.values(result.hubSummaries).forEach(summary => {
        total += summary.maxCharge;
    });
    result.totalTravelCharge = total;

    return result;
}
