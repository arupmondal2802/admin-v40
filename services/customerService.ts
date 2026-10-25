import { Customer, Service, UserSubscription, CustomerBookEntry, VehicleCategoryTag } from '../types';

// Helper function to normalize mobile numbers to a consistent 10-digit format
export const normalizeMobileNumber = (phone: string | number | undefined | null): string => {
  if (!phone) return '';
  // Coerce to string to safely handle number types from data sources
  const phoneString = String(phone);
  // Remove all non-digit characters
  const digitsOnly = phoneString.replace(/\D/g, '');
  // If the number is longer than 10 digits (e.g., includes a country code), take the last 10.
  if (digitsOnly.length > 10) {
    return digitsOnly.slice(-10);
  }
  return digitsOnly;
};

export interface SavedVehicleDetail {
  carNumber: string;
  carBrandModel: string;
  vehicleCategoryTag?: VehicleCategoryTag;
  lastUsedDate?: string;
  daysAgo?: number | null;
  bookingCount: number;
}

export interface ExistingCustomerProfile {
  id: string;
  mobileNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  customerEmail?: string;
  streetAddress: string;
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  eLoc?: string;
  distanceKm?: number;
  loyaltyScore?: number;
  isSubscriber: boolean;
  subscriptionPlanName?: string;
  washesRemaining?: number;
  savedVehicles: SavedVehicleDetail[];
  totalBookings: number;
  lastBookingDate?: string;
  // Smart match metadata
  smartScore?: number;
  matchReasons?: string[];
  bestMatchingVehicleIndex?: number;
}

/**
 * Calculates days ago from an ISO or standard date string.
 */
export const getDaysAgo = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

/**
 * Standard Soundex algorithm for phonetic indexing.
 */
export const getSoundex = (s?: any): string => {
  if (!s) return '';
  const str = String(s).toUpperCase().replace(/[^A-Z]/g, '');
  if (!str) return '';

  const firstChar = str[0];
  const soundexMap: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };

  let code = firstChar;
  let prevCode = soundexMap[firstChar] || '0';

  for (let i = 1; i < str.length; i++) {
    const char = str[i];
    const currentCode = soundexMap[char] || '0';

    if (currentCode !== '0' && currentCode !== prevCode) {
      code += currentCode;
    }
    prevCode = currentCode;
    if (code.length === 4) break;
  }

  return code.padEnd(4, '0').slice(0, 4);
};

/**
 * Enhanced Metaphone & transliteration key for Indian & English names.
 * Standardizes common phonemes:
 * - "ee" / "i", "oo" / "u", "ph" / "f", "v" / "w", "b" / "bh", "sh" / "s", "dh" / "d", "th" / "t", "kh" / "k", etc.
 */
export const getPhoneticKey = (s?: any): string => {
  if (!s) return '';
  let str = String(s).toLowerCase().trim();

  // Normalize multi-character phonetic equivalents
  str = str
    .replace(/sh/g, 's')
    .replace(/sch/g, 's')
    .replace(/zh/g, 'z')
    .replace(/ph/g, 'f')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ch/g, 'c')
    .replace(/jh/g, 'j')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/bh/g, 'b')
    .replace(/ee/g, 'i')
    .replace(/ea/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/ai/g, 'e')
    .replace(/ay/g, 'e')
    .replace(/v/g, 'w')
    .replace(/z/g, 'j')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/[aeiouy]/g, '') // remove vowels to capture consonant skeleton
    .replace(/(.)\1+/g, '$1'); // deduplicate consecutive consonants

  return str;
};

/**
 * Levenshtein edit distance between two strings.
 */
export const getLevenshteinDistance = (a?: any, b?: any): number => {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const row = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s1.length; i++) {
    let prev = i;
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const val = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }
  return row[s2.length];
};

/**
 * Normalized fuzzy similarity score (0.0 to 1.0).
 */
export const getFuzzySimilarity = (a?: any, b?: any): number => {
  const s1 = String(a || '').toLowerCase().trim();
  const s2 = String(b || '').toLowerCase().trim();
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = getLevenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
};

/**
 * Cleans string to alphanumeric uppercase for plate & registration matching.
 */
export const cleanAlphaNumeric = (s?: any): string => {
  if (s === null || s === undefined) return '';
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

export interface SmartMatchResult {
  score: number;
  reasons: string[];
  bestVehicleIndex: number;
}

/**
 * Evaluates a candidate customer profile against a search query using:
 * - Partial mobile matching (suffix, prefix, substring)
 * - Phonetic similarity (Soundex & Indian/English Metaphone keys)
 * - Recent vehicle history (plate match, plate suffix, brand/model, days since last booking)
 * - Contextual multipliers (subscriber status, booking frequency)
 */
export const scoreCustomerProfile = (
  profile: ExistingCustomerProfile,
  rawQuery: string
): SmartMatchResult => {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) {
    const baseScore = (profile.isSubscriber ? 40 : 10) +
      Math.min(30, (profile.totalBookings || 0) * 5) +
      (profile.lastBookingDate && (getDaysAgo(profile.lastBookingDate) ?? 999) < 30 ? 20 : 0);
    return {
      score: baseScore,
      reasons: profile.isSubscriber ? ['★ Active Subscriber'] : ['Recent Customer'],
      bestVehicleIndex: 0
    };
  }

  let totalScore = 0;
  const reasons: string[] = [];
  let bestVehicleIndex = 0;
  let highestVehicleScore = -1;

  const queryDigits = query.replace(/\D/g, '');
  const cleanQ = cleanAlphaNumeric(query);
  const safeMobile = String(profile.mobileNumber || '');
  const normPhone = normalizeMobileNumber(safeMobile);
  const phoneDigits = safeMobile.replace(/\D/g, '');

  // 1. MOBILE PHONE NUMBER MATCHING (Full & Partial)
  if (queryDigits.length >= 2) {
    if (normPhone === queryDigits || phoneDigits === queryDigits) {
      totalScore += 100;
      reasons.push(`Exact Phone (+91 ${safeMobile})`);
    } else if (normPhone.startsWith(queryDigits) || phoneDigits.startsWith(queryDigits)) {
      const prefixWeight = 88 + Math.min(10, (queryDigits.length - 2) * 2);
      totalScore += prefixWeight;
      reasons.push(`Phone Prefix (${queryDigits}...)`);
    } else if (normPhone.endsWith(queryDigits) || phoneDigits.endsWith(queryDigits)) {
      const suffixWeight = 78 + Math.min(16, (queryDigits.length - 3) * 3);
      totalScore += suffixWeight;
      reasons.push(`Phone Suffix (...${queryDigits})`);
    } else if (normPhone.includes(queryDigits) || phoneDigits.includes(queryDigits)) {
      if (queryDigits.length >= 4) {
        totalScore += 65 + Math.min(15, queryDigits.length * 2);
        reasons.push(`Phone Contains (${queryDigits})`);
      }
    }
  }

  // 2. NAME & PHONETIC SIMILARITY MATCHING
  const queryWords = query.split(/[\s,.-]+/).filter(w => w.length >= 2);
  const safeFullName = String(profile.fullName || '').trim();
  const fullNameLower = safeFullName.toLowerCase();
  const nameWords = fullNameLower.split(/[\s,.-]+/).filter(w => w.length >= 1);

  if (fullNameLower === query) {
    totalScore += 96;
    reasons.push(`Exact Name Match`);
  } else if (fullNameLower.startsWith(query)) {
    totalScore += 86;
    reasons.push(`Name Prefix Match`);
  } else if (fullNameLower.includes(query)) {
    totalScore += 76;
    reasons.push(`Name Match`);
  } else {
    let foundPhonetic = false;
    let foundFuzzy = false;

    for (const qWord of queryWords) {
      const qSoundex = getSoundex(qWord);
      const qPhoneticKey = getPhoneticKey(qWord);

      for (const nWord of nameWords) {
        if (qWord === nWord) {
          totalScore += 50;
          reasons.push(`Matched Name (${nWord})`);
          break;
        }

        const nSoundex = getSoundex(nWord);
        const nPhoneticKey = getPhoneticKey(nWord);
        const sim = getFuzzySimilarity(qWord, nWord);

        // Phonetic Key Match (handles Pooja ~ Puja, Rahul ~ Rahool, etc.)
        if (qPhoneticKey && qPhoneticKey === nPhoneticKey && qWord.length >= 3) {
          totalScore += 78;
          reasons.push(`Phonetic Match (${qWord} ~ ${nWord})`);
          foundPhonetic = true;
          break;
        }

        // Soundex match
        if (qSoundex && qSoundex === nSoundex && qWord.length >= 3) {
          totalScore += 70;
          reasons.push(`Soundex Match (${qWord} ~ ${nWord})`);
          foundPhonetic = true;
          break;
        }

        // Fuzzy similarity for minor typos
        if (sim >= 0.78 && (qWord.length >= 4 || nWord.length >= 4)) {
          totalScore += Math.round(55 + sim * 25);
          reasons.push(`Similar Name (${nWord})`);
          foundFuzzy = true;
          break;
        }
      }
    }

    if (!foundPhonetic && !foundFuzzy && queryWords.length > 0) {
      const overallSim = getFuzzySimilarity(query, fullNameLower);
      if (overallSim >= 0.74) {
        totalScore += Math.round(50 + overallSim * 30);
        reasons.push(`Fuzzy Name (${safeFullName || 'Customer'})`);
      }
    }
  }

  // 3. RECENT VEHICLE HISTORY & REGISTRATION MATCHING
  if (profile.savedVehicles && profile.savedVehicles.length > 0) {
    profile.savedVehicles.forEach((veh, idx) => {
      let vehScore = 0;
      const cleanPlate = cleanAlphaNumeric(veh.carNumber);
      const plateDigits = cleanPlate.replace(/\D/g, '');
      const modelLower = String(veh.carBrandModel || '').toLowerCase();

      // Recency bonus for this specific vehicle
      let recencyBonus = 0;
      let recencyText = '';
      if (veh.daysAgo !== null && veh.daysAgo !== undefined) {
        if (veh.daysAgo <= 7) {
          recencyBonus = 25;
          recencyText = veh.daysAgo === 0 ? 'booked today' : `booked ${veh.daysAgo}d ago`;
        } else if (veh.daysAgo <= 30) {
          recencyBonus = 18;
          recencyText = `booked ${veh.daysAgo}d ago`;
        } else if (veh.daysAgo <= 90) {
          recencyBonus = 10;
          recencyText = `booked ${veh.daysAgo}d ago`;
        }
      }

      const freqBonus = Math.min(10, (veh.bookingCount || 0) * 3);

      // Plate exact match
      if (cleanQ && cleanPlate && cleanPlate === cleanQ) {
        vehScore += 95 + recencyBonus + freqBonus;
        reasons.push(`Car Plate: ${veh.carNumber}${recencyText ? ` (${recencyText})` : ''}`);
      }
      // Plate suffix / number digits match (e.g. 1234 on DL01AB1234)
      else if (queryDigits.length >= 3 && (cleanPlate.endsWith(queryDigits) || plateDigits === queryDigits)) {
        vehScore += 82 + recencyBonus + freqBonus;
        reasons.push(`Plate Digits: ...${queryDigits} on ${veh.carNumber}${recencyText ? ` (${recencyText})` : ''}`);
      }
      // Plate contains substring
      else if (cleanQ.length >= 3 && cleanPlate.includes(cleanQ)) {
        vehScore += 75 + recencyBonus + freqBonus;
        reasons.push(`Plate Match: ${veh.carNumber}${recencyText ? ` (${recencyText})` : ''}`);
      }
      // Brand / Model match
      else if (modelLower && (modelLower.includes(query) || query.includes(modelLower))) {
        vehScore += 68 + recencyBonus + freqBonus;
        reasons.push(`Vehicle Model: ${veh.carBrandModel}${recencyText ? ` (${recencyText})` : ''}`);
      }
      else {
        const modelSim = getFuzzySimilarity(query, modelLower);
        if (modelSim >= 0.75 && query.length >= 3) {
          vehScore += 55 + recencyBonus;
          reasons.push(`Similar Model: ${veh.carBrandModel}`);
        }
      }

      if (vehScore > highestVehicleScore) {
        highestVehicleScore = vehScore;
        bestVehicleIndex = idx;
      }
    });

    if (highestVehicleScore > 0) {
      totalScore += highestVehicleScore;
    }
  }

  // 4. ADDRESS & EMAIL MATCHING
  const safeAddress = String(profile.streetAddress || '').toLowerCase();
  if (safeAddress && safeAddress.includes(query)) {
    totalScore += 50;
    reasons.push(`Address Match`);
  }
  const safeEmail = String(profile.customerEmail || '').toLowerCase();
  if (safeEmail && safeEmail.includes(query)) {
    totalScore += 55;
    reasons.push(`Email Match`);
  }

  // 5. CONTEXTUAL BOOSTERS (Subscriber, Recency, Loyalty)
  if (profile.isSubscriber) {
    totalScore += 12;
    if (!reasons.includes('★ Active Subscriber')) {
      reasons.push('★ Active Subscriber');
    }
  }

  if (profile.totalBookings >= 2) {
    totalScore += Math.min(10, profile.totalBookings * 2);
  }

  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);

  return {
    score: totalScore,
    reasons: uniqueReasons,
    bestVehicleIndex
  };
};

/**
 * Direct API fetch for customer by phone number from server SSOT database
 */
export const fetchCustomerByMobileFromApi = async (mobile: string): Promise<ExistingCustomerProfile | null> => {
  const cleanDigits = String(mobile || '').replace(/\D/g, '');
  const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
  if (!last10 || last10.length < 3) return null;

  try {
    const res = await fetch(`/api/customer/lookup?phone=${encodeURIComponent(last10)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 'success' || !json.customer) return null;

    const c = json.customer;
    return {
      id: c.mobileNumber || last10,
      mobileNumber: c.mobileNumber || last10,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      fullName: c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer',
      customerEmail: c.customerEmail,
      streetAddress: c.streetAddress || '',
      houseNo: c.houseNo,
      streetName: c.streetName,
      city: c.city,
      stateName: c.stateName,
      pincode: c.pincode,
      latitude: c.latitude ? Number(c.latitude) : undefined,
      longitude: c.longitude ? Number(c.longitude) : undefined,
      eLoc: c.eLoc,
      distanceKm: c.distanceKm ? Number(c.distanceKm) : undefined,
      isSubscriber: Boolean(json.isSubscriber),
      washesRemaining: json.washesRemaining,
      subscriptionPlanName: json.subscriptionPlanName,
      savedVehicles: (json.savedVehicles || []).map((v: any) => ({
        carNumber: v.carNumber || '',
        carBrandModel: v.carBrandModel || '',
        vehicleCategoryTag: v.vehicleCategoryTag,
        bookingCount: v.bookingCount || 1
      })),
      totalBookings: (json.savedVehicles || []).length || 1
    };
  } catch (err) {
    console.warn('[customerService] Failed to fetch customer from API:', err);
    return null;
  }
};

export const findCustomerByMobile = async (
    mobileNumber: string,
    submissions: Service[] = [],
    userSubscriptions: UserSubscription[] = [],
    customerBook?: CustomerBookEntry[],
    serviceRequests?: any[]
): Promise<Array<{ customer: Customer; isSubscriber: boolean; washesRemaining?: number; subscriptionPlanName?: string }> | null> => {
    console.log(`[DEBUG] customerService: findCustomerByMobile called with mobileNumber: ${mobileNumber}`);
    const normalizedInput = normalizeMobileNumber(mobileNumber);
    const rawDigits = String(mobileNumber || '').replace(/\D/g, '');
    const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    
    // Support exact (10 digits) or partial phone search (>= 4 digits)
    const isExact = last10.length >= 10;
    const isPartial = last10.length >= 4 && last10.length < 10;

    if (!isExact && !isPartial) {
        console.log(`[DEBUG] customerService: Mobile number too short, returning null`);
        return null;
    }

    const matchesTarget = (phone?: string | number | null): boolean => {
      if (!phone) return false;
      const norm = normalizeMobileNumber(phone);
      const digits = String(phone).replace(/\D/g, '');
      if (isExact) {
        return norm === last10 || norm.endsWith(last10) || digits.endsWith(last10);
      }
      return norm.startsWith(last10) || norm.includes(last10) || digits.startsWith(last10) || digits.includes(last10);
    };

    const matchedBookEntries = customerBook?.filter(c => matchesTarget(c.mobileNumber)) || [];
    const primaryBookEntry = matchedBookEntries[0];
    const bookLoyaltyScore = primaryBookEntry?.loyaltyScore;

    // 1. Find all submissions and subscriptions for the number.
    const allEntries: (Service | UserSubscription)[] = [
        ...userSubscriptions.filter(sub => matchesTarget(sub.mobileNumber)),
        ...submissions.filter(s => matchesTarget(s.mobileNumber || (s as any).customerPhone || (s as any).phone || (s as any).customerMobile))
    ];

    // Also match service requests (leads, website orders)
    const matchedRequests = (serviceRequests || []).filter(r => 
      matchesTarget(r.customerPhone || r.phone || r.mobileNumber || r.customerMobile)
    );

    // If no local match is found and we are in browser with at least 5 digits, query backend API
    if (allEntries.length === 0 && matchedBookEntries.length === 0 && matchedRequests.length === 0) {
      if (typeof window !== 'undefined' && last10.length >= 5) {
        console.log(`[DEBUG] customerService: Querying backend /api/customer/lookup for ${last10}...`);
        const apiProfile = await fetchCustomerByMobileFromApi(last10);
        if (apiProfile) {
          const vehs = apiProfile.savedVehicles.length > 0 ? apiProfile.savedVehicles : [{ carNumber: '', carBrandModel: '' }];
          return vehs.map(v => ({
            customer: {
              mobileNumber: apiProfile.mobileNumber,
              firstName: apiProfile.firstName,
              lastName: apiProfile.lastName,
              streetAddress: apiProfile.streetAddress,
              carNumber: v.carNumber || '',
              carBrandModel: v.carBrandModel || '',
              customerEmail: apiProfile.customerEmail,
              latitude: apiProfile.latitude,
              longitude: apiProfile.longitude,
              eLoc: apiProfile.eLoc,
              distanceKm: apiProfile.distanceKm,
            },
            isSubscriber: apiProfile.isSubscriber,
            washesRemaining: apiProfile.washesRemaining,
            subscriptionPlanName: apiProfile.subscriptionPlanName
          }));
        }
      }
      console.log("[DEBUG] customerService: No customer data found for this mobile number.");
      return null;
    }

    // 2. Check for an active subscription status.
    const now = new Date();
    const activeSubscription = userSubscriptions
        .filter(sub => matchesTarget(sub.mobileNumber))
        .find(sub => new Date(sub.endDate) > now);
    
    const isSubscriber = !!activeSubscription;
    const washesRemaining = activeSubscription?.washesRemaining;
    const subscriptionPlanName = (activeSubscription as any)?.planName || activeSubscription?.planId;

    // 3. Collect all unique vehicles from submissions/subscriptions AND the customer book
    const latestEntryByCar = new Map<string, { 
        carNumber: string; 
        carBrandModel: string; 
        streetAddress: string; 
        customerEmail?: string;
        latitude?: number;
        longitude?: number;
        eLoc?: string;
        distanceKm?: number;
        vehicleCategoryTag?: VehicleCategoryTag;
        mobileNumber?: string;
        firstName?: string;
        lastName?: string;
    }>();

    // Seed from customer book entries if available
    matchedBookEntries.forEach(bookEntry => {
        (bookEntry.savedVehicles || []).forEach(v => {
            if (v.carNumber) {
                latestEntryByCar.set(v.carNumber.toUpperCase(), {
                    carNumber: v.carNumber,
                    carBrandModel: v.carBrandModel,
                    vehicleCategoryTag: v.vehicleCategoryTag,
                    streetAddress: bookEntry.streetAddress || '',
                    customerEmail: bookEntry.customerEmail,
                    latitude: bookEntry.latitude,
                    longitude: bookEntry.longitude,
                    eLoc: bookEntry.eLoc,
                    mobileNumber: String(bookEntry.mobileNumber || ''),
                    firstName: bookEntry.firstName,
                    lastName: bookEntry.lastName,
                });
            }
        });
    });

    // Update or add from submissions/subscriptions
    for (const entry of allEntries) {
        const carNumber = entry.carNumber ? String(entry.carNumber).toUpperCase() : '';
        if (!carNumber || !carNumber.trim()) continue;

        const svc = entry as Service;
        const entryMobile = entry.mobileNumber ? String(entry.mobileNumber) : '';
        const entryFirst = 'planId' in entry ? (entry as UserSubscription).customerFirstName : (entry as Service).customerFirstName;
        const entryLast = 'planId' in entry ? (entry as UserSubscription).customerLastName : (entry as Service).customerLastName;

        const existing = latestEntryByCar.get(carNumber);
        if (!existing) {
            latestEntryByCar.set(carNumber, {
                carNumber: entry.carNumber,
                carBrandModel: entry.carBrandModel,
                vehicleCategoryTag: svc.vehicleCategoryTag,
                streetAddress: entry.streetAddress,
                customerEmail: entry.customerEmail,
                latitude: svc.customerLatitude ?? (svc as any).latitude,
                longitude: svc.customerLongitude ?? (svc as any).longitude,
                eLoc: svc.customerELoc ?? (svc as any).eLoc,
                distanceKm: svc.customerDistanceKm ?? (svc as any).distanceKm,
                mobileNumber: entryMobile,
                firstName: entryFirst,
                lastName: entryLast,
            });
        } else {
            if (!existing.latitude && (svc.customerLatitude || (svc as any).latitude)) {
                existing.latitude = svc.customerLatitude ?? (svc as any).latitude;
            }
            if (!existing.longitude && (svc.customerLongitude || (svc as any).longitude)) {
                existing.longitude = svc.customerLongitude ?? (svc as any).longitude;
            }
            if (!existing.eLoc && (svc.customerELoc || (svc as any).eLoc)) {
                existing.eLoc = svc.customerELoc ?? (svc as any).eLoc;
            }
            if (!existing.distanceKm && (svc.customerDistanceKm || (svc as any).distanceKm)) {
                existing.distanceKm = svc.customerDistanceKm ?? (svc as any).distanceKm;
            }
            if (!existing.streetAddress && entry.streetAddress) {
                existing.streetAddress = entry.streetAddress;
            }
            if (!existing.customerEmail && entry.customerEmail) {
                existing.customerEmail = entry.customerEmail;
            }
            if (!existing.firstName && entryFirst) existing.firstName = entryFirst;
            if (!existing.lastName && entryLast) existing.lastName = entryLast;
            if (!existing.mobileNumber && entryMobile) existing.mobileNumber = entryMobile;
        }
    }

    // Add vehicles from matched service requests (leads)
    for (const req of matchedRequests) {
        const carNum = req.carRegNo ? String(req.carRegNo).toUpperCase().trim() : (req.carNumber ? String(req.carNumber).toUpperCase().trim() : '');
        if (carNum && !latestEntryByCar.has(carNum)) {
            const reqParts = String(req.customerName || '').split(' ');
            latestEntryByCar.set(carNum, {
                carNumber: carNum,
                carBrandModel: req.carBrandModel || `${req.carBrand || ''} ${req.carModel || ''}`.trim() || 'Vehicle',
                streetAddress: req.streetAddress || req.address || '',
                customerEmail: req.customerEmail || req.email,
                latitude: req.latitude ? Number(req.latitude) : undefined,
                longitude: req.longitude ? Number(req.longitude) : undefined,
                mobileNumber: String(req.customerPhone || req.phone || req.mobileNumber || ''),
                firstName: reqParts[0] || '',
                lastName: reqParts.slice(1).join(' ') || '',
            });
        }
    }

    const defaultFirstName = primaryBookEntry?.firstName || 
        allEntries.map(e => 'planId' in e ? (e as UserSubscription).customerFirstName : (e as Service).customerFirstName).find(Boolean) ||
        matchedRequests.map(r => String(r.customerName || '').split(' ')[0]).find(Boolean) || '';
    const defaultLastName = primaryBookEntry?.lastName || 
        allEntries.map(e => 'planId' in e ? (e as UserSubscription).customerLastName : (e as Service).customerLastName).find(Boolean) ||
        matchedRequests.map(r => String(r.customerName || '').split(' ').slice(1).join(' ')).find(Boolean) || '';

    // Create a profile for each unique car
    const profiles = Array.from(latestEntryByCar.values()).map(v => {
        const customer: Customer = {
            mobileNumber: String(v.mobileNumber || mobileNumber || ''),
            firstName: String(v.firstName || defaultFirstName || ''),
            lastName: String(v.lastName || defaultLastName || ''),
            streetAddress: v.streetAddress ? String(v.streetAddress) : '',
            carNumber: String(v.carNumber || ''),
            carBrandModel: String(v.carBrandModel || ''),
            customerEmail: v.customerEmail ? String(v.customerEmail) : undefined,
            latitude: v.latitude ?? primaryBookEntry?.latitude,
            longitude: v.longitude ?? primaryBookEntry?.longitude,
            eLoc: v.eLoc ?? primaryBookEntry?.eLoc,
            distanceKm: v.distanceKm,
            loyaltyScore: bookLoyaltyScore
        };
        return { customer, isSubscriber, washesRemaining, subscriptionPlanName };
    });
    
    if (profiles.length === 0 && primaryBookEntry) {
        const customer: Customer = {
            mobileNumber: String(primaryBookEntry.mobileNumber || mobileNumber || ''),
            firstName: String(primaryBookEntry.firstName || defaultFirstName || ''),
            lastName: String(primaryBookEntry.lastName || defaultLastName || ''),
            streetAddress: primaryBookEntry.streetAddress ? String(primaryBookEntry.streetAddress) : '',
            carNumber: '',
            carBrandModel: '',
            customerEmail: primaryBookEntry.customerEmail ? String(primaryBookEntry.customerEmail) : undefined,
            latitude: primaryBookEntry.latitude,
            longitude: primaryBookEntry.longitude,
            eLoc: primaryBookEntry.eLoc,
            loyaltyScore: bookLoyaltyScore
        };
        return [{ customer, isSubscriber, washesRemaining, subscriptionPlanName }];
    }

    // Resilient fallback: If no vehicles could be extracted, return the customer identity
    if (profiles.length === 0 && (allEntries.length > 0 || matchedRequests.length > 0)) {
        const firstEntry = (allEntries[0] || matchedRequests[0]) as any;
        const customer: Customer = {
            mobileNumber: String(firstEntry?.mobileNumber || firstEntry?.customerPhone || mobileNumber || ''),
            firstName: String(firstEntry?.customerFirstName || firstEntry?.firstName || defaultFirstName || ''),
            lastName: String(firstEntry?.customerLastName || firstEntry?.lastName || defaultLastName || ''),
            streetAddress: firstEntry?.streetAddress || firstEntry?.address ? String(firstEntry.streetAddress || firstEntry.address) : '',
            carNumber: firstEntry?.carNumber || firstEntry?.carRegNo || '',
            carBrandModel: firstEntry?.carBrandModel || `${firstEntry?.carBrand || ''} ${firstEntry?.carModel || ''}`.trim() || '',
            customerEmail: firstEntry?.customerEmail || firstEntry?.email ? String(firstEntry.customerEmail || firstEntry.email) : undefined,
            latitude: firstEntry?.customerLatitude ?? firstEntry?.latitude,
            longitude: firstEntry?.customerLongitude ?? firstEntry?.longitude,
            eLoc: firstEntry?.customerELoc ?? firstEntry?.eLoc,
            distanceKm: firstEntry?.customerDistanceKm ?? firstEntry?.distanceKm,
            loyaltyScore: bookLoyaltyScore
        };
        return [{ customer, isSubscriber, washesRemaining, subscriptionPlanName }];
    }

    if (profiles.length === 0) {
        console.log("[DEBUG] customerService: No customer profiles could be constructed.");
        return null;
    }
    
    return profiles;
};

/**
 * Searches across Customer Book, Submissions history, and Subscriptions
 * using the Smart Match engine (phone partials, phonetic name similarity, recent vehicle history).
 */
/**
 * Builds and unifies all customer profiles across Customer Book, Service submissions, and Subscriptions.
 */
export const getAllCustomerProfiles = (
  submissions: Service[] = [],
  userSubscriptions: UserSubscription[] = [],
  customerBook?: CustomerBookEntry[],
  serviceRequests?: any[]
): ExistingCustomerProfile[] => {
  const profileMap = new Map<string, ExistingCustomerProfile>();
  const now = new Date();

  // 1. Seed from customerBook
  if (customerBook && Array.isArray(customerBook)) {
    for (const book of customerBook) {
      const normPhone = normalizeMobileNumber(book.mobileNumber);
      if (!normPhone) continue;

      const bookFirst = book.firstName ? String(book.firstName) : '';
      const bookLast = book.lastName ? String(book.lastName) : '';
      const bookFull = `${bookFirst} ${bookLast}`.trim() || 'Customer';

      profileMap.set(normPhone, {
        id: book.id || normPhone,
        mobileNumber: String(book.mobileNumber || normPhone),
        firstName: bookFirst,
        lastName: bookLast,
        fullName: bookFull,
        customerEmail: book.customerEmail ? String(book.customerEmail) : undefined,
        streetAddress: book.streetAddress ? String(book.streetAddress) : '',
        houseNo: (book as any).houseNo,
        streetName: (book as any).streetName,
        city: (book as any).city,
        stateName: (book as any).stateName,
        pincode: (book as any).pincode,
        latitude: book.latitude,
        longitude: book.longitude,
        eLoc: book.eLoc,
        loyaltyScore: book.loyaltyScore,
        isSubscriber: false,
        savedVehicles: (book.savedVehicles || []).map(v => ({
          carNumber: String(v.carNumber || ''),
          carBrandModel: String(v.carBrandModel || ''),
          vehicleCategoryTag: v.vehicleCategoryTag,
          bookingCount: 0,
        })),
        totalBookings: 0,
      });
    }
  }

  // 2. Aggregate from submissions
  if (submissions && Array.isArray(submissions)) {
    for (const sub of submissions) {
      const rawPhone = sub.mobileNumber || (sub as any).customerPhone || (sub as any).phone || (sub as any).contactNumber || (sub as any).customerMobile || (sub as any).raw_data?.mobileNumber || (sub as any).raw_data?.customerPhone || (sub as any).customer?.mobileNumber;
      const normPhone = normalizeMobileNumber(rawPhone);
      if (!normPhone) continue;

      const subFirst = sub.customerFirstName ? String(sub.customerFirstName) : ((sub as any).firstName ? String((sub as any).firstName) : '');
      const subLast = sub.customerLastName ? String(sub.customerLastName) : ((sub as any).lastName ? String((sub as any).lastName) : '');
      const subFull = `${subFirst} ${subLast}`.trim() || (sub as any).customerName || 'Customer';

      let profile = profileMap.get(normPhone);
      if (!profile) {
        profile = {
          id: normPhone,
          mobileNumber: String(rawPhone || normPhone),
          firstName: subFirst,
          lastName: subLast,
          fullName: subFull,
          customerEmail: sub.customerEmail ? String(sub.customerEmail) : undefined,
          streetAddress: sub.streetAddress ? String(sub.streetAddress) : ((sub as any).address ? String((sub as any).address) : ''),
          houseNo: sub.houseNo,
          streetName: sub.streetName,
          city: sub.city,
          stateName: sub.stateName,
          pincode: sub.pincode,
          latitude: sub.customerLatitude,
          longitude: sub.customerLongitude,
          eLoc: sub.customerELoc,
          distanceKm: sub.customerDistanceKm ?? (sub as any).distanceKm,
          isSubscriber: false,
          savedVehicles: [],
          totalBookings: 0,
        };
        profileMap.set(normPhone, profile);
      }

      profile.totalBookings += 1;
      const subDate = sub.scheduledDate || (sub as any).createdAt;
      if (subDate) {
        if (!profile.lastBookingDate || subDate > profile.lastBookingDate) {
          profile.lastBookingDate = subDate;
        }
      }

      // Fill in coordinates, email, address, names
      if (!profile.latitude && sub.customerLatitude) profile.latitude = sub.customerLatitude;
      if (!profile.longitude && sub.customerLongitude) profile.longitude = sub.customerLongitude;
      if (!profile.eLoc && sub.customerELoc) profile.eLoc = sub.customerELoc;
      if (!profile.distanceKm && (sub.customerDistanceKm || (sub as any).distanceKm)) {
        profile.distanceKm = sub.customerDistanceKm ?? (sub as any).distanceKm;
      }
      if (!profile.streetAddress && sub.streetAddress) profile.streetAddress = String(sub.streetAddress);
      if (!profile.houseNo && sub.houseNo) profile.houseNo = sub.houseNo;
      if (!profile.streetName && sub.streetName) profile.streetName = sub.streetName;
      if (!profile.city && sub.city) profile.city = sub.city;
      if (!profile.stateName && sub.stateName) profile.stateName = sub.stateName;
      if (!profile.pincode && sub.pincode) profile.pincode = sub.pincode;
      if (!profile.customerEmail && sub.customerEmail) profile.customerEmail = String(sub.customerEmail);
      if (!profile.firstName && sub.customerFirstName) profile.firstName = String(sub.customerFirstName);
      if (!profile.lastName && sub.customerLastName) profile.lastName = String(sub.customerLastName);
      if (profile.fullName === 'Customer' && (sub.customerFirstName || sub.customerLastName)) {
        profile.fullName = `${sub.customerFirstName || ''} ${sub.customerLastName || ''}`.trim();
      }

      // Track vehicle details and usage history
      const carNum = sub.carNumber ? String(sub.carNumber).toUpperCase().trim() : '';
      if (carNum) {
        const existingVeh = profile.savedVehicles.find(v => v.carNumber.toUpperCase() === carNum);
        if (existingVeh) {
          existingVeh.bookingCount = (existingVeh.bookingCount || 0) + 1;
          if (subDate && (!existingVeh.lastUsedDate || subDate > existingVeh.lastUsedDate)) {
            existingVeh.lastUsedDate = subDate;
            existingVeh.daysAgo = getDaysAgo(subDate);
          }
        } else {
          profile.savedVehicles.push({
            carNumber: String(sub.carNumber),
            carBrandModel: String(sub.carBrandModel || ''),
            vehicleCategoryTag: sub.vehicleCategoryTag,
            lastUsedDate: subDate,
            daysAgo: getDaysAgo(subDate),
            bookingCount: 1,
          });
        }
      }
    }
  }

  // 3. Mark active subscriptions
  if (userSubscriptions && Array.isArray(userSubscriptions)) {
    for (const sub of userSubscriptions) {
      const normPhone = normalizeMobileNumber(sub.mobileNumber);
      if (!normPhone) continue;

      const subFirst = sub.customerFirstName ? String(sub.customerFirstName) : '';
      const subLast = sub.customerLastName ? String(sub.customerLastName) : '';
      const subFull = `${subFirst} ${subLast}`.trim() || 'Subscriber';

      let profile = profileMap.get(normPhone);
      if (!profile) {
        profile = {
          id: normPhone,
          mobileNumber: String(sub.mobileNumber || normPhone),
          firstName: subFirst,
          lastName: subLast,
          fullName: subFull,
          customerEmail: sub.customerEmail ? String(sub.customerEmail) : undefined,
          streetAddress: sub.streetAddress ? String(sub.streetAddress) : '',
          isSubscriber: false,
          savedVehicles: [],
          totalBookings: 0,
        };
        profileMap.set(normPhone, profile);
      }

      const isActive = new Date(sub.endDate) > now;
      if (isActive) {
        profile.isSubscriber = true;
        profile.washesRemaining = sub.washesRemaining;
        profile.subscriptionPlanName = (sub as any).planName || sub.planId;
      }

      const carNum = sub.carNumber ? String(sub.carNumber).toUpperCase().trim() : '';
      if (carNum && !profile.savedVehicles.some(v => v.carNumber.toUpperCase() === carNum)) {
        profile.savedVehicles.push({
          carNumber: String(sub.carNumber),
          carBrandModel: String(sub.carBrandModel || ''),
          bookingCount: 1,
        });
      }
    }
  }

  // 4. Aggregate from serviceRequests (leads, website orders, WhatsApp enquiries)
  if (serviceRequests && Array.isArray(serviceRequests)) {
    for (const req of serviceRequests) {
      const rawPhone = req.customerPhone || req.phone || req.mobileNumber || req.customerMobile || (req as any).raw_data?.customerPhone || (req as any).raw_data?.customer_phone;
      const normPhone = normalizeMobileNumber(rawPhone);
      if (!normPhone) continue;

      const rawName = String(req.customerName || req.name || (req as any).raw_data?.customer_name || '').trim();
      const nameParts = rawName.split(' ');
      const reqFirst = nameParts[0] || '';
      const reqLast = nameParts.slice(1).join(' ') || '';

      let profile = profileMap.get(normPhone);
      if (!profile) {
        profile = {
          id: req.id || normPhone,
          mobileNumber: String(rawPhone || normPhone),
          firstName: reqFirst,
          lastName: reqLast,
          fullName: rawName || 'Customer',
          customerEmail: req.customerEmail || req.email ? String(req.customerEmail || req.email) : undefined,
          streetAddress: req.streetAddress ? String(req.streetAddress) : ((req as any).address ? String((req as any).address) : ''),
          latitude: req.latitude ? Number(req.latitude) : undefined,
          longitude: req.longitude ? Number(req.longitude) : undefined,
          isSubscriber: false,
          savedVehicles: [],
          totalBookings: 0,
        };
        profileMap.set(normPhone, profile);
      }

      const carNum = req.carRegNo ? String(req.carRegNo).toUpperCase().trim() : (req.carNumber ? String(req.carNumber).toUpperCase().trim() : '');
      const carBrandModel = req.carBrandModel ? String(req.carBrandModel) : `${req.carBrand || ''} ${req.carModel || ''}`.trim();
      if (carNum) {
        if (!profile.savedVehicles.some(v => v.carNumber.toUpperCase() === carNum)) {
          profile.savedVehicles.push({
            carNumber: carNum,
            carBrandModel: carBrandModel || 'Vehicle',
            bookingCount: 1,
          });
        }
      } else if (carBrandModel && profile.savedVehicles.length === 0) {
        profile.savedVehicles.push({
          carNumber: '',
          carBrandModel: carBrandModel,
          bookingCount: 1,
        });
      }
    }
  }

  const allProfiles = Array.from(profileMap.values());

  // Sort vehicles in each profile by most recent / most frequent
  for (const profile of allProfiles) {
    profile.savedVehicles.sort((a, b) => {
      const aDays = a.daysAgo ?? 9999;
      const bDays = b.daysAgo ?? 9999;
      if (aDays !== bDays) return aDays - bDays;
      return (b.bookingCount || 0) - (a.bookingCount || 0);
    });
  }

  return allProfiles;
};

/**
 * Searches across Customer Book, Submissions history, Subscriptions and Leads
 * using the Smart Match engine (phone partials, phonetic name similarity, recent vehicle history).
 */
export const searchExistingCustomers = (
  query: string,
  submissions: Service[] = [],
  userSubscriptions: UserSubscription[] = [],
  customerBook?: CustomerBookEntry[],
  limit = 8,
  serviceRequests?: any[]
): ExistingCustomerProfile[] => {
  const allProfiles = getAllCustomerProfiles(submissions, userSubscriptions, customerBook, serviceRequests);
  const trimmedQuery = query.trim();

  // If query is empty, return most frequent/recent customers
  if (!trimmedQuery) {
    return allProfiles
      .sort((a, b) => {
        if (a.isSubscriber && !b.isSubscriber) return -1;
        if (!a.isSubscriber && b.isSubscriber) return 1;
        return b.totalBookings - a.totalBookings;
      })
      .slice(0, limit);
  }

  // Score each profile using the Smart Match engine
  const scoredProfiles: ExistingCustomerProfile[] = [];

  for (const p of allProfiles) {
    const result = scoreCustomerProfile(p, trimmedQuery);
    if (result.score >= 32) {
      p.smartScore = Math.min(100, Math.round(result.score));
      p.matchReasons = result.reasons;
      p.bestMatchingVehicleIndex = result.bestVehicleIndex;
      scoredProfiles.push(p);
    }
  }

  // Sort by smartScore descending
  scoredProfiles.sort((a, b) => {
    const scoreDiff = (b.smartScore || 0) - (a.smartScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.isSubscriber && !b.isSubscriber) return -1;
    if (!a.isSubscriber && b.isSubscriber) return 1;
    return b.totalBookings - a.totalBookings;
  });

  return scoredProfiles.slice(0, limit);
};

/**
 * Prefix-based customer search for the Mobile Number Combobox.
 * Returns existing profiles whose phone numbers match the typed mobile number prefix or exact 10 digits.
 */
export const findExistingCustomersByMobilePrefix = (
  prefix: string,
  submissions: Service[] = [],
  userSubscriptions: UserSubscription[] = [],
  customerBook?: CustomerBookEntry[],
  limit = 8,
  serviceRequests?: any[]
): ExistingCustomerProfile[] => {
  const rawDigits = String(prefix || '').replace(/\D/g, '');
  if (!rawDigits) return [];

  // Extract last 10 digits for Indian phones
  const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

  const allProfiles = getAllCustomerProfiles(submissions, userSubscriptions, customerBook, serviceRequests);

  const matched = allProfiles.filter(p => {
    const normPhone = normalizeMobileNumber(p.mobileNumber);
    const pDigits = String(p.mobileNumber || '').replace(/\D/g, '');
    
    if (rawDigits.length >= 10) {
      return normPhone === last10 || 
             normPhone.endsWith(last10) || 
             pDigits.endsWith(last10) ||
             pDigits === rawDigits ||
             normPhone === rawDigits;
    }

    return normPhone.startsWith(rawDigits) ||
           normPhone.startsWith(last10) ||
           pDigits.startsWith(rawDigits) ||
           normPhone.includes(rawDigits) ||
           pDigits.includes(rawDigits);
  });

  // Sort: Exact match first, then Active Subscribers, then totalBookings
  matched.sort((a, b) => {
    const aNorm = normalizeMobileNumber(a.mobileNumber);
    const bNorm = normalizeMobileNumber(b.mobileNumber);
    const aExact = (aNorm === last10 || aNorm === rawDigits) ? 1 : 0;
    const bExact = (bNorm === last10 || bNorm === rawDigits) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    if (a.isSubscriber && !b.isSubscriber) return -1;
    if (!a.isSubscriber && b.isSubscriber) return 1;

    return (b.totalBookings || 0) - (a.totalBookings || 0);
  });

  return matched.slice(0, limit);
};

