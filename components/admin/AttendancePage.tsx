
import React, { useState, useMemo, useCallback } from 'react';
import { User, AttendanceRecord, AttendanceStatus, LocationHistory } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  IconUserCheck, IconUserOff, IconClock, IconChevronDown,
  IconCalendarEvent, IconList, IconChevronLeft, IconChevronRight,
  IconDownload, IconSearch, IconAlertTriangle, IconCheck,
  IconMapPin, IconUsers, IconPencil, IconX, IconRefresh,
} from '../ui/Icon';
import SkeletonLoader from '../ui/SkeletonLoader';

interface AttendancePageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  users: Omit<User, 'password'>[];
  locationHistory: LocationHistory[];
  onAdminOverride: (username: string, status: AttendanceStatus, timestamp: string, note: string) => void;
}

interface ProcessedAttendance {
  username: string;
  firstIn: string | null;
  lastOut: string | null;
  totalDurationMs: number;
  breakDurationMs: number;
  status: 'Present' | 'Absent' | 'Active Now' | 'On Break';
  arrivalTag: 'On Time' | 'Late' | 'Very Late' | null;
  departureTag: 'Early Leave' | 'Normal' | 'Overtime' | null;
  logs: AttendanceRecord[];
}

const SHIFT_START_HOUR = 9;
const SHIFT_START_LATE_MINS = 30;
const SHIFT_END_HOUR = 18;
const TARGET_HOURS_MS = 8 * 60 * 60 * 1000;
const OVERTIME_THRESHOLD_MS = 9 * 60 * 60 * 1000;
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 21;

const formatDuration = (ms: number): string => {
  if (ms <= 0) return '-';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const formatDateTimeLocal = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const getStatusForDay = (user: Omit<User, 'password'>, date: Date): 'P' | 'A' | 'Active' | 'Abs' => {
  const dateStr = date.toDateString();
  const logs = user.attendanceHistory || [];
  const isCurrentlyActive = user.attendanceStatus === 'CHECKED_IN';
  const isToday = new Date().toDateString() === dateStr;
  if (isToday && isCurrentlyActive) return 'Active';
  const hasRecord = logs.some(log => new Date(log.timestamp).toDateString() === dateStr && log.status === 'CHECKED_IN');
  if (hasRecord) return 'P';
  if (date > new Date()) return 'Abs';
  return 'Abs';
};

const getHoursForDay = (user: Omit<User, 'password'>, date: Date): number => {
  const dateStr = date.toDateString();
  const logs = (user.attendanceHistory || [])
    .filter(log => new Date(log.timestamp).toDateString() === dateStr)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let totalMs = 0;
  let breakMs = 0;
  let lastInTime: number | null = null;
  let breakStartTime: number | null = null;
  logs.forEach(log => {
    if (log.status === 'CHECKED_IN') lastInTime = new Date(log.timestamp).getTime();
    else if (log.status === 'CHECKED_OUT' && lastInTime) {
      totalMs += new Date(log.timestamp).getTime() - lastInTime;
      lastInTime = null;
    } else if (log.status === 'BREAK_START') {
      breakStartTime = new Date(log.timestamp).getTime();
    } else if (log.status === 'BREAK_END' && breakStartTime) {
      breakMs += new Date(log.timestamp).getTime() - breakStartTime;
      breakStartTime = null;
    }
  });
  return Math.max(0, (totalMs - breakMs)) / 3600000;
};

const exportToCSV = (rows: ProcessedAttendance[], dateStr: string) => {
  const header = ['Agent', 'Status', 'First In', 'Last Out', 'Hours Worked', 'Break Time', 'Arrival', 'Departure'];
  const lines = rows.map(r => [
    r.username, r.status,
    r.firstIn ? formatTime(r.firstIn) : '-',
    r.lastOut ? formatTime(r.lastOut) : '-',
    formatDuration(r.totalDurationMs - r.breakDurationMs),
    formatDuration(r.breakDurationMs),
    r.arrivalTag || '-', r.departureTag || '-',
  ]);
  const csv = [header, ...lines].map(l => l.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `attendance_${dateStr}.csv`;
  a.click();
};

const exportMonthToCSV = (
  data: { user: Omit<User, 'password'>; row: { date: Date; status: string; hours: number }[]; totalPresent: number; totalHours: number }[],
  year: number, month: number
) => {
  const monthLabel = new Date(year, month).toLocaleDateString('default', { month: 'long', year: 'numeric' });
  const dates = data[0]?.row.map(d => d.date.getDate().toString()) || [];
  const header = ['Agent', ...dates, 'Present Days', 'Total Hours'];
  const lines = data.map(({ user, row, totalPresent, totalHours }) => [
    user.username,
    ...row.map(d => d.status === 'Abs' ? 'A' : d.hours > 0 ? d.hours.toFixed(1) : 'P'),
    totalPresent, totalHours.toFixed(1),
  ]);
  const csv = [header, ...lines].map(l => l.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `attendance_${monthLabel.replace(' ', '_')}.csv`;
  a.click();
};

const TimelineBar: React.FC<{ logs: AttendanceRecord[]; isActive: boolean; isOnBreak: boolean; date: Date }> = ({ logs, isActive, isOnBreak, date }) => {
  const totalRange = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
  const toPercent = (iso: string) => {
    const d = new Date(iso);
    const mins = (d.getHours() - TIMELINE_START_HOUR) * 60 + d.getMinutes();
    return Math.max(0, Math.min(100, (mins / totalRange) * 100));
  };

  const isToday = new Date().toDateString() === date.toDateString();
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const workSegments: { start: number; end: number; live: boolean }[] = [];
  const breakSegments: { start: number; end: number }[] = [];
  let lastIn: string | null = null;
  let breakStart: string | null = null;

  sorted.forEach(log => {
    if (log.status === 'CHECKED_IN') lastIn = log.timestamp;
    else if (log.status === 'CHECKED_OUT' && lastIn) {
      workSegments.push({ start: toPercent(lastIn), end: toPercent(log.timestamp), live: false });
      lastIn = null;
    } else if (log.status === 'BREAK_START') breakStart = log.timestamp;
    else if (log.status === 'BREAK_END' && breakStart) {
      breakSegments.push({ start: toPercent(breakStart), end: toPercent(log.timestamp) });
      breakStart = null;
    }
  });

  if (lastIn && (isActive || isToday)) {
    workSegments.push({ start: toPercent(lastIn), end: toPercent(new Date().toISOString()), live: true });
  }
  if (breakStart && (isOnBreak || isToday)) {
    breakSegments.push({ start: toPercent(breakStart), end: toPercent(new Date().toISOString()) });
  }

  const shiftStartPct = ((SHIFT_START_HOUR - TIMELINE_START_HOUR) / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * 100;

  if (logs.length === 0) return <div className="h-4 w-48 bg-slate-100 rounded-full" />;

  return (
    <div className="relative w-48 h-4">
      <div className="absolute inset-0 bg-slate-200 rounded-full overflow-hidden">
        <div className="absolute h-full bg-slate-300/50" style={{ left: `${shiftStartPct}%`, width: `${((SHIFT_END_HOUR - TIMELINE_START_HOUR) / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * 100 - shiftStartPct}%` }} />
        {workSegments.map((s, i) => (
          <div key={i} className={`absolute h-full rounded-sm ${s.live ? isOnBreak ? 'bg-amber-400' : 'bg-green-400 animate-pulse' : 'bg-brand-blue'}`}
            style={{ left: `${s.start}%`, width: `${Math.max(1, s.end - s.start)}%` }} />
        ))}
        {breakSegments.map((s, i) => (
          <div key={`b${i}`} className="absolute h-full bg-amber-300/60 border-x border-amber-400"
            style={{ left: `${s.start}%`, width: `${Math.max(1, s.end - s.start)}%` }} />
        ))}
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-orange-400" style={{ left: `${shiftStartPct}%` }} />
    </div>
  );
};

// ── Admin Override Modal ─────────────────────────────────────────────────────
interface OverrideModalProps {
  username: string;
  onSave: (username: string, status: AttendanceStatus, ts: string, note: string) => void;
  onClose: () => void;
}

const AdminOverrideModal: React.FC<OverrideModalProps> = ({ username, onSave, onClose }) => {
  const [status, setStatus] = useState<AttendanceStatus>('CHECKED_IN');
  const [ts, setTs] = useState<string>(formatDateTimeLocal(new Date().toISOString()));
  const [note, setNote] = useState('');

  const handleSave = () => {
    if (!ts) return;
    onSave(username, status, new Date(ts).toISOString(), note);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <IconPencil className="w-5 h-5 text-brand-blue" /> Manual Entry — {username}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full">
            <IconX className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Event Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['CHECKED_IN', 'CHECKED_OUT', 'BREAK_START', 'BREAK_END'] as AttendanceStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-2 text-sm rounded-lg border font-medium transition-all ${
                    status === s
                      ? s === 'CHECKED_IN' ? 'bg-green-600 text-white border-green-600'
                        : s === 'CHECKED_OUT' ? 'bg-red-600 text-white border-red-600'
                        : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {s === 'CHECKED_IN' ? 'Check In' : s === 'CHECKED_OUT' ? 'Check Out' : s === 'BREAK_START' ? 'Break Start' : 'Break End'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={ts}
              onChange={e => setTs(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Admin Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Technician forgot to check in"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!ts}>Save Entry</Button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const AttendancePage: React.FC<AttendancePageProps> = (props) => {
  const { users, locationHistory, onAdminOverride, isLoading, isHydrated } = props;
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'live'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [overrideUser, setOverrideUser] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedLiveAgent, setSelectedLiveAgent] = useState<string | null>(null);

  const nonAdminUsers = useMemo(() => (users || []).filter(u => u.role !== 'admin'), [users]);
  const liveAgents = useMemo(() => nonAdminUsers.filter(u => u.attendanceStatus === 'CHECKED_IN'), [nonAdminUsers]);

  // ── Day View ─────────────────────────────────────────────────────────────
  const processedDayData: ProcessedAttendance[] = useMemo(() => {
    const selectedDateObj = new Date(selectedDate + 'T00:00:00');
    const dateStr = selectedDateObj.toDateString();
    const isToday = new Date().toDateString() === dateStr;

    return nonAdminUsers.map(user => {
      const history = user.attendanceHistory || [];
      const dailyLogs = history
        .filter(log => new Date(log.timestamp).toDateString() === dateStr)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let firstIn: string | null = null;
      let lastOut: string | null = null;
      let totalDurationMs = 0;
      let breakDurationMs = 0;
      let currentState: AttendanceStatus | null = null;
      let lastInTime: number | null = null;
      let breakStartTime: number | null = null;

      dailyLogs.forEach(log => {
        if (log.status === 'CHECKED_IN') {
          if (!firstIn) firstIn = log.timestamp;
          if (!lastInTime) lastInTime = new Date(log.timestamp).getTime();
          currentState = 'CHECKED_IN';
        } else if (log.status === 'CHECKED_OUT') {
          lastOut = log.timestamp;
          if (lastInTime) { totalDurationMs += new Date(log.timestamp).getTime() - lastInTime; lastInTime = null; }
          currentState = 'CHECKED_OUT';
        } else if (log.status === 'BREAK_START') {
          breakStartTime = new Date(log.timestamp).getTime();
        } else if (log.status === 'BREAK_END' && breakStartTime) {
          breakDurationMs += new Date(log.timestamp).getTime() - breakStartTime;
          breakStartTime = null;
        }
      });

      if (currentState === 'CHECKED_IN' && lastInTime && isToday) {
        totalDurationMs += Date.now() - lastInTime;
      }
      if (breakStartTime && isToday) {
        breakDurationMs += Date.now() - breakStartTime;
      }

      const netMs = Math.max(0, totalDurationMs - breakDurationMs);

      const lastBreakStart = [...dailyLogs].reverse().find(r => r.status === 'BREAK_START');
      const lastBreakEnd = [...dailyLogs].reverse().find(r => r.status === 'BREAK_END');
      const onBreak = isToday && currentState === 'CHECKED_IN' && lastBreakStart &&
        (!lastBreakEnd || new Date(lastBreakStart.timestamp) > new Date(lastBreakEnd.timestamp));

      let status: ProcessedAttendance['status'] = 'Absent';
      if (onBreak) status = 'On Break';
      else if (currentState === 'CHECKED_IN' && isToday) status = 'Active Now';
      else if (dailyLogs.some(l => l.status === 'CHECKED_IN')) status = 'Present';

      let arrivalTag: ProcessedAttendance['arrivalTag'] = null;
      if (firstIn) {
        const d = new Date(firstIn);
        const mins = (d.getHours() - SHIFT_START_HOUR) * 60 + d.getMinutes();
        arrivalTag = mins <= SHIFT_START_LATE_MINS ? 'On Time' : mins <= 90 ? 'Late' : 'Very Late';
      }

      let departureTag: ProcessedAttendance['departureTag'] = null;
      if (netMs > 0) {
        departureTag = netMs >= OVERTIME_THRESHOLD_MS ? 'Overtime' : netMs >= TARGET_HOURS_MS ? 'Normal' : 'Early Leave';
      }

      return { username: user.username, firstIn, lastOut, totalDurationMs, breakDurationMs, status, arrivalTag, departureTag, logs: dailyLogs };
    }).sort((a, b) => {
      const rank = (s: string) => s === 'Active Now' ? 0 : s === 'On Break' ? 1 : s === 'Present' ? 2 : 3;
      return rank(a.status) - rank(b.status);
    });
  }, [nonAdminUsers, selectedDate]);

  const filteredDayData = useMemo(() =>
    searchQuery ? processedDayData.filter(d => d.username.toLowerCase().includes(searchQuery.toLowerCase())) : processedDayData,
    [processedDayData, searchQuery]);

  const summaryStats = useMemo(() => {
    const present = processedDayData.filter(d => d.status !== 'Absent').length;
    const absent = processedDayData.filter(d => d.status === 'Absent').length;
    const activeNow = processedDayData.filter(d => d.status === 'Active Now').length;
    const onBreak = processedDayData.filter(d => d.status === 'On Break').length;
    const withHours = processedDayData.filter(d => d.totalDurationMs > 0);
    const avgHoursMs = withHours.length > 0
      ? withHours.reduce((s, d) => s + Math.max(0, d.totalDurationMs - d.breakDurationMs), 0) / withHours.length
      : 0;
    return { present, absent, activeNow, onBreak, avgHours: formatDuration(avgHoursMs) };
  }, [processedDayData]);

  // ── Month View ────────────────────────────────────────────────────────────
  const daysInCurrentMonth = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentMonth, currentYear]);
  const monthDates = useMemo(() =>
    Array.from({ length: daysInCurrentMonth }, (_, i) => new Date(currentYear, currentMonth, i + 1)),
    [daysInCurrentMonth, currentMonth, currentYear]);

  const monthGridData = useMemo(() =>
    nonAdminUsers.map(user => {
      const row = monthDates.map(date => ({ date, status: getStatusForDay(user, date), hours: getHoursForDay(user, date) }));
      const totalPresent = row.filter(d => d.status === 'P' || d.status === 'Active').length;
      const totalHours = row.reduce((s, d) => s + d.hours, 0);
      return { user, row, totalPresent, totalHours };
    }), [nonAdminUsers, monthDates]);

  const monthSummary = useMemo(() => {
    const avgPresent = monthGridData.length > 0
      ? monthGridData.reduce((s, d) => s + d.totalPresent, 0) / monthGridData.length : 0;
    const avgHours = monthGridData.length > 0
      ? monthGridData.reduce((s, d) => s + d.totalHours, 0) / monthGridData.length : 0;
    return { avgPresent: avgPresent.toFixed(1), avgHours: avgHours.toFixed(1) };
  }, [monthGridData]);

  const getCellStyle = (status: string, hours: number) => {
    if (status === 'Active') return 'bg-blue-400 text-white animate-pulse';
    if (status === 'P') {
      if (hours >= 8) return 'bg-green-500 text-white';
      if (hours >= 5) return 'bg-green-300 text-green-900';
      return 'bg-yellow-300 text-yellow-900';
    }
    return 'bg-red-50 text-red-300';
  };

  const handleExportDay = useCallback(() => exportToCSV(processedDayData, selectedDate), [processedDayData, selectedDate]);
  const handleExportMonth = useCallback(() => exportMonthToCSV(monthGridData, currentYear, currentMonth), [monthGridData, currentYear, currentMonth]);

  // ── Live agent trip history ───────────────────────────────────────────────
  const agentTodayLocations = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return (agent: string) =>
      locationHistory
        .filter(h => h.userId === agent && h.timestamp.startsWith(today))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [locationHistory]);

  const computeTripDistance = (points: LocationHistory[]): number => {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const R = 6371;
      const dLat = ((points[i].latitude - points[i - 1].latitude) * Math.PI) / 180;
      const dLng = ((points[i].longitude - points[i - 1].longitude) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((points[i - 1].latitude * Math.PI) / 180) *
        Math.cos((points[i].latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  if (isLoading || isHydrated === false || !users) {
    return <SkeletonLoader view="ATTENDANCE" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Attendance Management</h1>
          <p className="text-slate-500 mt-1">Live tracking, shift logs, breaks, and monthly reports.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            {(['live', 'day', 'month'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${viewMode === mode ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
              >
                {mode === 'live' && <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span> Live</>}
                {mode === 'day' && <><IconList className="w-4 h-4" /> Day</>}
                {mode === 'month' && <><IconCalendarEvent className="w-4 h-4" /> Month</>}
              </button>
            ))}
          </div>
          {viewMode !== 'live' && (
            <Button variant="secondary" onClick={viewMode === 'day' ? handleExportDay : handleExportMonth}>
              <IconDownload className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* ── Live View ─────────────────────────────────────────────────── */}
      {viewMode === 'live' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">On Duty</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{liveAgents.length}</p>
              <p className="text-xs text-slate-400 mt-1">currently active</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Agents</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{nonAdminUsers.length}</p>
              <p className="text-xs text-slate-400 mt-1">staff members</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Off Duty</p>
              <p className="text-3xl font-bold text-slate-400 mt-1">{nonAdminUsers.length - liveAgents.length}</p>
              <p className="text-xs text-slate-400 mt-1">not checked in</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Pings</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {locationHistory.filter(h => h.timestamp.startsWith(new Date().toISOString().split('T')[0])).length}
              </p>
              <p className="text-xs text-slate-400 mt-1">GPS captures</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active agents list */}
            <Card title="Active Agents">
              <div className="space-y-2">
                {liveAgents.length === 0 && (
                  <p className="text-slate-400 text-sm py-6 text-center">No agents are currently on duty.</p>
                )}
                {liveAgents.map(agent => {
                  const lastUpdate = agent.lastLocationUpdate;
                  const todayPts = agentTodayLocations(agent.username);
                  const dist = computeTripDistance(todayPts);
                  const history = agent.attendanceHistory || [];
                  const lastIn = [...history].reverse().find(r => r.status === 'CHECKED_IN');
                  const shiftMs = lastIn ? Date.now() - new Date(lastIn.timestamp).getTime() : 0;
                  const isOnBreak = (() => {
                    const lastBreakStart = [...history].reverse().find(r => r.status === 'BREAK_START');
                    const lastBreakEnd = [...history].reverse().find(r => r.status === 'BREAK_END');
                    return lastBreakStart && (!lastBreakEnd || new Date(lastBreakStart.timestamp) > new Date(lastBreakEnd.timestamp));
                  })();
                  return (
                    <div
                      key={agent.username}
                      onClick={() => setSelectedLiveAgent(selectedLiveAgent === agent.username ? null : agent.username)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedLiveAgent === agent.username ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${isOnBreak ? 'bg-amber-400' : 'bg-green-500 animate-pulse'}`} />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{agent.username}</p>
                            <p className="text-xs text-slate-500">
                              {isOnBreak ? 'On Break' : 'Active'} · Shift: {formatDuration(shiftMs)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          {dist > 0.01 && <p className="font-semibold text-blue-600">{dist.toFixed(2)} km</p>}
                          {lastUpdate && <p>{formatTime(lastUpdate)}</p>}
                          <p>{todayPts.length} GPS pings</p>
                        </div>
                      </div>
                      {selectedLiveAgent === agent.username && agent.latitude && agent.longitude && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <IconMapPin className="w-3 h-3 text-green-500" />
                            Last known: {agent.latitude.toFixed(5)}°N, {agent.longitude.toFixed(5)}°E
                          </p>
                          {todayPts.length > 1 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-slate-500 mb-1">Today's GPS Trail ({todayPts.length} points)</p>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {todayPts.map((pt, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                                    <span>{formatTime(pt.timestamp)}</span>
                                    <span className="font-mono text-slate-400">{pt.latitude.toFixed(4)}, {pt.longitude.toFixed(4)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Offline agents */}
            <Card title="Off Duty Agents">
              <div className="space-y-2">
                {nonAdminUsers.filter(u => u.attendanceStatus !== 'CHECKED_IN').map(agent => {
                  const history = agent.attendanceHistory || [];
                  const today = new Date().toDateString();
                  const todayLogs = history.filter(r => new Date(r.timestamp).toDateString() === today);
                  const lastOut = [...todayLogs].reverse().find(r => r.status === 'CHECKED_OUT');
                  const hasWorkedToday = todayLogs.some(r => r.status === 'CHECKED_IN');
                  return (
                    <div key={agent.username} className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{agent.username}</p>
                          <p className="text-xs text-slate-400">
                            {hasWorkedToday ? `Checked out ${lastOut ? formatTime(lastOut.timestamp) : ''}` : 'Not checked in today'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setOverrideUser(agent.username)}
                        className="text-xs text-brand-blue hover:underline flex items-center gap-1"
                      >
                        <IconPencil className="w-3 h-3" /> Override
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Day View ──────────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Present', value: summaryStats.present, color: 'text-green-600', sub: `of ${processedDayData.length} agents` },
              { label: 'Absent', value: summaryStats.absent, color: 'text-red-500', sub: 'not checked in' },
              { label: 'Active Now', value: summaryStats.activeNow, color: 'text-blue-600', sub: 'on duty' },
              { label: 'Avg Net Hours', value: summaryStats.avgHours, color: 'text-slate-700', sub: 'excl. breaks' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200">
              <Input label="" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="!mt-0" />
            </div>
            <div className="flex-1 relative">
              <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search agent..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 bg-white rounded-lg px-4 py-2 border border-slate-200 shadow-sm flex-wrap">
            <span className="font-semibold text-slate-600">Legend:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-brand-blue inline-block" /> Worked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block animate-pulse" /> Live</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-300/60 inline-block" /> Break</span>
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-orange-400 inline-block" /> 9:00 AM</span>
          </div>

          <Card title={`Report: ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {['Agent', 'Status', 'Timeline (7AM–9PM)', 'First In', 'Last Out', 'Net Hours', 'Break', 'Flags', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredDayData.map(data => {
                    const selectedDateObj = new Date(selectedDate + 'T00:00:00');
                    const netMs = Math.max(0, data.totalDurationMs - data.breakDurationMs);
                    const hoursColor = netMs >= TARGET_HOURS_MS ? 'text-green-700 font-bold' : netMs >= 5 * 3600000 ? 'text-yellow-700 font-semibold' : netMs > 0 ? 'text-red-600' : 'text-slate-400';
                    const isOnBreak = data.status === 'On Break';
                    return (
                      <React.Fragment key={data.username}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-800 text-sm">{data.username}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full flex items-center gap-1 w-fit ${
                              data.status === 'Active Now' ? 'bg-green-100 text-green-800' :
                              data.status === 'On Break' ? 'bg-amber-100 text-amber-800' :
                              data.status === 'Present' ? 'bg-blue-100 text-blue-800' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {(data.status === 'Active Now' || data.status === 'On Break') &&
                                <span className={`w-1.5 h-1.5 rounded-full animate-ping ${data.status === 'On Break' ? 'bg-amber-500' : 'bg-green-500'}`} />}
                              {data.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap align-middle">
                            <TimelineBar logs={data.logs} isActive={data.status === 'Active Now'} isOnBreak={isOnBreak} date={selectedDateObj} />
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                            {data.firstIn ? (
                              <div>
                                <div>{formatTime(data.firstIn)}</div>
                                {data.arrivalTag && (
                                  <span className={`text-xs font-medium ${data.arrivalTag === 'On Time' ? 'text-green-600' : data.arrivalTag === 'Late' ? 'text-orange-500' : 'text-red-600'}`}>
                                    {data.arrivalTag === 'On Time' ? <IconCheck className="w-3 h-3 inline mr-0.5" /> : <IconAlertTriangle className="w-3 h-3 inline mr-0.5" />}
                                    {data.arrivalTag}
                                  </span>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                            {data.lastOut ? formatTime(data.lastOut) :
                              data.status === 'Active Now' ? <span className="text-green-600 text-xs font-bold">ON DUTY</span> :
                              data.status === 'On Break' ? <span className="text-amber-600 text-xs font-bold">ON BREAK</span> : '-'}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm font-mono ${hoursColor}`}>
                            {formatDuration(netMs)}
                            {netMs >= OVERTIME_THRESHOLD_MS && <div className="text-xs text-purple-600 font-normal font-sans">Overtime</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                            {data.breakDurationMs > 0 ? formatDuration(data.breakDurationMs) : '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {data.arrivalTag === 'Late' && <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200"><IconAlertTriangle className="w-3 h-3" /> Late</span>}
                              {data.arrivalTag === 'Very Late' && <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200"><IconAlertTriangle className="w-3 h-3" /> Very Late</span>}
                              {data.departureTag === 'Early Leave' && <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200"><IconAlertTriangle className="w-3 h-3" /> Early Leave</span>}
                              {data.departureTag === 'Overtime' && <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200"><IconClock className="w-3 h-3" /> Overtime</span>}
                              {data.status === 'Absent' && <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200"><IconUserOff className="w-3 h-3" /> No Record</span>}
                              {data.logs.some(l => l.isManualEntry) && <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200"><IconPencil className="w-3 h-3" /> Edited</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setOverrideUser(data.username)}
                                className="text-slate-400 hover:text-brand-blue hover:bg-blue-50 p-1.5 rounded-full transition-colors"
                                title="Admin override"
                              >
                                <IconPencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setExpandedUser(expandedUser === data.username ? null : data.username)}
                                className="text-brand-blue hover:bg-brand-blue/10 p-1.5 rounded-full transition-colors"
                                disabled={data.logs.length === 0}
                              >
                                <IconChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedUser === data.username ? 'rotate-180' : ''} ${data.logs.length === 0 ? 'opacity-30' : ''}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedUser === data.username && data.logs.length > 0 && (
                          <tr className="bg-slate-50">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="text-sm border-l-2 border-brand-blue pl-4 ml-4">
                                <p className="font-semibold text-slate-600 mb-3">Detailed Session Logs:</p>
                                <ul className="space-y-2">
                                  {data.logs.map((log, idx) => {
                                    const colorMap: Record<AttendanceStatus, string> = {
                                      CHECKED_IN: 'bg-green-500',
                                      CHECKED_OUT: 'bg-red-500',
                                      BREAK_START: 'bg-amber-400',
                                      BREAK_END: 'bg-blue-400',
                                    };
                                    const labelMap: Record<AttendanceStatus, string> = {
                                      CHECKED_IN: 'Checked In',
                                      CHECKED_OUT: 'Checked Out',
                                      BREAK_START: 'Break Started',
                                      BREAK_END: 'Break Ended',
                                    };
                                    const textColorMap: Record<AttendanceStatus, string> = {
                                      CHECKED_IN: 'text-green-700',
                                      CHECKED_OUT: 'text-red-700',
                                      BREAK_START: 'text-amber-700',
                                      BREAK_END: 'text-blue-700',
                                    };
                                    return (
                                      <li key={idx} className="flex items-start gap-3 text-slate-700">
                                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${colorMap[log.status]}`} />
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                          <span className="font-mono text-xs text-slate-400 w-20">{formatTime(log.timestamp)}</span>
                                          <span className={`font-semibold text-sm ${textColorMap[log.status]}`}>{labelMap[log.status]}</span>
                                          {log.latitude && log.longitude && (
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                              <IconMapPin className="w-3 h-3 text-slate-300" />
                                              {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                                            </span>
                                          )}
                                          {log.isManualEntry && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Admin Entry</span>}
                                          {log.note && <span className="text-xs text-slate-500 italic">"{log.note}"</span>}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredDayData.length === 0 && (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">No agents match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── Month View ────────────────────────────────────────────────── */}
      {viewMode === 'month' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agents Tracked</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{monthGridData.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Days in Month</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{daysInCurrentMonth}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Present Days</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{monthSummary.avgPresent}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Hours</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{monthSummary.avgHours}<span className="text-base font-normal text-slate-400 ml-1">h</span></p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200 bg-white"><IconChevronLeft className="w-5 h-5 text-slate-600" /></button>
            <span className="font-semibold text-slate-700 text-lg min-w-[180px] text-center">
              {new Date(currentYear, currentMonth).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200 bg-white"><IconChevronRight className="w-5 h-5 text-slate-600" /></button>
          </div>

          <div className="flex gap-3 text-xs flex-wrap">
            {[
              { cls: 'bg-green-500', label: '≥8h' },
              { cls: 'bg-green-300', label: '5–8h' },
              { cls: 'bg-yellow-300', label: '<5h' },
              { cls: 'bg-blue-400 animate-pulse', label: 'Active' },
              { cls: 'bg-red-50 border border-red-200', label: 'Absent' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-slate-500">
                <span className={`w-4 h-4 rounded ${l.cls}`} /> {l.label}
              </span>
            ))}
          </div>

          <Card title="">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase sticky left-0 bg-slate-50 z-10">Agent</th>
                    {monthDates.map(d => (
                      <th key={d.toISOString()} className={`px-1 py-3 text-center font-semibold w-8 ${d.toDateString() === new Date().toDateString() ? 'text-brand-blue' : 'text-slate-400'}`}>
                        {d.getDate()}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-bold text-slate-500 uppercase">Days</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-500 uppercase">Hours</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {monthGridData.map(({ user, row, totalPresent, totalHours }) => (
                    <tr key={user.username} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-700 sticky left-0 bg-white z-10 whitespace-nowrap">{user.username}</td>
                      {row.map(({ date, status, hours }) => (
                        <td key={date.toISOString()} className="px-0.5 py-2 text-center">
                          <div className={`w-7 h-7 rounded text-[10px] flex items-center justify-center mx-auto font-semibold ${getCellStyle(status, hours)}`}>
                            {status === 'Active' ? '●' : status === 'P' ? hours > 0 ? hours.toFixed(0) : 'P' : 'A'}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-green-700">{totalPresent}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">{totalHours.toFixed(1)}h</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => setOverrideUser(user.username)} className="text-brand-blue hover:bg-blue-50 p-1 rounded transition-colors"><IconPencil className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Admin Override Modal */}
      {overrideUser && (
        <AdminOverrideModal
          username={overrideUser}
          onSave={onAdminOverride}
          onClose={() => setOverrideUser(null)}
        />
      )}
    </div>
  );
};

export default AttendancePage;
