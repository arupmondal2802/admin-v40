import React from 'react';
import { motion } from 'motion/react';
import { User, Permission } from '../../types';
import { 
  IconLayoutDashboard, 
  IconClock, 
  IconMapPin, 
  IconClipboardList, 
  IconCalendar, 
  IconPlus, 
  IconMenu2, 
  IconBell
} from './Icon';
import { haptic } from '../../utils/haptics';

interface MobileBottomNavProps {
  currentUser: User;
  currentView: string;
  onNavigate: (view: any) => void;
  onNewService: () => void;
  onOpenMobileMenu: () => void;
  unreadCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onNewService,
  onOpenMobileMenu,
  unreadCount = 0,
}) => {
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // Define tab navigation based on role (4 primary tabs + 1 Menu drawer tab)
  const navItems = isAdminOrManager
    ? [
        { id: 'DASHBOARD', label: 'Dashboard', icon: <IconLayoutDashboard className="w-5 h-5" /> },
        { id: 'LIST', label: 'Services', icon: <IconClock className="w-5 h-5" /> },
        { id: 'LIVE_MAP', label: 'Fleet Map', icon: <IconMapPin className="w-5 h-5" /> },
        { id: 'SERVICE_REQUEST', label: 'Leads', icon: <IconClipboardList className="w-5 h-5" /> },
      ]
    : [
        { id: 'APPOINTMENTS_OVERVIEW', label: 'Schedule', icon: <IconCalendar className="w-5 h-5" /> },
        { id: 'DASHBOARD', label: 'Today', icon: <IconLayoutDashboard className="w-5 h-5" /> },
        { id: 'LIST', label: 'History', icon: <IconClock className="w-5 h-5" /> },
        { id: 'NOTIFICATIONS', label: 'Alerts', icon: <IconBell className="w-5 h-5" />, badge: unreadCount },
      ];

  return (
    <div 
      className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-40 md:hidden no-print pointer-events-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* High-contrast solid dark glass bar with clean symmetrical tab distribution */}
      <div className="w-full max-w-lg mx-auto bg-slate-950/98 backdrop-blur-2xl border-t border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.7)]">
        <nav 
          aria-label="Mobile Bottom Navigation"
          className="bottom-action-bar px-1.5 pt-1.5 pb-safe grid grid-cols-5 items-center relative"
        >
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  haptic.selection();
                  onNavigate(item.id);
                }}
                data-haptic="selection"
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-0.5 rounded-xl transition-all duration-200 relative select-none active:scale-95 ${
                  isActive
                    ? 'text-brand-accent font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                {isActive && (
                  <>
                    <motion.div
                      layoutId="activeBottomNavPill"
                      className="absolute inset-0 bg-brand-accent/15 border border-brand-accent/40 rounded-xl shadow-[0_0_12px_rgba(245,158,11,0.25)] -z-10"
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    />
                    {/* Subtle expanding ripple ring on selection */}
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0.8 }}
                      animate={{ scale: 1.4, opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="absolute inset-1 rounded-xl border border-brand-accent/60 pointer-events-none -z-10"
                    />
                    {/* Radiant center glow pulse */}
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0.6 }}
                      animate={{ scale: 1.2, opacity: 0 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="absolute w-8 h-8 rounded-full bg-brand-accent/30 pointer-events-none -z-10 blur-sm"
                    />
                  </>
                )}
                <motion.div 
                  animate={{ 
                    scale: isActive ? 1.15 : 1,
                    y: isActive ? -1 : 0
                  }}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`p-1 rounded-lg relative transition-colors duration-200 ${isActive ? 'text-brand-accent' : 'text-slate-400'}`}
                >
                  {item.icon}
                </motion.div>
                <motion.span 
                  animate={{ 
                    scale: isActive ? 1.05 : 1,
                    fontWeight: isActive ? 800 : 500
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`text-[11px] tracking-tight truncate max-w-full leading-none mt-0.5 transition-colors duration-200 ${isActive ? 'text-brand-accent' : 'text-slate-400'}`}
                >
                  {item.label}
                </motion.span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute top-1 right-2 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-slate-950 shadow-md animate-pulse">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Full Menu Drawer Toggle */}
          <button
            onClick={() => {
              haptic.light();
              onOpenMobileMenu();
            }}
            data-haptic="light"
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-0.5 rounded-xl text-slate-400 hover:text-slate-200 transition-all active:scale-95 select-none"
            aria-label="Open Navigation Drawer"
          >
            <div className="p-1 rounded-lg text-slate-400">
              <IconMenu2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight truncate max-w-full leading-none mt-0.5 text-slate-400 font-medium">
              Menu
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default MobileBottomNav;
