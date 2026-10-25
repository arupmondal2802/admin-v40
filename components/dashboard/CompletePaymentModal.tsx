import React, { useState } from 'react';
import { Service, User } from '../../types';
import Button from '../ui/Button';
import { IconX, IconCheck, IconReceipt, IconShieldCheck, IconAlertTriangle, IconLock } from '../ui/Icon';
import { isAccountsUser } from '../../services/authService';
import { toast } from 'sonner';

interface CompletePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service;
  currentUser: User;
  onSavePayment: (updatedService: Service) => Promise<void> | void;
}

export const CompletePaymentModal: React.FC<CompletePaymentModalProps> = ({
  isOpen,
  onClose,
  service,
  currentUser,
  onSavePayment,
}) => {
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online' | 'Both'>(
    service.paymentMode === 'Both' ? 'Both' : service.paymentMode === 'Online' ? 'Online' : 'Cash'
  );
  
  const grandTotal = service.grandTotal || 0;
  const [cashAmount, setCashAmount] = useState<number>(
    service.cashAmount !== undefined ? service.cashAmount : (service.paymentMode === 'Online' ? 0 : grandTotal)
  );
  const [onlineAmount, setOnlineAmount] = useState<number>(
    service.onlineAmount !== undefined ? service.onlineAmount : (service.paymentMode === 'Cash' ? 0 : grandTotal)
  );
  const [transactionId, setTransactionId] = useState<string>(service.paymentTransactionId || '');
  const [bankName, setBankName] = useState<string>(service.paymentBankName || '');
  const [notes, setNotes] = useState<string>(service.paymentNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleModeChange = (mode: 'Cash' | 'Online' | 'Both') => {
    setPaymentMode(mode);
    if (mode === 'Cash') {
      setCashAmount(grandTotal);
      setOnlineAmount(0);
    } else if (mode === 'Online') {
      setCashAmount(0);
      setOnlineAmount(grandTotal);
    } else {
      // Half and half split default
      const half = Math.round(grandTotal / 2);
      setCashAmount(half);
      setOnlineAmount(grandTotal - half);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAccountsUser(currentUser)) {
      toast.error('Access Denied: Only dedicated accounts users can verify and complete payments.');
      return;
    }

    if (paymentMode === 'Both' && (cashAmount + onlineAmount !== grandTotal)) {
      if (!window.confirm(`Warning: Split total (₹${cashAmount + onlineAmount}) does not match order value (₹${grandTotal}). Continue anyway?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const accountsVerifier = currentUser?.username || 'accounts';

      const updatedService: Service = {
        ...service,
        paymentStatus: 'Completed',
        paymentMode,
        cashAmount: paymentMode === 'Online' ? 0 : cashAmount,
        onlineAmount: paymentMode === 'Cash' ? 0 : onlineAmount,
        paymentTransactionId: transactionId.trim() || undefined,
        paymentBankName: bankName.trim() || undefined,
        paymentNotes: notes.trim() || service.paymentNotes,
        paymentCompletedBy: accountsVerifier,
        paymentCompletedAt: nowIso,
        last_modified: nowIso,
      };

      await onSavePayment(updatedService);
      toast.success(`Payment verified and marked as COMPLETED by ${accountsVerifier}`);
      onClose();
    } catch (err: any) {
      console.error('Failed to complete payment:', err);
      toast.error(err?.message || 'Failed to complete payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const orderNo = service.appointmentId?.split('-').pop() || service.submissionId;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <IconReceipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Accounts Payment Clearance</h3>
                <span className="bg-emerald-800 text-emerald-100 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Accounts Only
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                Order #{orderNo} • {service.customerFirstName} {service.customerLastName} ({service.carNumber})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Order Grand Total Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Order Amount</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">₹{grandTotal.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
                <IconAlertTriangle className="w-3.5 h-3.5" />
                Payment Pending Clearance
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Verified by {currentUser.name || currentUser.username}</p>
            </div>
          </div>

          {/* Payment Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Payment Mode
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleModeChange('Cash')}
                className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMode === 'Cash'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xl">💵</span>
                <span>Cash Payment</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('Online')}
                className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMode === 'Online'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xl">💳</span>
                <span>Bank / Online (UPI)</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('Both')}
                className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMode === 'Both'
                    ? 'bg-purple-50 border-purple-500 text-purple-800 ring-2 ring-purple-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xl">🔀</span>
                <span>Split (Cash + Bank)</span>
              </button>
            </div>
          </div>

          {/* Amount Inputs */}
          {paymentMode === 'Both' ? (
            <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cash Received (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={cashAmount}
                  onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank / UPI Received (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={onlineAmount}
                  onChange={e => setOnlineAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div className="col-span-2 text-right text-xs text-slate-500">
                Split Sum: <strong className="text-slate-800 font-bold">₹{(cashAmount + onlineAmount).toFixed(2)}</strong> / ₹{grandTotal.toFixed(2)}
              </div>
            </div>
          ) : paymentMode === 'Cash' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total Cash Received (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={cashAmount}
                onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-emerald-50/30"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total Bank / Online Received (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={onlineAmount}
                onChange={e => setOnlineAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-indigo-50/30"
                required
              />
            </div>
          )}

          {/* Reference / UTR and Bank Details */}
          {(paymentMode === 'Online' || paymentMode === 'Both') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Ref / UTR No.</label>
                <input
                  type="text"
                  placeholder="e.g. UPI / IMPS Ref ID"
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank / Gateway Channel</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Current / PhonePe QR"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Accounts Verification Remarks</label>
            <textarea
              rows={2}
              placeholder="e.g. Payment verified in company bank statement / Cash deposited..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-md flex items-center gap-1.5 px-5 py-2.5"
            >
              <IconShieldCheck className="w-4 h-4" />
              {isSubmitting ? 'Verifying...' : 'Complete & Authorize Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompletePaymentModal;
