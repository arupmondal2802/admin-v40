import React, { createContext, useContext } from 'react';
import { InventoryItem, InventoryMovement, Service, PredefinedService } from '../types';

export interface InventoryContextType {
  inventoryItems: InventoryItem[];
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  inventoryMovements: InventoryMovement[];
  setInventoryMovements: React.Dispatch<React.SetStateAction<InventoryMovement[]>>;
  addInventoryItem: (newItem: InventoryItem) => Promise<void>;
  updateInventoryItem: (updatedItem: InventoryItem) => Promise<void>;
  deleteInventoryItem: (itemId: string) => Promise<void>;
  recordMovement: (movement: InventoryMovement) => Promise<void>;
  depleteInventoryForCompletedService: (
    service: Service,
    predefinedServices?: PredefinedService[]
  ) => Promise<{ updatedItems: InventoryItem[]; movements: InventoryMovement[] } | void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export interface InventoryProviderProps {
  children: React.ReactNode;
  value: InventoryContextType;
}

export const InventoryProvider: React.FC<InventoryProviderProps> = ({ children, value }) => {
  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = (): InventoryContextType => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};

export default InventoryContext;
