
import React, { useState } from 'react';
import { User, Permission } from '../../types';
import { 
  IconLayoutDashboard, IconClock, IconSettings, IconLogout, IconPlus, 
  IconChevronLeft, IconChevronRight, IconChevronDown, IconWorld, IconClipboardList, 
  IconMapPin, IconChartBar, IconSearch, IconRetention, IconCalendar, 
  IconUsers, IconFileAnalytics, IconTrash, IconFingerprint, IconSparkles,
  IconBell, IconShieldCheck, IconCloudUpload, IconDatabase, IconX, IconKey, IconMonitor
} from './Icon';
import { haptic } from '../../utils/haptics';

interface SidebarProps {
  currentUser: User;
  currentView: string;
  isMinimized: boolean;
  isOpenOnMobile: boolean;
  onNavigate: (view: any) => void;
  onNewService: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onToggleDesktop: () => void;
  onCloseMobile: () => void;
  logoUrl?: string;
  logoHasError: boolean;
  onLogoError: () => void;
  onOpenChangePassword?: () => void;
  onOpenDesktopInstall?: () => void;
}

interface NavLinkProps {
  icon: React.ReactElement;
  label: string;
  sectionTag?: string;
  isActive: boolean;
  isMinimized: boolean;
  onClick: () => void;
}

const NavLink: React.FC<NavLinkProps> = ({ icon, label, sectionTag, isActive, isMinimized, onClick }) => {
  const styledIcon = React.cloneElement(icon as React.ReactElement<any>, {
    className: `w-5 h-5 transition-transform duration-200 group-hover:scale-105`
  });

  return (
    <li className="relative list-none group">
      <button
        onClick={onClick}
        aria-label={label}
        className={`w-full flex items-center px-3.5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99] ${
          isActive
            ? 'text-amber-300 bg-amber-400/10 shadow-xs border border-amber-400/20'
            : 'text-slate-300 hover:text-white hover:bg-white/5'
        } ${isMinimized ? 'justify-center px-0' : ''}`}
      >
        {isActive && !isMinimized && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-brand-accent rounded-r-full shadow-[0_0_8px_rgba(248,191,42,0.6)]"></div>
        )}
        <div className={`
          flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 flex-shrink-0
          ${isActive 
            ? 'bg-brand-accent text-brand-blue shadow-md'
            : 'bg-white/5 group-hover:bg-white/10 text-slate-300'
          }`
        }>
          {styledIcon}
        </div>
        {!isMinimized && <span className="ml-3 truncate font-medium text-[13px]">{label}</span>}
      </button>

      {/* Enhanced Popover Tag Name for Minimized Mode on Desktop so user never gets lost */}
      {isMinimized && (
        <div className="fixed left-20 z-[100] hidden group-hover:flex items-center gap-2 bg-slate-900 border border-slate-700/90 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-2xl whitespace-nowrap pointer-events-none animate-in fade-in slide-in-from-left-2 duration-150">
          <span className="font-bold text-slate-100">{label}</span>
          {sectionTag && (
            <span className="text-[9px] uppercase px-2 py-0.5 rounded-full bg-brand-accent/20 text-brand-accent font-black tracking-wider border border-brand-accent/30">
              {sectionTag}
            </span>
          )}
        </div>
      )}
    </li>
  );
};

interface BranchHeaderProps {
  label: string;
  isExpanded: boolean;
  isMinimized: boolean;
  onToggle: () => void;
  count?: number;
}

const BranchHeader: React.FC<BranchHeaderProps> = ({ label, isExpanded, isMinimized, onToggle, count }) => {
  if (isMinimized) {
    return (
      <li className="relative group my-3 flex justify-center border-t border-white/10 pt-3">
        <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded tracking-widest">
          {label.substring(0, 3)}
        </span>
        <div className="fixed left-20 z-[100] hidden group-hover:flex items-center bg-slate-800 border border-slate-700 text-brand-accent text-xs font-black px-3 py-1.5 rounded-lg shadow-xl uppercase tracking-widest whitespace-nowrap pointer-events-none">
          Branch: {label}
        </div>
      </li>
    );
  }

  return (
    <li className="px-2 pt-3.5 pb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-150 group"
      >
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-black text-slate-400 group-hover:text-brand-accent uppercase tracking-wider transition-colors">
            {label}
          </span>
          {count !== undefined && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
              {count}
            </span>
          )}
        </div>
        <div className="text-slate-500 group-hover:text-white transition-transform duration-200">
          {isExpanded ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
        </div>
      </button>
    </li>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentView,
  isMinimized,
  isOpenOnMobile,
  onNavigate,
  onNewService,
  onOpenSettings,
  onLogout,
  onToggleDesktop,
  onCloseMobile,
  logoUrl,
  logoHasError,
  onLogoError,
  onOpenChangePassword,
  onOpenDesktopInstall,
}) => {
  const hasPermission = (p: Permission) => currentUser.permissions.includes(p);
  const isAdminOrManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const isAgentOrTech = currentUser.role === 'agent' || currentUser.role === 'technician';

  // Effective minimized status: mobile drawer is ALWAYS expanded with full labels and titles
  const effectiveMinimized = isMinimized && !isOpenOnMobile;

  // State for collapsible branch sections
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({
    OPERATIONS: true,
    INSIGHTS: true,
    FINANCE: true,
    ADMINISTRATION: true,
  });

  const toggleBranch = (key: string) => {
    haptic.light();
    setOpenBranches(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const canShowInsights = hasPermission(Permission.CAN_VIEW_ANALYTICS) || 
                         hasPermission(Permission.CAN_VIEW_CUSTOMER_HISTORY) || 
                         hasPermission(Permission.CAN_VIEW_LIVE_MAP) ||
                         hasPermission(Permission.CAN_VIEW_RETENTION_DASHBOARD);

  const canShowAdmin = hasPermission(Permission.CAN_MANAGE_USERS) || 
                      hasPermission(Permission.CAN_MANAGE_SERVICES) ||
                      hasPermission(Permission.CAN_VIEW_TRASH);

  const canShowFinance = hasPermission(Permission.CAN_LOG_EXPENSES) || 
                        hasPermission(Permission.CAN_MANAGE_SPEND_CATEGORIES);

  const canShowSettings = isAdminOrManager || 
                         hasPermission(Permission.CAN_EDIT_SETTINGS) ||
                         hasPermission(Permission.CAN_MANAGE_PRICING);

  const handleNavClick = (targetView: any) => {
    haptic.selection();
    onNavigate(targetView);
    if (isOpenOnMobile) {
      onCloseMobile();
    }
  };

  const handleNewServiceClick = () => {
    haptic.medium();
    onNewService();
    if (isOpenOnMobile) {
      onCloseMobile();
    }
  };

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 bg-[#071629] flex flex-col no-print border-r border-slate-800/90 shadow-2xl
    transition-transform transform md:transition-all md:transform-none duration-300 ease-in-out
    ${isOpenOnMobile ? 'translate-x-0 ring-1 ring-white/10' : '-translate-x-full'}
    ${effectiveMinimized ? 'md:w-20' : 'md:w-64'}
    w-72 sm:w-80 max-w-[85vw]
  `;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenOnMobile && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300 animate-in fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside 
        className={sidebarClasses}
        style={{
          paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="flex items-center justify-between h-20 border-b border-white/5 px-4 flex-shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="bg-white rounded-xl p-1.5 h-11 w-11 flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/20">
              {logoUrl && !logoHasError ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full rounded-lg object-cover" onError={onLogoError} />
              ) : (
                <img src="https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png" alt="A Big Engine" className="h-full w-full object-contain" />
              )}
            </div>
            {!effectiveMinimized && (
              <div className="whitespace-nowrap">
                <h1 className="text-lg font-black tracking-tighter uppercase leading-none">
                    <span className="text-white">A BIG </span><br/>
                    <span className="text-brand-accent">ENGINE</span>
                </h1>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {!effectiveMinimized && (
              <button 
                onClick={onToggleDesktop} 
                title="Minimize Sidebar" 
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors hidden md:block"
              >
                <IconChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Mobile Close Button (48x48 touch boundary) */}
            <button
              onClick={onCloseMobile}
              title="Close Menu"
              aria-label="Close navigation menu"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors md:hidden active:scale-95"
            >
              <IconX className="w-6 h-6 text-slate-300" />
            </button>
          </div>
        </div>

        <div className={`p-3.5 flex-shrink-0 ${effectiveMinimized ? 'flex justify-center' : ''}`}>
          {hasPermission(Permission.CAN_CREATE_ORDERS) && (
              <button 
                  onClick={handleNewServiceClick} 
                  title="Create New Order"
                  className={`flex items-center justify-center bg-brand-accent text-brand-blue font-black rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-accent/20 ${effectiveMinimized ? 'h-10 w-10' : 'w-full py-2.5 px-4'}`}
              >
                  <IconPlus className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
                  {!effectiveMinimized && <span className="ml-2 font-bold text-sm">New Service</span>}
              </button>
          )}
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto sidebar-scrollbar touch-pan-y">
          <ul className="space-y-1">
            {/* Operations Branch */}
            <BranchHeader 
              label="Operations" 
              isExpanded={openBranches.OPERATIONS} 
              isMinimized={effectiveMinimized} 
              onToggle={() => toggleBranch('OPERATIONS')}
              count={3}
            />
            {(openBranches.OPERATIONS || effectiveMinimized) && (
              <>
                {hasPermission(Permission.CAN_VIEW_DASHBOARD) && (
                  <NavLink icon={<IconLayoutDashboard />} label="Dashboard" sectionTag="Operations" isActive={currentView === 'DASHBOARD'} onClick={() => handleNavClick('DASHBOARD')} isMinimized={effectiveMinimized} />
                )}
                {isAgentOrTech && hasPermission(Permission.CAN_VIEW_APPOINTMENTS_OVERVIEW) && (
                   <NavLink icon={<IconCalendar />} label="My Schedule" sectionTag="Operations" isActive={currentView === 'APPOINTMENTS_OVERVIEW'} onClick={() => handleNavClick('APPOINTMENTS_OVERVIEW')} isMinimized={effectiveMinimized} />
                )}
                {hasPermission(Permission.CAN_VIEW_SERVICE_HISTORY) && (
                  <NavLink icon={<IconClock />} label="Service History" sectionTag="Operations" isActive={currentView === 'LIST'} onClick={() => handleNavClick('LIST')} isMinimized={effectiveMinimized} />
                )}
                {isAdminOrManager && (
                  <NavLink icon={<IconBell />} label="Service Reminders" sectionTag="Operations" isActive={currentView === 'NOTIFICATIONS'} onClick={() => handleNavClick('NOTIFICATIONS')} isMinimized={effectiveMinimized} />
                )}
              </>
            )}

            {/* Insights Branch */}
            {canShowInsights && (
              <>
                <BranchHeader 
                  label="Insights" 
                  isExpanded={openBranches.INSIGHTS} 
                  isMinimized={effectiveMinimized} 
                  onToggle={() => toggleBranch('INSIGHTS')}
                  count={8}
                />
                {(openBranches.INSIGHTS || effectiveMinimized) && (
                  <>
                    {hasPermission(Permission.CAN_VIEW_CUSTOMER_HISTORY) && (
                      <>
                        <NavLink icon={<IconSearch />} label="Customer Search" sectionTag="Insights" isActive={currentView === 'CUSTOMER_HISTORY'} onClick={() => handleNavClick('CUSTOMER_HISTORY')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconUsers />} label="Customer Book" sectionTag="Insights" isActive={currentView === 'CUSTOMER_BOOK'} onClick={() => handleNavClick('CUSTOMER_BOOK')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconShieldCheck />} label="Warranty Tracker" sectionTag="Insights" isActive={currentView === 'WARRANTY_TRACKER'} onClick={() => handleNavClick('WARRANTY_TRACKER')} isMinimized={effectiveMinimized} />
                      </>
                    )}
                    {hasPermission(Permission.CAN_VIEW_RETENTION_DASHBOARD) && <NavLink icon={<IconRetention />} label="Retention" sectionTag="Insights" isActive={currentView === 'RETENTION'} onClick={() => handleNavClick('RETENTION')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_ANALYTICS) && <NavLink icon={<IconChartBar />} label="Business Analytics" sectionTag="Insights" isActive={currentView === 'ANALYTICS'} onClick={() => handleNavClick('ANALYTICS')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_ANALYTICS) && <NavLink icon={<IconClipboardList />} label="ERP Hub" sectionTag="Insights" isActive={currentView === 'ERP_MANAGEMENT'} onClick={() => handleNavClick('ERP_MANAGEMENT')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_ANALYTICS) && <NavLink icon={<IconSparkles />} label="Inventory Forecast" sectionTag="Insights" isActive={currentView === 'INVENTORY_FORECASTING'} onClick={() => handleNavClick('INVENTORY_FORECASTING')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_PROFIT_LOSS) && <NavLink icon={<IconFileAnalytics />} label="Profit & Loss" sectionTag="Insights" isActive={currentView === 'PROFIT_LOSS'} onClick={() => handleNavClick('PROFIT_LOSS')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_LIVE_MAP) && <NavLink icon={<IconMapPin />} label="Fleet Tracker" sectionTag="Insights" isActive={currentView === 'LIVE_MAP'} onClick={() => handleNavClick('LIVE_MAP')} isMinimized={effectiveMinimized} />}
                  </>
                )}
              </>
            )}

            {/* Finance Branch */}
            {canShowFinance && (
              <>
                <BranchHeader 
                  label="Finance" 
                  isExpanded={openBranches.FINANCE} 
                  isMinimized={effectiveMinimized} 
                  onToggle={() => toggleBranch('FINANCE')}
                  count={1}
                />
                {(openBranches.FINANCE || effectiveMinimized) && (
                  <>
                    {(hasPermission(Permission.CAN_LOG_EXPENSES) || hasPermission(Permission.CAN_MANAGE_SPEND_CATEGORIES)) && (
                      <NavLink icon={<IconFileAnalytics />} label="Expenses" sectionTag="Finance" isActive={currentView === 'EXPENSES'} onClick={() => handleNavClick('EXPENSES')} isMinimized={effectiveMinimized} />
                    )}
                  </>
                )}
              </>
            )}

            {/* Administration Branch */}
            {canShowAdmin && (
              <>
                <BranchHeader 
                  label="Administration" 
                  isExpanded={openBranches.ADMINISTRATION} 
                  isMinimized={effectiveMinimized} 
                  onToggle={() => toggleBranch('ADMINISTRATION')}
                  count={7}
                />
                {(openBranches.ADMINISTRATION || effectiveMinimized) && (
                  <>
                    {hasPermission(Permission.CAN_MANAGE_USERS) && (
                      <>
                        <NavLink icon={<IconUsers />} label="Staff Access" sectionTag="Administration" isActive={currentView === 'USER_MANAGEMENT'} onClick={() => handleNavClick('USER_MANAGEMENT')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconFingerprint />} label="Attendance Log" sectionTag="Administration" isActive={currentView === 'ATTENDANCE_MANAGEMENT'} onClick={() => handleNavClick('ATTENDANCE_MANAGEMENT')} isMinimized={effectiveMinimized} />
                      </>
                    )}
                    {hasPermission(Permission.CAN_MANAGE_SERVICES) && (
                      <>
                        <NavLink icon={<IconWorld />} label="Forms & Fields" sectionTag="Administration" isActive={currentView === 'SERVICE_TEMPLATE_MANAGEMENT'} onClick={() => handleNavClick('SERVICE_TEMPLATE_MANAGEMENT')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconClipboardList />} label="Service Catalog" sectionTag="Administration" isActive={currentView === 'SERVICE_CATALOG'} onClick={() => handleNavClick('SERVICE_CATALOG')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconDatabase />} label="Car Database" sectionTag="Administration" isActive={currentView === 'CAR_DATABASE'} onClick={() => handleNavClick('CAR_DATABASE')} isMinimized={effectiveMinimized} />
                        <NavLink icon={<IconMapPin />} label="Hub Management" sectionTag="Administration" isActive={currentView === 'HUB_MANAGEMENT'} onClick={() => handleNavClick('HUB_MANAGEMENT')} isMinimized={effectiveMinimized} />
                      </>
                    )}
                    {hasPermission(Permission.CAN_VIEW_SERVICE_REQUESTS) && <NavLink icon={<IconClipboardList />} label="Web Leads" sectionTag="Administration" isActive={currentView === 'SERVICE_REQUEST'} onClick={() => handleNavClick('SERVICE_REQUEST')} isMinimized={effectiveMinimized} />}
                    {hasPermission(Permission.CAN_VIEW_TRASH) && <NavLink icon={<IconTrash />} label="Trash Bin" sectionTag="Administration" isActive={currentView === 'TRASH'} onClick={() => handleNavClick('TRASH')} isMinimized={effectiveMinimized} />}
                  </>
                )}
              </>
            )}
          </ul>
        </nav>

        <div className="flex-shrink-0 mt-auto bg-black/20">
          <ul className="p-3 space-y-1 border-t border-white/5">
            {onOpenDesktopInstall && (
              <NavLink 
                icon={<IconMonitor />} 
                label="Desktop App (.exe)" 
                sectionTag="System" 
                isActive={false} 
                onClick={() => {
                  haptic.light();
                  onOpenDesktopInstall();
                }} 
                isMinimized={effectiveMinimized} 
              />
            )}
            <NavLink icon={<IconCloudUpload />} label="Offline Sync Manager" sectionTag="System" isActive={currentView === 'OFFLINE_SYNC_MANAGER'} onClick={() => handleNavClick('OFFLINE_SYNC_MANAGER')} isMinimized={effectiveMinimized} />
            {canShowSettings && (
              <NavLink icon={<IconSettings />} label="Settings" sectionTag="System" isActive={currentView === 'SETTINGS'} onClick={() => handleNavClick('SETTINGS')} isMinimized={effectiveMinimized} />
            )}
            {onOpenChangePassword && (
              <NavLink 
                icon={<IconKey />} 
                label="Change Password" 
                sectionTag="Account" 
                isActive={false} 
                onClick={() => {
                  haptic.light();
                  onOpenChangePassword();
                }} 
                isMinimized={effectiveMinimized} 
              />
            )}
            <NavLink 
              icon={<IconLogout />} 
              label="Logout" 
              sectionTag="Account" 
              isActive={false} 
              onClick={() => {
                haptic.warning();
                onLogout();
              }} 
              isMinimized={effectiveMinimized} 
            />
          </ul>
          
          <div className="hidden md:flex items-center justify-center p-2 border-t border-white/5">
              <button
                  onClick={() => {
                    haptic.light();
                    onToggleDesktop();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-slate-400 hover:text-brand-accent bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                  title={effectiveMinimized ? 'Expand Sidebar (View All Page Tags)' : 'Collapse Sidebar'}
              >
                  {effectiveMinimized ? (
                    <>
                      <IconChevronRight className="w-5 h-5 text-brand-accent animate-pulse" />
                    </>
                  ) : (
                    <>
                      <IconChevronLeft className="w-4 h-4" />
                      <span>Collapse Menu</span>
                    </>
                  )}
              </button>
          </div>
        </div>
      </aside>
    </>
  );
};
