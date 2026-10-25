import React, { useMemo, useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { Service, ServiceStatus, Settings, DeliveryHub } from '../../types';
import { DEFAULT_DELIVERY_HUBS } from '../../constants';
import { toISTDateString } from '../../utils/dateTimeUtils';
import { IconMapPin } from '../ui/Icon';
import MapZoomControls from '../ui/MapZoomControls';

interface AppointmentsMapProps {
  services: Service[];
  settings?: Settings;
  deliveryHubs?: DeliveryHub[];
}

function HubMarker({ hub }: { hub: DeliveryHub }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);
  const lat = hub.latitude ?? (hub as any).lat ?? 0;
  const lng = hub.longitude ?? (hub as any).lon ?? 0;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat, lng }}
        onClick={() => setIsOpen(true)}
        title={hub.name}
      >
        <Pin background="#ef4444" glyphColor="#ffffff" borderColor="#991b1b">
          <span className="text-white text-[10px] font-bold">HUB</span>
        </Pin>
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="p-2 text-slate-800 max-w-[200px]">
            <h4 className="font-bold text-sm text-slate-900 border-b pb-1 mb-1">📍 {hub.name}</h4>
            <p className="text-xs text-slate-600">Type: <span className="font-semibold uppercase">{hub.type || 'BOTH'}</span></p>
            <p className="text-[11px] text-slate-500 font-mono mt-1">{lat.toFixed(4)}, {lng.toFixed(4)}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Component to handle auto-fitting bounds to show all pins
function MapFitBounds({ services, hubLat, hubLng }: { services: Service[], hubLat: number, hubLng: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (services.length === 0) {
      map.setCenter({ lat: hubLat, lng: hubLng });
      map.setZoom(12);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    services.forEach(s => {
      if (typeof s.customerLatitude === 'number' && typeof s.customerLongitude === 'number') {
        bounds.extend({ lat: s.customerLatitude, lng: s.customerLongitude });
        hasPoints = true;
      }
    });

    if (hasPoints) {
      if (services.length === 1) {
        const first = services[0];
        map.setCenter({ lat: first.customerLatitude!, lng: first.customerLongitude! });
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
      }
    } else {
      map.setCenter({ lat: hubLat, lng: hubLng });
      map.setZoom(12);
    }
  }, [map, services, hubLat, hubLng]);

  return null;
}

// Marker component with an anchor-based InfoWindow on click
function AppointmentMarker({ service, color }: { service: Service; color: string }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isOpen, setIsOpen] = useState(false);

  if (typeof service.customerLatitude !== 'number' || typeof service.customerLongitude !== 'number') {
    return null;
  }

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: service.customerLatitude, lng: service.customerLongitude }}
        onClick={() => setIsOpen(true)}
        title={`${service.customerFirstName} ${service.customerLastName}`}
      >
        <Pin background={color} glyphColor="#fff" borderColor="#ffffff" />
      </AdvancedMarker>
      {isOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setIsOpen(false)}>
          <div className="font-sans p-1 max-w-[240px] text-slate-800">
            <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-1 mb-1">
              {service.customerFirstName} {service.customerLastName}
            </h4>
            <div className="space-y-1 text-xs">
              <p><strong>Car:</strong> {service.carBrandModel} ({service.carNumber})</p>
              <p><strong>Address:</strong> {service.streetAddress}</p>
              {service.scheduledDate && (
                <p><strong>Scheduled:</strong> {service.scheduledDate.split('T')[0]} {service.scheduledTime || ''}</p>
              )}
              <div 
                className="mt-2 inline-block font-semibold px-2 py-0.5 rounded text-[10px]" 
                style={{ backgroundColor: `${color}15`, color: color }}
              >
                {service.status}
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export const AppointmentsMap: React.FC<AppointmentsMapProps> = ({ services, settings, deliveryHubs }) => {
  const API_KEY =
    settings?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const activeHubs = useMemo(() => {
    return (deliveryHubs && deliveryHubs.length > 0) ? deliveryHubs : DEFAULT_DELIVERY_HUBS;
  }, [deliveryHubs]);

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  const hubLat = activeHubs[0]?.latitude ?? (activeHubs[0] as any)?.lat ?? 22.4981461;
  const hubLng = activeHubs[0]?.longitude ?? (activeHubs[0] as any)?.lon ?? 88.3867093;

  // Filters
  const mapFilteredServices = useMemo(() => {
    return services.filter(s => {
      if (!s.scheduledDate) {
        if (fromDate || toDate) return false;
        return true;
      }
      const scheduledDateStr = toISTDateString(s.scheduledDate);
      if (fromDate && scheduledDateStr < fromDate) return false;
      if (toDate && scheduledDateStr > toDate) return false;
      return true;
    });
  }, [services, fromDate, toDate]);

  // Split into pinned vs unpinned services
  const { pinnedServices, unpinnedServicesCount } = useMemo(() => {
    const pinned: Service[] = [];
    let unpinnedCount = 0;

    mapFilteredServices.forEach(s => {
      if (typeof s.customerLatitude === 'number' && typeof s.customerLongitude === 'number') {
        pinned.push(s);
      } else {
        unpinnedCount++;
      }
    });

    return { pinnedServices: pinned, unpinnedServicesCount: unpinnedCount };
  }, [mapFilteredServices]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = { Assigned: 0, InProgress: 0, Completed: 0, Queued: 0, Draft: 0 };
    pinnedServices.forEach(s => {
      if (s.status === ServiceStatus.Assigned) counts.Assigned++;
      else if (s.status === ServiceStatus.InProgress) counts.InProgress++;
      else if (s.status === ServiceStatus.Completed) counts.Completed++;
      else if (s.status === ServiceStatus.Queued) counts.Queued++;
      else if (s.status === ServiceStatus.Draft) counts.Draft++;
    });
    return counts;
  }, [pinnedServices]);

  const handleClearMapFilters = () => {
    setFromDate('');
    setToDate('');
  };

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center font-sans">
        <h2 className="text-lg font-bold text-slate-800 mb-2">Google Maps API Key Required</h2>
        <p className="text-sm text-slate-600 max-w-md mb-4">
          Please set the <strong>GOOGLE_MAPS_PLATFORM_KEY</strong> secret in your project settings to enable the dynamic map features.
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
    <div className="space-y-4">
      {/* Google Maps Date Range & Stats Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Google Maps Service Integration</h3>
            <p className="text-xs text-slate-500">Chronological service orders mapped globally with live status color overlays</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
            <div>
              <label htmlFor="map-from-date" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">From Date</label>
              <input
                id="map-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent text-sm"
              />
            </div>
            <div>
              <label htmlFor="map-to-date" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">To Date</label>
              <input
                id="map-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent text-sm"
              />
            </div>
          </div>

          {/* Status Legend */}
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
            {statusCounts.Assigned > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                <span>Assigned {statusCounts.Assigned}</span>
              </div>
            )}
            {statusCounts.InProgress > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7]"></span>
                <span>In Progress {statusCounts.InProgress}</span>
              </div>
            )}
            {statusCounts.Completed > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                <span>Completed {statusCounts.Completed}</span>
              </div>
            )}
            {statusCounts.Queued > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></span>
                <span>Queued {statusCounts.Queued}</span>
              </div>
            )}
            {(fromDate || toDate) && (
              <button
                onClick={handleClearMapFilters}
                className="text-xs text-brand-blue hover:underline font-semibold ml-2 border-l border-slate-200 pl-2"
              >
                Clear Range
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map Pinned Status Indicator bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <span className="flex items-center font-medium text-slate-700">
          <IconMapPin className="w-4 h-4 mr-1 text-slate-500" />
          {pinnedServices.length} orders pinned on Google Map
        </span>
        {unpinnedServicesCount > 0 && (
          <span className="text-slate-400">
            {unpinnedServicesCount} without location (not shown)
          </span>
        )}
      </div>

      {/* Google Map Canvas */}
      <div id="map-container" className="relative rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50 h-[550px] w-full">
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
            <MapFitBounds services={pinnedServices} hubLat={hubLat} hubLng={hubLng} />
            <MapZoomControls />

            {/* Hub Management System Hub Markers */}
            {activeHubs.map(hub => (
              <HubMarker key={hub.id} hub={hub} />
            ))}

            {pinnedServices.map(service => {
              let color = '#3b82f6'; // Blue
              if (service.status === ServiceStatus.Completed) color = '#10b981'; // Green
              else if (service.status === ServiceStatus.InProgress) color = '#a855f7'; // Purple
              else if (service.status === ServiceStatus.Queued) color = '#f59e0b'; // Amber

              return (
                <AppointmentMarker 
                  key={service.submissionId} 
                  service={service} 
                  color={color} 
                />
              );
            })}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
};
