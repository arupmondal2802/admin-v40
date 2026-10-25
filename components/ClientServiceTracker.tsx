import React, { useEffect, useState, useMemo, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db, isQuotaExceeded, setQuotaExceeded, checkIsQuotaError } from '../services/firebase';
import { Service, ServiceStatus, Settings, LocationHistory } from '../types';
import * as cloudDataService from '../services/cloudDataService';
import { getIndexedDbItem } from '../services/indexedDbService';
import { 
  MapPin, 
  Clock, 
  User, 
  CheckCircle2, 
  Calendar, 
  AlertTriangle, 
  Loader2, 
  Wrench, 
  Map as MapIcon, 
  Phone,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Check
} from 'lucide-react';

const riderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 18px; height: 18px; color: white;"><path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h1.5v-1.125c0-1.036.84-1.875 1.875-1.875h13.5c1.035 0 1.875.84 1.875 1.875v1.125h1.5V6.375c0-1.036-.84-1.875-1.875-1.875h-13.5Z" /><path fill-rule="evenodd" d="M3 19.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm12 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM1.5 15a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Zm12 0a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg>`;
const houseIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px; color: white;"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>`;

// Driving Route polyline generator component
function DrivingRouteDisplay({
  origin,
  destination,
  onRouteComputed
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  onRouteComputed: (info: { distance: string; duration: string }) => void;
}) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLibrary || !map || !origin || !destination) return;

    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    routesLibrary.Route.computeRoutes({
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport']
    })
      .then((response) => {
        if (response.routes && response.routes[0]) {
          const route = response.routes[0];
          const polylines = route.createPolylines();
          polylines.forEach((poly) => poly.setMap(map));
          polylinesRef.current = polylines;

          if (route.viewport) {
            map.fitBounds(route.viewport);
          }

          const distanceKm = ((route.distanceMeters || 0) / 1000).toFixed(1);
          const durationMins = Math.round((route.durationMillis || 0) / 60000);
          onRouteComputed({
            distance: `${distanceKm} km`,
            duration: `${durationMins} mins`
          });
        }
      })
      .catch((error) => {
        console.error('Error computing driving route:', error);
      });

    return () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    };
  }, [routesLibrary, map, origin.lat, origin.lng, destination.lat, destination.lng]);

  return null;
}

interface Props {
  trackingId: string;
  settings: Settings;
  onBackToApp?: () => void;
}

export const ClientServiceTracker: React.FC<Props> = ({ trackingId, settings, onBackToApp }) => {
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [riderCoords, setRiderCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [showItemDetails, setShowItemDetails] = useState(false);

  const API_KEY = useMemo(() => {
    return (
      process.env.GOOGLE_MAPS_PLATFORM_KEY ||
      (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
      settings.googleMapsApiKey ||
      'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M'
    );
  }, [settings.googleMapsApiKey]);

  // Helper for flexible order matching across submissionId, appointmentId, suffixes, and mobile numbers
  const matchServiceOrder = (submissions: Service[], searchId: string): Service | null => {
    if (!submissions || !submissions.length || !searchId) return null;
    const rawTarget = String(searchId).trim().toLowerCase();
    const cleanTarget = rawTarget.replace(/^#/, '');

    // 1. Direct submissionId match
    let matched = submissions.find(s => s.submissionId && String(s.submissionId).trim().toLowerCase() === cleanTarget);
    if (matched) return matched;

    // 2. Direct appointmentId match
    matched = submissions.find(s => s.appointmentId && String(s.appointmentId).trim().toLowerCase() === cleanTarget);
    if (matched) return matched;

    // 3. Match appointmentId suffix (e.g. "1042" matching "ABE-1042")
    matched = submissions.find(s => {
      if (!s.appointmentId) return false;
      const parts = String(s.appointmentId).trim().toLowerCase().split('-');
      const suffix = parts.pop();
      return suffix === cleanTarget || parts.join('-') === cleanTarget;
    });
    if (matched) return matched;

    // 4. Match submissionId suffix
    matched = submissions.find(s => {
      if (!s.submissionId) return false;
      const sub = String(s.submissionId).trim().toLowerCase();
      return sub.endsWith(cleanTarget) || cleanTarget.endsWith(sub);
    });
    if (matched) return matched;

    // 5. Match mobile number if 8+ digits
    if (cleanTarget.replace(/\D/g, '').length >= 8) {
      const cleanDigits = cleanTarget.replace(/\D/g, '');
      matched = submissions.find(s => s.mobileNumber && String(s.mobileNumber).replace(/\D/g, '').includes(cleanDigits));
      if (matched) return matched;
    }

    // 6. Substring match fallback
    return submissions.find(s => {
      const sub = String(s.submissionId || '').toLowerCase();
      const appt = String(s.appointmentId || '').toLowerCase();
      return (sub && sub.includes(cleanTarget)) || (appt && appt.includes(cleanTarget));
    }) || null;
  };

  // 1. Fetch from Firestore / subscribe to real-time changes
  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);

    let isMounted = true;
    let unsubscribeFirestore: (() => void) | null = null;

    const tryFastLocalLookup = async () => {
      try {
        const cachedSubs = (await getIndexedDbItem<Service[]>('service_app_submissions', [])) || [];
        if (!isMounted) return;
        if (cachedSubs && cachedSubs.length > 0) {
          const matched = matchServiceOrder(cachedSubs, trackingId);
          if (matched && isMounted) {
            setService(matched);
            setLoading(false);
            if (typeof matched.riderLatitude === 'number' && typeof matched.riderLongitude === 'number') {
              setRiderCoords({ lat: matched.riderLatitude, lng: matched.riderLongitude });
            }
          }
        }
      } catch (e) {
        console.warn('Fast local tracking lookup warning:', e);
      }
    };

    const tryFirestoreLookup = async () => {
      // Execute fast local lookup first
      await tryFastLocalLookup();
      if (!isMounted) return;

      if (db && !isQuotaExceeded()) {
        try {
          const cleanId = String(trackingId || '').trim().replace(/^#/, '');
          
          // Try direct document ID lookup first
          const docRef = doc(db, 'submissions', cleanId);
          const unsub = onSnapshot(
            docRef,
            async (docSnap) => {
              if (!isMounted) return;
              if (docSnap.exists()) {
                const data = docSnap.data() as Service;
                setService(data);
                setLoading(false);

                if (typeof data.riderLatitude === 'number' && typeof data.riderLongitude === 'number') {
                  setRiderCoords({
                    lat: data.riderLatitude,
                    lng: data.riderLongitude
                  });
                }
              } else {
                // Not found by direct doc ID. Try Firestore queries by appointmentId or submissionId
                const foundDoc = await queryFirestoreByAlternateKeys(cleanId);
                if (!foundDoc && isMounted) {
                  fetchFromAppDataFallback();
                }
              }
            },
            (err) => {
              if (!isMounted) return;
              console.error('Firestore listener error:', err);
              if (checkIsQuotaError(err)) {
                setQuotaExceeded(true);
              }
              fetchFromAppDataFallback();
            }
          );

          if (!isMounted) {
            unsub();
          } else {
            unsubscribeFirestore = unsub;
          }
        } catch (e) {
          console.warn('Firestore subscription failed, falling back:', e);
          if (isMounted) fetchFromAppDataFallback();
        }
      } else {
        if (isMounted) fetchFromAppDataFallback();
      }
    };

    const queryFirestoreByAlternateKeys = async (cleanId: string): Promise<boolean> => {
      try {
        const colRef = collection(db, 'submissions');
        
        // Try appointmentId query
        const q1 = query(colRef, where('appointmentId', '==', cleanId));
        let snap = await getDocs(q1);
        if (!isMounted) return false;
        
        if (snap.empty && !cleanId.toUpperCase().startsWith('ABE-')) {
          const q1Prefix = query(colRef, where('appointmentId', '==', `ABE-${cleanId}`));
          snap = await getDocs(q1Prefix);
          if (!isMounted) return false;
        }

        if (snap.empty) {
          const q2 = query(colRef, where('submissionId', '==', cleanId));
          snap = await getDocs(q2);
          if (!isMounted) return false;
        }

        if (!snap.empty && snap.docs[0]) {
          const targetDocId = snap.docs[0].id;
          // Subscribe to the found document
          const unsub = onSnapshot(doc(db, 'submissions', targetDocId), (docSnap) => {
            if (!isMounted) return;
            if (docSnap.exists()) {
              const data = docSnap.data() as Service;
              setService(data);
              setLoading(false);
              if (typeof data.riderLatitude === 'number' && typeof data.riderLongitude === 'number') {
                setRiderCoords({ lat: data.riderLatitude, lng: data.riderLongitude });
              }
            }
          });

          if (!isMounted) {
            unsub();
          } else {
            if (unsubscribeFirestore) unsubscribeFirestore();
            unsubscribeFirestore = unsub;
          }
          return true;
        }
      } catch (err) {
        console.warn('Alternate Firestore query error:', err);
      }
      return false;
    };

    async function fetchFromAppDataFallback() {
      if (!isMounted) return;
      try {
        console.log('🔄 Loading tracking details via page-wise sync fallback...');
        const pageData = await cloudDataService.loadPageWiseData(settings, 'TRACKING');
        if (!isMounted) return;
        if (pageData && pageData.submissions && pageData.submissions.length > 0) {
          const matched = matchServiceOrder(pageData.submissions, trackingId);
          if (matched) {
            setService(matched);
            if (typeof matched.riderLatitude === 'number' && typeof matched.riderLongitude === 'number') {
              setRiderCoords({
                lat: matched.riderLatitude,
                lng: matched.riderLongitude
              });
            }
            setErrorMsg(null);
            setLoading(false);
            return;
          }
        }

        // Fast cached loadAppData as last resort (no forceRefresh to avoid heavy 18-sheet re-fetch)
        const appData = await cloudDataService.loadAppData(settings, false);
        if (!isMounted) return;
        if (appData && appData.submissions && appData.submissions.length > 0) {
          const matched = matchServiceOrder(appData.submissions, trackingId);
          if (matched) {
            setService(matched);
            if (typeof matched.riderLatitude === 'number' && typeof matched.riderLongitude === 'number') {
              setRiderCoords({
                lat: matched.riderLatitude,
                lng: matched.riderLongitude
              });
            }
            setErrorMsg(null);
            setLoading(false);
            return;
          }
        }

        if (isMounted) {
          setErrorMsg(`Could not find service order with ID "${trackingId}". Please verify the tracking link or contact customer support.`);
        }
      } catch (err) {
        console.error('Error fetching order for tracking:', err);
        if (isMounted) {
          setErrorMsg('Database synchronization failed. Please check your internet connection or reload the page.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    tryFirestoreLookup();

    return () => {
      isMounted = false;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [trackingId, settings]);

  const customerCoords = useMemo(() => {
    if (service && typeof service.customerLatitude === 'number' && typeof service.customerLongitude === 'number') {
      return { lat: service.customerLatitude, lng: service.customerLongitude };
    }
    return null;
  }, [service]);

  // Status transitions styling config matching website order status flow
  const statusSteps = [
    { key: ServiceStatus.Queued, label: 'Confirmed', desc: 'Order confirmed & placed in service schedule.', icon: <CheckCircle2 className="w-5 h-5" /> },
    { key: ServiceStatus.Assigned, label: 'Assigned', desc: 'Technician is assigned to your doorstep service.', icon: <User className="w-5 h-5" /> },
    { key: ServiceStatus.InProgress, label: 'In progress', desc: 'Service is actively in progress on site.', icon: <Wrench className="w-5 h-5" /> },
    { key: ServiceStatus.Completed, label: 'Delivered', desc: 'Service completed & delivered! Invoice ready.', icon: <ShieldCheck className="w-5 h-5" /> }
  ];

  const currentStatusIndex = useMemo(() => {
    if (!service) return 0;
    if (service.status === ServiceStatus.Draft) return 0;
    const idx = statusSteps.findIndex((step) => step.key === service.status);
    return idx === -1 ? 0 : idx;
  }, [service]);

  // Formatted Scheduled Date & Time
  const formattedScheduledDateTime = useMemo(() => {
    if (!service) return '';
    const dateStr = service.scheduledDate || service.timestamp || '';
    const datePart = dateStr.split('T')[0];
    const parsed = datePart ? new Date(datePart + 'T00:00:00') : null;
    const formattedDate = parsed && !isNaN(parsed.getTime())
      ? parsed.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
      : 'Date not scheduled';
    const displayTime = service.scheduledTime || '';
    return `${formattedDate}${displayTime ? ` (${displayTime})` : ''}`;
  }, [service]);

  const purchaseItems = useMemo(() => {
    const items: { label: string; qty?: string | number; amount: number }[] = [];
    if (!service) return [];
    
    const cleanSelectionArray = (arr: any): string[] => {
      if (!arr) return [];
      if (typeof arr === 'string') {
        const trimmed = arr.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return cleanSelectionArray(parsed);
          } catch { }
        }
        return trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
      }
      if (!Array.isArray(arr)) return [];
      const cleaned: string[] = [];
      arr.forEach(item => {
        if (typeof item === 'string') {
          try {
            if (item.startsWith('[') && item.endsWith(']')) {
              const parsed = JSON.parse(item);
              if (Array.isArray(parsed)) cleaned.push(...cleanSelectionArray(parsed));
              else if (parsed) cleaned.push(String(parsed));
            } else if (item) cleaned.push(item);
          } catch { if (item) cleaned.push(item); }
        } else if (item) {
          cleaned.push(String(item));
        }
      });
      return [...new Set(cleaned)].filter(Boolean);
    };

    const cleanedServiceSelection = cleanSelectionArray(service.serviceSelection);

    if (cleanedServiceSelection.includes('Car Washing') && service.carWashDetails) {
      items.push({ label: `Car Washing (${service.carWashDetails.washType})`, qty: 1, amount: service.carWashDetails.price || 0 });
    }
    if (cleanedServiceSelection.includes('Car Care') && service.carCareDetails) {
      items.push({ label: `Car Care (${service.carCareDetails.careType})`, qty: 1, amount: service.carCareDetails.price || 0 });
    }
    if (cleanedServiceSelection.includes('Tyre Replacement')) {
      items.push({ label: 'Tyre Replacement', qty: service.tyreReplacementQuantity, amount: service.tyreReplacementTotalAmount });
    }
    if (cleanedServiceSelection.includes('Battery Replacement')) {
      items.push({ label: 'Battery Replacement', qty: service.batteryReplacementQuantity, amount: service.batteryReplacementTotalAmount });
    }
    (service.dynamicAddons || []).filter(a => a.quantity > 0).forEach(a => {
      items.push({ label: a.name, qty: `×${a.quantity}`, amount: a.quantity * a.price });
    });
    (service.categorizedAddons || []).filter(a => a.quantity > 0 && a.productName).forEach(a => {
      items.push({ label: a.productName, qty: `×${a.quantity}`, amount: a.quantity * a.amount });
    });
    (service.customServices || []).filter(cs => cs.serviceDescription).forEach(cs => {
      items.push({ label: cs.serviceDescription, qty: 1, amount: cs.amount });
    });
    if (service.travelCharge && service.travelCharge > 0) {
      items.push({ label: 'Doorstep Travel Charge', amount: service.travelCharge });
    }
    return items;
  }, [service]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center border border-slate-100 flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-4" />
          <h3 className="text-lg font-bold text-slate-800">Tracking Your Service</h3>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
            Fetching latest technician updates and order progress from cloud...
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg || !service) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center border border-slate-100 flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-100">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Unable to Track Order</h3>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            {errorMsg || 'An unexpected error occurred while loading order status.'}
          </p>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="mt-6 inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-semibold py-2.5 px-5 rounded-lg text-sm shadow-xs transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const assignedAgents = [service.assignedTo, service.secondaryAssignee].filter(Boolean).join(' & ');
  const orderShortNo = service.appointmentId?.split('-').pop() || service.submissionId.slice(-6);

  return (
    <div className="min-h-screen bg-slate-50 pb-12 animate-fade-in">
      {/* Tracker Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs z-40 px-4 py-3.5 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={settings.customLogoUrl || "https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png"} 
              alt="A Big Engine Logo" 
              className="w-10 h-10 object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-800 uppercase flex items-center gap-1.5">
                A Big <span className="text-brand-accent">Engine</span>
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-brand-blue bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Live Doorstep Service Tracker
              </span>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Order Reference</p>
            <p className="font-bold text-slate-800 text-sm">#{orderShortNo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        
        {/* Banner/Alert depending on status */}
        <div className="bg-gradient-to-r from-brand-blue to-brand-blue/90 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-extrabold text-blue-200 uppercase tracking-widest">Current Status</p>
            <h2 className="text-xl sm:text-2xl font-black mt-0.5 flex items-center gap-2">
              {service.status === ServiceStatus.Completed ? (
                <>✓ Service Completed</>
              ) : service.status === ServiceStatus.InProgress ? (
                <>🔧 Service is In Progress</>
              ) : service.status === ServiceStatus.Assigned ? (
                <>🚚 Technician is Assigned</>
              ) : (
                <>⏱ Order Registered & Scheduled</>
              )}
            </h2>
            <p className="text-xs text-blue-100 mt-2 max-w-xl leading-relaxed">
              {service.status === ServiceStatus.Completed 
                ? "Your vehicle service is fully complete! Thank you for trusting A Big Engine."
                : service.status === ServiceStatus.InProgress
                ? "Our skilled technician is currently working on your vehicle at your doorstep. You can monitor live check-ins below."
                : service.status === ServiceStatus.Assigned
                ? "A doorstep technician is dispatched and en route to your location. Keep an eye on the tracking map!"
                : "Your order is securely scheduled. Our dispatch agent will assign a specialist shortly."}
            </p>
            
            <div className="mt-4 flex flex-wrap gap-4 pt-4 border-t border-white/15 text-xs text-blue-50">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-300" />
                <span>Scheduled: <strong>{formattedScheduledDateTime}</strong></span>
              </div>
              {assignedAgents && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-300" />
                  <span>Agent: <strong>{assignedAgents}</strong></span>
                </div>
              )}
            </div>
          </div>
          {/* Subtle background graphic design */}
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4 pointer-events-none">
            <Wrench className="w-48 h-48" />
          </div>
        </div>

        {/* Real-time Tracking Map */}
        {service.status !== ServiceStatus.Completed && service.status !== ServiceStatus.Draft && (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-accent animate-ping" />
                  Live Road Tracking
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Real-time technician movement & route tracing.</p>
              </div>
              {routeInfo && (
                <div className="flex gap-3 text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                  <span className="text-slate-600">Distance: <strong>{routeInfo.distance}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600">Est. Time: <strong>{routeInfo.duration}</strong></span>
                </div>
              )}
            </div>

            {customerCoords ? (
              <div className="w-full h-80 rounded-xl overflow-hidden relative border border-slate-200/80 bg-slate-50 shadow-inner">
                <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
                  <Map
                    defaultCenter={riderCoords || customerCoords}
                    defaultZoom={14}
                    mapId="CLIENT_ORDER_TRACKER_MAP"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                    disableDefaultUI={true}
                    zoomControl={true}
                  >
                    {riderCoords && (
                      <DrivingRouteDisplay
                        origin={riderCoords}
                        destination={customerCoords}
                        onRouteComputed={setRouteInfo}
                      />
                    )}

                    {riderCoords && (
                      <AdvancedMarker position={riderCoords} title="Technician Current Location">
                        <div
                          className="flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
                          style={{ width: '32px', height: '32px', backgroundColor: '#a855f7' }}
                          dangerouslySetInnerHTML={{ __html: riderIconSvg }}
                        />
                      </AdvancedMarker>
                    )}

                    <AdvancedMarker position={customerCoords} title="Your Address">
                      <div
                        className="flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
                        style={{ width: '30px', height: '30px', backgroundColor: '#3b82f6' }}
                        dangerouslySetInnerHTML={{ __html: houseIconSvg }}
                      />
                    </AdvancedMarker>
                  </Map>
                </APIProvider>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-bold">Estimated Arrival unavailable</p>
                  <p className="mt-0.5 text-amber-700 leading-relaxed">
                    Doorstep GPS coordinates are not pinned for this order. Static schedule is active: 
                    <strong> {formattedScheduledDateTime}</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Visual Lifecycle Stepper */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-5 sm:p-6">
          <h3 className="font-bold text-slate-800 text-sm mb-5">Service Journey Status</h3>
          
          <div className="relative">
            {/* Horizontal Timeline Connector (Desktop) */}
            <div className="hidden md:block absolute top-6 left-8 right-8 h-0.5 bg-slate-100" />
            <div 
              className="hidden md:block absolute top-6 left-8 h-0.5 bg-brand-blue transition-all duration-500" 
              style={{ width: `${(currentStatusIndex / (statusSteps.length - 1)) * 90}%` }}
            />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
              {statusSteps.map((step, idx) => {
                const isCompleted = idx <= currentStatusIndex;
                const isActive = idx === currentStatusIndex;
                
                return (
                  <div key={idx} className="flex md:flex-col items-start md:items-center text-left md:text-center gap-3 md:gap-2.5 group relative">
                    {/* Stepper Node Icon */}
                    <div 
                      className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all relative z-10 flex-shrink-0 ${
                        isActive 
                          ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-blue-100 scale-105 animate-pulse'
                          : isCompleted
                          ? 'bg-green-500 text-white border-green-500'
                          : 'bg-white text-slate-300 border-slate-200'
                      }`}
                    >
                      {isCompleted && !isActive ? <Check className="w-5 h-5 stroke-[3]" /> : step.icon}
                    </div>

                    {/* Step Labels */}
                    <div className="space-y-0.5">
                      <h4 className={`text-xs font-bold leading-tight ${isActive ? 'text-brand-blue text-sm' : isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                        {step.label}
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-normal max-w-[150px]">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Technician Profile Card */}
        {assignedAgents && (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 border border-slate-200">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Assigned Expert</p>
                <h4 className="font-bold text-slate-800 text-base">{assignedAgents}</h4>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                  Active on Doorstep Duty
                </p>
              </div>
            </div>

            {service.mobileNumber && (
              <a
                href={`tel:${service.mobileNumber}`}
                className="w-full sm:w-auto text-center inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs transition-all border border-slate-200/50"
              >
                <Phone className="w-4 h-4" /> Contact Support / Agent
              </a>
            )}
          </div>
        )}

        {/* Vehicle & Address Overview */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm">Service Details & Location</h3>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Customer Details</p>
                <p className="font-bold text-slate-800 text-base mt-0.5">
                  {service.customerFirstName} {service.customerLastName}
                </p>
                <p className="text-xs text-slate-500">{service.mobileNumber}</p>
              </div>

              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Vehicle Details</p>
                <p className="font-bold text-slate-800 text-base mt-0.5">
                  {service.carBrandModel}
                </p>
                <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500">{service.carNumber}</span>
                  {service.vehicleCategoryTag && (
                    <span className="px-1.5 py-0.5 bg-brand-blue/5 rounded text-[10px] font-bold text-brand-blue">{service.vehicleCategoryTag}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Doorstep Address</p>
                <p className="text-sm font-medium text-slate-700 mt-1 leading-relaxed flex items-start gap-1.5">
                  <MapPin className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                  {service.streetAddress || 'Not Provided'}
                </p>
              </div>

              {service.internalNotes && (
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 text-xs text-slate-600">
                  <p className="font-bold text-slate-800 mb-0.5">Note from Agent:</p>
                  <p className="leading-relaxed italic">"{service.internalNotes}"</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Items list */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
          <button 
            onClick={() => setShowItemDetails(!showItemDetails)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-all text-left"
          >
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Itemized Order Summary</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Click to view items, quantities, and price breakdown.</p>
            </div>
            {showItemDetails ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>

          {showItemDetails && (
            <div className="border-t border-slate-100 p-5 space-y-4 animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold text-xs uppercase tracking-wider">
                      <th className="pb-2.5">Description</th>
                      <th className="pb-2.5 text-center">Qty</th>
                      <th className="pb-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseItems.map((item, index) => (
                      <tr key={index} className="text-slate-700">
                        <td className="py-3 font-medium text-slate-800">{item.label}</td>
                        <td className="py-3 text-center text-slate-500">{item.qty || '1'}</td>
                        <td className="py-3 text-right font-semibold text-slate-800">
                          {item.amount > 0 ? `₹${item.amount.toFixed(2)}` : 'Predefined / Free'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-slate-800 border-t-2 border-slate-200">
                      <td colSpan={2} className="pt-4 text-base">Grand Total (Incl. Taxes)</td>
                      <td className="pt-4 text-right text-lg font-black text-brand-blue">₹{service.grandTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {service.paymentMode && (
                <div className="flex justify-end pt-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-800 border border-green-200 rounded-lg text-xs font-bold">
                    Paid via: {service.paymentMode} 
                    {service.paymentMode === 'Both' && service.cashAmount && service.onlineAmount
                      ? ` (Cash ₹${service.cashAmount} + Online ₹${service.onlineAmount})`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
};
