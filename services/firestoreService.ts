import { AppData, Settings } from '../types';

/**
 * Firebase / Firestore has been completely bypassed in favor of
 * High-Performance Google Sheets API + Neon PostgreSQL + Local IndexedDB.
 */

export const getFirestoreCollectionName = (sheetName: string): string => {
    return sheetName.toLowerCase();
};

export const getIdField = (colName: string): string => {
    switch (colName) {
        case 'Users': return 'username';
        case 'Submissions': return 'submissionId';
        case 'LocationHistory': return 'historyId';
        case 'ProfitLoss': return 'serviceId';
        default: return 'id';
    }
};

export const loadFromFirestore = async (_currentSettings: Settings, _forceRefresh: boolean = false): Promise<AppData | null> => {
    return null;
};

export const saveRecordToFirestore = async (_sheetName: string, _record: any, _idFieldParam?: string): Promise<void> => {
    // Completely bypassed
    return;
};

export const deleteRecordFromFirestore = async (_sheetName: string, _recordId: string | number): Promise<void> => {
    // Completely bypassed
    return;
};

export const seedFirestoreFromAppData = async (_appData: AppData, _currentFirestoreData?: AppData | null): Promise<void> => {
    // Completely bypassed
    return;
};

export const fetchMoreServiceRequestsFromFirestore = async (_lastDate: string, _limitCount: number = 100): Promise<any[]> => {
    return [];
};
