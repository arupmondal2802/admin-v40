import React from 'react';
import { Permission } from '../../types';
import * as authService from '../../services/authService';
import { IconShieldCheck } from '../ui/Icon';

interface PermissionEditorProps {
    currentPermissions: Permission[];
    onPermissionsChange: (newPermissions: Permission[]) => void;
    canEditAdminPermissions: boolean;
}

const PermissionCheckbox: React.FC<{
    permission: typeof authService.ALL_PERMISSIONS[0];
    isChecked: boolean;
    onChange: (id: Permission, checked: boolean) => void;
    disabled: boolean;
}> = ({ permission, isChecked, onChange, disabled }) => {

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(permission.id, e.target.checked);
    };

    return (
        <label
            title={permission.description}
            className={`flex items-start p-3 rounded-lg border transition-all duration-200 shadow-sm ${
               isChecked ? 'bg-blue-50 border-brand-blue ring-1 ring-brand-blue' : 'bg-white border-slate-300'
           } ${disabled ? 'cursor-not-allowed opacity-60 bg-slate-50' : 'cursor-pointer hover:border-brand-blue/70'}`}
        >
            <input
                type="checkbox"
                checked={isChecked}
                onChange={handleChange}
                disabled={disabled}
                className="h-5 w-5 rounded border-gray-300 text-brand-accent focus:ring-2 focus:ring-brand-accent/50 mt-0.5 flex-shrink-0"
            />
            <div className="ml-3">
                <p className="font-semibold text-slate-800 text-sm">{permission.label}</p>
                <p className="text-xs text-slate-500">{permission.description}</p>
            </div>
        </label>
    );
};

export const PermissionEditor: React.FC<PermissionEditorProps> = ({ currentPermissions, onPermissionsChange, canEditAdminPermissions }) => {
    
    const handlePermissionToggle = (id: Permission, checked: boolean) => {
        let newPermissions: Permission[];
        if (checked) {
            newPermissions = [...currentPermissions, id];
        } else {
            newPermissions = currentPermissions.filter(p => p !== id);
        }
        onPermissionsChange(newPermissions);
    };
    
    const userPermissions = authService.ALL_PERMISSIONS.filter(p => p.category === 'User');
    const adminPermissions = authService.ALL_PERMISSIONS.filter(p => p.category === 'Admin');
    const superAdminPermissions = authService.ALL_PERMISSIONS.filter(p => p.category === 'Super Admin');

    return (
        <div>
            <div className="flex items-center space-x-2">
                <IconShieldCheck className="w-5 h-5 text-slate-400"/>
                <h3 className="text-base font-semibold text-slate-600">Permissions</h3>
            </div>
            <hr className="my-3" />
            <div className="max-h-[45vh] overflow-y-auto pr-3 -mr-3">
                <div className="space-y-6">
                    <div>
                        <h4 className="font-bold text-slate-600 mb-2">Standard User Permissions</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {userPermissions.map(p => (
                                <PermissionCheckbox
                                    key={p.id}
                                    permission={p}
                                    isChecked={currentPermissions.includes(p.id)}
                                    onChange={handlePermissionToggle}
                                    disabled={false}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-600 mb-2">Manager & Admin Permissions</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {adminPermissions.map(p => (
                                <PermissionCheckbox
                                    key={p.id}
                                    permission={p}
                                    isChecked={currentPermissions.includes(p.id)}
                                    onChange={handlePermissionToggle}
                                    disabled={false}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-red-600 mb-2">Super Admin Permissions</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {superAdminPermissions.map(p => (
                                <PermissionCheckbox
                                    key={p.id}
                                    permission={p}
                                    isChecked={currentPermissions.includes(p.id)}
                                    onChange={handlePermissionToggle}
                                    disabled={!canEditAdminPermissions}
                                />
                            ))}
                        </div>
                        {!canEditAdminPermissions && (
                            <p className="text-xs text-slate-500 mt-2">Only users with the "Manage Admins" permission can alter Super Admin rights.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};