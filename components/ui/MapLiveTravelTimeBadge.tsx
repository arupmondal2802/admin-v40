import React, { useState, useEffect, useCallback } from 'react';
import { fetchLiveDistanceMatrix, DistanceMatrixResult, TravelMode } from '../../services/distanceMatrixService';
import { IconTraffic } from './Icon';
import { Clock, Navigation, RefreshCw, Car, Bike, Bus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

export interface MapLiveTravelTimeBadgeProps {
  origin: { lat: number; lng: number; name?: string } | null;
  destination: { lat: number; lng: number; name?: string } | null;
  className?: string;
  defaultExpanded?: boolean;
  onEstimateCalculated?: (result: DistanceMatrixResult) => void;
}

export const MapLiveTravelTimeBadge: React.FC<MapLiveTravelTimeBadgeProps> = ({
  origin,
  destination,
  className = '',
  defaultExpanded = true,
  onEstimateCalculated,
}) => {
  const [result, setResult] = useState<DistanceMatrixResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const calculateEstimate = useCallback(async (forcedMode?: TravelMode) => {
    if (!origin || !destination || isNaN(origin.lat) || isNaN(destination.lat)) {
      setResult(null);
      return;
    }

    const modeToUse = forcedMode || travelMode;
    setLoading(true);

    try {
      const res = await fetchLiveDistanceMatrix(origin, destination, modeToUse);
      setResult(res);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (onEstimateCalculated) {
        onEstimateCalculated(res);
      }
    } catch (err) {
      console.warn('[MapLiveTravelTimeBadge] Distance Matrix calculation error:', err);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, travelMode, onEstimateCalculated]);

  // Debounced auto-calculation when origin, destination or travelMode changes
  useEffect(() => {
    if (!origin || !destination) {
      setResult(null);
      return;
    }

    const timer = setTimeout(() => {
      calculateEstimate();
    }, 350);

    return () => clearTimeout(timer);
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, travelMode, calculateEstimate]);

  if (!origin || !destination) {
    return null;
  }

  const getTrafficColor = (status: string) => {
    switch (status) {
      case 'heavy':
        return 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
      case 'moderate':
        return 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
      case 'fast':
        return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
      default:
        return 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800';
    }
  };

  const getTrafficBadge = (status: string, delayMins: number) => {
    if (status === 'heavy') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3 text-rose-500" />
          Heavy Jam (+{delayMins}m)
        </span>
      );
    }
    if (status === 'moderate') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
          Moderate Flow (+{delayMins}m)
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded">
        Fast Traffic
      </span>
    );
  };

  return (
    <div
      id="map-travel-time-badge"
      className={`absolute top-3.5 left-4 z-[450] max-w-[calc(100vw-8rem)] sm:max-w-xs transition-all duration-200 no-print select-none ${className}`}
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/90 dark:border-slate-700 overflow-hidden font-sans">
        {/* Header Bar */}
        <div className="px-3 py-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-2 border-b border-indigo-500/20">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 bg-indigo-600 rounded-md text-white shadow-xs">
              <Clock className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold truncate">Live Hub Travel Time</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="refresh-travel-time-btn"
              type="button"
              onClick={() => calculateEstimate()}
              disabled={loading}
              title="Refresh real-time traffic calculation"
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              title={isExpanded ? 'Collapse ETA details' : 'Expand ETA details'}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-white/10 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Compact Bar / Main Stats */}
        <div className="p-2.5">
          {loading && !result ? (
            <div className="flex items-center gap-2 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Querying Distance Matrix API in live traffic...</span>
            </div>
          ) : result ? (
            <div>
              {/* Primary ETA Display */}
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span
                    id="map-travel-time-estimate"
                    className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100"
                  >
                    {result.durationInTrafficText || result.durationText}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    ({result.distanceText})
                  </span>
                </div>
                <div>{getTrafficBadge(result.trafficStatus, result.trafficDelayMinutes)}</div>
              </div>

              {/* Collapsed quick summary */}
              {!isExpanded && (
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1">
                  <span className="truncate">From: {origin.name || 'Hub'}</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">Google Distance Matrix</span>
                </div>
              )}

              {/* Detailed Breakdown when expanded */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  {/* Origin & Destination Labels */}
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">Hub:</span>
                      <span className="truncate text-slate-600 dark:text-slate-400">{origin.name || 'Central Hub'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-rose-600 flex-shrink-0" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">Doorstep:</span>
                      <span className="truncate text-slate-600 dark:text-slate-400">{destination.name || 'Pinned Address'}</span>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setTravelMode('DRIVING');
                        calculateEstimate('DRIVING');
                      }}
                      className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                        travelMode === 'DRIVING'
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <Car className="w-3 h-3" />
                      <span>Drive</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTravelMode('TWO_WHEELER');
                        calculateEstimate('TWO_WHEELER');
                      }}
                      className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                        travelMode === 'TWO_WHEELER'
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <Bike className="w-3 h-3" />
                      <span>Bike</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTravelMode('TRANSIT');
                        calculateEstimate('TRANSIT');
                      }}
                      className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                        travelMode === 'TRANSIT'
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <Bus className="w-3 h-3" />
                      <span>Transit</span>
                    </button>
                  </div>

                  {/* Real-time traffic footer */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Traffic Matrix
                    </span>
                    {lastUpdated && <span>Updated {lastUpdated}</span>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-1">
              Calculating travel time from hub...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapLiveTravelTimeBadge;
