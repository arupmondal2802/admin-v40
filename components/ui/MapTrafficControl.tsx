import React, { useState, useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { IconTraffic } from './Icon';

interface MapTrafficControlProps {
  className?: string;
  showLegend?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';
}

export const MapTrafficControl: React.FC<MapTrafficControlProps> = ({
  className = '',
  showLegend = true,
  position = 'inline',
}) => {
  const map = useMap();
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficLayer, setTrafficLayer] = useState<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map) return;
    if (typeof window !== 'undefined' && window.google?.maps?.TrafficLayer) {
      const layer = new window.google.maps.TrafficLayer();
      setTrafficLayer(layer);
      return () => {
        layer.setMap(null);
      };
    }
  }, [map]);

  useEffect(() => {
    if (!trafficLayer) return;
    if (trafficEnabled) {
      trafficLayer.setMap(map);
    } else {
      trafficLayer.setMap(null);
    }
  }, [trafficLayer, trafficEnabled, map]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setTrafficEnabled(prev => !prev);
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'absolute top-4 right-4 z-20';
      case 'top-left':
        return 'absolute top-4 left-4 z-20';
      case 'bottom-right':
        return 'absolute bottom-24 right-4 z-20';
      case 'bottom-left':
        return 'absolute bottom-6 left-4 z-20';
      default:
        return 'relative';
    }
  };

  return (
    <div className={`${getPositionClasses()} flex flex-col items-end gap-1.5 no-print select-none ${className}`}>
      <button
        id="map-traffic-toggle-button"
        type="button"
        onClick={handleToggle}
        title={trafficEnabled ? 'Hide Live Traffic Layer' : 'Show Real-Time City Traffic Layer'}
        aria-pressed={trafficEnabled}
        aria-label="Toggle real-time traffic layer"
        className={`h-9 sm:h-10 px-2.5 sm:px-3 flex items-center gap-1.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all duration-200 shadow-md backdrop-blur-md active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${
          trafficEnabled
            ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20'
            : 'bg-white/95 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border-slate-200/90'
        }`}
      >
        <span className="relative flex items-center justify-center">
          <IconTraffic className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${trafficEnabled ? 'text-white animate-pulse' : 'text-slate-600'}`} />
          {trafficEnabled && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </span>
        <span className="whitespace-nowrap">
          {trafficEnabled ? 'Traffic: ON' : 'Traffic'}
        </span>
      </button>

      {/* Traffic Legend Pill */}
      {trafficEnabled && showLegend && (
        <div
          id="map-traffic-legend"
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[10px] font-medium border border-slate-700/80 shadow-lg backdrop-blur-md animate-fadeIn"
        >
          <span className="text-slate-400">Flow:</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Fast"></span>
            <span>Fast</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Moderate"></span>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-600" title="Slow / Jam"></span>
            <span>Slow</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapTrafficControl;
