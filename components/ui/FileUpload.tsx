import React, { useState, useRef, useEffect } from 'react';
import Button from './Button';
import { IconCamera, IconVideoCamera, IconCheck, IconLoader, IconGallery, IconAlertTriangle } from './Icon';
import { enqueueBackgroundMediaUpload, toBase64 } from '../../services/fileUploadService';
import { compressImage } from '../../services/imageCompressionService';
import { attachPhotoMetadata } from '../../services/photoMetadataService';
import { toast } from 'sonner';

interface FileUploadProps {
    label: string;
    fileUrl: string;
    onUpload: (url: string) => void;
    uploadType: 'photo' | 'video';
    carNumber: string;
    uploadUrl: string;
    fieldKey?: string;
    error?: string;
    required?: boolean;
    isMandatory?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
    label, 
    fileUrl, 
    onUpload, 
    uploadType, 
    carNumber, 
    uploadUrl, 
    fieldKey,
    error: externalError,
    required = false,
    isMandatory = false
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [sourceMode, setSourceMode] = useState<'camera' | 'gallery'>('camera');
    const [isBackgroundUploading, setIsBackgroundUploading] = useState(false);

    // Direct Camera & Gallery Inputs
    const photoCameraInputRef = useRef<HTMLInputElement>(null);
    const videoCameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const isPhoto = uploadType === 'photo';
    const Icon = isPhoto ? IconCamera : IconVideoCamera;
    const acceptType = isPhoto ? 'image/*' : 'video/*';
    const isRequired = required || isMandatory || !!externalError;

    // Listen for background media sync events to update status badge or URL
    useEffect(() => {
        const handleSyncEvent = (e: any) => {
            const detail = e.detail;
            if (detail && fieldKey && detail.fieldKey === fieldKey) {
                if (detail.driveUrl) {
                    onUpload(detail.driveUrl);
                    setIsBackgroundUploading(false);
                }
            }
        };

        window.addEventListener('background-media-synced', handleSyncEvent);
        return () => window.removeEventListener('background-media-synced', handleSyncEvent);
    }, [fieldKey, onUpload]);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!carNumber || !carNumber.trim()) {
            toast.error("Car Registration Number is required to attach media to the Google Drive folder. Please enter Car Registration Number first.");
            setUploadError("Car Registration Number required");
            return;
        }

        setIsLoading(true);
        setUploadError(null);

        try {
            let processedFile = file;

            // 1. Process Image metadata and compression if photo
            if (file.type.startsWith('image/')) {
                const { file: stampedFile, metadata } = await attachPhotoMetadata(file, carNumber, label);
                processedFile = stampedFile;

                if (metadata.coords) {
                    toast.success(`Attached metadata: 📍 ${metadata.formattedCoords} | 📅 ${metadata.timestamp}`);
                } else {
                    toast.info(`Attached timestamp: 📅 ${metadata.timestamp}`);
                }

                const originalSize = processedFile.size;
                processedFile = await compressImage(processedFile);
                const compressedSize = processedFile.size;
                if (compressedSize < originalSize) {
                    const savedKB = ((originalSize - compressedSize) / 1024).toFixed(0);
                    const savedPercent = (((originalSize - compressedSize) / originalSize) * 100).toFixed(0);
                    toast.success(`Optimized image: saved ${savedKB} KB (${savedPercent}% smaller).`);
                }
            }

            // 2. Convert to Base64 Data URL for instant local display & store
            const b64DataUrl = await toBase64(processedFile);

            // 3. Immediately attach to current service request form state
            onUpload(b64DataUrl);
            setIsBackgroundUploading(true);
            toast.success(`Attached ${isPhoto ? 'photo' : 'video'} to service request! Uploading to Drive folder "${carNumber}" in background...`);

            // 4. Queue for background sync to Google Drive subfolder (carNumber)
            if (uploadUrl) {
                await enqueueBackgroundMediaUpload({
                    file: processedFile,
                    dataUrl: b64DataUrl,
                    carNumber: carNumber.trim(),
                    uploadUrl: uploadUrl.trim(),
                    fieldKey: fieldKey || label.toLowerCase().replace(/[^a-z0-9]/g, '')
                });
            } else {
                console.warn('Google Drive upload URL missing, file stored in local agent store.');
            }
        } catch (err) {
            console.error('Error handling captured file:', err);
            if (err instanceof Error) {
                setUploadError(err.message);
            } else {
                setUploadError("Failed to process file.");
            }
        } finally {
            setIsLoading(false);
            if (photoCameraInputRef.current) photoCameraInputRef.current.value = "";
            if (videoCameraInputRef.current) videoCameraInputRef.current.value = "";
            if (galleryInputRef.current) galleryInputRef.current.value = "";
        }
    };

    const handleCameraClick = () => {
        setSourceMode('camera');
        if (isPhoto) {
            photoCameraInputRef.current?.click();
        } else {
            videoCameraInputRef.current?.click();
        }
    };

    const handleGalleryClick = () => {
        setSourceMode('gallery');
        galleryInputRef.current?.click();
    };

    const renderPreview = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center text-center p-2">
                    <IconLoader className="w-8 h-8 text-brand-accent animate-spin mx-auto" />
                    <span className="text-[11px] font-semibold text-slate-600 block mt-1">Processing...</span>
                </div>
            );
        }

        if (fileUrl) {
            return (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="w-full h-full block relative group" title="View attached media">
                    {isPhoto ? (
                        <img src={fileUrl} alt="Upload preview" className="w-full h-full object-cover" />
                    ) : (
                        <video src={`${fileUrl}#t=0.1`} className="w-full h-full object-cover" preload="metadata" muted playsInline>
                            Your browser does not support video playback.
                        </video>
                    )}
                    <div className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-1 shadow-xs">
                        <IconCheck className="w-3.5 h-3.5" />
                    </div>
                </a>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center text-center p-2">
                {isRequired ? (
                    <IconAlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
                ) : (
                    <Icon className="w-8 h-8 text-slate-400" />
                )}
            </div>
        );
    };

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center space-x-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{label}</label>
                    {fileUrl ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                            <IconCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            {isBackgroundUploading ? 'Syncing to Drive...' : 'Attached'}
                        </span>
                    ) : isRequired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 shadow-2xs animate-pulse">
                            <IconAlertTriangle className="w-3.5 h-3.5 mr-1 text-red-600" /> Required
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                            Optional
                        </span>
                    )}
                </div>

                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                    <button
                        type="button"
                        onClick={() => setSourceMode('camera')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                            sourceMode === 'camera'
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                        title="Camera Mode (Direct capture)"
                    >
                        <IconCamera className="w-3.5 h-3.5 text-amber-500" />
                        <span>Camera</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSourceMode('gallery')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                            sourceMode === 'gallery'
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                        title="Gallery Upload Mode"
                    >
                        <IconGallery className="w-3.5 h-3.5 text-blue-500" />
                        <span>Gallery</span>
                    </button>
                </div>
            </div>

            <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-y-3 sm:gap-y-0 sm:space-x-4">
                <div className={`w-24 h-24 rounded-lg flex items-center justify-center overflow-hidden border flex-shrink-0 transition-all ${
                    fileUrl 
                        ? 'bg-emerald-50/20 border-emerald-400' 
                        : isRequired 
                        ? 'bg-red-50/50 border-red-300' 
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                }`}>
                    {renderPreview()}
                </div>

                {/* Direct Device Photo Camera Input */}
                <input
                    type="file"
                    ref={photoCameraInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    disabled={isLoading}
                />

                {/* Direct Device Video Camera Input */}
                <input
                    type="file"
                    ref={videoCameraInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="video/*"
                    capture="environment"
                    disabled={isLoading}
                />

                {/* Standard Gallery File Picker Input */}
                <input
                    type="file"
                    ref={galleryInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept={acceptType}
                    disabled={isLoading}
                />

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant={sourceMode === 'camera' ? 'primary' : 'ghost'}
                        onClick={handleCameraClick}
                        disabled={isLoading}
                        className="text-xs font-bold"
                    >
                        {isPhoto ? <IconCamera className="w-4 h-4 mr-1.5 text-amber-600" /> : <IconVideoCamera className="w-4 h-4 mr-1.5 text-amber-600" />}
                        {fileUrl ? (isPhoto ? 'Retake Photo (Camera)' : 'Re-record Video (Camera)') : (isPhoto ? 'Capture Photo (Camera)' : 'Record Video (Camera)')}
                    </Button>
                    <Button
                        type="button"
                        variant={sourceMode === 'gallery' ? 'secondary' : 'ghost'}
                        onClick={handleGalleryClick}
                        disabled={isLoading}
                        className="text-xs"
                    >
                        <IconGallery className="w-4 h-4 mr-1.5" />
                        {fileUrl ? 'Choose from Gallery' : 'Upload from Gallery'}
                    </Button>
                </div>
            </div>
            {(externalError || uploadError) && <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-semibold">{externalError || uploadError}</p>}
        </div>
    );
};

export default FileUpload;

