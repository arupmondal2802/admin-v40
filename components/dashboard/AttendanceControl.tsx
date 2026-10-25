
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, AttendanceStatus, AttendanceRecord } from '../../types';
import Button from '../ui/Button';
import { IconUserCheck, IconUserOff, IconClock, IconMapPin, IconLoader, IconAlertTriangle } from '../ui/Icon';
import Card from '../ui/Card';
import { captureLocation, formatCoords, haversineDistanceKm } from '../../services/locationService';

interface AttendanceControlProps {
  currentUser: User;
  onUpdateAttendanceStatus: (
    username: string,
    status: AttendanceStatus,
    coords?: { latitude: number; longitude: number },
    note?: string
  ) => void;
}

const ShiftTimer: React.FC<{ startTime: string; pausedMs: number }> = ({ startTime, pausedMs }) => {
  const [duration, setDuration] = useState('00:00:00');

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const tick = () => {
      const elapsed = Date.now() - start - pausedMs;
      const safe = Math.max(0, elapsed);
      const h = Math.floor(safe / 3600000);
      const m = Math.floor((safe % 3600000) / 60000);
      const s = Math.floor((safe % 60000) / 1000);
      setDuration(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, pausedMs]);

  return <span className="font-mono text-2xl font-bold tracking-widest">{duration}</span>;
};

const BreakTimer: React.FC<{ startTime: string }> = ({ startTime }) => {
  const [dur, setDur] = useState('00:00');
  useEffect(() => {
    const start = new Date(startTime).getTime();
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - start);
      const m = Math.floor(elapsed / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      setDur(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return <span className="font-mono font-bold text-amber-700">{dur}</span>;
};

const formatDurationMs = (ms: number): string => {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const AttendanceControl: React.FC<AttendanceControlProps> = ({ currentUser, onUpdateAttendanceStatus }) => {
  const [pendingAction, setPendingAction] = useState<AttendanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const prevCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const history: AttendanceRecord[] = currentUser.attendanceHistory || [];
  const isCheckedIn = currentUser.attendanceStatus === 'CHECKED_IN';

  const lastCheckIn = [...history].reverse().find(r => r.status === 'CHECKED_IN');
  const lastBreakStart = [...history].reverse().find(r => r.status === 'BREAK_START');
  const lastBreakEnd = [...history].reverse().find(r => r.status === 'BREAK_END');

  const isOnBreak = isCheckedIn && lastBreakStart &&
    (!lastBreakEnd || new Date(lastBreakStart.timestamp) > new Date(lastBreakEnd.timestamp));

  const currentSessionStart = lastCheckIn?.timestamp ?? new Date().toISOString();

  const totalBreakMs = (() => {
    if (!lastCheckIn) return 0;
    const sessionStart = new Date(lastCheckIn.timestamp).getTime();
    const todayHistory = history.filter(r => new Date(r.timestamp).getTime() >= sessionStart);
    let totalMs = 0;
    let breakStartTs: number | null = null;
    for (const rec of todayHistory) {
      if (rec.status === 'BREAK_START') breakStartTs = new Date(rec.timestamp).getTime();
      else if (rec.status === 'BREAK_END' && breakStartTs) {
        totalMs += new Date(rec.timestamp).getTime() - breakStartTs;
        breakStartTs = null;
      }
    }
    if (isOnBreak && breakStartTs) totalMs += Date.now() - breakStartTs;
    return totalMs;
  })();

  useEffect(() => {
    if (!isCheckedIn) return;
    const coords = currentUser.latitude && currentUser.longitude
      ? { latitude: currentUser.latitude, longitude: currentUser.longitude }
      : null;
    if (coords) {
      setGpsCoords(coords);
      if (prevCoordsRef.current) {
        const d = haversineDistanceKm(
          prevCoordsRef.current.latitude, prevCoordsRef.current.longitude,
          coords.latitude, coords.longitude
        );
        setDistanceKm(prev => prev + d);
      }
      prevCoordsRef.current = coords;
    }
  }, [currentUser.latitude, currentUser.longitude, isCheckedIn]);

  const handleAction = (action: AttendanceStatus) => {
    if (!isCheckedIn && action !== 'CHECKED_IN') return;
    setPendingAction(action);
  };

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setIsLoading(true);
    console.info(`[AttendanceControl] handleConfirm: action=${pendingAction} user=${currentUser.username}`);

    const action = pendingAction;
    if (action === 'CHECKED_OUT') {
      setDistanceKm(0);
      prevCoordsRef.current = null;
    }

    // Try to get GPS coords but cap the wait at 4 seconds so check-in
    // never hangs waiting for a slow or denied location prompt.
    let coords: { latitude: number; longitude: number } | undefined;
    if (action === 'CHECKED_IN' || action === 'CHECKED_OUT') {
      const fastTimeout = new Promise<null>(res => setTimeout(() => res(null), 4000));
      const captured = await Promise.race([captureLocation(), fastTimeout]);
      if (captured) {
        coords = { latitude: captured.latitude, longitude: captured.longitude };
        setGpsCoords(coords);
        setGpsDenied(false);
      } else {
        setGpsDenied(true);
      }
    }

    console.info(`[AttendanceControl] calling onUpdateAttendanceStatus: user=${currentUser.username} action=${action} hasCoords=${!!coords}`);
    // Commit the status change — works even when users array is empty
    // because handleUpdateAttendanceStatus falls back to currentUser directly.
    onUpdateAttendanceStatus(currentUser.username, action, coords);
    setIsLoading(false);
    setPendingAction(null);
  }, [pendingAction, currentUser.username, onUpdateAttendanceStatus]);

  const todayBreaks = (() => {
    if (!lastCheckIn) return [];
    const sessionStart = new Date(lastCheckIn.timestamp).getTime();
    const sessionHistory = history.filter(r => new Date(r.timestamp).getTime() >= sessionStart);
    const breaks: { start: string; end: string | null }[] = [];
    let bStart: string | null = null;
    for (const r of sessionHistory) {
      if (r.status === 'BREAK_START') bStart = r.timestamp;
      else if (r.status === 'BREAK_END' && bStart) {
        breaks.push({ start: bStart, end: r.timestamp });
        bStart = null;
      }
    }
    if (bStart) breaks.push({ start: bStart, end: null });
    return breaks;
  })();

  const actionLabels: Record<AttendanceStatus, string> = {
    CHECKED_IN: 'Start Shift & Enable GPS',
    CHECKED_OUT: 'End Shift',
    BREAK_START: 'Start Break',
    BREAK_END: 'End Break',
  };

  const actionVariant = (a: AttendanceStatus): 'primary' | 'danger' | 'secondary' => {
    if (a === 'CHECKED_IN') return 'primary';
    if (a === 'CHECKED_OUT') return 'danger';
    return 'secondary';
  };

  const confirmTitle =
    pendingAction === 'CHECKED_IN' ? 'Start Your Shift' :
    pendingAction === 'CHECKED_OUT' ? 'End Your Shift' :
    pendingAction === 'BREAK_START' ? 'Go on Break' : 'Resume Shift';

  return (
    <>
      {/* Attendance confirmation dialog — rendered as plain JSX to avoid component-inside-render remounting */}
      {pendingAction && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => !isLoading && setPendingAction(null)}
        >
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm">
            <Card title={confirmTitle}>
              <div className="text-center py-4 space-y-3">
                {pendingAction === 'CHECKED_IN' && (
                  <>
                    <div className="p-4 bg-green-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                      <IconMapPin className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-sm text-slate-600">Checking in will capture your GPS location and start live tracking every 5 minutes.</p>
                  </>
                )}
                {pendingAction === 'CHECKED_OUT' && (
                  <>
                    <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                      <IconUserOff className="w-8 h-8 text-red-600" />
                    </div>
                    <p className="text-sm text-slate-600">This will record your check-out location, stop GPS tracking and end your shift timer.</p>
                    {distanceKm > 0 && (
                      <p className="text-xs text-slate-400">Trip distance this session: <strong>{distanceKm.toFixed(2)} km</strong></p>
                    )}
                  </>
                )}
                {pendingAction === 'BREAK_START' && (
                  <>
                    <div className="p-4 bg-amber-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                      <IconClock className="w-8 h-8 text-amber-600" />
                    </div>
                    <p className="text-sm text-slate-600">Starting a break will pause your active shift timer.</p>
                  </>
                )}
                {pendingAction === 'BREAK_END' && (
                  <>
                    <div className="p-4 bg-blue-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                      <IconUserCheck className="w-8 h-8 text-blue-600" />
                    </div>
                    <p className="text-sm text-slate-600">Resuming your shift and restarting the shift timer.</p>
                  </>
                )}
                {gpsDenied && (
                  <p className="text-xs text-orange-600 flex items-center justify-center gap-1">
                    <IconAlertTriangle className="w-3 h-3" /> GPS unavailable — check-in/out will proceed without location.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={isLoading}>Cancel</Button>
                <Button
                  variant={actionVariant(pendingAction)}
                  onClick={handleConfirm}
                  disabled={isLoading}
                >
                  {isLoading ? <IconLoader className="w-4 h-4 animate-spin" /> : 'Confirm'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className={`rounded-xl shadow-sm border transition-all duration-500 overflow-hidden relative ${
        isCheckedIn
          ? isOnBreak
            ? 'bg-gradient-to-br from-white to-amber-50 border-amber-200'
            : 'bg-gradient-to-br from-white to-green-50 border-green-200'
          : 'bg-white border-slate-200'
      }`}>

        {isCheckedIn && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {isOnBreak ? (
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider bg-amber-100 px-2 py-1 rounded-full">On Break</span>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-xs font-bold text-green-700 uppercase tracking-wider">Live GPS</span>
              </>
            )}
          </div>
        )}

        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">

            {/* Status + location */}
            <div className="flex items-center gap-4">
              <div className={`p-3.5 rounded-full shadow-inner ${
                isCheckedIn ? isOnBreak ? 'bg-amber-100' : 'bg-green-100' : 'bg-slate-100'
              }`}>
                {isCheckedIn
                  ? <IconUserCheck className={`w-7 h-7 ${isOnBreak ? 'text-amber-600' : 'text-green-600'}`} />
                  : <IconUserOff className="w-7 h-7 text-slate-400" />
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</p>
                <h3 className={`text-lg font-bold ${
                  isCheckedIn ? isOnBreak ? 'text-amber-700' : 'text-green-700' : 'text-slate-600'
                }`}>
                  {isCheckedIn ? isOnBreak ? 'On Break' : 'On Duty' : 'Off Duty'}
                </h3>
                {isCheckedIn && gpsCoords && !isOnBreak && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <IconMapPin className="w-3 h-3 text-green-500" />
                    {formatCoords(gpsCoords.latitude, gpsCoords.longitude)}
                  </p>
                )}
              </div>
            </div>

            {/* Timers */}
            {isCheckedIn && (
              <div className="flex gap-3 flex-wrap">
                <div className="flex flex-col items-center bg-white/70 px-4 py-2 rounded-lg border border-slate-100 min-w-[130px]">
                  <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                    <IconClock className="w-3 h-3" /> Shift Time
                  </p>
                  <div className={isOnBreak ? 'text-slate-400' : 'text-green-800'}>
                    <ShiftTimer startTime={currentSessionStart} pausedMs={totalBreakMs} />
                  </div>
                </div>
                {isOnBreak && lastBreakStart && (
                  <div className="flex flex-col items-center bg-amber-50/80 px-4 py-2 rounded-lg border border-amber-200 min-w-[110px]">
                    <p className="text-xs text-amber-600 mb-1">Break Duration</p>
                    <BreakTimer startTime={lastBreakStart.timestamp} />
                  </div>
                )}
                {distanceKm > 0.01 && (
                  <div className="flex flex-col items-center bg-blue-50/70 px-4 py-2 rounded-lg border border-blue-100 min-w-[100px]">
                    <p className="text-xs text-blue-500 mb-1">Distance</p>
                    <span className="font-mono font-bold text-blue-700 text-lg">{distanceKm.toFixed(2)}<span className="text-xs font-normal ml-1">km</span></span>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {!isCheckedIn && (
                <Button
                  onClick={() => handleAction('CHECKED_IN')}
                  variant="primary"
                  className="py-2.5 px-5 shadow-sm"
                >
                  Start Shift
                </Button>
              )}
              {isCheckedIn && !isOnBreak && (
                <Button
                  onClick={() => handleAction('BREAK_START')}
                  variant="secondary"
                  className="py-2.5 px-4 text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                >
                  Break
                </Button>
              )}
              {isCheckedIn && isOnBreak && (
                <Button
                  onClick={() => handleAction('BREAK_END')}
                  variant="secondary"
                  className="py-2.5 px-4 text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
                >
                  Resume
                </Button>
              )}
              {isCheckedIn && (
                <Button
                  onClick={() => handleAction('CHECKED_OUT')}
                  variant="danger"
                  className="py-2.5 px-5 shadow-sm"
                >
                  End Shift
                </Button>
              )}
            </div>
          </div>

          {/* Today's break log */}
          {isCheckedIn && todayBreaks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Today's Breaks</p>
              <div className="flex flex-wrap gap-2">
                {todayBreaks.map((b, i) => {
                  const startMs = new Date(b.start).getTime();
                  const endMs = b.end ? new Date(b.end).getTime() : Date.now();
                  const durMs = endMs - startMs;
                  return (
                    <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      Break {i + 1}: {formatDurationMs(durMs)}{b.end ? '' : ' (active)'}
                    </span>
                  );
                })}
                <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                  Total break: {formatDurationMs(totalBreakMs)}
                </span>
              </div>
            </div>
          )}
        </div>

        {!isCheckedIn && (
          <div className="bg-slate-50 px-5 py-2 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <IconUserOff className="w-3 h-3" />
            Location tracking is off. Start your shift to enable GPS.
          </div>
        )}
      </div>

    </>
  );
};

export default AttendanceControl;
