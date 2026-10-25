import React, { createContext, useContext, useMemo } from 'react';
import { User, Permission, AttendanceStatus, NotificationPreferences } from '../types';
import authService, { getDefaultPermissionsForRole, isSalesAgentUser, isTechnicianUser, isAdminOrManagerUser, isAssignableTechnician } from '../services/authService';

export interface AuthContextType {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  loginError: string;
  setLoginError: React.Dispatch<React.SetStateAction<string>>;
  login: (username: string, password?: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: Permission | string) => boolean;
  updateUsers: (allUsers: User[]) => void;
  updateAttendanceStatus: (
    username: string,
    status: AttendanceStatus,
    coords?: { latitude: number; longitude: number },
    note?: string
  ) => void;
  adminOverrideAttendance: (
    username: string,
    status: AttendanceStatus,
    timestamp: string,
    note: string
  ) => void;
  updateNotificationPreferences: (username: string, prefs: NotificationPreferences) => void;
  isAdmin: boolean;
  isManager: boolean;
  isTechnician: boolean;
  isAgent: boolean;
  isSalesAgent: boolean;
  isAssignable: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
  value: AuthContextType;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, value }) => {
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
