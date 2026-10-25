import React, { useState, useRef, useEffect } from 'react';
import Button from './Button';
import { IconCamera, IconVideoCamera, IconCheck, IconLoader, IconGallery, IconAlertTriangle } from './Icon';
import { enqueueBackgroundMediaUpload, toBase64 } from '../../services/fileUploadService';
import { compressImage } from '../../services/imageCompressionService';
import { attachPhotoMetadata } from '../../services/photoMetadataService';
import { toast } from 'sonner';

interface BulkFileUploadProps {
  state: any;
  updateField: (field: string, value: any) => void;
  carNumber: string;
  uploadUrl: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  assignedField: string;
  category: 'before' | 'after';
  error?: string;
  url?: string;
}

const BEFORE_MEDIA_FIELDS = [
  { key: 'beforeWashingPhoto', label: 'Before Photo (Inspection)', type: 'photo' },
  { key: 'beforeVideoInventory', label: 'Before Video (Inventory)', type: 'video' },
  { key: 'beforeVideoTopBody', label: 'Before Video (Top Body)', type: 'video' },
  { key: 'beforeVideoUnderchassis', label: 'Before Video (Underchassis)', type: 'video' },
];

const AFTER_MEDIA_FIELDS = [
  { key: 'afterWashingPhoto', label: 'After Photo (Completion)', type: 'photo' },
  { key: 'afterVideoInterior', label: 'After Video (Interior)', type: 'video' },
  { key: 'afterVideoExterior', label: 'After Video (Exterior)', type: 'video' },
  { key: 'afterVideoUnderchassis', label: 'After Video (Underchassis)', type: 'video' },
];

const ALL_MEDIA_FIELDS = [...BEFORE_MEDIA_FIELDS, ...AFTER_MEDIA_FIELDS];

export const BulkFileUpload: React.FC<BulkFileUploadProps> = ({
  state,
  updateField,
  carNumber,
  uploadUrl,
}) => {
  const [isDraggingBefore, setIsDraggingBefore] = useState(false);
  const [isDraggingAfter, setIsDraggingAfter] = useState(false);
  const [uploadMode, setUploadMode] = useState<'camera' | 'gallery'>('camera');
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // Camera & Gallery File Input Refs for BEFORE
  const beforeCameraPhotoInputRef = useRef<HTMLInputElement>(null);
  const beforeCameraVideoInputRef = useRef<HTMLInputElement>(null);
  const beforeGalleryInputRef = useRef<HTMLInputElement>(null);

  // Camera & Gallery File Input Refs for AFTER
  const afterCameraPhotoInputRef = useRef<HTMLInputElement>(null);
  const afterCameraVideoInputRef = useRef<HTMLInputElement>(null);
  const afterGalleryInputRef = useRef<HTMLInputElement>(null);

  // Listen for background media sync updates
  useEffect(() => {
    const handleSyncEvent = (e: any) => {
      const detail = e.detail;
      if (detail && detail.fieldKey && detail.driveUrl) {
        updateField(detail.fieldKey, detail.driveUrl);
        setUploads(prev => prev.map(item => {
          if (item.assignedField === detail.fieldKey) {
            return { ...item, status: 'success', url: detail.driveUrl };
          }
          return item;
        }));
      }
    };

    window.addEventListener('background-media-synced', handleSyncEvent);
    return () => window.removeEventListener('background-media-synced', handleSyncEvent);
  }, [updateField]);

  const autoAssignField = (file: File, category: 'before' | 'after', currentAssigned: string[]): string => {
    const name = file.name.toLowerCase();
    const isPhoto = file.type.startsWith('image/');

    if (category === 'before') {
      if (isPhoto) {
        if (!currentAssigned.includes('beforeWashingPhoto')) return 'beforeWashingPhoto';
        return 'beforeWashingPhoto';
      } else {
        if ((name.includes('inventory') || name.includes('dirt')) && !currentAssigned.includes('beforeVideoInventory')) return 'beforeVideoInventory';
        if ((name.includes('top') || name.includes('body')) && !currentAssigned.includes('beforeVideoTopBody')) return 'beforeVideoTopBody';
        if (name.includes('under') && !currentAssigned.includes('beforeVideoUnderchassis')) return 'beforeVideoUnderchassis';

        const beforeSlots = ['beforeVideoInventory', 'beforeVideoTopBody', 'beforeVideoUnderchassis'];
        for (const slot of beforeSlots) {
          if (!currentAssigned.includes(slot)) return slot;
        }
        return 'beforeVideoInventory';
      }
    } else {
      if (isPhoto) {
        if (!currentAssigned.includes('afterWashingPhoto')) return 'afterWashingPhoto';
        return 'afterWashingPhoto';
      } else {
        if (name.includes('interior') && !currentAssigned.includes('afterVideoInterior')) return 'afterVideoInterior';
        if (name.includes('exterior') && !currentAssigned.includes('afterVideoExterior')) return 'afterVideoExterior';
        if (name.includes('under') && !currentAssigned.includes('afterVideoUnderchassis')) return 'afterVideoUnderchassis';

        const afterSlots = ['afterVideoInterior', 'afterVideoExterior', 'afterVideoUnderchassis'];
        for (const slot of afterSlots) {
          if (!currentAssigned.includes(slot)) return slot;
        }
        return 'afterVideoInterior';
      }
    }
  };

  const handleFiles = async (selectedFiles: FileList, category: 'before' | 'after') => {
    if (!carNumber || !carNumber.trim()) {
      toast.error("Please enter a Car Registration Number first before capturing or uploading files.");
      return;
    }

    const currentAssigned = [...uploads.map(u => u.assignedField)];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      let processedFile = file;
      let wasCompressed = false;
      const originalSize = file.size;

      if (file.type.startsWith('image/')) {
        const { file: stampedFile, metadata } = await attachPhotoMetadata(file, carNumber, category);
        processedFile = stampedFile;
        if (metadata.coords) {
          toast.success(`Attached metadata to "${file.name}": 📍 ${metadata.formattedCoords}`);
        }
        processedFile = await compressImage(processedFile);
        wasCompressed = processedFile.size < originalSize;
      }

      const assignedField = autoAssignField(processedFile, category, currentAssigned);
      currentAssigned.push(assignedField);

      // Convert to Base64 Data URL
      const b64DataUrl = await toBase64(processedFile);

      // Update form field IMMEDIATELY
      updateField(assignedField, b64DataUrl);

      const newItem: UploadItem = {
        id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`,
        file: processedFile,
        status: 'uploading',
        assignedField,
        category,
        url: b64DataUrl
      };

      setUploads(prev => [...prev, newItem]);

      if (wasCompressed) {
        const savedKB = ((originalSize - processedFile.size) / 1024).toFixed(0);
        const savedPercent = (((originalSize - processedFile.size) / originalSize) * 100).toFixed(0);
        toast.success(`Optimized "${file.name}": saved ${savedKB} KB (${savedPercent}% smaller).`);
      }

      // Enqueue in Agent Local Store Background Queue
      if (uploadUrl) {
        await enqueueBackgroundMediaUpload({
          file: processedFile,
          dataUrl: b64DataUrl,
          carNumber: carNumber.trim(),
          uploadUrl: uploadUrl.trim(),
          fieldKey: assignedField
        });
      }
    }

    toast.success(`Attached ${selectedFiles.length} file(s)! Uploading in background to Google Drive folder "${carNumber}"...`);
  };

  const updateUploadStatus = (id: string, status: UploadItem['status'], url?: string, error?: string) => {
    setUploads(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, status, url, error };
      }
      return item;
    }));
  };

  const handleFieldChange = (itemId: string, newField: string) => {
    const targetMeta = ALL_MEDIA_FIELDS.find(f => f.key === newField);
    const newCategory = targetMeta?.key.startsWith('after') ? 'after' : 'before';

    setUploads(prev => prev.map(item => {
      if (item.id === itemId) {
        if (item.url) {
          updateField(item.assignedField, '');
          updateField(newField, item.url);
        }
        return { ...item, assignedField: newField, category: newCategory };
      }
      return item;
    }));
  };

  const clearUploads = () => {
    setUploads([]);
  };

  const triggerBeforePhotoCamera = () => beforeCameraPhotoInputRef.current?.click();
  const triggerBeforeVideoCamera = () => beforeCameraVideoInputRef.current?.click();
  const triggerBeforeGallery = () => beforeGalleryInputRef.current?.click();

  const triggerAfterPhotoCamera = () => afterCameraPhotoInputRef.current?.click();
  const triggerAfterVideoCamera = () => afterCameraVideoInputRef.current?.click();
  const triggerAfterGallery = () => afterGalleryInputRef.current?.click();

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-900/50 shadow-xs space-y-6">
      {/* Hidden File Inputs for BEFORE */}
      <input
        type="file"
        ref={beforeCameraPhotoInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'before')}
        className="hidden"
        accept="image/*"
        capture="environment"
      />
      <input
        type="file"
        ref={beforeCameraVideoInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'before')}
        className="hidden"
        accept="video/*"
        capture="environment"
      />
      <input
        type="file"
        ref={beforeGalleryInputRef}
        multiple
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'before')}
        className="hidden"
        accept="image/*,video/*"
      />

      {/* Hidden File Inputs for AFTER */}
      <input
        type="file"
        ref={afterCameraPhotoInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'after')}
        className="hidden"
        accept="image/*"
        capture="environment"
      />
      <input
        type="file"
        ref={afterCameraVideoInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'after')}
        className="hidden"
        accept="video/*"
        capture="environment"
      />
      <input
        type="file"
        ref={afterGalleryInputRef}
        multiple
        onChange={(e) => e.target.files && handleFiles(e.target.files, 'after')}
        className="hidden"
        accept="image/*,video/*"
      />


      {/* Header with Camera / Gallery Toggle Switch */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span>Vehicle Inspection Media Upload</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">Upload photos and videos separated into Before Service and After Service drop boxes.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Camera / Gallery Toggle Control */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setUploadMode('camera')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                uploadMode === 'camera'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconCamera className="w-3.5 h-3.5" />
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('gallery')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                uploadMode === 'gallery'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconGallery className="w-3.5 h-3.5" />
              <span>Gallery</span>
            </button>
          </div>

          {uploads.length > 0 && (
            <Button variant="ghost" onClick={clearUploads} className="text-slate-600 hover:text-slate-800 text-xs">
              Clear Queue
            </Button>
          )}
        </div>
      </div>

      {/* Two Separated Dropboxes: Before and After */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BEFORE DROP BOX */}
        <div className="bg-white rounded-xl border border-amber-200/80 p-4 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Before Service Media
              </span>
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                {uploadMode === 'camera' ? (
                  <>
                    <IconCamera className="w-3 h-3 text-amber-600" />
                    <span>Camera Mode</span>
                  </>
                ) : (
                  <>
                    <IconGallery className="w-3 h-3 text-blue-600" />
                    <span>Gallery Mode</span>
                  </>
                )}
              </span>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingBefore(true); }}
              onDragLeave={() => setIsDraggingBefore(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingBefore(false);
                if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files, 'before');
              }}
              onClick={() => uploadMode === 'camera' ? triggerBeforePhotoCamera() : triggerBeforeGallery()}
              className={`mt-2 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer text-center ${
                isDraggingBefore
                  ? 'border-amber-500 bg-amber-50/80 scale-[0.99]'
                  : 'border-amber-200/80 bg-amber-50/30 hover:border-amber-400 hover:bg-amber-50/60'
              }`}
            >
              <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mb-2">
                {uploadMode === 'camera' ? <IconCamera className="w-5 h-5" /> : <IconGallery className="w-5 h-5" />}
              </div>
              <p className="text-xs font-bold text-amber-950">
                {uploadMode === 'camera' ? 'Tap to Snap BEFORE Photo (Camera)' : 'Drop or Choose BEFORE Photos from Gallery'}
              </p>
              <p className="text-[11px] text-amber-800/70 mt-1">Click or drag pre-wash inspection files</p>
            </div>

            {/* Direct Source Buttons */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerBeforePhotoCamera(); }}
                className="px-2.5 py-1 text-xs font-bold rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 flex items-center gap-1 transition-colors shadow-2xs"
              >
                <IconCamera className="w-3.5 h-3.5 text-amber-600" />
                <span>Camera Photo</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerBeforeVideoCamera(); }}
                className="px-2.5 py-1 text-xs font-bold rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 flex items-center gap-1 transition-colors shadow-2xs"
              >
                <IconVideoCamera className="w-3.5 h-3.5 text-amber-600" />
                <span>Camera Video</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerBeforeGallery(); }}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition-colors"
              >
                <IconGallery className="w-3.5 h-3.5 text-blue-600" />
                <span>Gallery</span>
              </button>
            </div>
          </div>

          {/* Before Checklist Status */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Before Checklists</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BEFORE_MEDIA_FIELDS.map((field) => {
                const hasUrl = !!state[field.key];
                const isMandatory = field.key === 'beforeWashingPhoto';
                return (
                  <div
                    key={field.key}
                    className={`flex items-center justify-between p-1.5 rounded-md border text-[11px] transition-colors ${
                      hasUrl
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                        : isMandatory
                        ? 'bg-red-50 border-red-200 text-red-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {hasUrl ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-600 flex items-center justify-center text-white flex-shrink-0">
                          <IconCheck className="w-2.5 h-2.5" />
                        </div>
                      ) : isMandatory ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-red-600 flex items-center justify-center text-white flex-shrink-0 animate-pulse">
                          <IconAlertTriangle className="w-2 h-2" />
                        </div>
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />
                      )}
                      <span className="truncate" title={field.label}>{field.label}</span>
                    </div>

                    {hasUrl ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold flex-shrink-0">✓ Attached</span>
                    ) : isMandatory ? (
                      <span className="text-[10px] bg-red-100 text-red-800 px-1 rounded font-bold flex-shrink-0 animate-pulse">! Missing</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">Optional</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* AFTER DROP BOX */}
        <div className="bg-white rounded-xl border border-emerald-200/80 p-4 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                After Service Media
              </span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
                {uploadMode === 'camera' ? (
                  <>
                    <IconCamera className="w-3 h-3 text-amber-600" />
                    <span>Camera Mode</span>
                  </>
                ) : (
                  <>
                    <IconGallery className="w-3 h-3 text-blue-600" />
                    <span>Gallery Mode</span>
                  </>
                )}
              </span>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingAfter(true); }}
              onDragLeave={() => setIsDraggingAfter(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingAfter(false);
                if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files, 'after');
              }}
              onClick={() => uploadMode === 'camera' ? triggerAfterPhotoCamera() : triggerAfterGallery()}
              className={`mt-2 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer text-center ${
                isDraggingAfter
                  ? 'border-emerald-500 bg-emerald-50/80 scale-[0.99]'
                  : 'border-emerald-200/80 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60'
              }`}
            >
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-2">
                {uploadMode === 'camera' ? <IconCamera className="w-5 h-5" /> : <IconGallery className="w-5 h-5" />}
              </div>
              <p className="text-xs font-bold text-emerald-950">
                {uploadMode === 'camera' ? 'Tap to Snap AFTER Photo (Camera)' : 'Drop or Choose AFTER Photos from Gallery'}
              </p>
              <p className="text-[11px] text-emerald-800/70 mt-1">Click or drag post-wash completion files</p>
            </div>

            {/* Direct Source Buttons */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerAfterPhotoCamera(); }}
                className="px-2.5 py-1 text-xs font-bold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 transition-colors shadow-2xs"
              >
                <IconCamera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Camera Photo</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerAfterVideoCamera(); }}
                className="px-2.5 py-1 text-xs font-bold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 transition-colors shadow-2xs"
              >
                <IconVideoCamera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Camera Video</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerAfterGallery(); }}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition-colors"
              >
                <IconGallery className="w-3.5 h-3.5 text-blue-600" />
                <span>Gallery</span>
              </button>
            </div>
          </div>

          {/* After Checklist Status */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">After Checklists</p>
            <div className="grid grid-cols-2 gap-1.5">
              {AFTER_MEDIA_FIELDS.map((field) => {
                const hasUrl = !!state[field.key];
                return (
                  <div
                    key={field.key}
                    className={`flex items-center justify-between p-1.5 rounded-md border text-[11px] transition-colors ${
                      hasUrl
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {hasUrl ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-600 flex items-center justify-center text-white flex-shrink-0">
                          <IconCheck className="w-2.5 h-2.5" />
                        </div>
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />
                      )}
                      <span className="truncate" title={field.label}>{field.label}</span>
                    </div>

                    {hasUrl ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold flex-shrink-0">✓ Attached</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">Optional</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Queue Section */}
      {uploads.length > 0 && (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Recent Uploads & Slot Assignment
          </h5>
          {uploads.map((item) => {
            const isPhoto = item.file.type.startsWith('image/');
            const isSuccess = item.status === 'success';
            const isUploading = item.status === 'uploading';
            const isError = item.status === 'error';

            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${
                    item.category === 'before' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isPhoto ? <IconCamera className="w-4 h-4" /> : <IconVideoCamera className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.category === 'before' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                      }`}>
                        {item.category}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 truncate" title={item.file.name}>
                        {item.file.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Assignment Dropdown */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-medium text-slate-400">Assign to:</span>
                    <select
                      value={item.assignedField}
                      onChange={(e) => handleFieldChange(item.id, e.target.value)}
                      className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent font-medium"
                    >
                      <optgroup label="Before Service">
                        {BEFORE_MEDIA_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="After Service">
                        {AFTER_MEDIA_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center space-x-1 min-w-[80px] justify-end">
                    {isUploading && (
                      <>
                        <IconLoader className="w-4 h-4 text-slate-500 animate-spin" />
                        <span className="text-xs font-medium text-slate-500">Uploading</span>
                      </>
                    )}
                    {isSuccess && (
                      <>
                        <IconCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-600">Uploaded</span>
                      </>
                    )}
                    {isError && (
                      <span className="text-xs font-semibold text-red-600" title={item.error}>Failed</span>
                    )}
                    {item.status === 'pending' && (
                      <span className="text-xs font-medium text-slate-400">Queued</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BulkFileUpload;
