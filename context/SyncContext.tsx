import React, { createContext, useContext } from 'react';
import { Settings } from '../types';
import { SyncStatus } from '../components/ui/SyncStatusIndicator';

export interface SyncContextType {
  syncStatus: SyncStatus;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  syncError: string | null;
  setSyncError: React.Dispatch<React.SetStateAction<string | null>>;
  lastSyncedAt: Date | null;
  setLastSyncedAt: React.Dispatch<React.SetStateAction<Date | null>>;
  syncProgress: number;
  setSyncProgress: React.Dispatch<React.SetStateAction<number>>;
  syncStage: string;
  setSyncStage: React.Dispatch<React.SetStateAction<string>>;
  syncEntity: string;
  setSyncEntity: React.Dispatch<React.SetStateAction<string>>;
  isDataHydrated: boolean;
  setIsDataHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  appIsLoading: boolean;
  setAppIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isManualRefreshing: boolean;
  isPageSyncing: boolean;
  isSyncingWebsiteOrders: boolean;
  isSyncingMetaLeads: boolean;
  isSyncingWhatsAppLeads: boolean;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  saveSettings: (newSettings: Settings) => void;
  loadAndMergeData: (isBackground?: boolean, isManualRefresh?: boolean) => Promise<boolean | void>;
  handleManualRefresh: () => Promise<void>;
  handleForceCacheClear: () => Promise<void>;
  handlePageSync: (pageKey: string, isSilent?: boolean) => Promise<void>;
  syncWebsiteOrders: (mode?: 'incremental' | 'full') => Promise<void>;
  syncMetaLeads: (mode?: 'incremental' | 'full') => Promise<void>;
  syncWhatsAppLeads: (mode?: 'incremental' | 'full') => Promise<void>;
  syncAllLeads: (mode?: 'incremental' | 'full') => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export interface SyncProviderProps {
  children: React.ReactNode;
  value: SyncContextType;
}

export const SyncProvider: React.FC<SyncProviderProps> = ({ children, value }) => {
  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = (): SyncContextType => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

export default SyncContext;
