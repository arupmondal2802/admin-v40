import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Permission } from '../../types';
import * as authService from '../../services/authService';
import * as cloudDataService from '../../services/cloudDataService';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { IconPlus, IconUser, IconUserCheck, IconUserOff, IconPencil, IconShieldCheck, IconChevronUp, IconRefresh, IconKey } from '../ui/Icon';
import { UserEditModal } from './UserEditModal';
import SkeletonLoader from '../ui/SkeletonLoader';

interface UserManagementPageProps {
    isLoading?: boolean;
    isHydrated?: boolean;
    users: Omit<User, 'password'>[];
    onUpdateUsers: (allUsers: User[]) => void;
    fullUserList: User[];
    currentUser: User;
    onRefresh?: () => void;
}

const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)}y`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)}mo`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)}d`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)}h`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)}m`;
    return `${Math.floor(seconds)}s`;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = (props) => {
    const { users, onUpdateUsers, fullUserList, currentUser, onRefresh, isLoading, isHydrated } = props;
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | 'SALES' | 'TECHNICIAN' | 'ADMIN'>('ALL');
    const [roleFilter, setRoleFilter] = useState<string>('ALL');

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    const canManageAdmins = currentUser?.permissions?.includes(Permission.CAN_MANAGE_ADMINS) ?? false;

    const visibleUsers = useMemo(() => {
        let base = users || [];
        if (!canManageAdmins) {
            // Managers can see everyone except other admins
            base = base.filter(user => user.role !== 'admin');
        }

        if (activeCategoryFilter === 'SALES') {
            base = base.filter(u => authService.isSalesAgentUser(u));
        } else if (activeCategoryFilter === 'TECHNICIAN') {
            base = base.filter(u => authService.isTechnicianUser(u));
        } else if (activeCategoryFilter === 'ADMIN') {
            base = base.filter(u => authService.isAdminOrManagerUser(u));
        }

        if (roleFilter !== 'ALL') {
            base = base.filter(u => u.role === roleFilter);
        }

        return base;
    }, [users, canManageAdmins, activeCategoryFilter, roleFilter]);

     useEffect(() => {
        const container = scrollContainerRef.current;
        const handleScroll = () => {
            if (container) {
                setShowScrollTop(container.scrollTop > 100);
            }
        };

        if (container) {
            container.addEventListener('scroll', handleScroll);
        }

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
        };
    }, []);

    if (isLoading || isHydrated === false || !users || !fullUserList || !currentUser) {
        return <SkeletonLoader view="USER_MANAGEMENT" />;
    }

    const handleScrollToTop = () => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveUser = (userToSave: User, originalUsername?: string) => {
        // Enforce Role Permission check: Admins and Managers cannot be assigned for job earnings calculations
        const sanitizedUser: User = {
            ...userToSave,
            isEarningsCalculated: (userToSave.role === 'admin' || userToSave.role === 'manager' || userToSave.agentCategory === 'ADMIN_MANAGER') 
                ? false 
                : userToSave.isEarningsCalculated
        };

        const effectiveOriginal = originalUsername || sanitizedUser.username;
        const isRename = originalUsername && originalUsername.trim() !== '' && originalUsername !== sanitizedUser.username;
        const isExisting = fullUserList.some(u => u.username === effectiveOriginal);

        if (!isExisting) {
            // New user creation
            if (fullUserList.some(u => u.username === sanitizedUser.username)) {
                alert(`User ID / Username "${sanitizedUser.username}" is already taken.`);
                return;
            }
            const result = authService.addUser(sanitizedUser, fullUserList);
            if (result.success && result.updatedUsers) {
                onUpdateUsers(result.updatedUsers);
            } else {
                alert(result.message);
            }
        } else {
            // Existing user update / rename
            if (isRename && fullUserList.some(u => u.username === sanitizedUser.username)) {
                alert(`Cannot rename user. User ID / Username "${sanitizedUser.username}" is already in use by another staff member.`);
                return;
            }

            const existingUser = fullUserList.find(u => u.username === effectiveOriginal);
            const finalPassword = (sanitizedUser.password && sanitizedUser.password.trim() !== '') 
                ? sanitizedUser.password.trim()
                : (existingUser?.password || '');

            const finalUser: User = {
                ...sanitizedUser,
                password: finalPassword
            };

            // If renamed, clean up old username record
            if (isRename) {
                cloudDataService.deleteRecord('Users', effectiveOriginal).catch(console.error);
                if (currentUser.username === effectiveOriginal) {
                    localStorage.setItem('service_app_current_user', JSON.stringify({ ...finalUser, password: '' }));
                }
            }

            const updatedUsers = fullUserList.map(u => u.username === effectiveOriginal ? finalUser : u);
            onUpdateUsers(updatedUsers);
        }
        setEditingUser(null);
    };
    
    const startCreating = () => {
        setEditingUser({
            username: '',
            password: '',
            role: 'agent',
            agentCategory: 'SALES_AGENT',
            isSalesKpiTracked: true,
            isEarningsCalculated: false,
            isOrderTagAssignable: false,
            permissions: authService.getDefaultPermissionsForRole('agent'),
            attendanceHistory: [],
            attendanceStatus: 'CHECKED_OUT',
        });
    };
    
    const startEditing = (user: Omit<User, 'password'>) => {
        const fullUser = fullUserList.find(u => u.username === user.username);
        if (fullUser) {
            setEditingUser({ ...fullUser, password: '' }); // Don't expose password
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">User Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Configure user roles, operational categories, technician specialties, and sales KPI tracking.</p>
                </div>
                <div className="flex items-center gap-2">
                    {onRefresh && (
                        <Button variant="secondary" onClick={onRefresh} className="whitespace-nowrap">
                            <IconRefresh className="w-4 h-4 mr-2" /> Sync Users
                        </Button>
                    )}
                    <Button onClick={startCreating} className="w-full sm:w-auto whitespace-nowrap">
                        <IconPlus className="w-5 h-5 mr-2" /> Create New User
                    </Button>
                </div>
            </div>

            {editingUser && (
                <UserEditModal
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                    user={editingUser}
                    onSave={handleSaveUser}
                    currentUser={currentUser}
                />
            )}

            <Card title="Existing Users">
                 <div className="space-y-4">
                    {/* Category Filter Tabs & Role Filter Toolbar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div className="flex flex-wrap gap-2 items-center">
                            <button
                                onClick={() => setActiveCategoryFilter('ALL')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeCategoryFilter === 'ALL' ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                All Users ({users.length})
                            </button>
                            <button
                                onClick={() => setActiveCategoryFilter('SALES')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeCategoryFilter === 'SALES' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                            >
                                📈 Sales Agents ({users.filter(u => authService.isSalesAgentUser(u)).length})
                            </button>
                            <button
                                onClick={() => setActiveCategoryFilter('TECHNICIAN')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeCategoryFilter === 'TECHNICIAN' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                            >
                                🔧 Technicians / Detailers ({users.filter(u => authService.isTechnicianUser(u)).length})
                            </button>
                            <button
                                onClick={() => setActiveCategoryFilter('ADMIN')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeCategoryFilter === 'ADMIN' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                            >
                                🛡️ Admins & Managers ({users.filter(u => authService.isAdminOrManagerUser(u)).length})
                            </button>
                        </div>

                        {/* Role Filter Dropdown */}
                        <div className="flex items-center gap-2 self-start md:self-auto">
                            <label htmlFor="role-filter-select" className="text-xs font-bold text-slate-500 whitespace-nowrap">
                                Role Filter:
                            </label>
                            <select
                                id="role-filter-select"
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg shadow-2xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent cursor-pointer"
                            >
                                <option value="ALL">All Roles</option>
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="technician">Technician</option>
                                <option value="agent">Agent</option>
                            </select>
                        </div>
                    </div>

                    <div className="relative">
                    <div ref={scrollContainerRef} className="max-h-[65vh] overflow-y-auto pr-2 -mr-2 hide-scrollbar">
                        <ul className="space-y-3">
                            {visibleUsers.map(user => {
                                const isCheckedIn = user.attendanceStatus === 'CHECKED_IN';
                                const lastRecord = user.attendanceHistory?.[user.attendanceHistory.length - 1];
                                const canEditThisUser = canManageAdmins || user.role !== 'admin';
                                const isSales = authService.isSalesAgentUser(user);
                                const isTech = authService.isTechnicianUser(user);
                                const isAdmin = authService.isAdminOrManagerUser(user);

                                return (
                                    <li key={user.username} className="p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-start space-x-4">
                                                <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-slate-600">
                                                    <IconUser className="w-6 h-6" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center flex-wrap gap-2">
                                                        <p className="font-bold text-slate-800 text-base">{user.username}</p>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                                            {user.role}
                                                        </span>

                                                        {/* Category Badge */}
                                                        {isSales && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                                                                <span>📈 Sales Agent</span>
                                                            </span>
                                                        )}
                                                        {isTech && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                                                <span>🔧 Technician / Detailer</span>
                                                            </span>
                                                        )}
                                                        {isAdmin && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                                                <span>🛡️ Admin / Manager</span>
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Technician Specialties */}
                                                    {(() => {
                                                        const specialties = Array.isArray(user.specialties)
                                                            ? user.specialties
                                                            : typeof user.specialties === 'string' && (user.specialties as string).trim()
                                                            ? (user.specialties as string).split(',').map(s => s.trim()).filter(Boolean)
                                                            : [];
                                                        if (specialties.length === 0) return null;
                                                        return (
                                                            <div className="flex items-center flex-wrap gap-1 pt-0.5">
                                                                <span className="text-[11px] font-semibold text-slate-400">Specialties:</span>
                                                                {specialties.map(spec => (
                                                                    <span key={spec} className="text-[10px] font-medium bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                                                                        {spec}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Tracking Capabilities Indicators */}
                                                    <div className="flex items-center flex-wrap gap-2.5 text-xs text-slate-500 pt-1">
                                                        <span className={`flex items-center gap-1 ${user.isSalesKpiTracked ? 'text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200' : 'text-slate-400 opacity-60'}`}>
                                                            📊 Sales Retention KPI {user.role === 'manager' && '(Manager Opt-in)'}
                                                        </span>
                                                        <span className={`flex items-center gap-1 ${(user.role === 'admin' || user.role === 'manager' || user.agentCategory === 'ADMIN_MANAGER') ? 'text-slate-400 line-through opacity-60' : user.isEarningsCalculated ? 'text-amber-700 font-medium' : 'text-slate-400 opacity-60'}`}>
                                                            💰 Job Earnings Payouts {(user.role === 'admin' || user.role === 'manager' || user.agentCategory === 'ADMIN_MANAGER') && '(Role Restricted)'}
                                                        </span>
                                                        <span className={`flex items-center gap-1 ${user.isOrderTagAssignable ? 'text-blue-600 font-medium' : 'text-slate-400 opacity-60'}`}>
                                                            🏷️ Order Tag Assignable
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between sm:justify-end space-x-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                                                <div className="text-right">
                                                    <div className={`flex items-center justify-end space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {isCheckedIn ? <IconUserCheck className="w-3.5 h-3.5" /> : <IconUserOff className="w-3.5 h-3.5" />}
                                                        <span>{isCheckedIn ? "Checked In" : "Checked Out"}</span>
                                                    </div>
                                                    {lastRecord && (
                                                        <p className="text-[11px] text-slate-400 mt-1">
                                                            {timeSince(new Date(lastRecord.timestamp))} ago
                                                        </p>
                                                    )}
                                                </div>
                                                {canEditThisUser && (
                                                    <Button variant="secondary" size="sm" onClick={() => startEditing(user)} className="flex items-center gap-1">
                                                        <IconKey className="w-3.5 h-3.5 text-brand-blue"/>
                                                        <IconPencil className="w-3.5 h-3.5 text-slate-500"/>
                                                        <span>Edit Access / Password</span>
                                                    </Button>
                                                )}
                                            </div>
                                    </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                     {showScrollTop && (
                        <button
                            onClick={handleScrollToTop}
                            className="absolute bottom-4 right-4 bg-brand-accent text-brand-blue rounded-full p-2 shadow-lg hover:bg-brand-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-accent transition-opacity duration-300"
                            aria-label="Scroll to top"
                        >
                            <IconChevronUp className="w-6 h-6" />
                        </button>
                    )}
                </div>
                </div>
            </Card>
        </div>
    )
};

export default UserManagementPage;
