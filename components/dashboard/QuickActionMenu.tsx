import React, { useState } from 'react';
import { 
  IconPlus, 
  IconX, 
  IconUsers, 
  IconCalendar, 
  IconRefresh, 
  IconSparkles, 
  IconClipboardList
} from '../ui/Icon';
import { toast } from 'sonner';

export interface QuickActionMenuProps {
  onCreateLead?: () => void;
  onViewAppointments?: () => void;
  onSyncInventory?: () => Promise<void> | void;
  onCreateOrder?: () => void;
  onOpenAiAssistant?: () => void;
}

export const QuickActionMenu: React.FC<QuickActionMenuProps> = ({
  onCreateLead,
  onViewAppointments,
  onSyncInventory,
  onCreateOrder,
  onOpenAiAssistant,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleAction = async (actionFn?: () => Promise<void> | void, label?: string) => {
    setIsOpen(false);
    if (!actionFn) return;

    if (label === 'sync') {
      setIsSyncing(true);
      toast.info('Initiating Realtime Inventory & Cloud Synchronization...');
      try {
        await actionFn();
        toast.success('Inventory & Cloud data synced successfully!');
      } catch (err) {
        toast.error('Sync failed. Retrying with local cache...');
      } finally {
        setIsSyncing(false);
      }
    } else {
      actionFn();
    }
  };

  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-50 no-print flex-col items-end">
      {/* Backdrop overlay when menu is open */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-950/30 backdrop-blur-xs z-40 animate-fade-in"
        />
      )}

      {/* Floating Speed Dial Actions Menu */}
      {isOpen && (
        <div className="relative z-50 flex flex-col items-end space-y-2.5 mb-3 animate-in slide-in-from-bottom-3 duration-200">
          {/* Action 1: Create New Lead */}
          {onCreateLead && (
            <div className="flex items-center gap-2.5 group">
              <span className="bg-slate-900/95 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md backdrop-blur-md transition-all group-hover:bg-slate-800">
                Create New Lead
              </span>
              <button
                type="button"
                onClick={() => handleAction(onCreateLead)}
                className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95"
                title="Capture / Create New Lead"
              >
                <IconUsers className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action 2: View Today's Appointments */}
          {onViewAppointments && (
            <div className="flex items-center gap-2.5 group">
              <span className="bg-slate-900/95 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md backdrop-blur-md transition-all group-hover:bg-slate-800">
                Today's Appointments
              </span>
              <button
                type="button"
                onClick={() => handleAction(onViewAppointments)}
                className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95"
                title="View Today's Appointments"
              >
                <IconCalendar className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action 3: Sync Inventory & Data */}
          {onSyncInventory && (
            <div className="flex items-center gap-2.5 group">
              <span className="bg-slate-900/95 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md backdrop-blur-md transition-all group-hover:bg-slate-800">
                Sync Inventory & Data
              </span>
              <button
                type="button"
                onClick={() => handleAction(onSyncInventory, 'sync')}
                disabled={isSyncing}
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95"
                title="Sync Inventory & Cloud Database"
              >
                <IconRefresh className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}

          {/* Action 4: Create New Order / Job Card */}
          {onCreateOrder && (
            <div className="flex items-center gap-2.5 group">
              <span className="bg-slate-900/95 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md backdrop-blur-md transition-all group-hover:bg-slate-800">
                New Job Order
              </span>
              <button
                type="button"
                onClick={() => handleAction(onCreateOrder)}
                className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95"
                title="Create New Service Order"
              >
                <IconClipboardList className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action 5: AI Garage Assistant */}
          {onOpenAiAssistant && (
            <div className="flex items-center gap-2.5 group">
              <span className="bg-slate-900/95 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md backdrop-blur-md transition-all group-hover:bg-slate-800">
                AI Service Assistant
              </span>
              <button
                type="button"
                onClick={() => handleAction(onOpenAiAssistant)}
                className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95"
                title="Open AI Assistant"
              >
                <IconSparkles className="w-4 h-4 text-amber-300" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Trigger Floating Action Button */}
      <button
        type="button"
        onClick={toggleMenu}
        className={`relative z-50 flex items-center justify-center gap-2 px-3.5 h-10 rounded-full font-semibold text-xs text-white bg-slate-900 hover:bg-slate-800 shadow-lg border border-slate-700/80 transition-all duration-200 active:scale-95 ${
          isOpen ? 'bg-slate-800 border-slate-600 ring-2 ring-slate-500/20' : ''
        }`}
        aria-label="Agent Quick Action Menu"
      >
        {isOpen ? (
          <>
            <IconX className="w-4 h-4 text-slate-200" />
            <span>Close</span>
          </>
        ) : (
          <>
            <IconSparkles className="w-4 h-4 text-amber-400" />
            <span>Quick Actions</span>
          </>
        )}
      </button>
    </div>
  );
};

export default QuickActionMenu;
