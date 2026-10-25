import React, { useState, useMemo } from 'react';
import { Service, ServiceStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { toISTDateString } from '../../utils/dateTimeUtils';

interface Props {
  services: Service[];
  onScheduleService: () => void;
  onDropOnDate: (serviceId: string, date: Date) => void;
}

const ServiceCalendar: React.FC<Props> = ({ services, onScheduleService, onDropOnDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const daysInMonth = Array.from({ length: lastDayOfMonth.getDate() }, (_, i) => new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1));
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday

  const servicesByDate = useMemo(() => {
    const map = new Map<string, Service[]>();
    services.forEach(service => {
      if (service.scheduledDate) {
        // Use toISTDateString to avoid timezone-shifting
        const dateKey = toISTDateString(service.scheduledDate);
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push(service);
      }
    });
    return map;
  }, [services]);

  const statusConfig: Record<ServiceStatus, { bg: string, text: string, border: string }> = {
    [ServiceStatus.Completed]: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400' },
    [ServiceStatus.InProgress]: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-400' },
    [ServiceStatus.Assigned]: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-400' },
    [ServiceStatus.Queued]: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-400' },
    [ServiceStatus.Draft]: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-400' },
    [ServiceStatus.Cancelled]: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-400' },
  };
  
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, dateKey: string) => {
    e.preventDefault();
    setDragOverDateKey(dateKey);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverDateKey(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault();
    setDragOverDateKey(null);
    const serviceId = e.dataTransfer.getData('text/plain');
    if (serviceId) {
        onDropOnDate(serviceId, day);
    }
  };


  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold text-slate-700">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex space-x-1">
                 <Button size="sm" variant="ghost" onClick={handlePrevMonth}>&larr;</Button>
                 <Button size="sm" variant="ghost" onClick={handleNextMonth}>&rarr;</Button>
            </div>
        </div>
        <Button onClick={onScheduleService}>
          Schedule Manually
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
        {weekDays.map(day => (
            <div key={day} className="text-center py-1 bg-slate-50 text-[10px] sm:text-xs font-bold text-slate-600 uppercase sm:py-2">{day}</div>
        ))}

        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-slate-50"></div>
        ))}
        
        {daysInMonth.map((day) => {
          const dateKey = toISTDateString(day);
          const todaysServices = servicesByDate.get(dateKey) || [];
          const isDragOver = dragOverDateKey === dateKey;
          return (
            <div 
              key={dateKey} 
              className={`relative min-h-[100px] p-1 sm:p-2 transition-colors ${isDragOver ? 'bg-brand-accent/20' : 'bg-white'}`}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, dateKey)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day)}
            >
              <span className="font-semibold text-slate-600">{day.getDate()}</span>
              <div className="mt-1 space-y-1">
                {todaysServices.map(service => {
                  const config = statusConfig[service.status] || statusConfig.Draft;
                  return (
                    <div key={service.submissionId} title={`${service.customerFirstName} - Assigned to: ${service.assignedTo || 'N/A'}`} className={`p-1 rounded-md text-xs ${config.bg} ${config.text} border-l-4 ${config.border} cursor-pointer`}>
                      <div className="flex justify-between items-center">
                        <p className="font-semibold truncate">{service.customerFirstName}</p>
                        {service.isAutoScheduled && <span className="font-bold text-purple-600">A</span>}
                      </div>
                      <p className="truncate">{service.carBrandModel}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  );
};

export default ServiceCalendar;