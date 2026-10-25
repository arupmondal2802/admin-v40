export interface ParsedAddress {
  streetAddress: string; // Combined full formatted address
  houseNo?: string;      // Flat, House / Building No.
  streetName?: string;   // Street, Road, Colony, Area, Landmark
  city?: string;         // City / Locality
  stateName?: string;    // State
  pincode?: string;      // PIN Code / Postal Code
  country?: string;
  lat?: number;
  lng?: number;
}

/**
 * Helper to parse Google Maps Geocoder or Place address components into individual fields.
 */
export function parseGoogleAddressComponents(
  addressComponents: google.maps.GeocoderAddressComponent[] | undefined,
  formattedAddress?: string,
  lat?: number,
  lng?: number
): ParsedAddress {
  if (!addressComponents || addressComponents.length === 0) {
    return {
      streetAddress: formattedAddress || '',
      lat,
      lng,
    };
  }

  let streetNumber = '';
  let premise = '';
  let subpremise = '';
  let route = '';
  let sublocality2 = '';
  let sublocality1 = '';
  let locality = '';
  let adminArea2 = '';
  let adminArea1 = '';
  let postalCode = '';
  let country = '';

  for (const component of addressComponents) {
    const types = component.types || [];
    if (types.includes('subpremise')) {
      subpremise = component.long_name;
    } else if (types.includes('premise') || types.includes('building')) {
      premise = component.long_name;
    } else if (types.includes('street_number')) {
      streetNumber = component.long_name;
    } else if (types.includes('route')) {
      route = component.long_name;
    } else if (types.includes('sublocality_level_2')) {
      sublocality2 = component.long_name;
    } else if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
      sublocality1 = component.long_name;
    } else if (types.includes('locality')) {
      locality = component.long_name;
    } else if (types.includes('administrative_area_level_2')) {
      adminArea2 = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      adminArea1 = component.long_name;
    } else if (types.includes('postal_code')) {
      postalCode = component.long_name;
    } else if (types.includes('country')) {
      country = component.long_name;
    }
  }

  // Build houseNo / Flat / Building
  const houseNoParts = [subpremise, premise, streetNumber].filter(Boolean);
  const houseNo = houseNoParts.join(', ');

  // Build streetName / Area / Sublocality / Route
  const streetParts = [route, sublocality2, sublocality1].filter(Boolean);
  const streetName = streetParts.join(', ');

  // City: prefer locality, then administrative_area_level_2
  const city = locality || adminArea2 || sublocality1 || '';

  // State: administrative_area_level_1
  const stateName = adminArea1 || '';

  // Pincode: postal_code
  const pincode = postalCode || '';

  // Build fallback full street address if formattedAddress not passed
  const constructedAddressParts = [
    houseNo,
    streetName,
    city,
    stateName,
    pincode,
    country
  ].filter(Boolean);

  const fullStreetAddress = formattedAddress || constructedAddressParts.join(', ');

  return {
    streetAddress: fullStreetAddress,
    houseNo,
    streetName,
    city,
    stateName,
    pincode,
    country,
    lat,
    lng,
  };
}

/**
 * Reconstructs a full street address from component inputs
 */
export function buildFormattedAddress(
  houseNo?: string | number,
  streetName?: string | number,
  city?: string | number,
  stateName?: string | number,
  pincode?: string | number
): string {
  return [houseNo, streetName, city, stateName, pincode]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
