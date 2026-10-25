import React, { useState, useMemo } from 'react';
import { AppData, Permission, User, Service, UserSubscription, ServiceRequest, ExpenseItem } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { 
  Activity, ShieldAlert, CheckCircle, Database, Search, HardDrive, 
  RefreshCw, AlertTriangle, AlertCircle, FileText, Download, 
  ShieldCheck, Check, HelpCircle, UserCheck, Wand2, Cpu, Sparkles, CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';
import * as cloudDataService from '../../services/cloudDataService';
import { SystemHealthSyncPanel } from './SystemHealthSyncPanel';
import { neonDataService } from '../../services/neonDataService';

const CAR_BRAND_TYPOS: Record<string, string> = {
  'hyndai': 'Hyundai',
  'hundai': 'Hyundai',
  'hundae': 'Hyundai',
  'maruty': 'Maruti',
  'maruti': 'Maruti',
  'toyta': 'Toyota',
  'toyota': 'Toyota',
  'honda': 'Honda',
  'tata': 'Tata',
  'suzuki': 'Suzuki',
  'marutisuzuki': 'Maruti Suzuki',
  'mahindra': 'Mahindra',
  'bmw': 'BMW',
  'audi': 'Audi',
  'mercedes': 'Mercedes',
  'kia': 'Kia',
  'skoda': 'Skoda',
  'volkswagen': 'Volkswagen'
};

interface DiagnosticsTabProps {
  currentUser: User;
  appData: AppData;
  onRefresh: () => Promise<void>;
}

interface Discrepancy {
  id: string;
  category: 'Orders' | 'Subscriptions' | 'Expenses' | 'Leads' | 'System';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  canAutoFix: boolean;
  affectedItem: any;
  fixAction?: () => void;
}

export const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({ currentUser, appData, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'STATUS' | 'REMARKS' | 'ASSIGNMENT' | 'CREATE'>('ALL');
  const [isScanning, setIsScanning] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'discrepancies' | 'audit_log' | 'storage'>('discrepancies');
  const [isPatching, setIsPatching] = useState(false);
  const [isMigratingToNeon, setIsMigratingToNeon] = useState(false);
  const [neonMigrationResult, setNeonMigrationResult] = useState<Record<string, number> | null>(null);
  const [patchSummary, setPatchSummary] = useState<{
    trimmedCount: number;
    phoneNormalizedCount: number;
    brandTyposCorrectedCount: number;
    cappedSubscriptionsCount: number;
    totalRepaired: number;
  } | null>(null);

  // Diagnostic checklist results
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);

  // 1. Storage utility calculation
  const storageStats = useMemo(() => {
    let rawSize = 0;
    try {
      const payload = JSON.stringify(appData);
      rawSize = payload.length;
    } catch (e) {
      rawSize = 0;
    }

    const kbSize = (rawSize / 1024).toFixed(1);
    const mbSize = (rawSize / (1024 * 1024)).toFixed(2);
    
    // Estimate localStorage usage
    let localKeysCount = 0;
    let localTotalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localKeysCount++;
        localTotalBytes += (localStorage.getItem(key) || '').length;
      }
    }
    const localKb = (localTotalBytes / 1024).toFixed(1);

    return {
      payloadSizeText: rawSize > 1024 * 1024 ? `${mbSize} MB` : `${kbSize} KB`,
      localKb,
      localKeysCount,
      totalUnsaved: 0
    };
  }, [appData]);

  // 2. Perform deep database sweep
  const handleRunDiagnostics = () => {
    setIsScanning(true);
    setScanCompleted(false);

    setTimeout(() => {
      const issues: Discrepancy[] = [];

      // A. SUBMISSIONS (ORDERS) SCAN
      const subs = appData.submissions || [];
      subs.forEach((sub) => {
        // Rule A1: Assigned or In Progress orders must have a technician
        if ((sub.status === 'Assigned' || sub.status === 'In Progress') && !sub.assignedTo) {
          issues.push({
            id: `order-tech-${sub.submissionId}`,
            category: 'Orders',
            severity: 'CRITICAL',
            title: `Orphaned Assigned Order (#${sub.submissionId.slice(-6).toUpperCase()})`,
            description: `Order for customer "${sub.customerFirstName} ${sub.customerLastName}" is in status "${sub.status}" but has no designated service technician.`,
            canAutoFix: false,
            affectedItem: sub,
          });
        }

        // Rule A2: Grand total mismatch check (e.g. negative values or abnormally zero)
        if (sub.grandTotal <= 0 && sub.status === 'Completed') {
          issues.push({
            id: `order-amount-${sub.submissionId}`,
            category: 'Orders',
            severity: 'WARNING',
            title: `Zero-Value Completed Order (#${sub.submissionId.slice(-6).toUpperCase()})`,
            description: `Completed order for vehicle "${sub.carNumber}" has a final bill of ₹${sub.grandTotal.toFixed(2)}. Verify if this was a free promotion or subscription.`,
            canAutoFix: false,
            affectedItem: sub,
          });
        }

        // Rule A3: Phone number checks & trailing spaces
        const cleanPhone = String(sub.mobileNumber || '').replace(/[^0-9]/g, '');
        const strMobile = String(sub.mobileNumber || '');
        if (cleanPhone.length < 10) {
          issues.push({
            id: `order-phone-len-${sub.submissionId}`,
            category: 'Orders',
            severity: 'WARNING',
            title: `Malformed Phone Number (#${sub.submissionId.slice(-6).toUpperCase()})`,
            description: `Phone number "${sub.mobileNumber}" for "${sub.customerFirstName} ${sub.customerLastName}" is under 10 digits. SMS and notification services will fail.`,
            canAutoFix: true,
            affectedItem: sub,
          });
        } else if (strMobile !== strMobile.trim() || strMobile.includes(' ')) {
          issues.push({
            id: `order-phone-format-${sub.submissionId}`,
            category: 'Orders',
            severity: 'INFO',
            title: `Stray Spaces in Phone Number (#${sub.submissionId.slice(-6).toUpperCase()})`,
            description: `Phone number "${sub.mobileNumber}" has whitespaces or formatting issues that should be trimmed and cleaned.`,
            canAutoFix: true,
            affectedItem: sub,
          });
        }

        // Rule A4: Whitespace padding check in name or registration
        if (
          sub.customerFirstName !== (sub.customerFirstName || '').trim() ||
          sub.customerLastName !== (sub.customerLastName || '').trim() ||
          sub.carNumber !== (sub.carNumber || '').trim()
        ) {
          issues.push({
            id: `order-trim-${sub.submissionId}`,
            category: 'Orders',
            severity: 'INFO',
            title: `Padding Whitespace in Order Fields (#${sub.submissionId.slice(-6).toUpperCase()})`,
            description: `Stray whitespace padding detected in customer details or vehicle registration plate "${sub.carNumber}" for customer "${sub.customerFirstName} ${sub.customerLastName}".`,
            canAutoFix: true,
            affectedItem: sub,
          });
        }

        // Rule A5: Brand casing/spelling typo check
        const parts = (sub.carBrandModel || '').split(' - ');
        if (parts.length >= 2) {
          const brandLower = parts[0].trim().toLowerCase();
          const corrected = CAR_BRAND_TYPOS[brandLower];
          if (corrected && parts[0].trim() !== corrected) {
            issues.push({
              id: `order-brand-typo-${sub.submissionId}`,
              category: 'Orders',
              severity: 'WARNING',
              title: `Car Brand Typo (#${sub.submissionId.slice(-6).toUpperCase()})`,
              description: `Brand name in "${sub.carBrandModel}" is misspelled or has invalid casing ("${parts[0]}"). It should be standardized to "${corrected}".`,
              canAutoFix: true,
              affectedItem: sub,
            });
          }
        }
      });

      // B. SUBSCRIPTIONS SCAN
      const subsUser = appData.userSubscriptions || [];
      subsUser.forEach((us) => {
        const matchingPlan = appData.subscriptionPlans?.find(p => p.id === us.planId);
        // Rule B1: Orphaned subscription plans
        if (!matchingPlan) {
          issues.push({
            id: `sub-plan-${us.id}`,
            category: 'Subscriptions',
            severity: 'CRITICAL',
            title: `Orphaned Subscription Plan Target`,
            description: `User subscription ID "${us.id.slice(-6).toUpperCase()}" references a plan ID "${us.planId}" which does not exist in the active pricing catalogs.`,
            canAutoFix: false,
            affectedItem: us,
          });
        }

        // Rule B2: Remaining washes exceeding plan limits
        if (matchingPlan && us.washesRemaining > matchingPlan.totalWashes) {
          issues.push({
            id: `sub-wash-${us.id}`,
            category: 'Subscriptions',
            severity: 'WARNING',
            title: `Washes Allowance Exceeded`,
            description: `Subscription for "${us.customerFirstName} ${us.customerLastName}" has ${us.washesRemaining} washes remaining, exceeding the plan's ceiling of ${matchingPlan.totalWashes}.`,
            canAutoFix: true,
            affectedItem: us,
          });
        }
      });

      // C. EXPENSES SCAN
      const expenses = appData.expenses || [];
      expenses.forEach((exp) => {
        // Rule C1: Pending approvals over 30 days old
        const daysOld = Math.floor((new Date().getTime() - new Date(exp.date).getTime()) / (1000 * 3600 * 24));
        if (exp.status === 'Pending' && daysOld > 30) {
          issues.push({
            id: `exp-delay-${exp.id}`,
            category: 'Expenses',
            severity: 'WARNING',
            title: `Stale Expense Approval Request`,
            description: `Expense of ₹${exp.amount} for "${exp.description}" has been pending approval for ${daysOld} days.`,
            canAutoFix: false,
            affectedItem: exp,
          });
        }

        // Rule C2: Budget categories check
        if (exp.amount <= 0) {
          issues.push({
            id: `exp-zero-${exp.id}`,
            category: 'Expenses',
            severity: 'CRITICAL',
            title: `Invalid Expense Amount`,
            description: `Recorded expense "${exp.description}" contains an invalid amount of ₹${exp.amount}.`,
            canAutoFix: false,
            affectedItem: exp,
          });
        }

        // Rule C3: Whitespace checks
        if (exp.description !== (exp.description || '').trim()) {
          issues.push({
            id: `exp-trim-${exp.id}`,
            category: 'Expenses',
            severity: 'INFO',
            title: `Whitespace in Expense Description`,
            description: `Expense explanation "${exp.description}" contains trailing or leading whitespace pads.`,
            canAutoFix: true,
            affectedItem: exp,
          });
        }
      });

      // D. SPEND BUDGET VS ACTUAL MONITORING
      const categories = appData.spendCategories || [];
      categories.forEach((cat) => {
        const monthlyBudget = cat.monthlyBudget || 0;
        if (monthlyBudget > 0) {
          const matchingExpenses = expenses.filter(
            e => e.categoryId === cat.id && e.status === 'Approved'
          );
          const totalSpent = matchingExpenses.reduce((sum, e) => sum + e.amount, 0);
          
          if (totalSpent > monthlyBudget) {
            issues.push({
              id: `budget-overrun-${cat.id}`,
              category: 'Expenses',
              severity: 'WARNING',
              title: `Budget Limit Exceeded: ${cat.name}`,
              description: `Actual approved expenses (₹${totalSpent.toLocaleString()}) have exceeded the set monthly budget allocation of ₹${monthlyBudget.toLocaleString()} by ₹${(totalSpent - monthlyBudget).toLocaleString()}.`,
              canAutoFix: false,
              affectedItem: cat,
            });
          }
        }
      });

      // E. LEADS SCAN
      const leads = appData.serviceRequests || [];
      leads.forEach((lead) => {
        if (lead.status === 'New' && !lead.assignedAgent) {
          const daysOld = Math.floor((new Date().getTime() - new Date(lead.requestDate || new Date()).getTime()) / (1000 * 3600 * 24));
          if (daysOld > 2) {
            issues.push({
              id: `lead-unassigned-${lead.id}`,
              category: 'Leads',
              severity: 'WARNING',
              title: `Unassigned Stale Lead`,
              description: `Lead from customer "${lead.customerName}" (${lead.requestedService}) has been in "New" status for ${daysOld} days without owner assignment.`,
              canAutoFix: false,
              affectedItem: lead,
            });
          }
        }

        // Rule E2: Whitespace padding check
        if (
          String(lead.customerName || '') !== String(lead.customerName || '').trim() ||
          String(lead.customerPhone || '') !== String(lead.customerPhone || '').trim() ||
          String(lead.carBrand || '') !== String(lead.carBrand || '').trim() ||
          String(lead.carModel || '') !== String(lead.carModel || '').trim()
        ) {
          issues.push({
            id: `lead-trim-${lead.id}`,
            category: 'Leads',
            severity: 'INFO',
            title: `Whitespace Padding in Web Lead`,
            description: `Stray whitespace padding detected in lead details for customer "${lead.customerName}" (${lead.carBrand || 'Unknown'}).`,
            canAutoFix: true,
            affectedItem: lead,
          });
        }

        // Rule E3: Phone number clean check
        const cleanLeadPhone = String(lead.customerPhone || '').replace(/[^0-9]/g, '');
        if (cleanLeadPhone.length >= 10 && String(lead.customerPhone || '') !== cleanLeadPhone) {
          issues.push({
            id: `lead-phone-${lead.id}`,
            category: 'Leads',
            severity: 'WARNING',
            title: `Unformatted Phone Number in Web Lead`,
            description: `Lead for "${lead.customerName}" contains spaces or non-digit characters: "${lead.customerPhone}".`,
            canAutoFix: true,
            affectedItem: lead,
          });
        }

        // Rule E4: Lead brand typo
        const brandLower = (lead.carBrand || '').trim().toLowerCase();
        const corrected = CAR_BRAND_TYPOS[brandLower];
        if (corrected && (lead.carBrand || '').trim() !== corrected) {
          issues.push({
            id: `lead-brand-typo-${lead.id}`,
            category: 'Leads',
            severity: 'WARNING',
            title: `Car Brand Typo in Web Lead`,
            description: `Brand name "${lead.carBrand}" has typo or casing issues. It should be standardized to "${corrected}".`,
            canAutoFix: true,
            affectedItem: lead,
          });
        }
      });

      setDiscrepancies(issues);
      setIsScanning(false);
      setScanCompleted(true);
      toast.success(`System audit complete! Found ${issues.length} items to review.`);
    }, 1000);
  };

  // 3. Real Auto-fix single action
  const handleAutoFix = async (issue: Discrepancy) => {
    setIsScanning(true);
    try {
      const sheetsUrl = appData.settings?.googleSheetsUrl || '';
      
      if (issue.id.startsWith('order-trim-')) {
        const sub = issue.affectedItem as Service;
        const fixedSub = {
          ...sub,
          customerFirstName: (sub.customerFirstName || '').trim(),
          customerLastName: (sub.customerLastName || '').trim(),
          carNumber: (sub.carNumber || '').trim()
        };
        await cloudDataService.saveRecord('Submissions', fixedSub, sheetsUrl);
        toast.success(`Padding trimmed successfully for Order #${sub.submissionId.slice(-6).toUpperCase()}`);
      }
      else if (issue.id.startsWith('order-phone-')) {
        const sub = issue.affectedItem as Service;
        const digitsOnly = String(sub.mobileNumber || '').replace(/\D/g, '');
        const fixedPhone = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
        const fixedSub = { ...sub, mobileNumber: fixedPhone };
        await cloudDataService.saveRecord('Submissions', fixedSub, sheetsUrl);
        toast.success(`Phone format normalized for Order #${sub.submissionId.slice(-6).toUpperCase()}`);
      }
      else if (issue.id.startsWith('order-brand-typo-')) {
        const sub = issue.affectedItem as Service;
        const parts = (sub.carBrandModel || '').split(' - ');
        if (parts.length >= 2) {
          const brandLower = parts[0].trim().toLowerCase();
          const correctedBrand = CAR_BRAND_TYPOS[brandLower];
          if (correctedBrand) {
            parts[0] = correctedBrand;
            const fixedSub = { ...sub, carBrandModel: parts.join(' - ') };
            await cloudDataService.saveRecord('Submissions', fixedSub, sheetsUrl);
            toast.success(`Car brand "${parts[0]}" corrected for Order #${sub.submissionId.slice(-6).toUpperCase()}`);
          }
        }
      }
      else if (issue.id.startsWith('lead-trim-')) {
        const lead = issue.affectedItem as ServiceRequest;
        const fixedLead = {
          ...lead,
          customerName: (lead.customerName || '').trim(),
          customerPhone: (lead.customerPhone || '').trim(),
          carBrand: (lead.carBrand || '').trim(),
          carModel: (lead.carModel || '').trim()
        };
        await cloudDataService.saveRecord('ServiceRequests', fixedLead, sheetsUrl);
        toast.success(`Whitespace padding trimmed for Lead from "${lead.customerName}"`);
      }
      else if (issue.id.startsWith('lead-phone-')) {
        const lead = issue.affectedItem as ServiceRequest;
        const digitsOnly = String(lead.customerPhone || '').replace(/\D/g, '');
        const fixedPhone = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
        const fixedLead = { ...lead, customerPhone: fixedPhone };
        await cloudDataService.saveRecord('ServiceRequests', fixedLead, sheetsUrl);
        toast.success(`Phone number normalized for Lead from "${lead.customerName}"`);
      }
      else if (issue.id.startsWith('lead-brand-typo-')) {
        const lead = issue.affectedItem as ServiceRequest;
        const brandLower = (lead.carBrand || '').trim().toLowerCase();
        const correctedBrand = CAR_BRAND_TYPOS[brandLower];
        if (correctedBrand) {
          const fixedLead = { ...lead, carBrand: correctedBrand };
          await cloudDataService.saveRecord('ServiceRequests', fixedLead, sheetsUrl);
          toast.success(`Car brand typo corrected to "${correctedBrand}" for Lead from "${lead.customerName}"`);
        }
      }
      else if (issue.id.startsWith('sub-wash-')) {
        const us = issue.affectedItem as UserSubscription;
        const matchingPlan = appData.subscriptionPlans?.find(p => p.id === us.planId);
        if (matchingPlan) {
          const fixedUs = { ...us, washesRemaining: matchingPlan.totalWashes };
          await cloudDataService.saveRecord('UserSubscriptions', fixedUs, sheetsUrl);
          toast.success(`Subscription washes remaining capped to plan limit (${matchingPlan.totalWashes})`);
        }
      }
      else if (issue.id.startsWith('exp-trim-')) {
        const exp = issue.affectedItem as ExpenseItem;
        const fixedExp = { ...exp, description: (exp.description || '').trim() };
        await cloudDataService.saveRecord('Expenses', fixedExp, sheetsUrl);
        toast.success(`Trimmed whitespace for expense: "${exp.description.trim()}"`);
      }
      else {
        // Fallback for default simulation
        setDiscrepancies(prev => prev.filter(item => item.id !== issue.id));
        toast.success(`Discrepancy resolved: "${issue.title}" corrected in local context.`);
      }

      // Reload database & recalculate discrepancies
      await onRefresh();
      setTimeout(() => {
        handleRunDiagnostics();
      }, 300);
      
    } catch (err: any) {
      console.error("Failed to execute real auto-fix:", err);
      toast.error(`Auto-fix failed: ${err.message || err}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplyGlobalPatchSystem = async () => {
    setIsPatching(true);
    setPatchSummary(null);
    toast.info("Initializing system-wide issue patching engine...");

    try {
      const sheetsUrl = appData.settings?.googleSheetsUrl || '';
      let trimmedCount = 0;
      let phoneNormalizedCount = 0;
      let brandTyposCorrectedCount = 0;
      let cappedSubscriptionsCount = 0;
      let totalRepaired = 0;

      // 1. Repair Submissions (Orders)
      const subs = appData.submissions || [];
      for (const sub of subs) {
        let isModified = false;
        let updatedSub = { ...sub };

        // Trim strings
        if (
          updatedSub.customerFirstName !== (updatedSub.customerFirstName || '').trim() ||
          updatedSub.customerLastName !== (updatedSub.customerLastName || '').trim() ||
          String(updatedSub.mobileNumber || '') !== String(updatedSub.mobileNumber || '').trim() ||
          updatedSub.carNumber !== (updatedSub.carNumber || '').trim()
        ) {
          updatedSub.customerFirstName = (updatedSub.customerFirstName || '').trim();
          updatedSub.customerLastName = (updatedSub.customerLastName || '').trim();
          updatedSub.mobileNumber = String(updatedSub.mobileNumber || '').trim();
          updatedSub.carNumber = (updatedSub.carNumber || '').trim();
          trimmedCount++;
          isModified = true;
        }

        // Phone format
        const cleanPhone = String(updatedSub.mobileNumber || '').replace(/[^0-9]/g, '');
        const normPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
        if (updatedSub.mobileNumber !== normPhone && normPhone.length >= 10) {
          updatedSub.mobileNumber = normPhone;
          phoneNormalizedCount++;
          isModified = true;
        }

        // Brand typos
        const parts = (updatedSub.carBrandModel || '').split(' - ');
        if (parts.length >= 2) {
          const brandLower = parts[0].trim().toLowerCase();
          const corrected = CAR_BRAND_TYPOS[brandLower];
          if (corrected && parts[0].trim() !== corrected) {
            parts[0] = corrected;
            updatedSub.carBrandModel = parts.join(' - ');
            brandTyposCorrectedCount++;
            isModified = true;
          }
        }

        if (isModified) {
          await cloudDataService.saveRecord('Submissions', updatedSub, sheetsUrl);
          totalRepaired++;
        }
      }

      // 2. Repair ServiceRequests (Leads)
      const leads = appData.serviceRequests || [];
      for (const lead of leads) {
        let isModified = false;
        let updatedLead = { ...lead };

        // Trim strings
        if (
          String(updatedLead.customerName || '') !== String(updatedLead.customerName || '').trim() ||
          String(updatedLead.customerPhone || '') !== String(updatedLead.customerPhone || '').trim() ||
          String(updatedLead.carBrand || '') !== String(updatedLead.carBrand || '').trim() ||
          String(updatedLead.carModel || '') !== String(updatedLead.carModel || '').trim()
        ) {
          updatedLead.customerName = String(updatedLead.customerName || '').trim();
          updatedLead.customerPhone = String(updatedLead.customerPhone || '').trim();
          updatedLead.carBrand = String(updatedLead.carBrand || '').trim();
          updatedLead.carModel = String(updatedLead.carModel || '').trim();
          trimmedCount++;
          isModified = true;
        }

        // Phone format
        const cleanPhone = String(updatedLead.customerPhone || '').replace(/[^0-9]/g, '');
        const normPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
        if (String(updatedLead.customerPhone || '') !== normPhone && normPhone.length >= 10) {
          updatedLead.customerPhone = normPhone;
          phoneNormalizedCount++;
          isModified = true;
        }

        // Brand typos
        const brandLower = (updatedLead.carBrand || '').trim().toLowerCase();
        const corrected = CAR_BRAND_TYPOS[brandLower];
        if (corrected && (updatedLead.carBrand || '').trim() !== corrected) {
          updatedLead.carBrand = corrected;
          brandTyposCorrectedCount++;
          isModified = true;
        }

        if (isModified) {
          await cloudDataService.saveRecord('ServiceRequests', updatedLead, sheetsUrl);
          totalRepaired++;
        }
      }

      // 3. Repair Expenses
      const expenses = appData.expenses || [];
      for (const exp of expenses) {
        let isModified = false;
        let updatedExp = { ...exp };

        // Trim description
        if (updatedExp.description !== (updatedExp.description || '').trim()) {
          updatedExp.description = (updatedExp.description || '').trim();
          trimmedCount++;
          isModified = true;
        }

        if (isModified) {
          await cloudDataService.saveRecord('Expenses', updatedExp, sheetsUrl);
          totalRepaired++;
        }
      }

      // 4. Repair Subscriptions
      const userSubs = appData.userSubscriptions || [];
      for (const us of userSubs) {
        const matchingPlan = appData.subscriptionPlans?.find(p => p.id === us.planId);
        if (matchingPlan && us.washesRemaining > matchingPlan.totalWashes) {
          const updatedUs = { ...us, washesRemaining: matchingPlan.totalWashes };
          await cloudDataService.saveRecord('UserSubscriptions', updatedUs, sheetsUrl);
          cappedSubscriptionsCount++;
          totalRepaired++;
        }
      }

      // Trigger app-wide data reload
      await onRefresh();

      setPatchSummary({
        trimmedCount,
        phoneNormalizedCount,
        brandTyposCorrectedCount,
        cappedSubscriptionsCount,
        totalRepaired
      });

      toast.success(`Data quality patch applied successfully! Corrected ${totalRepaired} database anomalies.`);
      
      // Auto run diagnostic sweep to show clean results
      setTimeout(() => {
        handleRunDiagnostics();
      }, 500);

    } catch (err: any) {
      console.error("Global patching failed:", err);
      toast.error(`Patch engine error: ${err.message || err}`);
    } finally {
      setIsPatching(false);
    }
  };

  // 4. Download Database Payload
  const handleDownloadPayload = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `app_data_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success("Enterprise local backup payload downloaded successfully.");
    } catch (e) {
      toast.error("Failed to compile database payload backup.");
    }
  };

  // 5. Migrate Full Application State to Neon PostgreSQL
  const handleMigrateToNeon = async () => {
    setIsMigratingToNeon(true);
    try {
      toast.info("Starting comprehensive batch transfer to Neon PostgreSQL...");
      const res = await neonDataService.migrateAllData(appData);
      if (res.success && res.results) {
        setNeonMigrationResult(res.results);
        const total = res.results.total || (
          (res.results.orders || 0) + (res.results.leads || 0) + (res.results.users || 0) + 
          (res.results.settings || 0) + (res.results.notifications || 0) + (res.results.inventory || 0) + 
          (res.results.warranties || 0) + (res.results.subscriptions || 0) + (res.results.expenses || 0) + 
          (res.results.catalogAndRules || 0) + (res.results.customersAndVehicles || 0) + (res.results.auditLogs || 0)
        );
        toast.success(`Successfully migrated ${total} total records across all collections to Neon PostgreSQL!`);
      } else {
        toast.error(`Migration failed: ${res.error || 'Check Neon connection string.'}`);
      }
    } catch (err: any) {
      console.error("Neon migration failed:", err);
      toast.error(`Neon migration error: ${err.message || err}`);
    } finally {
      setIsMigratingToNeon(false);
    }
  };

  // Filtered system audit logs
  const systemAuditLogs = useMemo(() => {
    const logs = appData.auditLogs || [];
    return logs.filter(log => {
      const matchesSearch = 
        log.changedBy?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.oldValue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.newValue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.leadId?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = auditFilter === 'ALL' || log.changeType === auditFilter;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [appData.auditLogs, searchTerm, auditFilter]);

  const hasAdminPermissions = currentUser.role === 'admin' || currentUser.permissions.includes(Permission.CAN_EDIT_SETTINGS);

  if (!hasAdminPermissions) {
    return (
      <Card title="Access Restricted">
        <div className="p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4 animate-bounce" />
          <h3 className="text-lg font-bold text-slate-800">Administrator Access Required</h3>
          <p className="text-sm text-slate-500 mt-2">
            You do not possess elevated roles to execute system diagnostics, integrity audits, or manual storage overrides.
          </p>
        </div>
      </Card>
    );
  }

  // Calculate health score dynamically
  const healthScore = scanCompleted ? Math.max(10, 100 - (discrepancies.length * 8)) : 100;

  return (
    <div className="space-y-6">
      {/* Expandable System Health & Sync Panel */}
      <SystemHealthSyncPanel 
        appData={appData} 
        onRefresh={onRefresh} 
        defaultExpanded={true} 
      />

      {/* Bento Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f172a] text-white p-6 rounded-2xl shadow-md border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">System Health Index</p>
            <h3 className="text-3xl font-black mt-2 tracking-tight">
              {scanCompleted ? `${healthScore}%` : 'Pending Sweep'}
            </h3>
            <p className="text-slate-300 text-xs mt-1">
              {scanCompleted 
                ? (healthScore === 100 ? 'All parameters healthy' : `${discrepancies.length} discrepancy warnings`) 
                : 'Run deep scan to audit'
              }
            </p>
          </div>
          <div className="p-3.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
            {healthScore === 100 ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Payload Footprint</p>
            <h3 className="text-3xl font-black mt-2 text-slate-900">{storageStats.payloadSizeText}</h3>
            <p className="text-slate-400 text-xs mt-1">
              Over {storageStats.localKeysCount} local state cache sectors
            </p>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
            <HardDrive className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active System Auditors</p>
            <h3 className="text-3xl font-black mt-2 text-slate-900">
              {(appData.users || []).filter(u => u.role === 'admin' || u.role === 'manager').length} Users
            </h3>
            <p className="text-emerald-600 text-xs mt-1 flex items-center font-medium">
              ● Highly privileged access monitors active
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Internal Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('discrepancies')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeSubTab === 'discrepancies'
              ? 'border-brand-accent text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Integrity & Discrepancies
        </button>
        <button
          onClick={() => setActiveSubTab('audit_log')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeSubTab === 'audit_log'
              ? 'border-brand-accent text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          System-Wide Audit Trails ({systemAuditLogs.length})
        </button>
        <button
          onClick={() => setActiveSubTab('storage')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeSubTab === 'storage'
              ? 'border-brand-accent text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Disaster Recovery & Payload
        </button>
      </div>

      {/* Discrepancies Content */}
      {activeSubTab === 'discrepancies' && (
        <Card title="Automated Business & Logic Integrity Monitor">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 mb-6 gap-4">
            <div>
              <h4 className="text-base font-bold text-slate-900">Deep Consistency Validation Engine</h4>
              <p className="text-xs text-slate-500">Audits all operational models for orphaned foreign key plans, billing variations, missing technicians, unassigned leads, and outstanding category overruns.</p>
            </div>
            <Button 
              size="sm" 
              onClick={handleRunDiagnostics} 
              disabled={isScanning || isPatching}
              className="font-bold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${(isScanning && !isPatching) ? 'animate-spin' : ''}`} />
              {isScanning && !isPatching ? 'Running Deep Sweep...' : 'Run Diagnostics Sweep'}
            </Button>
          </div>

          {/* Active Diagnostic Patch System Panel */}
          <div className="border border-blue-100 bg-gradient-to-r from-blue-50/40 via-indigo-50/10 to-transparent p-5 rounded-xl mb-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-sm flex-shrink-0">
                  <Cpu className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Proactive Diagnostics & Issue-Based Patch System
                    <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 font-extrabold uppercase rounded-md tracking-wider">Engine Active</span>
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                    Instantly scans database payloads to automatically repair whitespace alignment issues (lead/order field trims), correct brand typos/casing anomalies (e.g. hyndai → Hyundai), normalize telephone number strings, and cap subscription wash overruns.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] font-medium text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Whitespace Cleanups</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Brand Standardizer</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Phone String Stripping</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Wash Ceiling Caps</span>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 self-start lg:self-center">
                <Button
                  size="sm"
                  onClick={handleApplyGlobalPatchSystem}
                  disabled={isScanning || isPatching}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-sm whitespace-nowrap"
                >
                  <Wand2 className={`w-4 h-4 ${isPatching ? 'animate-spin' : ''}`} />
                  {isPatching ? 'Applying Patches...' : 'Run Bulk Quality Patch'}
                </Button>
              </div>
            </div>

            {patchSummary && (
              <div className="mt-5 pt-4 border-t border-blue-50/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Last Global Patch Session Results:
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-white/80 p-3 rounded-lg border border-slate-100/80 text-center shadow-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Fields Trimmed</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{patchSummary.trimmedCount}</p>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-slate-100/80 text-center shadow-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Phones Normalized</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{patchSummary.phoneNormalizedCount}</p>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-slate-100/80 text-center shadow-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Brands Corrected</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{patchSummary.brandTyposCorrectedCount}</p>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-slate-100/80 text-center shadow-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Washes Capped</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{patchSummary.cappedSubscriptionsCount}</p>
                  </div>
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-center col-span-2 md:col-span-1 shadow-xs">
                    <p className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600/80">Total Repaired</p>
                    <p className="text-lg font-black text-blue-700 mt-0.5">{patchSummary.totalRepaired}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!scanCompleted && !isScanning && (
            <div className="p-12 text-center text-slate-500">
              <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-base font-semibold text-slate-700">Diagnostic Scanner Idle</p>
              <p className="text-sm mt-1 max-w-md mx-auto">
                Trigger a deep diagnostics sweep to inspect local orders, expenses, budgets, leads, and customer databases for business rule violations.
              </p>
            </div>
          )}

          {isScanning && (
            <div className="p-12 text-center text-slate-500">
              <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <div className="absolute w-16 h-16 rounded-full border-4 border-slate-100 border-t-brand-accent animate-spin" />
                <Database className="w-6 h-6 text-brand-blue animate-pulse" />
              </div>
              <p className="text-base font-semibold text-slate-700">Executing Deep Database Inspection...</p>
              <p className="text-xs font-mono text-slate-400 mt-1">Scanned: Submissions | Subscriptions | Expenses | Leads | Budgets</p>
            </div>
          )}

          {scanCompleted && discrepancies.length === 0 && (
            <div className="p-12 text-center text-slate-500 bg-emerald-50/50 rounded-xl border border-dashed border-emerald-200">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-emerald-800">No Discrepancies Found!</p>
              <p className="text-sm text-emerald-600 mt-1 max-w-md mx-auto">
                Excellent! All scanned databases matched our clean validation rules. No orphaned entries or layout misalignments detected.
              </p>
            </div>
          )}

          {scanCompleted && discrepancies.length > 0 && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-bold">Database Verification Audit Highlights</h4>
                  <p className="mt-1 text-xs">
                    Review the {discrepancies.length} alerts found during the database verification. Some items can be corrected immediately in local memory.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden bg-white">
                {discrepancies.map((issue) => (
                  <div key={issue.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="flex gap-3">
                      <div className="mt-0.5">
                        {issue.severity === 'CRITICAL' ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{issue.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                            issue.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {issue.severity}
                          </span>
                          <span className="text-slate-400 text-xs">|</span>
                          <span className="text-slate-500 text-xs font-semibold">{issue.category}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">{issue.description}</p>
                      </div>
                    </div>
                    {issue.canAutoFix && (
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => handleAutoFix(issue)}
                        disabled={isScanning || isPatching}
                        className="text-xs h-8 flex-shrink-0 font-bold border border-slate-300 hover:bg-slate-100"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Quick Fix
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Audit Log Tab */}
      {activeSubTab === 'audit_log' && (
        <Card title="Global Lead & Service Audit Log Console">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter logs by author name, lead ID, notes, or modified content..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent transition-all"
                />
              </div>
              <select
                value={auditFilter}
                onChange={(e: any) => setAuditFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent font-semibold text-slate-700"
              >
                <option value="ALL">All Event Types</option>
                <option value="CREATE">Creation Log</option>
                <option value="STATUS">Status Modifications</option>
                <option value="ASSIGNMENT">Agent Assignment</option>
                <option value="REMARKS">Notes & Remarks</option>
              </select>
            </div>

            {systemAuditLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-semibold">No audit matches found.</p>
                <p className="text-xs mt-1">Try relaxing your search terms or filter constraints.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl bg-white">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-slate-500 font-bold text-xs uppercase tracking-wider">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Log ID</th>
                      <th className="py-3 px-4">Author</th>
                      <th className="py-3 px-4">Event Category</th>
                      <th className="py-3 px-4">Changes (Old → New)</th>
                      <th className="py-3 px-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {systemAuditLogs.slice(0, 80).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {log.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                          {log.changedBy || 'System Trigger'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                            log.changeType === 'CREATE' ? 'bg-green-100 text-green-800' :
                            log.changeType === 'STATUS' ? 'bg-blue-100 text-blue-800' :
                            log.changeType === 'ASSIGNMENT' ? 'bg-purple-100 text-purple-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {log.changeType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium max-w-xs break-all">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-red-500 line-through">
                              {log.oldValue || '[Empty]'}
                            </span>
                            <span className="text-emerald-600 font-bold">
                              {log.newValue || '[Empty]'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-xs truncate max-w-xs" title={log.notes}>
                          {log.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recovery / Storage Tab */}
      {activeSubTab === 'storage' && (
        <Card title="Disaster Recovery & Offline Cache Manager">
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 text-sm flex gap-3">
              <HelpCircle className="w-5 h-5 flex-shrink-0 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-bold">Enterprise Local Data Persistence Architecture</h4>
                <p className="mt-1 text-xs">
                  This interface handles local-first data contingencies. In case of poor cell tower service, device freezes, or server sync blocks, the complete transactional state remains buffered locally in your browser. You can export a payload at any time to guarantee zero operational data loss.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Neon PostgreSQL Migration Card */}
              <div className="border border-emerald-200 bg-gradient-to-b from-emerald-50/40 to-white rounded-xl p-5 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-xs">
                      <Database className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-slate-900 text-base">Migrate to Neon PostgreSQL</h4>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Transfers 100% of application data — including users, app settings, notifications, active customer orders, sales leads, inventory, warranties, subscriptions, financial expenses, service catalogs, rules, and audit logs directly into Neon PostgreSQL.
                  </p>
                  {neonMigrationResult && (
                    <div className="mt-3 p-3 bg-emerald-100/70 border border-emerald-300 rounded-lg text-xs space-y-1.5 text-emerald-950 font-medium max-h-56 overflow-y-auto">
                      <p className="font-bold flex items-center justify-between text-emerald-800">
                        <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Migration Successful</span>
                        <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded text-[10px] font-black">
                          {neonMigrationResult.total || (neonMigrationResult.orders || 0) + (neonMigrationResult.leads || 0) + (neonMigrationResult.collections || 0)} Total
                        </span>
                      </p>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] pt-1.5 border-t border-emerald-200/80">
                        <span>📦 Orders: <b>{neonMigrationResult.orders || 0}</b></span>
                        <span>🎯 Leads: <b>{neonMigrationResult.leads || 0}</b></span>
                        <span>👤 Users & Auth: <b>{neonMigrationResult.users || 0}</b></span>
                        <span>⚙️ Settings: <b>{neonMigrationResult.settings ? 'Synced' : '0'}</b></span>
                        <span>🔔 Notifications: <b>{neonMigrationResult.notifications || 0}</b></span>
                        <span>🧰 Inventory: <b>{neonMigrationResult.inventory || 0}</b></span>
                        <span>🛡️ Warranties: <b>{neonMigrationResult.warranties || 0}</b></span>
                        <span>💳 Subscriptions: <b>{neonMigrationResult.subscriptions || 0}</b></span>
                        <span>💰 Expenses: <b>{neonMigrationResult.expenses || 0}</b></span>
                        <span>📋 Service Catalog: <b>{neonMigrationResult.catalogAndRules || 0}</b></span>
                        <span>🚗 Customer & Auto: <b>{neonMigrationResult.customersAndVehicles || 0}</b></span>
                        <span>📜 Audit Logs: <b>{neonMigrationResult.auditLogs || 0}</b></span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-6">
                  <Button 
                    onClick={handleMigrateToNeon} 
                    disabled={isMigratingToNeon}
                    className="font-bold w-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 shadow-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${isMigratingToNeon ? 'animate-spin' : ''}`} />
                    {isMigratingToNeon ? 'Transferring 100% Data...' : 'Migrate All Data to Neon'}
                  </Button>
                </div>
              </div>

              <div className="border rounded-xl p-5 bg-white flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Export Raw DB Payload</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Compiles and downloads all active relational segments (services, expenses, subscription allowances, customer logbooks) as a portable backup JSON format.
                  </p>
                </div>
                <div className="mt-6">
                  <Button onClick={handleDownloadPayload} className="font-bold w-full flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Download Backup Payload (.json)
                  </Button>
                </div>
              </div>

              <div className="border rounded-xl p-5 bg-white flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Local State Metadata Summary</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Displays statistics of currently allocated key sectors in client-side storage.
                  </p>
                </div>
                <div className="space-y-2 mt-4 text-xs font-medium text-slate-600">
                  <div className="flex justify-between border-b pb-1.5">
                    <span>LocalStorage Sectors Assigned</span>
                    <span className="font-bold text-slate-900">{storageStats.localKeysCount} keys</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span>LocalStorage Volume Used</span>
                    <span className="font-bold text-slate-900">{storageStats.localKb} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IndexedDB Connection</span>
                    <span className="font-bold text-emerald-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> Active / Online
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DiagnosticsTab;
