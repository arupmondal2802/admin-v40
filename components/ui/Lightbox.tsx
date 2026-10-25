import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Image as ImageIcon } from 'lucide-react';
import { useAndroidBackButton } from '../../hooks/useAndroidBackButton';

interface LightboxImage {
  url: string;
  label: string;
}

interface LightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  
  // Swipe mechanics
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Intercept Android hardware / browser back button when lightbox is open
  useAndroidBackButton(() => {
    onClose();
    return true;
  }, isOpen, 100);

  // Sync index when initialIndex or images change
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
    }
  }, [initialIndex, isOpen, images]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images]);

  if (!isOpen || images.length === 0) return null;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diffX = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50; //px

    if (diffX > minSwipeDistance) {
      handleNext();
    } else if (diffX < -minSwipeDistance) {
      handlePrev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      lightboxRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  // Sync fullscreen change with native escape or click exits
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const activeImage = images[currentIndex];

  return (
    <div
      ref={lightboxRef}
      id="lightbox-overlay"
      className="fixed inset-0 bg-slate-950/98 backdrop-blur-md z-[10000] flex flex-col justify-between text-slate-100 select-none animate-fadeIn"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-slate-900/80 to-transparent z-[10001]">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg bg-slate-800 text-purple-400">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-md">
              {activeImage?.label || 'Review Photo'}
            </h4>
            <p className="text-xs text-slate-400">
              Image {currentIndex + 1} of {images.length}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Full Screen toggle */}
          <button
            type="button"
            onClick={toggleFullScreen}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all focus:outline-none"
            title={isFullScreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* Close Lightbox */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-rose-950/80 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 transition-all focus:outline-none"
            title="Close Lightbox"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Display Area */}
      <div className="relative flex-1 flex items-center justify-center p-4">
        {/* Left Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-4 sm:left-6 p-3 rounded-full bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white transition-all z-10 focus:outline-none shadow-lg border border-slate-800"
            title="Previous Image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image Frame */}
        <div className="relative max-w-full max-h-[70vh] sm:max-h-[75vh] flex items-center justify-center overflow-hidden rounded-xl bg-slate-900/40 p-2 shadow-2xl border border-slate-800/50">
          <img
            src={activeImage?.url}
            alt={activeImage?.label}
            className="object-contain max-w-full max-h-[68vh] sm:max-h-[73vh] rounded-lg transition-all duration-300 transform scale-100"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        </div>

        {/* Right Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-4 sm:right-6 p-3 rounded-full bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white transition-all z-10 focus:outline-none shadow-lg border border-slate-800"
            title="Next Image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnails Strip */}
      {images.length > 1 && (
        <div className="bg-gradient-to-t from-slate-950 to-slate-950/60 px-4 py-4 sm:px-6 border-t border-slate-900 flex flex-col items-center gap-2 z-[10001]">
          <span className="text-xs text-slate-500 font-medium">Swipe left/right or click thumbnails below</span>
          <div className="flex gap-2 max-w-full overflow-x-auto py-1 px-2 no-scrollbar">
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === currentIndex
                    ? 'border-purple-500 ring-2 ring-purple-500/30 scale-105'
                    : 'border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={img.url}
                  alt={img.label}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
