import React, { useState, useEffect } from 'react';
import { User, Permission, AgentCategory, NotificationPreferences } from '../../types';
import * as authService from '../../services/authService';
import Button from '../ui/Button';
import { PermissionEditor } from './PermissionEditor';
import { IconX, IconEye, IconEyeOff, IconKey, IconShieldCheck, IconSparkles, IconBell, IconVolumeX, IconSliders } from '../ui/Icon';
import { mergeWithDefaultPrefs, defaultNotificationPrefs } from '../../hooks/useAppInit';

interface UserEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    onSave: (user: User, originalUsername?: string) => void;
    currentUser: User;
}

const AVAILABLE_SPECIALTIES = [
    'Car Washing',
    'Car Care (Polishing & Coating)',
    'Battery Replacement',
    'Tyre Replacement',
    'Custom Services',
];

const parseSpecialtiesList = (val: any, role?: string): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim()) {
        try {
            if (val.trim().startsWith('[')) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch {}
        return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    return role === 'technician' ? ['Car Washing', 'Car Care (Polishing & Coating)'] : [];
};

export const UserEditModal: React.FC<UserEditModalProps> = ({ isOpen, onClose, user, onSave, currentUser }) => {
    const isAdminOrManager = (r?: string, cat?: string) => r === 'admin' || r === 'manager' || cat === 'ADMIN_MANAGER';

    const originalUsername = user.username || '';
    const isCreating = !user.password && !originalUsername;

    const [localUser, setLocalUser] = useState<User>(() => {
        const defaultCategory: AgentCategory = user.agentCategory || 
            (user.role === 'admin' || user.role === 'manager' ? 'ADMIN_MANAGER' : user.role === 'technician' ? 'TECHNICIAN' : 'SALES_AGENT');
        const restricted = isAdminOrManager(user.role, defaultCategory);
        return {
            ...user,
            notificationPreferences: mergeWithDefaultPrefs(user.notificationPreferences),
            agentCategory: defaultCategory,
            specialties: parseSpecialtiesList(user.specialties, user.role),
            isSalesKpiTracked: user.isSalesKpiTracked !== undefined ? user.isSalesKpiTracked : defaultCategory === 'SALES_AGENT',
            weeklyOrdersTarget: user.weeklyOrdersTarget !== undefined ? user.weeklyOrdersTarget : 5,
            monthlyOrdersTarget: user.monthlyOrdersTarget !== undefined ? user.monthlyOrdersTarget : 20,
            isEarningsCalculated: restricted ? false : (user.isEarningsCalculated !== undefined ? user.isEarningsCalculated : defaultCategory === 'TECHNICIAN'),
            isOrderTagAssignable: user.isOrderTagAssignable !== undefined ? user.isOrderTagAssignable : defaultCategory === 'TECHNICIAN',
        };
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleNotificationConsentToggle = (activate: boolean) => {
        setLocalUser(prev => {
            const currentPrefs = mergeWithDefaultPrefs(prev.notificationPreferences);
            if (activate) {
                return {
                    ...prev,
                    notificationPreferences: {
                        ...currentPrefs,
                        consentGranted: true,
                        consentTimestamp: new Date().toISOString(),
                        consentGrantedBy: `${currentUser.username} (Admin)`,
                        enabled: {
                            assigned: true,
                            reminder: true,
                            overdue: true,
                            completed: true,
                            manual: true,
                            queued: prev.role === 'admin' || prev.permissions.includes(Permission.CAN_ASSIGN_ORDERS),
                        },
                        sound: currentPrefs.sound === 'none' ? 'default' : currentPrefs.sound,
                        vibration: true,
                        priorityOnly: currentPrefs.priorityOnly ?? false,
                        maxDailyAlerts: currentPrefs.maxDailyAlerts || 15,
                    }
                };
            } else {
                return {
                    ...prev,
                    notificationPreferences: {
                        ...defaultNotificationPrefs,
                        consentGranted: false,
                        consentTimestamp: undefined,
                        consentGrantedBy: undefined,
                    }
                };
            }
        });
    };

    useEffect(() => {
        const defaultCategory: AgentCategory = user.agentCategory || 
            (user.role === 'admin' || user.role === 'manager' ? 'ADMIN_MANAGER' : user.role === 'technician' ? 'TECHNICIAN' : 'SALES_AGENT');
        const restricted = isAdminOrManager(user.role, defaultCategory);

        setLocalUser({
            ...user,
            notificationPreferences: mergeWithDefaultPrefs(user.notificationPreferences),
            agentCategory: defaultCategory,
            specialties: parseSpecialtiesList(user.specialties, user.role),
            isSalesKpiTracked: user.isSalesKpiTracked !== undefined ? user.isSalesKpiTracked : defaultCategory === 'SALES_AGENT',
            weeklyOrdersTarget: user.weeklyOrdersTarget !== undefined ? user.weeklyOrdersTarget : 5,
            monthlyOrdersTarget: user.monthlyOrdersTarget !== undefined ? user.monthlyOrdersTarget : 20,
            isEarningsCalculated: restricted ? false : (user.isEarningsCalculated !== undefined ? user.isEarningsCalculated : defaultCategory === 'TECHNICIAN'),
            isOrderTagAssignable: user.isOrderTagAssignable !== undefined ? user.isOrderTagAssignable : defaultCategory === 'TECHNICIAN',
        });
        setError('');
    }, [user]);

    if (!isOpen) return null;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        if (name === 'role') {
            const roleVal = value as User['role'];
            const newPermissions = authService.getDefaultPermissionsForRole(roleVal);
            
            let autoCategory: AgentCategory = 'SALES_AGENT';
            if (roleVal === 'admin' || roleVal === 'manager') autoCategory = 'ADMIN_MANAGER';
            else if (roleVal === 'technician') autoCategory = 'TECHNICIAN';

            const restricted = isAdminOrManager(roleVal, autoCategory);

            setLocalUser(prev => ({
                ...prev,
                role: roleVal,
                agentCategory: autoCategory,
                permissions: newPermissions,
                // If manager, keep their opt-in preference if already chosen
                isSalesKpiTracked: roleVal === 'manager' ? !!prev.isSalesKpiTracked : (autoCategory === 'SALES_AGENT'),
                isEarningsCalculated: restricted ? false : autoCategory === 'TECHNICIAN',
                isOrderTagAssignable: autoCategory === 'TECHNICIAN',
            }));
            setError('');
        } else if (name === 'agentCategory') {
            const categoryVal = value as AgentCategory;
            const restricted = isAdminOrManager(localUser.role, categoryVal);
            setLocalUser(prev => ({
                ...prev,
                agentCategory: categoryVal,
                isSalesKpiTracked: categoryVal === 'SALES_AGENT' || (localUser.role === 'manager' && !!prev.isSalesKpiTracked),
                isEarningsCalculated: restricted ? false : categoryVal === 'TECHNICIAN',
                isOrderTagAssignable: categoryVal === 'TECHNICIAN',
            }));
            setError('');
        } else {
            setLocalUser(prev => ({ ...prev, [name]: value }));
            setError('');
        }
    };

    const handleGeneratePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
        let generated = '';
        for (let i = 0; i < 10; i++) {
            generated += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setLocalUser(prev => ({ ...prev, password: generated }));
        setShowPassword(true);
    };

    const handleSpecialtyToggle = (specialty: string) => {
        setLocalUser(prev => {
            const current = parseSpecialtiesList(prev.specialties);
            const updated = current.includes(specialty)
                ? current.filter(s => s !== specialty)
                : [...current, specialty];
            return { ...prev, specialties: updated };
        });
    };

    const handleCheckboxChange = (field: 'isSalesKpiTracked' | 'isEarningsCalculated' | 'isOrderTagAssignable') => {
        if (field === 'isEarningsCalculated' && isAdminOrManager(localUser.role, localUser.agentCategory)) {
            setError('Role Permission Check: Admin and Manager roles are strictly prevented from being assigned as technicians or service agents for job earnings calculations.');
            return;
        }
        setError('');
        setLocalUser(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const handlePermissionsChange = (newPermissions: Permission[]) => {
        setLocalUser(prev => ({ ...prev, permissions: newPermissions }));
    };

    const handleSave = () => {
        const trimmedUsername = localUser.username.trim();
        if (!trimmedUsername) {
            setError('User ID / Username cannot be empty.');
            return;
        }
        if (isCreating && !localUser.password?.trim()) {
            setError('Password is required when creating a new user.');
            return;
        }
        if (isAdminOrManager(localUser.role, localUser.agentCategory) && localUser.isEarningsCalculated) {
            setError('Role Permission Check: Admin and Manager users cannot be assigned as technicians in earnings calculation logic.');
            return;
        }
        setError('');
        const userToSave: User = {
            ...localUser,
            username: trimmedUsername,
            isEarningsCalculated: isAdminOrManager(localUser.role, localUser.agentCategory) ? false : localUser.isEarningsCalculated,
        };
        onSave(userToSave, originalUsername);
    };

    const canManageAdmins = currentUser.permissions.includes(Permission.CAN_MANAGE_ADMINS);

    const availableRoles = [
        { value: 'agent', label: 'Sales Agent' },
        { value: 'technician', label: 'Technician / Detailer' },
        { value: 'manager', label: 'Manager' },
    ];

    if (canManageAdmins) {
        availableRoles.push({ value: 'admin', label: 'Admin' });
    }
    
    return (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div 
                onClick={e => e.stopPropagation()} 
                className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
            >
                {/* 1. FIXED HEADER */}
                <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-blue flex items-center justify-center text-brand-accent shadow-inner">
                            <IconKey className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                                {isCreating ? "Create New Staff Account" : `User Access & Settings: ${originalUsername}`}
                            </h2>
                            <p className="text-xs text-slate-400">
                                {isCreating ? "Configure staff credentials, role permissions, and KPI targets" : "Modify staff User ID, password, operational category, and permissions"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Close modal"
                    >
                        <IconX className="w-5 h-5" />
                    </button>
                </div>

                {/* 2. SCROLLABLE BODY */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
                    {/* CREDENTIALS SECTION */}
                    <div className="bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <IconKey className="w-4 h-4 text-brand-blue" />
                                Staff Credentials (User ID & Password)
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                🛡️ Admin Editable
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* USER ID / USERNAME */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label htmlFor="username-input" className="text-xs font-bold text-slate-700">
                                        User ID / Username <span className="text-red-500">*</span>
                                    </label>
                                    {!isCreating && originalUsername !== localUser.username && (
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                            Original: {originalUsername}
                                        </span>
                                    )}
                                </div>
                                <input
                                    id="username-input"
                                    name="username"
                                    type="text"
                                    value={localUser.username}
                                    onChange={handleInputChange}
                                    placeholder="e.g. rahul_sales, john_tech"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                                    required
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Login ID used to sign in across the system.
                                </p>
                            </div>

                            {/* PASSWORD */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label htmlFor="password-input" className="text-xs font-bold text-slate-700">
                                        {isCreating ? "Account Password" : "Set New Password"} {isCreating && <span className="text-red-500">*</span>}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleGeneratePassword}
                                        className="text-[11px] text-brand-blue hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                                        title="Auto-generate a strong password"
                                    >
                                        <IconSparkles className="w-3 h-3 text-brand-accent" />
                                        Generate
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        id="password-input"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={localUser.password || ''}
                                        onChange={handleInputChange}
                                        placeholder={isCreating ? "Enter password" : "Leave blank to keep current"}
                                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                                        required={isCreating}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(p => !p)}
                                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                                        title={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    {isCreating ? "Minimum 4 characters required." : "Enter a new password to immediately reset for this user."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ROLE & CATEGORY SECTION */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="role-select" className="block text-xs font-bold text-slate-700 mb-1">
                                System Role <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="role-select"
                                name="role"
                                value={localUser.role}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue font-medium"
                            >
                                {availableRoles.map(role => (
                                    <option key={role.value} value={role.value}>{role.label}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Determines baseline view, system privileges, and access tier.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="category-select" className="block text-xs font-bold text-slate-700 mb-1">
                                Operational Category
                            </label>
                            <select
                                id="category-select"
                                name="agentCategory"
                                value={localUser.agentCategory || 'NONE'}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue font-medium"
                            >
                                <option value="SALES_AGENT">📈 Sales Agent (Retention KPI, Web Leads & Sales)</option>
                                <option value="TECHNICIAN">🔧 Technician / Detailer (Field Jobs, Car Care, Payouts)</option>
                                <option value="ADMIN_MANAGER">🛡️ Admin & Manager (Supervisory Oversight)</option>
                                <option value="NONE">⚪ General Staff / Other</option>
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Controls KPI leaderboard, trip assignments, and specialty tagging.
                            </p>
                        </div>
                    </div>

                    {/* PERFORMANCE & KPI CONFIGURATION */}
                    <div className="bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                KPI Tracking & Operational Rules
                            </span>
                        </div>

                        {/* Specialty tags for Technicians */}
                        {(localUser.agentCategory === 'TECHNICIAN' || localUser.role === 'technician') && (
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-700">Technician Service Specialties</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {AVAILABLE_SPECIALTIES.map(spec => {
                                        const isChecked = parseSpecialtiesList(localUser.specialties).includes(spec);
                                        return (
                                            <label key={spec} className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer bg-white p-2 rounded-lg border border-slate-200 hover:bg-slate-100/60 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleSpecialtyToggle(spec)}
                                                    className="rounded text-brand-blue focus:ring-brand-blue w-4 h-4"
                                                />
                                                <span className="font-medium">{spec}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Evaluation Toggles */}
                        <div className="space-y-3 pt-1">
                            {/* SALES KPI TARGETS TOGGLE */}
                            <label className="flex items-start space-x-3 text-xs text-slate-800 font-medium cursor-pointer p-2.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={!!localUser.isSalesKpiTracked}
                                    onChange={() => handleCheckboxChange('isSalesKpiTracked')}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-900">Calculate in Sales Retention KPI & Sales Targets</span>
                                        {localUser.role === 'manager' && (
                                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                                                Opt-in for Managers
                                            </span>
                                        )}
                                        {localUser.role === 'agent' && (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                                Recommended for Sales Agent
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Enables retention calls tracking, customer booking conversion rate, and revenue goals in the sales dashboard and leaderboard.
                                    </p>
                                    {localUser.isSalesKpiTracked && (
                                        <div className="mt-3 grid grid-cols-2 gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                                    Weekly Target (Orders)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={localUser.weeklyOrdersTarget !== undefined ? localUser.weeklyOrdersTarget : 5}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value, 10);
                                                        setLocalUser(prev => ({ ...prev, weeklyOrdersTarget: isNaN(val) ? 0 : val }));
                                                    }}
                                                    className="w-full px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                                    Monthly Target (Orders)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={localUser.monthlyOrdersTarget !== undefined ? localUser.monthlyOrdersTarget : 20}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value, 10);
                                                        setLocalUser(prev => ({ ...prev, monthlyOrdersTarget: isNaN(val) ? 0 : val }));
                                                    }}
                                                    className="w-full px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </label>

                            {/* TECHNICIAN EARNINGS PAYOUTS */}
                            <label className={`flex items-start space-x-3 text-xs font-medium p-2.5 rounded-lg border transition-colors ${isAdminOrManager(localUser.role, localUser.agentCategory) ? 'opacity-60 bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 cursor-pointer hover:bg-slate-50'}`}>
                                <input
                                    type="checkbox"
                                    checked={!isAdminOrManager(localUser.role, localUser.agentCategory) && !!localUser.isEarningsCalculated}
                                    disabled={isAdminOrManager(localUser.role, localUser.agentCategory)}
                                    onChange={() => handleCheckboxChange('isEarningsCalculated')}
                                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 mt-0.5 disabled:opacity-50"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-900">Calculate in Technician Job Earnings & Payout Ranks</span>
                                        {isAdminOrManager(localUser.role, localUser.agentCategory) && (
                                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                                🔒 Excluded (Manager/Admin Restriction)
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Calculates job commission and service fee earnings on completed orders.
                                    </p>
                                </div>
                            </label>

                            {/* FIELD SERVICE ORDERS ASSIGNMENT */}
                            <label className="flex items-start space-x-3 text-xs text-slate-800 font-medium cursor-pointer p-2.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={!!localUser.isOrderTagAssignable}
                                    onChange={() => handleCheckboxChange('isOrderTagAssignable')}
                                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5"
                                />
                                <div className="flex-1">
                                    <span className="font-bold text-slate-900">Assignable to Service Orders & Field Service Tags</span>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Allows dispatchers to assign washing, polishing, battery, or tyre replacement jobs to this staff member.
                                    </p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* NOTIFICATION CONSENT & LOAD MANAGEMENT (DEACTIVATED BY DEFAULT) */}
                    <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50/80">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${localUser.notificationPreferences?.consentGranted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {localUser.notificationPreferences?.consentGranted ? <IconBell className="w-4 h-4" /> : <IconVolumeX className="w-4 h-4" />}
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Notification Consent & Load Management</h4>
                                    <p className="text-[11px] text-slate-500">Deactivated by default across the system to manage notification load.</p>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${localUser.notificationPreferences?.consentGranted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                {localUser.notificationPreferences?.consentGranted ? 'Active with Consent' : 'Deactivated (Default)'}
                            </span>
                        </div>

                        <label className="flex items-start space-x-3 text-xs text-slate-800 font-medium cursor-pointer p-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={!!localUser.notificationPreferences?.consentGranted}
                                onChange={(e) => handleNotificationConsentToggle(e.target.checked)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 mt-0.5"
                            />
                            <div className="flex-1">
                                <span className="font-bold text-slate-900">Admin Consent: Activate notifications for this user</span>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {localUser.notificationPreferences?.consentGranted
                                        ? `Consent recorded by ${localUser.notificationPreferences?.consentGrantedBy || currentUser.username}. User will receive load-managed dispatch notifications.`
                                        : 'Keep unchecked to maintain default zero-load status (no automated alerts dispatched to this user).'}
                                </p>
                            </div>
                        </label>

                        {localUser.notificationPreferences?.consentGranted && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <label className="flex items-center space-x-2 text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!localUser.notificationPreferences?.priorityOnly}
                                        onChange={(e) => setLocalUser(prev => ({
                                            ...prev,
                                            notificationPreferences: {
                                                ...mergeWithDefaultPrefs(prev.notificationPreferences),
                                                priorityOnly: e.target.checked
                                            }
                                        }))}
                                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                    />
                                    <span className="text-[11px] font-semibold text-slate-800">Priority Alerts Only (Low Load)</span>
                                </label>

                                <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                                    <span className="text-[11px] font-semibold text-slate-700">Daily Cap:</span>
                                    <select
                                        value={localUser.notificationPreferences?.maxDailyAlerts || 15}
                                        onChange={(e) => setLocalUser(prev => ({
                                            ...prev,
                                            notificationPreferences: {
                                                ...mergeWithDefaultPrefs(prev.notificationPreferences),
                                                maxDailyAlerts: parseInt(e.target.value, 10)
                                            }
                                        }))}
                                        className="text-[11px] font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                                    >
                                        <option value={5}>Max 5 / day</option>
                                        <option value={10}>Max 10 / day</option>
                                        <option value={15}>Max 15 / day</option>
                                        <option value={25}>Max 25 / day</option>
                                        <option value={999}>Unlimited</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* PERMISSION MATRIX */}
                    <div>
                        <PermissionEditor 
                            currentPermissions={localUser.permissions}
                            onPermissionsChange={handlePermissionsChange}
                            canEditAdminPermissions={canManageAdmins}
                        />
                    </div>
                </div>

                {/* 3. FIXED STICKY FOOTER - GUARANTEED VISIBLE AND REACHABLE */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4 flex-shrink-0 sticky bottom-0 z-20 shadow-lg">
                    <div className="flex-1 min-w-0">
                        {error ? (
                            <p className="text-xs sm:text-sm text-red-600 font-bold truncate flex items-center gap-1.5 animate-shake">
                                ⚠️ <span>{error}</span>
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 hidden sm:block">
                                Changes are saved immediately to cloud database and synced to all devices.
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <Button variant="ghost" onClick={onClose} className="text-slate-600 hover:text-slate-900">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSave} 
                            className="bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold shadow-md px-5 py-2.5 text-xs sm:text-sm whitespace-nowrap active:scale-98 transition-all"
                        >
                            Save User Settings
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserEditModal;
