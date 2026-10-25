import React, { useState, useMemo } from 'react';
import { Service, ServiceStatus, User, RankThresholds } from '../../types';
import Card from '../ui/Card';
import { IconTrophy } from '../ui/Icon';
import { getAgentRank } from '../admin/AgentEarningsTracker';
import HorizontalProgressBar from '../ui/HorizontalProgressBar';
import * as authService from '../../services/authService';

interface Props {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  agentRankThresholds?: RankThresholds;
}

const UserPerformanceTracker: React.FC<Props> = ({ submissions, users, agentRankThresholds }) => {
  const [activeLeaderboard, setActiveLeaderboard] = useState<'TECHNICIANS' | 'SALES_AGENTS'>('TECHNICIANS');

  // Filter users based on operational category. For Sales Agents, allow managers who opted in (isSalesKpiTracked).
  const targetUsers = useMemo(() => {
    return users.filter(u => {
      if (activeLeaderboard === 'TECHNICIANS') {
        if (authService.isAdminOrManagerUser(u)) return false;
        return authService.isTechnicianUser(u);
      } else {
        // Sales Agents: allow dedicated agents as well as opted-in managers
        return authService.isSalesAgentUser(u);
      }
    });
  }, [users, activeLeaderboard]);

  const performanceData = useMemo(() => {
    const completedServices = submissions.filter(s => s.status === ServiceStatus.Completed && !s.isDeleted);
    
    // Calculate raw counts and revenue for each filtered user
    const userStats = targetUsers.map(user => {
        const servicesByUser = completedServices.filter(s => {
          if (activeLeaderboard === 'TECHNICIANS') {
            return s.assignedTo === user.username || s.secondaryAssignee === user.username;
          } else {
            return s.submittedBy === user.username || (s as any).salesAgent === user.username;
          }
        });
        const count = servicesByUser.length;
        const revenue = servicesByUser.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
        return { username: user.username, count, revenue, userObj: user };
    });

    // Sort by count descending, then revenue descending as a tie-breaker
    userStats.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return b.revenue - a.revenue;
    });

    const maxCount = userStats.length > 0 ? userStats[0].count : 0;
    
    // Add rank and percentage
    return userStats.map((stat, index) => ({
        ...stat,
        rank: index + 1,
        percentage: maxCount > 0 ? (stat.count / maxCount) * 100 : 0
    }));

  }, [submissions, targetUsers]);

  return (
    <Card title="User Performance & Operational Leaderboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <p className="text-sm text-slate-500">
          Rankings filtered strictly by operational category. Admins & Managers are excluded from field performance calculations.
        </p>

        {/* Category Switcher Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveLeaderboard('TECHNICIANS')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeLeaderboard === 'TECHNICIANS' ? 'bg-white shadow-xs text-amber-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🔧 Technicians ({users.filter(u => authService.isTechnicianUser(u)).length})
          </button>
          <button
            onClick={() => setActiveLeaderboard('SALES_AGENTS')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeLeaderboard === 'SALES_AGENTS' ? 'bg-white shadow-xs text-indigo-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            📈 Sales Agents ({users.filter(u => authService.isSalesAgentUser(u)).length})
          </button>
        </div>
      </div>

      {performanceData.length === 0 ? (
         <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <p className="text-slate-500 text-sm font-medium">No active users in this operational category or no completed services recorded.</p>
         </div>
      ) : (
        <div className="space-y-4">
            {performanceData.map(({ username, count, revenue, rank, percentage, userObj }) => {
                const isTopThree = rank <= 3;
                const rankColor = rank === 1 ? 'text-brand-accent' : rank === 2 ? 'text-slate-400' : 'text-amber-600';
                const isTech = authService.isTechnicianUser(userObj);

                return (
                    <div key={username} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:border-slate-300 transition-colors">
                        {/* Rank and Trophy */}
                        <div className="flex items-center space-x-3 w-16 flex-shrink-0">
                            <span className={`text-2xl font-bold w-8 text-center ${isTopThree ? rankColor : 'text-slate-500'}`}>{rank}</span>
                            {isTopThree && <IconTrophy className={`w-6 h-6 ${rankColor}`} />}
                        </div>
                        
                        {/* User Info and Progress Bar */}
                        <div className="flex-grow w-full">
                            <div className="flex justify-between items-baseline mb-1 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-slate-800 text-base">{username}</p>
                                    
                                    {isTech ? (
                                        (() => {
                                            const rankInfo = getAgentRank(revenue * 0.30, agentRankThresholds);
                                            return (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-xs ${rankInfo.bgClass} ${rankInfo.textClass} ${rankInfo.borderClass}`}>
                                                    <span>{rankInfo.icon}</span>
                                                    <span>{rankInfo.name}</span>
                                                </span>
                                            );
                                        })()
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            <span>📈 Retention KPI</span>
                                        </span>
                                    )}
                                </div>

                                <p className="text-md font-bold text-brand-accent">
                                    ₹{revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>

                            {/* Specialties list if technician */}
                            {(() => {
                                const specialties = Array.isArray(userObj.specialties)
                                    ? userObj.specialties
                                    : typeof userObj.specialties === 'string' && (userObj.specialties as string).trim()
                                    ? (userObj.specialties as string).split(',').map(s => s.trim()).filter(Boolean)
                                    : [];
                                if (specialties.length === 0) return null;
                                return (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {specialties.map(s => (
                                            <span key={s} className="text-[10px] bg-white px-1.5 py-0.5 rounded border text-slate-500">{s}</span>
                                        ))}
                                    </div>
                                );
                            })()}

                            {!isTech ? (
                                <div className="mt-1.5">
                                    <HorizontalProgressBar
                                        value={count}
                                        target={userObj.monthlyOrdersTarget || 20}
                                        label="Monthly KPI Target"
                                        unit="orders"
                                        size="sm"
                                        colorScheme="auto"
                                        showMarker={true}
                                    />
                                </div>
                            ) : (
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                    <div className="bg-amber-500 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
                                </div>
                            )}
                        </div>

                        {/* Count */}
                        <div className="flex-shrink-0 w-28 text-right">
                           <p className="text-2xl font-bold text-brand-blue">{count}</p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{activeLeaderboard === 'TECHNICIANS' ? 'Jobs Done' : 'Sales Orders'}</p>
                        </div>
                    </div>
                );
            })}
        </div>
      )}
    </Card>
  );
};

export default UserPerformanceTracker;