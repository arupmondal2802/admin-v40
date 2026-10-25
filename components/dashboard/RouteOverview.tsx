import React, { useState, useEffect, useMemo, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { Service, User, Settings, ServiceStatus, DeliveryHub } from '../../types';
import { DEFAULT_DELIVERY_HUBS } from '../../constants';
import { IconMapPin, IconChevronLeft, IconChevronRight, IconClock, IconCheck, IconSettings } from '../ui/Icon';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { toast } from 'sonner';

interface RouteOverviewProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  settings: Settings;
  viewDate: Date;
  onViewDateChange?: (date: Date) => void;
  deliveryHubs?: DeliveryHub[];
}

// Inner helper component to manage route calculation & polyline rendering
interface RouteDisplayProps {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  intermediates: google.maps.LatLngLiteral[];
  travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING';
  optimizeOrder: boolean;
  onRouteCalculated: (result: {
    distanceMeters: number;
    durationMillis: number;
    optimizedOrder?: number[];
    legs: any[];
    path: google.maps.LatLngLiteral[];
  } | null) => void;
  isCalculating: boolean;
  setIsCalculating: (val: boolean) => void;
}

function RouteDisplay({
  origin,
  destination,
  intermediates,
  travelMode,
  optimizeOrder,
  onRouteCalculated,
  isCalculating,
  setIsCalculating
}: RouteDisplayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  // Prevent infinite re-renders by serializing objects for the dependency array
  const intermediatesKey = useMemo(() => JSON.stringify(intermediates), [intermediates]);
  const originKey = useMemo(() => JSON.stringify(origin), [origin]);
  const destinationKey = useMemo(() => JSON.stringify(destination), [destination]);

  useEffect(() => {
    if (!routesLib || !map) return;

    // Clear previous polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    setIsCalculating(true);

    const parsedOrigin = JSON.parse(originKey) as google.maps.LatLngLiteral;
    const parsedDestination = JSON.parse(destinationKey) as google.maps.LatLngLiteral;
    const parsedIntermediates = JSON.parse(intermediatesKey) as google.maps.LatLngLiteral[];

    const waypoints = parsedIntermediates.map(latLng => ({
      location: latLng
    }));

    const request: any = {
      origin: parsedOrigin,
      destination: parsedDestination,
      travelMode: travelMode,
      optimizeWaypointOrder: optimizeOrder,
      fields: [
        'path',
        'distanceMeters',
        'durationMillis',
        'legs.distanceMeters',
        'legs.durationMillis',
        'optimizedIntermediateWaypointIndices',
        'viewport'
      ],
    };

    if (waypoints.length > 0) {
      request.intermediates = waypoints;
    }

    routesLib.Route.computeRoutes(request)
      .then(({ routes }) => {
        if (routes && routes[0]) {
          const mainRoute = routes[0];
          
          // Draw polylines
          const newPolylines = mainRoute.createPolylines();
          newPolylines.forEach(p => {
            p.setOptions({
              strokeColor: '#3b82f6', // Premium Brand Blue
              strokeOpacity: 0.8,
              strokeWeight: 5,
            });
            p.setMap(map);
          });
          polylinesRef.current = newPolylines;

          // Fit bounds
          if (mainRoute.viewport) {
            map.fitBounds(mainRoute.viewport);
          } else if (mainRoute.path && mainRoute.path.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            mainRoute.path.forEach(pt => bounds.extend(pt));
            map.fitBounds(bounds);
          }

          // Callback with details
          onRouteCalculated({
            distanceMeters: mainRoute.distanceMeters || 0,
            durationMillis: mainRoute.durationMillis || 0,
            optimizedOrder: mainRoute.optimizedIntermediateWaypointIndices || [],
            legs: mainRoute.legs || [],
            path: mainRoute.path || []
          });
        } else {
          onRouteCalculated(null);
          toast.error("No route found with these stops.");
        }
      })
      .catch((err) => {
        console.error("Error computing routes:", err);
        onRouteCalculated(null);
        toast.error("Failed to compute routes. Make sure your API key has the Routes API enabled.");
      })
      .finally(() => {
        setIsCalculating(false);
      });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, originKey, destinationKey, intermediatesKey, travelMode, optimizeOrder]);

  return null;
}

// Map Auto-Fit component in case there's no calculated route yet
function MapAutoFit({ points, hubLat, hubLng }: { points: google.maps.LatLngLiteral[], hubLat: number, hubLng: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      map.setCenter({ lat: hubLat, lng: hubLng });
      map.setZoom(12);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  }, [map, points, hubLat, hubLng]);

  return null;
}

// Marker helper with an Anchor-based InfoWindow
function RouteStopMarker({
  position,
  title,
  label,
  color,
  details
}: {
  position: google.maps.LatLngLiteral;
  title: string;
  label: string;
  color: string;
  details?: React.ReactNode;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        onClick={() => setIsOpen(true)}
        title={title}
      >
        <Pin background={color} glyphColor="#fff" borderColor="#ffffff">
          <span className="text-white text-xs font-bold font-mono">{label}</span>
        </Pin>
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1 max-w-[240px] text-slate-800">
            <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-1 mb-1">
              {title}
            </h4>
            {details}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function RouteOverview({
  submissions,
  users,
  settings,
  viewDate,
  onViewDateChange,
  deliveryHubs
}: RouteOverviewProps) {
  // Hub Management System registered hubs
  const activeHubs = useMemo(() => {
    return (deliveryHubs && deliveryHubs.length > 0) ? deliveryHubs : DEFAULT_DELIVERY_HUBS;
  }, [deliveryHubs]);

  const [selectedHubId, setSelectedHubId] = useState<string>(activeHubs[0]?.id || 'HUB-KOLKATA');

  const selectedHub = useMemo(() => {
    return activeHubs.find(h => h.id === selectedHubId) || activeHubs[0];
  }, [activeHubs, selectedHubId]);

  const hubLat = selectedHub?.latitude ?? (selectedHub as any)?.lat ?? 22.4981461;
  const hubLng = selectedHub?.longitude ?? (selectedHub as any)?.lon ?? 88.3867093;
  const hubLocation = useMemo(() => ({ lat: hubLat, lng: hubLng }), [hubLat, hubLng]);

  const API_KEY =
    settings?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  // State
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [startFromHub, setStartFromHub] = useState<boolean>(true);
  const [returnToHub, setReturnToHub] = useState<boolean>(true);
  const [optimizeOrder, setOptimizeOrder] = useState<boolean>(true);
  const [travelMode, setTravelMode] = useState<'DRIVING' | 'WALKING' | 'BICYCLING'>('DRIVING');

  // Route calculations output state
  const [routeResults, setRouteResults] = useState<{
    distanceMeters: number;
    durationMillis: number;
    optimizedOrder?: number[];
    legs: any[];
    path: google.maps.LatLngLiteral[];
  } | null>(null);

  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [mapCenterTarget, setMapCenterTarget] = useState<google.maps.LatLngLiteral | null>(null);

  // Date helper
  const dateStr = useMemo(() => {
    return viewDate.toISOString().split('T')[0];
  }, [viewDate]);

  // Handle day step
  const handlePreviousDay = () => {
    if (onViewDateChange) {
      onViewDateChange(new Date(new Date(viewDate).setDate(viewDate.getDate() - 1)));
    }
  };
  const handleNextDay = () => {
    if (onViewDateChange) {
      onViewDateChange(new Date(new Date(viewDate).setDate(viewDate.getDate() + 1)));
    }
  };
  const handleGoToToday = () => {
    if (onViewDateChange) {
      onViewDateChange(new Date());
    }
  };

  // Find all appointments on this day
  const todaysAppointments = useMemo(() => {
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();
    const viewDay = viewDate.getDate();

    return submissions
      .filter(s => {
        if (s.status === ServiceStatus.Draft) return false;
        if (!s.scheduledDate || !s.scheduledTime) return false;

        try {
          const timePart = s.scheduledTime.split(' - ')[0];
          const [hour, minute] = timePart.split(':').map(Number);
          const parts = s.scheduledDate.split('T')[0].split('-');
          if (parts.length === 3) {
            const year = Number(parts[0]);
            const month = Number(parts[1]) - 1;
            const day = Number(parts[2]);
            return year === viewYear && month === viewMonth && day === viewDay;
          }
          const d = new Date(s.scheduledDate);
          return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === viewDay;
        } catch (e) {
          return false;
        }
      })
      .sort((a, b) => {
        // Sort by scheduled time chronologically
        const getTimeVal = (s: Service) => {
          try {
            const timePart = s.scheduledTime ? s.scheduledTime.split(' - ')[0] : '00:00';
            const [h, m] = timePart.split(':').map(Number);
            return h * 60 + m;
          } catch {
            return 0;
          }
        };
        return getTimeVal(a) - getTimeVal(b);
      });
  }, [submissions, viewDate]);

  // List of agents that have jobs assigned today
  const agentsWithJobs = useMemo(() => {
    const agentSet = new Set<string>();
    todaysAppointments.forEach(s => {
      if (s.assignedTo) {
        agentSet.add(s.assignedTo);
      }
    });
    return Array.from(agentSet);
  }, [todaysAppointments]);

  // Filtered jobs by agent selection
  const filteredAppointments = useMemo(() => {
    if (selectedAgent === 'ALL') {
      return todaysAppointments;
    }
    return todaysAppointments.filter(s => s.assignedTo === selectedAgent);
  }, [todaysAppointments, selectedAgent]);

  // Split into jobs with vs without coordinates
  const { jobsWithCoords, jobsWithoutCoords } = useMemo(() => {
    const withC: Service[] = [];
    const withoutC: Service[] = [];

    filteredAppointments.forEach(s => {
      if (typeof s.customerLatitude === 'number' && typeof s.customerLongitude === 'number') {
        withC.push(s);
      } else {
        withoutC.push(s);
      }
    });

    return { jobsWithCoords: withC, jobsWithoutCoords: withoutC };
  }, [filteredAppointments]);

  // Format Origin, Destination, Intermediates
  const routePoints = useMemo(() => {
    if (jobsWithCoords.length === 0) return null;

    const coords = jobsWithCoords.map(j => ({
      lat: j.customerLatitude!,
      lng: j.customerLongitude!
    }));

    let origin: google.maps.LatLngLiteral;
    let destination: google.maps.LatLngLiteral;
    let intermediates: google.maps.LatLngLiteral[] = [];

    if (startFromHub) {
      origin = hubLocation;
      if (returnToHub) {
        destination = hubLocation;
        intermediates = coords;
      } else {
        destination = coords[coords.length - 1];
        intermediates = coords.slice(0, -1);
      }
    } else {
      origin = coords[0];
      if (returnToHub) {
        destination = hubLocation;
        intermediates = coords.slice(1);
      } else {
        destination = coords[coords.length - 1];
        intermediates = coords.slice(1, -1);
      }
    }

    return { origin, destination, intermediates };
  }, [jobsWithCoords, startFromHub, returnToHub, hubLocation]);

  // Re-order stops based on optimized order returned by Routes API
  const orderedStopsTimeline = useMemo(() => {
    if (jobsWithCoords.length === 0) return [];

    const timeline: Array<{
      type: 'HUB' | 'JOB';
      label: string;
      title: string;
      service?: Service;
      latLng: google.maps.LatLngLiteral;
    }> = [];

    // Helper to get raw coordinates index
    // Note: Intermediates in our route points are mapped from coordinates list
    const originalIntermediates = routePoints?.intermediates || [];

    let orderedIntermediates = [...originalIntermediates];

    if (optimizeOrder && routeResults?.optimizedOrder && routeResults.optimizedOrder.length > 0) {
      // Re-order according to indices
      orderedIntermediates = routeResults.optimizedOrder.map(idx => originalIntermediates[idx]);
    }

    // Origin
    if (startFromHub) {
      timeline.push({
        type: 'HUB',
        label: 'Start (Hub)',
        title: 'Starting Depot (Hub)',
        latLng: hubLocation
      });
    }

    // Add jobs in their active order
    // If not optimized, or no results yet, show in original chronological order
    const orderedJobs = [...jobsWithCoords];
    if (optimizeOrder && routeResults?.optimizedOrder && routeResults.optimizedOrder.length > 0) {
      // Let's match the intermediates back to the jobs
      // Intermediates correspond to:
      // Case A (startFromHub && returnToHub): intermediates contains all jobs
      // Case B (startFromHub && !returnToHub): intermediates contains all jobs except the last job
      // Case C (!startFromHub && returnToHub): intermediates contains all jobs except the first job
      // Case D (!startFromHub && !returnToHub): intermediates contains all jobs except first and last job
      
      const intermediateJobs = [...jobsWithCoords];
      let firstJob: Service | null = null;
      let lastJob: Service | null = null;

      if (!startFromHub) {
        firstJob = intermediateJobs.shift() || null;
      }
      if (!returnToHub) {
        lastJob = intermediateJobs.pop() || null;
      }

      // Re-order intermediate jobs based on optimizedOrder index
      const reorderedIntermediates = routeResults.optimizedOrder.map(idx => intermediateJobs[idx]);

      const finalJobs: Service[] = [];
      if (firstJob) finalJobs.push(firstJob);
      reorderedIntermediates.forEach(j => { if (j) finalJobs.push(j); });
      if (lastJob) finalJobs.push(lastJob);

      finalJobs.forEach((job, index) => {
        timeline.push({
          type: 'JOB',
          label: `Stop ${index + 1}`,
          title: `${job.customerFirstName} ${job.customerLastName}`,
          service: job,
          latLng: { lat: job.customerLatitude!, lng: job.customerLongitude! }
        });
      });
    } else {
      // Chronological order
      jobsWithCoords.forEach((job, index) => {
        timeline.push({
          type: 'JOB',
          label: `Stop ${index + 1}`,
          title: `${job.customerFirstName} ${job.customerLastName}`,
          service: job,
          latLng: { lat: job.customerLatitude!, lng: job.customerLongitude! }
        });
      });
    }

    // Destination
    if (returnToHub) {
      timeline.push({
        type: 'HUB',
        label: 'End (Hub)',
        title: 'Returning Depot (Hub)',
        latLng: hubLocation
      });
    }

    return timeline;
  }, [jobsWithCoords, startFromHub, returnToHub, optimizeOrder, routeResults, routePoints, hubLocation]);

  // Reset route results when points or mode change
  useEffect(() => {
    setRouteResults(null);
  }, [routePoints, travelMode, optimizeOrder]);

  // Custom pan helper
  const mapRef = useRef<any>(null);
  const handleFocusStop = (latLng: google.maps.LatLngLiteral) => {
    setMapCenterTarget(latLng);
  };

  // Human legible formatting
  const formattedDistance = useMemo(() => {
    if (!routeResults) return '0.0 km';
    const km = routeResults.distanceMeters / 1000;
    return `${km.toFixed(1)} km`;
  }, [routeResults]);

  const formattedDuration = useMemo(() => {
    if (!routeResults) return '0 mins';
    const totalMins = Math.floor(routeResults.durationMillis / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins} mins`;
  }, [routeResults]);

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center font-sans">
        <h2 className="text-lg font-bold text-slate-800 mb-2">Google Maps API Key Required</h2>
        <p className="text-sm text-slate-600 max-w-md mb-4">
          Please set the <strong>GOOGLE_MAPS_PLATFORM_KEY</strong> secret in your project settings to enable the Route Overview feature.
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

  return (
    <div className="space-y-6">
      {/* Top Routing controls bar */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <IconMapPin className="w-6 h-6 text-brand-blue" />
              Daily Route Overview
            </h2>
            <p className="text-sm text-slate-500">
              Calculate total travel distance and estimated time for assigned jobs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Day Selector */}
            <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
              <Button variant="ghost" onClick={handlePreviousDay} className="p-1 h-8 w-8 text-slate-600 hover:text-slate-800" title="Previous Day">
                <IconChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs font-bold text-slate-700 px-2 min-w-[100px] text-center">
                {viewDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              <Button variant="ghost" onClick={handleNextDay} className="p-1 h-8 w-8 text-slate-600 hover:text-slate-800" title="Next Day">
                <IconChevronRight className="w-4 h-4" />
              </Button>
              <button onClick={handleGoToToday} className="text-[10px] font-bold text-brand-blue hover:underline bg-white py-1 px-2 rounded border border-slate-200 shadow-sm">
                Today
              </button>
            </div>

            {/* Hub Management System Registered Hub Select */}
            <div className="flex items-center space-x-2">
              <label htmlFor="hub-depot-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:inline">Depot Hub:</label>
              <select
                id="hub-depot-select"
                value={selectedHubId}
                onChange={(e) => setSelectedHubId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-blue shadow-sm"
              >
                {activeHubs.map(h => (
                  <option key={h.id} value={h.id}>
                    📍 {h.name} ({h.type ? h.type.toUpperCase() : 'BOTH'})
                  </option>
                ))}
              </select>
            </div>

            {/* Agent Dropdown */}
            <div className="flex items-center space-x-2">
              <select
                id="agent-route-select"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-blue shadow-sm"
              >
                <option value="ALL">-- All Active Jobs ({todaysAppointments.length}) --</option>
                {users.map(u => {
                  const jobCount = todaysAppointments.filter(s => s.assignedTo === u.username).length;
                  return (
                    <option key={u.username} value={u.username}>
                      {u.username} ({jobCount} jobs)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Detailed Config Options */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100 text-sm">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="startFromHub"
              checked={startFromHub}
              onChange={(e) => setStartFromHub(e.target.checked)}
              className="h-4 w-4 text-brand-blue border-slate-300 rounded focus:ring-brand-blue"
            />
            <label htmlFor="startFromHub" className="font-semibold text-slate-700 select-none">
              Start from Depot (Hub)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="returnToHub"
              checked={returnToHub}
              onChange={(e) => setReturnToHub(e.target.checked)}
              className="h-4 w-4 text-brand-blue border-slate-300 rounded focus:ring-brand-blue"
            />
            <label htmlFor="returnToHub" className="font-semibold text-slate-700 select-none">
              Return to Depot (Hub)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="optimizeOrder"
              checked={optimizeOrder}
              onChange={(e) => setOptimizeOrder(e.target.checked)}
              className="h-4 w-4 text-brand-blue border-slate-300 rounded focus:ring-brand-blue"
            />
            <label htmlFor="optimizeOrder" className="font-semibold text-slate-700 select-none flex items-center gap-1.5">
              Optimize Stops Order
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                Smart
              </span>
            </label>
          </div>

          <div>
            <select
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-blue"
            >
              <option value="DRIVING">🚗 Driving Mode</option>
              <option value="WALKING">🚶 Walking Mode</option>
              <option value="BICYCLING">🚲 Bicycling Mode</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main calculation layout */}
      {filteredAppointments.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-slate-500 font-medium">No assigned jobs scheduled for this day.</p>
          <p className="text-xs text-slate-400 mt-1">Select a different day or assign a service order to begin.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Stops & Timeline list: Span 5 */}
          <div className="lg:col-span-5 space-y-4 max-h-[750px] overflow-y-auto pr-2">
            
            {/* Quick Metrics Header Card */}
            <div className="bg-[#0e213e] text-white rounded-xl p-4 shadow-md grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Total Distance</p>
                <div className="flex items-baseline space-x-1 mt-1">
                  {isCalculating ? (
                    <span className="text-sm text-slate-300 animate-pulse">Calculating...</span>
                  ) : (
                    <span className="text-2xl font-black tracking-tight">{formattedDistance}</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Total Duration</p>
                <div className="flex items-baseline space-x-1 mt-1">
                  {isCalculating ? (
                    <span className="text-sm text-slate-300 animate-pulse">Calculating...</span>
                  ) : (
                    <span className="text-2xl font-black tracking-tight text-brand-accent">{formattedDuration}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Warning for unrouted points */}
            {jobsWithoutCoords.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs space-y-1.5">
                <p className="font-bold">⚠️ {jobsWithoutCoords.length} orders missing map coordinates:</p>
                <p className="text-slate-600">These orders will not be computed on the route. Update their street addresses or select valid locations on the map to include them.</p>
                <div className="max-h-[80px] overflow-y-auto space-y-1 mt-1 font-mono text-[11px] text-slate-500">
                  {jobsWithoutCoords.map(j => (
                    <div key={j.submissionId}>• {j.customerFirstName} {j.customerLastName} ({j.streetAddress})</div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline stops flow */}
            <div className="space-y-4">
              <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">Scheduled Stops Flow</h3>
              
              <div className="relative pl-6 border-l-2 border-dashed border-slate-300 ml-3 space-y-6 py-1">
                {orderedStopsTimeline.map((stop, stopIdx) => {
                  const isHub = stop.type === 'HUB';
                  const job = stop.service;
                  const legInfo = routeResults?.legs?.[stopIdx - 1]; // segment information leading to this stop

                  return (
                    <React.Fragment key={`${stop.type}-${stopIdx}`}>
                      {/* Optional segment travel distance/time label inserted BEFORE a job or final Hub stop */}
                      {stopIdx > 0 && routeResults && legInfo && (
                        <div className="absolute -left-[9px] translate-y-[-24px] z-10 flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-sm font-mono">
                          <IconClock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Segment: {(legInfo.distanceMeters / 1000).toFixed(1)} km ({Math.floor(legInfo.durationMillis / 60000)}m)</span>
                        </div>
                      )}

                      <div className="relative">
                        {/* Bullet Marker dot on the dashed line */}
                        <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-md flex items-center justify-center ${isHub ? 'bg-emerald-500' : 'bg-brand-blue'}`}>
                          {isHub ? (
                            <span className="text-[8px] font-bold text-white font-sans">H</span>
                          ) : (
                            <span className="text-[8px] font-bold text-white font-sans">{stopIdx}</span>
                          )}
                        </div>

                        {/* Stop details card */}
                        <div 
                          onClick={() => handleFocusStop(stop.latLng)}
                          className="bg-white hover:border-brand-blue border border-slate-200 rounded-xl p-4 shadow-sm transition-all cursor-pointer select-none group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400 font-mono tracking-wider">
                                {stop.label}
                              </p>
                              <h4 className="font-bold text-slate-800 text-sm mt-0.5 group-hover:text-brand-blue transition-colors">
                                {stop.title}
                              </h4>
                            </div>

                            {!isHub && job && (
                              <div className="text-right">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {job.scheduledTime}
                                </span>
                              </div>
                            )}
                          </div>

                          {!isHub && job && (
                            <div className="mt-2 text-xs text-slate-600 space-y-1 border-t border-slate-50 pt-2">
                              <p><strong className="text-slate-400">Car:</strong> {job.carBrandModel} ({job.carNumber})</p>
                              <p className="truncate"><strong className="text-slate-400">Address:</strong> {job.streetAddress}</p>
                              {job.assignedTo && (
                                <p className="text-[11px] text-brand-blue font-semibold mt-1">🧑‍🔧 Assigned to: {job.assignedTo}</p>
                              )}
                            </div>
                          )}

                          {isHub && (
                            <p className="text-xs text-slate-500 mt-1">Depot coordinates: {stop.latLng.lat.toFixed(4)}, {stop.latLng.lng.toFixed(4)}</p>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Interactive Route Map panel: Span 7 */}
          <div className="lg:col-span-7 flex flex-col h-[650px] relative rounded-xl overflow-hidden border border-slate-200 shadow-md bg-slate-50">
            <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
              <Map
                defaultCenter={{ lat: hubLat, lng: hubLng }}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
                mapTypeControl={true}
                streetViewControl={false}
              >
                {/* Automatic center pan listener */}
                <MapController centerTarget={mapCenterTarget} />

                {/* Auto-fit map to points if no calculated route polyline viewport is loaded yet */}
                {!routeResults && (
                  <MapAutoFit 
                    points={orderedStopsTimeline.map(s => s.latLng)} 
                    hubLat={hubLat} 
                    hubLng={hubLng} 
                  />
                )}

                {/* Calculate & draw polylines dynamically using RouteDisplay */}
                {routePoints && (
                  <RouteDisplay 
                    origin={routePoints.origin}
                    destination={routePoints.destination}
                    intermediates={routePoints.intermediates}
                    travelMode={travelMode}
                    optimizeOrder={optimizeOrder}
                    onRouteCalculated={setRouteResults}
                    isCalculating={isCalculating}
                    setIsCalculating={setIsCalculating}
                  />
                )}

                {/* Always draw Markers representing the Stops */}
                {orderedStopsTimeline.map((stop, idx) => {
                  const isHub = stop.type === 'HUB';
                  const label = isHub ? 'H' : String(idx);
                  const markerColor = isHub ? '#10b981' : '#3b82f6';

                  return (
                    <RouteStopMarker 
                      key={`${stop.type}-${idx}-marker`}
                      position={stop.latLng}
                      title={stop.title}
                      label={label}
                      color={markerColor}
                      details={
                        !isHub && stop.service ? (
                          <div className="space-y-1 text-xs">
                            <p><strong>Car:</strong> {stop.service.carBrandModel}</p>
                            <p><strong>Plate:</strong> {stop.service.carNumber}</p>
                            <p><strong>Time:</strong> {stop.service.scheduledTime}</p>
                            <p><strong>Address:</strong> {stop.service.streetAddress}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Operation Headquarters</p>
                        )
                      }
                    />
                  );
                })}
              </Map>
            </APIProvider>
          </div>

        </div>
      )}
    </div>
  );
}

// Map navigation controller component
function MapController({ centerTarget }: { centerTarget: google.maps.LatLngLiteral | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !centerTarget) return;
    map.panTo(centerTarget);
    map.setZoom(15);
  }, [map, centerTarget]);

  return null;
}
