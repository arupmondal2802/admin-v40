export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * Captures the current browser geolocation.
 * @returns A promise resolving to the coordinates or null if failed/denied.
 */
export async function captureLocation(): Promise<Coords | null> {
  if (!navigator.geolocation) {
    console.warn("Geolocation is not supported by this browser.");
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        console.warn("Geolocation capture failed:", error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Formats coordinates for human-readable display (e.g., 22.5726° N, 88.3639° E)
 */
export function formatCoords(latitude?: number, longitude?: number): string {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return '';
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lngDir = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lngDir}`;
}

/**
 * Calculates the Haversine distance in kilometers between two coordinates.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
