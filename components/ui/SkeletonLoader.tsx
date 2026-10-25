import React from 'react';

interface SkeletonLoaderProps {
  type?: 'dashboard' | 'table' | 'analytics' | 'settings' | 'map' | 'generic';
  view?: string;
}

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" id="skeleton-dashboard">
      {/* 4 Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-slate-200 rounded-md"></div>
              <div className="h-8 w-8 rounded-lg bg-slate-100"></div>
            </div>
            <div className="h-7 w-16 bg-slate-300 rounded-md"></div>
            <div className="h-3 w-32 bg-slate-200 rounded-md"></div>
          </div>
        ))}
      </div>

      {/* Main Grid: two column content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex justify-between items-center pb-2">
              <div className="h-5 w-44 bg-slate-300 rounded-md"></div>
              <div className="h-8 w-24 bg-slate-100 rounded-md"></div>
            </div>
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-100"></div>
                  <div className="space-y-2">
                    <div className="h-4 w-36 bg-slate-200 rounded-md"></div>
                    <div className="h-3 w-24 bg-slate-100 rounded-md"></div>
                  </div>
                </div>
                <div className="h-6 w-16 bg-slate-100 rounded-full"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar panels */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 shadow-xs">
            <div className="h-5 w-32 bg-slate-300 rounded-md mb-2"></div>
            <div className="h-32 bg-slate-100 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-200 rounded-md"></div>
              <div className="h-3 w-5/6 bg-slate-100 rounded-md"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse" id="skeleton-table">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3.5 border border-slate-100 rounded-xl">
        <div className="h-9 w-full sm:w-64 bg-slate-100 rounded-lg"></div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-slate-200 rounded-lg"></div>
          <div className="h-9 w-24 bg-slate-300 rounded-lg"></div>
        </div>
      </div>

      {/* Table Structure */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="bg-slate-50/70 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="h-4 w-28 bg-slate-300 rounded-md"></div>
          <div className="flex space-x-8">
            <div className="h-4 w-20 bg-slate-200 rounded-md hidden md:block"></div>
            <div className="h-4 w-20 bg-slate-200 rounded-md hidden sm:block"></div>
            <div className="h-4 w-16 bg-slate-200 rounded-md"></div>
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-50">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-5 w-5 bg-slate-100 rounded"></div>
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded-md"></div>
                  <div className="h-3 w-28 bg-slate-100 rounded-md"></div>
                </div>
              </div>
              <div className="flex items-center space-x-8">
                <div className="h-4 w-24 bg-slate-100 rounded-md hidden md:block"></div>
                <div className="h-5 w-20 bg-slate-200 rounded-full hidden sm:block"></div>
                <div className="h-8 w-8 bg-slate-100 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AnalyticsSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" id="skeleton-analytics">
      {/* Date selector and filters header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-slate-100 rounded-xl">
        <div className="space-y-2">
          <div className="h-5 w-48 bg-slate-300 rounded-md"></div>
          <div className="h-3 w-64 bg-slate-100 rounded-md"></div>
        </div>
        <div className="h-9 w-40 bg-slate-200 rounded-lg"></div>
      </div>

      {/* Grid of Key Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex justify-between items-center pb-2">
            <div className="h-5 w-36 bg-slate-300 rounded-md"></div>
            <div className="h-8 w-16 bg-slate-100 rounded-md"></div>
          </div>
          <div className="h-56 bg-slate-50/80 rounded-lg border border-slate-100 flex items-end justify-between p-4 pt-12">
            {[35, 65, 45, 80, 55, 95, 75, 85, 40, 60, 50, 70].map((h, idx) => (
              <div key={idx} className="w-6 sm:w-8 bg-slate-200 rounded-t-sm" style={{ height: `${h}%` }}></div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex justify-between items-center pb-2">
            <div className="h-5 w-40 bg-slate-300 rounded-md"></div>
            <div className="h-8 w-24 bg-slate-100 rounded-md"></div>
          </div>
          <div className="h-56 bg-slate-50/80 rounded-lg border border-slate-100 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border-12 border-slate-200 relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-pulse" id="skeleton-settings">
      {/* Left Navigation Stack */}
      <div className="md:col-span-1 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-slate-100 rounded-lg"></div>
        ))}
      </div>

      {/* Main Content Pane */}
      <div className="md:col-span-3 bg-white border border-slate-100 rounded-xl p-6 space-y-6 shadow-xs">
        <div className="space-y-2 border-b border-slate-50 pb-4">
          <div className="h-6 w-48 bg-slate-300 rounded-md"></div>
          <div className="h-3.5 w-80 bg-slate-100 rounded-md"></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-slate-200 rounded-md"></div>
              <div className="h-9 w-full bg-slate-50 rounded-lg border border-slate-100"></div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-200 rounded-md"></div>
          <div className="h-24 w-full bg-slate-50 rounded-lg border border-slate-100"></div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
          <div className="h-9 w-24 bg-slate-100 rounded-lg"></div>
          <div className="h-9 w-32 bg-slate-300 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
};

export const MapSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse" id="skeleton-map">
      <div className="flex justify-between items-center bg-white p-3.5 border border-slate-100 rounded-xl">
        <div className="h-5 w-32 bg-slate-300 rounded-md"></div>
        <div className="h-9 w-36 bg-slate-200 rounded-lg"></div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl p-2 shadow-xs">
        <div className="h-[550px] w-full bg-slate-100 rounded-lg flex items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="h-8 w-8 bg-slate-200 rounded-full mx-auto animate-bounce"></div>
            <div className="h-4 w-44 bg-slate-200 rounded-md mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GenericSkeleton: React.FC = () => {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 animate-pulse shadow-xs" id="skeleton-generic">
      <div className="h-5 w-48 bg-slate-300 rounded-md"></div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-100 rounded-md"></div>
        <div className="h-3 w-5/6 bg-slate-100 rounded-md"></div>
        <div className="h-3 w-4/5 bg-slate-100 rounded-md"></div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="h-10 bg-slate-50 rounded-lg"></div>
        <div className="h-10 bg-slate-50 rounded-lg"></div>
      </div>
    </div>
  );
};

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ type, view }) => {
  let selectedType = type;

  if (!selectedType && view) {
    const viewUpper = view.toUpperCase();
    if (viewUpper === 'DASHBOARD') {
      selectedType = 'dashboard';
    } else if (
      ['LIST', 'CUSTOMER_BOOK', 'SERVICE_CATALOG', 'HUB_MANAGEMENT', 'EXPENSES', 'ERP_MANAGEMENT', 'CUSTOMER_HISTORY', 'APPOINTMENTS_OVERVIEW', 'SERVICE_REQUEST', 'SERVICE_TEMPLATE_MANAGEMENT', 'TRASH'].includes(viewUpper)
    ) {
      selectedType = 'table';
    } else if (['ANALYTICS', 'PROFIT_LOSS'].includes(viewUpper)) {
      selectedType = 'analytics';
    } else if (['SETTINGS', 'WARRANTY_TRACKER', 'RETENTION', 'ATTENDANCE_MANAGEMENT', 'USER_MANAGEMENT'].includes(viewUpper)) {
      selectedType = 'settings';
    } else if (viewUpper === 'LIVE_MAP') {
      selectedType = 'map';
    } else {
      selectedType = 'generic';
    }
  }

  const renderSkeleton = () => {
    switch (selectedType) {
      case 'dashboard':
        return <DashboardSkeleton />;
      case 'table':
        return <TableSkeleton />;
      case 'analytics':
        return <AnalyticsSkeleton />;
      case 'settings':
        return <SettingsSkeleton />;
      case 'map':
        return <MapSkeleton />;
      default:
        return <GenericSkeleton />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Beautiful localized shimmer loading status bar */}
      <div className="flex items-center gap-3 bg-brand-blue/5 border border-brand-blue/10 rounded-xl p-3.5 shadow-2xs">
        <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-brand-blue/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-t-brand-blue animate-spin"></div>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-black text-slate-700 tracking-wide block">Smart Optimizing & Slicing View...</span>
          <p className="text-[10px] text-slate-400 truncate">Sourcing lightweight local datasets & assets from secure partitions</p>
        </div>
      </div>
      
      {/* Content skeleton mockup */}
      {renderSkeleton()}
    </div>
  );
};

export default SkeletonLoader;
