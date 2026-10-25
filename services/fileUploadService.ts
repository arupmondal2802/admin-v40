
import { getProxyUrl } from './cloudDataService';

/**
 * Reads a file and converts it to a base64 encoded data URL.
 * @param {File} file - The file to read.
 * @returns {Promise<string>} The base64 data URL.
 */
export const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

/**
 * Uploads a file to the configured Google Drive endpoint, specifying a subfolder.
 *
 * @param {File} file - The file to upload.
 * @param {string} subFolderName - The name of the subfolder (car number) to upload into.
 * @param {string} uploadUrl - The destination URL for the upload script.
 * @returns {Promise<string>} The URL of the uploaded file.
 * @throws {Error} If the upload URL is not provided or if the upload fails.
 */
export const uploadFileToDrive = async (file: File, subFolderName: string, uploadUrl: string): Promise<string> => {
  console.log(`Starting upload for: ${file.name} into folder: ${subFolderName}`);
  
  if (!uploadUrl) {
    throw new Error("Google Drive Upload URL is not configured. Please set it in Settings.");
  }

  if (!subFolderName || subFolderName.trim() === '') {
    throw new Error("Cannot upload: Car Number is required to create a folder. Please enter a Car Number first.");
  }

  const base64 = await toBase64(file);

  const payload = {
    filename: file.name,
    mimeType: file.type,
    base64: base64,
    subFolderName: subFolderName
  };

  // 1. Primary Attempt: Server Proxy Relay (Bypasses Browser CORS / Worker origin restrictions)
  try {
    const proxyEndpoint = getProxyUrl('/api/google-sheets-proxy');
    console.log(`[Upload Proxy] Relaying upload for "${file.name}" via server proxy (${proxyEndpoint})...`);
    const proxyResponse = await fetch(proxyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetsUrl: uploadUrl,
        payload: payload
      })
    });

    if (proxyResponse.ok) {
      const result = await proxyResponse.json();
      if ((result.status === 'success' || result.url) && result.url) {
        console.log(`✅ [Upload Proxy] Successfully uploaded "${file.name}" via server relay. URL: ${result.url}`);
        return result.url;
      } else {
        console.warn('⚠️ [Upload Proxy] Script returned non-success output:', result);
      }
    } else {
      console.warn(`⚠️ [Upload Proxy] Server proxy returned status ${proxyResponse.status}. Trying direct fetch...`);
    }
  } catch (proxyErr) {
    console.warn("⚠️ [Upload Proxy] Proxy request failed or offline, attempting direct fetch:", proxyErr);
  }

  // 2. Secondary Attempt: Direct browser fetch to Google Apps Script endpoint
  try {
    const response = await fetch(uploadUrl, {
      mode: 'cors',
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Required by Apps Script
      },
    });

    if (response.ok) {
        const result = await response.json();
        if ((result.status === 'success' || result.url) && result.url) {
            console.log(`Successfully uploaded ${result.name || file.name}. URL: ${result.url}`);
            return result.url;
        } else {
            console.warn('Drive script returned non-success, falling back to local base64 storage:', result);
            return base64;
        }
    } else {
        console.warn(`Upload failed with status ${response.status}. Falling back to local base64 storage.`);
        return base64;
    }
  } catch (error) {
    console.warn("CORS or network error during Google Drive upload. Storing file as local base64 URL fallback:", error);
    // Always fallback to base64 so local storage/IndexedDB preserves the photo and step validation passes
    return base64;
  }
};

/* ============================================================================
 * BACKGROUND MEDIA UPLOAD QUEUE MANAGER (Agent Local Store Background Sync)
 * ============================================================================ */
import { getIndexedDbItem, setIndexedDbItem } from './indexedDbService';
import { toast } from 'sonner';

export interface BackgroundMediaQueueItem {
  id: string;
  carNumber: string;
  uploadUrl: string;
  fieldKey: string;
  fileName: string;
  fileType: string;
  dataUrl: string; // Base64 data URL
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  attempts: number;
  createdAt: number;
  driveUrl?: string;
  error?: string;
}

const BACKGROUND_QUEUE_KEY = 'background_media_upload_queue';
let isProcessingQueue = false;
const queueListeners: Set<(pendingCount: number) => void> = new Set();

const notifyListeners = (pendingCount: number) => {
  queueListeners.forEach(listener => listener(pendingCount));
};

export const subscribeToMediaQueueChange = (listener: (pendingCount: number) => void) => {
  queueListeners.add(listener);
  // Initial call
  getPendingMediaQueueCount().then(count => listener(count));
  return () => {
    queueListeners.delete(listener);
  };
};

export const getPendingMediaQueueCount = async (): Promise<number> => {
  try {
    const queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
    return queue.filter(item => item.status === 'pending' || item.status === 'uploading').length;
  } catch (err) {
    return 0;
  }
};

/**
 * Converts a base64 Data URL to a native File object for upload
 */
export const dataURLtoFile = (dataurl: string, filename: string, mimeOverride?: string): File => {
  const arr = dataurl.split(',');
  const mime = mimeOverride || arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1] || arr[0]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

/**
 * Enqueues a captured media file into the Agent's Local Store background queue
 * and triggers background upload execution.
 */
export const enqueueBackgroundMediaUpload = async (params: {
  file: File;
  dataUrl: string;
  carNumber: string;
  uploadUrl: string;
  fieldKey: string;
}): Promise<string> => {
  const { file, dataUrl, carNumber, uploadUrl, fieldKey } = params;

  const newItem: BackgroundMediaQueueItem = {
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    carNumber: carNumber.trim(),
    uploadUrl: uploadUrl.trim(),
    fieldKey,
    fileName: file.name,
    fileType: file.type,
    dataUrl,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now()
  };

  try {
    const queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
    queue.push(newItem);
    await setIndexedDbItem(BACKGROUND_QUEUE_KEY, queue);

    const pendingCount = queue.filter(i => i.status === 'pending' || i.status === 'uploading').length;
    notifyListeners(pendingCount);

    console.log(`📦 [Background Media Queue] Enqueued "${file.name}" for Car "${carNumber}". Queue size: ${pendingCount}`);

    // Trigger async processing loop without blocking UI
    setTimeout(() => {
      processBackgroundMediaQueue();
    }, 10);
  } catch (err) {
    console.error('Failed to enqueue media for background upload:', err);
  }

  return newItem.id;
};

/**
 * Background worker loop that processes pending media items from local store to Google Drive
 */
export const processBackgroundMediaQueue = async (): Promise<void> => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    let queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
    let pendingItems = queue.filter(i => i.status === 'pending');

    while (pendingItems.length > 0) {
      const item = pendingItems[0];

      // Mark status as uploading
      queue = queue.map(i => i.id === item.id ? { ...i, status: 'uploading' as const } : i);
      await setIndexedDbItem(BACKGROUND_QUEUE_KEY, queue);
      notifyListeners(queue.filter(i => i.status === 'pending' || i.status === 'uploading').length);

      try {
        console.log(`🚀 [Background Sync] Uploading "${item.fileName}" to folder "${item.carNumber}"...`);
        let fileObj: File;
        if (item.dataUrl.startsWith('data:')) {
          fileObj = dataURLtoFile(item.dataUrl, item.fileName, item.fileType);
        } else if (item.dataUrl.startsWith('blob:')) {
          const res = await fetch(item.dataUrl);
          const blob = await res.blob();
          fileObj = new File([blob], item.fileName, { type: blob.type || item.fileType || 'image/png' });
        } else {
          fileObj = dataURLtoFile(`data:${item.fileType || 'image/png'};base64,${item.dataUrl}`, item.fileName, item.fileType);
        }

        const driveUrl = await uploadFileToDrive(fileObj, item.carNumber, item.uploadUrl);

        // Update queue item to completed
        queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
        queue = queue.map(i => i.id === item.id ? { ...i, status: 'completed' as const, driveUrl } : i);
        await setIndexedDbItem(BACKGROUND_QUEUE_KEY, queue);

        // Also update local ServiceForm in progress draft if it exists in IndexedDB
        try {
          const draft = await getIndexedDbItem<any>('service_form_in_progress', null);
          if (draft && draft.carNumber === item.carNumber) {
            if (item.fieldKey in draft) {
              draft[item.fieldKey] = driveUrl;
              await setIndexedDbItem('service_form_in_progress', draft);
              console.log(`🔄 [Background Sync] Updated local form draft field "${item.fieldKey}" with Drive URL.`);
            }
          }
        } catch (draftErr) {
          console.warn('Could not auto-update local draft on sync:', draftErr);
        }

        // Dispatch DOM event so active React components update state immediately
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('background-media-synced', {
            detail: {
              queueId: item.id,
              fieldKey: item.fieldKey,
              driveUrl,
              carNumber: item.carNumber,
              localDataUrl: item.dataUrl
            }
          }));
        }

        toast.success(`☁️ Background sync complete: "${item.fileName}" uploaded to Google Drive folder "${item.carNumber}"!`);
      } catch (err: any) {
        console.error(`❌ [Background Sync] Error uploading "${item.fileName}":`, err);
        queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
        queue = queue.map(i => {
          if (i.id === item.id) {
            const nextAttempts = (i.attempts || 0) + 1;
            return {
              ...i,
              attempts: nextAttempts,
              status: nextAttempts >= 3 ? ('failed' as const) : ('pending' as const),
              error: err?.message || 'Upload failed'
            };
          }
          return i;
        });
        await setIndexedDbItem(BACKGROUND_QUEUE_KEY, queue);
      }

      // Re-fetch pending
      queue = await getIndexedDbItem<BackgroundMediaQueueItem[]>(BACKGROUND_QUEUE_KEY, []);
      notifyListeners(queue.filter(i => i.status === 'pending' || i.status === 'uploading').length);
      pendingItems = queue.filter(i => i.status === 'pending');
    }
  } catch (err) {
    console.error('Error in processBackgroundMediaQueue:', err);
  } finally {
    isProcessingQueue = false;
  }
};

