import React, { createContext, useContext } from 'react';
import { User, Settings } from '../types';
import { SyncStatus } from '../components/ui/SyncStatusIndicator';

export interface AppContextType {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: Date | null;
  isDataHydrated: boolean;
  appIsLoading: boolean;
  unreadCount: number;
  onLogout: () => void;
  onRefresh: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export interface AppProviderProps {
  children: React.ReactNode;
  value: AppContextType;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, value }) => {
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = useAppContext;

export default AppContext;
