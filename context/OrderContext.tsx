import React, { createContext, useContext } from 'react';
import { Service, ServiceRequest, AuditLog } from '../types';

export interface OrderContextType {
  submissions: Service[];
  activeSubmissions: Service[];
  setSubmissions: React.Dispatch<React.SetStateAction<Service[]>>;
  serviceRequests: ServiceRequest[];
  setServiceRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>;
  editingService: Service | null;
  setEditingService: React.Dispatch<React.SetStateAction<Service | null>>;
  auditLogs: AuditLog[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  hasMoreServiceRequests: boolean;
  isLoadingMoreServiceRequests: boolean;
  createOrder: (details: any) => Promise<void>;
  completeOrder: (service: Service) => Promise<void>;
  editService: (service: Service | null) => void;
  assignOrder: (sid: string, username: string, secondaryAssignee?: string) => void;
  startOrder: (sid: string) => void;
  selfAssignOrder: (sid: string) => void;
  deleteOrder: (service: Service, reason?: string, locationStamp?: string, customTimestamp?: string) => Promise<void>;
  cancelOrder: (service: Service, reason: string, locationStamp: string, customTimestamp?: string) => Promise<void>;
  scheduleDroppedOrder: (sid: string, date: string, assignedTo: string, secondaryAssignee?: string) => void;
  rebookOrder: (previousService: Service) => void;
  bookServiceFromReminder: (customerData: {
    firstName: string;
    lastName: string;
    mobileNumber: string;
    carNumber: string;
    carBrandModel: string;
    serviceSelection: string[];
  }) => void;
  convertLeadToService: (leadId: string) => Promise<void>;
  captureLead: (newLeadData: Omit<ServiceRequest, 'id' | 'requestDate'> & { status?: string }) => Promise<void>;
  updateServiceRequest: (updatedLead: ServiceRequest) => Promise<void>;
  loadMoreServiceRequests: () => Promise<void>;
  notifyForOrder: (sid: string) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export interface OrderProviderProps {
  children: React.ReactNode;
  value: OrderContextType;
}

export const OrderProvider: React.FC<OrderProviderProps> = ({ children, value }) => {
  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrder = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
};

export default OrderContext;
