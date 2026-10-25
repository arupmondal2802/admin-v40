
import React, { useMemo } from 'react';
// FIX: Imports are now valid as types.ts has been updated.
import { Service, ServiceStatus, User, Permission } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { IconDownload } from './ui/Icon';

// Let TypeScript know that the XLSX object will be available globally from the CDN script
declare var XLSX: any;

interface MetricsReportProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  currentUser: User;
}

const MetricDisplay: React.FC<{ label: string; value: string | number; className?: string }> = ({ label, value, className }) => (
    <div className={`p-4 bg-slate-100 rounded-lg text-center ${className}`}>
        <p className="text-sm font-semibold text-slate-600 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-brand-blue">{value}</p>
    </div>
);

export const MetricsReport: React.FC<MetricsReportProps> = ({ submissions, users, currentUser }) => {

    const metrics = useMemo(() => {
        // Base all calculations on completed services from the provided submissions list.
        const completedServices = submissions.filter(s => s.status === ServiceStatus.Completed);
        
        const totalRevenue = completedServices.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0);
        const completedCount = completedServices.length;
        const averageRevenue = completedCount > 0 ? totalRevenue / completedCount : 0;
        
        const serviceCounts = completedServices.flatMap(s => s.serviceSelection).reduce((acc, service) => {
            acc[service] = (acc[service] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            completedCount,
            totalRevenue: totalRevenue.toFixed(2),
            averageRevenue: averageRevenue.toFixed(2),
            serviceCounts
        };
    }, [submissions]);

    const handleExportXlsx = () => {
        // Only export completed services that are being reported on.
        const completedServices = submissions.filter(s => s.status === ServiceStatus.Completed);

        if (completedServices.length === 0) {
            alert("No completed services in the current view to export.");
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert("Error: The reporting library (SheetJS) could not be loaded. Please check your internet connection and refresh the page.");
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const reportDate = new Date();
        const fileName = `completed_services_report_${reportDate.toISOString().split('T')[0]}.xlsx`;

        const submissionsFlat = completedServices.map(s => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { tyreDetails, batteryDetails, customServices, categorizedAddons, dynamicAddons, customFieldData, dependsOn, ...rest } = s;
            return {
                ...rest,
                serviceSelection: (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).join(', '), // convert array to string for excel
                dynamicAddons: (Array.isArray(s.dynamicAddons) ? s.dynamicAddons : []).map(a => `${a?.name || ''} (Qty: ${a?.quantity || 0})`).join(', '),
                categorizedAddons: (Array.isArray(s.categorizedAddons) ? s.categorizedAddons : []).map(a => `${a?.productName || ''} (Qty: ${a?.quantity || 0})`).join(', '),
                customServices: (Array.isArray(s.customServices) ? s.customServices : []).map(cs => cs?.serviceDescription || '').join(', '),
            };
        });

        const ws_submissions = XLSX.utils.json_to_sheet(submissionsFlat);
        XLSX.utils.book_append_sheet(wb, ws_submissions, 'CompletedServices');
        
        XLSX.writeFile(wb, fileName);
    };

    return (
        <Card className="mb-8">
            <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
                 <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Metrics for Completed Services</h2>
                 {currentUser?.permissions && Array.isArray(currentUser.permissions) && currentUser.permissions.includes(Permission.CAN_MANAGE_ADMINS) && (
                    <Button onClick={handleExportXlsx} disabled={metrics.completedCount === 0}>
                        <IconDownload className="w-5 h-5 mr-2" />
                        Export Completed (Excel)
                    </Button>
                 )}
            </div>
           
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricDisplay label="Completed Services" value={metrics.completedCount} />
                <MetricDisplay label="Total Revenue" value={`₹${metrics.totalRevenue}`} />
                <MetricDisplay label="Average Revenue" value={`₹${metrics.averageRevenue}`} />
            </div>

            {Object.keys(metrics.serviceCounts).length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4">Completed Service Breakdown</h3>
                    <div className="flex flex-wrap gap-4">
                        {/* FIX: Cast entries to explicitly typed [string, number][] to fix rendering errors. */}
                        {(Object.entries(metrics.serviceCounts) as [string, number][]).map(([service, count]) => (
                             <div key={service} className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg">
                                <span className="font-semibold">{service}:</span> {count}
                             </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
};
