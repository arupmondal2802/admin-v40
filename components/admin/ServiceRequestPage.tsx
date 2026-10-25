import React, { useState, useMemo, useEffect } from 'react';
import { ServiceRequest, Settings, AuditLog, User, SyncPerformanceStats, DeliveryHub } from '../../types';
import Card from '../ui/Card';
import { 
  Plus, 
  RefreshCw, 
  Settings as SettingsIcon, 
  LayoutGrid, 
  List as ListIcon, 
  Phone, 
  MapPin, 
  Calendar, 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  User as UserIcon, 
  ExternalLink, 
  AlertCircle, 
  Sparkles,
  ChevronRight,
  Info,
  Car,
  Archive,
  Filter,
  ChevronDown,
  Zap,
  Gauge,
  TrendingUp,
  Activity,
  X,
  Navigation,
  FileSpreadsheet,
  BarChart3,
  Compass,
  Layers,
  ShieldCheck,
  Webhook
} from 'lucide-react';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { toast } from 'sonner';
import SkeletonLoader from '../ui/SkeletonLoader';
import GoogleAddressAutocomplete from '../ui/GoogleAddressAutocomplete';
import { LeadConversionWizardModal } from './leads/LeadConversionWizardModal';
import { LeadSmartRoutingModal } from './leads/LeadSmartRoutingModal';
import { LeadDeduplicationModal } from './leads/LeadDeduplicationModal';
import { LeadWebhookModal } from './leads/LeadWebhookModal';
import { LeadTimelineDrawer } from './leads/LeadTimelineDrawer';
import { LeadWhatsAppModal } from './leads/LeadWhatsAppModal';
import { AgentProductivityDashboard } from './leads/AgentProductivityDashboard';
import { WhatsAppEnquiriesView } from './leads/WhatsAppEnquiriesView';
import { LeadFastSyncBar } from './leads/LeadFastSyncBar';
import { LeadCampaignFilterBar } from './leads/LeadCampaignFilterBar';
import { LeadTableView } from './leads/LeadTableView';
import { LeadKanbanBoard } from './leads/LeadKanbanBoard';
import { LeadBatchActionBar } from './leads/LeadBatchActionBar';
import { LeadBatchSnoozeModal, LeadBatchNoteModal, LeadBatchCallModal } from './leads/LeadBatchModals';

interface Props {
  isLoading?: boolean;
  isHydrated?: boolean;
  serviceRequests: ServiceRequest[];
  syncPerformanceStats?: SyncPerformanceStats | null;
  onSyncWebsiteOrders: (mode?: 'incremental' | 'full') => Promise<void>;
  isSyncing: boolean;
  onSyncMetaLeads?: (mode?: 'incremental' | 'full') => Promise<void>;
  isSyncingMetaLeads?: boolean;
  onSyncWhatsAppLeads?: (mode?: 'incremental' | 'full') => Promise<void>;
  isSyncingWhatsAppLeads?: boolean;
  onSyncAllLeads?: (mode?: 'incremental' | 'full') => Promise<void>;
  onUpdateServiceRequest?: (updatedLead: ServiceRequest) => Promise<void>;
  onCaptureLead?: (newLeadData: Omit<ServiceRequest, 'id' | 'requestDate'> & { status?: string }) => Promise<void>;
  onConvertLeadToService?: (leadId: string) => Promise<void>;
  settings?: Settings;
  deliveryHubs?: DeliveryHub[];
  onSaveSettings?: (newSettings: Settings) => void;
  auditLogs?: AuditLog[];
  users?: User[];
  onLoadMoreServiceRequests?: () => Promise<void>;
  hasMoreServiceRequests?: boolean;
  isLoadingMoreServiceRequests?: boolean;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("⚠️ [ErrorBoundary] Caught rendering exception:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm animate-fadeIn">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-extrabold text-rose-950 uppercase tracking-wider mb-2">Web Leads Rendering Error</h3>
          <p className="text-xs text-rose-850 font-medium mb-4 max-w-md mx-auto leading-relaxed">
            A data processing anomaly occurred while listing the storefront orders. Some record fields may contain unexpected values or null values.
          </p>
          <div className="text-left bg-white border border-rose-100 p-4 rounded-xl font-mono text-[10px] text-rose-600 overflow-x-auto max-h-40 mb-5 shadow-inner">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            Reset Ingestion State
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const LEAD_STAGES = [
  'CREATED',
  'CONTACTED',
  'FOLLOW UP',
  'HIGH INTENT',
  'CONVERTED',
  'NOT CONTACTABLE'
];

// Helpers to safely convert any primitive/object value to string before string operations
const safeStr = (val: any): string => (val !== null && val !== undefined ? String(val) : '');
const safeLower = (val: any): string => safeStr(val).toLowerCase();

// Helper to normalize lead status to one of the 6 stages
const normalizeStatus = (status: any): string => {
  if (!status) return 'CREATED';
  const s = safeStr(status).trim().toUpperCase();
  if (s === 'NEW') return 'CREATED';
  if (s === 'BOOKED') return 'CONVERTED';
  if (LEAD_STAGES.includes(s)) return s;
  return 'CREATED'; // default
};

const getStatusBadgeStyles = (status: string): string => {
  const norm = normalizeStatus(status);
  switch (norm) {
    case 'CREATED':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CONTACTED':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'FOLLOW UP':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'HIGH INTENT':
      return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
    case 'CONVERTED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold';
    case 'NOT CONTACTABLE':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const leadHubDistanceCache = new Map<string, { hubName: string; distanceKm: number; hasCoords: boolean; lat?: number; lon?: number } | null>();

function getLeadHubDistanceInfo(lead: ServiceRequest, deliveryHubs?: any[]) {
  const hubs = deliveryHubs && deliveryHubs.length > 0 ? deliveryHubs : DEFAULT_DELIVERY_HUBS;
  const cacheKey = `${lead.id || ''}_${lead.customerLatitude || ''}_${lead.customerLongitude || ''}_${lead.customerDistanceKm || ''}_${hubs.length}`;
  
  if (leadHubDistanceCache.has(cacheKey)) {
    return leadHubDistanceCache.get(cacheKey)!;
  }

  let extraData: any = {};
  try {
    if (lead.originalOrderJson) extraData = JSON.parse(lead.originalOrderJson);
  } catch (e) {}

  const rawLat = lead.customerLatitude ?? (lead as any).latitude ?? extraData.customerLatitude ?? extraData.latitude ?? extraData.customer_latitude ?? extraData.lat ?? extraData.customer_lat;
  const rawLon = lead.customerLongitude ?? (lead as any).longitude ?? extraData.customerLongitude ?? extraData.longitude ?? extraData.customer_longitude ?? extraData.lng ?? extraData.lon ?? extraData.customer_lng ?? extraData.customer_lon;

  const lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
  const lon = typeof rawLon === 'number' ? rawLon : parseFloat(rawLon);

  let result: { hubName: string; distanceKm: number; hasCoords: boolean; lat?: number; lon?: number } | null = null;

  if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
    const serviceType = lead.requestedService || 'washing';
    const hubResult = findNearestHub(serviceType, lat, lon, hubs);
    result = {
      hubName: hubResult.hub.name,
      distanceKm: hubResult.distanceKm,
      hasCoords: true,
      lat,
      lon
    };
  } else {
    const rawDist = lead.customerDistanceKm ?? extraData.customerDistanceKm ?? extraData.distanceKm;
    if (rawDist !== undefined && rawDist !== null && !isNaN(parseFloat(rawDist))) {
      result = {
        hubName: 'Nearest Hub',
        distanceKm: parseFloat(rawDist),
        hasCoords: false
      };
    }
  }

  if (leadHubDistanceCache.size > 2000) {
    leadHubDistanceCache.clear();
  }
  leadHubDistanceCache.set(cacheKey, result);
  return result;
}

const ServiceRequestPage: React.FC<Props> = (props) => {
  const { 
    serviceRequests, 
    syncPerformanceStats,
    onSyncWebsiteOrders, 
    isSyncing,
    onSyncMetaLeads,
    isSyncingMetaLeads = false,
    onSyncWhatsAppLeads,
    isSyncingWhatsAppLeads = false,
    onSyncAllLeads,
    onUpdateServiceRequest,
    onCaptureLead,
    onConvertLeadToService,
    settings,
    deliveryHubs,
    onSaveSettings,
    auditLogs = [],
    users = [],
    onLoadMoreServiceRequests,
    hasMoreServiceRequests = true,
    isLoadingMoreServiceRequests = false,
    isLoading,
    isHydrated
  } = props;

  const [activeTab, setActiveTab] = useState<'META' | 'WHATSAPP' | 'WEB_ORDERS' | 'ALL' | 'TIMELINE' | 'PRODUCTIVITY' | 'SETTINGS' | 'BOARD' | 'LIST'>('META');
  const [metaViewMode, setMetaViewMode] = useState<'BOARD' | 'LIST'>('BOARD');
  const [allViewMode, setAllViewMode] = useState<'BOARD' | 'LIST'>('BOARD');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<'ALL' | 'HOT' | 'WARM'>('ALL');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedTimelineLeadId, setSelectedTimelineLeadId] = useState<string>('');
  const [timelineSearch, setTimelineSearch] = useState<string>('');
  const [isSyncPerformanceModalOpen, setIsSyncPerformanceModalOpen] = useState(false);

  // Salesforce & Batch Action Modal States
  const [isBatchSnoozeOpen, setIsBatchSnoozeOpen] = useState(false);
  const [isBatchNoteOpen, setIsBatchNoteOpen] = useState(false);
  const [isBatchCallOpen, setIsBatchCallOpen] = useState(false);
  const [actionModalLeads, setActionModalLeads] = useState<ServiceRequest[]>([]);

  // Phase 3 & 4 Modal States
  const [isSmartRoutingModalOpen, setIsSmartRoutingModalOpen] = useState(false);
  const [isDeduplicationModalOpen, setIsDeduplicationModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [conversionWizardLead, setConversionWizardLead] = useState<ServiceRequest | null>(null);
  const [timelineDrawerLead, setTimelineDrawerLead] = useState<ServiceRequest | null>(null);
  const [whatsAppModalLead, setWhatsAppModalLead] = useState<ServiceRequest | null>(null);
  
  // Debounced search setup
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination setups
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleColumnCounts, setVisibleColumnCounts] = useState<Record<string, number>>({});
  const [visibleWebOrdersCount, setVisibleWebOrdersCount] = useState(50);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');
  const [selectedLead, setSelectedLead] = useState<ServiceRequest | null>(null);
  const activeHubs = deliveryHubs || settings?.deliveryHubs;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<'info' | 'history'>('info');
  const [showArchived, setShowArchived] = useState(false);

  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [customerNameFilter, setCustomerNameFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [assignedAgentFilter, setAssignedAgentFilter] = useState('ALL');

  // Expanded Cards State for smooth animated expansion
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  const toggleCardExpansion = (cardId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCardIds(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Website Orders Spreadsheet View States
  const [webOrdersViewMode, setWebOrdersViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [rawColumnsLead, setRawColumnsLead] = useState<ServiceRequest | null>(null);

  // Subsheets & Sync Controls State
  const [isSubsheetsModalOpen, setIsSubsheetsModalOpen] = useState(false);
  const [subsheetFilter, setSubsheetFilter] = useState<string>('ALL');
  const [isDiscoveringSubsheets, setIsDiscoveringSubsheets] = useState(false);
  const [discoveredSubsheets, setDiscoveredSubsheets] = useState<string[]>([]);
  const [customSubsheetsInput, setCustomSubsheetsInput] = useState<string>(settings?.metaLeadsTabName || '');

  useEffect(() => {
    if (settings?.metaLeadsTabName) {
      setCustomSubsheetsInput(settings.metaLeadsTabName);
    }
  }, [settings?.metaLeadsTabName]);

  const [sheetDiagResult, setSheetDiagResult] = useState<{ isAccessible?: boolean; requiresAuth?: boolean; message?: string } | null>(null);
  const [isDiagnosingSheet, setIsDiagnosingSheet] = useState(false);

  const handleDiagnoseSheet = async () => {
    setIsDiagnosingSheet(true);
    const diagToast = toast.loading('Diagnosing Google Sheet permissions & connectivity...');
    try {
      const { diagnoseGoogleSheetAccess } = await import('../../services/googleSheetService');
      const sheetUrl = settings?.metaLeadsSheetUrl || 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing';
      const result = await diagnoseGoogleSheetAccess(sheetUrl);
      setSheetDiagResult(result);
      if (result.requiresAuth) {
        toast.error('Google Sheet access restricted! Please set share settings to "Anyone with the link can view".', { id: diagToast, duration: 6000 });
      } else if (result.isAccessible) {
        toast.success('Google Sheet is publicly accessible and ready for syncing!', { id: diagToast });
      } else {
        toast.error(result.message || 'Could not verify sheet connectivity', { id: diagToast });
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Diagnosis failed: ' + (err.message || 'Unknown network error'), { id: diagToast });
    } finally {
      setIsDiagnosingSheet(false);
    }
  };

  const handleAutoDiscoverSubsheets = async () => {
    setIsDiscoveringSubsheets(true);
    const discToast = toast.loading('Auto-detecting subsheets/tabs from Google Sheet...');
    try {
      const { discoverSheetSubsheets } = await import('../../services/googleSheetService');
      const sheetUrl = settings?.metaLeadsSheetUrl || 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing';
      const tabs = await discoverSheetSubsheets(sheetUrl);
      setDiscoveredSubsheets(tabs);
      if (tabs.length > 0) {
        setCustomSubsheetsInput(tabs.join(', '));
      }
      toast.success(`Discovered ${tabs.length} tab(s): ${tabs.join(', ')}`, { id: discToast });
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes('AUTH_REQUIRED')) {
        toast.error('Google Sheet is restricted. Please set "General access" to "Anyone with the link can view".', { id: discToast, duration: 6000 });
      } else {
        toast.error('Could not auto-detect tabs. You can enter tab names manually.', { id: discToast });
      }
    } finally {
      setIsDiscoveringSubsheets(false);
    }
  };

  const handleSaveSubsheetsConfig = () => {
    if (!onSaveSettings || !settings) return;
    const newTabNames = customSubsheetsInput.trim();
    onSaveSettings({
      ...settings,
      metaLeadsTabName: newTabNames
    });
    setIsSubsheetsModalOpen(false);
    toast.success(`Saved subsheets config: ${newTabNames || 'All Subsheets'}`);
  };

  useEffect(() => {
    setCurrentPage(1);
    setVisibleWebOrdersCount(50);
  }, [searchQuery, statusFilter, selectedCampaign, selectedPlatform, showArchived, customerNameFilter, startDateFilter, endDateFilter, assignedAgentFilter]);

  const handleApplyLeadDatePreset = (preset: 'today' | '7days' | '30days' | 'thismonth' | 'clear') => {
    const today = new Date();
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'today') {
      const todayStr = formatDate(today);
      setStartDateFilter(todayStr);
      setEndDateFilter(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setStartDateFilter(formatDate(past));
      setEndDateFilter(formatDate(today));
    } else if (preset === '30days') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setStartDateFilter(formatDate(past));
      setEndDateFilter(formatDate(today));
    } else if (preset === 'thismonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDateFilter(formatDate(startOfMonth));
      setEndDateFilter(formatDate(today));
    } else if (preset === 'clear') {
      setStartDateFilter('');
      setEndDateFilter('');
    }
  };

  // Dynamic filter values
  const uniqueCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    (serviceRequests || []).forEach(lead => {
      if (lead.campaignName) {
        campaigns.add(safeStr(lead.campaignName).trim());
      }
    });
    return Array.from(campaigns).sort();
  }, [serviceRequests]);

  const uniquePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    (serviceRequests || []).forEach(lead => {
      if (lead.platform) {
        platforms.add(safeStr(lead.platform).trim());
      }
    });
    return Array.from(platforms).sort();
  }, [serviceRequests]);

  const uniqueSubsheets = useMemo(() => {
    const subsheets = new Set<string>();
    (serviceRequests || []).forEach(lead => {
      if (lead.subsheetName) {
        subsheets.add(safeStr(lead.subsheetName).trim());
      }
      if (lead.formName && (lead.formName.includes('(') || lead.formName.includes('2026') || lead.formName.includes('KNG') || lead.formName.includes('Washing'))) {
        subsheets.add(safeStr(lead.formName).trim());
      }
    });
    if (settings?.metaLeadsTabName) {
      settings.metaLeadsTabName.split(',').forEach(t => {
        const tr = t.trim();
        if (tr) subsheets.add(tr);
      });
    }
    discoveredSubsheets.forEach(t => {
      if (t) subsheets.add(t.trim());
    });
    return Array.from(subsheets).filter(Boolean).sort();
  }, [serviceRequests, settings?.metaLeadsTabName, discoveredSubsheets]);

  React.useEffect(() => {
    if (selectedLead) {
      setModalActiveTab('info');
    }
  }, [selectedLead?.id]);

  // Drag and Drop States
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDraggedOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (draggedOverColumn !== stage) {
      setDraggedOverColumn(stage);
    }
  };

  const handleDragLeave = () => {
    setDraggedOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDraggedOverColumn(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    const lead = (serviceRequests || []).find(r => r.id === leadId);
    if (!lead) return;

    const currentNorm = normalizeStatus(lead.status);
    if (currentNorm === targetStage) return;

    await handleStatusChange(lead, targetStage);
  };

  // Settings form states
  const [metaSheetUrl, setMetaSheetUrl] = useState(settings?.metaLeadsSheetUrl || 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing');
  const [metaTabName, setMetaTabName] = useState(settings?.metaLeadsTabName || '');
  const [whatsAppSheetUrl, setWhatsAppSheetUrl] = useState(settings?.whatsAppLeadsSheetUrl || 'https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing');
  const [whatsAppTabName, setWhatsAppTabName] = useState(settings?.whatsAppLeadsTabName || '');

  // Manual Lead Form State
  const [newLeadForm, setNewLeadForm] = useState({
    customerName: '',
    customerPhone: '',
    requestedService: 'Pressure Washing & Deep Cleaning',
    source: 'Meta',
    status: 'CREATED',
    carBrand: '',
    carModel: '',
    carRegNo: '',
    streetAddress: '',
    totalAmount: '',
    remarks: '',
    campaignName: '',
    bookingReminderDate: ''
  });

  const websiteOrdersWaiting = useMemo(() => {
    return (serviceRequests || [])
      .filter(lead => {
        const src = safeLower(lead.source || lead.leadSource);
        const isWebsite = src === 'website' || src === 'web' || src.includes('storefront');
        const isNotConverted = normalizeStatus(lead.status) !== 'CONVERTED';
        return isWebsite && isNotConverted && !lead.isArchived;
      })
      .sort((a, b) => {
        const tA = new Date(a.requestDate || (a as any).timestamp || 0).getTime();
        const tB = new Date(b.requestDate || (b as any).timestamp || 0).getTime();
        return tB - tA;
      });
  }, [serviceRequests]);

  const filteredWebsiteOrders = useMemo(() => {
    return websiteOrdersWaiting.filter(lead => {
      // 1. Status Filter Dropdown Match (if dropdown filter is active)
      if (statusFilter !== 'ALL') {
        if (normalizeStatus(lead.status) !== statusFilter) {
          return false;
        }
      }

      // 2. Search Query Match
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;

      const nameMatch = safeLower(lead.customerName).includes(query);
      const anyPhone = lead.customerPhone || (lead as any).phone || (lead as any).mobileNumber || '';
      const phoneMatch = safeLower(anyPhone).includes(query);
      const serviceMatch = safeLower(lead.requestedService).includes(query);
      const brandMatch = safeLower(lead.carBrand).includes(query);
      const modelMatch = safeLower(lead.carModel).includes(query);
      const addressMatch = safeLower(lead.streetAddress || (lead as any).address).includes(query);
      const normStatus = safeLower(normalizeStatus(lead.status));
      const statusMatch = normStatus.includes(query) || safeLower(lead.status).includes(query);
      
      return nameMatch || phoneMatch || serviceMatch || brandMatch || modelMatch || addressMatch || statusMatch;
    });
  }, [websiteOrdersWaiting, searchQuery, statusFilter]);

  // Filter and process requests (Sorted by date descending so latest orders are at the top)
  const processedLeads = useMemo(() => {
    return (serviceRequests || [])
      .filter(lead => {
        if (!showArchived && lead.isArchived) {
          return false;
        }
        const query = searchQuery.toLowerCase().trim();
        
        const nameMatch = safeLower(lead.customerName).includes(query);
        const phoneMatch = safeLower(lead.customerPhone).includes(query);
        const serviceMatch = safeLower(lead.requestedService).includes(query);
        const campaignMatch = safeLower(lead.campaignName).includes(query);
        const brandMatch = safeLower(lead.carBrand).includes(query);
        const modelMatch = safeLower(lead.carModel).includes(query);
        
        const textMatch = !query || (nameMatch || phoneMatch || serviceMatch || campaignMatch || brandMatch || modelMatch);
        
        const matchesCampaign = selectedCampaign === 'ALL' || (lead.campaignName && safeStr(lead.campaignName).trim() === selectedCampaign);
        const matchesPlatform = selectedPlatform === 'ALL' || (lead.platform && safeStr(lead.platform).trim() === selectedPlatform);
        const matchesStatus = statusFilter === 'ALL' || normalizeStatus(lead.status) === statusFilter;
        const matchesSubsheet = subsheetFilter === 'ALL' || 
          (lead.subsheetName && safeStr(lead.subsheetName).trim().toLowerCase() === subsheetFilter.toLowerCase().trim()) ||
          (lead.formName && safeStr(lead.formName).trim().toLowerCase() === subsheetFilter.toLowerCase().trim());

        // Advanced filters
        const matchesSpecificCustomerName = !customerNameFilter ||
          safeLower(lead.customerName).includes(customerNameFilter.toLowerCase().trim());

        const leadDate = lead.requestDate ? new Date(lead.requestDate) : null;
        const start = startDateFilter ? new Date(startDateFilter) : null;
        const end = endDateFilter ? new Date(endDateFilter) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        
        const matchesDateRange = (!start || (leadDate && leadDate >= start)) &&
                                 (!end || (leadDate && leadDate <= end));

        let matchesAssignedStatus = true;
        const assigned = safeStr(lead.assignedAgent).trim();
        if (assignedAgentFilter === 'UNASSIGNED') {
          matchesAssignedStatus = !assigned;
        } else if (assignedAgentFilter === 'ASSIGNED') {
          matchesAssignedStatus = !!assigned;
        } else if (assignedAgentFilter !== 'ALL') {
          matchesAssignedStatus = assigned === assignedAgentFilter;
        }

        // Source Channel filter
        let matchesSource = true;
        if (selectedSource !== 'ALL') {
          const leadSrc = safeLower(lead.source || lead.leadSource || 'manual');
          if (selectedSource === 'Meta') {
            matchesSource = leadSrc.includes('meta') || leadSrc.includes('fb') || leadSrc.includes('facebook') || leadSrc.includes('instagram');
          } else if (selectedSource === 'WhatsApp') {
            matchesSource = leadSrc === 'whatsapp' || leadSrc.includes('whatsapp') || leadSrc.includes('wa');
          } else if (selectedSource === 'Website') {
            matchesSource = leadSrc === 'website' || leadSrc === 'web' || leadSrc.includes('storefront');
          } else if (selectedSource === 'Google Ads') {
            matchesSource = leadSrc.includes('google') || leadSrc.includes('adwords');
          } else if (selectedSource === 'Organic') {
            matchesSource = leadSrc.includes('organic');
          } else if (selectedSource === 'Referral') {
            matchesSource = leadSrc.includes('referral') || leadSrc.includes('ref');
          } else if (selectedSource === 'Manual') {
            matchesSource = leadSrc.includes('manual') || leadSrc.includes('direct') || leadSrc.includes('walk-in');
          } else {
            matchesSource = leadSrc.includes(safeLower(selectedSource));
          }
        }

        // Priority Tier filter (HOT vs WARM vs ALL)
        let matchesTier = true;
        if (selectedTier === 'HOT') {
          matchesTier = (lead.totalAmount && lead.totalAmount >= 2500) || (normalizeStatus(lead.status) === 'HIGH INTENT');
        } else if (selectedTier === 'WARM') {
          matchesTier = (lead.totalAmount && lead.totalAmount > 0 && lead.totalAmount < 2500) || (normalizeStatus(lead.status) === 'FOLLOW UP' || normalizeStatus(lead.status) === 'CONTACTED');
        }

        return textMatch && matchesSource && matchesTier && matchesCampaign && matchesPlatform && matchesStatus && matchesSubsheet && matchesSpecificCustomerName && matchesDateRange && matchesAssignedStatus;
      })
      .sort((a, b) => {
        const tA = new Date(a.requestDate || (a as any).timestamp || 0).getTime();
        const tB = new Date(b.requestDate || (b as any).timestamp || 0).getTime();
        return tB - tA;
      });
  }, [serviceRequests, searchQuery, selectedSource, selectedTier, statusFilter, subsheetFilter, selectedCampaign, selectedPlatform, showArchived, customerNameFilter, startDateFilter, endDateFilter, assignedAgentFilter]);

  const itemsPerPage = 25;
  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedLeads.slice(startIndex, startIndex + itemsPerPage);
  }, [processedLeads, currentPage]);

  const totalPages = Math.ceil(processedLeads.length / itemsPerPage);

  const filteredTimelineLeads = useMemo(() => {
    if (!timelineSearch.trim()) return processedLeads;
    const q = timelineSearch.toLowerCase().trim();
    return processedLeads.filter(lead => 
      safeLower(lead.customerName).includes(q) ||
      safeLower(lead.customerPhone).includes(q) ||
      safeLower(lead.carBrand).includes(q) ||
      safeLower(lead.carModel).includes(q) ||
      safeLower(lead.status).includes(q)
    );
  }, [processedLeads, timelineSearch]);

  // Dedicated Meta leads list (Facebook & Instagram Lead Ads)
  const metaLeads = useMemo(() => {
    return processedLeads.filter(lead => {
      const src = safeLower(lead.source || lead.leadSource || '');
      const isWa = src.includes('whatsapp') || src === 'wa';
      const isWeb = src.includes('website') || src.includes('web');
      return !isWa && !isWeb;
    });
  }, [processedLeads]);

  const metaLeadsCount = useMemo(() => {
    return (serviceRequests || []).filter(lead => {
      const src = safeLower(lead.source || lead.leadSource || '');
      return !src.includes('whatsapp') && !src.includes('website') && !src.includes('web');
    }).length;
  }, [serviceRequests]);

  const whatsAppLeadsCount = useMemo(() => {
    return (serviceRequests || []).filter(lead => {
      const src = safeLower(lead.source || lead.leadSource || '');
      return src.includes('whatsapp') || src === 'wa';
    }).length;
  }, [serviceRequests]);

  // ==========================================
  // Salesforce & CRM Action Handlers
  // ==========================================
  const handleBatchCall = (leads: ServiceRequest[]) => {
    setActionModalLeads(leads);
    setIsBatchCallOpen(true);
  };

  const handleBatchConvert = async (leadIds: string[]) => {
    const cToast = toast.loading(`Converting ${leadIds.length} lead${leadIds.length > 1 ? 's' : ''} to active orders...`);
    try {
      for (const id of leadIds) {
        const target = serviceRequests.find(l => l.id === id);
        if (target && onUpdateServiceRequest) {
          await onUpdateServiceRequest({
            ...target,
            status: 'CONVERTED',
            remarks: `${target.remarks || ''}\n[Converted to Active Order]`.trim()
          });
        }
        if (onConvertLeadToService) {
          await onConvertLeadToService(id);
        }
      }
      toast.success(`Successfully converted ${leadIds.length} lead${leadIds.length > 1 ? 's' : ''} to active orders!`, { id: cToast });
      setSelectedLeadIds([]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to convert leads', { id: cToast });
    }
  };

  const handleBatchSnooze = (leadIds: string[]) => {
    const targets = serviceRequests.filter(l => leadIds.includes(l.id));
    setActionModalLeads(targets);
    setIsBatchSnoozeOpen(true);
  };

  const handleBatchAddNote = (leadIds: string[]) => {
    const targets = serviceRequests.filter(l => leadIds.includes(l.id));
    setActionModalLeads(targets);
    setIsBatchNoteOpen(true);
  };

  const handleConfirmSnooze = async (snoozeDateIso: string, snoozeNote: string) => {
    const targetIds = actionModalLeads.map(l => l.id);
    const sToast = toast.loading(`Snoozing ${targetIds.length} lead${targetIds.length > 1 ? 's' : ''}...`);
    try {
      const formattedDate = new Date(snoozeDateIso).toLocaleString();
      for (const lead of actionModalLeads) {
        if (onUpdateServiceRequest) {
          await onUpdateServiceRequest({
            ...lead,
            status: 'FOLLOW UP',
            bookingReminderDate: snoozeDateIso,
            remarks: `${lead.remarks || ''}\n[Snoozed until ${formattedDate}]: ${snoozeNote}`.trim()
          });
        }
      }
      toast.success(`Snoozed ${targetIds.length} lead${targetIds.length > 1 ? 's' : ''} until ${formattedDate}!`, { id: sToast });
      setIsBatchSnoozeOpen(false);
      setSelectedLeadIds([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to snooze leads', { id: sToast });
    }
  };

  const handleConfirmAddNote = async (note: string, mode: 'append' | 'replace') => {
    const targetIds = actionModalLeads.map(l => l.id);
    const nToast = toast.loading(`Saving notes to ${targetIds.length} lead${targetIds.length > 1 ? 's' : ''}...`);
    try {
      const stamp = new Date().toLocaleString();
      for (const lead of actionModalLeads) {
        if (onUpdateServiceRequest) {
          const newRemarks = mode === 'replace' 
            ? `[${stamp}]: ${note}` 
            : `${lead.remarks || ''}\n[${stamp}]: ${note}`.trim();
          await onUpdateServiceRequest({
            ...lead,
            remarks: newRemarks
          });
        }
      }
      toast.success(`Note saved to ${targetIds.length} lead${targetIds.length > 1 ? 's' : ''}!`, { id: nToast });
      setIsBatchNoteOpen(false);
      setSelectedLeadIds([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to add note', { id: nToast });
    }
  };

  const handleBatchStatusChange = async (stage: string) => {
    const bToast = toast.loading(`Moving ${selectedLeadIds.length} leads to ${stage}...`);
    try {
      for (const id of selectedLeadIds) {
        const target = serviceRequests.find(l => l.id === id);
        if (target && onUpdateServiceRequest) {
          await onUpdateServiceRequest({
            ...target,
            status: stage
          });
        }
      }
      toast.success(`Moved ${selectedLeadIds.length} leads to ${stage}!`, { id: bToast });
      setSelectedLeadIds([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update stage', { id: bToast });
    }
  };

  const handleBatchAssignAgent = async (agent: string) => {
    const finalAgent = agent === 'UNASSIGN' ? undefined : agent;
    const aToast = toast.loading(`Assigning ${selectedLeadIds.length} leads to ${agent}...`);
    try {
      for (const id of selectedLeadIds) {
        const target = serviceRequests.find(l => l.id === id);
        if (target && onUpdateServiceRequest) {
          await onUpdateServiceRequest({
            ...target,
            assignedAgent: finalAgent
          });
        }
      }
      toast.success(`Assigned ${selectedLeadIds.length} leads to ${agent}!`, { id: aToast });
      setSelectedLeadIds([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to assign agent', { id: aToast });
    }
  };

  const handleBatchArchive = async () => {
    const aToast = toast.loading(`Archiving ${selectedLeadIds.length} leads...`);
    try {
      for (const id of selectedLeadIds) {
        const target = serviceRequests.find(l => l.id === id);
        if (target && onUpdateServiceRequest) {
          await onUpdateServiceRequest({
            ...target,
            isArchived: true
          });
        }
      }
      toast.success(`Archived ${selectedLeadIds.length} leads!`, { id: aToast });
      setSelectedLeadIds([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to archive leads', { id: aToast });
    }
  };

  const handleSingleLeadSnooze = (lead: ServiceRequest) => {
    setActionModalLeads([lead]);
    setIsBatchSnoozeOpen(true);
  };

  const handleSingleLeadAddNote = (lead: ServiceRequest) => {
    setActionModalLeads([lead]);
    setIsBatchNoteOpen(true);
  };

  const handleSingleLeadCall = (lead: ServiceRequest) => {
    setActionModalLeads([lead]);
    setIsBatchCallOpen(true);
  };

  // Group by status for Board View
  const boardData = useMemo(() => {
    const columns: Record<string, ServiceRequest[]> = {
      CREATED: [],
      CONTACTED: [],
      'FOLLOW UP': [],
      'HIGH INTENT': [],
      CONVERTED: [],
      'NOT CONTACTABLE': []
    };

    processedLeads.forEach(lead => {
      const norm = normalizeStatus(lead.status);
      if (columns[norm]) {
        columns[norm].push(lead);
      } else {
        columns['CREATED'].push(lead);
      }
    });

    return columns;
  }, [processedLeads]);

  if (isLoading || isHydrated === false || !serviceRequests) {
    return <SkeletonLoader view="SERVICE_REQUESTS" />;
  }

  // Lead Stage colors (matching user image styles precisely)
  const getStageColorClasses = (stage: string) => {
    switch (stage) {
      case 'CREATED':
        return {
          bg: 'bg-slate-100 border-slate-200',
          badge: 'bg-slate-100 text-slate-800 border-slate-200',
          indicator: 'bg-slate-400'
        };
      case 'CONTACTED':
        return {
          bg: 'bg-sky-50 border-sky-100',
          badge: 'bg-sky-100 text-sky-800 border-sky-200',
          indicator: 'bg-sky-500'
        };
      case 'FOLLOW UP':
        return {
          bg: 'bg-amber-50 border-amber-100',
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          indicator: 'bg-amber-500'
        };
      case 'HIGH INTENT':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          badge: 'bg-yellow-300 text-yellow-950 border-yellow-400 font-bold',
          indicator: 'bg-yellow-500'
        };
      case 'CONVERTED':
        return {
          bg: 'bg-emerald-50 border-emerald-100',
          badge: 'bg-emerald-700 text-white border-emerald-800 font-extrabold',
          indicator: 'bg-emerald-600'
        };
      case 'NOT CONTACTABLE':
        return {
          bg: 'bg-rose-50 border-rose-100',
          badge: 'bg-rose-800 text-white border-rose-900 font-extrabold',
          indicator: 'bg-rose-600'
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-100',
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          indicator: 'bg-slate-400'
        };
    }
  };

  const getSourceBadgeColor = (source: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('meta') || s.includes('fb') || s.includes('facebook')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (s.includes('google')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (s.includes('website') || s.includes('web')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
    if (s.includes('organic')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const handleStatusChange = async (lead: ServiceRequest, newStatus: string) => {
    if (!onUpdateServiceRequest) {
      toast.error('Lead updates are not supported');
      return;
    }

    const updatedLead = { ...lead, status: newStatus };
    
    // Optimistic local update of detail modal if selected
    if (selectedLead?.id === lead.id) {
      setSelectedLead(updatedLead);
    }

    const loadToast = toast.loading(`Moving ${lead.customerName} to ${newStatus}...`);
    try {
      await onUpdateServiceRequest(updatedLead);
      toast.success(`Moved lead to ${newStatus}!`, { id: loadToast });
    } catch (err) {
      toast.error('Failed to update status', { id: loadToast });
    }
  };

  const handleSaveRemarksAndReminder = async () => {
    if (!selectedLead || !onUpdateServiceRequest) return;

    const loadToast = toast.loading('Saving lead changes...');
    try {
      await onUpdateServiceRequest(selectedLead);
      toast.success('Lead details saved successfully!', { id: loadToast });
      setSelectedLead(null);
    } catch (err) {
      toast.error('Failed to save details', { id: loadToast });
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.customerName || !newLeadForm.customerPhone) {
      toast.error('Name and Phone are required!');
      return;
    }

    if (!onCaptureLead) {
      toast.error('Lead capturing is not supported');
      return;
    }

    const loadToast = toast.loading('Creating manual lead...');
    try {
      const payload: Omit<ServiceRequest, 'id' | 'requestDate'> & { status?: string } = {
        customerName: newLeadForm.customerName,
        customerPhone: newLeadForm.customerPhone,
        requestedService: newLeadForm.requestedService,
        source: newLeadForm.source,
        status: newLeadForm.status,
        carBrand: newLeadForm.carBrand || undefined,
        carModel: newLeadForm.carModel || undefined,
        carRegNo: newLeadForm.carRegNo || undefined,
        streetAddress: newLeadForm.streetAddress || undefined,
        totalAmount: newLeadForm.totalAmount ? parseFloat(newLeadForm.totalAmount) : undefined,
        remarks: newLeadForm.remarks || undefined,
        campaignName: newLeadForm.campaignName || undefined,
        bookingReminderDate: newLeadForm.bookingReminderDate || undefined
      };

      await onCaptureLead(payload);
      setIsCreateModalOpen(false);
      // Reset form
      setNewLeadForm({
        customerName: '',
        customerPhone: '',
        requestedService: 'Pressure Washing & Deep Cleaning',
        source: 'Meta',
        status: 'CREATED',
        carBrand: '',
        carModel: '',
        carRegNo: '',
        streetAddress: '',
        totalAmount: '',
        remarks: '',
        campaignName: '',
        bookingReminderDate: ''
      });
      toast.success('Manual lead created successfully!', { id: loadToast });
    } catch (err) {
      toast.error('Failed to create lead', { id: loadToast });
    }
  };

  const handleSaveConfig = () => {
    if (!onSaveSettings) {
      toast.error('Saving settings is not supported');
      return;
    }

    const updatedSettings: Settings = {
      ...(settings || { googleSheetsUrl: '', googleDriveUploadUrl: '', customLogoUrl: '' }),
      metaLeadsSheetUrl: metaSheetUrl,
      metaLeadsTabName: metaTabName,
      whatsappSheetUrl: whatsAppSheetUrl,
      whatsappTabName: whatsAppTabName,
      whatsAppLeadsSheetUrl: whatsAppSheetUrl,
      whatsAppLeadsTabName: whatsAppTabName
    };

    onSaveSettings(updatedSettings);
    toast.success('Omnichannel CRM settings saved successfully!');
  };

  const webOrdersCount = websiteOrdersWaiting.length;

  const [isSyncDropdownOpen, setIsSyncDropdownOpen] = useState(false);

  const handleExecuteSync = async (type: 'all' | 'meta' | 'whatsapp' | 'web', mode: 'incremental' | 'full' = 'incremental') => {
    setIsSyncDropdownOpen(false);
    if (type === 'all') {
      if (onSyncAllLeads) {
        await onSyncAllLeads(mode);
      } else {
        if (onSyncMetaLeads) await onSyncMetaLeads(mode);
        if (onSyncWhatsAppLeads) await onSyncWhatsAppLeads(mode);
        if (onSyncWebsiteOrders) await onSyncWebsiteOrders(mode);
      }
    } else if (type === 'meta') {
      if (onSyncMetaLeads) await onSyncMetaLeads(mode);
    } else if (type === 'whatsapp') {
      if (onSyncWhatsAppLeads) await onSyncWhatsAppLeads(mode);
    } else if (type === 'web') {
      if (onSyncWebsiteOrders) await onSyncWebsiteOrders(mode);
    }
  };

  const isAnySyncing = isSyncing || isSyncingMetaLeads || isSyncingWhatsAppLeads;

  return (
    <div className="space-y-6">
      {/* Modern Zoho/Freshdesk/Salesforce CRM Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-gradient-to-tr from-indigo-600 to-sky-500 text-white rounded-xl shadow-xs">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Omnichannel CRM Leads & Enquiries</h1>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                  Multi-Source
                </span>
              </div>
              <p className="text-slate-500 text-xs font-medium">
                Unified management for <strong>Meta Ads</strong>, <strong>WhatsApp Manual Enquiries</strong>, and <strong>Website Storefront Orders</strong>.
              </p>
            </div>
          </div>

          {/* Lead Source Indicators */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-150">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Meta Ads: <strong>{metaLeadsCount}</strong></span>
            </span>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-150">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>WhatsApp Enquiries: <strong>{whatsAppLeadsCount}</strong></span>
            </span>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-150">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              <span>Web Orders: <strong>{webOrdersCount}</strong></span>
            </span>
          </div>
        </div>

        {/* Action Controls Group (De-duplicated & Cleaned) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* New Ticket / Lead */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Lead / Ticket</span>
          </button>

          {/* Unified Omni-Sync Dropdown */}
          <div className="relative">
            <div className="inline-flex rounded-xl shadow-xs border border-indigo-200 overflow-hidden bg-indigo-600">
              <button
                onClick={() => handleExecuteSync('all', 'incremental')}
                disabled={isAnySyncing}
                className="px-3.5 py-2.5 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Quick Sync: Sync all configured channels (Meta, WhatsApp, Web)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAnySyncing ? 'animate-spin' : ''}`} />
                <span>{isAnySyncing ? 'Syncing CRM...' : 'Omni-Sync All'}</span>
              </button>
              <button
                onClick={() => setIsSyncDropdownOpen(prev => !prev)}
                className="px-2 py-2.5 text-indigo-100 hover:bg-indigo-700 border-l border-indigo-500/60 transition-colors cursor-pointer"
                title="Select specific channel to sync"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {isSyncDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-100">
                  Select Channel to Ingest
                </div>
                
                <button
                  onClick={() => handleExecuteSync('meta', 'incremental')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Sync Meta Leads Only
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Incremental</span>
                </button>

                <button
                  onClick={() => handleExecuteSync('whatsapp', 'incremental')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Sync WhatsApp Enquiries
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Sheet</span>
                </button>

                <button
                  onClick={() => handleExecuteSync('web', 'incremental')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                    Sync Website Orders
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Storefront</span>
                </button>

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={() => handleExecuteSync('all', 'full')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-extrabold text-amber-700 hover:bg-amber-50 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    Deep Full Re-Sync All
                  </span>
                  <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono">Full</span>
                </button>
              </div>
            )}
          </div>

          {/* More CRM Tools dropdown / pills */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsSmartRoutingModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="Automated Hub Geolocation & Smart Agent Lead Distribution"
            >
              <Compass className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden sm:inline">Routing</span>
            </button>

            <button
              onClick={() => setIsDeduplicationModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="Scan, Merge & Clean Duplicate Inquiries"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Dedup</span>
            </button>

            <button
              onClick={() => setIsWebhookModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="Meta & Google Lead Ads Webhook Ingestion"
            >
              <Webhook className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden sm:inline">Webhooks</span>
            </button>

            <button
              onClick={() => setIsSubsheetsModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="Manage Subsheets & Multi-Tabs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Subsheets</span>
            </button>

            <button
              onClick={() => setIsSyncPerformanceModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="View Sync Diagnostics"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Diagnostics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation and Filtering panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-2">
        {/* Tab Selection */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => { setActiveTab('META'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'META' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Meta Leads
            {metaLeadsCount > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-black leading-none ${
                activeTab === 'META' ? 'bg-blue-800 text-blue-100' : 'bg-blue-100 text-blue-800'
              }`}>
                {metaLeadsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('WHATSAPP'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'WHATSAPP' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp Enquiries
            {whatsAppLeadsCount > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-black leading-none ${
                activeTab === 'WHATSAPP' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {whatsAppLeadsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('WEB_ORDERS'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'WEB_ORDERS' 
                ? 'bg-teal-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-teal-700 hover:bg-teal-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Website Orders
            {websiteOrdersWaiting.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-black leading-none ${
                activeTab === 'WEB_ORDERS' ? 'bg-teal-800 text-teal-100' : 'bg-teal-100 text-teal-800'
              }`}>
                {websiteOrdersWaiting.length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('ALL'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'ALL' || activeTab === 'BOARD' || activeTab === 'LIST'
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            All Channels
            <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-black leading-none ${
              (activeTab === 'ALL' || activeTab === 'BOARD' || activeTab === 'LIST') ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {serviceRequests.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('TIMELINE'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'TIMELINE' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Lead Timeline
          </button>

          <button
            onClick={() => { setActiveTab('PRODUCTIVITY'); setStatusFilter('ALL'); }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'PRODUCTIVITY' 
                ? 'bg-amber-600 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Agent KPIs & SLA
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'SETTINGS' 
                ? 'bg-slate-800 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            CRM Settings
          </button>
        </div>

        {/* Searching & Filter inputs */}
        {activeTab !== 'SETTINGS' && activeTab !== 'TIMELINE' && activeTab !== 'PRODUCTIVITY' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <input
              type="text"
              placeholder={activeTab === 'WEB_ORDERS' ? "Search website orders..." : "Search leads..."}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="px-3.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 w-full sm:w-52"
            />

            {activeTab === 'WEB_ORDERS' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer text-slate-700"
              >
                <option value="ALL">All Stages</option>
                {LEAD_STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            )}

            {activeTab !== 'WEB_ORDERS' && (
              <>
                {/* Campaign Filter Dropdown */}
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer text-slate-700 max-w-[150px] truncate"
                >
                  <option value="ALL">All Campaigns</option>
                  {uniqueCampaigns.map(camp => (
                    <option key={camp} value={camp}>{camp}</option>
                  ))}
                </select>

                {/* Platform Filter Dropdown */}
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer text-slate-700"
                >
                  <option value="ALL">All Platforms</option>
                  {uniquePlatforms.map(plat => (
                    <option key={plat} value={plat}>{safeStr(plat).toUpperCase()}</option>
                  ))}
                </select>

                {/* List status filter */}
                {activeTab === 'LIST' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer text-slate-700"
                  >
                    <option value="ALL">All Stages</option>
                    {LEAD_STAGES.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                )}

                {/* Show Archived Toggle */}
                <button
                  type="button"
                  onClick={() => setShowArchived(prev => !prev)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center gap-1.5 cursor-pointer select-none ${
                    showArchived
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/70'
                      : 'bg-white text-slate-600 border-slate-200 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  {showArchived ? 'Showing Archived' : 'Show Archived'}
                </button>

                {/* Advanced Filters Toggle */}
                <button
                  type="button"
                  onClick={() => setIsAdvancedFiltersOpen(prev => !prev)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center gap-1.5 cursor-pointer select-none ${
                    isAdvancedFiltersOpen
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100/70 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Advanced Filters</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isAdvancedFiltersOpen ? 'rotate-180' : ''}`} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Advanced Filters Panel */}
        {activeTab !== 'SETTINGS' && activeTab !== 'WEB_ORDERS' && activeTab !== 'TIMELINE' && isAdvancedFiltersOpen && (
          <div className="mt-3 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Specific Customer & Agent */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Filter by Specific Customer Name
                  </label>
                  <input
                    type="text"
                    value={customerNameFilter}
                    onChange={(e) => setCustomerNameFilter(e.target.value)}
                    placeholder="e.g. Jane Smith (exact/partial)"
                    className="w-full px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Filter by Assigned Agent
                  </label>
                  <select
                    value={assignedAgentFilter}
                    onChange={(e) => setAssignedAgentFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer text-slate-700"
                  >
                    <option value="ALL">All Agents</option>
                    <option value="UNASSIGNED">Unassigned Only</option>
                    <option value="ASSIGNED">Any Assigned Agent</option>
                    {users.map(u => (
                      <option key={u.username} value={u.username}>
                        {u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Right Column: Date range and presets */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">
                      Filter by Lead Creation Date Range
                    </label>
                    <span className="text-[10px] text-slate-400 font-semibold">Timezone: Local</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">From</span>
                      <input
                        type="date"
                        value={startDateFilter}
                        onChange={(e) => setStartDateFilter(e.target.value)}
                        className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">To</span>
                      <input
                        type="date"
                        value={endDateFilter}
                        onChange={(e) => setEndDateFilter(e.target.value)}
                        className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    Quick Presets
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => handleApplyLeadDatePreset('today')}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer select-none"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyLeadDatePreset('7days')}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer select-none"
                    >
                      Last 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyLeadDatePreset('30days')}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer select-none"
                    >
                      Last 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyLeadDatePreset('thismonth')}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer select-none"
                    >
                      This Month
                    </button>
                    {(startDateFilter || endDateFilter) && (
                      <button
                        type="button"
                        onClick={() => handleApplyLeadDatePreset('clear')}
                        className="px-2.5 py-1 text-[10px] font-bold bg-rose-50 border border-rose-100 hover:bg-rose-100/70 text-rose-600 rounded-lg transition-colors cursor-pointer select-none"
                      >
                        Clear Range
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Active Filters Clear Button */}
            {(customerNameFilter || startDateFilter || endDateFilter || assignedAgentFilter !== 'ALL') && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerNameFilter('');
                    setStartDateFilter('');
                    setEndDateFilter('');
                    setAssignedAgentFilter('ALL');
                  }}
                  className="px-3 py-1 text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer select-none"
                >
                  Reset Advanced Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subsheets Multi-Tab Quick Selector Bar for Meta & All Leads */}
      {(activeTab === 'META' || activeTab === 'ALL' || activeTab === 'BOARD' || activeTab === 'LIST') && uniqueSubsheets.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            <span>Subsheets:</span>
          </span>
          <button
            onClick={() => setSubsheetFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subsheetFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-400/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>All Subsheets</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              subsheetFilter === 'ALL' ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {serviceRequests.length}
            </span>
          </button>
          {uniqueSubsheets.map(subsheet => {
            const count = serviceRequests.filter(lead => 
              (lead.subsheetName && safeStr(lead.subsheetName).trim().toLowerCase() === subsheet.toLowerCase().trim()) ||
              (lead.formName && safeStr(lead.formName).trim().toLowerCase() === subsheet.toLowerCase().trim())
            ).length;
            const isSelected = subsheetFilter.toLowerCase().trim() === subsheet.toLowerCase().trim();

            return (
              <button
                key={subsheet}
                onClick={() => setSubsheetFilter(subsheet)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{subsheet}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  isSelected ? 'bg-indigo-700 text-white' : 'bg-indigo-50 text-indigo-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* META LEADS TAB VIEW */}
      {activeTab === 'META' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Meta Fast Sync Bar */}
          <LeadFastSyncBar
            isSyncing={!!isSyncingMetaLeads}
            onSyncMetaLeads={onSyncMetaLeads || (() => Promise.resolve())}
            onSyncWhatsAppLeads={onSyncWhatsAppLeads}
            onSyncWebsiteOrders={onSyncWebsiteOrders}
            onSyncAllLeads={onSyncAllLeads}
            syncStats={(settings as any)?.syncPerformanceStats || null}
            onOpenWebhookModal={() => setIsWebhookModalOpen(true)}
            onOpenDeduplicationModal={() => setIsDeduplicationModalOpen(true)}
            onOpenSubsheetsModal={() => setIsSubsheetsModalOpen(true)}
            onOpenSyncPerformanceModal={() => setIsSyncPerformanceModalOpen(true)}
            onOpenSettingsTab={() => setActiveTab('SETTINGS')}
            activeLeadsCount={metaLeadsCount}
          />

          {/* Meta View Mode Switcher */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Meta Pipeline View:</span>
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                <button
                  onClick={() => setMetaViewMode('BOARD')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    metaViewMode === 'BOARD'
                      ? 'bg-white text-blue-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Kanban Board
                </button>
                <button
                  onClick={() => setMetaViewMode('LIST')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    metaViewMode === 'LIST'
                      ? 'bg-white text-blue-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  Detail Table
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="font-extrabold text-blue-900">{metaLeads.length}</span> Meta leads
              </p>
            </div>
          </div>

          {/* Meta Content View */}
          {metaViewMode === 'BOARD' ? (
            <LeadKanbanBoard
              stages={LEAD_STAGES}
              leads={metaLeads}
              onStatusChange={handleStatusChange}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onConvertLead={(leadId) => {
                const target = serviceRequests.find(l => l.id === leadId);
                if (target) setConversionWizardLead(target);
              }}
              onOpenWhatsAppModal={(lead) => setWhatsAppModalLead(lead)}
              onSnoozeLead={handleSingleLeadSnooze}
              onAddNoteLead={handleSingleLeadAddNote}
              onCallLead={handleSingleLeadCall}
              selectedLeadIds={selectedLeadIds}
              onToggleSelectLead={(leadId) => {
                setSelectedLeadIds(prev => 
                  prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
                );
              }}
              activeHubs={activeHubs || []}
              getLeadHubDistanceInfo={getLeadHubDistanceInfo}
              getStageColorClasses={(stage) => getStageColorClasses(stage).badge || ''}
              users={users}
            />
          ) : (
            <LeadTableView
              stages={LEAD_STAGES}
              leads={metaLeads}
              onStatusChange={handleStatusChange}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onConvertLead={(leadId) => {
                const target = serviceRequests.find(l => l.id === leadId);
                if (target) setConversionWizardLead(target);
              }}
              onOpenWhatsAppModal={(lead) => setWhatsAppModalLead(lead)}
              onSnoozeLead={handleSingleLeadSnooze}
              onAddNoteLead={handleSingleLeadAddNote}
              onCallLead={handleSingleLeadCall}
              selectedLeadIds={selectedLeadIds}
              onToggleSelectLead={(leadId) => {
                setSelectedLeadIds(prev => 
                  prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
                );
              }}
              onSelectAllLeads={(ids) => setSelectedLeadIds(ids)}
              activeHubs={activeHubs || []}
              getLeadHubDistanceInfo={getLeadHubDistanceInfo}
              getStageColorClasses={(stage) => getStageColorClasses(stage).badge || ''}
              users={users}
            />
          )}
        </div>
      )}

      {/* ALL CHANNELS PIPELINE VIEW */}
      {(activeTab === 'ALL' || activeTab === 'BOARD' || activeTab === 'LIST') && (
        <div className="space-y-4 animate-fadeIn">
          {/* View Mode Switcher */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">All Channels View:</span>
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                <button
                  onClick={() => setAllViewMode('BOARD')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    allViewMode === 'BOARD'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Kanban Board
                </button>
                <button
                  onClick={() => setAllViewMode('LIST')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    allViewMode === 'LIST'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  Detail Table
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="font-extrabold text-slate-900">{processedLeads.length}</span> total leads
              </p>
            </div>
          </div>

          {/* All Channels Content View */}
          {allViewMode === 'BOARD' ? (
            <LeadKanbanBoard
              stages={LEAD_STAGES}
              leads={processedLeads}
              onStatusChange={handleStatusChange}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onConvertLead={(leadId) => {
                const target = serviceRequests.find(l => l.id === leadId);
                if (target) setConversionWizardLead(target);
              }}
              onOpenWhatsAppModal={(lead) => setWhatsAppModalLead(lead)}
              onSnoozeLead={handleSingleLeadSnooze}
              onAddNoteLead={handleSingleLeadAddNote}
              onCallLead={handleSingleLeadCall}
              selectedLeadIds={selectedLeadIds}
              onToggleSelectLead={(leadId) => {
                setSelectedLeadIds(prev => 
                  prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
                );
              }}
              activeHubs={activeHubs || []}
              getLeadHubDistanceInfo={getLeadHubDistanceInfo}
              getStageColorClasses={(stage) => getStageColorClasses(stage).badge || ''}
              users={users}
            />
          ) : (
            <LeadTableView
              stages={LEAD_STAGES}
              leads={processedLeads}
              onStatusChange={handleStatusChange}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onConvertLead={(leadId) => {
                const target = serviceRequests.find(l => l.id === leadId);
                if (target) setConversionWizardLead(target);
              }}
              onOpenWhatsAppModal={(lead) => setWhatsAppModalLead(lead)}
              onSnoozeLead={handleSingleLeadSnooze}
              onAddNoteLead={handleSingleLeadAddNote}
              onCallLead={handleSingleLeadCall}
              selectedLeadIds={selectedLeadIds}
              onToggleSelectLead={(leadId) => {
                setSelectedLeadIds(prev => 
                  prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
                );
              }}
              onSelectAllLeads={(ids) => setSelectedLeadIds(ids)}
              activeHubs={activeHubs || []}
              getLeadHubDistanceInfo={getLeadHubDistanceInfo}
              getStageColorClasses={(stage) => getStageColorClasses(stage).badge || ''}
              users={users}
            />
          )}
        </div>
      )}

      {activeTab === 'WHATSAPP' && (
        <div className="animate-fadeIn">
          <WhatsAppEnquiriesView
            leads={serviceRequests}
            users={users}
            onSyncWhatsAppLeads={onSyncWhatsAppLeads}
            isSyncingWhatsAppLeads={isSyncingWhatsAppLeads}
            onUpdateLead={onUpdateServiceRequest}
            onConvertLead={onConvertLeadToService}
            onOpenTimelineDrawer={(lead) => setTimelineDrawerLead(lead)}
            onOpenWhatsAppModal={(lead) => setWhatsAppModalLead(lead)}
            onOpenConversionWizard={(lead) => setConversionWizardLead(lead)}
            lastSyncDate={settings?.whatsAppLeadsLastSyncDate}
            whatsAppSheetUrl={settings?.whatsAppLeadsSheetUrl || whatsAppSheetUrl}
          />
        </div>
      )}

      {activeTab === 'WEB_ORDERS' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Dashboard info card */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-100 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wider">Neon Orders Database Pipeline</h3>
              </div>
              <h2 className="text-2xl font-black text-emerald-900 tracking-tight">Website Storefront Orders (Neon Database - Single Source of Truth)</h2>
              <p className="text-xs text-emerald-800/80 font-medium max-w-2xl leading-relaxed">
                Direct synchronization from the <strong>Neon PostgreSQL Database (<code>orders</code> table)</strong>. Website orders, line-items, customer contact details, and vehicle specifications are fetched directly from the database without any Google Sheet dependency.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="bg-white/90 backdrop-blur border border-emerald-200/60 p-3.5 rounded-xl text-center shadow-xs w-full sm:w-36">
                <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Fetched Orders</p>
                <p className="text-2xl font-black text-emerald-950 mt-0.5">{websiteOrdersWaiting.length}</p>
              </div>
              <button
                onClick={() => onSyncWebsiteOrders()}
                disabled={isSyncing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black rounded-xl shadow-md transition-all active:scale-95 text-xs whitespace-nowrap uppercase tracking-wider cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing Database...' : 'Sync Neon Orders DB'}
              </button>
            </div>
          </div>

          {/* View Mode Toggle & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Display Mode:</span>
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                <button
                  onClick={() => setWebOrdersViewMode('TABLE')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    webOrdersViewMode === 'TABLE'
                      ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  Neon Database Orders Table
                </button>
                <button
                  onClick={() => setWebOrdersViewMode('CARDS')}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    webOrdersViewMode === 'CARDS'
                      ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Rich Cards
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="font-extrabold text-slate-900">{filteredWebsiteOrders.length}</span> rows
              </p>
            </div>
          </div>

          {/* Core orders table or grid */}
          <ErrorBoundary>
            {filteredWebsiteOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm max-w-3xl mx-auto flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                  <CheckCircle className="w-8 h-8 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">No Website Orders Found</h3>
                  <p className="text-sm text-slate-500 font-medium max-w-md">
                    Click the button below to fetch the latest storefront orders directly from your Neon PostgreSQL database.
                  </p>
                </div>
                <button
                  onClick={() => onSyncWebsiteOrders()}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm text-xs active:scale-95 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Neon Orders Database
                </button>
              </div>
            ) : webOrdersViewMode === 'TABLE' ? (
              /* Spreadsheet Columns Table View */
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-3.5 px-4">#</th>
                        <th className="py-3.5 px-4">Customer Name</th>
                        <th className="py-3.5 px-4">Mobile</th>
                        <th className="py-3.5 px-4">Car Number</th>
                        <th className="py-3.5 px-4">Brand / Model / Version</th>
                        <th className="py-3.5 px-4">Tag / Fuel / Year</th>
                        <th className="py-3.5 px-4">Front Tyres Spec</th>
                        <th className="py-3.5 px-4">Rear Tyres Spec</th>
                        <th className="py-3.5 px-4">Service Address</th>
                        <th className="py-3.5 px-4 text-center">Database Record</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {filteredWebsiteOrders.slice(0, visibleWebOrdersCount).map((lead, idx) => {
                        let extraData: any = {};
                        try {
                          if (lead.originalOrderJson) extraData = JSON.parse(lead.originalOrderJson);
                        } catch (e) {}

                        const mobile = extraData.mobile || extraData.userId || lead.customerPhone || 'N/A';
                        const fn = extraData.firstName || '';
                        const ln = extraData.lastName || '';
                        const name = (fn || ln) ? `${fn} ${ln}`.trim() : lead.customerName || 'N/A';
                        const carNo = extraData.carNumber || extraData.car_reg_no || lead.carRegNo || 'N/A';
                        const brand = extraData.car_brand || lead.carBrand || '';
                        const model = extraData.car_model || lead.carModel || '';
                        const version = extraData.car_version || '';
                        const vehicleStr = `${brand} ${model}`.trim() + (version ? ` (${version})` : '');
                        const tag = extraData.car_tag || 'Standard';
                        const fuel = extraData.car_fuel_type || 'N/A';
                        const year = extraData.car_year_range || '';
                        const frontTyre = extraData.front_tyres_spec || 'N/A';
                        const rearTyre = extraData.rear_tyres_spec || 'N/A';
                        const address = lead.streetAddress || 'N/A';
                        const rawStatus = (lead.status || 'Placed').trim();

                        return (
                          <tr key={lead.id || idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{name}</td>
                            <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                              {mobile !== 'N/A' ? (
                                <a href={`tel:${mobile}`} className="hover:text-indigo-600 flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {mobile}
                                </a>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                              {carNo !== 'N/A' ? (
                                <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                                  {carNo}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-800">
                              {vehicleStr || 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  {tag}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500">
                                  {fuel} {year ? `(${year})` : ''}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {frontTyre}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {rearTyre}
                            </td>
                            <td className="py-3 px-4 max-w-xs text-slate-600 truncate" title={address}>
                              {address}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setRawColumnsLead(lead)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                              >
                                View DB Record
                              </button>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                {rawStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredWebsiteOrders.length > visibleWebOrdersCount && (
                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-center">
                    <button
                      onClick={() => setVisibleWebOrdersCount(prev => prev + 50)}
                      className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold border border-slate-200 rounded-xl text-xs cursor-pointer shadow-xs"
                    >
                      Load More Rows ({filteredWebsiteOrders.length - visibleWebOrdersCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Rich Cards View */
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredWebsiteOrders.slice(0, visibleWebOrdersCount).map((lead) => {
                    let extraData: any = {};
                    try {
                      if (lead.originalOrderJson) extraData = JSON.parse(lead.originalOrderJson);
                    } catch (e) {}

                    const paymentMethod = extraData.paymentMethod || 'Cash / Onsite';
                    const carTag = extraData.car_tag || 'Standard';
                    const frontTyre = extraData.front_tyres_spec || '';
                    const rearTyre = extraData.rear_tyres_spec || '';
                    const isExpanded = !!expandedCardIds[lead.id];

                    return (
                      <div
                        key={lead.id}
                        className="bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden relative group"
                      >
                        {/* Header banner */}
                        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider font-mono">
                              ID: #{lead.id || 'N/A'}
                            </span>
                          </div>
                          {/* Summary Status Chip */}
                          <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 ${getStatusBadgeStyles(lead.status)}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                            Status: {normalizeStatus(lead.status) === 'CREATED' ? 'NEW' : normalizeStatus(lead.status)}
                          </span>
                        </div>

                        <div className="p-5 space-y-3 flex-1">
                          {/* Name, Source & Phone */}
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-base font-extrabold text-slate-900">
                                {lead.customerName}
                              </h4>
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase font-mono">
                                {lead.source}
                              </span>
                            </div>

                            {lead.customerPhone && (
                              <a
                                href={`tel:${lead.customerPhone}`}
                                className="inline-flex items-center gap-1 text-xs text-slate-500 font-semibold hover:text-indigo-600 mt-1"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {lead.customerPhone}
                              </a>
                            )}

                            {(() => {
                              const distInfo = getLeadHubDistanceInfo(lead, activeHubs);
                              if (!distInfo) return null;
                              return (
                                <div className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full mt-1.5">
                                  <Navigation className="w-3 h-3 text-indigo-500" />
                                  <span>Hub Distance: <strong>{distInfo.distanceKm.toFixed(1)} km</strong> ({distInfo.hubName})</span>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Short Description Preview */}
                          {lead.requestedService && (
                            <p className={`text-xs text-slate-600 font-medium leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
                              {lead.requestedService}
                            </p>
                          )}

                          <div className="border-t border-slate-100"></div>

                          {/* Car Summary */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                              <Car className="w-4 h-4 text-slate-400" />
                              <span>
                                {lead.carBrand || 'Unknown'} {lead.carModel || 'Vehicle'}
                              </span>
                            </div>
                            {carTag && (
                              <span className="bg-slate-100 text-slate-700 font-extrabold px-1.5 py-0.5 rounded text-[9px] uppercase border border-slate-200">
                                {carTag}
                              </span>
                            )}
                          </div>

                          {/* Expand to View Details Animated Toggle Button */}
                          <button
                            type="button"
                            onClick={(e) => toggleCardExpansion(lead.id, e)}
                            className="w-full text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-150 rounded-xl px-3 py-2 flex items-center justify-between transition-all duration-200 mt-2 cursor-pointer select-none shadow-2xs hover:shadow-xs active:scale-[0.99]"
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                              {isExpanded ? 'Hide Card Details' : 'Expand to View Details'}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-indigo-600 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Animated Collapsible Details Container */}
                          <div
                            className={`grid transition-all duration-300 ease-in-out overflow-hidden ${
                              isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2 pt-3 border-t border-slate-100' : 'grid-rows-[0fr] opacity-0'
                            }`}
                          >
                            <div className="min-h-0 space-y-3">
                              {/* Full Service Description */}
                              {lead.requestedService && (
                                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl space-y-1">
                                  <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Full Order Description</p>
                                  <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                                    {lead.requestedService}
                                  </p>
                                </div>
                              )}

                              {/* Registration & Specs */}
                              <div className="space-y-2">
                                {lead.carRegNo && (
                                  <div className="text-xs font-extrabold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 w-fit font-mono">
                                    Reg: {lead.carRegNo}
                                  </div>
                                )}

                                {(extraData.car_fuel_type || extraData.car_year_range) && (
                                  <p className="text-xs font-bold text-slate-500">
                                    Fuel: <span className="text-slate-800">{extraData.car_fuel_type || 'N/A'}</span>
                                    {extraData.car_year_range ? ` • Year: ${extraData.car_year_range}` : ''}
                                  </p>
                                )}
                              </div>

                              {/* Tyre Specs if available */}
                              {(frontTyre || rearTyre) && (
                                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl space-y-1">
                                  <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Tyres Specifications</p>
                                  {frontTyre && <p className="text-xs font-mono font-bold text-slate-700">Front: {frontTyre}</p>}
                                  {rearTyre && <p className="text-xs font-mono font-bold text-slate-700">Rear: {rearTyre}</p>}
                                </div>
                              )}

                              {/* Address detail */}
                              {lead.streetAddress && (
                                <div className="space-y-1 bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                                  <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Service Location</p>
                                  <p className="text-xs font-semibold text-slate-600 flex items-start gap-1.5 leading-relaxed">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                    <span>{lead.streetAddress}</span>
                                  </p>
                                  {(() => {
                                    const distInfo = getLeadHubDistanceInfo(lead, activeHubs);
                                    if (!distInfo) return null;
                                    return (
                                      <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-indigo-800 bg-indigo-50/90 px-2.5 py-1 rounded-lg">
                                        <span className="flex items-center gap-1.5">
                                          <Navigation className="w-3 h-3 text-indigo-600" />
                                          Distance from Hub ({distInfo.hubName}):
                                        </span>
                                        <span className="font-extrabold text-indigo-950">{distInfo.distanceKm.toFixed(1)} km</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Payment Method */}
                              <div className="text-xs font-bold text-slate-500 flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
                                <span>Payment Method</span>
                                <span className="text-slate-800 font-extrabold">{paymentMethod}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer with Neon DB Record Inspector */}
                        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between gap-3 font-bold text-xs">
                          <button
                            onClick={() => setRawColumnsLead(lead)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
                          >
                            Inspect Neon Record
                          </button>

                          {onConvertLeadToService && (
                            <button
                              onClick={() => onConvertLeadToService(lead.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs uppercase tracking-wider cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Queue Order
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredWebsiteOrders.length > visibleWebOrdersCount && (
                  <div className="flex flex-col items-center justify-center pt-4 pb-8 border-t border-slate-100 mt-8 gap-3">
                    <button
                      onClick={() => setVisibleWebOrdersCount(prev => prev + 50)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold rounded-xl border border-indigo-200 shadow-sm text-xs uppercase tracking-wider cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Load More Web Orders ({filteredWebsiteOrders.length - visibleWebOrdersCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}
          </ErrorBoundary>

          {/* Neon Database Record Inspection Modal */}
          {rawColumnsLead && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-fadeIn max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Neon Database Order Attributes</h3>
                    <p className="text-xs text-slate-500">Order ID: <span className="font-mono font-bold text-slate-800">{rawColumnsLead.id}</span> (Source: Neon PostgreSQL DB)</p>
                  </div>
                  <button
                    onClick={() => setRawColumnsLead(null)}
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                  {(() => {
                    let parsed: any = {};
                    try {
                      if (rawColumnsLead.originalOrderJson) parsed = JSON.parse(rawColumnsLead.originalOrderJson);
                    } catch (e) {}

                    const keys = Object.keys(parsed);
                    if (keys.length === 0) {
                      return <p className="text-sm text-slate-500 italic">No database fields available for this order.</p>;
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {keys.map(key => (
                          <div key={key} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                            <p className="text-[10px] font-mono font-black text-indigo-700 uppercase tracking-wider">{key}</p>
                            <p className="text-xs font-semibold text-slate-800 break-words font-mono">
                              {typeof parsed[key] === 'object' ? JSON.stringify(parsed[key]) : String(parsed[key] || '—')}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <button
                    onClick={() => setRawColumnsLead(null)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'SETTINGS' && (
        <Card>
          <div className="p-6 space-y-8 max-w-3xl">
            <div>
              <h2 className="text-xl font-black text-slate-800">Omnichannel CRM Google Sheets Configuration</h2>
              <p className="text-xs text-slate-500 mt-1">Configure independent Google Sheets for Meta Ads Leads and WhatsApp Manual Enquiries to sync records directly into your CRM pipelines without conflicts.</p>
            </div>

            {/* Meta Leads Configuration Section */}
            <div className="space-y-4 p-5 bg-indigo-50/40 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                <h3 className="text-sm font-extrabold text-indigo-950 uppercase tracking-wider">1. Meta Facebook & Instagram Leads Sheet</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Meta Leads Google Sheet URL
                  </label>
                  <input
                    type="text"
                    value={metaSheetUrl}
                    onChange={(e) => setMetaSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Meta Leads Sub-Sheet (Tab) Name
                  </label>
                  <input
                    type="text"
                    value={metaTabName}
                    onChange={(e) => setMetaTabName(e.target.value)}
                    placeholder="e.g. Meta, Meta Leads, Sheet1 (Leave blank to use first tab)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-white border border-indigo-100 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-indigo-600" /> Expected Meta Columns
                </p>
                <p className="text-[10px] text-slate-600 leading-relaxed font-mono">
                  <code>created_time</code>, <code>ad_id</code>, <code>campaign_name</code>, <code>full_name</code>, <code>phone_number</code>, <code>service_that_you're_interested_in</code>, <code>lead_status</code>, <code>Remarks</code>
                </p>
              </div>
            </div>

            {/* WhatsApp Enquiries Configuration Section */}
            <div className="space-y-4 p-5 bg-emerald-50/40 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wider">2. WhatsApp Manual Enquiries Sheet</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Enquiries Google Sheet URL
                  </label>
                  <input
                    type="text"
                    value={whatsAppSheetUrl}
                    onChange={(e) => setWhatsAppSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Sub-Sheet (Tab) Name
                  </label>
                  <input
                    type="text"
                    value={whatsAppTabName}
                    onChange={(e) => setWhatsAppTabName(e.target.value)}
                    placeholder="e.g. WhatsApp, Enquiries, Sheet1 (Leave blank to use first tab)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-white border border-emerald-100 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-emerald-600" /> Expected WhatsApp Columns
                </p>
                <p className="text-[10px] text-slate-600 leading-relaxed font-mono">
                  <code>No</code>, <code>Lead Owner</code>, <code>Date</code>, <code>Customer Name</code>, <code>Phone</code>, <code>Car Model</code>, <code>Location</code>, <code>Enquiry Type</code>, <code>Lead Cost</code>, <code>Value</code>, <code>Status</code>, <code>Remarks</code>, <code>Action</code>
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleSaveConfig}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition-all shadow-md active:scale-95 text-xs uppercase tracking-wider cursor-pointer"
              >
                Save Omnichannel Config
              </button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'TIMELINE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left Column: Leads Selection List */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="flex flex-col h-[650px] overflow-hidden">
              {/* Search Header */}
              <div className="p-4 border-b border-slate-100 space-y-3">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ListIcon className="w-4 h-4 text-indigo-600" />
                  Select Lead to View Lifecycle
                </h3>
                <div className="relative">
                  <input
                    type="text"
                    value={timelineSearch}
                    onChange={(e) => setTimelineSearch(e.target.value)}
                    placeholder="Search client, phone, or car..."
                    className="w-full pl-9 pr-4 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-slate-700"
                  />
                  <Clock className="w-3.5 h-3.5 text-slate-450 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Scrollable list of leads */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {filteredTimelineLeads.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-bold">No leads found</p>
                  </div>
                ) : (
                  filteredTimelineLeads.map((lead) => {
                    const isSelected = selectedTimelineLeadId ? selectedTimelineLeadId === lead.id : processedLeads[0]?.id === lead.id;
                    const normStatus = normalizeStatus(lead.status);
                    const statusStyles = getStageColorClasses(normStatus);
                    
                    return (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedTimelineLeadId(lead.id)}
                        className={`w-full p-4 text-left transition-all hover:bg-slate-50/50 flex flex-col gap-2 relative ${
                          isSelected ? 'bg-indigo-50/40 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-black transition-colors ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                            {lead.customerName}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-bold font-mono">
                            {new Date(lead.requestDate).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide">
                            {lead.source}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="truncate max-w-[120px]">{lead.requestedService}</span>
                        </div>

                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider ${statusStyles}`}>
                            {normStatus === 'CREATED' ? 'NEW' : normStatus}
                          </span>
                          {lead.assignedAgent && (
                            <span className="text-[10px] text-slate-450 font-semibold flex items-center gap-1">
                              <UserIcon className="w-3 h-3 text-slate-300" />
                              {lead.assignedAgent}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer Stat */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Total Active CRM Leads: {processedLeads.length}
                </span>
              </div>
            </Card>
          </div>

          {/* Right Column: Active Lead Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {(() => {
              const activeTimelineLead = selectedTimelineLeadId 
                ? serviceRequests.find(r => r.id === selectedTimelineLeadId)
                : processedLeads[0];

              if (!activeTimelineLead) {
                return (
                  <Card className="p-16 text-center flex flex-col items-center justify-center space-y-4 max-w-xl mx-auto mt-12">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center">
                      <Clock className="w-8 h-8 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-slate-800 tracking-tight">Select a Lead to Begin</h3>
                      <p className="text-sm text-slate-500 font-medium">
                        Please select one of the active CRM leads from the list to visualize its chronological vertical stepper timeline and audit history.
                      </p>
                    </div>
                  </Card>
                );
              }

              const leadLogs = auditLogs
                .filter(log => log.leadId === activeTimelineLead.id)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

              const getStageDetails = (stageName: string) => {
                const statusLog = leadLogs.find(log => log.changeType === 'STATUS' && normalizeStatus(log.newValue) === stageName);
                if (statusLog) {
                  return {
                    timestamp: statusLog.timestamp,
                    changedBy: statusLog.changedBy,
                    notes: statusLog.notes
                  };
                }
                if (stageName === 'CREATED') {
                  const createLog = leadLogs.find(log => log.changeType === 'CREATE');
                  return {
                    timestamp: createLog?.timestamp || activeTimelineLead.requestDate,
                    changedBy: createLog?.changedBy || activeTimelineLead.source || 'System',
                    notes: createLog?.notes || 'Lead parsed and captured'
                  };
                }
                return null;
              };

              const currentStatusNorm = normalizeStatus(activeTimelineLead.status);
              const isFailed = currentStatusNorm === 'NOT CONTACTABLE';
              const baseStages = isFailed 
                ? ['CREATED', 'CONTACTED', 'FOLLOW UP', 'NOT CONTACTABLE']
                : ['CREATED', 'CONTACTED', 'FOLLOW UP', 'HIGH INTENT', 'CONVERTED'];
                
              const currentStageIndex = baseStages.indexOf(currentStatusNorm);

              return (
                <>
                  {/* 1. Lead Summary Header Card */}
                  <Card className="p-6 relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50/30 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none"></div>
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-150 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            Active Lead File
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-slate-400 font-bold">ID: #{activeTimelineLead.id}</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">
                          {activeTimelineLead.customerName}
                        </h2>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* One-Click Convert Button */}
                        {activeTimelineLead.status !== 'CONVERTED' && onConvertLeadToService && (
                          <button
                            onClick={() => onConvertLeadToService(activeTimelineLead.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 text-xs uppercase tracking-wider cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Convert to Service
                          </button>
                        )}
                        
                        {/* Edit Remarks and Assignment Button */}
                        <button
                          onClick={() => setSelectedLead(activeTimelineLead)}
                          className="p-2.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                          title="Configure Lead Settings / Details"
                        >
                          <SettingsIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-5">
                      <div>
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Customer Phone</p>
                        {activeTimelineLead.customerPhone ? (
                          <a
                            href={`tel:${activeTimelineLead.customerPhone}`}
                            className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-805 hover:text-indigo-605 mt-1"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {activeTimelineLead.customerPhone}
                          </a>
                        ) : (
                          <p className="text-sm font-bold text-slate-400 mt-1">None provided</p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Requested Service</p>
                        <p className="text-sm font-extrabold text-slate-900 mt-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          {activeTimelineLead.requestedService || 'General Inquiry'}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Vehicle Details</p>
                        {activeTimelineLead.carBrand || activeTimelineLead.carModel ? (
                          <p className="text-sm font-extrabold text-slate-805 mt-1 flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {`${activeTimelineLead.carBrand || ''} ${activeTimelineLead.carModel || ''}`.trim()}
                          </p>
                        ) : (
                          <p className="text-sm font-bold text-slate-400 mt-1">No vehicle</p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Estimated Value</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          ₹{activeTimelineLead.totalAmount?.toLocaleString() || '0'}
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* 2. Chronological Vertical Stepper & History Log */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Stepper on Left (md:col-span-7) */}
                    <div className="md:col-span-7 space-y-4">
                      <Card className="p-6">
                        <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-3 mb-6">
                          Chronological Vertical Lifecycle
                        </h3>
                        
                        {/* Vertical Stepper Container */}
                        <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                          {baseStages.map((stage, index) => {
                            const details = getStageDetails(stage);
                            let stepStatus: 'completed' | 'active' | 'pending' | 'failed' = 'pending';
                            
                            if (stage === 'NOT CONTACTABLE') {
                              stepStatus = 'failed';
                            } else if (currentStageIndex === -1) {
                              stepStatus = 'pending';
                            } else if (index < currentStageIndex) {
                              stepStatus = 'completed';
                            } else if (index === currentStageIndex) {
                              stepStatus = 'active';
                            } else {
                              stepStatus = 'pending';
                            }

                            // Titles and descriptions
                            let title = '';
                            let description = '';
                            switch (stage) {
                              case 'CREATED':
                                title = 'Lead Ingested';
                                description = `Successfully registered from ${activeTimelineLead.source}.`;
                                break;
                              case 'CONTACTED':
                                title = 'First Outreach';
                                description = 'Representative made first successful contact with user.';
                                break;
                              case 'FOLLOW UP':
                                title = 'Follow Up Nurturing';
                                description = 'Sent reminders or custom package offers.';
                                break;
                              case 'HIGH INTENT':
                                title = 'Verified Interest';
                                description = 'Prospect agreed to terms, pending final queue.';
                                break;
                              case 'CONVERTED':
                                title = 'Successful Conversion';
                                description = 'Active service schedule generated.';
                                break;
                              case 'NOT CONTACTABLE':
                                title = 'Lost / Unreachable';
                                description = 'Marked unreachable after max followups.';
                                break;
                            }

                            // Style configurations
                            let ringClass = 'border-slate-305 bg-white text-slate-400';
                            let icon = <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>;
                            let cardBorder = 'border-slate-100 bg-slate-50/50';

                            if (stepStatus === 'completed') {
                              ringClass = 'border-indigo-600 bg-indigo-600 text-white';
                              icon = (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              );
                              cardBorder = 'border-indigo-100 bg-indigo-50/20';
                            } else if (stepStatus === 'active') {
                              ringClass = 'border-amber-500 bg-white text-amber-500 animate-pulse';
                              icon = <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>;
                              cardBorder = 'border-amber-200 bg-amber-50/20 shadow-sm';
                            } else if (stepStatus === 'failed') {
                              ringClass = 'border-red-500 bg-red-500 text-white';
                              icon = (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              );
                              cardBorder = 'border-red-100 bg-red-50/20';
                            }

                            return (
                              <div key={stage} className="relative group">
                                {/* Step Bullet Ring */}
                                <span className={`absolute -left-[31px] top-1.5 w-6.5 h-6.5 rounded-full border-2 flex items-center justify-center transition-all z-10 ${ringClass}`}>
                                  {icon}
                                </span>

                                {/* Step details card */}
                                <div className={`border rounded-2xl p-4 transition-all ${cardBorder}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                                      {title}
                                    </h4>
                                    {details?.timestamp ? (
                                      <span className="text-[9px] text-slate-450 font-bold bg-white/80 border border-slate-100 px-2 py-0.5 rounded">
                                        {new Date(details.timestamp).toLocaleDateString()} at{' '}
                                        {new Date(details.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-slate-400 font-bold bg-white/40 border border-slate-100/50 px-2 py-0.5 rounded">
                                        Pending
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-xs text-slate-500 font-medium mt-1">
                                    {description}
                                  </p>

                                  {/* Operator / Action Details */}
                                  {details && (
                                    <div className="mt-3 pt-2.5 border-t border-slate-100/50 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-450">
                                      <span className="flex items-center gap-1 text-slate-500">
                                        <UserIcon className="w-3 h-3 text-slate-400" />
                                        By: {details.changedBy}
                                      </span>
                                      {details.notes && (
                                        <span className="text-slate-400 italic font-medium max-w-[150px] truncate">
                                          "{details.notes}"
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    </div>

                    {/* History Feed and Actions on Right (md:col-span-5) */}
                    <div className="md:col-span-5 space-y-6">
                      {/* Direct Quick Actions Box */}
                      <Card className="p-5">
                        <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">
                          Quick Lead Updates
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
                              Transition Pipeline Stage
                            </label>
                            <select
                              value={normalizeStatus(activeTimelineLead.status)}
                              onChange={(e) => handleStatusChange(activeTimelineLead, e.target.value)}
                              className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer"
                            >
                              {LEAD_STAGES.map(stage => (
                                <option key={stage} value={stage}>{stage}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
                              Follow-up Notes / Remarks
                            </label>
                            <textarea
                              value={activeTimelineLead.remarks || ''}
                              onChange={(e) => {
                                if (onUpdateServiceRequest) {
                                  onUpdateServiceRequest({ ...activeTimelineLead, remarks: e.target.value });
                                }
                              }}
                              placeholder="Type progress update, reminders or appointment logistics..."
                              rows={3}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            ></textarea>
                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                              Updates are saved securely in cloud database logs.
                            </p>
                          </div>
                        </div>
                      </Card>

                      {/* Timeline Log Feed */}
                      <Card className="p-5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                            CRM Activity Feed
                          </h3>
                          <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full font-mono">
                            {leadLogs.length} Events
                          </span>
                        </div>

                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                          {leadLogs.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                              <Clock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                              <p className="text-[10px] font-bold">No registered events yet</p>
                            </div>
                          ) : (
                            [...leadLogs]
                              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                              .map((log) => {
                                let changeLabel: string = log.changeType;
                                let labelColor = "bg-slate-50 border-slate-100 text-slate-500";
                                if (log.changeType === 'STATUS') {
                                  changeLabel = `${log.oldValue} → ${log.newValue}`;
                                  labelColor = "bg-indigo-50 border-indigo-100 text-indigo-700";
                                } else if (log.changeType === 'ASSIGNMENT') {
                                  changeLabel = `Assigned to ${log.newValue}`;
                                  labelColor = "bg-amber-50 border-amber-100 text-amber-700";
                                } else if (log.changeType === 'REMARKS') {
                                  changeLabel = "Remarks Updated";
                                  labelColor = "bg-sky-50 border-sky-100 text-sky-700";
                                } else if (log.changeType === 'CREATE') {
                                  changeLabel = "Lead Created";
                                  labelColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
                                }

                                return (
                                  <div key={log.id} className="border border-slate-100 bg-slate-50/30 p-3 rounded-xl space-y-1.5">
                                    <div className="flex items-center justify-between text-[9px] font-bold">
                                      <span className="text-slate-400">
                                        {new Date(log.timestamp).toLocaleDateString()} at_ {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      <span className="text-slate-400">by {log.changedBy}</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-800 leading-snug">
                                      {log.notes || `${log.changeType} modification logged.`}
                                    </p>
                                    <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 border rounded ${labelColor}`}>
                                      {changeLabel}
                                    </span>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </Card>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'PRODUCTIVITY' && (
        <AgentProductivityDashboard
          leads={serviceRequests}
          users={users}
          activeHubs={activeHubs || []}
          onSelectRepFilter={(repName) => {
            setAssignedAgentFilter(repName);
            setActiveTab('BOARD');
          }}
          onOpenLeadDetail={(lead) => {
            setSelectedLead(lead);
          }}
        />
      )}

      {/* CRM Lead Details Modal/Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-indigo-700 font-extrabold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  CRM Detail File
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">{selectedLead.customerName}</h3>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex px-6 border-b border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setModalActiveTab('info')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                  modalActiveTab === 'info'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Lead Info & Status
              </button>
              <button
                onClick={() => setModalActiveTab('history')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                  modalActiveTab === 'history'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Lead History ({auditLogs.filter(log => log.leadId === selectedLead.id).length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {modalActiveTab === 'history' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                      Chronological Lead History
                    </h4>
                    <span className="text-[10px] text-slate-400 font-bold uppercase bg-slate-100 px-2.5 py-1 rounded-full">
                      {auditLogs.filter(log => log.leadId === selectedLead.id).length} events logged
                    </span>
                  </div>

                  {auditLogs.filter(log => log.leadId === selectedLead.id).length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-500">No history events logged for this lead yet.</p>
                      <p className="text-[10px] text-slate-400 mt-1">Changes to status, remarks, or agent assignment will be recorded.</p>
                    </div>
                  ) : (
                    <div className="relative border-l border-slate-200 pl-6 ml-4 space-y-6">
                      {auditLogs
                        .filter(log => log.leadId === selectedLead.id)
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .map((log) => {
                          let badgeColor = "bg-slate-100 text-slate-700";
                          let icon = <Clock className="w-3.5 h-3.5 text-slate-500" />;
                          if (log.changeType === 'STATUS') {
                            badgeColor = "bg-indigo-50 text-indigo-700 border border-indigo-100";
                            icon = <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin-slow" />;
                          } else if (log.changeType === 'ASSIGNMENT') {
                            badgeColor = "bg-amber-50 text-amber-700 border border-amber-100";
                            icon = <UserIcon className="w-3.5 h-3.5 text-amber-600" />;
                          } else if (log.changeType === 'REMARKS') {
                            badgeColor = "bg-blue-50 text-blue-700 border border-blue-100";
                            icon = <MessageSquare className="w-3.5 h-3.5 text-blue-600" />;
                          } else if (log.changeType === 'CREATE') {
                            badgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                            icon = <Plus className="w-3.5 h-3.5 text-emerald-600" />;
                          }

                          return (
                            <div key={log.id} className="relative">
                              {/* Point icon */}
                              <span className="absolute -left-[37px] top-0 rounded-full p-1.5 bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                                {icon}
                              </span>

                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                    {log.changeType}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-bold">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>

                                <p className="text-xs font-bold text-slate-800">
                                  {log.notes || `${log.changeType} updated`}
                                </p>

                                {log.changeType === 'STATUS' && (
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-white px-2 py-1.25 rounded-lg border border-slate-100">
                                    <span className="text-slate-400 font-medium">Changed:</span>
                                    <span className="line-through text-slate-400">{log.oldValue}</span>
                                    <span className="text-indigo-600">→</span>
                                    <span className="text-indigo-700 font-extrabold">{log.newValue}</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold pt-1">
                                  <UserIcon className="w-3 h-3 text-slate-300" />
                                  <span>Logged by: {log.changedBy}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Quick Conversion Notice if not converted */}
                  {selectedLead.status !== 'CONVERTED' && onConvertLeadToService && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-extrabold text-emerald-900 uppercase">Lead conversion available</h4>
                        <p className="text-[11px] text-emerald-800 font-medium">Ready to fulfill this customer request? Convert it into an active service order immediately.</p>
                      </div>
                      <button
                        onClick={() => {
                          onConvertLeadToService(selectedLead.id);
                          setSelectedLead(null);
                        }}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs whitespace-nowrap shadow-sm transition-all hover:scale-105 active:scale-95"
                      >
                        Convert into Active Order
                      </button>
                    </div>
                  )}

                  {/* Status Selector & Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          CRM Pipeline Stage
                        </label>
                        <select
                          value={normalizeStatus(selectedLead.status)}
                          onChange={(e) => handleStatusChange(selectedLead, e.target.value)}
                          className="w-full px-3.5 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 cursor-pointer"
                        >
                          {LEAD_STAGES.map(stage => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Customer Phone
                        </label>
                        <div className="flex items-center gap-2 text-slate-700 font-semibold bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-sm">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {selectedLead.customerPhone || 'No Phone provided'}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Service Interested In
                        </label>
                        <div className="text-slate-700 font-semibold bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-sm">
                          {selectedLead.requestedService || 'Meta Lead'}
                        </div>
                      </div>

                      {/* Assigned Agent dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Assigned Agent
                        </label>
                        <select
                          value={selectedLead.assignedAgent || ''}
                          onChange={(e) => setSelectedLead({ ...selectedLead, assignedAgent: e.target.value })}
                          className="w-full px-3.5 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer text-slate-700"
                        >
                          <option value="">Unassigned</option>
                          {users.map(u => (
                            <option key={u.username} value={u.username}>
                              {u.username} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Booking / Reminder Date
                        </label>
                        <input
                          type="date"
                          value={selectedLead.bookingReminderDate || ''}
                          onChange={(e) => setSelectedLead({ ...selectedLead, bookingReminderDate: e.target.value })}
                          className="w-full px-3.5 py-2 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
                        />
                      </div>

                      {/* Vehicle details */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Vehicle & Model
                        </label>
                        <div className="text-slate-700 font-semibold bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-sm">
                          {selectedLead.carBrand || selectedLead.carModel ? (
                            `${selectedLead.carBrand || ''} ${selectedLead.carModel || ''}`.trim()
                          ) : (
                            'No vehicle details'
                          )}
                        </div>
                      </div>

                      {/* Street Address */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          Customer Street Address
                        </label>
                        <div className="text-slate-700 font-semibold bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-sm flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                          <span>{selectedLead.streetAddress || 'No address specified'}</span>
                        </div>
                        {(() => {
                          const distInfo = getLeadHubDistanceInfo(selectedLead, activeHubs);
                          if (!distInfo) return null;
                          return (
                            <div className="mt-2 text-xs font-bold text-indigo-800 bg-indigo-50 px-3.5 py-2 rounded-xl border border-indigo-100 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                                Hub Distance ({distInfo.hubName}):
                              </span>
                              <span className="font-extrabold text-indigo-950">{distInfo.distanceKm.toFixed(1)} km</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Marketing Metadata */}
                  {selectedLead.campaignName && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Meta Ads Campaign Metadata</h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-bold uppercase">Campaign Name:</span>
                          <p className="font-bold text-indigo-900 mt-0.5">{selectedLead.campaignName}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold uppercase">Ad Name:</span>
                          <p className="font-bold text-indigo-900 mt-0.5">{selectedLead.adName || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold uppercase">Form Name:</span>
                          <p className="font-bold text-slate-800 mt-0.5">{selectedLead.formName || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold uppercase">Platform / Source:</span>
                          <p className="font-bold text-slate-800 mt-0.5 uppercase">{selectedLead.platform || 'fb'} • {selectedLead.leadSource || selectedLead.source}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Remarks Textarea */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Follow-up Notes / Remarks
                    </label>
                    <textarea
                      value={selectedLead.remarks || ''}
                      onChange={(e) => setSelectedLead({ ...selectedLead, remarks: e.target.value })}
                      placeholder="Enter custom remarks, call backs details or appointment notes here..."
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm font-medium"
                    ></textarea>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-3xl">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRemarksAndReminder}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95"
              >
                Save CRM Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MANUAL TICKET / LEAD MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  Manual CRM Entry
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">Create Ticket / Lead</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateLead} className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-6 space-y-4">
                {/* Customer Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Customer Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newLeadForm.customerName}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, customerName: e.target.value })}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Customer Phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newLeadForm.customerPhone}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, customerPhone: e.target.value })}
                      placeholder="e.g. +919876543210"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Pipeline & Source */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Lead Source
                    </label>
                    <select
                      value={newLeadForm.source}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, source: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold cursor-pointer"
                    >
                      <option value="Meta">Meta (Facebook/Instagram)</option>
                      <option value="Website">Website</option>
                      <option value="Google Ads">Google Ads</option>
                      <option value="Organic">Organic Search</option>
                      <option value="Referral">Referral / Reference</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Initial CRM Stage
                    </label>
                    <select
                      value={newLeadForm.status}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, status: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold cursor-pointer"
                    >
                      {LEAD_STAGES.map(stage => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Vehicle Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Car Brand
                    </label>
                    <input
                      type="text"
                      value={newLeadForm.carBrand}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, carBrand: e.target.value })}
                      placeholder="e.g. Maruti Suzuki"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Car Model
                    </label>
                    <input
                      type="text"
                      value={newLeadForm.carModel}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, carModel: e.target.value })}
                      placeholder="e.g. Swift Dzire"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Car Reg No
                    </label>
                    <input
                      type="text"
                      value={newLeadForm.carRegNo}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, carRegNo: e.target.value })}
                      placeholder="e.g. MH12AB1234"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Service Interest & Value */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Service Interested In
                    </label>
                    <input
                      type="text"
                      value={newLeadForm.requestedService}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, requestedService: e.target.value })}
                      placeholder="e.g. Car Polish / Pressure Washing"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Estimated Value (INR)
                    </label>
                    <input
                      type="number"
                      value={newLeadForm.totalAmount}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, totalAmount: e.target.value })}
                      placeholder="e.g. 1500"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Booking reminder date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Booking / Reminder Date
                    </label>
                    <input
                      type="date"
                      value={newLeadForm.bookingReminderDate}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, bookingReminderDate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                      Marketing Campaign Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newLeadForm.campaignName}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, campaignName: e.target.value })}
                      placeholder="e.g. Monsoon Offer 2026"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Street Address */}
                <div>
                  <GoogleAddressAutocomplete
                    label="Street Address (Google Maps Autocomplete)"
                    value={newLeadForm.streetAddress}
                    onChange={(val) => setNewLeadForm({ ...newLeadForm, streetAddress: val })}
                    placeholder="Search street, locality or landmark..."
                  />
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Lead Remarks / Follow-up Notes
                  </label>
                  <textarea
                    value={newLeadForm.remarks}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, remarks: e.target.value })}
                    placeholder="Write initial call summary, specific requirements or contact instructions..."
                    rows={2}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 text-sm font-semibold"
                  ></textarea>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95"
                >
                  Capture & Create Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subsheets Manager Modal */}
      {isSubsheetsModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <SettingsIcon className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Manage Meta Lead Subsheets / Tabs</h3>
                  <p className="text-xs text-slate-500 font-medium">Configure subsheets to fetch leads from multiple tabs</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubsheetsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Diagnose & Auto-detect tabs buttons */}
              <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    Sheet Connection & Subsheets
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDiagnoseSheet}
                      disabled={isDiagnosingSheet}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-slate-100 font-bold text-xs rounded-xl transition-all shadow-xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Info className={`w-3.5 h-3.5 ${isDiagnosingSheet ? 'animate-spin' : ''}`} />
                      {isDiagnosingSheet ? 'Checking...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoDiscoverSubsheets}
                      disabled={isDiscoveringSubsheets}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isDiscoveringSubsheets ? 'animate-spin' : ''}`} />
                      {isDiscoveringSubsheets ? 'Discovering...' : 'Detect Tabs'}
                    </button>
                  </div>
                </div>

                {sheetDiagResult && (
                  <div className={`p-3 rounded-xl text-xs font-medium border ${
                    sheetDiagResult.requiresAuth
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : sheetDiagResult.isAccessible
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      {sheetDiagResult.requiresAuth ? '⚠️ Action Required: Restricted Permissions' : sheetDiagResult.isAccessible ? '✓ Public Access Verified' : 'Notice'}
                    </div>
                    <p className="text-[11px] leading-relaxed">{sheetDiagResult.message}</p>
                    {sheetDiagResult.requiresAuth && (
                      <div className="mt-2 text-[10px] space-y-1 bg-white/60 p-2 rounded-lg border border-rose-200">
                        <p className="font-bold text-rose-900">How to fix Google Sheet access:</p>
                        <ol className="list-decimal list-inside text-rose-800 space-y-0.5">
                          <li>Open your Google Sheet</li>
                          <li>Click the <strong>Share</strong> button (top-right corner)</li>
                          <li>Under <strong>General access</strong>, change from <em>Restricted</em> to <strong>Anyone with the link</strong> (Role: Viewer)</li>
                          <li>Click <strong>Done</strong>, then click <em>Test Connection</em> above</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                  Scans your configured Google Sheet for all public tabs (e.g., "Meta Leads", "Instagram Ads", "Facebook Ads", "Sheet1").
                </p>
              </div>

              {/* Discovered Tab Pills */}
              {discoveredSubsheets.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                    Discovered Sheet Tabs (Click to add)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {discoveredSubsheets.map(tab => {
                      const isSelected = customSubsheetsInput.split(',').map(s => s.trim().toLowerCase()).includes(tab.toLowerCase());
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            const currentList = customSubsheetsInput.split(',').map(s => s.trim()).filter(Boolean);
                            if (isSelected) {
                              const filtered = currentList.filter(s => s.toLowerCase() !== tab.toLowerCase());
                              setCustomSubsheetsInput(filtered.join(', '));
                            } else {
                              currentList.push(tab);
                              setCustomSubsheetsInput(currentList.join(', '));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '} {tab}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom comma-separated input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Subsheet Tab Names (Comma Separated)
                </label>
                <input
                  type="text"
                  value={customSubsheetsInput}
                  onChange={(e) => setCustomSubsheetsInput(e.target.value)}
                  placeholder="e.g. Meta Leads, Instagram, Facebook Ads"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm font-semibold"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1">
                  Leave empty to sync all tabs automatically, or list exact tab names separated by commas.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSubsheetsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSubsheetsConfig}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
              >
                Save Subsheets Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Performance & Speed Optimization Modal */}
      {isSyncPerformanceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl shadow-xs">
                  <Zap className="w-6 h-6 text-indigo-600 fill-indigo-600" />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    Sync Performance & Time Saved
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                      Optimization Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Speed & time saved using <code className="text-indigo-600 font-mono font-bold">last_sync_timestamp</code> incremental logic
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSyncPerformanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hero Stats Card */}
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-xl border border-indigo-800/60 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <Zap className="w-36 h-36 text-amber-300" />
              </div>

              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Last Sync Efficiency Report
                  </span>
                  <span className="text-xs font-mono bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-700/50 text-indigo-200">
                    {syncPerformanceStats?.mode === 'full' ? 'Full Re-sync Mode' : 'Incremental Mode'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Rows Skipped</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-3xl font-black text-amber-400">
                        {syncPerformanceStats ? syncPerformanceStats.rowsSkipped : 0}
                      </p>
                      <span className="text-xs text-slate-300 font-semibold">rows</span>
                    </div>
                    <p className="text-[10px] text-slate-300 mt-1 font-medium">Filtered out via last_sync_timestamp</p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Time Saved</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <p className="text-3xl font-black text-emerald-400">
                        {syncPerformanceStats && syncPerformanceStats.estimatedTimeSavedMs > 0
                          ? `${(syncPerformanceStats.estimatedTimeSavedMs / 1000).toFixed(2)}s`
                          : '0.00s'}
                      </p>
                      <span className="text-xs text-emerald-300 font-semibold">saved</span>
                    </div>
                    <p className="text-[10px] text-slate-300 mt-1 font-medium">Saved processing & DB writes</p>
                  </div>
                </div>

                {/* Efficiency Bar */}
                {syncPerformanceStats && syncPerformanceStats.totalRowsEvaluated > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-slate-300">Sheet Row Filter Efficiency</span>
                      <span className="text-amber-300">
                        {Math.round((syncPerformanceStats.rowsSkipped / syncPerformanceStats.totalRowsEvaluated) * 100)}% skipped
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden p-0.5 border border-slate-700">
                      <div 
                        className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.round((syncPerformanceStats.rowsSkipped / syncPerformanceStats.totalRowsEvaluated) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl text-center">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Evaluated</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">
                  {syncPerformanceStats?.totalRowsEvaluated ?? 0}
                </p>
                <p className="text-[9px] text-slate-500 font-semibold">Total Sheet Rows</p>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-2xl text-center">
                <p className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">Rows Skipped</p>
                <p className="text-lg font-black text-amber-800 mt-0.5">
                  {syncPerformanceStats?.rowsSkipped ?? 0}
                </p>
                <p className="text-[9px] text-amber-700 font-semibold">Filtered Out</p>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl text-center">
                <p className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">Imported / Updated</p>
                <p className="text-lg font-black text-emerald-800 mt-0.5">
                  +{syncPerformanceStats?.newLeadsImported ?? 0} / {syncPerformanceStats?.leadsUpdated ?? 0}
                </p>
                <p className="text-[9px] text-emerald-700 font-semibold">Leads Processed</p>
              </div>

              <div className="bg-indigo-50/80 border border-indigo-200 p-3 rounded-2xl text-center">
                <p className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider">Fetch Duration</p>
                <p className="text-lg font-black text-indigo-800 mt-0.5">
                  {syncPerformanceStats?.syncDurationMs ?? 0} ms
                </p>
                <p className="text-[9px] text-indigo-700 font-semibold">Execution Time</p>
              </div>
            </div>

            {/* Technical Explanation Card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-slate-800 font-extrabold">
                <Info className="w-4 h-4 text-indigo-600" />
                How <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">last_sync_timestamp</code> Optimization Works
              </div>
              <p className="text-slate-600 leading-relaxed font-medium text-[11px]">
                In <strong>Incremental Mode</strong>, the fetch process checks each spreadsheet lead's timestamp against the latest recorded timestamp in the database (<span className="font-mono text-slate-800 font-bold">{syncPerformanceStats?.lastSyncTimestamp ? new Date(syncPerformanceStats.lastSyncTimestamp).toLocaleString() : 'Active'}</span>). Older rows are skipped before data transformation or database calls occur, cutting down sync overhead and eliminating duplicate writes.
              </p>
            </div>

            {/* Footer & Manual Triggers */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {onSyncMetaLeads && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onSyncMetaLeads('incremental');
                    }}
                    disabled={isSyncingMetaLeads}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMetaLeads ? 'animate-spin' : ''}`} />
                    Run Incremental Sync
                  </button>
                )}
                {onSyncMetaLeads && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onSyncMetaLeads('full');
                    }}
                    disabled={isSyncingMetaLeads}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Run Full Re-sync
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsSyncPerformanceModalOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Routing Modal */}
      {isSmartRoutingModalOpen && (
        <LeadSmartRoutingModal
          leads={serviceRequests}
          users={users}
          activeHubs={activeHubs || []}
          onClose={() => setIsSmartRoutingModalOpen(false)}
          onApplyRouting={async (routingUpdates) => {
            const applyToast = toast.loading(`Applying smart routing for ${routingUpdates.length} leads...`);
            try {
              for (const update of routingUpdates) {
                const targetLead = serviceRequests.find(l => l.id === update.leadId);
                if (targetLead && onUpdateServiceRequest) {
                  await onUpdateServiceRequest({
                    ...targetLead,
                    ...(update.hubId ? { assignedHubId: update.hubId } : {}),
                    ...(update.assignedAgent ? { assignedAgent: update.assignedAgent } : {})
                  });
                }
              }
              toast.success(`Successfully smart-routed ${routingUpdates.length} leads!`, { id: applyToast });
              setIsSmartRoutingModalOpen(false);
            } catch (err) {
              console.error(err);
              toast.error('Failed to apply smart routing', { id: applyToast });
            }
          }}
        />
      )}

      {/* Deduplication Modal */}
      {isDeduplicationModalOpen && (
        <LeadDeduplicationModal
          leads={serviceRequests}
          onClose={() => setIsDeduplicationModalOpen(false)}
          onMergeLeads={async (primaryLead, duplicateIdsToArchive) => {
            const mergeToast = toast.loading('Merging and archiving duplicate leads...');
            try {
              if (onUpdateServiceRequest) {
                // Update primary lead
                await onUpdateServiceRequest(primaryLead);
                // Archive duplicate leads
                for (const dupId of duplicateIdsToArchive) {
                  const dupLead = serviceRequests.find(l => l.id === dupId);
                  if (dupLead) {
                    await onUpdateServiceRequest({
                      ...dupLead,
                      isArchived: true,
                      remarks: `${dupLead.remarks || ''} [Merged into ${primaryLead.id}]`.trim()
                    });
                  }
                }
              }
              toast.success(`Merged and archived ${duplicateIdsToArchive.length} duplicate leads!`, { id: mergeToast });
            } catch (err) {
              console.error(err);
              toast.error('Failed to merge duplicate leads', { id: mergeToast });
            }
          }}
        />
      )}

      {/* Webhook & Lead Ads Ingestion Modal */}
      {isWebhookModalOpen && (
        <LeadWebhookModal
          onClose={() => setIsWebhookModalOpen(false)}
          onSimulateWebhookLead={async (leadData) => {
            if (onCaptureLead) {
              await onCaptureLead({
                customerName: leadData.customerName || 'Inbound Lead',
                customerPhone: leadData.customerPhone || '',
                requestedService: leadData.requestedService || 'General Service Inquiry',
                source: leadData.source || 'Meta',
                carBrand: leadData.carBrand || '',
                carModel: leadData.carModel || '',
                totalAmount: leadData.totalAmount || 0,
                status: 'CREATED',
                remarks: leadData.remarks || 'Captured via Inbound Webhook Simulator'
              });
              toast.success('Inbound webhook lead captured successfully!');
            }
          }}
        />
      )}

      {/* 1-Click Lead-to-Order Conversion Wizard Modal */}
      {conversionWizardLead && (
        <LeadConversionWizardModal
          lead={conversionWizardLead}
          activeHubs={activeHubs || []}
          users={users}
          onClose={() => setConversionWizardLead(null)}
          onConfirmConversion={async (convertedData) => {
            const convToast = toast.loading('Converting lead into confirmed booking...');
            try {
              if (onUpdateServiceRequest) {
                await onUpdateServiceRequest({
                  ...conversionWizardLead,
                  customerName: convertedData.customerName,
                  customerPhone: convertedData.customerPhone,
                  streetAddress: convertedData.serviceAddress,
                  carBrand: convertedData.carBrand,
                  carModel: convertedData.carModel,
                  carRegNo: convertedData.carRegNo,
                  requestedService: convertedData.requestedService,
                  totalAmount: convertedData.totalAmount,
                  bookingReminderDate: convertedData.appointmentDate,
                  assignedHubId: convertedData.assignedHubId,
                  assignedAgent: convertedData.assignedTechnician || conversionWizardLead.assignedAgent,
                  status: 'CONVERTED',
                  remarks: `${conversionWizardLead.remarks || ''}\n[Converted via Wizard: ${convertedData.appointmentDate} ${convertedData.appointmentSlot}]`.trim()
                });
              }
              if (onConvertLeadToService) {
                await onConvertLeadToService(conversionWizardLead.id);
              }
              toast.success('Lead converted to confirmed job successfully!', { id: convToast });
              setConversionWizardLead(null);
            } catch (err) {
              console.error(err);
              toast.error('Failed to convert lead', { id: convToast });
            }
          }}
        />
      )}

      {/* Lead Timeline & Disposition Drawer */}
      {timelineDrawerLead && (
        <LeadTimelineDrawer
          lead={timelineDrawerLead}
          allLeads={serviceRequests}
          onClose={() => setTimelineDrawerLead(null)}
          stages={['CREATED', 'CONTACTED', 'FOLLOW UP', 'HIGH INTENT', 'CONVERTED', 'NOT CONTACTABLE']}
          activeHubs={activeHubs || []}
          users={users}
          onUpdateLead={async (updated) => {
            if (onUpdateServiceRequest) {
              await onUpdateServiceRequest(updated);
            }
            setTimelineDrawerLead(updated);
          }}
          onOpenConvertWizard={(leadToConvert) => {
            setTimelineDrawerLead(null);
            setConversionWizardLead(leadToConvert);
          }}
          onOpenWhatsAppModal={(leadForWhatsApp) => {
            setWhatsAppModalLead(leadForWhatsApp);
          }}
        />
      )}

      {/* WhatsApp Quick Message Modal */}
      {whatsAppModalLead && (
        <LeadWhatsAppModal
          lead={whatsAppModalLead}
          onClose={() => setWhatsAppModalLead(null)}
        />
      )}

      {/* Salesforce-Inspired CRM Batch Floating Action Bar */}
      <LeadBatchActionBar
        selectedLeadIds={selectedLeadIds}
        allLeads={serviceRequests}
        onBatchStatusChange={handleBatchStatusChange}
        onBatchAssignAgent={handleBatchAssignAgent}
        onBatchArchive={handleBatchArchive}
        onBatchMerge={() => setIsDeduplicationModalOpen(true)}
        onClearSelection={() => setSelectedLeadIds([])}
        onBatchCall={handleBatchCall}
        onBatchConvert={handleBatchConvert}
        onBatchSnooze={handleBatchSnooze}
        onBatchAddNote={handleBatchAddNote}
        availableAgents={users.map(u => u.name || u.email || 'Agent')}
        leadStages={LEAD_STAGES}
      />

      {/* Salesforce CRM Batch Snooze Modal */}
      {isBatchSnoozeOpen && (
        <LeadBatchSnoozeModal
          selectedLeads={actionModalLeads}
          onClose={() => setIsBatchSnoozeOpen(false)}
          onConfirmSnooze={handleConfirmSnooze}
        />
      )}

      {/* Salesforce CRM Batch Add Note Modal */}
      {isBatchNoteOpen && (
        <LeadBatchNoteModal
          selectedLeads={actionModalLeads}
          onClose={() => setIsBatchNoteOpen(false)}
          onConfirmAddNote={handleConfirmAddNote}
        />
      )}

      {/* Salesforce CRM Batch Call Queue & Dialer Modal */}
      {isBatchCallOpen && (
        <LeadBatchCallModal
          selectedLeads={actionModalLeads}
          onClose={() => setIsBatchCallOpen(false)}
          onUpdateLeadStatus={async (leadId, newStatus, remarkNote) => {
            const target = serviceRequests.find(l => l.id === leadId);
            if (target && onUpdateServiceRequest) {
              await onUpdateServiceRequest({
                ...target,
                status: newStatus,
                remarks: `${target.remarks || ''}\n${remarkNote}`.trim()
              });
            }
          }}
        />
      )}
    </div>
  );
};

export default ServiceRequestPage;
