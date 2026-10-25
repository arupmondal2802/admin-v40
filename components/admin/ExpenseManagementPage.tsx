import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AppData, SpendCategory, ExpenseItem, RecurringExpense, User, AppNotification } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { 
  IconPlus, IconTrash, IconPencil, IconDeviceFloppy, IconCheck, IconX,
  IconUpload, IconClipboardList, IconFileAnalytics, IconDownload, IconRefresh,
  IconBell, IconAlertTriangle
} from '../ui/Icon';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import SkeletonLoader from '../ui/SkeletonLoader';

interface ExpenseManagementPageProps {
  appData: AppData;
  currentUser: User;
  onRefresh: () => void;
  sheetsUrl: string;
  isLoading?: boolean;
  isHydrated?: boolean;
}

// Payment tracking options
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI'] as const;
const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'] as const;

export const ExpenseManagementPage: React.FC<ExpenseManagementPageProps> = ({
  appData,
  currentUser,
  onRefresh,
  sheetsUrl,
  isLoading,
  isHydrated
}) => {
  // Pull existing arrays or default to empty
  const expenses: ExpenseItem[] = useMemo(() => appData?.expenses || [], [appData?.expenses]);
  const recurringExpenses: RecurringExpense[] = useMemo(() => appData?.recurringExpenses || [], [appData?.recurringExpenses]);
  const categories: SpendCategory[] = useMemo(() => appData?.spendCategories || [], [appData?.spendCategories]);

  const dueRecurringExpenses = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTime = new Date(todayStr).getTime();
    const sevenDaysLaterTime = todayTime + 7 * 24 * 60 * 60 * 1000;

    return recurringExpenses.filter(re => {
      if (!re.isActive) return false;
      const dueTime = new Date(re.nextDueDate).getTime();
      return dueTime <= sevenDaysLaterTime;
    }).sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  }, [recurringExpenses]);

  // Automatically trigger cloud notifications when recurring expenses are due or overdue
  useEffect(() => {
    const checkAndTriggerNotifications = async () => {
      if (!currentUser || !recurringExpenses || recurringExpenses.length === 0) return;
      
      const todayStr = new Date().toISOString().split('T')[0];
      const todayTime = new Date(todayStr).getTime();
      const threeDaysLaterTime = todayTime + 3 * 24 * 60 * 60 * 1000;
      
      try {
        const { saveRecord } = await import('../../services/cloudDataService');
        const notifications: AppNotification[] = appData.notifications || [];
        
        for (const re of recurringExpenses) {
          if (!re.isActive) continue;
          const dueTime = new Date(re.nextDueDate).getTime();
          
          if (dueTime <= threeDaysLaterTime) {
            const notificationId = `notif_rec_${re.id}_${re.nextDueDate}`;
            const alreadyNotified = notifications.some(n => n.id === notificationId || n.serviceId === notificationId);
            
            if (!alreadyNotified) {
              const isOverdue = dueTime < todayTime;
              const message = `${isOverdue ? 'Overdue' : 'Upcoming'} Recurring Expense Reminder: "${re.name}" of ₹${re.amount.toFixed(2)} is due on ${re.nextDueDate}.`;
              
              const newNotification: AppNotification = {
                id: notificationId,
                userId: currentUser.username,
                serviceId: notificationId,
                message,
                timestamp: new Date().toISOString(),
                isRead: false,
                type: 'overdue-alert'
              };
              
              await saveRecord('Notifications', newNotification, sheetsUrl);
            }
          }
        }
      } catch (err) {
        console.error('Failed to save recurring expense notification:', err);
      }
    };
    
    checkAndTriggerNotifications();
  }, [recurringExpenses, appData.notifications, currentUser, sheetsUrl]);

  const getCategoryName = useCallback((catIdOrName: string) => {
    const cat = categories.find(c => c.id === catIdOrName || c.name === catIdOrName);
    return cat ? cat.name : catIdOrName;
  }, [categories]);

  // Current states
  const [activeTab, setActiveTab] = useState<'daily' | 'recurring' | 'reports' | 'categories'>('daily');
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Daily Expense Local Fields
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('Cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseAttachment, setExpenseAttachment] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Recurring Expense Local Fields
  const [recTitle, setRecTitle] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recFrequency, setRecFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recPaymentMode, setRecPaymentMode] = useState<'Cash' | 'Bank' | 'UPI'>('Cash');
  const [recStartDate, setRecStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [recNextDate, setRecNextDate] = useState(new Date().toISOString().split('T')[0]);
  const [recNotes, setRecNotes] = useState('');

  // Category Quick Budget Field
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [quickBudgetValue, setQuickBudgetValue] = useState('');
  const [quickCategoryNameValue, setQuickCategoryNameValue] = useState('');

  // Category Creation Fields
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryBudget, setNewCategoryBudget] = useState('');

  // Save Expense Item
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || !expenseAmount || !expenseCategory) {
      toast.error('Please fill in all required fields');
      return;
    }

    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }

    const item: ExpenseItem = {
      id: editingExpense?.id || `exp_${Date.now()}`,
      description: expenseTitle.trim(),
      amount: amt,
      categoryId: expenseCategory,
      date: expenseDate,
      paymentMode: expensePaymentMethod === 'Bank Transfer' ? 'Bank' : expensePaymentMethod,
      approvalNotes: expenseNotes.trim(),
      attachmentUrl: expenseAttachment || undefined,
      status: editingExpense?.status || 'Pending',
      recordedBy: editingExpense?.recordedBy || currentUser.username,
      timestamp: editingExpense?.timestamp || new Date().toISOString()
    };

    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('Expenses', item, sheetsUrl);
      toast.success(editingExpense ? 'Expense updated successfully' : 'Expense logged successfully');
      resetExpenseForm();
      onRefresh();
    } catch (err) {
      toast.error('Failed to save expense');
      console.error(err);
    }
  };

  const resetExpenseForm = () => {
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseCategory(categories[0]?.name || '');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpensePaymentMethod('Cash');
    setExpenseNotes('');
    setExpenseAttachment(null);
    setIsAddingExpense(false);
    setEditingExpense(null);
  };

  // Drag & drop file reader
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      convertToBase64(file);
    }
  };

  const convertToBase64 = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size exceeds 2MB limit');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setExpenseAttachment(reader.result as string);
      toast.success('Receipt attached successfully');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      convertToBase64(file);
    }
  };

  // Edit Expense Trigger
  const handleStartEditExpense = (item: ExpenseItem) => {
    setEditingExpense(item);
    setExpenseTitle(item.description);
    setExpenseAmount(String(item.amount));
    setExpenseCategory(item.categoryId);
    setExpenseDate(item.date);
    setExpensePaymentMethod(item.paymentMode === 'Bank' ? 'Bank Transfer' : item.paymentMode);
    setExpenseNotes(item.approvalNotes || '');
    setExpenseAttachment(item.attachmentUrl || null);
    setIsAddingExpense(true);
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      const { deleteRecord } = await import('../../services/cloudDataService');
      await deleteRecord('Expenses', id, sheetsUrl);
      toast.success('Expense deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  };

  // Approve/Reject Expense Actions (Approval Workflow)
  const handleUpdateStatus = async (item: ExpenseItem, status: typeof STATUS_OPTIONS[number]) => {
    const updated: ExpenseItem = {
      ...item,
      status,
      recordedBy: currentUser.username,
      timestamp: new Date().toISOString()
    };
    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('Expenses', updated, sheetsUrl);
      toast.success(`Expense ${status.toLowerCase()}`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Recurring Expenses CRUD
  const calculateNextDueDate = (currentDueDate: string, frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'): string => {
    const date = new Date(currentDueDate);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    
    const freq = (frequency || '').toLowerCase();
    if (freq === 'daily') {
      date.setDate(date.getDate() + 1);
    } else if (freq === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (freq === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else if (freq === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    
    return date.toISOString().split('T')[0];
  };

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recTitle.trim() || !recAmount || !recCategory) {
      toast.error('Please fill in all required fields');
      return;
    }

    const amt = parseFloat(recAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }

    const item: RecurringExpense = {
      id: editingRecurring?.id || `rec_${Date.now()}`,
      name: recTitle.trim(),
      amount: amt,
      categoryId: recCategory,
      frequency: (recFrequency.charAt(0).toUpperCase() + recFrequency.slice(1)) as 'Daily' | 'Weekly' | 'Monthly' | 'Yearly',
      paymentMode: recPaymentMode,
      startDate: recStartDate,
      nextDueDate: recNextDate,
      isActive: editingRecurring ? editingRecurring.isActive : true,
      notes: recNotes.trim()
    };

    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('RecurringExpenses', item, sheetsUrl);
      toast.success(editingRecurring ? 'Recurring expense updated' : 'Recurring expense configured');
      resetRecurringForm();
      onRefresh();
    } catch (err) {
      toast.error('Failed to save recurring expense');
    }
  };

  const resetRecurringForm = () => {
    setRecTitle('');
    setRecCategory(categories[0]?.name || categories[0]?.id || '');
    setRecAmount('');
    setRecFrequency('monthly');
    setRecPaymentMode('Cash');
    setRecStartDate(new Date().toISOString().split('T')[0]);
    setRecNextDate(new Date().toISOString().split('T')[0]);
    setRecNotes('');
    setIsAddingRecurring(false);
    setEditingRecurring(null);
  };

  const handlePayRecurringExpense = async (re: RecurringExpense) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const expenseId = `exp_rec_${re.id}_${Date.now()}`;
    
    const newExpense: ExpenseItem = {
      id: expenseId,
      description: `${re.name} (${re.frequency} Payment)`,
      amount: re.amount,
      categoryId: re.categoryId,
      date: todayStr,
      paymentMode: re.paymentMode || 'Cash',
      status: 'Approved',
      approvalNotes: `Auto-logged and paid from active recurring schedule: ${re.name}.`,
      recurringExpenseId: re.id,
      recordedBy: currentUser.username,
      timestamp: new Date().toISOString()
    };

    const nextDue = calculateNextDueDate(re.nextDueDate, re.frequency);
    
    const updatedRecurring: RecurringExpense = {
      ...re,
      nextDueDate: nextDue,
    };

    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('Expenses', newExpense, sheetsUrl);
      await saveRecord('RecurringExpenses', updatedRecurring, sheetsUrl);
      toast.success(`Logged payment of ₹${re.amount.toFixed(2)} for "${re.name}" and rolled next due date to ${nextDue}!`);
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to process payment and roll due date');
    }
  };

  const handleToggleRecurringActive = async (item: RecurringExpense) => {
    const updated: RecurringExpense = {
      ...item,
      isActive: !item.isActive
    };
    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('RecurringExpenses', updated, sheetsUrl);
      toast.success(updated.isActive ? 'Recurring expense activated' : 'Recurring expense paused');
      onRefresh();
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this recurring expense?')) return;
    try {
      const { deleteRecord } = await import('../../services/cloudDataService');
      await deleteRecord('RecurringExpenses', id, sheetsUrl);
      toast.success('Recurring expense removed');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete recurring expense');
    }
  };

  const handleStartEditRecurring = (item: RecurringExpense) => {
    setEditingRecurring(item);
    setRecTitle(item.name);
    setRecCategory(item.categoryId);
    setRecAmount(String(item.amount));
    setRecFrequency(item.frequency.toLowerCase() as any);
    setRecPaymentMode(item.paymentMode || 'Cash');
    setRecStartDate(item.startDate || new Date().toISOString().split('T')[0]);
    setRecNextDate(item.nextDueDate);
    setRecNotes(item.notes || '');
    setIsAddingRecurring(true);
  };

  // Quick edit budget and name for categories
  const handleSaveCategoryEdit = async (cat: SpendCategory) => {
    if (!quickCategoryNameValue.trim()) {
      toast.error('Category name is required');
      return;
    }
    const exists = categories.some(c => c.id !== cat.id && c.name.toLowerCase() === quickCategoryNameValue.trim().toLowerCase());
    if (exists) {
      toast.error('Another category with this name already exists');
      return;
    }
    const budgetNum = parseFloat(quickBudgetValue);
    const updatedCat: SpendCategory = {
      ...cat,
      name: quickCategoryNameValue.trim(),
      monthlyBudget: isNaN(budgetNum) || budgetNum < 0 ? undefined : budgetNum
    };
    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('SpendCategories', updatedCat, sheetsUrl);
      toast.success('Category updated successfully');
      setEditingBudgetId(null);
      setQuickBudgetValue('');
      setQuickCategoryNameValue('');
      onRefresh();
    } catch (err) {
      toast.error('Failed to update category');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }

    const exists = categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (exists) {
      toast.error('A category with this name already exists');
      return;
    }

    const budgetNum = parseFloat(newCategoryBudget);
    const newCat: SpendCategory = {
      id: `cat_${Date.now()}`,
      name: newCategoryName.trim(),
      monthlyBudget: isNaN(budgetNum) || budgetNum < 0 ? undefined : budgetNum
    };

    try {
      const { saveRecord } = await import('../../services/cloudDataService');
      await saveRecord('SpendCategories', newCat, sheetsUrl);
      toast.success('Category created successfully');
      setNewCategoryName('');
      setNewCategoryBudget('');
      onRefresh();
    } catch (err) {
      toast.error('Failed to create category');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const expensesUsingCategory = expenses.filter(e => e.categoryId === name || e.categoryId === id);
    if (expensesUsingCategory.length > 0) {
      toast.error(`Cannot delete category "${name}" because it is currently used by ${expensesUsingCategory.length} expense logs.`);
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete category "${name}"?`)) return;

    try {
      const { deleteRecord } = await import('../../services/cloudDataService');
      await deleteRecord('SpendCategories', id, sheetsUrl);
      toast.success('Category deleted successfully');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete category');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error('No expense data to export');
      return;
    }
    const headers = ['ID', 'Description', 'Amount', 'Category ID', 'Date', 'Payment Mode', 'Notes', 'Status', 'Recorded By', 'Timestamp'];
    const rows = expenses.map(e => [
      e.id,
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount,
      `"${e.categoryId}"`,
      e.date,
      e.paymentMode,
      `"${String(e.approvalNotes || '').replace(/"/g, '""')}"`,
      e.status,
      e.recordedBy || '',
      e.timestamp
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Expenses_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV exported successfully');
  };

  // Computed Values & Summaries
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []); // "YYYY-MM"

  const monthExpenses = useMemo(() => {
    return expenses.filter(e => e.date.startsWith(currentMonthStr) && e.status === 'Approved');
  }, [expenses, currentMonthStr]);

  const totalSpentThisMonth = useMemo(() => {
    return monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [monthExpenses]);

  const activeRecurringMonthlyTotal = useMemo(() => {
    return recurringExpenses
      .filter(re => re.isActive)
      .reduce((sum, re) => {
        let multi = 1;
        const freqLower = (re.frequency || '').toLowerCase();
        if (freqLower === 'weekly') multi = 4.33;
        else if (freqLower === 'quarterly' || freqLower === 'quarter') multi = 1/3;
        else if (freqLower === 'yearly') multi = 1/12;
        return sum + (re.amount * multi);
      }, 0);
  }, [recurringExpenses]);

  // Actual spend per category this month
  const categorySpends = useMemo(() => {
    const map = new Map<string, number>();
    categories.forEach(c => map.set(c.name, 0));
    monthExpenses.forEach(e => {
      const catName = getCategoryName(e.categoryId);
      const current = map.get(catName) || 0;
      map.set(catName, current + e.amount);
    });
    return map;
  }, [categories, monthExpenses, getCategoryName]);

  const overBudgetCount = useMemo(() => {
    let count = 0;
    categories.forEach(cat => {
      const actual = categorySpends.get(cat.name) || 0;
      if (cat.monthlyBudget !== undefined && actual > cat.monthlyBudget) {
        count++;
      }
    });
    return count;
  }, [categories, categorySpends]);

  // Filtered Daily Expenses List
  const filteredExpenses = useMemo(() => {
    return expenses.filter(item => {
      const catName = getCategoryName(item.categoryId);
      const method = item.paymentMode === 'Bank' ? 'Bank Transfer' : item.paymentMode;
      if (filterCategory !== 'All' && catName !== filterCategory) return false;
      if (filterPaymentMethod !== 'All' && method !== filterPaymentMethod) return false;
      if (filterStatus !== 'All' && item.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.description.toLowerCase().includes(query);
        const matchesNotes = (item.approvalNotes || '').toLowerCase().includes(query);
        if (!matchesTitle && !matchesNotes) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, filterCategory, filterPaymentMethod, filterStatus, searchQuery, getCategoryName]);

  // Reports charts data
  const categoryChartData = useMemo(() => {
    return categories.map(cat => ({
      name: cat.name,
      actual: Math.round(categorySpends.get(cat.name) || 0),
      budget: cat.monthlyBudget || 0
    })).filter(item => item.actual > 0 || item.budget > 0);
  }, [categories, categorySpends]);

  const paymentChartData = useMemo(() => {
    const data: Record<string, number> = { Cash: 0, 'Bank Transfer': 0, UPI: 0 };
    monthExpenses.forEach(e => {
      const method = e.paymentMode === 'Bank' ? 'Bank Transfer' : e.paymentMode;
      if (method in data) {
        data[method] += e.amount;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [monthExpenses]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF19A3'];

  const trendChartData = useMemo(() => {
    const days: Record<string, number> = {};
    monthExpenses.forEach(e => {
      const day = e.date.split('-')[2]; // Extract just the day "DD"
      days[day] = (days[day] || 0) + e.amount;
    });
    return Array.from({ length: 31 }, (_, i) => {
      const dayStr = String(i + 1).padStart(2, '0');
      return {
        day: dayStr,
        Amount: Math.round(days[dayStr] || 0)
      };
    });
  }, [monthExpenses]);

  if (isLoading || isHydrated === false || !appData || !currentUser) {
    return <SkeletonLoader view="EXPENSES" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <IconFileAnalytics className="w-8 h-8 text-brand-blue" />
            Expense Management
          </h1>
          <p className="text-slate-500 text-sm">
            Track daily receipts, manage recurring invoices, monitor budgets, and streamline approvals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onRefresh}>
            <IconRefresh className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => {
            if (activeTab === 'recurring') {
              setIsAddingRecurring(true);
            } else {
              setIsAddingExpense(true);
              setExpenseCategory(categories[0]?.name || '');
            }
          }}>
            <IconPlus className="w-4 h-4 mr-1" />
            {activeTab === 'recurring' ? 'Setup Recurring Cost' : 'Log Expense'}
          </Button>
        </div>
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#071629] text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Spent This Month (Approved)</p>
            <h3 className="text-3xl font-black mt-2">₹{totalSpentThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-slate-300 text-xs mt-1">For {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <IconFileAnalytics className="w-8 h-8 text-brand-accent" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Recurring Monthly Commitment</p>
            <h3 className="text-3xl font-black mt-2 text-slate-900">₹{activeRecurringMonthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-emerald-600 text-xs mt-1 flex items-center font-medium">
              ● {recurringExpenses.filter(r => r.isActive).length} active schedules
            </p>
          </div>
          <div className="p-3 bg-brand-blue/5 rounded-xl">
            <IconClipboardList className="w-8 h-8 text-brand-blue" />
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm flex items-center justify-between ${overBudgetCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Over-Budget Categories</p>
            <h3 className={`text-3xl font-black mt-2 ${overBudgetCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {overBudgetCount}
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              {overBudgetCount > 0 ? 'Action required: optimize spending' : 'All categories within budget limits'}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${overBudgetCount > 0 ? 'bg-red-500/10' : 'bg-brand-blue/5'}`}>
            <IconX className={`w-8 h-8 ${overBudgetCount > 0 ? 'text-red-500' : 'text-brand-blue'}`} />
          </div>
        </div>
      </div>

      {/* Reminders / Alerts Section */}
      {dueRecurringExpenses.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-700 mt-0.5 animate-pulse">
              <IconBell className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-extrabold text-amber-900 tracking-tight">
                ⏰ Upcoming & Overdue Recurring Expense Reminders ({dueRecurringExpenses.length})
              </h4>
              <p className="text-amber-700 text-xs mt-0.5">
                The following pre-configured periodic expenses are due soon or overdue. Click "Log & Pay" to instantly generate an approved expense receipt and automatically roll the schedule's next due date forward.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dueRecurringExpenses.map(re => {
              const isOverdue = new Date(re.nextDueDate).getTime() < new Date(new Date().toISOString().split('T')[0]).getTime();
              return (
                <div key={re.id} className="bg-white/90 backdrop-blur-sm border border-amber-100 rounded-xl p-3.5 flex flex-col justify-between gap-3 hover:shadow-md transition-all">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isOverdue ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {isOverdue ? 'Overdue' : 'Due Soon'}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{re.frequency}</span>
                    </div>
                    <h5 className="font-bold text-slate-900 mt-1 text-sm line-clamp-1">{re.name}</h5>
                    <p className="text-slate-500 text-xs">{getCategoryName(re.categoryId)}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-slate-700 text-xs">
                      <span className="font-semibold text-slate-900">₹{re.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-slate-300">|</span>
                      <span>Due: <strong className="font-mono">{re.nextDueDate}</strong></span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePayRecurringExpense(re)}
                      className="flex-1 inline-flex justify-center items-center px-3 py-1.5 bg-[#071629] hover:bg-[#0c2442] text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                      <IconCheck className="w-3.5 h-3.5 mr-1" />
                      Log & Pay
                    </button>
                    <button
                      onClick={() => {
                        handleStartEditRecurring(re);
                        setActiveTab('recurring');
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('daily')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === 'daily' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Daily Expenses
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === 'recurring' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Recurring Invoices
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === 'reports' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Expense Analytics & Budgets
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === 'categories' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Category Budgets
        </button>
      </div>

      {/* Log Daily Expense Modal/Drawer Inline */}
      {isAddingExpense && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-4">
          <div className="flex justify-between items-center pb-2 border-b">
            <h2 className="text-xl font-extrabold text-slate-900">{editingExpense ? 'Edit Expense Entry' : 'Log New Expense'}</h2>
            <button onClick={resetExpenseForm} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><IconX className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSaveExpense} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="Expense Title / Recipient *" 
              id="title" 
              value={expenseTitle} 
              onChange={e => setExpenseTitle(e.target.value)} 
              placeholder="e.g., Office Broadband Wifi" 
              required
            />
            <Input 
              label="Amount (₹) *" 
              id="amount" 
              type="number" 
              step="0.01"
              value={expenseAmount} 
              onChange={e => setExpenseAmount(e.target.value)} 
              placeholder="0.00" 
              required
            />
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Spend Category *</label>
              <select
                value={expenseCategory}
                onChange={e => setExpenseCategory(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-blue"
                required
              >
                <option value="" disabled>Select Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Payment Method *</label>
              <select
                value={expensePaymentMethod}
                onChange={e => setExpensePaymentMethod(e.target.value as any)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-blue"
                required
              >
                {PAYMENT_METHODS.map(pm => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>

            <Input 
              label="Expense Date *" 
              id="date" 
              type="date" 
              value={expenseDate} 
              onChange={e => setExpenseDate(e.target.value)} 
              required
            />

            <div className="flex flex-col md:row-span-2">
              <label className="text-xs font-bold text-slate-600 mb-1">Receipt Attachment (Max 2MB)</label>
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragging ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-brand-blue/50'}`}
              >
                {expenseAttachment ? (
                  <div className="space-y-2">
                    <img src={expenseAttachment} alt="Preview" className="h-20 mx-auto object-contain rounded border" />
                    <button type="button" onClick={() => setExpenseAttachment(null)} className="text-xs text-red-500 font-bold hover:underline">Remove Receipt</button>
                  </div>
                ) : (
                  <>
                    <IconUpload className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-xs text-slate-600">Drag & Drop or <span className="text-brand-blue font-bold">Browse</span> receipt image</p>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                      id="receiptFile" 
                    />
                    <label htmlFor="receiptFile" className="absolute inset-0 cursor-pointer opacity-0" />
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Notes & Description</label>
              <textarea
                value={expenseNotes}
                onChange={e => setExpenseNotes(e.target.value)}
                placeholder="e.g., Monthly internet subscription for main workshop building..."
                className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 h-24 focus:outline-none focus:ring-1 focus:ring-brand-blue resize-none"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="secondary" onClick={resetExpenseForm}>Cancel</Button>
              <Button type="submit">
                <IconDeviceFloppy className="w-4 h-4 mr-1" />
                {editingExpense ? 'Save Updates' : 'File Expense'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Daily Expenses List */}
      {activeTab === 'daily' && (
        <Card title="Expenses Registry">
          {/* List Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Input 
              label="Search keyword" 
              id="search" 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="Search title, description..." 
            />
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Filter Category</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none"
              >
                <option value="All">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Filter Payment</label>
              <select
                value={filterPaymentMethod}
                onChange={e => setFilterPaymentMethod(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none"
              >
                <option value="All">All Payments</option>
                {PAYMENT_METHODS.map(pm => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 mb-1">Filter Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                {STATUS_OPTIONS.map(so => (
                  <option key={so} value={so}>{so}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-slate-500 font-bold">Showing {filteredExpenses.length} expense items</p>
            <Button variant="secondary" size="sm" onClick={handleExportCSV}>
              <IconDownload className="w-4 h-4 mr-1" />
              Export to CSV
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Expense Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Receipt</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredExpenses.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{item.description}</p>
                      {item.approvalNotes && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.approvalNotes}</p>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{getCategoryName(item.categoryId)}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">{item.date}</td>
                    <td className="py-3.5 px-4 text-slate-600">{item.paymentMode === 'Bank' ? 'Bank Transfer' : item.paymentMode}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">₹{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold leading-5 ${
                        item.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {item.attachmentUrl ? (
                        <a 
                          href={item.attachmentUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-xs text-brand-blue font-bold hover:underline"
                        >
                          View Receipt
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* Approval Actions for Admins / Managers */}
                      {item.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(item, 'Approved')}
                            title="Approve"
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          >
                            <IconCheck className="w-5 h-5 inline" />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(item, 'Rejected')}
                            title="Reject"
                            className="p-1 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <IconX className="w-5 h-5 inline" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleStartEditExpense(item)}
                        className="p-1 text-slate-400 hover:text-slate-800"
                        title="Edit"
                      >
                        <IconPencil className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(item.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Delete"
                      >
                        <IconTrash className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      No expense records found. Click "Log Expense" to add your first daily expense!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Recurring Expenses CRUD */}
      {activeTab === 'recurring' && (
        <div className="space-y-6">
          {isAddingRecurring && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
              <div className="flex justify-between items-center pb-2 border-b mb-4">
                <h2 className="text-xl font-extrabold text-slate-900">{editingRecurring ? 'Edit Recurring Schedule' : 'Create Recurring Schedule'}</h2>
                <button onClick={resetRecurringForm} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><IconX className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSaveRecurring} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                  label="Recurring Expense Name *" 
                  id="recTitle" 
                  value={recTitle} 
                  onChange={e => setRecTitle(e.target.value)} 
                  placeholder="e.g., Monthly Rent, Annual Software Fees" 
                  required
                />
                <Input 
                  label="Amount (₹) *" 
                  id="recAmount" 
                  type="number" 
                  step="0.01"
                  value={recAmount} 
                  onChange={e => setRecAmount(e.target.value)} 
                  placeholder="0.00" 
                  required
                />

                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-600 mb-1">Spend Category *</label>
                  <select
                    value={recCategory}
                    onChange={e => setRecCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800"
                    required
                  >
                    <option value="" disabled>Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-600 mb-1">Frequency *</label>
                  <select
                    value={recFrequency}
                    onChange={e => setRecFrequency(e.target.value as any)}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800"
                    required
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-600 mb-1">Default Payment Method *</label>
                  <select
                    value={recPaymentMode}
                    onChange={e => setRecPaymentMode(e.target.value as any)}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800"
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>

                <Input 
                  label="Start Date *" 
                  id="recStartDate" 
                  type="date" 
                  value={recStartDate} 
                  onChange={e => setRecStartDate(e.target.value)} 
                  required
                />

                <Input 
                  label="Next Due Date *" 
                  id="recNextDate" 
                  type="date" 
                  value={recNextDate} 
                  onChange={e => setRecNextDate(e.target.value)} 
                  required
                />

                <div className="flex flex-col md:col-span-2">
                  <label className="text-xs font-bold text-slate-600 mb-1">Notes / Terms</label>
                  <textarea
                    id="recNotes"
                    value={recNotes}
                    onChange={e => setRecNotes(e.target.value)}
                    placeholder="e.g., Contract renewal on December 31st, invoice auto-sent by provider"
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="secondary" onClick={resetRecurringForm}>Cancel</Button>
                  <Button type="submit">
                    <IconDeviceFloppy className="w-4 h-4 mr-1" />
                    Save Schedule
                  </Button>
                </div>
              </form>
            </div>
          )}

          <Card title="Recurring Schedules">
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Schedule Details</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Timeline</th>
                    <th className="py-3 px-4 text-right">Commitment</th>
                    <th className="py-3 px-4 text-center">Active Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {recurringExpenses.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        {item.notes && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.notes}</p>}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{getCategoryName(item.categoryId)}</td>
                      <td className="py-3.5 px-4 text-slate-600 capitalize">{item.frequency}</td>
                      <td className="py-3.5 px-4 text-slate-600">{item.paymentMode === 'Bank' ? 'Bank Transfer' : item.paymentMode}</td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs">
                        <p>Start: <span className="font-mono">{item.startDate || 'N/A'}</span></p>
                        <p className="font-semibold text-slate-700 mt-0.5">Next: <span className="font-mono text-brand-blue">{item.nextDueDate}</span></p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">₹{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleRecurringActive(item)}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold leading-5 border transition-all ${
                            item.isActive 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          {item.isActive ? '● Active' : '○ Paused'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {item.isActive && (
                          <button
                            onClick={() => handlePayRecurringExpense(item)}
                            className="p-1 text-emerald-600 hover:text-emerald-800"
                            title="Instant Log & Pay"
                          >
                            <IconCheck className="w-4 h-4 inline" />
                          </button>
                        )}
                        <button
                          onClick={() => handleStartEditRecurring(item)}
                          className="p-1 text-slate-400 hover:text-slate-800"
                          title="Edit"
                        >
                          <IconPencil className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecurring(item.id)}
                          className="p-1 text-red-400 hover:text-red-600"
                          title="Delete"
                        >
                          <IconTrash className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {recurringExpenses.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        No recurring expense schedules configured. Click "Setup Recurring Cost" to manage contract expenditures!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Reports & Analytics */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Monthly Category Spend vs. Budget Limits">
              {categoryChartData.length > 0 ? (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip formatter={(value) => [`₹${value}`, undefined]} />
                      <Legend />
                      <Bar dataKey="actual" fill="#0f172a" name="Actual Spend" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="budget" fill="#f59e0b" name="Allocated Budget" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-400">No category spends logged this month.</div>
              )}
            </Card>

            <Card title="Daily Spending Trend (Approved Expenses)">
              {trendChartData.some(d => d.Amount > 0) ? (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="day" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip formatter={(value) => [`₹${value}`, 'Amount']} />
                      <Line type="monotone" dataKey="Amount" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-400">No approved spending logged yet.</div>
              )}
            </Card>
          </div>

          {/* Payment breakdown and quick budget table */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card title="Payment Mode Breakdown" className="md:col-span-1">
              {paymentChartData.some(d => d.value > 0) ? (
                <div className="space-y-4">
                  <div className="h-44 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentChartData.filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {paymentChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`₹${value}`, 'Spent']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {paymentChartData.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="text-slate-900">₹{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-slate-400">No logs found.</div>
              )}
            </Card>

            <Card title="Current Month Budget Utilization Overview" className="md:col-span-2">
              <div className="space-y-4">
                {categories.map(cat => {
                  const actual = categorySpends.get(cat.name) || 0;
                  const budget = cat.monthlyBudget || 0;
                  const percent = budget > 0 ? (actual / budget) * 100 : 0;
                  const isOver = budget > 0 && actual > budget;

                  return (
                    <div key={cat.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>{cat.name}</span>
                        <span>
                          ₹{actual.toLocaleString()} / {budget > 0 ? `₹${budget.toLocaleString()}` : 'No Budget'}
                          {budget > 0 && ` (${Math.round(percent)}%)`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            isOver ? 'bg-red-500' : percent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {categories.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No categories configured yet.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab: Quick Category Budget Configuration */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <Card title="Create Expense Category">
              <p className="text-slate-500 text-xs mb-4">Add custom categories to categorize your daily and recurring expenditures.</p>
              <form onSubmit={handleCreateCategory} className="space-y-4">
                <Input
                  label="Category Name *"
                  id="newCategoryName"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Marketing, Tools, Rent"
                  required
                />
                <Input
                  label="Monthly Budget Target (₹)"
                  id="newCategoryBudget"
                  type="number"
                  step="0.01"
                  value={newCategoryBudget}
                  onChange={e => setNewCategoryBudget(e.target.value)}
                  placeholder="e.g., 500.00 (Optional)"
                />
                <Button type="submit" className="w-full">
                  <IconPlus className="w-4 h-4 mr-1" />
                  Create Category
                </Button>
              </form>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card title="Quick Monthly Budget Limits">
              <p className="text-slate-500 text-xs mb-4">Set strict category spending caps to monitor real-time overages.</p>
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-sm transition-all">
                    <div>
                      <h4 className="font-bold text-slate-900">{cat.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Monthly Allocation: {cat.monthlyBudget !== undefined ? `₹${cat.monthlyBudget.toLocaleString()}` : 'Unallocated'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingBudgetId === cat.id ? (
                        <div className="flex items-end gap-2 flex-wrap justify-end">
                          <div className="w-36">
                            <Input
                              label="Name"
                              id={`edit-name-${cat.id}`}
                              value={quickCategoryNameValue}
                              onChange={e => setQuickCategoryNameValue(e.target.value)}
                              className="h-9 text-xs"
                              placeholder="Name"
                            />
                          </div>
                          <div className="w-24">
                            <Input
                              label="Budget (₹)"
                              id={`budget-${cat.id}`}
                              type="number"
                              placeholder="Limit (₹)"
                              value={quickBudgetValue}
                              onChange={e => setQuickBudgetValue(e.target.value)}
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="flex gap-1 h-9 items-center mt-auto">
                            <Button size="sm" onClick={() => handleSaveCategoryEdit(cat)} title="Save changes">
                              <IconDeviceFloppy className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => { setEditingBudgetId(null); setQuickBudgetValue(''); setQuickCategoryNameValue(''); }} title="Cancel">
                              <IconX className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => {
                              setEditingBudgetId(cat.id);
                              setQuickBudgetValue(String(cat.monthlyBudget || ''));
                              setQuickCategoryNameValue(cat.name);
                            }}
                          >
                            Configure Category
                          </Button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Category"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    No expense categories configured. Get started by adding a category on the left panel!
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Sync footer indicator */}
      <div className="bg-slate-50 p-4 rounded-xl border flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Direct Synchronization Active with PostgreSQL & Google Sheets Databases
        </span>
        <span>Offline caching enabled automatically</span>
      </div>
    </div>
  );
};

export default ExpenseManagementPage;

