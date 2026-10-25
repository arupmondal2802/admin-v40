/**
 * Client-side image compression service.
 * Resizes and compresses image files using Canvas to reduce memory footprint and improve upload speed.
 */

/**
 * Compresses an image file client-side using Canvas to reduce memory footprint
 * and sync overhead, while preserving visual clarity for technical inspections.
 * 
 * @param file - The original image file
 * @param maxDimension - Maximum width or height of the compressed image (default: 1600px)
 * @param quality - Compression quality between 0.1 and 1.0 (default: 0.75)
 * @returns A promise resolving to the compressed File object (or original file if unsupported/failed)
 */
export const compressImage = (
  file: File,
  maxDimension = 1600,
  quality = 0.75
): Promise<File> => {
  return new Promise((resolve) => {
    // Only compress images
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    // Don't compress small images or GIFs (avoid breaking animations)
    if (file.type === 'image/gif' || file.size < 150 * 1024) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      // Scale down if dimensions exceed the maximum while preserving aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Determine output mime type (JPEG provides optimal photo compression)
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // If compressed file is larger or equal to original, use original
          if (blob.size >= file.size) {
            resolve(file);
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          });

          const savedKB = ((file.size - compressedFile.size) / 1024).toFixed(1);
          const savedPercent = (((file.size - compressedFile.size) / file.size) * 100).toFixed(0);
          console.log(
            `[ImageCompression] "${file.name}" compressed from ${(file.size / 1024).toFixed(1)}KB to ${(compressedFile.size / 1024).toFixed(1)}KB. Saved ${savedKB}KB (${savedPercent}%).`
          );

          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      console.warn(`[ImageCompression] Failed to load image for compression: ${file.name}`);
      resolve(file); // Fallback to original file
    };

    img.src = objectUrl;
  });
};
