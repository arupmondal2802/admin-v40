import React, { useMemo, useState } from 'react';
import { AuditLog, Service, InventoryMovement, ServiceRequest } from '../../types';
import Card from '../ui/Card';
import { 
  Activity, 
  ShoppingBag, 
  PackageMinus, 
  UserCheck, 
  FileText, 
  Clock, 
  Sparkles, 
  Filter, 
  ArrowRight, 
  TrendingDown,
  Layers,
  Tag,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export interface ActivityFeedProps {
  auditLogs?: AuditLog[];
  submissions?: Service[];
  inventoryMovements?: InventoryMovement[];
  serviceRequests?: ServiceRequest[];
  limit?: number; // Default is 5
  title?: string;
  className?: string;
  onViewAll?: () => void;
}

export interface ActivityEvent {
  id: string;
  type: 'ORDER_CREATED' | 'INVENTORY_DEPLETED' | 'LEAD_STATUS_CHANGED' | 'AUDIT_LOG' | 'ORDER_STATUS_CHANGED';
  categoryLabel: 'Order Creation' | 'Inventory Depletion' | 'Lead Activity' | 'System Audit' | 'Order Status';
  title: string;
  description: string;
  actor: string;
  assignedTo?: string;
  timestamp: string; // ISO String
  relativeTime: string;
  badgeBg: string;
  badgeText: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}

// Utility function to format relative timestamps cleanly
const getRelativeTimeString = (isoString?: string): string => {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  auditLogs = [],
  submissions = [],
  inventoryMovements = [],
  serviceRequests = [],
  limit = 5,
  title = "Activity Feed",
  className = "",
  onViewAll
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ORDERS' | 'INVENTORY' | 'LEADS'>('ALL');
  const [showExpanded, setShowExpanded] = useState(false);

  // Synthesize and normalize all event streams into a unified chronological activity feed
  const combinedEvents = useMemo(() => {
    const events: ActivityEvent[] = [];

    // 1. Process explicit AuditLog items (using existing audit log data)
    auditLogs.forEach((log) => {
      let title = 'System Audit Event';
      let description = log.notes || `Log record #${log.id.slice(-6)}`;
      let categoryLabel: ActivityEvent['categoryLabel'] = 'System Audit';
      let type: ActivityEvent['type'] = 'AUDIT_LOG';
      let badgeBg = 'bg-blue-500/15 border-blue-500/30';
      let badgeText = 'text-blue-400';
      let iconBg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      let icon = <FileText className="w-4 h-4" />;

      if (log.changeType === 'STATUS') {
        type = 'LEAD_STATUS_CHANGED';
        categoryLabel = 'Lead Activity';
        title = `Lead Status Changed`;
        description = log.oldValue 
          ? `Status updated from "${log.oldValue}" to "${log.newValue}"`
          : `Status changed to "${log.newValue}"`;
        if (log.leadId) {
          description += ` (Lead #${log.leadId.slice(-6).toUpperCase()})`;
        }
        badgeBg = 'bg-purple-500/15 border-purple-500/30';
        badgeText = 'text-purple-400';
        iconBg = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
        icon = <UserCheck className="w-4 h-4" />;
      } else if (log.changeType === 'CREATE') {
        type = 'LEAD_STATUS_CHANGED';
        categoryLabel = 'Lead Activity';
        title = 'New Web Lead Captured';
        description = log.newValue ? `Captured new lead: "${log.newValue}"` : `New lead created (#${log.leadId.slice(-6).toUpperCase()})`;
        badgeBg = 'bg-indigo-500/15 border-indigo-500/30';
        badgeText = 'text-indigo-400';
        iconBg = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
        icon = <Sparkles className="w-4 h-4" />;
      } else if (log.changeType === 'ASSIGNMENT') {
        title = 'Agent Reassigned';
        description = `Assigned lead/order to ${log.newValue || 'agent'}`;
        badgeBg = 'bg-cyan-500/15 border-cyan-500/30';
        badgeText = 'text-cyan-400';
        iconBg = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
        icon = <Tag className="w-4 h-4" />;
      } else if (log.changeType === 'REMARKS') {
        title = 'Lead Remarks Added';
        description = `Note added: "${log.newValue}"`;
      }

      events.push({
        id: `audit_${log.id}`,
        type,
        categoryLabel,
        title,
        description,
        actor: log.changedBy || 'System',
        timestamp: log.timestamp || new Date().toISOString(),
        relativeTime: getRelativeTimeString(log.timestamp),
        badgeBg,
        badgeText,
        iconBg,
        iconColor: badgeText,
        icon
      });
    });

    // 2. Process Order Creations and Status Changes from Submissions
    submissions.forEach((sub) => {
      if (sub.isDeleted) return;

      // Event A: Order Creation
      const createdDate = sub.timestamp || new Date().toISOString();
      const customerName = `${sub.customerFirstName || ''} ${sub.customerLastName || ''}`.trim() || 'Valued Customer';
      const orderRef = sub.appointmentId || sub.submissionId.slice(-6).toUpperCase();
      
      events.push({
        id: `order_create_${sub.submissionId}`,
        type: 'ORDER_CREATED',
        categoryLabel: 'Order Creation',
        title: `New Order Created (#${orderRef})`,
        description: `Service booked for ${customerName} • ${sub.carBrandModel || 'Vehicle'} (${sub.serviceSelection?.slice(0, 2).join(', ') || 'Service'})`,
        actor: sub.submittedBy || 'Dispatch Agent',
        assignedTo: sub.assignedTo || undefined,
        timestamp: createdDate,
        relativeTime: getRelativeTimeString(createdDate),
        badgeBg: 'bg-emerald-500/15 border-emerald-500/30',
        badgeText: 'text-emerald-400',
        iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        iconColor: 'text-emerald-400',
        icon: <ShoppingBag className="w-4 h-4" />
      });

      // Event B: Order Completed / In Progress status transition
      if (sub.status === 'Completed' || sub.status === 'In Progress') {
        const isCompleted = sub.status === 'Completed';
        events.push({
          id: `order_status_${sub.submissionId}_${sub.status}`,
          type: 'ORDER_STATUS_CHANGED',
          categoryLabel: 'Order Status',
          title: isCompleted ? `Order Completed (#${orderRef})` : `Service Started (#${orderRef})`,
          description: isCompleted 
            ? `Job finished for ${customerName}. Bill total: ₹${(sub.grandTotal || 0).toLocaleString('en-IN')}`
            : `Technician ${sub.assignedTo || 'Staff'} commenced service on ${sub.carNumber || customerName}`,
          actor: sub.assignedTo || sub.submittedBy || 'Technician',
          assignedTo: sub.assignedTo || undefined,
          timestamp: createdDate, // Fallback to timestamp
          relativeTime: getRelativeTimeString(createdDate),
          badgeBg: isCompleted ? 'bg-emerald-500/15 border-emerald-500/30' : 'bg-blue-500/15 border-blue-500/30',
          badgeText: isCompleted ? 'text-emerald-400' : 'text-blue-400',
          iconBg: isCompleted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          iconColor: isCompleted ? 'text-emerald-400' : 'text-blue-400',
          icon: isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />
        });
      }
    });

    // 3. Process Inventory Depletions (and additions)
    inventoryMovements.forEach((mov) => {
      const isDepletion = mov.change < 0;
      const absQty = Math.abs(mov.change);
      const createdDate = mov.timestamp || new Date().toISOString();

      events.push({
        id: `inventory_${mov.id}`,
        type: 'INVENTORY_DEPLETED',
        categoryLabel: 'Inventory Depletion',
        title: isDepletion ? `Stock Depletion Alert` : `Stock Replenished`,
        description: isDepletion
          ? `Depleted ${absQty} ${mov.unit || 'units'} of "${mov.itemName}" (${mov.reason || 'Service execution'})`
          : `Added ${absQty} ${mov.unit || 'units'} of "${mov.itemName}" (${mov.reason || 'Restock'})`,
        actor: mov.createdBy || 'Inventory Admin',
        timestamp: createdDate,
        relativeTime: getRelativeTimeString(createdDate),
        badgeBg: isDepletion ? 'bg-amber-500/15 border-amber-500/30' : 'bg-teal-500/15 border-teal-500/30',
        badgeText: isDepletion ? 'text-amber-400' : 'text-teal-400',
        iconBg: isDepletion ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        iconColor: isDepletion ? 'text-amber-400' : 'text-teal-400',
        icon: isDepletion ? <PackageMinus className="w-4 h-4" /> : <Layers className="w-4 h-4" />
      });
    });

    // 4. Process Web Leads (Service Requests)
    serviceRequests.forEach((req) => {
      const reqDate = req.createdTime || req.requestDate || new Date().toISOString();
      events.push({
        id: `lead_req_${req.id}`,
        type: 'LEAD_STATUS_CHANGED',
        categoryLabel: 'Lead Activity',
        title: `Web Lead (${req.status || 'New'})`,
        description: `Customer ${req.customerName} requested "${req.requestedService}" for ${req.carBrand || 'Vehicle'} ${req.carModel || ''}`,
        actor: req.assignedAgent ? `Agent: ${req.assignedAgent}` : (req.source || 'Website'),
        timestamp: reqDate,
        relativeTime: getRelativeTimeString(reqDate),
        badgeBg: 'bg-purple-500/15 border-purple-500/30',
        badgeText: 'text-purple-400',
        iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        iconColor: 'text-purple-400',
        icon: <UserCheck className="w-4 h-4" />
      });
    });

    // Deduplicate by ID and sort descending by timestamp
    const uniqueMap = new Map<string, ActivityEvent>();
    events.forEach(e => {
      if (!uniqueMap.has(e.id)) {
        uniqueMap.set(e.id, e);
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  }, [auditLogs, submissions, inventoryMovements, serviceRequests]);

  // Apply user category filter
  const filteredEvents = useMemo(() => {
    return combinedEvents.filter(event => {
      if (filter === 'ORDERS') return event.type === 'ORDER_CREATED' || event.type === 'ORDER_STATUS_CHANGED';
      if (filter === 'INVENTORY') return event.type === 'INVENTORY_DEPLETED';
      if (filter === 'LEADS') return event.type === 'LEAD_STATUS_CHANGED';
      return true;
    });
  }, [combinedEvents, filter]);

  // Limit display to top N (default 5) unless showExpanded
  const activeLimit = showExpanded ? 20 : limit;
  const displayedEvents = filteredEvents.slice(0, activeLimit);

  return (
    <div className={`bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-gradient-to-tr from-blue-600/20 to-indigo-500/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base text-white tracking-tight">{title}</h3>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time feed of order creations, stock movements, and lead status changes
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('ORDERS')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filter === 'ORDERS'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Orders
          </button>
          <button
            onClick={() => setFilter('INVENTORY')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filter === 'INVENTORY'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setFilter('LEADS')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filter === 'LEADS'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Leads
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3">
        {displayedEvents.length > 0 ? (
          displayedEvents.map((event, index) => (
            <div
              key={event.id}
              className="group p-3.5 rounded-xl bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 transition-all duration-200 flex items-start gap-3.5 relative overflow-hidden"
            >
              {/* Event Category Icon */}
              <div className={`p-2.5 rounded-xl border flex-shrink-0 ${event.iconBg}`}>
                {event.icon}
              </div>

              {/* Content Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs font-extrabold text-white truncate group-hover:text-amber-300 transition-colors">
                      {event.title}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${event.badgeBg} ${event.badgeText}`}>
                      {event.categoryLabel}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap flex-shrink-0">
                    {event.relativeTime}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-snug line-clamp-2 font-normal">
                  {event.description}
                </p>

                {/* Actor / User footer */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/60 pt-1.5 flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Logged by: <strong className="text-slate-200 font-semibold">{event.actor}</strong>
                  </span>
                  {event.assignedTo && event.type === 'ORDER_CREATED' && (
                    <span className="font-medium text-slate-400 flex items-center gap-1">
                      • Assigned Tech: <strong className="text-amber-300 font-semibold">{event.assignedTo}</strong>
                    </span>
                  )}
                  <span className="font-mono text-slate-400 ml-auto">
                    {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
            <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">No recent system activity found</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              Events will appear here automatically as orders are created, inventory is updated, or lead statuses change.
            </p>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80">
        <span>
          Showing {displayedEvents.length} of {filteredEvents.length} events
        </span>

        {filteredEvents.length > limit && (
          <button
            type="button"
            onClick={() => setShowExpanded(!showExpanded)}
            className="font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline transition-colors"
          >
            <span>{showExpanded ? 'Show top 5 only' : `View all (${filteredEvents.length})`}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
