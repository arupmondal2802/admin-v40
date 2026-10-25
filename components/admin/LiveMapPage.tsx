import React, { useEffect, useRef, useMemo, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useAdvancedMarkerRef, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Eye, EyeOff, Clock, AlertTriangle, TrendingUp, CircleDot, Building2 } from 'lucide-react';
import { User, Service, ServiceStatus, LocationHistory, Settings, DeliveryHub } from '../../types';
import { DEFAULT_DELIVERY_HUBS } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { IconRefresh } from '../ui/Icon';
import Input from '../ui/Input';
import SkeletonLoader from '../ui/SkeletonLoader';
import MapZoomControls from '../ui/MapZoomControls';
import { isSameDay, getServiceDate } from '../../utils/dateTimeUtils';

const truckIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 18px; height: 18px; color: white;"><path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h1.5v-1.125c0-1.036.84-1.875 1.875-1.875h13.5c1.035 0 1.875.84 1.875 1.875v1.125h1.5V6.375c0-1.036-.84-1.875-1.875-1.875h-13.5Z" /><path fill-rule="evenodd" d="M3 19.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm12 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM1.5 15a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Zm12 0a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg>`;
const houseIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px; color: white;"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>`;

interface Props {
  isLoading?: boolean;
  isHydrated?: boolean;
  users: Omit<User, 'password' | 'notificationPreferences' | 'pushSubscription'>[];
  currentUser: User;
  submissions: Service[];
  onRefresh: () => void;
  isRefreshing: boolean;
  locationHistory: LocationHistory[];
  settings?: Settings;
  deliveryHubs?: DeliveryHub[];
}

type AgentStatus = 'IDLE' | 'IN_PROGRESS' | 'BUSY' | 'OFFLINE';

const timeSince = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return `${Math.floor(interval)}y ago`;
  interval = seconds / 2592000;
  if (interval > 1) return `${Math.floor(interval)}mo ago`;
  interval = seconds / 86400;
  if (interval > 1) return `${Math.floor(interval)}d ago`;
  interval = seconds / 3600;
  if (interval > 1) return `${Math.floor(interval)}h ago`;
  interval = seconds / 60;
  if (interval > 1) return `${Math.floor(interval)}m ago`;
  return `${Math.floor(seconds)}s ago`;
};

const parseServiceDateTime = (service: Service): Date | null => {
  if (!service.scheduledDate || !service.scheduledTime) return null;
  try {
    const timePart = service.scheduledTime.split(' - ')[0]; // e.g., "09:00"
    const dateOnly = service.scheduledDate.split('T')[0];
    const dateTimeString = `${dateOnly}T${timePart}:00`;
    const date = new Date(dateTimeString);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    console.error("Error parsing date/time for service:", service.submissionId, e);
    return null;
  }
};

const statusOptions: { id: AgentStatus; label: string; color: string; border: string }[] = [
  { id: 'IDLE', label: 'Idle', color: 'bg-blue-100', border: 'border-blue-400' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-purple-100', border: 'border-purple-400' },
  { id: 'BUSY', label: 'Busy', color: 'bg-orange-100', border: 'border-orange-400' },
  { id: 'OFFLINE', label: 'Offline', color: 'bg-slate-100', border: 'border-slate-400' },
];

const haversineDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const R = 6371000; // Earth radius in meters
  const phi1 = p1.lat * Math.PI / 180;
  const phi2 = p2.lat * Math.PI / 180;
  const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
  const deltaLambda = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

const calculateExpectedDuration = (service: Service): number => {
  if (service.scheduledTime && service.scheduledTime.includes('-')) {
    try {
      const parts = service.scheduledTime.split('-').map(p => p.trim());
      const parseTimeMins = (t: string) => {
        const clean = t.replace(/(AM|PM)/i, '').trim();
        const [h, m] = clean.split(':').map(Number);
        let mins = h * 60 + (m || 0);
        if (t.toUpperCase().includes('PM') && h < 12) {
          mins += 12 * 60;
        }
        return mins;
      };
      const start = parseTimeMins(parts[0]);
      const end = parseTimeMins(parts[1]);
      if (end > start) {
        return end - start;
      }
    } catch (e) {
      console.warn("Could not parse duration from scheduledTime range:", service.scheduledTime);
    }
  }

  let baseMins = 30;
  const selections = (service.serviceSelection || []).map(s => s.toLowerCase());
  
  if (selections.some(s => s.includes('wash') || s.includes('washing'))) baseMins = 30;
  if (selections.some(s => s.includes('tyre') || s.includes('tire'))) baseMins = 45;
  if (selections.some(s => s.includes('care') || s.includes('detail') || s.includes('polish'))) baseMins = 60;
  if (selections.some(s => s.includes('battery'))) baseMins = 25;
  if (selections.some(s => s.includes('general') || s.includes('service') || s.includes('maintenance'))) baseMins = 50;

  return baseMins;
};

const calculateActualDuration = (
  service: Service,
  locationHistory: LocationHistory[]
): { durationMins: number; source: 'GPS' | 'Fallback' } => {
  if (service.customerLatitude && service.customerLongitude && service.assignedTo) {
    const riderPings = locationHistory.filter(ping => 
      ping.userId === service.assignedTo &&
      ping.timestamp &&
      isSameDay(new Date(ping.timestamp), getServiceDate(service))
    );

    if (riderPings.length > 0) {
      const pingsAtLocation = riderPings.filter(ping => {
        const dist = haversineDistance(
          { lat: ping.latitude, lng: ping.longitude },
          { lat: service.customerLatitude!, lng: service.customerLongitude! }
        );
        return dist <= 200;
      });

      if (pingsAtLocation.length >= 2) {
        const times = pingsAtLocation.map(p => new Date(p.timestamp).getTime());
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const durationMs = maxTime - minTime;
        const durationMins = Math.round(durationMs / 60000);
        
        if (durationMins >= 2) {
          return { durationMins, source: 'GPS' };
        }
      }
    }
  }

  let baseMins = 30;
  const selections = (service.serviceSelection || []).map(s => s.toLowerCase());
  
  if (selections.some(s => s.includes('wash') || s.includes('washing'))) baseMins = 30;
  if (selections.some(s => s.includes('tyre') || s.includes('tire'))) baseMins = 45;
  if (selections.some(s => s.includes('care') || s.includes('detail') || s.includes('polish'))) baseMins = 60;
  if (selections.some(s => s.includes('battery'))) baseMins = 25;
  if (selections.some(s => s.includes('general') || s.includes('service') || s.includes('maintenance'))) baseMins = 50;

  const hash = service.submissionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const variance = (hash % 31) - 5; 
  const durationMins = Math.max(15, baseMins + variance);

  return { durationMins, source: 'Fallback' };
};

const solveTSP = (start: { lat: number; lng: number }, targets: Service[]): Service[] => {
  if (targets.length <= 1) return targets;

  const n = targets.length;
  if (n <= 8) {
    let bestOrder: Service[] = [];
    let minDistance = Infinity;

    const permute = (arr: Service[], m: Service[] = []) => {
      if (arr.length === 0) {
        let dist = 0;
        let current = start;
        for (const item of m) {
          const itemLoc = { lat: item.customerLatitude!, lng: item.customerLongitude! };
          dist += haversineDistance(current, itemLoc);
          current = itemLoc;
        }
        if (dist < minDistance) {
          minDistance = dist;
          bestOrder = m;
        }
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };

    permute(targets);
    return bestOrder;
  } else {
    // Nearest neighbor heuristic for N > 8
    const unvisited = [...targets];
    const order: Service[] = [];
    let current = start;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const item = unvisited[i];
        const itemLoc = { lat: item.customerLatitude!, lng: item.customerLongitude! };
        const dist = haversineDistance(current, itemLoc);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nearest = unvisited.splice(nearestIdx, 1)[0];
      order.push(nearest);
      current = { lat: nearest.customerLatitude!, lng: nearest.customerLongitude! };
    }

    return order;
  }
};

// Component to display the optimized route line on the map
function OptimizedRouteDisplay({ 
  legs, 
  stops, 
  riderLocation,
  hiddenLegs = []
}: { 
  legs: { path: { lat: number; lng: number }[] }[]; 
  stops: Service[]; 
  riderLocation: { lat: number; lng: number } | null;
  hiddenLegs?: number[];
}) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear old polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const newPolylines: google.maps.Polyline[] = [];

    legs.forEach((leg, index) => {
      if (hiddenLegs.includes(index)) return;
      if (leg.path.length < 2) return;

      const poly = new google.maps.Polyline({
        path: leg.path,
        strokeColor: '#059669', // Emerald 600
        strokeOpacity: 0.85,
        strokeWeight: 6,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            strokeColor: '#ffffff',
            fillColor: '#ffffff',
            fillOpacity: 1,
            scale: 2.5
          },
          offset: '50%',
          repeat: '120px'
        }]
      });
      poly.setMap(map);
      newPolylines.push(poly);
    });

    polylinesRef.current = newPolylines;

    // Zoom and fit bounds to show the entire optimized route (only visible legs)
    if (legs.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;

      if (riderLocation && !hiddenLegs.includes(0)) {
        bounds.extend(riderLocation);
        hasPoints = true;
      }

      legs.forEach((leg, index) => {
        if (hiddenLegs.includes(index)) return;
        leg.path.forEach(pt => bounds.extend(pt));
        hasPoints = true;
      });

      if (hasPoints) {
        map.fitBounds(bounds, { top: 80, bottom: 80, left: 80, right: 80 });
      }
    }

    return () => {
      newPolylines.forEach(p => p.setMap(null));
    };
  }, [map, legs, riderLocation, hiddenLegs]);

  return null;
}

// Custom 3D Heatmap Overlay for completed service requests demand clustering
interface HeatmapOverlayProps {
  points: { lat: number; lng: number }[];
  radius?: number;
}

function HeatmapOverlay({ points, radius = 40 }: HeatmapOverlayProps) {
  const map = useMap();
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = '0px';
    div.style.top = '0px';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.pointerEvents = 'none';

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    div.appendChild(canvas);

    const overlay = new google.maps.OverlayView();

    overlay.onAdd = function () {
      const panes = this.getPanes();
      if (panes) {
        panes.overlayLayer.appendChild(div);
      }
    };

    overlay.draw = function () {
      const projection = this.getProjection();
      const bounds = map.getBounds();
      if (!projection || !bounds || !div) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const neDiv = projection.fromLatLngToDivPixel(ne);
      const swDiv = projection.fromLatLngToDivPixel(sw);

      if (neDiv && swDiv) {
        const left = swDiv.x;
        const top = neDiv.y;
        const width = Math.max(1, Math.round(neDiv.x - swDiv.x));
        const height = Math.max(1, Math.round(swDiv.y - neDiv.y));

        div.style.left = left + 'px';
        div.style.top = top + 'px';
        div.style.width = width + 'px';
        div.style.height = height + 'px';

        const canvasEl = div.querySelector('canvas');
        if (canvasEl) {
          if (canvasEl.width !== width || canvasEl.height !== height) {
            canvasEl.width = width;
            canvasEl.height = height;
          }

          const ctx = canvasEl.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);

            const pixelPoints: { x: number; y: number }[] = [];
            points.forEach(pt => {
              const latLng = new google.maps.LatLng(pt.lat, pt.lng);
              const pos = projection.fromLatLngToDivPixel(latLng);
              if (pos) {
                pixelPoints.push({
                  x: pos.x - left,
                  y: pos.y - top
                });
              }
            });

            // Draw shadow map
            ctx.globalAlpha = 1.0;
            pixelPoints.forEach(pt => {
              const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
              grad.addColorStop(0, 'rgba(0,0,0,1)');
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
              ctx.fill();
            });

            // Colorize based on alpha map
            try {
              const imgData = ctx.getImageData(0, 0, width, height);
              const data = imgData.data;

              // Compute color ramp once
              const colorRamp = new Uint8ClampedArray(256 * 4);
              for (let i = 0; i < 256; i++) {
                let r = 0, g = 0, b = 0, a = Math.round(i * 0.75);

                if (i < 51) {
                  const rLocal = i / 50;
                  r = Math.round(30 * (1 - rLocal) + 59 * rLocal);
                  g = Math.round(41 * (1 - rLocal) + 130 * rLocal);
                  b = Math.round(59 * (1 - rLocal) + 246 * rLocal);
                } else if (i < 128) {
                  const rLocal = (i - 51) / 77;
                  r = Math.round(59 * (1 - rLocal) + 168 * rLocal);
                  g = Math.round(130 * (1 - rLocal) + 85 * rLocal);
                  b = Math.round(246 * (1 - rLocal) + 247 * rLocal);
                } else if (i < 204) {
                  const rLocal = (i - 128) / 76;
                  r = Math.round(168 * (1 - rLocal) + 248 * rLocal);
                  g = Math.round(85 * (1 - rLocal) + 191 * rLocal);
                  b = Math.round(247 * (1 - rLocal) + 42 * rLocal);
                } else {
                  const rLocal = (i - 204) / 51;
                  r = Math.round(248 * (1 - rLocal) + 251 * rLocal);
                  g = Math.round(191 * (1 - rLocal) + 225 * rLocal);
                  b = Math.round(42 * (1 - rLocal) + 104 * rLocal);
                }

                const offset = i * 4;
                colorRamp[offset] = r;
                colorRamp[offset + 1] = g;
                colorRamp[offset + 2] = b;
                colorRamp[offset + 3] = a;
              }

              for (let j = 3; j < data.length; j += 4) {
                const alphaVal = data[j];
                if (alphaVal > 0) {
                  const rampOffset = alphaVal * 4;
                  data[j - 3] = colorRamp[rampOffset];     // R
                  data[j - 2] = colorRamp[rampOffset + 1]; // G
                  data[j - 1] = colorRamp[rampOffset + 2]; // B
                  data[j] = colorRamp[rampOffset + 3];     // A
                }
              }
              ctx.putImageData(imgData, 0, 0);
            } catch (e) {
              console.error("Heatmap rendering error:", e);
            }
          }
        }
      }
    };

    overlay.onRemove = function () {
      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }
    };

    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map, points, radius]);

  return null;
}

// Helper to draw trip polyline segments inside the Google Map
function TripHistoryPolylines({ segments }: { segments: { serviceId?: string; points: { lat: number; lng: number }[] }[] }) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;

    // Remove previous polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const newPolylines: google.maps.Polyline[] = [];

    segments.forEach(segment => {
      if (segment.points.length < 2) return;
      const color = segment.serviceId ? '#a855f7' : '#3b82f6';
      const poly = new google.maps.Polyline({
        path: segment.points,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 5,
      });
      poly.setMap(map);
      newPolylines.push(poly);
    });

    polylinesRef.current = newPolylines;

    return () => {
      newPolylines.forEach(p => p.setMap(null));
    };
  }, [map, segments]);

  return null;
}

// Map Controller for panning and fitting bounds
function LiveMapController({
  panTarget,
  setPanTarget,
  tripPoints
}: {
  panTarget: { lat: number; lng: number } | null;
  setPanTarget: (p: { lat: number; lng: number } | null) => void;
  tripPoints: { lat: number; lng: number }[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !panTarget) return;
    map.panTo(panTarget);
    map.setZoom(16);
    setPanTarget(null);
  }, [map, panTarget, setPanTarget]);

  useEffect(() => {
    if (!map || tripPoints.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    tripPoints.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
  }, [map, tripPoints]);

  return null;
}

// Visual Service Radius Circle overlay for delivery hubs on Google Map
function MapServiceRadiusCircle({
  center,
  radiusKm,
  strokeColor = '#4f46e5',
  fillColor = '#6366f1',
  strokeOpacity = 0.85,
  strokeWeight = 2,
  fillOpacity = 0.12,
}: {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  strokeColor?: string;
  fillColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillOpacity?: number;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map || !center || typeof center.lat !== 'number' || typeof center.lng !== 'number' || isNaN(center.lat) || isNaN(center.lng)) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    const radiusMeters = Math.max(radiusKm, 1) * 1000;

    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center: { lat: center.lat, lng: center.lng },
        radius: radiusMeters,
        strokeColor,
        strokeOpacity,
        strokeWeight,
        fillColor,
        fillOpacity,
        clickable: false,
        zIndex: 1,
      });
    } else {
      circleRef.current.setCenter({ lat: center.lat, lng: center.lng });
      circleRef.current.setRadius(radiusMeters);
      circleRef.current.setOptions({
        strokeColor,
        strokeOpacity,
        strokeWeight,
        fillColor,
        fillOpacity,
        zIndex: 1,
      });
      if (circleRef.current.getMap() !== map) {
        circleRef.current.setMap(map);
      }
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center?.lat, center?.lng, radiusKm, strokeColor, fillColor, strokeOpacity, strokeWeight, fillOpacity]);

  return null;
}

// Marker with InfoWindow for Delivery Hub center
function HubMarker({
  hub,
  radiusKm,
  onFocus
}: {
  hub: { id: string; name: string; lat: number; lng: number; type?: string };
  radiusKm: number;
  onFocus?: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: hub.lat, lng: hub.lng }}
        onClick={() => setIsOpen(true)}
        title={`${hub.name} (${radiusKm} km radius)`}
      >
        <div className="group relative cursor-pointer flex flex-col items-center">
          <div className="flex items-center gap-1.5 bg-indigo-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-full shadow-lg border-2 border-white hover:bg-indigo-800 transition-all transform hover:scale-105">
            <Building2 className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="max-w-[120px] truncate">{hub.name}</span>
            <span className="bg-indigo-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-indigo-400/50">
              {radiusKm} km
            </span>
          </div>
          {/* Subtle anchor point dot */}
          <div className="w-2 h-2 bg-indigo-700 rounded-full -mt-0.5 border border-white" />
        </div>
      </AdvancedMarker>

      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1 min-w-[210px] text-slate-800">
            <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5 mb-2">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900 truncate">{hub.name}</h3>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center bg-indigo-50 p-1.5 rounded border border-indigo-100">
                <span className="text-slate-600 font-medium">Service Radius:</span>
                <span className="font-bold text-indigo-700">{radiusKm} km</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Hub Type:</span>
                <span className="capitalize font-medium text-slate-700">{hub.type || 'All Services'}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Coordinates:</span>
                <span className="font-mono">{hub.lat.toFixed(4)}, {hub.lng.toFixed(4)}</span>
              </div>
              {onFocus && (
                <button
                  type="button"
                  onClick={() => {
                    onFocus();
                    setIsOpen(false);
                  }}
                  className="w-full mt-2 text-center text-xs font-semibold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 py-1 px-2 rounded transition-colors"
                >
                  Center On Hub
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Marker component with dynamic InfoWindow for checking-in Agents
function AgentMarker({ agent }: { agent: { user: Omit<User, 'password' | 'notificationPreferences' | 'pushSubscription'>; activeService?: Service; status: AgentStatus } }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);

  const { user, activeService, status } = agent;
  if (typeof user.latitude !== 'number' || typeof user.longitude !== 'number') return null;

  const color = status === 'IN_PROGRESS' ? '#a855f7' : status === 'BUSY' ? '#f97316' : status === 'IDLE' ? '#3b82f6' : '#64748b';
  const lastUpdateText = user.lastLocationUpdate ? `${timeSince(new Date(user.lastLocationUpdate))}` : 'N/A';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: user.latitude, lng: user.longitude }}
        onClick={() => setIsOpen(true)}
        title={user.username}
      >
        <div 
          className="flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
          style={{ width: '36px', height: '36px', backgroundColor: color }}
          dangerouslySetInnerHTML={{ __html: truckIconSvg }}
        />
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1 min-w-[180px] text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-1 mb-1">{user.username}</h3>
            <div className="space-y-1 text-xs">
              <p><strong>Status:</strong> {status.replace('_', ' ')}</p>
              {activeService && (
                <p>
                  <strong>Task:</strong> {status === 'BUSY' ? 'Upcoming: ' : ''}Serving {activeService.customerFirstName}
                </p>
              )}
              <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-1 mt-1">
                Updated: {lastUpdateText}
              </p>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Marker component with dynamic InfoWindow for active Job sites
function JobSiteMarker({ service, sequenceNumber }: { service: Service; sequenceNumber?: number }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);

  if (typeof service.customerLatitude !== 'number' || typeof service.customerLongitude !== 'number') return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: service.customerLatitude, lng: service.customerLongitude }}
        onClick={() => setIsOpen(true)}
        title={service.customerFirstName}
      >
        <div className="relative">
          <div 
            className="flex items-center justify-center rounded-full border-2 border-white shadow-md cursor-pointer"
            style={{ width: '28px', height: '28px', backgroundColor: service.status === ServiceStatus.InProgress ? '#a855f7' : '#3b82f6' }}
            dangerouslySetInnerHTML={{ __html: houseIconSvg }}
          />
          {sequenceNumber !== undefined && (
            <div className="absolute -top-3.5 -right-3.5 bg-emerald-600 text-white font-bold text-[10px] w-6 h-6 rounded-full flex items-center justify-center border border-white shadow-md z-10">
              {sequenceNumber}
            </div>
          )}
        </div>
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1 text-xs text-slate-800">
            <h4 className="font-bold text-sm text-slate-900 mb-1">
              {sequenceNumber !== undefined ? `#${sequenceNumber} - ` : ''}{service.customerFirstName}
            </h4>
            <p><strong>Vehicle:</strong> {service.carBrandModel}</p>
            <p><strong>Status:</strong> {service.status}</p>
            <p><strong>Address:</strong> {service.streetAddress || 'N/A'}</p>
            <p><strong>Assigned:</strong> {service.assignedTo || 'Unassigned'}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Helper component to listen to zoom level changes of the uncontrolled map
function MapZoomListener({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    
    // Set initial zoom
    setZoom(map.getZoom() || 12);

    const listener = map.addListener('zoom_changed', () => {
      const currentZoom = map.getZoom();
      if (typeof currentZoom === 'number') {
        setZoom(currentZoom);
      }
    });

    return () => {
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [map, setZoom]);

  return null;
}

// Marker component for clustered active service order sites
function ClusteredJobSiteMarker({ 
  cluster 
}: { 
  cluster: {
    id: string;
    center: { lat: number; lng: number };
    services: Service[];
  };
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);
  const map = useMap();

  const count = cluster.services.length;

  const handleClick = () => {
    setIsOpen(true);
    if (map) {
      map.panTo(cluster.center);
    }
  };

  const handleZoomIn = () => {
    if (map) {
      map.setZoom((map.getZoom() || 12) + 2);
      map.panTo(cluster.center);
    }
    setIsOpen(false);
  };

  // Determine if any job in the cluster is InProgress
  const hasInProgress = cluster.services.some(s => s.status === ServiceStatus.InProgress);
  const color = hasInProgress ? '#a855f7' : '#3b82f6'; // purple if in-progress, blue otherwise

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={cluster.center}
        onClick={handleClick}
        title={`${count} service requests nearby`}
      >
        <div className="relative cursor-pointer">
          {/* Pulsing visual animation */}
          <div className="absolute inset-0 rounded-full animate-ping opacity-25" style={{ backgroundColor: color }} />
          
          <div 
            className="flex items-center justify-center rounded-full border-2 border-white shadow-xl font-bold text-white transition-all transform hover:scale-110"
            style={{ 
              width: '34px', 
              height: '34px', 
              backgroundColor: color,
              fontSize: '12px'
            }}
          >
            {count}
          </div>
          {/* Tiny indicator badge */}
          <div className="absolute -bottom-1 -right-1 bg-white text-slate-700 p-0.5 rounded-full border border-slate-200 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '10px', height: '10px' }}><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>
          </div>
        </div>
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1.5 max-w-[240px] text-xs text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5">
              <h4 className="font-bold text-sm text-slate-900">Cluster ({count} Jobs)</h4>
              <button 
                type="button"
                onClick={handleZoomIn}
                className="text-[10px] bg-brand-blue/10 text-brand-blue font-bold px-2 py-0.5 rounded hover:bg-brand-blue/20 transition-colors"
              >
                Zoom In
              </button>
            </div>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {cluster.services.map((service, index) => (
                <div key={service.submissionId} className="border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {index + 1}. {service.customerFirstName} {service.customerLastName}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">{service.streetAddress || 'No address'}</p>
                  <div className="flex items-center justify-between mt-1 text-[10px]">
                    <span className="text-slate-500">Vehicle: <strong className="text-slate-700">{service.carBrandModel || 'N/A'}</strong></span>
                    <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                      service.status === ServiceStatus.InProgress 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {service.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

const LiveMapPage: React.FC<Props> = (props) => {
  const { users, submissions, onRefresh, isRefreshing, locationHistory, settings, deliveryHubs, isLoading, isHydrated } = props;

  const API_KEY =
    settings?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [showHubRadius, setShowHubRadius] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('liveMap_showHubRadius') === 'true';
    }
    return false;
  });

  const handleToggleHubRadius = () => {
    setShowHubRadius(prev => {
      const next = !prev;
      try {
        localStorage.setItem('liveMap_showHubRadius', String(next));
      } catch {}
      return next;
    });
  };
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusFilters, setStatusFilters] = useState<AgentStatus[]>(['IDLE', 'IN_PROGRESS', 'BUSY', 'OFFLINE']);

  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [tripSegments, setTripSegments] = useState<{ serviceId?: string; points: { lat: number; lng: number }[] }[]>([]);
  const [tripPoints, setTripPoints] = useState<{ lat: number; lng: number }[]>([]);

  const [tick, setTick] = useState(0);
  const [zoom, setZoom] = useState<number>(12);

  // Route optimization states
  const routesLib = useMapsLibrary('routes');
  const [optimizerRider, setOptimizerRider] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizedStops, setOptimizedStops] = useState<Service[]>([]);
  const [optimizedRouteData, setOptimizedRouteData] = useState<{
    legs: {
      distanceMeters: number;
      durationMillis: number;
      path: { lat: number; lng: number }[];
    }[];
    totalDistanceMeters: number;
    totalDurationMillis: number;
  } | null>(null);
  const [travelMode, setTravelMode] = useState<'DRIVING' | 'WALKING' | 'BICYCLING'>('DRIVING');
  const [hiddenLegs, setHiddenLegs] = useState<number[]>([]);
  const [analyzerRider, setAnalyzerRider] = useState<string>('');

  useEffect(() => {
    if (optimizerRider) {
      setAnalyzerRider(optimizerRider);
    } else if (selectedAgent) {
      setAnalyzerRider(selectedAgent);
    }
  }, [optimizerRider, selectedAgent]);

  const durationAnalytics = useMemo(() => {
    if (!analyzerRider) return null;
    
    const riderStops = submissions.filter(s => 
      s.assignedTo === analyzerRider && 
      !s.isDeleted &&
      [ServiceStatus.Completed, ServiceStatus.InProgress, ServiceStatus.Assigned].includes(s.status)
    );

    if (riderStops.length === 0) return null;

    let totalActualMins = 0;
    let computedStopsCount = 0;

    const analyzedStops = riderStops.map(stop => {
      const expected = calculateExpectedDuration(stop);
      const actualResult = calculateActualDuration(stop, locationHistory);
      const actual = actualResult.durationMins;
      const isExceeded = actual > expected + 15; 
      const diff = actual - expected;

      totalActualMins += actual;
      computedStopsCount++;

      return {
        stop,
        expected,
        actual,
        isExceeded,
        diff,
        source: actualResult.source
      };
    });

    const avgDuration = computedStopsCount > 0 ? Math.round(totalActualMins / computedStopsCount) : 0;
    const exceededCount = analyzedStops.filter(s => s.isExceeded).length;

    return {
      riderName: analyzerRider,
      avgDuration,
      exceededCount,
      analyzedStops
    };
  }, [submissions, locationHistory, analyzerRider]);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const hubLat = settings?.hubLatitude || 22.572646;
  const hubLng = settings?.hubLongitude || 88.363895;

  const effectiveMaxDistance = useMemo(() => {
    if (typeof settings?.maxDistanceKm === 'number' && !isNaN(settings.maxDistanceKm) && settings.maxDistanceKm > 0) {
      return settings.maxDistanceKm;
    }
    const stored = parseFloat(localStorage.getItem('maxDistanceKm') || '');
    return !isNaN(stored) && stored > 0 ? stored : 20;
  }, [settings?.maxDistanceKm]);

  const activeHubs = useMemo(() => {
    if (deliveryHubs && deliveryHubs.length > 0) {
      return deliveryHubs
        .map(h => ({
          id: h.id || h.name,
          name: h.name,
          lat: Number(h.latitude),
          lng: Number(h.longitude),
          type: h.type || 'both'
        }))
        .filter(h => !isNaN(h.lat) && !isNaN(h.lng) && h.lat !== 0 && h.lng !== 0);
    }
    if (settings?.hubLatitude && settings?.hubLongitude) {
      return [{
        id: 'HUB-PRIMARY',
        name: 'Main Operations Hub',
        lat: Number(settings.hubLatitude),
        lng: Number(settings.hubLongitude),
        type: 'both'
      }];
    }
    return DEFAULT_DELIVERY_HUBS.map(h => ({
      id: h.id,
      name: h.name,
      lat: h.latitude,
      lng: h.longitude,
      type: h.type || 'both'
    }));
  }, [deliveryHubs, settings]);

  const completedServicePoints = useMemo(() => {
    return submissions
      .filter(s => s.status === ServiceStatus.Completed && s.customerLatitude && s.customerLongitude)
      .map(s => ({
        lat: Number(s.customerLatitude),
        lng: Number(s.customerLongitude),
      }));
  }, [submissions]);

  const ridersWithActiveJobs = useMemo(() => {
    const safeUsers = users || [];
    const safeSubmissions = submissions || [];
    const riders = safeUsers.filter(u => u.role !== 'admin' && u.role !== 'manager' && u.attendanceStatus === 'CHECKED_IN');
    
    return riders.map(rider => {
      const assignedServices = safeSubmissions.filter(s => 
        s.assignedTo === rider.username && 
        (s.status === ServiceStatus.Assigned || s.status === ServiceStatus.InProgress) &&
        s.customerLatitude && s.customerLongitude
      );
      return {
        rider,
        services: assignedServices
      };
    }).filter(item => item.services.length > 0);
  }, [users, submissions]);

  const selectedOptimizerRiderData = useMemo(() => {
    return ridersWithActiveJobs.find(item => item.rider.username === optimizerRider);
  }, [ridersWithActiveJobs, optimizerRider]);

  const originalStats = useMemo(() => {
    if (!selectedOptimizerRiderData) return null;
    const { rider, services } = selectedOptimizerRiderData;
    const startLoc = (rider.latitude && rider.longitude) 
      ? { lat: rider.latitude, lng: rider.longitude } 
      : { lat: hubLat, lng: hubLng };

    let totalDist = 0;
    let prev = startLoc;
    for (const service of services) {
      const dest = { lat: service.customerLatitude!, lng: service.customerLongitude! };
      totalDist += haversineDistance(prev, dest);
      prev = dest;
    }
    return {
      distanceMeters: totalDist,
      durationMillis: (totalDist / 11) * 1000 // approx 40 km/h
    };
  }, [selectedOptimizerRiderData, hubLat, hubLng]);

  const handleOptimize = async () => {
    if (!selectedOptimizerRiderData) return;
    setIsOptimizing(true);
    setOptimizedRouteData(null);

    const { rider, services } = selectedOptimizerRiderData;
    const startLoc = (rider.latitude && rider.longitude) 
      ? { lat: rider.latitude, lng: rider.longitude } 
      : { lat: hubLat, lng: hubLng };

    // Solve TSP
    const optimalOrder = solveTSP(startLoc, services);
    setOptimizedStops(optimalOrder);

    const legsData: { distanceMeters: number; durationMillis: number; path: { lat: number; lng: number }[] }[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    let prevLoc = startLoc;

    try {
      if (routesLib) {
        for (let i = 0; i < optimalOrder.length; i++) {
          const dest = { lat: optimalOrder[i].customerLatitude!, lng: optimalOrder[i].customerLongitude! };
          
          try {
            const result = await routesLib.Route.computeRoutes({
              origin: prevLoc,
              destination: dest,
              travelMode: travelMode,
              fields: ['path', 'distanceMeters', 'durationMillis'],
            });

            if (result.routes?.[0]) {
              const route = result.routes[0];
              legsData.push({
                distanceMeters: route.distanceMeters || 0,
                durationMillis: Number(route.durationMillis) || 0,
                path: route.path || [prevLoc, dest]
              });
              totalDistance += route.distanceMeters || 0;
              totalDuration += Number(route.durationMillis) || 0;
            } else {
              throw new Error('No route returned');
            }
          } catch (err) {
            console.warn('Google Routes API segment failed, falling back to straight line', err);
            const dist = haversineDistance(prevLoc, dest);
            legsData.push({
              distanceMeters: dist,
              durationMillis: (dist / 11) * 1000,
              path: [prevLoc, dest]
            });
            totalDistance += dist;
            totalDuration += (dist / 11) * 1000;
          }
          
          prevLoc = dest;
        }
      } else {
        // Fallback directly to straight lines
        for (let i = 0; i < optimalOrder.length; i++) {
          const dest = { lat: optimalOrder[i].customerLatitude!, lng: optimalOrder[i].customerLongitude! };
          const dist = haversineDistance(prevLoc, dest);
          legsData.push({
            distanceMeters: dist,
            durationMillis: (dist / 11) * 1000,
            path: [prevLoc, dest]
          });
          totalDistance += dist;
          totalDuration += (dist / 11) * 1000;
          prevLoc = dest;
        }
      }

      setOptimizedRouteData({
        legs: legsData,
        totalDistanceMeters: totalDistance,
        totalDurationMillis: totalDuration
      });
    } catch (e) {
      console.error('Error optimizing route:', e);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleClearOptimization = () => {
    setOptimizedStops([]);
    setOptimizedRouteData(null);
    setOptimizerRider('');
    setHiddenLegs([]);
  };

  const agentData = useMemo(() => {
    const now = new Date();
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

    const calculatedData = users
      .filter(u => u.role !== 'admin' && u.role !== 'manager' && u.attendanceStatus === 'CHECKED_IN')
      .map(user => {
        let status: AgentStatus = 'IDLE';
        let relevantService: Service | undefined;

        if (user.lastLocationUpdate) {
          const lastUpdate = new Date(user.lastLocationUpdate);
          const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 60000;
          if (minutesSinceUpdate > 10) {
            status = 'OFFLINE';
          }
        } else {
          status = 'OFFLINE';
        }

        if (status !== 'OFFLINE') {
          const activeService = submissions.find(s => s.assignedTo === user.username && s.status === ServiceStatus.InProgress);
          if (activeService) {
            status = 'IN_PROGRESS';
            relevantService = activeService;
          } else {
            const upcomingService = submissions.find(s => {
              if (s.assignedTo !== user.username || s.status !== ServiceStatus.Assigned) return false;
              const scheduledDateTime = parseServiceDateTime(s);
              return scheduledDateTime && scheduledDateTime > now && scheduledDateTime <= fifteenMinutesFromNow;
            });
            if (upcomingService) {
              status = 'BUSY';
              relevantService = upcomingService;
            }
          }
        }
        return { user, activeService: relevantService, status };
      });

    const sortedData = calculatedData.sort((a, b) => {
      const statusOrder = { IN_PROGRESS: 1, BUSY: 2, IDLE: 3, OFFLINE: 4 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.user.username.localeCompare(b.user.username);
    });

    if (statusFilters.length === 4) return sortedData;
    return sortedData.filter(agent => statusFilters.includes(agent.status));
  }, [users, submissions, statusFilters, tick]);

  const panToUser = (user: Omit<User, 'password' | 'notificationPreferences' | 'pushSubscription'>) => {
    if (user.latitude && user.longitude) {
      setPanTarget({ lat: user.latitude, lng: user.longitude });
    }
  };

  const handleClearHistory = () => {
    setTripSegments([]);
    setTripPoints([]);
  };

  const handleStatusFilterChange = (statusId: AgentStatus) => {
    setStatusFilters(prev =>
      prev.includes(statusId)
        ? prev.filter(s => s !== statusId)
        : [...prev, statusId]
    );
  };

  const handleShowHistory = () => {
    handleClearHistory();
    if (!selectedAgent || !selectedDate) return;

    const historyPoints = locationHistory
      .filter(h => h.userId === selectedAgent && h.timestamp.startsWith(selectedDate))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (historyPoints.length < 2) {
      alert('Not enough location data to draw a trip for this day.');
      return;
    }

    const segments: { serviceId?: string; points: { lat: number; lng: number }[] }[] = [];
    const allPts: { lat: number; lng: number }[] = [];

    let currentSegment = {
      serviceId: historyPoints[0].relatedServiceId,
      points: [{ lat: historyPoints[0].latitude, lng: historyPoints[0].longitude }]
    };
    allPts.push({ lat: historyPoints[0].latitude, lng: historyPoints[0].longitude });

    for (let i = 1; i < historyPoints.length; i++) {
      const point = historyPoints[i];
      const ptObj = { lat: point.latitude, lng: point.longitude };
      allPts.push(ptObj);

      if (point.relatedServiceId === currentSegment.serviceId) {
        currentSegment.points.push(ptObj);
      } else {
        segments.push(currentSegment);
        currentSegment = {
          serviceId: point.relatedServiceId,
          points: [ptObj]
        };
      }
    }
    segments.push(currentSegment);

    setTripSegments(segments);
    setTripPoints(allPts);
  };

  const activeJobs = useMemo(() => {
    return submissions.filter(s => 
      (s.status === ServiceStatus.Assigned || s.status === ServiceStatus.InProgress) && 
      s.customerLatitude && s.customerLongitude
    );
  }, [submissions]);

  const clusteredJobs = useMemo(() => {
    const jobsToCluster = activeJobs.filter(
      s => !optimizedStops.some(opt => opt.submissionId === s.submissionId)
    );

    const clusters: {
      id: string;
      center: { lat: number; lng: number };
      services: Service[];
      isCluster: boolean;
    }[] = [];

    // The threshold in degrees scales exponentially with zoom level.
    // Higher zoom = smaller threshold (less clustering); lower zoom = larger threshold.
    const threshold = 1.5 / Math.pow(1.82, zoom);

    jobsToCluster.forEach(job => {
      const lat = Number(job.customerLatitude);
      const lng = Number(job.customerLongitude);

      if (isNaN(lat) || isNaN(lng)) return;

      let found = false;
      for (const c of clusters) {
        const dLat = Math.abs(c.center.lat - lat);
        const dLng = Math.abs(c.center.lng - lng);
        if (dLat < threshold && dLng < threshold) {
          c.services.push(job);
          // Re-calculate the average center of the cluster dynamically
          c.center.lat = c.services.reduce((sum, s) => sum + Number(s.customerLatitude), 0) / c.services.length;
          c.center.lng = c.services.reduce((sum, s) => sum + Number(s.customerLongitude), 0) / c.services.length;
          found = true;
          break;
        }
      }

      if (!found) {
        clusters.push({
          id: `cluster-${job.submissionId}`,
          center: { lat, lng },
          services: [job],
          isCluster: false
        });
      }
    });

    clusters.forEach(c => {
      c.isCluster = c.services.length > 1;
    });

    return clusters;
  }, [activeJobs, optimizedStops, zoom]);

  const statusConfig = {
    IN_PROGRESS: { text: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-400' },
    BUSY: { text: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-400' },
    IDLE: { text: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-400' },
    OFFLINE: { text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-400' },
  };

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center font-sans">
        <h2 className="text-lg font-bold text-slate-800 mb-2">Google Maps API Key Required</h2>
        <p className="text-sm text-slate-600 max-w-md mb-4">
          Please set the <strong>GOOGLE_MAPS_PLATFORM_KEY</strong> secret in your project settings to enable the Live Agent Tracking Map.
        </p>
        <div className="text-left text-xs text-slate-500 bg-slate-100 p-4 rounded-lg border border-slate-200">
          <p className="font-semibold mb-1">To add your API key:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
            <li>Select <strong>Secrets</strong></li>
            <li>Add <code>GOOGLE_MAPS_PLATFORM_KEY</code> and save your API Key.</li>
          </ol>
        </div>
      </div>
    );
  }

  if (isLoading || isHydrated === false || !users || !submissions) {
    return <SkeletonLoader view="LIVE_MAP" />;
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Live Agent Tracking Map</h1>
          <p className="text-slate-500 mt-1">Real-time location tracking of field agents on Google Maps and active jobs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Show Hub Radius Toggle */}
          <button
            id="show-hub-radius-toggle"
            onClick={handleToggleHubRadius}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all duration-300 shadow-md ${
              showHubRadius
                ? 'bg-gradient-to-r from-indigo-700 to-indigo-900 text-white border-indigo-400/60 shadow-indigo-500/20 hover:border-indigo-300'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
            title={`Toggle visual ${effectiveMaxDistance} km delivery radius circle for operational hubs`}
          >
            <CircleDot className={`w-4 h-4 ${showHubRadius ? 'text-indigo-300 animate-pulse' : 'text-slate-400'}`} />
            <span>{showHubRadius ? 'Hide Hub Radius' : 'Show Hub Radius'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              showHubRadius ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {effectiveMaxDistance} km
            </span>
          </button>

          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all duration-300 shadow-md ${
              showHeatmap
                ? 'bg-gradient-to-r from-brand-blue to-slate-900 text-white border-brand-accent/50 shadow-brand-accent/10 hover:border-brand-accent'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
            title="Visualize historical completed orders as heat intensity zones"
          >
            <TrendingUp className={`w-4 h-4 ${showHeatmap ? 'text-brand-accent animate-pulse' : 'text-slate-400'}`} />
            <span>{showHeatmap ? 'Hide Demand Heatmap' : 'Show Demand Heatmap'}</span>
            {showHeatmap && completedServicePoints.length > 0 && (
              <span className="bg-brand-accent text-brand-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {completedServicePoints.length}
              </span>
            )}
          </button>
          <Button onClick={onRefresh} disabled={isRefreshing}>
            <IconRefresh className={`w-5 h-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Controls */}
        <div className="md:w-1/3 lg:w-1/4 flex-shrink-0">
          <Card title="Agent Trip History" className="mb-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="agent-select" className="block text-sm font-medium text-slate-700 mb-1">Select Agent</label>
                <select id="agent-select" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                  <option value="">-- All Agents --</option>
                  {agentData.map(({ user }) => <option key={user.username} value={user.username}>{user.username}</option>)}
                </select>
              </div>
              <Input label="Select Date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <div className="flex space-x-2">
                <Button onClick={handleShowHistory} disabled={!selectedAgent} className="flex-1">Show History</Button>
                <Button onClick={handleClearHistory} variant="secondary">Clear</Button>
              </div>
            </div>
          </Card>

          <Card title="Rider Route Optimizer" className="mb-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="optimizer-rider-select" className="block text-sm font-medium text-slate-700 mb-1">
                  Select Rider
                </label>
                <select
                  id="optimizer-rider-select"
                  value={optimizerRider}
                  onChange={(e) => {
                    setOptimizerRider(e.target.value);
                    setOptimizedStops([]);
                    setOptimizedRouteData(null);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
                >
                  <option value="">-- Choose Active Rider --</option>
                  {ridersWithActiveJobs.map(({ rider, services }) => (
                    <option key={rider.username} value={rider.username}>
                      {rider.username} ({services.length} active stops)
                    </option>
                  ))}
                </select>
              </div>

              {selectedOptimizerRiderData && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Travel Mode
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['DRIVING', 'WALKING', 'BICYCLING'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setTravelMode(mode)}
                          className={`px-2 py-1 text-xs font-semibold rounded border transition-colors ${
                            travelMode === mode
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {mode === 'DRIVING' ? 'Drive' : mode === 'WALKING' ? 'Walk' : 'Cycle'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handleOptimize}
                      disabled={isOptimizing}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5"
                    >
                      {isOptimizing ? 'Optimizing...' : 'Calculate Optimal Route'}
                    </Button>
                    <Button
                      onClick={handleClearOptimization}
                      variant="secondary"
                      className="text-xs py-1.5 px-2.5 rounded-lg"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              )}

              {/* Display results */}
              {optimizedStops.length > 0 && optimizedRouteData && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-800 space-y-1">
                    <p className="font-bold text-sm">Optimization Summary</p>
                    <p>Total Distance: <strong>{(optimizedRouteData.totalDistanceMeters / 1000).toFixed(2)} km</strong></p>
                    <p>Est. Duration: <strong>{Math.round(optimizedRouteData.totalDurationMillis / 60000)} mins</strong></p>
                    {originalStats && originalStats.distanceMeters > optimizedRouteData.totalDistanceMeters && (
                      <p className="text-emerald-600 font-bold mt-1.5 bg-white px-2 py-1 rounded-md border border-emerald-200 inline-block">
                        Saved: {((originalStats.distanceMeters - optimizedRouteData.totalDistanceMeters) / 1000).toFixed(2)} km ({Math.round(((originalStats.distanceMeters - optimizedRouteData.totalDistanceMeters) / originalStats.distanceMeters) * 100)}%)
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Optimal Visiting Sequence</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (hiddenLegs.length === optimizedStops.length) {
                            setHiddenLegs([]);
                          } else {
                            setHiddenLegs(optimizedStops.map((_, i) => i));
                          }
                        }}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline bg-emerald-50 px-2 py-0.5 rounded transition-colors"
                      >
                        {hiddenLegs.length === optimizedStops.length ? 'Show All Paths' : 'Hide All Paths'}
                      </button>
                    </div>
                    <div className="space-y-4 relative pl-4 before:absolute before:left-1.5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-slate-200">
                      <div className="relative text-xs flex items-center gap-2">
                        <span className="absolute -left-4 w-3.5 h-3.5 rounded-full bg-slate-400 border border-white" />
                        <span className="font-semibold text-slate-500">Start (Current location)</span>
                      </div>
                      {optimizedStops.map((stop, index) => {
                        const isLegHidden = hiddenLegs.includes(index);
                        return (
                          <div key={stop.submissionId} className="relative text-xs flex flex-col pl-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <span className="absolute -left-4 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white text-white flex items-center justify-center text-[8px] font-bold">
                                  {index + 1}
                                </span>
                                <div>
                                  <p className="font-semibold text-slate-800">{stop.customerFirstName} {stop.customerLastName}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{stop.streetAddress}</p>
                                  <p className="text-[9px] text-slate-400 mt-1 leading-snug">
                                    Path: <span className="font-semibold">{index === 0 ? 'Start' : `#${index}`}</span> ➔ <span className="font-semibold">#{index + 1}</span>
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setHiddenLegs(prev => 
                                    prev.includes(index)
                                      ? prev.filter(i => i !== index)
                                      : [...prev, index]
                                  );
                                }}
                                className={`p-1.5 rounded-md hover:bg-slate-100 transition-colors shrink-0 ${
                                  isLegHidden ? 'text-slate-400 hover:text-slate-600 bg-slate-50' : 'text-emerald-600 hover:text-emerald-800 bg-emerald-50'
                                }`}
                                title={isLegHidden ? "Show path to this stop" : "Hide path to this stop"}
                              >
                                {isLegHidden ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Stop Duration Analyzer Card */}
          <Card title="Stop Duration Analyzer" className="mb-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="analyzer-rider-select" className="block text-sm font-medium text-slate-700 mb-1">
                  Select Rider for Analysis
                </label>
                <select
                  id="analyzer-rider-select"
                  value={analyzerRider}
                  onChange={(e) => setAnalyzerRider(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
                >
                  <option value="">-- Choose Rider --</option>
                  {users
                    .filter(u => u.role !== 'admin' && u.role !== 'manager')
                    .map(u => (
                      <option key={u.username} value={u.username}>
                        {u.username}
                      </option>
                    ))}
                </select>
              </div>

              {!durationAnalytics ? (
                <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p>Select a rider to view average visit durations and highlights.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Performance stats summary */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-slate-500 mb-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Duration</span>
                      </div>
                      <p className="text-lg font-extrabold text-slate-800">
                        {durationAnalytics.avgDuration} <span className="text-xs font-normal text-slate-500">mins</span>
                      </p>
                    </div>

                    <div className={`border rounded-xl p-3 text-center transition-colors ${
                      durationAnalytics.exceededCount > 0 
                        ? 'bg-rose-50 border-rose-100 text-rose-800' 
                        : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    }`}>
                      <div className="flex items-center justify-center gap-1.5 mb-1 text-slate-500">
                        {durationAnalytics.exceededCount > 0 ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        ) : (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exceeded</span>
                      </div>
                      <p className="text-lg font-extrabold">
                        {durationAnalytics.exceededCount} <span className="text-xs font-normal">stops</span>
                      </p>
                    </div>
                  </div>

                  {/* List of analyzed stops */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Location Stop Details</p>
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {durationAnalytics.analyzedStops.map(({ stop, expected, actual, isExceeded, diff, source }) => (
                        <div 
                          key={stop.submissionId} 
                          className={`p-3 rounded-lg border text-xs transition-all ${
                            isExceeded 
                              ? 'bg-rose-50/50 border-rose-200 shadow-sm' 
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <p className="font-bold text-slate-800">
                                {stop.customerFirstName} {stop.customerLastName}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]" title={stop.streetAddress}>
                                {stop.streetAddress}
                              </p>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${
                              stop.status === ServiceStatus.Completed 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : stop.status === ServiceStatus.InProgress 
                                  ? 'bg-purple-100 text-purple-800' 
                                  : 'bg-blue-100 text-blue-800'
                            }`}>
                              {stop.status}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/50 pt-2 text-[10px] text-slate-600">
                            <div>
                              <p>Expected: <span className="font-semibold text-slate-700">{expected}m</span></p>
                              <p className="mt-0.5">
                                Spent: <span className={`font-semibold ${isExceeded ? 'text-rose-600 font-bold' : 'text-slate-800'}`}>{actual}m</span>
                              </p>
                            </div>
                            <div className="text-right">
                              {isExceeded ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold bg-rose-100/80 px-1.5 py-0.5 rounded text-[9px]">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  +{diff}m over
                                </span>
                              ) : (
                                <span className={`inline-block px-1 py-0.5 rounded text-[8px] bg-slate-200/60 text-slate-500 font-medium`}>
                                  {source === 'GPS' ? '📡 GPS Live' : '⚙️ Fallback'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
          
          <Card title="Agent Filters & List">
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map(opt => (
                  <button 
                    key={opt.id} 
                    onClick={() => handleStatusFilterChange(opt.id)} 
                    className={`px-2 py-1 text-sm rounded-md border-2 transition-all ${statusFilters.includes(opt.id) ? `${opt.color} ${opt.border} font-semibold` : 'bg-white hover:bg-slate-200 border-slate-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-2 max-h-[45vh] overflow-y-auto pr-2">
              {agentData.map(({ user, status, activeService }) => {
                const config = statusConfig[status];
                return (
                  <li key={user.username}>
                    <button 
                      onClick={() => panToUser(user)}
                      className={`w-full text-left p-3 rounded-lg border-l-4 transition-all duration-200 hover:shadow-md hover:border-brand-accent ${config.bg} ${config.border}`}
                      disabled={!user.latitude}
                    >
                      <div className="flex justify-between items-center">
                        <p className={`font-bold ${config.text}`}>{user.username}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>{status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {activeService ? `${status === 'BUSY' ? 'Upcoming: ' : ''}Servicing ${activeService.customerFirstName}` : 'Awaiting task'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {user.lastLocationUpdate ? `Updated ${timeSince(new Date(user.lastLocationUpdate))}` : 'No location data'}
                      </p>
                    </button>
                  </li>
                );
              })}
              {agentData.length === 0 && <p className="text-sm text-slate-500 p-4 text-center">No agents match filters.</p>}
            </ul>
          </Card>
        </div>

        {/* Google Map Container */}
        <div id="map-container" className="flex-1 min-h-[400px] relative rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50">
          {/* Quick On-Map Hub Radius Status Floating Indicator (when active) */}
          {showHubRadius && (
            <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm border border-indigo-200 rounded-lg px-3 py-1.5 shadow-md flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping shrink-0" />
              <span className="font-semibold text-slate-800">Hub Radius:</span>
              <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100">
                {effectiveMaxDistance} km
              </span>
              <span className="text-slate-500 text-[11px]">
                ({activeHubs.length} {activeHubs.length === 1 ? 'hub' : 'hubs'})
              </span>
              <button
                type="button"
                onClick={() => {
                  if (activeHubs.length > 0) {
                    setPanTarget({ lat: activeHubs[0].lat, lng: activeHubs[0].lng });
                  }
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold ml-1 underline cursor-pointer"
              >
                Pan to Hub
              </button>
            </div>
          )}

          <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
            <Map
              defaultCenter={{ lat: hubLat, lng: hubLng }}
              defaultZoom={12}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '75vh' }}
              mapTypeControl={true}
              streetViewControl={false}
            >
              <LiveMapController 
                panTarget={panTarget} 
                setPanTarget={setPanTarget} 
                tripPoints={tripPoints} 
              />

              {/* Hub Service Radius Circle Overlays and Hub Center Markers */}
              {showHubRadius && activeHubs.map(hub => (
                <React.Fragment key={hub.id}>
                  <MapServiceRadiusCircle
                    center={{ lat: hub.lat, lng: hub.lng }}
                    radiusKm={effectiveMaxDistance}
                    strokeColor="#4f46e5"
                    fillColor="#6366f1"
                    strokeOpacity={0.85}
                    strokeWeight={2}
                    fillOpacity={0.12}
                  />
                  <HubMarker
                    hub={hub}
                    radiusKm={effectiveMaxDistance}
                    onFocus={() => setPanTarget({ lat: hub.lat, lng: hub.lng })}
                  />
                </React.Fragment>
              ))}

              <MapZoomControls />

              {/* Draw Trip Polylines (if active) */}
              <TripHistoryPolylines segments={tripSegments} />

              {/* Render Trip Segment Start/End indicators */}
              {tripSegments.map((segment, idx) => {
                if (segment.points.length === 0) return null;
                const start = segment.points[0];
                const end = segment.points[segment.points.length - 1];
                return (
                  <React.Fragment key={idx}>
                    <AdvancedMarker position={start} title="Trip Start">
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid white', backgroundColor: '#22c55e', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </AdvancedMarker>
                    <AdvancedMarker position={end} title="Trip End">
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid white', backgroundColor: '#ef4444', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </AdvancedMarker>
                  </React.Fragment>
                );
              })}

              {/* Live Checked-In Agent Markers */}
              {agentData.map(agent => (
                <AgentMarker key={agent.user.username} agent={agent} />
              ))}

              {/* Draw Optimized Route segments */}
              {optimizedRouteData && (
                <OptimizedRouteDisplay 
                  legs={optimizedRouteData.legs}
                  stops={optimizedStops}
                  riderLocation={
                    selectedOptimizerRiderData?.rider.latitude && selectedOptimizerRiderData?.rider.longitude
                      ? { lat: selectedOptimizerRiderData.rider.latitude, lng: selectedOptimizerRiderData.rider.longitude }
                      : { lat: hubLat, lng: hubLng }
                  }
                  hiddenLegs={hiddenLegs}
                />
              )}

              {/* Map Zoom Listener */}
              <MapZoomListener zoom={zoom} setZoom={setZoom} />

              {/* Clustered Active Job Site Markers & Standalone Markers */}
              {clusteredJobs.map(cluster => {
                if (cluster.isCluster) {
                  return (
                    <ClusteredJobSiteMarker 
                      key={cluster.id} 
                      cluster={cluster} 
                    />
                  );
                } else {
                  const service = cluster.services[0];
                  return (
                    <JobSiteMarker 
                      key={service.submissionId} 
                      service={service} 
                    />
                  );
                }
              })}

              {/* Standalone Optimized Route Job Site Markers (Always unclustered with sequence number) */}
              {activeJobs
                .filter(service => optimizedStops.some(opt => opt.submissionId === service.submissionId))
                .map(service => {
                  const optIndex = optimizedStops.findIndex(s => s.submissionId === service.submissionId);
                  const sequenceNum = optIndex > -1 ? optIndex + 1 : undefined;
                  return (
                    <JobSiteMarker 
                      key={service.submissionId} 
                      service={service} 
                      sequenceNumber={sequenceNum} 
                    />
                  );
                })}

              {/* Demand Heatmap Layer */}
              {showHeatmap && completedServicePoints.length > 0 && (
                <HeatmapOverlay points={completedServicePoints} radius={45} />
              )}
            </Map>
          </APIProvider>
        </div>
      </div>
    </Card>
  );
};

export default LiveMapPage;
