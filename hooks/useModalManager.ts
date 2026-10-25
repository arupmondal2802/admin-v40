import { useState, useCallback } from 'react';
import { Service, ServiceTemplate } from '../types';
import { useAndroidBackButton } from './useAndroidBackButton';

export interface ModalManagerState {
  summarizingService: Service | null;
  sharingService: Service | null;
  deletingService: Service | null;
  cancelingService: Service | null;
  isDiagnosticOverlayOpen: boolean;
  isNotificationHistoryOpen: boolean;
  isMobileMenuOpen: boolean;
  isSidebarMinimized: boolean;
  isChatbotOpen: boolean;
}

export interface ModalManagerActions {
  setSummarizingService: React.Dispatch<React.SetStateAction<Service | null>>;
  setSharingService: React.Dispatch<React.SetStateAction<Service | null>>;
  setDeletingService: React.Dispatch<React.SetStateAction<Service | null>>;
  setCancelingService: React.Dispatch<React.SetStateAction<Service | null>>;
  setIsDiagnosticOverlayOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNotificationHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSidebarMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatbotOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openSummaryModal: (service: Service) => void;
  closeSummaryModal: () => void;
  openShareModal: (service: Service) => void;
  closeShareModal: () => void;
  openDeleteModal: (service: Service) => void;
  closeDeleteModal: () => void;
  openCancelModal: (service: Service) => void;
  closeCancelModal: () => void;
  openDiagnosticOverlay: () => void;
  closeDiagnosticOverlay: () => void;
  toggleDiagnosticOverlay: () => void;
  toggleNotificationHistory: () => void;
  closeNotificationHistory: () => void;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleSidebar: () => void;
  closeAllModals: () => void;
}

export type UseModalManagerReturn = ModalManagerState & ModalManagerActions;

export function useModalManager(): UseModalManagerReturn {
  const [summarizingService, setSummarizingService] = useState<Service | null>(null);
  const [sharingService, setSharingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [cancelingService, setCancelingService] = useState<Service | null>(null);
  const [isDiagnosticOverlayOpen, setIsDiagnosticOverlayOpen] = useState<boolean>(false);
  const [isNotificationHistoryOpen, setIsNotificationHistoryOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(true);
  const [isChatbotOpen, setIsChatbotOpen] = useState<boolean>(false);

  const openSummaryModal = useCallback((service: Service) => {
    setSummarizingService(service);
  }, []);

  const closeSummaryModal = useCallback(() => {
    setSummarizingService(null);
  }, []);

  const openShareModal = useCallback((service: Service) => {
    setSharingService(service);
  }, []);

  const closeShareModal = useCallback(() => {
    setSharingService(null);
  }, []);

  const openDeleteModal = useCallback((service: Service) => {
    setDeletingService(service);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeletingService(null);
  }, []);

  const openCancelModal = useCallback((service: Service) => {
    setCancelingService(service);
  }, []);

  const closeCancelModal = useCallback(() => {
    setCancelingService(null);
  }, []);

  const openDiagnosticOverlay = useCallback(() => {
    setIsDiagnosticOverlayOpen(true);
  }, []);

  const closeDiagnosticOverlay = useCallback(() => {
    setIsDiagnosticOverlayOpen(false);
  }, []);

  const toggleDiagnosticOverlay = useCallback(() => {
    setIsDiagnosticOverlayOpen(prev => !prev);
  }, []);

  const toggleNotificationHistory = useCallback(() => {
    setIsNotificationHistoryOpen(prev => !prev);
  }, []);

  const closeNotificationHistory = useCallback(() => {
    setIsNotificationHistoryOpen(false);
  }, []);

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarMinimized(prev => !prev);
  }, []);

  const closeAllModals = useCallback(() => {
    setSummarizingService(null);
    setSharingService(null);
    setDeletingService(null);
    setCancelingService(null);
    setIsDiagnosticOverlayOpen(false);
    setIsNotificationHistoryOpen(false);
    setIsMobileMenuOpen(false);
    setIsChatbotOpen(false);
  }, []);

  const isAnyModalOpen = !!(
    summarizingService ||
    sharingService ||
    deletingService ||
    cancelingService ||
    isDiagnosticOverlayOpen ||
    isNotificationHistoryOpen ||
    isMobileMenuOpen ||
    isChatbotOpen
  );

  // Intercept Android back button to close any open modal/drawer before terminating app
  useAndroidBackButton(() => {
    if (summarizingService) {
      setSummarizingService(null);
      return true;
    }
    if (sharingService) {
      setSharingService(null);
      return true;
    }
    if (deletingService) {
      setDeletingService(null);
      return true;
    }
    if (cancelingService) {
      setCancelingService(null);
      return true;
    }
    if (isDiagnosticOverlayOpen) {
      setIsDiagnosticOverlayOpen(false);
      return true;
    }
    if (isChatbotOpen) {
      setIsChatbotOpen(false);
      return true;
    }
    if (isNotificationHistoryOpen) {
      setIsNotificationHistoryOpen(false);
      return true;
    }
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      return true;
    }
    return false;
  }, isAnyModalOpen, 50);

  return {
    summarizingService,
    sharingService,
    deletingService,
    cancelingService,
    isDiagnosticOverlayOpen,
    isNotificationHistoryOpen,
    isMobileMenuOpen,
    isSidebarMinimized,
    isChatbotOpen,
    setSummarizingService,
    setSharingService,
    setDeletingService,
    setCancelingService,
    setIsDiagnosticOverlayOpen,
    setIsNotificationHistoryOpen,
    setIsMobileMenuOpen,
    setIsSidebarMinimized,
    setIsChatbotOpen,
    openSummaryModal,
    closeSummaryModal,
    openShareModal,
    closeShareModal,
    openDeleteModal,
    closeDeleteModal,
    openCancelModal,
    closeCancelModal,
    openDiagnosticOverlay,
    closeDiagnosticOverlay,
    toggleDiagnosticOverlay,
    toggleNotificationHistory,
    closeNotificationHistory,
    openMobileMenu,
    closeMobileMenu,
    toggleSidebar,
    closeAllModals
  };
}
