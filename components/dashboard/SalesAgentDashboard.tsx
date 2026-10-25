import React, { useState, useMemo } from 'react';
import { Service, User, ServiceRequest, AttendanceStatus, RetentionActivityLog } from '../../types';
import Button from '../ui/Button';
import { 
  IconPlus, 
  IconSearch, 
  IconUsers, 
  IconRetention, 
  IconPhone, 
  IconCheck, 
  IconClock, 
  IconCalendar, 
  IconClipboardList, 
  IconSparkles, 
  IconKey, 
  IconUserCheck, 
  IconUserOff, 
  IconExternalLink,
  IconArrowUp,
  IconX
} from '../ui/Icon';

interface SalesAgentDashboardProps {
  currentUser: User;
  allSubmissions: Service[];
  submissions: Service[];
  serviceRequests?: ServiceRequest[];
  retentionLogs?: RetentionActivityLog[];
  customerBook?: any[];
  onNewService?: () => void;
  onNavigate?: (view: any) => void;
  onUpdateAttendanceStatus?: (status: AttendanceStatus) => void;
  onOpenChangePassword?: () => void;
  setIsChatbotOpen?: (isOpen: boolean) => void;
  onCompleteOrder?: (service: Service) => void;
  onUpdateOrder?: (service: Service) => void;
  onSaveRetentionLog?: (log: RetentionActivityLog) => Promise<void>;
}

export const SalesAgentDashboard: React.FC<SalesAgentDashboardProps> = ({
  currentUser,
  allSubmissions = [],
  submissions = [],
  serviceRequests = [],
  retentionLogs = [],
  customerBook = [],
  onNewService,
  onNavigate,
  onUpdateAttendanceStatus,
  onOpenChangePassword,
  setIsChatbotOpen,
}) => {
  const [activeTab, setActiveTab] = useState<'MY_ORDERS' | 'RETENTION_QUEUE' | 'INBOUND_LEADS'>('MY_ORDERS');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  // Attendance tracking
  const isCheckedIn = currentUser.attendanceStatus === 'CHECKED_IN';
  const handleAttendanceToggle = () => {
    if (onUpdateAttendanceStatus) {
      onUpdateAttendanceStatus(isCheckedIn ? 'CHECKED_OUT' : 'CHECKED_IN');
    }
  };

  // Orders booked or submitted by this sales agent
  const myOrders = useMemo(() => {
    const username = currentUser.username?.toLowerCase();
    return allSubmissions.filter(s => {
      const submittedBy = (s.submittedBy || '').toLowerCase();
      const assignedTo = (s.assignedTo || '').toLowerCase();
      const secondaryAssignee = (s.secondaryAssignee || '').toLowerCase();
      return submittedBy === username || assignedTo === username || secondaryAssignee === username;
    });
  }, [allSubmissions, currentUser.username]);

  // Filtered orders based on search and status
  const filteredMyOrders = useMemo(() => {
    return myOrders.filter(order => {
      if (statusFilter === 'ACTIVE' && (order.status === 'Completed' || order.status === 'Cancelled')) return false;
      if (statusFilter === 'COMPLETED' && order.status !== 'Completed') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const fullName = `${order.customerFirstName || ''} ${order.customerLastName || ''}`.toLowerCase();
      const mobile = String(order.mobileNumber || '').toLowerCase();
      const carNum = String(order.carNumber || '').toLowerCase();
      const model = String(order.carBrandModel || '').toLowerCase();
      const services = (order.serviceSelection || []).join(' ').toLowerCase();

      return (
        fullName.includes(q) ||
        mobile.includes(q) ||
        carNum.includes(q) ||
        model.includes(q) ||
        services.includes(q)
      );
    });
  }, [myOrders, statusFilter, searchQuery]);

  // Performance calculations
  const totalRevenueBooked = useMemo(() => {
    return myOrders.reduce((acc, curr) => acc + (Number(curr.grandTotal) || Number(curr.carwashTotalAmount) || Number(curr.carCareTotalAmount) || 0), 0);
  }, [myOrders]);

  const completedOrdersCount = useMemo(() => {
    return myOrders.filter(o => o.status === 'Completed').length;
  }, [myOrders]);

  const activeOrdersCount = useMemo(() => {
    return myOrders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length;
  }, [myOrders]);

  // Inbound leads awaiting follow-up
  const pendingLeads = useMemo(() => {
    return serviceRequests.filter(sr => sr.status === 'PENDING' || sr.status === 'CONTACTED');
  }, [serviceRequests]);

  // Retention follow-up queue
  const retentionQueue = useMemo(() => {
    return customerBook.slice(0, 15);
  }, [customerBook]);

  const handleWhatsAppCustomer = (phone: string, customerName: string) => {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const text = encodeURIComponent(`Hi ${customerName || 'Valued Customer'}, greetings from Big Engine Autocare! Following up regarding your vehicle service enquiry.`);
    window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
  };

  const handleCallCustomer = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. SALES AGENT ROLE BANNER & QUICK CONTROLS */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-7 text-white shadow-xl border border-indigo-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 shadow-xs">
                <span>📈</span> Sales & Retention Agent
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${isCheckedIn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                <span className={`w-2 h-2 rounded-full ${isCheckedIn ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                <span>{isCheckedIn ? 'On Duty (Checked In)' : 'Off Duty (Checked Out)'}</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Welcome, {currentUser.username}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Drive customer retention, follow up with inbound leads, manage customer bookings, and track your monthly sales targets.
            </p>
          </div>

          {/* Action buttons on header */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap flex-shrink-0">
            {onUpdateAttendanceStatus && (
              <button
                type="button"
                onClick={handleAttendanceToggle}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${isCheckedIn ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
              >
                {isCheckedIn ? <IconUserOff className="w-4 h-4" /> : <IconUserCheck className="w-4 h-4" />}
                <span>{isCheckedIn ? 'Check Out' : 'Check In for Duty'}</span>
              </button>
            )}

            {onOpenChangePassword && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                title="Change your login password"
              >
                <IconKey className="w-3.5 h-3.5 text-brand-accent" />
                <span>Change Password</span>
              </button>
            )}

            {setIsChatbotOpen && (
              <button
                type="button"
                onClick={() => setIsChatbotOpen(true)}
                className="p-2 rounded-xl text-xs font-bold bg-indigo-600/60 hover:bg-indigo-600 text-white border border-indigo-400/40 flex items-center gap-1.5 transition-colors"
                title="AI Sales Copilot"
              >
                <IconSparkles className="w-4 h-4 text-amber-300" />
              </button>
            )}
          </div>
        </div>

        {/* Sales Performance Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">Total Bookings</span>
            <div className="text-xl sm:text-2xl font-black text-white">{myOrders.length}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{completedOrdersCount} completed</div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">Active Pipeline</span>
            <div className="text-xl sm:text-2xl font-black text-white">{activeOrdersCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Orders in progress</div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block mb-1">Revenue Booked</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">₹{totalRevenueBooked.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">From closed orders</div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-sky-300 uppercase tracking-wider block mb-1">Web Leads Waiting</span>
            <div className="text-xl sm:text-2xl font-black text-sky-400">{pendingLeads.length}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Need customer call</div>
          </div>
        </div>
      </div>

      {/* 2. HIGH-PRIORITY QUICK ACTIONS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {onNewService && (
          <button
            type="button"
            onClick={onNewService}
            className="p-4 bg-white rounded-xl border border-indigo-200 hover:border-indigo-400 shadow-xs hover:shadow-md transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white flex items-center justify-center mb-2.5 transition-colors">
              <IconPlus className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">New Service Order</h4>
            <p className="text-xs text-slate-500 mt-0.5">Book customer car service</p>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate && onNavigate('CUSTOMER_HISTORY')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white flex items-center justify-center mb-2.5 transition-colors">
            <IconUsers className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Customer History</h4>
          <p className="text-xs text-slate-500 mt-0.5">Look up past vehicle services</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate && onNavigate('RETENTION')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white flex items-center justify-center mb-2.5 transition-colors">
            <IconRetention className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">Retention Desk</h4>
          <p className="text-xs text-slate-500 mt-0.5">Winback & follow-up queue</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate && onNavigate('SERVICE_REQUEST')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 group-hover:bg-amber-600 text-amber-600 group-hover:text-white flex items-center justify-center mb-2.5 transition-colors">
            <IconClipboardList className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 group-hover:text-amber-600 transition-colors">Web Leads ({pendingLeads.length})</h4>
          <p className="text-xs text-slate-500 mt-0.5">Inbound online bookings</p>
        </button>
      </div>

      {/* 3. WORKSPACE TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/80 px-4 pt-3 overflow-x-auto gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('MY_ORDERS')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'MY_ORDERS' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <IconClipboardList className="w-4 h-4" />
            <span>My Bookings & Orders</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {myOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RETENTION_QUEUE')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'RETENTION_QUEUE' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <IconPhone className="w-4 h-4" />
            <span>Retention Follow-up Queue</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
              {retentionQueue.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INBOUND_LEADS')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'INBOUND_LEADS' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <IconCalendar className="w-4 h-4" />
            <span>Inbound Web Leads</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800">
              {pendingLeads.length}
            </span>
          </button>
        </div>

        {/* Tab 1: My Bookings & Orders */}
        {activeTab === 'MY_ORDERS' && (
          <div className="p-4 sm:p-6 space-y-4">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search customer, mobile, car model..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600">
                    <IconX className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Status:</span>
                {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${statusFilter === st ? 'bg-brand-blue text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Completed'}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            {filteredMyOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-600">No orders found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {searchQuery ? 'Try changing your search keywords or resetting status filters.' : 'You have not booked any orders yet. Click "New Service Order" above to create your first booking!'}
                </p>
                {onNewService && !searchQuery && (
                  <Button onClick={onNewService} className="mt-4 bg-brand-blue text-white text-xs font-bold">
                    <IconPlus className="w-4 h-4 mr-1" />
                    Create First Booking
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredMyOrders.map(order => {
                  const amount = Number(order.grandTotal) || Number(order.carwashTotalAmount) || Number(order.carCareTotalAmount) || 0;
                  const isDone = order.status === 'Completed';
                  const isCancel = order.status === 'Cancelled';
                  const orderId = order.submissionId || order.appointmentId || 'ORDER';
                  const custName = `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim() || 'Customer';
                  const custMobile = order.mobileNumber || '';
                  const orderDate = order.timestamp;
                  const serviceName = order.serviceSelection?.join(', ') || 'Car Service';

                  return (
                    <div key={orderId} className="py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{custName}</span>
                          <span className="text-xs text-slate-500 font-mono">({custMobile || 'No Phone'})</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isDone ? 'bg-emerald-100 text-emerald-800' : isCancel ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                            {order.status || 'Active'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                          <span className="font-semibold text-slate-700">🚗 {order.carNumber || ''} {order.carBrandModel || ''}</span>
                          <span className="text-slate-300">•</span>
                          <span>🔧 {serviceName}</span>
                          {orderDate && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400">📅 {new Date(orderDate).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <div className="text-sm font-black text-slate-900">₹{amount.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400">Order ID: #{orderId.slice(-8)}</div>
                        </div>

                        {/* Customer Direct WhatsApp & Call Buttons */}
                        <div className="flex items-center gap-1.5">
                          {custMobile && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleWhatsAppCustomer(custMobile, custName)}
                                className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                                title="WhatsApp Customer"
                              >
                                💬
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCallCustomer(custMobile)}
                                className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                title="Call Customer"
                              >
                                <IconPhone className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Retention Follow-up Queue */}
        {activeTab === 'RETENTION_QUEUE' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Retention & Service Due Queue</h3>
                <p className="text-xs text-slate-500">Reach out to existing customers to schedule periodic maintenance.</p>
              </div>
              <Button 
                onClick={() => onNavigate && onNavigate('RETENTION')}
                variant="secondary"
                size="sm"
                className="text-xs font-bold"
              >
                Open Retention Desk
              </Button>
            </div>

            {retentionQueue.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-600">No overdue customers right now</p>
                <p className="text-xs text-slate-400 mt-1">All customer service schedules are currently up to date.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {retentionQueue.map((item, idx) => (
                  <div key={item.id || idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{item.name || item.customerName || 'Valued Customer'}</span>
                        <span className="text-xs text-slate-500 font-mono">{item.mobile || item.phone || ''}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.carNumber ? `Vehicle: ${item.carNumber} • ` : ''}Last serviced: {item.lastServiceDate || 'Recent'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {(item.mobile || item.phone) && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleWhatsAppCustomer(item.mobile || item.phone, item.name || item.customerName)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                          >
                            <span>WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCallCustomer(item.mobile || item.phone)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                          >
                            <IconPhone className="w-3 h-3" />
                            <span>Call</span>
                          </button>
                        </>
                      )}
                      {onNewService && (
                        <button
                          type="button"
                          onClick={onNewService}
                          className="px-3 py-1.5 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <IconPlus className="w-3 h-3" />
                          <span>Book</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Inbound Leads */}
        {activeTab === 'INBOUND_LEADS' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Inbound Website Leads</h3>
                <p className="text-xs text-slate-500">Contact new prospects who submitted requests on the website.</p>
              </div>
              <Button 
                onClick={() => onNavigate && onNavigate('SERVICE_REQUEST')}
                variant="secondary"
                size="sm"
                className="text-xs font-bold"
              >
                View All Leads
              </Button>
            </div>

            {pendingLeads.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-600">No pending web leads</p>
                <p className="text-xs text-slate-400 mt-1">All website enquiries have been attended to.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingLeads.map(lead => (
                  <div key={lead.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{lead.customerName || 'Customer'}</span>
                        <span className="text-xs text-slate-500 font-mono">{lead.customerPhone}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {lead.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Package: <span className="font-semibold text-slate-800">{lead.requestedService || 'General Service'}</span> • Location: {lead.streetAddress || 'Local'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleWhatsAppCustomer(lead.customerPhone, lead.customerName)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors"
                      >
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCallCustomer(lead.customerPhone)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                      >
                        <IconPhone className="w-3 h-3" />
                        <span>Call</span>
                      </button>
                      {onNewService && (
                        <button
                          type="button"
                          onClick={onNewService}
                          className="px-3 py-1.5 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <IconPlus className="w-3 h-3" />
                          <span>Convert to Order</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesAgentDashboard;
