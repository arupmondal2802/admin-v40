import { captureLocation, formatCoords, Coords } from './locationService';

export interface PhotoMetadata {
  timestamp: string;
  coords: Coords | null;
  formattedCoords: string;
  carNumber?: string;
  label?: string;
}

/**
 * Automatically attaches timestamp and location (lat/long) metadata banner
 * to a photo using HTML Canvas, returning a stamped File object.
 */
export async function attachPhotoMetadata(
  file: File,
  carNumber?: string,
  label?: string
): Promise<{ file: File; metadata: PhotoMetadata }> {
  const now = new Date();
  const timestamp = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString()}`;

  // Only process images
  if (!file.type.startsWith('image/')) {
    return {
      file,
      metadata: {
        timestamp,
        coords: null,
        formattedCoords: 'N/A (Video file)',
        carNumber,
        label,
      },
    };
  }

  // Capture GPS location
  const coords = await captureLocation();
  const formattedCoords = coords
    ? formatCoords(coords.latitude, coords.longitude)
    : 'GPS: Location Unavailable / Permission Denied';

  const metadata: PhotoMetadata = {
    timestamp,
    coords,
    formattedCoords,
    carNumber,
    label,
  };

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ file, metadata });
        return;
      }

      // Draw original image onto canvas
      ctx.drawImage(img, 0, 0);

      // Calculate proportional banner sizing based on image dimensions
      const minDimension = Math.min(img.width, img.height);
      const fontSize = Math.max(14, Math.round(minDimension * 0.024));
      const lineHeight = fontSize * 1.35;
      const padding = fontSize * 0.8;

      const lines = [
        `📅 TIME: ${timestamp}`,
        `📍 ${formattedCoords}`,
      ];

      if (carNumber && carNumber.trim()) {
        lines.push(`🚗 VEHICLE: ${carNumber.trim().toUpperCase()} | 🛡️ AUDIT STAMPED`);
      } else {
        lines.push(`🛡️ AUDIT LOGGED | SERVICE INSPECTION PHOTO`);
      }

      const bannerHeight = lines.length * lineHeight + padding * 2;

      // Draw semi-transparent dark background banner at the bottom of the canvas
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'; // Slate-900 background
      ctx.fillRect(0, img.height - bannerHeight, img.width, bannerHeight);

      // Top border accent on banner
      ctx.fillStyle = '#0284c7'; // Brand blue accent line
      ctx.fillRect(0, img.height - bannerHeight, img.width, Math.max(2, Math.round(fontSize * 0.15)));

      // Draw metadata text lines
      ctx.font = `600 ${fontSize}px sans-serif, system-ui, -apple-system`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;

      lines.forEach((lineText, idx) => {
        const yPos = img.height - bannerHeight + padding + (idx + 0.85) * lineHeight;
        ctx.fillText(lineText, padding, yPos);
      });

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, metadata });
            return;
          }

          const stampedFile = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          });

          console.log(
            `[PhotoMetadata] Stamped metadata onto photo "${file.name}": Time=${timestamp}, GPS=${formattedCoords}`
          );

          resolve({ file: stampedFile, metadata });
        },
        outputType,
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      console.warn(`[PhotoMetadata] Failed to load image for metadata stamping: ${file.name}`);
      resolve({ file, metadata });
    };

    img.src = objectUrl;
  });
}
