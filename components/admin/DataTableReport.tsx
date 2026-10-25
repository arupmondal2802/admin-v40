import React, { useMemo } from 'react';
import { Service, ServiceStatus, ProfitLoss } from '../../types';
import Card from '../ui/Card';
import { IconReceipt, IconCheck, IconAlertTriangle } from '../ui/Icon';

interface DataTableReportProps {
  submissions: Service[];
  profitLossData?: ProfitLoss[];
}

const DataTableReport: React.FC<DataTableReportProps> = ({ submissions = [], profitLossData = [] }) => {
  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions : [], [submissions]);

  // Aggregate Payment Modes (Cash, Bank/Online, Realized Balance, Pending)
  const ledgerMetrics = useMemo(() => {
    let totalCash = 0;
    let totalBank = 0;
    let totalPending = 0;
    let totalGrossRevenue = 0;
    let completedPaidCount = 0;
    let pendingPaymentCount = 0;

    safeSubmissions.forEach(s => {
      const orderTotal = s.grandTotal || 0;
      totalGrossRevenue += orderTotal;

      // Dedicated Accounts clearance rule: ONLY orders verified with paymentStatus === 'Completed' are counted as paid
      const isPaid = s.paymentStatus === 'Completed';
      
      if (isPaid) {
        completedPaidCount++;
        if (s.paymentMode === 'Cash') {
          totalCash += (s.cashAmount !== undefined && s.cashAmount > 0) ? s.cashAmount : orderTotal;
        } else if (s.paymentMode === 'Online') {
          totalBank += (s.onlineAmount !== undefined && s.onlineAmount > 0) ? s.onlineAmount : orderTotal;
        } else if (s.paymentMode === 'Both') {
          totalCash += (s.cashAmount || 0);
          totalBank += (s.onlineAmount || 0);
        } else {
          // Default fallback
          totalBank += orderTotal;
        }
      } else {
        pendingPaymentCount++;
        totalPending += orderTotal;
      }
    });

    const totalRealizedBalance = totalCash + totalBank;

    return {
      totalCash,
      totalBank,
      totalRealizedBalance,
      totalPending,
      totalGrossRevenue,
      completedPaidCount,
      pendingPaymentCount,
    };
  }, [safeSubmissions]);

  if (safeSubmissions.length === 0) {
    return (
      <Card>
        <p className="text-center text-slate-500 py-8 font-medium">No order records available for the selected filters.</p>
      </Card>
    );
  }

  const flattenedData = safeSubmissions.map(s => {
    const addonsSummary = [
      ...(s.dynamicAddons || []).map(a => `${a.name} (x${a.quantity})`),
      ...(s.categorizedAddons || []).map(a => `${a.productName} (x${a.quantity})`),
    ].join('; ');

    const serviceList = (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).map(sel => {
      if (sel === 'Car Washing') return `Car Washing (${s.carWashDetails?.washType || 'Standard'})`;
      if (sel === 'Car Care') return `Car Care (${s.carCareDetails?.careType || 'Standard'})`;
      return sel;
    }).join(', ');
    
    // Profit Calculation Logic
    const pl = (Array.isArray(profitLossData) ? profitLossData : []).find(p => p.serviceId === s.submissionId);
    
    // Fallback to service defaults if no PL record exists
    const materialCost = pl ? pl.materialCost : (s.tyreMaterialCost || 0);
    const laborCost = pl ? pl.laborCost : (s.tyreLaborCost || 0);
    const otherCost = pl ? pl.otherExpenses : 0;
    
    const totalCost = materialCost + laborCost + otherCost;
    const netProfit = s.grandTotal - totalCost;

    // Order-wise payment breakdown (Strictly accounts verified paymentStatus === 'Completed')
    const isPaid = s.paymentStatus === 'Completed';
    let cashPaid = 0;
    let bankPaid = 0;
    let balanceDue = 0;

    if (isPaid) {
      if (s.paymentMode === 'Cash') {
        cashPaid = (s.cashAmount !== undefined && s.cashAmount > 0) ? s.cashAmount : s.grandTotal;
      } else if (s.paymentMode === 'Online') {
        bankPaid = (s.onlineAmount !== undefined && s.onlineAmount > 0) ? s.onlineAmount : s.grandTotal;
      } else if (s.paymentMode === 'Both') {
        cashPaid = s.cashAmount || 0;
        bankPaid = s.onlineAmount || 0;
      } else {
        bankPaid = s.grandTotal;
      }
    } else {
      balanceDue = s.grandTotal;
    }

    return {
      'Order ID': s.appointmentId?.split('-').pop() || s.submissionId.slice(-6),
      'Date': new Date(s.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      'Customer Name': `${s.customerFirstName} ${s.customerLastName}`.trim(),
      'Mobile': s.mobileNumber || '-',
      'Vehicle': `${s.carBrandModel} (${s.carNumber})`,
      'Services': serviceList || 'Standard Service',
      'Assigned Agent': s.assignedTo || 'Unassigned',
      'Order Status': s.status,
      'Payment Status': isPaid ? 'Completed' : 'Pending',
      'Payment Mode': isPaid ? (s.paymentMode || 'Online') : 'Pending Clearance',
      'Cash (₹)': `₹${cashPaid.toFixed(2)}`,
      'Bank / Online (₹)': `₹${bankPaid.toFixed(2)}`,
      'Balance Due (₹)': `₹${balanceDue.toFixed(2)}`,
      'Order Value': `₹${s.grandTotal.toFixed(2)}`,
      'Total Operating Cost': `₹${totalCost.toFixed(2)}`,
      'Net Profit': `₹${netProfit.toFixed(2)}`,
      'Profit %': s.grandTotal > 0 ? `${((netProfit / s.grandTotal) * 100).toFixed(1)}%` : '0%',
      'Payment Ref / UTR': s.paymentTransactionId || '-',
      'Accounts Verifier': s.paymentCompletedBy || (isPaid ? 'System' : 'Pending'),
      'Addons': addonsSummary || '-',
    };
  });

  const headers = Object.keys(flattenedData[0]);

  return (
    <div className="space-y-4">
      {/* ── TOP FINANCIAL LEDGER CASH & BANK BALANCE SUMMARY CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Cash Card */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cash</span>
            <span className="text-xl">💵</span>
          </div>
          <p className="text-xl font-black text-emerald-700 mt-1">₹{ledgerMetrics.totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Physical cash collected</p>
        </div>

        {/* Total Bank Card */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Bank / UPI</span>
            <span className="text-xl">💳</span>
          </div>
          <p className="text-xl font-black text-indigo-700 mt-1">₹{ledgerMetrics.totalBank.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Direct bank & gateway deposits</p>
        </div>

        {/* Total Realized Balance */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Realized Balance</span>
            <span className="text-xl">🏦</span>
          </div>
          <p className="text-xl font-black text-slate-900 mt-1">₹{ledgerMetrics.totalRealizedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{ledgerMetrics.completedPaidCount} orders collected</p>
        </div>

        {/* Pending Balance */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Pending</span>
            <span className="text-xl">⏳</span>
          </div>
          <p className="text-xl font-black text-amber-600 mt-1">₹{ledgerMetrics.totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-amber-700 font-semibold mt-0.5">{ledgerMetrics.pendingPaymentCount} orders pending clearance</p>
        </div>

        {/* Total Gross Revenue */}
        <div className="p-4 rounded-xl bg-slate-900 text-white shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Gross Order Value</span>
            <span className="text-xl">📈</span>
          </div>
          <p className="text-xl font-black text-white mt-1">₹{ledgerMetrics.totalGrossRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{safeSubmissions.length} total orders in ledger</p>
        </div>
      </div>

      {/* ── ORDER-WISE TRANSACTION TABLE ── */}
      <Card className="!p-0 border border-slate-200">
        <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconReceipt className="w-4 h-4 text-brand-blue" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Order-Wise Financial Ledger</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Cash: ₹{ledgerMetrics.totalCash.toFixed(0)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Bank: ₹{ledgerMetrics.totalBank.toFixed(0)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Pending: ₹{ledgerMetrics.totalPending.toFixed(0)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto relative rounded-b-lg" style={{ maxHeight: '68vh' }}>
          <table className="min-w-full text-xs text-left text-slate-500">
            <thead className="text-[10px] text-slate-700 uppercase bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                {headers.map(header => (
                  <th key={header} scope="col" className="px-3.5 py-3 whitespace-nowrap font-extrabold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {flattenedData.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50/80 transition-colors">
                  {headers.map(header => {
                    const val = row[header as keyof typeof row];
                    let className = "px-3.5 py-3 whitespace-nowrap font-medium";

                    // Badge rendering for Payment Status
                    if (header === 'Payment Status') {
                      return (
                        <td key={header} className="px-3.5 py-3 whitespace-nowrap">
                          {val === 'Completed' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                              <IconCheck className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                              <IconAlertTriangle className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                      );
                    }

                    // Badge rendering for Payment Mode
                    if (header === 'Payment Mode') {
                      return (
                        <td key={header} className="px-3.5 py-3 whitespace-nowrap">
                          {val === 'Cash' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              💵 Cash
                            </span>
                          ) : val === 'Online' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                              💳 Bank / Online
                            </span>
                          ) : val === 'Both' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                              🔀 Split (Both)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Pending Clearance</span>
                          )}
                        </td>
                      );
                    }

                    if (header === 'Cash (₹)') {
                      className += " font-bold text-emerald-700";
                    }
                    if (header === 'Bank / Online (₹)') {
                      className += " font-bold text-indigo-700";
                    }
                    if (header === 'Balance Due (₹)') {
                      const num = parseFloat(String(val).replace('₹', ''));
                      className += num > 0 ? " font-bold text-amber-600 bg-amber-50/40" : " text-slate-400";
                    }
                    if (header === 'Order Value') {
                      className += " font-extrabold text-slate-900";
                    }
                    if (header === 'Net Profit') {
                      const num = parseFloat(String(val).replace('₹', ''));
                      className += num >= 0 ? " text-emerald-600 font-bold" : " text-rose-600 font-bold";
                    }

                    return (
                      <td key={header} className={className}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DataTableReport;
