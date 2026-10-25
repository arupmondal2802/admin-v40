import React, { useState, useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { IconPlus, IconMinus, IconTraffic } from './Icon';

interface MapZoomControlsProps {
  className?: string;
  showTrafficToggle?: boolean;
  showLegend?: boolean;
}

export const MapZoomControls: React.FC<MapZoomControlsProps> = ({ 
  className = '',
  showTrafficToggle = true,
  showLegend = true,
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

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!map) return;
    const current = map.getZoom() ?? 12;
    map.setZoom(current + 1);
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!map) return;
    const current = map.getZoom() ?? 12;
    map.setZoom(Math.max(1, current - 1));
  };

  const handleTrafficToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setTrafficEnabled(prev => !prev);
  };

  return (
    <div className={`absolute bottom-6 right-4 z-20 flex flex-col items-end gap-2 no-print select-none ${className}`}>
      {/* Traffic Flow Legend Pill */}
      {trafficEnabled && showLegend && (
        <div
          id="map-traffic-legend"
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[10px] font-medium border border-slate-700/80 shadow-lg backdrop-blur-md animate-fadeIn"
        >
          <span className="text-slate-400">Traffic:</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Fast"></span>
            <span>Fast</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Moderate"></span>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-600" title="Slow / Heavy"></span>
            <span>Slow</span>
          </div>
        </div>
      )}

      {/* Map Control Buttons */}
      <div
        className="flex flex-col gap-1 shadow-lg rounded-xl overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/80 p-1"
        role="group"
        aria-label="Map Zoom and Layer Controls"
      >
        {showTrafficToggle && (
          <>
            <button
              id="map-traffic-toggle-button"
              type="button"
              onClick={handleTrafficToggle}
              title={trafficEnabled ? 'Hide Live Traffic Layer' : 'Show Real-Time City Traffic Layer'}
              aria-pressed={trafficEnabled}
              aria-label="Toggle real-time traffic layer"
              className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition-all active:scale-95 shadow-2xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${
                trafficEnabled 
                  ? 'bg-amber-500 text-white shadow-amber-500/30' 
                  : 'text-slate-700 hover:text-brand-blue hover:bg-slate-100'
              }`}
            >
              <span className="relative flex items-center justify-center">
                <IconTraffic className={`w-5 h-5 ${trafficEnabled ? 'text-white' : 'text-slate-700'}`} />
                {trafficEnabled && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </span>
            </button>
            <div className="h-[1px] bg-slate-200/80 mx-1" />
          </>
        )}

        <button
          id="map-zoom-in-button"
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom in"
          className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-700 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition-all active:scale-95 shadow-2xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          <IconPlus className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <div className="h-[1px] bg-slate-200/80 mx-1" />
        <button
          id="map-zoom-out-button"
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom out"
          className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-700 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition-all active:scale-95 shadow-2xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          <IconMinus className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

export default MapZoomControls;

