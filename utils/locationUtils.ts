/**
 * Asynchronously captures the current geographical location stamp for order logging.
 * Returns a formatted string with latitude, longitude, and accuracy details.
 */
export const getGeographicalLocationStamp = async (
  fallbackUserLocation?: { latitude?: number; longitude?: number }
): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      if (fallbackUserLocation?.latitude && fallbackUserLocation?.longitude) {
        resolve(`Lat: ${fallbackUserLocation.latitude.toFixed(6)}, Lng: ${fallbackUserLocation.longitude.toFixed(6)} (User Profile)`);
      } else {
        resolve('Location Stamp Recorded (GPS Unsupported / Offline)');
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const accuracy = Math.round(pos.coords.accuracy);
        resolve(`Lat: ${lat}, Lng: ${lng} (±${accuracy}m)`);
      },
      (err) => {
        console.warn('Geolocation acquisition warning:', err.message);
        if (fallbackUserLocation?.latitude && fallbackUserLocation?.longitude) {
          resolve(`Lat: ${fallbackUserLocation.latitude.toFixed(6)}, Lng: ${fallbackUserLocation.longitude.toFixed(6)} (Last Check-in)`);
        } else {
          resolve('Location Stamp Recorded (GPS Signal Pending / Offline)');
        }
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
};
