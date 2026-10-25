import React, { useState } from 'react';
import { User } from '../../types';
import Button from '../ui/Button';
import { IconX, IconKey, IconLock, IconEye, IconEyeOff, IconCheckCircle } from '../ui/Icon';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    allUsers: User[];
    onUpdateUsers: (allUsers: User[]) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
    isOpen,
    onClose,
    currentUser,
    allUsers,
    onUpdateUsers,
}) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    // Find the full user record to inspect existing password if any
    const fullUser = allUsers.find(u => u.username === currentUser.username) || currentUser;
    const hasExistingPassword = !!(fullUser.password && fullUser.password.trim() !== '');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        // 1. Verify current password if user has one
        if (hasExistingPassword) {
            if (!currentPassword) {
                setError('Please enter your current password.');
                return;
            }
            if (currentPassword.trim() !== fullUser.password?.trim()) {
                setError('Current password does not match. Please verify and try again.');
                return;
            }
        }

        // 2. Validate new password
        const cleanNew = newPassword.trim();
        if (!cleanNew) {
            setError('Please enter a new password.');
            return;
        }
        if (cleanNew.length < 4) {
            setError('New password must be at least 4 characters long.');
            return;
        }
        if (cleanNew !== confirmPassword.trim()) {
            setError('New password and confirmation password do not match.');
            return;
        }

        setIsSaving(true);
        try {
            const updatedUser: User = {
                ...fullUser,
                password: cleanNew,
            };

            const updatedList = allUsers.map(u => u.username === currentUser.username ? updatedUser : u);
            onUpdateUsers(updatedList);

            // Update session cache
            try {
                localStorage.setItem('service_app_current_user', JSON.stringify({ ...updatedUser, password: '' }));
            } catch (err) {
                console.error('Failed to update local session cache:', err);
            }

            setSuccessMessage('Password changed and saved successfully!');
            setTimeout(() => {
                setIsSaving(false);
                onClose();
                // Reset form fields
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setSuccessMessage('');
            }, 1200);
        } catch (err: any) {
            setError(err.message || 'Failed to update password. Please try again.');
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div 
                onClick={e => e.stopPropagation()} 
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-blue flex items-center justify-center text-brand-accent shadow-inner">
                            <IconKey className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight">Change Password</h3>
                            <p className="text-xs text-slate-400">Update login credentials for <span className="font-bold text-slate-200">{currentUser.username}</span></p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Close"
                    >
                        <IconX className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
                    {successMessage ? (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
                            <IconCheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                            <div>
                                <h4 className="text-sm font-bold">Password Updated!</h4>
                                <p className="text-xs text-emerald-700">{successMessage}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Current Password (if account already has password) */}
                            {hasExistingPassword && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Current Password <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showCurrentPassword ? 'text' : 'password'}
                                            value={currentPassword}
                                            onChange={e => setCurrentPassword(e.target.value)}
                                            placeholder="Enter your current password"
                                            className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                                            required
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCurrentPassword(p => !p)}
                                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-1"
                                            title={showCurrentPassword ? "Hide password" : "Show password"}
                                        >
                                            {showCurrentPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* New Password */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    New Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Enter at least 4 characters"
                                        className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                                        required
                                        minLength={4}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(p => !p)}
                                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-1"
                                        title={showNewPassword ? "Hide password" : "Show password"}
                                    >
                                        {showNewPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Confirm New Password <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter your new password"
                                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                                    required
                                    autoComplete="new-password"
                                />
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <p className="text-[11px] text-red-500 font-medium mt-1">Passwords do not match yet.</p>
                                )}
                                {confirmPassword && newPassword === confirmPassword && (
                                    <p className="text-[11px] text-emerald-600 font-medium mt-1">✓ Passwords match.</p>
                                )}
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold flex items-center gap-2">
                                    <IconLock className="w-4 h-4 flex-shrink-0 text-red-500" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                                <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit" 
                                    disabled={isSaving}
                                    className="bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold px-5 py-2.5 text-sm shadow-md"
                                >
                                    {isSaving ? 'Saving...' : 'Save New Password'}
                                </Button>
                            </div>
                        </>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
