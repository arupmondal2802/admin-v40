

import React, { useState, useMemo } from 'react';
// FIX: Removed obsolete 'PredefinedAddon' from imports.
import { Service, ServiceStatus, User, AuditLog } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { AppointmentCard } from '../dashboard/AppointmentCard';
import ServiceCalendar from '../dashboard/ServiceCalendar';
import { IconFilter } from '../ui/Icon';
import { parseDateTime, isSameDay, toISTDateString } from '../../utils/dateTimeUtils';
import SkeletonLoader from '../ui/SkeletonLoader';

interface AppointmentsOverviewPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  currentUser: User;
  auditLogs?: AuditLog[];
  onStartOrder: (serviceId: string) => void;
  onUpdateOrder: (service: Service) => void;
  onCompleteOrder?: (service: Service) => void;
  onShareOrder: (service: Service) => void;
  // FIX: Removed obsolete 'predefinedAddons' prop.
}

const ITEMS_PER_PAGE = 10;

const AppointmentsOverviewPage: React.FC<AppointmentsOverviewPageProps> = (props) => {
    const [view, setView] = useState<'LIST' | 'CALENDAR'>('LIST');
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        status: '',
        searchTerm: ''
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [isFilterVisible, setIsFilterVisible] = useState(false);

    const myAppointments = useMemo(() => {
        const list = props.submissions || [];
        const username = props.currentUser?.username;
        if (!username) return [];
        return list
            .filter(s => 
                s.assignedTo === username &&
                s.status !== ServiceStatus.Completed &&
                s.status !== ServiceStatus.Draft
            )
            .sort((a, b) => {
                const dateA = parseDateTime(a);
                const dateB = parseDateTime(b);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateA.getTime() - dateB.getTime();
            });
    }, [props.submissions, props.currentUser?.username]);

    const filteredAppointments = useMemo(() => {
        return myAppointments.filter(s => {
            if (s.scheduledDate) {
                const scheduledDateStr = toISTDateString(s.scheduledDate);
                
                if (filters.startDate && scheduledDateStr < filters.startDate) return false;
                if (filters.endDate && scheduledDateStr > filters.endDate) return false;
            } else if (filters.startDate || filters.endDate) {
                return false; // Exclude unscheduled if date filter is active
            }

            if (filters.status && s.status !== filters.status) return false;
            
            const term = filters.searchTerm.toLowerCase();
            if (term) {
                const customerName = `${s.customerFirstName} ${s.customerLastName}`.toLowerCase();
                const carInfo = `${s.carBrandModel} ${s.carNumber}`.toLowerCase();
                if (!customerName.includes(term) && !carInfo.includes(term)) return false;
            }
            return true;
        });
    }, [myAppointments, filters]);
    
    const paginatedAppointments = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAppointments.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAppointments, currentPage]);

    if (props.isLoading || props.isHydrated === false || !props.submissions || !props.currentUser) {
        return <SkeletonLoader view="APPOINTMENTS" />;
    }
    
    const totalPages = Math.ceil(filteredAppointments.length / ITEMS_PER_PAGE);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setCurrentPage(1);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">My Appointments</h1>

            <Card>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div className="flex rounded-md shadow-sm">
                        <button onClick={() => setView('LIST')} className={`px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${view === 'LIST' ? 'bg-brand-blue text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}>List View</button>
                        <button onClick={() => setView('CALENDAR')} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-md transition-colors ${view === 'CALENDAR' ? 'bg-brand-blue text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}>Calendar View</button>
                    </div>
                     {view === 'LIST' && (
                        <Button onClick={() => setIsFilterVisible(!isFilterVisible)} variant="ghost">
                            <IconFilter className="w-5 h-5 mr-2" />
                            {isFilterVisible ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                    )}
                </div>
                 {isFilterVisible && view === 'LIST' && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Input label="From Date" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                            <Input label="To Date" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                             <div>
                                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                <select id="status" name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm">
                                    <option value="">All Statuses</option>
                                    <option value={ServiceStatus.Assigned}>Assigned</option>
                                    <option value={ServiceStatus.InProgress}>In Progress</option>
                                </select>
                            </div>
                            <Input label="Search Customer/Car" name="searchTerm" value={filters.searchTerm} onChange={handleFilterChange} />
                        </div>
                    </div>
                )}
            </Card>

            {view === 'LIST' && (
                <>
                    <div className="space-y-4">
                        {paginatedAppointments.length > 0 ? paginatedAppointments.map(service => (
                            <AppointmentCard 
                                key={service.submissionId} 
                                service={service} 
                                allSubmissions={props.submissions}
                                currentUser={props.currentUser} 
                                auditLogs={props.auditLogs}
                                onStart={() => props.onStartOrder(service.submissionId)}
                                onUpdate={() => props.onUpdateOrder(service)}
                                onCompleteOrder={props.onCompleteOrder || props.onUpdateOrder}
                                onShareOrder={props.onShareOrder}
                                isToday={isSameDay(parseDateTime(service), new Date())}
                            />
                        )) : (
                            <Card><p className="text-center text-slate-500 py-8">No appointments match your criteria.</p></Card>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center space-x-4 mt-6">
                            <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} variant="secondary">Previous</Button>
                            <span className="text-slate-600 font-semibold">Page {currentPage} of {totalPages}</span>
                            <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} variant="secondary">Next</Button>
                        </div>
                    )}
                </>
            )}

            {view === 'CALENDAR' && (
                <ServiceCalendar 
                    services={myAppointments}
                    onScheduleService={() => {}} 
                    onDropOnDate={() => {}}
                />
            )}
        </div>
    );
};

export default AppointmentsOverviewPage;
