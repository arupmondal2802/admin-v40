
import { User, Permission } from '../types';
import { neonDataService } from './neonDataService';
import { setNeonSoleSourceMode, isNeonSoleSourceMode } from './backendConfig';

/**
 * Normalizes username or email to standard lowercased format
 */
export const toAuthEmail = (usernameOrEmail: string): string => {
    if (usernameOrEmail.includes('@')) {
        return usernameOrEmail.trim().toLowerCase();
    }
    return `${usernameOrEmail.trim().toLowerCase()}@abigengine.local`;
};

let lastAuthError: string | null = null;

export const getLastAuthError = (): string | null => lastAuthError;
export const clearLastAuthError = (): void => { lastAuthError = null; };

/**
 * Validates user authentication against Neon Database first, with fallback to loaded state / Google Sheet user list.
 * In `soleNeonMode`, validates STRICTLY against Neon Database to verify pure SSOT operation.
 */
export const login = async (
    username: string, 
    password: string | undefined, 
    users: User[], 
    options?: { soleNeonMode?: boolean }
): Promise<User | null> => {
    lastAuthError = null;
    if (!password || !username) {
        lastAuthError = 'Username and password are required.';
        return null;
    }

    const isSoleMode = options?.soleNeonMode ?? isNeonSoleSourceMode();

    // 1. Direct Cloudflare Workers & Neon Database Authentication
    try {
        const neonAuth = await neonDataService.login(username, password);
        if (neonAuth.success && neonAuth.user) {
            console.log(`🐘 [Auth] Successfully authenticated with Neon Database (${isSoleMode ? 'SSOT Mode' : 'Hybrid Mode'}).`);
            if (isSoleMode) {
                setNeonSoleSourceMode(true);
            }
            return neonAuth.user;
        } else if (neonAuth.error) {
            lastAuthError = neonAuth.error;
            if (isSoleMode) {
                console.warn('⚠️ [Auth SSOT] Neon DB rejected credentials:', neonAuth.error);
                return null;
            }
        }
    } catch (err: any) {
        lastAuthError = err.message || 'Cannot reach Neon authentication server.';
        console.warn('⚠️ [Auth] Neon DB auth attempt failed:', err);
        if (isSoleMode) {
            return null;
        }
    }

    // If strictly in Neon SSOT mode, do NOT fall back to Google Sheets / local memory
    if (isSoleMode) {
        return null;
    }

    // 2. Backup: Validate against loaded Google Sheet / in-memory user list (Standard mode only)
    const validatedLocal = validateLogin(username, password, users);
    if (validatedLocal) {
        console.log('📊 [Auth] Successfully authenticated with Google Sheet / Local database backup.');
        lastAuthError = null;
        return validatedLocal;
    }

    if (!lastAuthError) {
        lastAuthError = 'Invalid credentials';
    }
    return null;
};

export const logout = async (): Promise<void> => {
    // Clean local user session
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('service_app_current_user');
    }
};

// Aliases for seamless backward compatibility
export const firebaseLogin = login;
export const firebaseLogout = logout;
export const subscribeToAuthChanges = (_callback: (user: any) => void) => () => {};

/**
 * Validates a user's credentials against a provided list of users in the database.
 * Supports case-insensitive username or email matching.
 */
export const validateLogin = (username: string, password: string | undefined, users: User[]): User | null => {
    if (!password || !username) return null;
    const cleanInput = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    const user = users.find(u => {
        if (!u) return false;
        const uName = (u.username || '').trim().toLowerCase();
        const uEmail = (u.email || '').trim().toLowerCase();
        const isMatchUser = uName === cleanInput || (uEmail !== '' && uEmail === cleanInput);
        const isMatchPass = (u.password || '').trim() === cleanPassword || u.password === password;
        return isMatchUser && isMatchPass;
    });

    if (user) {
        const { password, ...userToReturn } = user;
        return userToReturn;
    }
    return null;
};

/**
 * Adds a new user to a list of users if the username doesn't already exist.
 */
export const addUser = (newUser: User, currentUsers: User[]): { success: boolean, message: string, updatedUsers?: User[] } => {
    if (currentUsers.find(u => u.username === newUser.username)) {
        return { success: false, message: 'Username already exists.' };
    }
    const updatedUsers = [...currentUsers, newUser];
    return { success: true, message: 'User created successfully.', updatedUsers };
};

export const ALL_PERMISSIONS: { id: Permission, label: string, description: string, category: 'User' | 'Admin' | 'Super Admin' }[] = [
    { id: Permission.CAN_VIEW_DASHBOARD, label: "View Dashboard", description: "Can see their own dashboard.", category: 'User' },
    { id: Permission.CAN_CREATE_ORDERS, label: "Create Orders/Drafts", description: "Can create new service orders and drafts.", category: 'User' },
    { id: Permission.CAN_EDIT_OWN_ORDERS, label: "Edit Own Orders", description: "Can edit orders they are assigned to.", category: 'User' },
    { id: Permission.CAN_VIEW_SERVICE_HISTORY, label: "View Service History", description: "Can view the list of all past services.", category: 'User' },
    { id: Permission.CAN_VIEW_APPOINTMENTS_OVERVIEW, label: "View 'My Appointments'", description: "Can access the dedicated appointments overview page.", category: 'User' },
    { id: Permission.CAN_LOG_EXPENSES, label: "Log Expenses", description: "Can submit their own expenses in bookkeeping.", category: 'User' },
    
    { id: Permission.CAN_ASSIGN_ORDERS, label: "Assign/Reassign Orders", description: "Can assign queued orders to any user.", category: 'Admin' },
    { id: Permission.CAN_EDIT_ANY_ORDER, label: "Edit Any Order", description: "Can edit any order, regardless of assignment.", category: 'Admin' },
    { id: Permission.CAN_DELETE_ORDERS, label: "Delete Orders", description: "Can delete/trash service orders.", category: 'Admin' },
    { id: Permission.CAN_VIEW_TRASH, label: "View Trash", description: "Can view deleted items and restore/permanently delete them.", category: 'Admin' },
    { id: Permission.CAN_VIEW_ANALYTICS, label: "View Analytics", description: "Can access the analytics and reporting page.", category: 'Admin' },
    { id: Permission.CAN_VIEW_LIVE_MAP, label: "View Live Map", description: "Can view the real-time agent location map.", category: 'Admin' },
    { id: Permission.CAN_VIEW_CUSTOMER_HISTORY, label: "View Customer History", description: "Can search and view full customer histories.", category: 'Admin' },
    { id: Permission.CAN_VIEW_RETENTION_DASHBOARD, label: "View Retention Dashboard", description: "Can access the customer retention dashboard.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_BOOKKEEPING, label: "Manage Bookkeeping", description: "Can view all expenses and mark them as paid.", category: 'Admin' },
    { id: Permission.CAN_VIEW_PROFIT_LOSS, label: "View Profit/Loss", description: "Can access the profit and loss calculation page.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_USERS, label: "Manage Users", description: "Can create new users and edit existing non-admin users.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_SUBSCRIPTIONS, label: "Manage Subscriptions", description: "Can manage customer subscription plans.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_PLANS, label: "Manage Plans", description: "Can create and edit subscription plan templates.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_ADDONS, label: "Manage Add-ons", description: "Can create and edit predefined add-ons.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_PRICING, label: "Manage Pricing", description: "Can edit service pricing matrices.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_SERVICES, label: "Manage Services", description: "Can create, edit, and define custom fields for services.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_SPEND_CATEGORIES, label: "Manage Ledger Categories", description: "Can edit bookkeeping expense categories.", category: 'Admin' },
    { id: Permission.CAN_MANAGE_PAYMENTS, label: "Manage & Verify Payments", description: "Can verify and complete order payments, and manage accounts ledger.", category: 'Admin' },
    { id: Permission.CAN_VIEW_SERVICE_REQUESTS, label: "View Service Requests", description: "Can view requests from external sources (e.g., website).", category: 'Admin' },

    { id: Permission.CAN_EDIT_SETTINGS, label: "Edit App Settings", description: "Can access the settings modal and change cloud configuration.", category: 'Super Admin' },
    { id: Permission.CAN_MANAGE_ADMINS, label: "Manage Admins", description: "Can create, edit roles of, and manage other admin users.", category: 'Super Admin' },
];


export const getDefaultPermissionsForRole = (role: User['role']): Permission[] => {
    const technicianPermissions = [
        Permission.CAN_VIEW_DASHBOARD, Permission.CAN_CREATE_ORDERS, Permission.CAN_EDIT_OWN_ORDERS,
        Permission.CAN_VIEW_SERVICE_HISTORY, Permission.CAN_VIEW_APPOINTMENTS_OVERVIEW, Permission.CAN_LOG_EXPENSES
    ];

    const salesAgentPermissions = [
        Permission.CAN_VIEW_DASHBOARD, Permission.CAN_CREATE_ORDERS, Permission.CAN_EDIT_OWN_ORDERS,
        Permission.CAN_VIEW_SERVICE_HISTORY, Permission.CAN_VIEW_CUSTOMER_HISTORY, Permission.CAN_VIEW_RETENTION_DASHBOARD,
        Permission.CAN_VIEW_SERVICE_REQUESTS, Permission.CAN_LOG_EXPENSES
    ];

    const managerPermissions = [
        ...technicianPermissions,
        Permission.CAN_ASSIGN_ORDERS, Permission.CAN_EDIT_ANY_ORDER, Permission.CAN_DELETE_ORDERS,
        Permission.CAN_VIEW_ANALYTICS, Permission.CAN_VIEW_LIVE_MAP, Permission.CAN_VIEW_CUSTOMER_HISTORY,
        Permission.CAN_VIEW_RETENTION_DASHBOARD, Permission.CAN_MANAGE_BOOKKEEPING, Permission.CAN_VIEW_PROFIT_LOSS,
        Permission.CAN_MANAGE_USERS,
        Permission.CAN_MANAGE_SUBSCRIPTIONS, Permission.CAN_MANAGE_PLANS, Permission.CAN_MANAGE_ADDONS,
        Permission.CAN_MANAGE_SERVICES, Permission.CAN_VIEW_SERVICE_REQUESTS, Permission.CAN_VIEW_TRASH,
        Permission.CAN_MANAGE_SPEND_CATEGORIES, Permission.CAN_MANAGE_PAYMENTS,
    ];

    const adminPermissions = [
        ...managerPermissions,
        Permission.CAN_MANAGE_PRICING,
        Permission.CAN_EDIT_SETTINGS,
        Permission.CAN_MANAGE_ADMINS,
    ];

    switch(role) {
        case 'admin':
            return adminPermissions;
        case 'manager':
            return managerPermissions;
        case 'agent':
            return salesAgentPermissions;
        case 'technician':
            return technicianPermissions;
        default:
            return [];
    }
};

/**
 * Checks if a user is a Sales Agent (eligible for Sales Retention KPI & Lead Follow-ups)
 * Managers and Admins can also opt-in via isSalesKpiTracked.
 */
export const isSalesAgentUser = (user: Partial<User> | Omit<User, 'password'>): boolean => {
    if (!user) return false;
    // Allow managers or admins to have sales agent KPI targets if opted in
    if (user.role === 'manager' || user.agentCategory === 'ADMIN_MANAGER') {
        return !!user.isSalesKpiTracked;
    }
    if (user.role === 'admin') {
        return !!user.isSalesKpiTracked;
    }
    if (user.isSalesKpiTracked !== undefined) return user.isSalesKpiTracked;
    if (user.agentCategory) return user.agentCategory === 'SALES_AGENT';
    // Fallback based on system role: pure 'agent' default
    return user.role === 'agent';
};

/**
 * Checks if a user is a Technician / Service Detailer (eligible for Service Job Earnings & Payouts)
 */
export const isTechnicianUser = (user: Partial<User> | Omit<User, 'password'>): boolean => {
    if (!user) return false;
    // Admins and Managers are strictly excluded from being assigned as technicians or service agents in earnings calculation logic
    if (user.role === 'admin' || user.role === 'manager' || user.agentCategory === 'ADMIN_MANAGER') {
        return false;
    }
    if (user.isEarningsCalculated !== undefined) return user.isEarningsCalculated;
    if (user.agentCategory) return user.agentCategory === 'TECHNICIAN';
    // Fallback based on system role: 'technician' default
    return user.role === 'technician';
};

/**
 * Checks if a user is an Admin or Manager (Supervisory role, excluded from field earnings/sales KPIs by default)
 */
export const isAdminOrManagerUser = (user: Partial<User> | Omit<User, 'password'>): boolean => {
    if (!user) return false;
    if (user.agentCategory === 'ADMIN_MANAGER') return true;
    return user.role === 'admin' || user.role === 'manager';
};

/**
 * Checks if a user can be assigned field orders/service tags (Washing, Polishing, Battery, Tyre, etc.)
 */
export const isAssignableTechnician = (user: Partial<User> | Omit<User, 'password'>): boolean => {
    if (!user) return false;
    if (user.isOrderTagAssignable !== undefined) return user.isOrderTagAssignable;
    if (user.agentCategory === 'ADMIN_MANAGER') return false;
    if (user.agentCategory === 'TECHNICIAN') return true;
    if (user.role === 'admin' || user.role === 'manager') return false;
    return true;
};

/**
 * Checks if a user is an Accounts / Finance User authorized to complete and verify order payments.
 * Dedicated accounts user or Admin/Manager with CAN_MANAGE_PAYMENTS permission.
 */
export const isAccountsUser = (user?: Partial<User> | Omit<User, 'password'> | null): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.permissions?.includes(Permission.CAN_MANAGE_PAYMENTS)) return true;
    if (user.agentCategory === 'ADMIN_MANAGER' && user.permissions?.includes(Permission.CAN_MANAGE_PAYMENTS)) return true;
    if ((user as any).role === 'accountant') return true;
    const lowerRole = ((user as any).role || '').toLowerCase();
    const lowerUsername = (user.username || '').toLowerCase();
    if (lowerRole.includes('account') || lowerRole.includes('finance') || lowerRole.includes('billing')) return true;
    if (lowerUsername.includes('account') || lowerUsername.includes('finance') || lowerUsername.includes('billing')) return true;
    return false;
};

const authService = {
    validateLogin,
    firebaseLogin,
    firebaseLogout,
    subscribeToAuthChanges,
    addUser,
    ALL_PERMISSIONS,
    getDefaultPermissionsForRole,
    isSalesAgentUser,
    isTechnicianUser,
    isAdminOrManagerUser,
    isAssignableTechnician,
    isAccountsUser,
};

export default authService;
