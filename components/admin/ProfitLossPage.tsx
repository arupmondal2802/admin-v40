import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Service, ServiceStatus, ProfitLoss, PredefinedCost, DynamicCostItem, PLTab } from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import {
  IconDeviceFloppy, IconCheck, IconChevronDown, IconSettings,
  IconPlus, IconTrash, IconChartBar, IconReceipt, IconEngine,
  IconWorld, IconClock, IconSparkles, IconFilter, IconPencil,
  IconX, IconRefresh, IconCheckCircle, IconCommand
} from '../ui/Icon';
import SkeletonLoader from '../ui/SkeletonLoader';

interface ProfitLossPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  profitLossData: ProfitLoss[];
  onSave: (pl: ProfitLoss) => void;
  predefinedCosts: PredefinedCost[];
  onUpdatePredefinedCosts: (costs: PredefinedCost[]) => void;
}

export interface CategoryCostDefault {
  materialCost: number;
  laborCost: number;
  otherExpenses: number;
}

export const DEFAULT_CATEGORY_COSTS: Record<PLTab, CategoryCostDefault> = {
  ALL: { materialCost: 100, laborCost: 100, otherExpenses: 0 },
  WASH: { materialCost: 50, laborCost: 80, otherExpenses: 0 },
  CARE: { materialCost: 200, laborCost: 150, otherExpenses: 0 },
  TYRE: { materialCost: 150, laborCost: 100, otherExpenses: 0 },
  BATTERY: { materialCost: 100, laborCost: 80, otherExpenses: 0 },
  CUSTOM: { materialCost: 100, laborCost: 100, otherExpenses: 0 },
  OVERHEADS: { materialCost: 0, laborCost: 0, otherExpenses: 0 }
};

// Helper to determine the primary category of a service order
export const getServiceCategoryTab = (service: Service): PLTab => {
  const selections = Array.isArray(service.serviceSelection) ? service.serviceSelection : [];
  if (selections.includes('Car Washing')) return 'WASH';
  if (selections.includes('Car Care')) return 'CARE';
  if (selections.includes('Tyre Replacement')) return 'TYRE';
  if (selections.includes('Battery Replacement')) return 'BATTERY';
  if (Array.isArray(service.customServices) && service.customServices.length > 0) return 'CUSTOM';
  return 'ALL';
};

// ── Individual job P&L card ──────────────────────────────────────────────────
const ProfitLossCalculator: React.FC<{
  service: Service;
  profitLoss: ProfitLoss | undefined;
  onSave: (pl: ProfitLoss) => void;
  predefinedCosts: PredefinedCost[];
  specificServiceRevenue?: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ service, profitLoss, onSave, predefinedCosts, specificServiceRevenue, isSelected, onToggleSelect }) => {

  const initialPL: ProfitLoss = profitLoss || {
    serviceId: service.submissionId,
    materialCost: service.tyreMaterialCost || 0,
    laborCost: service.tyreLaborCost || 0,
    otherExpenses: 0,
    dynamicCosts: [],
    calculatedProfit: 0,
    notes: '',
  };

  const revenue = specificServiceRevenue !== undefined ? specificServiceRevenue : service.grandTotal;

  const calcProfit = useCallback((mat: number, lab: number, other: number, dyn: DynamicCostItem[]) =>
    revenue - mat - lab - other - (dyn || []).reduce((s, c) => s + c.value, 0),
    [revenue]);

  const [pl, setPl] = useState<ProfitLoss>(initialPL);
  const [isSaved, setIsSaved] = useState(!!profitLoss);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (profitLoss) { setPl(profitLoss); setIsSaved(true); }
  }, [profitLoss]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const num = name !== 'notes' ? parseFloat(value) || 0 : 0;
    setPl(prev => {
      const updated = { ...prev, [name]: name === 'notes' ? value : num };
      if (name !== 'notes') {
        updated.calculatedProfit = calcProfit(
          name === 'materialCost' ? num : updated.materialCost,
          name === 'laborCost' ? num : updated.laborCost,
          name === 'otherExpenses' ? num : updated.otherExpenses,
          updated.dynamicCosts || []);
      }
      return updated;
    });
    setIsSaved(false);
  };

  const updateDynamic = (id: string, field: 'label' | 'value', val: string | number) => {
    setPl(prev => {
      const costs = (prev.dynamicCosts || []).map(c => c.id === id ? { ...c, [field]: val } : c);
      return { ...prev, dynamicCosts: costs, calculatedProfit: calcProfit(prev.materialCost, prev.laborCost, prev.otherExpenses, costs) };
    });
    setIsSaved(false);
  };

  const removeDynamic = (id: string) => {
    setPl(prev => {
      const costs = (prev.dynamicCosts || []).filter(c => c.id !== id);
      return { ...prev, dynamicCosts: costs, calculatedProfit: calcProfit(prev.materialCost, prev.laborCost, prev.otherExpenses, costs) };
    });
    setIsSaved(false);
  };

  const applyPreset = (cost: number, name: string) => {
    setPl(prev => {
      const costs = [...(prev.dynamicCosts || []), { id: `dc_${Date.now()}_${Math.random()}`, label: name, value: cost }];
      return { ...prev, dynamicCosts: costs, calculatedProfit: calcProfit(prev.materialCost, prev.laborCost, prev.otherExpenses, costs) };
    });
    setIsSaved(false);
  };

  const addBlankDynamic = () => {
    setPl(prev => {
      const costs = [...(prev.dynamicCosts || []), { id: `dc_${Date.now()}`, label: 'New Cost', value: 0 }];
      return { ...prev, dynamicCosts: costs };
    });
    setIsSaved(false);
    setIsExpanded(true);
  };

  const totalCost = pl.materialCost + pl.laborCost + pl.otherExpenses + (pl.dynamicCosts || []).reduce((s, c) => s + c.value, 0);
  const margin = revenue > 0 ? (pl.calculatedProfit / revenue) * 100 : 0;

  return (
    <div className={`rounded-lg border-l-4 transition-all ${isSelected ? 'bg-brand-accent/5 border-brand-accent ring-1 ring-brand-accent/20' : 'bg-slate-50 border-slate-200'} shadow-sm overflow-hidden`}>
      {/* Header row */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
              className="h-4 w-4 rounded border-slate-300 text-brand-accent focus:ring-brand-accent cursor-pointer" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Breakdown</span>
          </div>
          <div className="flex items-center gap-2">
            {isSaved
              ? <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">SYNCED</span>
              : <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">UNSAVED</span>}
            <button onClick={() => setIsExpanded(e => !e)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500">
              <IconChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Main cost inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Material (₹)" name="materialCost" type="number" value={pl.materialCost} onChange={handleChange} className="bg-white" />
          <Input label="Labour (₹)" name="laborCost" type="number" value={pl.laborCost} onChange={handleChange} className="bg-white" />
          <div className="flex flex-col justify-end pb-1 px-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Revenue</p>
            <p className="text-xl font-black text-brand-blue">₹{revenue.toLocaleString('en-IN')}</p>
          </div>
          <div className={`flex flex-col justify-end pb-1 px-3 rounded border ${pl.calculatedProfit < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Profit</p>
            <p className={`text-xl font-black ${pl.calculatedProfit < 0 ? 'text-red-600' : 'text-green-700'}`}>
              ₹{pl.calculatedProfit.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Margin bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Margin: <b className={margin >= 30 ? 'text-green-700' : margin >= 15 ? 'text-amber-600' : 'text-red-600'}>{margin.toFixed(1)}%</b></span>
            <span>Cost: ₹{totalCost.toFixed(0)} of ₹{revenue.toFixed(0)}</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${margin >= 30 ? 'bg-green-500' : margin >= 15 ? 'bg-amber-400' : margin >= 0 ? 'bg-red-400' : 'bg-red-600'}`}
              style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} />
          </div>
        </div>
      </div>

      {/* Expandable: dynamic costs + presets */}
      {isExpanded && (
        <div className="border-t border-slate-200 p-4 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dynamic Line Items</h4>
            <button onClick={addBlankDynamic}
              className="flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-accent">
              <IconPlus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>

          {(pl.dynamicCosts || []).length === 0 && (
            <p className="text-xs text-slate-400 italic">No additional line items yet.</p>
          )}
          <div className="space-y-1.5">
            {(pl.dynamicCosts || []).map(cost => (
              <div key={cost.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <input placeholder="Cost label" value={cost.label}
                  onChange={e => updateDynamic(cost.id, 'label', e.target.value)}
                  className="flex-grow text-xs border-none focus:ring-0 bg-transparent font-medium" />
                <div className="flex items-center gap-1 border-l pl-2">
                  <span className="text-[10px] text-slate-400">₹</span>
                  <input type="number" value={cost.value}
                    onChange={e => updateDynamic(cost.id, 'value', parseFloat(e.target.value) || 0)}
                    className="w-20 text-xs border-none focus:ring-0 font-bold text-right bg-transparent" />
                </div>
                <button onClick={() => removeDynamic(cost.id)} className="text-slate-300 hover:text-red-500">
                  <IconTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Preset chips */}
          {predefinedCosts.filter(c => !c.category || c.category === 'ALL' || c.category === service.serviceSelection[0]).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {predefinedCosts.filter(c => !c.category || c.category === 'ALL' || c.category === service.serviceSelection[0]).map(cost => (
                <button key={cost.id} onClick={() => applyPreset(cost.value, cost.name)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded-full hover:border-brand-accent hover:text-brand-blue transition-colors">
                  + {cost.name} ₹{cost.value}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t">
            <Input label="" name="otherExpenses" type="number" value={pl.otherExpenses} onChange={handleChange}
              className="w-28 bg-white !mb-0" placeholder="Other (₹)" />
            <textarea name="notes" value={pl.notes || ''} onChange={handleChange} rows={1}
              className="flex-grow px-3 py-2 border border-slate-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-brand-accent resize-none"
              placeholder="Expense notes…" />
            <Button onClick={() => { onSave(pl); setIsSaved(true); }} size="sm" variant={isSaved ? 'ghost' : 'primary'}>
              {isSaved ? <IconCheck className="w-4 h-4 text-green-600" /> : <IconDeviceFloppy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* Collapsed save strip */}
      {!isExpanded && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <textarea name="notes" value={pl.notes || ''} onChange={handleChange} rows={1}
            className="flex-grow px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-brand-accent resize-none"
            placeholder="Notes…" />
          <Button onClick={() => { onSave(pl); setIsSaved(true); }} size="sm" variant={isSaved ? 'ghost' : 'primary'}>
            {isSaved ? <IconCheck className="w-4 h-4 text-green-600" /> : <IconDeviceFloppy className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Main ProfitLossPage ──────────────────────────────────────────────────────
export const ProfitLossPage: React.FC<ProfitLossPageProps> = (props) => {
  const {
    submissions = [], profitLossData = [], onSave, predefinedCosts = [], onUpdatePredefinedCosts,
    isLoading, isHydrated
  } = props;

  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions : [], [submissions]);
  const safeProfitLossData = useMemo(() => Array.isArray(profitLossData) ? profitLossData : [], [profitLossData]);
  const safePredefinedCosts = useMemo(() => Array.isArray(predefinedCosts) ? predefinedCosts : [], [predefinedCosts]);

  const [activeTab, setActiveTab] = useState<PLTab>('ALL');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetValue, setNewPresetValue] = useState<number | ''>('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editPresetVal, setEditPresetVal] = useState<number>(0);

  // Predefined Material & Labour category defaults state with persistence
  const [categoryDefaults, setCategoryDefaults] = useState<Record<PLTab, CategoryCostDefault>>(() => {
    try {
      const saved = localStorage.getItem('category_cost_defaults');
      if (saved) {
        return { ...DEFAULT_CATEGORY_COSTS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to parse saved category defaults:', e);
    }
    return DEFAULT_CATEGORY_COSTS;
  });

  const handleUpdateCategoryDefaults = (updated: Record<PLTab, CategoryCostDefault>) => {
    setCategoryDefaults(updated);
    try {
      localStorage.setItem('category_cost_defaults', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save category defaults:', e);
    }
  };

  // Bulk update modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<'SELECTED' | 'CATEGORY' | 'ALL'>('SELECTED');
  
  // Bulk Cost Modes
  const [matMode, setMatMode] = useState<'KEEP' | 'SET' | 'ADD' | 'SUB' | 'CATEGORY_DEFAULT'>('KEEP');
  const [matValue, setMatValue] = useState<number>(0);
  
  const [labMode, setLabMode] = useState<'KEEP' | 'SET' | 'ADD' | 'SUB' | 'CATEGORY_DEFAULT'>('KEEP');
  const [labValue, setLabValue] = useState<number>(0);

  const [otherMode, setOtherMode] = useState<'KEEP' | 'SET' | 'ADD'>('KEEP');
  const [otherValue, setOtherValue] = useState<number>(0);

  const [addDynamicItem, setAddDynamicItem] = useState(false);
  const [dynamicLabel, setDynamicLabel] = useState('');
  const [dynamicVal, setDynamicVal] = useState<number>(0);

  const [bulkNote, setBulkNote] = useState('');

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const serviceTabs: { id: PLTab; label: string; icon: any }[] = [
    { id: 'ALL', label: 'All Jobs', icon: <IconChartBar /> },
    { id: 'WASH', label: 'Car Washing', icon: <IconCheck /> },
    { id: 'CARE', label: 'Car Care', icon: <IconSparkles /> },
    { id: 'TYRE', label: 'Tyre Replace', icon: <IconEngine /> },
    { id: 'BATTERY', label: 'Battery Replace', icon: <IconWorld /> },
    { id: 'CUSTOM', label: 'Custom Service', icon: <IconPlus /> },
  ];

  const filteredJobs = useMemo(() => {
    const completed = safeSubmissions.filter(s => s && s.status === ServiceStatus.Completed && !s.isDeleted);
    switch (activeTab) {
      case 'WASH': return completed.filter(s => (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).includes('Car Washing'));
      case 'CARE': return completed.filter(s => (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).includes('Car Care'));
      case 'TYRE': return completed.filter(s => (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).includes('Tyre Replacement'));
      case 'BATTERY': return completed.filter(s => (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).includes('Battery Replacement'));
      case 'CUSTOM': return completed.filter(s => Array.isArray(s.customServices) && s.customServices.length > 0);
      default: return completed;
    }
  }, [safeSubmissions, activeTab]);

  // ── Aggregated summary ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    let revenue = 0, material = 0, labor = 0, dynamic = 0, costedCount = 0;
    filteredJobs.forEach(s => {
      revenue += s.grandTotal || 0;
      const pl = safeProfitLossData.find(p => p.serviceId === s.submissionId);
      if (pl) {
        material += pl.materialCost || 0;
        labor += pl.laborCost || 0;
        const dynSum = (Array.isArray(pl.dynamicCosts) ? pl.dynamicCosts : []).reduce((a, c) => a + c.value, 0);
        dynamic += dynSum + (pl.otherExpenses || 0);
        costedCount++;
      } else {
        material += s.tyreMaterialCost || 0;
        labor += s.tyreLaborCost || 0;
      }
    });
    const totalCost = material + labor + dynamic;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, material, labor, dynamic, totalCost, profit, margin, costedCount, total: filteredJobs.length };
  }, [filteredJobs, safeProfitLossData]);

  const handleSelectAll = () => {
    setSelectedJobIds(prev => prev.length === filteredJobs.length ? [] : filteredJobs.map(j => j.submissionId));
  };

  const toggleJob = (id: string) => setSelectedJobIds(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleAddPreset = () => {
    if (!newPresetName || newPresetValue === '') return;
    onUpdatePredefinedCosts([...predefinedCosts, {
      id: `pc_${Date.now()}`, name: newPresetName, value: Number(newPresetValue), category: activeTab
    }]);
    setNewPresetName(''); setNewPresetValue('');
  };

  const handleDeletePreset = (id: string) => onUpdatePredefinedCosts(predefinedCosts.filter(p => p.id !== id));

  const handleSavePresetEdit = (id: string) => {
    onUpdatePredefinedCosts(predefinedCosts.map(p => p.id === id ? { ...p, value: editPresetVal } : p));
    setEditingPresetId(null);
  };

  // ── CORE BULK COST UPDATE HANDLER ──────────────────────────────────────────
  const executeBulkUpdate = (targetJobIds: string[], options?: {
    materialMode?: 'KEEP' | 'SET' | 'ADD' | 'SUB' | 'CATEGORY_DEFAULT';
    materialValue?: number;
    laborMode?: 'KEEP' | 'SET' | 'ADD' | 'SUB' | 'CATEGORY_DEFAULT';
    laborValue?: number;
    otherMode?: 'KEEP' | 'SET' | 'ADD';
    otherValue?: number;
    dynamicItem?: { label: string; value: number } | null;
    note?: string;
  }) => {
    const mMode = options?.materialMode || matMode;
    const mVal = options?.materialValue !== undefined ? options.materialValue : matValue;
    const lMode = options?.laborMode || labMode;
    const lVal = options?.laborValue !== undefined ? options.laborValue : labValue;
    const oMode = options?.otherMode || otherMode;
    const oVal = options?.otherValue !== undefined ? options.otherValue : otherValue;
    const dynItem = options?.dynamicItem !== undefined ? options.dynamicItem : (addDynamicItem && dynamicLabel ? { label: dynamicLabel, value: dynamicVal } : null);
    const noteText = options?.note !== undefined ? options.note : bulkNote;

    if (targetJobIds.length === 0) {
      alert('No services selected for bulk update.');
      return;
    }

    let updatedCount = 0;

    targetJobIds.forEach(jobId => {
      const service = safeSubmissions.find(j => j.submissionId === jobId);
      if (!service) return;

      const existingPL: ProfitLoss = safeProfitLossData.find(pl => pl.serviceId === jobId) || {
        serviceId: jobId,
        materialCost: service.tyreMaterialCost || 0,
        laborCost: service.tyreLaborCost || 0,
        otherExpenses: 0,
        dynamicCosts: [],
        calculatedProfit: 0,
        notes: ''
      };

      const categoryTab = getServiceCategoryTab(service);
      const catDef = categoryDefaults[categoryTab] || categoryDefaults.ALL;

      // Calculate new Material Cost
      let newMat = existingPL.materialCost;
      if (mMode === 'SET') newMat = mVal;
      else if (mMode === 'ADD') newMat = Math.max(0, existingPL.materialCost + mVal);
      else if (mMode === 'SUB') newMat = Math.max(0, existingPL.materialCost - mVal);
      else if (mMode === 'CATEGORY_DEFAULT') newMat = catDef.materialCost;

      // Calculate new Labour Cost
      let newLab = existingPL.laborCost;
      if (lMode === 'SET') newLab = lVal;
      else if (lMode === 'ADD') newLab = Math.max(0, existingPL.laborCost + lVal);
      else if (lMode === 'SUB') newLab = Math.max(0, existingPL.laborCost - lVal);
      else if (lMode === 'CATEGORY_DEFAULT') newLab = catDef.laborCost;

      // Calculate new Other Expenses
      let newOther = existingPL.otherExpenses;
      if (oMode === 'SET') newOther = oVal;
      else if (oMode === 'ADD') newOther = Math.max(0, existingPL.otherExpenses + oVal);

      // Handle Dynamic Cost Item
      let newDynamicCosts = [...(existingPL.dynamicCosts || [])];
      if (dynItem && dynItem.label.trim()) {
        newDynamicCosts.push({
          id: `dc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          label: dynItem.label.trim(),
          value: dynItem.value
        });
      }

      // Handle Notes
      let newNotes = existingPL.notes || '';
      if (noteText.trim()) {
        newNotes = newNotes ? `${newNotes} | ${noteText.trim()}` : noteText.trim();
      }

      const revenue = service.grandTotal;
      const dynSum = newDynamicCosts.reduce((s, c) => s + c.value, 0);
      const newProfit = revenue - newMat - newLab - newOther - dynSum;

      onSave({
        ...existingPL,
        materialCost: newMat,
        laborCost: newLab,
        otherExpenses: newOther,
        dynamicCosts: newDynamicCosts,
        calculatedProfit: newProfit,
        notes: newNotes
      });

      updatedCount++;
    });

    setIsBulkModalOpen(false);
    setSelectedJobIds([]);
    setToastMessage(`Successfully bulk-updated costs for ${updatedCount} service order${updatedCount === 1 ? '' : 's'}!`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Fast One-Click: Apply Category Defaults to Selected or Filtered
  const handleApplyCategoryDefaultsToSelected = () => {
    const targets = selectedJobIds.length > 0 ? selectedJobIds : filteredJobs.map(j => j.submissionId);
    if (targets.length === 0) {
      alert('No services available to apply category defaults.');
      return;
    }
    executeBulkUpdate(targets, {
      materialMode: 'CATEGORY_DEFAULT',
      laborMode: 'CATEGORY_DEFAULT',
      otherMode: 'KEEP'
    });
  };

  const applyBulkPresetCost = (preset: PredefinedCost) => {
    if (selectedJobIds.length === 0) { alert('Select at least one job first.'); return; }
    executeBulkUpdate(selectedJobIds, {
      materialMode: 'KEEP',
      laborMode: 'KEEP',
      otherMode: 'KEEP',
      dynamicItem: { label: preset.name, value: preset.value }
    });
  };

  if (isLoading || isHydrated === false || !submissions) {
    return <SkeletonLoader view="PROFIT_LOSS" />;
  }

  return (
    <div className="space-y-5">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-lg flex items-center justify-between animate-fade-in border border-emerald-400">
          <div className="flex items-center gap-2">
            <IconCheckCircle className="w-5 h-5 text-white" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white hover:text-emerald-200">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cost Analysis & Bulk Manager</h2>
          <p className="text-slate-500 text-sm">Bulk update material, labour & category costs · track profit margins.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            onClick={() => {
              setBulkScope(selectedJobIds.length > 0 ? 'SELECTED' : 'CATEGORY');
              setIsBulkModalOpen(true);
            }}
            className="bg-brand-accent text-slate-950 font-black hover:bg-amber-400 border-none shadow-md"
          >
            <IconCommand className="w-4 h-4 mr-2" /> Bulk Update Costs
          </Button>
          <Button variant="secondary" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
            <IconSettings className="w-4 h-4 mr-2" /> Category & Cost Presets
          </Button>
        </div>
      </div>

      {/* ── Aggregated summary banner ─────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-800 to-brand-blue rounded-2xl p-5 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{activeTab === 'ALL' ? 'All Jobs' : activeTab} · {summary.total} jobs</p>
            <p className="text-3xl font-black mt-0.5">₹{summary.revenue.toLocaleString('en-IN')}</p>
            <p className="text-xs text-slate-300 mt-1">Total Revenue</p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Net Profit</p>
              <p className={`text-2xl font-black ${summary.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{summary.profit.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Margin</p>
              <p className={`text-2xl font-black ${summary.margin >= 30 ? 'text-green-400' : summary.margin >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                {summary.margin.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Costed</p>
              <p className="text-2xl font-black">{summary.costedCount}/{summary.total}</p>
            </div>
          </div>
        </div>

        {/* Cost breakdown bars */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Material', value: summary.material, color: 'bg-red-400' },
            { label: 'Labour', value: summary.labor, color: 'bg-orange-300' },
            { label: 'Other', value: summary.dynamic, color: 'bg-amber-300' },
          ].map(c => (
            <div key={c.label}>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>{c.label}</span>
                <span>₹{c.value.toLocaleString('en-IN')}</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className={`h-full ${c.color} rounded-full`}
                  style={{ width: `${summary.totalCost > 0 ? (c.value / summary.totalCost) * 100 : 0}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {summary.totalCost > 0 ? ((c.value / summary.totalCost) * 100).toFixed(0) : 0}% of cost
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Category Defaults & Dynamic Cost Presets Settings Panel ───────────────── */}
      {isSettingsOpen && (
        <div className="bg-white border-2 border-brand-accent/40 rounded-2xl p-5 space-y-6 shadow-lg">
          
          {/* Section 1: Predefined Material & Labour Defaults by Category */}
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
              <IconSparkles className="w-4 h-4 text-amber-500" />
              Predefined Material & Labour Category Defaults (₹)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure baseline material cost and labour charge for each service category. These can be applied in bulk with a single click.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {(['WASH', 'CARE', 'TYRE', 'BATTERY', 'CUSTOM'] as PLTab[]).map(catKey => {
                const catName = catKey === 'WASH' ? 'Car Washing' : catKey === 'CARE' ? 'Car Care' : catKey === 'TYRE' ? 'Tyre Replace' : catKey === 'BATTERY' ? 'Battery Replace' : 'Custom Service';
                const curDef = categoryDefaults[catKey] || { materialCost: 0, laborCost: 0, otherExpenses: 0 };

                const handleApplyThisCategoryDefaults = () => {
                  const targetServices = safeSubmissions
                    .filter(s => s && s.status === ServiceStatus.Completed && !s.isDeleted)
                    .filter(s => getServiceCategoryTab(s) === catKey)
                    .map(s => s.submissionId);

                  if (targetServices.length === 0) {
                    alert(`No completed services found in category ${catName}.`);
                    return;
                  }

                  executeBulkUpdate(targetServices, {
                    materialMode: 'SET',
                    materialValue: curDef.materialCost,
                    laborMode: 'SET',
                    laborValue: curDef.laborCost,
                    otherMode: 'SET',
                    otherValue: curDef.otherExpenses,
                    note: `Bulk category default update (${catName})`
                  });
                };

                return (
                  <div key={catKey} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 flex flex-col justify-between">
                    <div>
                      <p className="font-black text-xs text-brand-blue uppercase">{catName}</p>
                      <div className="space-y-1.5 text-xs mt-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Material Cost (₹)</label>
                          <input
                            type="number"
                            value={curDef.materialCost}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateCategoryDefaults({
                                ...categoryDefaults,
                                [catKey]: { ...curDef, materialCost: val }
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Labour Cost (₹)</label>
                          <input
                            type="number"
                            value={curDef.laborCost}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateCategoryDefaults({
                                ...categoryDefaults,
                                [catKey]: { ...curDef, laborCost: val }
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Other Costs (₹)</label>
                          <input
                            type="number"
                            value={curDef.otherExpenses || 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateCategoryDefaults({
                                ...categoryDefaults,
                                [catKey]: { ...curDef, otherExpenses: val }
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyThisCategoryDefaults}
                      className="w-full mt-2 py-1.5 px-2 bg-brand-blue hover:bg-blue-900 text-white font-black text-[10px] rounded-lg shadow-2xs transition-all uppercase tracking-wider"
                      title={`Bulk update all completed ${catName} services with these predefined rates`}
                    >
                      ⚡ Bulk Apply to {catName}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section 2: Dynamic Cost Presets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
                <IconPlus className="w-4 h-4 text-brand-accent" />
                Add Dynamic Expense Preset for <span className="text-brand-blue font-extrabold">{activeTab}</span>
              </h4>
              <div className="flex items-end gap-2">
                <div className="flex-grow">
                  <Input label="Preset Label" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} placeholder="e.g. Chemical Surcharge, Electricity" />
                </div>
                <div className="w-28">
                  <Input label="Amount (₹)" type="number" value={newPresetValue}
                    onChange={e => setNewPresetValue(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <Button onClick={handleAddPreset} className="mb-0.5 h-[38px]">
                  <IconPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-700 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <IconCheck className="w-4 h-4 text-green-600" /> Saved Dynamic Presets ({activeTab})
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {predefinedCosts.filter(p => p.category === activeTab).map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm group">
                    {editingPresetId === p.id ? (
                      <>
                        <span className="text-xs font-bold text-slate-700">{p.name}</span>
                        <input type="number" value={editPresetVal} onChange={e => setEditPresetVal(parseFloat(e.target.value) || 0)}
                          className="w-16 text-xs border border-slate-300 rounded px-1 focus:ring-1 focus:ring-brand-accent" />
                        <button onClick={() => handleSavePresetEdit(p.id)} className="text-green-600"><IconCheck className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingPresetId(null)} className="text-slate-400"><span className="text-xs">✕</span></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-slate-700">{p.name} <span className="text-slate-500">(₹{p.value})</span></span>
                        <button onClick={() => { setEditingPresetId(p.id); setEditPresetVal(p.value); }}
                          className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-opacity">
                          <IconPencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeletePreset(p.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
                          <IconTrash className="w-3 h-3" />
                        </button>
                        <button onClick={() => applyBulkPresetCost(p)}
                          className="text-[10px] font-black text-brand-blue hover:text-brand-accent ml-1 uppercase tracking-tighter whitespace-nowrap">
                          Bulk Apply
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {predefinedCosts.filter(p => p.category === activeTab).length === 0 && (
                  <p className="text-xs text-slate-400 italic">No dynamic presets for {activeTab} yet. Add one above.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 bg-slate-200 p-1 rounded-xl w-fit">
        {serviceTabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedJobIds([]); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-brand-blue text-white shadow-lg scale-105' : 'text-slate-500 hover:bg-slate-300'}`}>
            {React.cloneElement(tab.icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { className: 'w-3.5 h-3.5' })}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Select all & Bulk Action Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0}
              onChange={handleSelectAll}
              className="h-5 w-5 rounded border-slate-300 text-brand-accent cursor-pointer" />
            <span className="text-sm font-bold text-slate-700">Select All ({filteredJobs.length})</span>
          </label>

          {/* Category Fast Bulk Apply Action */}
          <button
            onClick={handleApplyCategoryDefaultsToSelected}
            className="text-xs font-black bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
            title="Automatically set Material & Labour for selected services based on category defaults"
          >
            <IconSparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Apply Category Defaults</span>
          </button>

          {selectedJobIds.length > 0 && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4 py-1 flex-wrap">
              <span className="text-xs font-black text-amber-600 animate-pulse uppercase mr-1">
                {selectedJobIds.length} Selected
              </span>

              <button
                onClick={() => {
                  setBulkScope('SELECTED');
                  setIsBulkModalOpen(true);
                }}
                className="px-3 py-1 text-xs font-extrabold bg-brand-blue text-white rounded-lg hover:bg-blue-900 transition-all flex items-center gap-1 shadow-sm"
              >
                <IconCommand className="w-3.5 h-3.5" /> Bulk Update
              </button>

              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">Presets:</span>
              {predefinedCosts.filter(c => !c.category || c.category === 'ALL' || c.category === activeTab).map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyBulkPresetCost(preset)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-brand-blue/10 border border-brand-blue/20 rounded-full hover:bg-brand-blue text-brand-blue hover:text-white transition-all flex items-center gap-1 shadow-sm"
                  title={`Apply ${preset.name} (₹${preset.value}) to ${selectedJobIds.length} selected orders`}
                >
                  <span>{preset.name}</span>
                  <span className="opacity-80">₹{preset.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue (filtered)</p>
          <p className="text-lg font-black text-slate-800">₹{filteredJobs.reduce((s, j) => s + j.grandTotal, 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* ── Job list ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {filteredJobs.length > 0 ? filteredJobs.map(service => (
          <div key={service.submissionId}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-brand-accent/50 transition-colors">
            {/* Job header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-brand-blue/10 rounded-xl text-brand-blue">
                  {(service.serviceSelection || []).includes('Car Washing') ? <IconCheck className="w-5 h-5" /> : <IconEngine className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-800">
                    {service.customerFirstName} {service.customerLastName}
                    <span className="ml-2 text-sm font-mono text-slate-400">#{service.appointmentId?.split('-').pop()}</span>
                  </h3>
                  <div className="flex items-center flex-wrap gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    <span>{service.carBrandModel}</span>
                    <span>·</span>
                    <span>{new Date(service.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span>·</span>
                    <span className="text-brand-blue">{service.assignedTo || 'Unassigned'}</span>
                    {(service.serviceSelection || []).map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-slate-100 rounded font-normal normal-case">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Order Total</p>
                <p className="text-2xl font-black text-brand-blue">₹{service.grandTotal.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <ProfitLossCalculator
              service={service}
              profitLoss={safeProfitLossData.find(pl => pl.serviceId === service.submissionId)}
              onSave={onSave}
              predefinedCosts={safePredefinedCosts}
              isSelected={selectedJobIds.includes(service.submissionId)}
              onToggleSelect={() => toggleJob(service.submissionId)}
              specificServiceRevenue={
                activeTab === 'ALL' ? undefined :
                activeTab === 'WASH' ? service.carWashDetails?.price :
                activeTab === 'TYRE' ? service.tyreReplacementTotalAmount :
                undefined
              }
            />
          </div>
        )) : (
          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <IconClock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">No completed jobs for this category.</p>
          </div>
        )}
      </div>

      {/* ── BULK COST UPDATE MODAL ────────────────────────────────────────────────── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  <IconCommand className="w-5 h-5 text-amber-400" /> Bulk Update Service Costs
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update Material Cost, Labour Charge & Expenses across selected services.
                </p>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              
              {/* Target Scope Selection */}
              <div>
                <label className="font-extrabold uppercase text-slate-500 tracking-wider block mb-2">
                  Target Service Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkScope('SELECTED')}
                    disabled={selectedJobIds.length === 0}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      bulkScope === 'SELECTED'
                        ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                        : selectedJobIds.length === 0
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Selected ({selectedJobIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkScope('CATEGORY')}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      bulkScope === 'CATEGORY'
                        ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Active Category ({filteredJobs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkScope('ALL')}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      bulkScope === 'ALL'
                        ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Completed Jobs ({safeSubmissions.filter(s => s.status === ServiceStatus.Completed).length})
                  </button>
                </div>
              </div>

              {/* Quick Preset Actions in Modal */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-black text-amber-900 text-xs flex items-center gap-1">
                    <IconSparkles className="w-4 h-4 text-amber-600" /> One-Click Category Auto-Fill
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Apply predefined Material & Labour rates configured for each category.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMatMode('CATEGORY_DEFAULT');
                    setLabMode('CATEGORY_DEFAULT');
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg shadow-sm whitespace-nowrap"
                >
                  Apply Category Defaults
                </button>
              </div>

              {/* 1. Material Cost Configuration */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 uppercase tracking-wider text-xs">
                    Material Cost (₹)
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">Cost of parts/materials used</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Action Mode</label>
                    <select
                      value={matMode}
                      onChange={(e) => setMatMode(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-1 focus:ring-brand-accent"
                    >
                      <option value="KEEP">Do Not Change (Keep Existing)</option>
                      <option value="SET">Set Fixed Amount (₹)</option>
                      <option value="ADD">Add / Increase (+₹)</option>
                      <option value="SUB">Subtract / Decrease (-₹)</option>
                      <option value="CATEGORY_DEFAULT">Use Category Predefined Default</option>
                    </select>
                  </div>
                  {matMode !== 'KEEP' && matMode !== 'CATEGORY_DEFAULT' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Amount (₹)</label>
                      <input
                        type="number"
                        value={matValue}
                        onChange={(e) => setMatValue(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-800 text-sm focus:ring-1 focus:ring-brand-accent"
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Labour Cost Configuration */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 uppercase tracking-wider text-xs">
                    Labour Charge / Payout (₹)
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">Helper & technician labour cost</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Action Mode</label>
                    <select
                      value={labMode}
                      onChange={(e) => setLabMode(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-1 focus:ring-brand-accent"
                    >
                      <option value="KEEP">Do Not Change (Keep Existing)</option>
                      <option value="SET">Set Fixed Amount (₹)</option>
                      <option value="ADD">Add / Increase (+₹)</option>
                      <option value="SUB">Subtract / Decrease (-₹)</option>
                      <option value="CATEGORY_DEFAULT">Use Category Predefined Default</option>
                    </select>
                  </div>
                  {labMode !== 'KEEP' && labMode !== 'CATEGORY_DEFAULT' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Amount (₹)</label>
                      <input
                        type="number"
                        value={labValue}
                        onChange={(e) => setLabValue(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-800 text-sm focus:ring-1 focus:ring-brand-accent"
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Other Expenses Configuration */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 uppercase tracking-wider text-xs">
                    Other Expenses (₹)
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">Overheads & misc charges</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Action Mode</label>
                    <select
                      value={otherMode}
                      onChange={(e) => setOtherMode(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-1 focus:ring-brand-accent"
                    >
                      <option value="KEEP">Do Not Change (Keep Existing)</option>
                      <option value="SET">Set Fixed Amount (₹)</option>
                      <option value="ADD">Add / Increase (+₹)</option>
                    </select>
                  </div>
                  {otherMode !== 'KEEP' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Amount (₹)</label>
                      <input
                        type="number"
                        value={otherValue}
                        onChange={(e) => setOtherValue(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-800 text-sm focus:ring-1 focus:ring-brand-accent"
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Add Dynamic Line Item */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={addDynamicItem}
                    onChange={(e) => setAddDynamicItem(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-accent cursor-pointer"
                  />
                  <span>Attach Dynamic Expense Line Item</span>
                </label>
                
                {addDynamicItem && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Line Item Label</label>
                      <input
                        type="text"
                        value={dynamicLabel}
                        onChange={(e) => setDynamicLabel(e.target.value)}
                        placeholder="e.g. Consumables Surcharge"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Value (₹)</label>
                      <input
                        type="number"
                        value={dynamicVal}
                        onChange={(e) => setDynamicVal(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Expense Notes */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Append Expense Note (Optional)
                </label>
                <input
                  type="text"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="e.g. Revised material rates effective July 2026"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 border-t border-slate-200 p-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Target: <span className="text-brand-blue font-extrabold">
                  {bulkScope === 'SELECTED'
                    ? `${selectedJobIds.length} Selected Orders`
                    : bulkScope === 'CATEGORY'
                    ? `${filteredJobs.length} Orders in ${activeTab}`
                    : `${safeSubmissions.filter(s => s.status === ServiceStatus.Completed).length} Total Completed Orders`}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setIsBulkModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const targetIds = bulkScope === 'SELECTED'
                      ? selectedJobIds
                      : bulkScope === 'CATEGORY'
                      ? filteredJobs.map(j => j.submissionId)
                      : safeSubmissions.filter(s => s.status === ServiceStatus.Completed).map(j => j.submissionId);
                    
                    executeBulkUpdate(targetIds);
                  }}
                  className="bg-brand-accent text-slate-950 font-black hover:bg-amber-400 border-none px-5"
                >
                  Apply Bulk Update
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default ProfitLossPage;
