import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Service, ServiceStatus, InventoryItem, PredefinedService, Settings } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { 
  IconSparkles, IconAlertTriangle, IconCheck, IconRefresh, 
  IconPlus, IconMinus, IconClipboardList, IconTable,
  IconClock, IconFileAnalytics, IconChevronRight, IconPencil,
  IconTrash, IconChartBar, IconSearch, IconFilter
} from '../ui/Icon';
import { parseRecipeToIngredients, getDefaultInventoryItems } from '../../services/inventoryService';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend
} from 'recharts';

// Global Chart.js access
declare const Chart: any;

interface InventoryForecastingPageProps {
  submissions: Service[];
  inventoryItems: InventoryItem[];
  predefinedServices: PredefinedService[];
  onUpdateInventoryItem: (item: InventoryItem) => Promise<void>;
  onUpdatePredefinedService: (service: PredefinedService) => Promise<void>;
  onAddInventoryItem?: (item: InventoryItem) => Promise<void>;
  onDeleteInventoryItem?: (itemId: string) => Promise<void>;
  settings: Settings;
}

// Seasonal multi-pliers config
interface SeasonConfig {
  name: string;
  description: string;
  multipliers: Record<string, number>; // itemId -> multiplier
}

const SEASON_SCENARIOS: Record<string, SeasonConfig> = {
  BASELINE: {
    name: 'Normal Baseline',
    description: 'Flat baseline across all materials (standard historical consumption rates).',
    multipliers: {}
  },
  MONSOON: {
    name: 'Monsoon (Heavy Wash & Prep)',
    description: 'Surge in washing due to muddy roads. Deep polishing and ceramic coatings drop due to wet conditions.',
    multipliers: {
      shampoo: 1.6,
      tyre_shine: 0.7,
      glass_cleaner: 1.5,
      trim_restorer: 0.6,
      compound_cream: 0.4,
      seal_shine_liquid: 0.5,
      hybrid_spray: 0.5,
      hybrid_wax: 0.4,
      microfibre_cloth: 1.4
    }
  },
  FESTIVE_SEASON: {
    name: 'Festive / Summer (Coating & Detailing Surge)',
    description: 'Paint correction and premium ceramic waxes surge as owners prep vehicles for holidays and dry weather.',
    multipliers: {
      shampoo: 1.1,
      tyre_shine: 1.4,
      glass_cleaner: 1.2,
      trim_restorer: 1.5,
      compound_cream: 1.9,
      seal_shine_liquid: 1.7,
      hybrid_spray: 1.9,
      hybrid_wax: 1.8,
      microfibre_cloth: 1.5
    }
  },
  WINTER_CARE: {
    name: 'Winter / Dry Season',
    description: 'Increased glass care for fog-busting and protective liquid sealants for cold preservation.',
    multipliers: {
      shampoo: 0.9,
      tyre_shine: 1.1,
      glass_cleaner: 1.4,
      trim_restorer: 1.0,
      compound_cream: 1.0,
      seal_shine_liquid: 1.5,
      hybrid_spray: 1.4,
      hybrid_wax: 1.2,
      microfibre_cloth: 1.1
    }
  }
};

// Intelligent fallbacks for service names if recipes are unconfigured
const INTELLIGENT_RECIPE_FALLBACKS: Record<string, Record<string, number>> = {
  'wash': { shampoo: 30, tyre_shine: 15, glass_cleaner: 10, microfibre_cloth: 0.1 },
  'washing': { shampoo: 30, tyre_shine: 15, glass_cleaner: 10, microfibre_cloth: 0.1 },
  'tyre': { tyre_shine: 10, microfibre_cloth: 0.1 },
  'ceramic': { shampoo: 50, trim_restorer: 30, tyre_shine: 20, glass_cleaner: 15, compound_cream: 40, microfibre_cloth: 0.5, hybrid_spray: 25, hybrid_wax: 20 },
  'coating': { shampoo: 50, trim_restorer: 30, tyre_shine: 20, glass_cleaner: 15, compound_cream: 40, microfibre_cloth: 0.5, hybrid_spray: 25, hybrid_wax: 20 },
  'detail': { shampoo: 20, trim_restorer: 25, glass_cleaner: 30, microfibre_cloth: 0.4, seal_shine_liquid: 15 },
  'detailing': { shampoo: 20, trim_restorer: 25, glass_cleaner: 30, microfibre_cloth: 0.4, seal_shine_liquid: 15 },
  'polish': { shampoo: 40, trim_restorer: 20, tyre_shine: 15, glass_cleaner: 15, compound_cream: 25, microfibre_cloth: 0.3, seal_shine_liquid: 15, hybrid_wax: 10 },
  'rubbing': { shampoo: 40, trim_restorer: 20, tyre_shine: 15, glass_cleaner: 15, compound_cream: 25, microfibre_cloth: 0.3, seal_shine_liquid: 15, hybrid_wax: 10 },
  'wax': { shampoo: 30, tyre_shine: 15, glass_cleaner: 15, microfibre_cloth: 0.2, hybrid_wax: 15 }
};

// ── Chart Component ──────────────────────────────────────────────────────────
const StockChart: React.FC<{ data: any; options: any; height?: number }> = ({ data, options, height = 320 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current || typeof Chart === 'undefined') return;
    const existingChart = typeof Chart.getChart === 'function' ? Chart.getChart(canvasRef.current) : null;
    if (existingChart) existingChart.destroy();
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, { type: 'line', data, options });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, options]);

  return (
    <div style={{ height: `${height}px`, position: 'relative' }} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
};

export const InventoryForecastingPage: React.FC<InventoryForecastingPageProps> = ({
  submissions,
  inventoryItems = [],
  predefinedServices = [],
  onUpdateInventoryItem,
  onUpdatePredefinedService,
  onAddInventoryItem,
  onDeleteInventoryItem,
  settings
}) => {
  // --- States ---
  const [growthMultiplier, setGrowthMultiplier] = useState<number>(1.2);
  const [seasonScenario, setSeasonScenario] = useState<string>('BASELINE');
  const [historicalWindowDays, setHistoricalWindowDays] = useState<number>(30);
  const [simulateData, setSimulateData] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'materials' | 'forecast' | 'recipes' | 'settings' | 'visualize' | 'replenishment'>('materials');
  
  // Search and filter states for In-Stock Materials tab
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'CRITICAL' | 'SAFE'>('ALL');

  // Predictive replenishment model state
  const [targetCoverageDays, setTargetCoverageDays] = useState<number>(30);
  const [customLeadTimes, setCustomLeadTimes] = useState<Record<string, number>>({});
  
  // Quick restock state
  const [editingItemStock, setEditingItemStock] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState<string>('');
  const [savingStock, setSavingStock] = useState<boolean>(false);

  // Quick recipe state
  const [editingRecipeService, setEditingRecipeService] = useState<PredefinedService | null>(null);
  const [recipeText, setRecipeText] = useState<string>('');
  const [savingRecipe, setSavingRecipe] = useState<boolean>(false);

  // Gemini insights state
  const [aiInsights, setAiInsights] = useState<string>('');
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);

  // Grouping states
  const [groupByCategory, setGroupByCategory] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Cleaning': true,
    'Tyres': true,
    'Batteries': true,
    'Mechanical/Spares': true,
    'Tools/Accessories': true
  });

  // Customizable inventory details state
  const [editingItemDetails, setEditingItemDetails] = useState<InventoryItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);

  // Form states for adding/editing material details
  const [newMaterialId, setNewMaterialId] = useState<string>('');
  const [newMaterialName, setNewMaterialName] = useState<string>('');
  const [newMaterialStock, setNewMaterialStock] = useState<string>('0');
  const [newMaterialUnit, setNewMaterialUnit] = useState<string>('ml');
  const [newMaterialMinStock, setNewMaterialMinStock] = useState<string>('10');
  const [newMaterialCostPerUnit, setNewMaterialCostPerUnit] = useState<string>('1');
  const [newMaterialCategory, setNewMaterialCategory] = useState<string>('Cleaning');
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);

  // Categorization helper function
  const getMaterialCategory = (item: any): string => {
    if (item.category && item.category.trim() !== '') return item.category.trim();
    const name = (item.name || '').toLowerCase();
    
    if (
      name.includes('shampoo') || 
      name.includes('cleaner') || 
      name.includes('wash') || 
      name.includes('wax') || 
      name.includes('cloth') || 
      name.includes('microfibre') || 
      name.includes('shine') || 
      name.includes('restorer') || 
      name.includes('spray') || 
      name.includes('compound') || 
      name.includes('polish') || 
      name.includes('soap') ||
      name.includes('sealant') ||
      name.includes('liquid')
    ) {
      return 'Cleaning';
    }
    if (name.includes('tyre') || name.includes('tire') || name.includes('wheel') || name.includes('valve') || name.includes('alloy')) {
      return 'Tyres';
    }
    if (name.includes('battery') || name.includes('cell') || name.includes('acid') || name.includes('terminal')) {
      return 'Batteries';
    }
    if (name.includes('filter') || name.includes('oil') || name.includes('brake') || name.includes('spark') || name.includes('belt') || name.includes('plug') || name.includes('engine')) {
      return 'Mechanical/Spares';
    }
    return 'Tools/Accessories';
  };

  // Populate form states when editingItemDetails changes
  useEffect(() => {
    if (editingItemDetails) {
      setNewMaterialId(editingItemDetails.id);
      setNewMaterialName(editingItemDetails.name);
      setNewMaterialStock(String(editingItemDetails.stock));
      setNewMaterialUnit(editingItemDetails.unit);
      setNewMaterialMinStock(String(editingItemDetails.minStock));
      setNewMaterialCostPerUnit(String(editingItemDetails.costPerUnit ?? 0));
      setNewMaterialCategory(editingItemDetails.category || getMaterialCategory(editingItemDetails));
    } else {
      setNewMaterialId('');
      setNewMaterialName('');
      setNewMaterialStock('0');
      setNewMaterialUnit('ml');
      setNewMaterialMinStock('10');
      setNewMaterialCostPerUnit('1');
      setNewMaterialCategory('Cleaning');
    }
  }, [editingItemDetails]);

  const handleSaveMaterialDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialName.trim()) return;

    setIsSavingDetails(true);
    try {
      const generatedId = newMaterialId.trim() || newMaterialName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const itemToSave: InventoryItem = {
        id: generatedId,
        name: newMaterialName.trim(),
        stock: parseFloat(newMaterialStock) || 0,
        unit: newMaterialUnit.trim(),
        minStock: parseFloat(newMaterialMinStock) || 0,
        costPerUnit: parseFloat(newMaterialCostPerUnit) || 0,
        category: newMaterialCategory
      };

      if (editingItemDetails) {
        // Edit mode
        await onUpdateInventoryItem(itemToSave);
      } else {
        // Add mode
        if (onAddInventoryItem) {
          await onAddInventoryItem(itemToSave);
        } else {
          await onUpdateInventoryItem(itemToSave);
        }
      }
      setIsAddModalOpen(false);
      setEditingItemDetails(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deletingItem) return;
    try {
      if (onDeleteInventoryItem) {
        await onDeleteInventoryItem(deletingItem.id);
      }
      setDeletingItem(null);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Ensure inventory items exist ---
  const activeInventory = useMemo(() => {
    if (inventoryItems && inventoryItems.length > 0) return inventoryItems;
    return getDefaultInventoryItems();
  }, [inventoryItems]);

  // Quick stock adjuster for instant single-click inline changes (+ / -)
  const handleQuickStockAdjust = async (item: InventoryItem, delta: number) => {
    const newStock = Math.max(0, Math.round((item.stock + delta) * 100) / 100);
    const updatedItem: InventoryItem = {
      ...item,
      stock: newStock
    };
    try {
      await onUpdateInventoryItem(updatedItem);
    } catch (err) {
      console.error('Failed to update stock:', err);
    }
  };

  // Seed standard default materials if list is missing or needs restoring
  const handleSeedDefaultMaterials = async () => {
    const defaults = getDefaultInventoryItems();
    for (const item of defaults) {
      const existing = activeInventory.find(i => i.id === item.id);
      if (!existing) {
        if (onAddInventoryItem) {
          await onAddInventoryItem(item);
        } else {
          await onUpdateInventoryItem(item);
        }
      }
    }
  };

  // Total Material Asset Valuation
  const totalInventoryAssetValue = useMemo(() => {
    return activeInventory.reduce((acc, item) => {
      return acc + (item.stock * (item.costPerUnit ?? 0));
    }, 0);
  }, [activeInventory]);

  // Filtered materials for the In-Stock Material Manager table
  const filteredMaterials = useMemo(() => {
    return activeInventory.filter(item => {
      const q = searchQuery.trim().toLowerCase();
      const nameMatch = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      
      const category = item.category || getMaterialCategory(item);
      const categoryMatch = categoryFilter === 'ALL' || category.toLowerCase() === categoryFilter.toLowerCase();
      
      const isCritical = item.stock <= item.minStock;
      let stockMatch = true;
      if (stockFilter === 'CRITICAL') stockMatch = isCritical;
      if (stockFilter === 'SAFE') stockMatch = !isCritical;
      
      return nameMatch && categoryMatch && stockMatch;
    });
  }, [activeInventory, searchQuery, categoryFilter, stockFilter]);

  // --- Mock historical counts if toggled or if real database is clean ---
  const simulatedServiceCounts: Record<string, number> = {
    'Car Washing': 48,
    'Interior Detailing': 14,
    'Rubbing Polishing': 8,
    'Ceramic Coating': 5,
    'Tyre Replacement': 12,
    'Wax Sealant Protection': 18
  };

  const completedServicesBySelection = useMemo(() => {
    if (simulateData) return simulatedServiceCounts;

    // Filter completed real orders in the chosen timeframe
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - historicalWindowDays);

    const counts: Record<string, number> = {};
    submissions.forEach(sub => {
      if (sub.isDeleted || sub.status !== ServiceStatus.Completed) return;
      const subDate = new Date(sub.timestamp || sub.scheduledDate || '');
      if (subDate >= cutoffDate) {
        (sub.serviceSelection || []).forEach(sel => {
          counts[sel] = (counts[sel] || 0) + 1;
        });
      }
    });

    // Only fallback to simulation if simulateData is explicitly true
    const totalRealCompleted = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalRealCompleted === 0 && simulateData) {
      return simulatedServiceCounts; // Dynamic fallback
    }

    return counts;
  }, [submissions, historicalWindowDays, simulateData]);

  // Total services in chosen historical period
  const totalCompletedCount = useMemo(() => {
    return Object.values(completedServicesBySelection).reduce((a, b) => a + b, 0);
  }, [completedServicesBySelection]);

  // --- Calculate Daily Material Consumption rates ---
  const materialDailyRates = useMemo(() => {
    const dailyRates: Record<string, number> = {}; // itemId -> ml/gm/pcs used per day
    
    // Initialize rates
    activeInventory.forEach(item => {
      dailyRates[item.id] = 0;
    });

    // Loop through each service and accumulate the daily consumption
    Object.entries(completedServicesBySelection).forEach(([serviceName, completedCount]) => {
      const dailyServiceVolume = completedCount / historicalWindowDays;
      
      // Try to find matching predefined service
      const matched = predefinedServices.find(
        s => s.name.trim().toLowerCase() === serviceName.trim().toLowerCase()
      );

      let ingredientsUsed: { itemId: string; quantity: number }[] = [];

      if (matched && matched.recipe) {
        // Parse actual recipe from cloud DB
        ingredientsUsed = parseRecipeToIngredients(matched.recipe, activeInventory);
      } else {
        // Apply intelligent fallbacks based on keyword matches
        const lowercaseName = serviceName.toLowerCase();
        let fallbackApplied = false;

        for (const [keyword, fallbackRecipe] of Object.entries(INTELLIGENT_RECIPE_FALLBACKS)) {
          if (lowercaseName.includes(keyword)) {
            ingredientsUsed = Object.entries(fallbackRecipe).map(([id, qty]) => ({
              itemId: id,
              quantity: qty
            }));
            fallbackApplied = true;
            break;
          }
        }

        if (!fallbackApplied) {
          // General fallback
          ingredientsUsed = [
            { itemId: 'shampoo', quantity: 5 },
            { itemId: 'microfibre_cloth', quantity: 0.05 }
          ];
        }
      }

      // Add to running rates
      ingredientsUsed.forEach(ing => {
        if (dailyRates[ing.itemId] !== undefined) {
          dailyRates[ing.itemId] += ing.quantity * dailyServiceVolume;
        }
      });
    });

    return dailyRates;
  }, [completedServicesBySelection, historicalWindowDays, predefinedServices, activeInventory]);

  // --- Project 30 Days Forecast Details ---
  const projections = useMemo(() => {
    const scenarioMultipliers = SEASON_SCENARIOS[seasonScenario]?.multipliers || {};

    return activeInventory.map(item => {
      const baseDailyRate = materialDailyRates[item.id] || 0;
      const seasonalMultiplier = scenarioMultipliers[item.id] ?? 1.0;
      
      // Calculate projected daily and 30-day usage
      const projectedDailyUsage = baseDailyRate * growthMultiplier * seasonalMultiplier;
      const projected30DayUsage = Number((projectedDailyUsage * 30).toFixed(1));
      
      const currentStock = item.stock;
      const minStock = item.minStock;
      
      // Estimate depletion day (when stock hits 0 or safety level)
      let depletionDay: number | null = null;
      let safetyDepletionDay: number | null = null;

      if (projectedDailyUsage > 0) {
        depletionDay = Math.floor(currentStock / projectedDailyUsage);
        safetyDepletionDay = Math.floor(Math.max(0, currentStock - minStock) / projectedDailyUsage);
      }

      const netNeeded = Math.max(0, Number((projected30DayUsage - currentStock).toFixed(1)));
      const costPerUnit = item.costPerUnit || 1;
      const projectedCost = Number((projected30DayUsage * costPerUnit).toFixed(2));
      const restockRecommended = Math.max(0, Number((projected30DayUsage - currentStock + minStock).toFixed(1)));
      const restockCost = Number((restockRecommended * costPerUnit).toFixed(2));

      let status: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
      if (currentStock <= minStock) {
        status = 'CRITICAL';
      } else if (currentStock - projected30DayUsage <= minStock) {
        status = 'WARNING';
      }

      return {
        ...item,
        baseDailyRate,
        projectedDailyUsage,
        projected30DayUsage,
        depletionDay,
        safetyDepletionDay,
        netNeeded,
        projectedCost,
        restockRecommended,
        restockCost,
        status
      };
    });
  }, [activeInventory, materialDailyRates, growthMultiplier, seasonScenario]);

  // Overall metrics
  const totalProjectedCost = useMemo(() => {
    return projections.reduce((sum, p) => sum + p.projectedCost, 0);
  }, [projections]);

  const totalRestockCost = useMemo(() => {
    return projections.reduce((sum, p) => sum + p.restockCost, 0);
  }, [projections]);

  const criticalItemsCount = useMemo(() => {
    return projections.filter(p => p.status === 'CRITICAL' || p.stock <= p.minStock).length;
  }, [projections]);

  const top10UsedItems = useMemo(() => {
    return [...projections]
      .sort((a, b) => b.projected30DayUsage - a.projected30DayUsage)
      .slice(0, 10);
  }, [projections]);

  // Grouped projections and category summaries
  const { groupedProjections, categorySummaries } = useMemo(() => {
    const groups: Record<string, typeof projections> = {
      'Cleaning': [],
      'Tyres': [],
      'Batteries': [],
      'Mechanical/Spares': [],
      'Tools/Accessories': []
    };
    
    projections.forEach(item => {
      const cat = getMaterialCategory(item);
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });

    const summaries: Record<string, {
      stockSummary: string;
      projected30DaySummary: string;
      netNeededSummary: string;
      totalItems: number;
      criticalCount: number;
      warningCount: number;
      totalRestockCost: number;
    }> = {};

    Object.entries(groups).forEach(([cat, items]) => {
      const stockByUnit: Record<string, number> = {};
      const usageByUnit: Record<string, number> = {};
      const netNeededByUnit: Record<string, number> = {};
      let criticalCount = 0;
      let warningCount = 0;
      let totalRestockCost = 0;

      items.forEach(item => {
        stockByUnit[item.unit] = (stockByUnit[item.unit] || 0) + item.stock;
        usageByUnit[item.unit] = (usageByUnit[item.unit] || 0) + item.projected30DayUsage;
        netNeededByUnit[item.unit] = (netNeededByUnit[item.unit] || 0) + item.netNeeded;
        
        if (item.status === 'CRITICAL') {
          criticalCount++;
        } else if (item.status === 'WARNING') {
          warningCount++;
        }
        totalRestockCost += item.restockCost;
      });

      const formatUnitMap = (map: Record<string, number>) => {
        const parts = Object.entries(map)
          .filter(([_, val]) => val > 0)
          .map(([unit, val]) => `${val.toFixed(1).replace(/\.0$/, '')} ${unit}`);
        return parts.length > 0 ? parts.join(', ') : '0';
      };

      summaries[cat] = {
        stockSummary: Object.entries(stockByUnit).map(([unit, val]) => `${val.toFixed(1).replace(/\.0$/, '')} ${unit}`).join(', ') || '0',
        projected30DaySummary: formatUnitMap(usageByUnit),
        netNeededSummary: formatUnitMap(netNeededByUnit),
        totalItems: items.length,
        criticalCount,
        warningCount,
        totalRestockCost
      };
    });

    return { groupedProjections: groups, categorySummaries: summaries };
  }, [projections]);

  // --- Prepare Chart.js Data ---
  const chartConfig = useMemo(() => {
    // Show top 4 items based on projected 30-day consumption
    const sortedTopItems = [...projections]
      .sort((a, b) => b.projected30DayUsage - a.projected30DayUsage)
      .slice(0, 4);

    const labels = ['Day 0', 'Day 5', 'Day 10', 'Day 15', 'Day 20', 'Day 25', 'Day 30'];
    const colors = [
      'rgb(59, 130, 246)', // Blue
      'rgb(16, 185, 129)', // Green
      'rgb(245, 158, 11)', // Orange
      'rgb(239, 68, 68)'   // Red
    ];
    const hoverColors = [
      'rgba(59, 130, 246, 0.4)',
      'rgba(16, 185, 129, 0.4)',
      'rgba(245, 158, 11, 0.4)',
      'rgba(239, 68, 68, 0.4)'
    ];

    const datasets = sortedTopItems.map((item, idx) => {
      const dailyUsage = item.projectedDailyUsage;
      const initialStock = item.stock;
      
      const stockTrend = labels.map((_, i) => {
        const day = i * 5;
        return Math.max(0, Number((initialStock - (dailyUsage * day)).toFixed(1)));
      });

      return {
        label: item.name + ` (${item.unit})`,
        data: stockTrend,
        borderColor: colors[idx % colors.length],
        backgroundColor: hoverColors[idx % hoverColors.length],
        tension: 0.15,
        fill: false,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6
      };
    });

    return {
      labels,
      datasets
    };
  }, [projections]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          font: { family: 'Inter', size: 12 }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        padding: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 11 } }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Projected Stock Level',
          font: { weight: 'bold', size: 12 }
        },
        ticks: { font: { family: 'Inter', size: 11 } }
      }
    }
  };

  // --- Fetch Gemini Smart Predictions & Insights ---
  const fetchSmartInsights = async () => {
    setLoadingInsights(true);
    try {
      const topRisks = projections
        .filter(p => p.status !== 'SAFE' || p.netNeeded > 0)
        .map(p => `- ${p.name}: current stock ${p.stock}${p.unit}, projected 30-day need ${p.projected30DayUsage}${p.unit}, net gap ${p.netNeeded}${p.unit}. Depletes around Day ${p.depletionDay ?? 'N/A'}.`);

      const payload = {
        currentStock: activeInventory.map(i => ({ id: i.id, name: i.name, stock: i.stock, unit: i.unit, minStock: i.minStock })),
        historicalStats: Object.entries(completedServicesBySelection).map(([name, count]) => ({ name, count })),
        projections: projections.map(p => ({
          name: p.name,
          currentStock: p.stock,
          unit: p.unit,
          projected30DayNeed: p.projected30DayUsage,
          estimatedDepletionDay: p.depletionDay,
          restockRecommended: p.restockRecommended,
          restockCost: p.restockCost
        })),
        growthMultiplier,
        seasonScenario: SEASON_SCENARIOS[seasonScenario]?.name || seasonScenario,
        topRisks
      };

      const res = await fetch('/.netlify/functions/chat-with-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            text: `Analyze this inventory data and provide a concise, high-impact procurement advice:
            ${JSON.stringify(payload)}
            
            Give a professional detailing business overview. Provide 3 specific action-oriented bullet points outlining how we should procure materials, bundle services, or run a promotion based on the selected season scenario to maximize capital efficiency and avoid stockouts. Format in clean markdown with small headers.`
          }],
          serviceTemplates: [] // not needed for this system call
        })
      });

      const data = await res.json();
      if (data.reply) {
        setAiInsights(data.reply);
      } else {
        setAiInsights(getLocalInsightsFallback());
      }
    } catch (e) {
      console.error(e);
      setAiInsights(getLocalInsightsFallback());
    } finally {
      setLoadingInsights(false);
    }
  };

  // Run on mount or when key parameters change
  useEffect(() => {
    // Generate simple local recommendations on load
    setAiInsights(getLocalInsightsFallback());
  }, [growthMultiplier, seasonScenario, projections]);

  const getLocalInsightsFallback = () => {
    const critical = projections.filter(p => p.status === 'CRITICAL');
    const warning = projections.filter(p => p.status === 'WARNING');
    
    let advice = `### 📋 Predictive Inventory Insights\n\n`;
    advice += `Based on the **${SEASON_SCENARIOS[seasonScenario]?.name}** scenario and a **${(growthMultiplier * 100).toFixed(0)}%** growth rate, here is your dynamic analysis:\n\n`;

    if (critical.length > 0) {
      advice += `#### 🚨 Critical Procurements Needed Immediately\n`;
      critical.forEach(item => {
        advice += `* **${item.name}**: Stock level (${item.stock} ${item.unit}) is already below the safety safety limit (${item.minStock} ${item.unit}). You will run out of stock soon. Buy **${item.restockRecommended} ${item.unit}** (est. cost: ₹${item.restockCost.toFixed(2)}).\n`;
      });
      advice += `\n`;
    }

    if (warning.length > 0) {
      advice += `#### ⚠️ Items Nearing Stockout (30-Day Window)\n`;
      warning.forEach(item => {
        advice += `* **${item.name}**: Projected 30-day demand (${item.projected30DayUsage} ${item.unit}) will deplete current levels. Drop expected around Day **${item.depletionDay ?? 'N/A'}**. Buy **${item.restockRecommended} ${item.unit}** to secure operations.\n`;
      });
      advice += `\n`;
    }

    advice += `#### 💡 Strategic Business Actions\n`;
    if (seasonScenario === 'MONSOON') {
      advice += `1. **Monsoon Wash Packages**: Mud is driving Car Shampoo volume up 1.6x! Package basic washing with exterior spray sealants to upsell quickly.\n`;
      advice += `2. **Polish Optimization**: Paint corrections are down 60%. Allocate your detailing staff to quick exterior trim restoration and windshield glass clearing promotions.\n`;
    } else if (seasonScenario === 'FESTIVE_SEASON') {
      advice += `1. **Coating Up-sells**: Paint correction (Compound Cream) and Hybrid Ceramic Waxes are up 1.8x. Offer a "Festive Shine Bundle" with a 15% discount to capitalize on high pre-holiday demand.\n`;
      advice += `2. **Bulk Cloth Orders**: Microfibre cloth wear-and-tear is surging. Place a bulk procurement order now to avoid premium last-minute delivery surcharges.\n`;
    } else {
      advice += `1. **Capital Conservation**: Inventory levels are generally healthy. Procure only the top risk items to keep cash flow fluid for overheads.\n`;
      advice += `2. **Recipe Precision**: Ensure detailing technicians are logging exact material consumption to keep prediction precision high!\n`;
    }

    return advice;
  };

  // --- Actions ---
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemStock) return;
    const amountNum = parseFloat(restockAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setSavingStock(true);
    try {
      const updatedItem = {
        ...editingItemStock,
        stock: Number((editingItemStock.stock + amountNum).toFixed(1))
      };
      await onUpdateInventoryItem(updatedItem);
      setEditingItemStock(null);
      setRestockAmount('');
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStock(false);
    }
  };

  const handleRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipeService) return;

    setSavingRecipe(true);
    try {
      const updatedService = {
        ...editingRecipeService,
        recipe: recipeText
      };
      await onUpdatePredefinedService(updatedService);
      setEditingRecipeService(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRecipe(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <IconSparkles className="w-8 h-8 text-brand-accent animate-pulse" />
            Inventory Forecasting
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Predictive detailing material needs for the next 30 days based on active service history and seasonal trends.
          </p>
        </div>
        
        {/* Top Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-200/60 p-1.5 rounded-lg border border-slate-300 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('materials')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${activeTab === 'materials' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="flex items-center gap-1.5">
                <IconTable className="w-4 h-4 text-emerald-600" />
                In-Stock Materials
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-3xs font-mono border">
                  {activeInventory.length}
                </span>
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('forecast')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${activeTab === 'forecast' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="flex items-center gap-1">
                <IconFileAnalytics className="w-4 h-4 text-blue-600" />
                30-Day Forecast
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('recipes')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${activeTab === 'recipes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="flex items-center gap-1">
                <IconClipboardList className="w-4 h-4 text-indigo-600" />
                Service Recipes
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('visualize')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${activeTab === 'visualize' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="flex items-center gap-1">
                <IconChartBar className="w-4 h-4 text-amber-600" />
                Stock Charts
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('replenishment')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${activeTab === 'replenishment' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="flex items-center gap-1">
                <IconRefresh className="w-4 h-4 text-purple-600" />
                Replenishment Model
              </span>
            </button>
          </div>

          <button
            onClick={() => setSimulateData(!simulateData)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all ${simulateData ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            <IconRefresh className="w-3.5 h-3.5" />
            {simulateData ? 'Using Sim Data' : 'Simulate Volume'}
          </button>

          <button
            onClick={() => {
              setEditingItemDetails(null);
              setIsAddModalOpen(true);
            }}
            className="bg-brand-accent text-brand-blue hover:bg-yellow-500 px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all border border-brand-accent shadow-sm"
          >
            <IconPlus className="w-3.5 h-3.5" />
            Add Material
          </button>
        </div>
      </div>

      {/* Tab 1: In-Stock Material List Management */}
      {activeTab === 'materials' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* KPI Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Total Material Types</p>
                  <p className="text-2xl font-black text-slate-800 mt-0.5">{activeInventory.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Tracked detailing inventory</p>
                </div>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                  <IconTable className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Healthy Stock Items</p>
                  <p className="text-2xl font-black text-emerald-600 mt-0.5">
                    {activeInventory.filter(i => i.stock > i.minStock).length}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Above safety stock threshold</p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <IconCheck className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Stockout Risks</p>
                  <p className={`text-2xl font-black mt-0.5 ${criticalItemsCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {criticalItemsCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Items at or below safety stock</p>
                </div>
                <div className={`p-3 rounded-xl ${criticalItemsCount > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                  <IconAlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Total Inventory Asset Value</p>
                  <p className="text-2xl font-black text-slate-800 mt-0.5">
                    ₹{totalInventoryAssetValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Sum of current stock × unit cost</p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <IconSparkles className="w-6 h-6" />
                </div>
              </div>
            </Card>
          </div>

          {/* Controls & Search Toolbar */}
          <Card className="p-5 bg-white border-slate-200 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <IconSearch className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search material name, ID, or unit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingItemDetails(null);
                    setIsAddModalOpen(true);
                  }}
                  className="bg-brand-accent text-brand-blue hover:bg-yellow-500 font-bold px-4 shadow-xs"
                >
                  <IconPlus className="w-4 h-4 mr-1" />
                  Create Material
                </Button>

                <Button
                  size="sm"
                  onClick={handleSeedDefaultMaterials}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold shadow-none"
                  title="Add missing default materials (shampoo, wax, tyre polish, etc.)"
                >
                  <IconRefresh className="w-3.5 h-3.5 mr-1" />
                  Seed Defaults
                </Button>
              </div>
            </div>

            {/* Filter Chips Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-100 gap-3">
              {/* Categories Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                <span className="text-slate-400 font-bold uppercase text-3xs mr-1 flex items-center gap-1">
                  <IconFilter className="w-3 h-3" /> Category:
                </span>
                {['ALL', 'Cleaning', 'Tyres', 'Batteries', 'Mechanical/Spares', 'Tools/Accessories'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-brand-blue text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </button>
                ))}
              </div>

              {/* Stock Status Filter */}
              <div className="flex items-center gap-1 text-xs flex-shrink-0">
                <button
                  onClick={() => setStockFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    stockFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Stock
                </button>
                <button
                  onClick={() => setStockFilter('CRITICAL')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    stockFilter === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <IconAlertTriangle className="w-3 h-3" />
                  Low Stock
                </button>
                <button
                  onClick={() => setStockFilter('SAFE')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    stockFilter === 'SAFE' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  Healthy Stock
                </button>
              </div>
            </div>
          </Card>

          {/* In-Stock Materials Table */}
          <Card className="p-0 border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4">Material / Item</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4 text-center">In-Stock Quantity (Quick Adjust)</th>
                    <th className="py-3.5 px-4 text-center">Safety Level</th>
                    <th className="py-3.5 px-4 text-center">Stock Health</th>
                    <th className="py-3.5 px-4 text-right">Cost / Unit</th>
                    <th className="py-3.5 px-4 text-right">Total Value</th>
                    <th className="py-3.5 px-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <IconAlertTriangle className="w-10 h-10 text-slate-300" />
                          <p className="font-bold text-slate-600 text-base">No materials found</p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            {searchQuery || categoryFilter !== 'ALL' || stockFilter !== 'ALL'
                              ? 'Try adjusting your search or category filters above.'
                              : 'Your inventory list is currently empty.'}
                          </p>
                          <div className="pt-2 flex gap-2">
                            {(searchQuery || categoryFilter !== 'ALL' || stockFilter !== 'ALL') && (
                              <Button
                                size="sm"
                                onClick={() => { setSearchQuery(''); setCategoryFilter('ALL'); setStockFilter('ALL'); }}
                                className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                              >
                                Clear Filters
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => { setEditingItemDetails(null); setIsAddModalOpen(true); }}
                              className="bg-brand-accent text-brand-blue hover:bg-yellow-500 font-bold"
                            >
                              <IconPlus className="w-4 h-4 mr-1" />
                              Add New Material
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map(item => {
                      const category = item.category || getMaterialCategory(item);
                      const isBelowSafety = item.stock <= item.minStock;
                      const isNearSafety = !isBelowSafety && item.stock <= item.minStock * 1.5;
                      const itemTotalValue = item.stock * (item.costPerUnit || 0);

                      let healthBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                      let healthLabel = "Healthy Stock";
                      if (isBelowSafety) {
                        healthBg = "bg-red-50 text-red-700 border-red-200";
                        healthLabel = "Critical Outage";
                      } else if (isNearSafety) {
                        healthBg = "bg-amber-50 text-amber-700 border-amber-200";
                        healthLabel = "Low Stock Warning";
                      }

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Material Name & ID */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                              {item.name}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              ID: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.id}</span>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-4">
                            <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {category}
                            </span>
                          </td>

                          {/* In-Stock Quantity with Inline Quick Adjust (+ / -) */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleQuickStockAdjust(item, -10)}
                                className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-700 text-slate-600 font-bold transition-all border border-slate-200 active:scale-95 text-3xs"
                                title="Decrease stock by 10"
                              >
                                -10
                              </button>
                              <button
                                onClick={() => handleQuickStockAdjust(item, -1)}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-700 text-slate-600 flex items-center justify-center font-bold transition-all border border-slate-200 active:scale-95"
                                title="Decrease stock by 1"
                              >
                                <IconMinus className="w-3.5 h-3.5" />
                              </button>

                              <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg min-w-[85px] text-center font-mono font-black text-slate-800 text-base">
                                {item.stock} <span className="text-xs text-slate-500 font-normal">{item.unit}</span>
                              </div>

                              <button
                                onClick={() => handleQuickStockAdjust(item, 1)}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 flex items-center justify-center font-bold transition-all border border-slate-200 active:scale-95"
                                title="Increase stock by 1"
                              >
                                <IconPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleQuickStockAdjust(item, 10)}
                                className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 font-bold transition-all border border-slate-200 active:scale-95 text-3xs"
                                title="Increase stock by 10"
                              >
                                +10
                              </button>
                            </div>
                          </td>

                          {/* Safety Level */}
                          <td className="py-3.5 px-4 text-center font-mono font-medium text-slate-600">
                            {item.minStock} {item.unit}
                          </td>

                          {/* Stock Health Status */}
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${healthBg}`}>
                              {isBelowSafety && <IconAlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                              {!isBelowSafety && <IconCheck className="w-3.5 h-3.5 text-emerald-600" />}
                              {healthLabel}
                            </span>
                          </td>

                          {/* Cost per unit */}
                          <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-700">
                            ₹{item.costPerUnit ?? 0} <span className="text-2xs text-slate-400">/{item.unit}</span>
                          </td>

                          {/* Total Value */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                            ₹{itemTotalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>

                          {/* Quick Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItemStock(item);
                                  const recommended = item.minStock > item.stock ? (item.minStock - item.stock) + 50 : 100;
                                  setRestockAmount(String(recommended));
                                }}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs py-1"
                              >
                                + Restock
                              </Button>
                              <button
                                onClick={() => setEditingItemDetails(item)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
                                title="Edit Material Details"
                              >
                                <IconPencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                title="Delete Material"
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'forecast' && (
        <>
          {/* Projections KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expected Services</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">
                    {Math.round(totalCompletedCount * growthMultiplier)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Based on {totalCompletedCount} in {historicalWindowDays} days
                  </p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <IconTable className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Projected Cost</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">
                    ₹{totalProjectedCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Material value consumed
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <IconFileAnalytics className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stockout Risks</p>
                  <p className="text-3xl font-black text-red-600 mt-1">
                    {criticalItemsCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Items below safety stock
                  </p>
                </div>
                <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                  <IconAlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Restock Value</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">
                    ₹{totalRestockCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Cost to secure safety levels
                  </p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <IconPlus className="w-6 h-6" />
                </div>
              </div>
            </Card>
          </div>

          {/* Forecasting Tuning Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Simulation controls & Season Selector */}
            <Card className="p-6 bg-white border-slate-200 lg:col-span-1 space-y-6">
              <h2 className="text-lg font-bold text-slate-800 pb-2 border-b">Forecast Tuning</h2>
              
              {/* Season Selection */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-600">Season Scenario</label>
                <select 
                  value={seasonScenario}
                  onChange={(e) => setSeasonScenario(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent transition-all"
                >
                  {Object.entries(SEASON_SCENARIOS).map(([key, sc]) => (
                    <option key={key} value={key}>{sc.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 leading-relaxed italic">
                  {SEASON_SCENARIOS[seasonScenario]?.description}
                </p>
              </div>

              {/* Slider for volume tuning */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-sm font-bold text-slate-600">
                  <span>Growth & Volume Factor</span>
                  <span className="text-brand-blue bg-amber-100 px-2 py-0.5 rounded text-xs">
                    {(growthMultiplier * 100).toFixed(0)}% Volume
                  </span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.5" 
                  step="0.1"
                  value={growthMultiplier}
                  onChange={(e) => setGrowthMultiplier(parseFloat(e.target.value))}
                  className="w-full accent-brand-accent cursor-ew-resize h-1.5 bg-slate-200 rounded-lg"
                />
                <div className="flex justify-between text-2xs text-slate-400">
                  <span>0.5x Slowdown</span>
                  <span>1.0x Baseline</span>
                  <span>2.5x Max Capacity</span>
                </div>
              </div>

              {/* Timeline selector */}
              <div className="space-y-2 pt-2">
                <label className="text-sm font-bold text-slate-600 block">Historical Reference Window</label>
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  {[30, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setHistoricalWindowDays(days)}
                      disabled={simulateData}
                      className={`py-1 text-xs font-bold rounded transition-all ${historicalWindowDays === days && !simulateData ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-800 disabled:opacity-40'}`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
                <p className="text-2xs text-slate-400">
                  Daily averages will be derived from completed orders in this window.
                </p>
              </div>

              {/* Quick Summary of Active Services Rates */}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Historical Frequency</h3>
                <div className="max-h-36 overflow-y-auto space-y-2 pr-1 text-sm">
                  {Object.entries(completedServicesBySelection).map(([name, count]) => (
                    <div key={name} className="flex justify-between text-slate-700">
                      <span className="truncate max-w-[170px]">{name}</span>
                      <span className="font-mono font-bold text-slate-500">
                        {count} completed ({((count/historicalWindowDays) * growthMultiplier).toFixed(1)}/day)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Visual Stock Depletion Trend Chart */}
            <Card className="p-6 bg-white border-slate-200 lg:col-span-2">
              <div className="flex items-center justify-between pb-4 border-b mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Cumulative Material Depletion</h2>
                  <p className="text-xs text-slate-400">Visualizing estimated stock drawdowns for your top materials over 30 days.</p>
                </div>
                <span className="text-2xs font-bold text-brand-blue bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                  Top Consumed items
                </span>
              </div>
              <div className="w-full">
                {typeof Chart === 'undefined' ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    <IconAlertTriangle className="w-10 h-10 mb-2 text-slate-300" />
                    <p className="text-sm">Chart rendering engine loading...</p>
                    <p className="text-xs text-slate-300 mt-1">Please ensure you are connected to the network.</p>
                  </div>
                ) : (
                  <StockChart data={chartConfig} options={chartOptions} />
                )}
              </div>
            </Card>
          </div>

          {/* AI recommendations panel */}
          <Card className="p-6 bg-slate-900 text-white overflow-hidden relative border-none">
            <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-6">
              <IconSparkles className="w-64 h-64 text-brand-accent" />
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-accent text-brand-blue rounded-xl">
                  <IconSparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">AI Predictive Procurement Assistant</h2>
                  <p className="text-xs text-slate-400">Contextual order triggers, batch logistics cost reduction, and bundle advice.</p>
                </div>
              </div>

              <Button
                size="sm"
                onClick={fetchSmartInsights}
                disabled={loadingInsights}
                className="bg-brand-accent hover:bg-yellow-500 text-brand-blue font-bold px-4"
              >
                {loadingInsights ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></span>
                    Analyzing Data...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <IconSparkles className="w-4 h-4" />
                    Generate AI Insights
                  </span>
                )}
              </Button>
            </div>

            <div className="mt-4 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {aiInsights ? (
                <div className="prose prose-invert max-w-none text-slate-200">
                  {/* Simplistic custom renderer to avoid installing md-library */}
                  {aiInsights.split('\n').map((line, idx) => {
                    if (line.startsWith('###')) {
                      return <h3 key={idx} className="text-lg font-black text-white mt-4 mb-2">{line.replace('###', '')}</h3>;
                    }
                    if (line.startsWith('####')) {
                      return <h4 key={idx} className="text-md font-bold text-brand-accent mt-3 mb-1">{line.replace('####', '')}</h4>;
                    }
                    if (line.startsWith('*') || line.startsWith('-')) {
                      return <div key={idx} className="flex items-start gap-2 ml-2 mt-1.5"><span className="text-brand-accent mt-1">•</span><span>{line.substring(2)}</span></div>;
                    }
                    if (line.trim() === '') return <div key={idx} className="h-2"></div>;
                    return <p key={idx} className="text-slate-300 mt-1">{line}</p>;
                  })}
                </div>
              ) : (
                <p className="text-slate-400 italic">Click the button above to synthesize real-time predictive advice on procurement timelines.</p>
              )}
            </div>
          </Card>

          {/* Forecasting Detail Table */}
          <Card className="p-6 bg-white border-slate-200 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b mb-4 gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">30-Day Material Needs Projections</h2>
                <p className="text-xs text-slate-400 mt-0.5">Derived from historical completion recipes and seasonality multipliers.</p>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Group by Category</span>
                <button
                  type="button"
                  onClick={() => setGroupByCategory(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${groupByCategory ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  title="Toggle between flat list and category grouped list"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${groupByCategory ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>

            {groupByCategory ? (
              <div className="space-y-6">
                {Object.entries(groupedProjections).map(([category, items]) => {
                  const summary = categorySummaries[category];
                  if (items.length === 0) return null;

                  const isExpanded = !!expandedCategories[category];
                  const hasCritical = summary.criticalCount > 0;
                  const hasWarning = summary.warningCount > 0;

                  let badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                  let badgeText = "OPTIMAL";
                  if (hasCritical) {
                    badgeBg = "bg-red-50 text-red-700 border-red-200";
                    badgeText = `${summary.criticalCount} CRITICAL SHORTAGE`;
                  } else if (hasWarning) {
                    badgeBg = "bg-amber-50 text-amber-700 border-amber-200";
                    badgeText = `${summary.warningCount} WARNING`;
                  }

                  return (
                    <div key={category} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/20 shadow-sm">
                      {/* Accordion Trigger */}
                      <button
                        type="button"
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [category]: !isExpanded }))}
                        className="w-full flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-slate-50 border-b border-slate-200 text-left gap-4 hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                            <IconChevronRight className="w-5 h-5 text-slate-400" />
                          </span>
                          <div>
                            <span className="font-black text-slate-800 tracking-tight text-md flex items-center gap-1.5">
                              {category} Materials
                              <span className="text-xs font-normal text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full font-mono">
                                {summary.totalItems} {summary.totalItems === 1 ? 'item' : 'items'}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Summary Metrics */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                          <div className="font-mono">
                            <span className="text-slate-400 block text-3xs font-sans uppercase font-black">Total Current Stock</span>
                            <span className="font-bold text-slate-700">{summary.stockSummary}</span>
                          </div>
                          <div className="font-mono">
                            <span className="text-slate-400 block text-3xs font-sans uppercase font-black">Projected 30D Need</span>
                            <span className="font-bold text-slate-800">{summary.projected30DaySummary}</span>
                          </div>
                          {summary.netNeededSummary !== '0' && (
                            <div className="font-mono">
                              <span className="text-red-400 block text-3xs font-sans uppercase font-black">Net Shortage</span>
                              <span className="font-bold text-red-600">{summary.netNeededSummary}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-slate-400 block text-3xs uppercase font-black">Material Health</span>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-2xs font-bold border ${badgeBg}`}>
                              {badgeText}
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="overflow-x-auto bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 font-bold text-xs uppercase tracking-wider">
                                <th className="py-2.5 px-4">Material</th>
                                <th className="py-2.5 px-4 text-center">Current Stock</th>
                                <th className="py-2.5 px-4 text-center">Safety Level</th>
                                <th className="py-2.5 px-4 text-right">Proj. 30D Need</th>
                                <th className="py-2.5 px-4 text-right">Net Shortage</th>
                                <th className="py-2.5 px-4 text-center">Procurement Advice</th>
                                <th className="py-2.5 px-4 text-center">Depletion Day</th>
                                <th className="py-2.5 px-4 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                              {items.map(item => {
                                const isBelowSafety = item.stock <= item.minStock;
                                const willBeBelowSafety = item.stock - item.projected30DayUsage <= item.minStock;
                                
                                let alertBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                let alertLabel = "In Stock (Safe)";

                                if (isBelowSafety) {
                                  alertBg = "bg-red-50 text-red-700 border-red-200";
                                  alertLabel = "CRITICAL OUTAGE";
                                } else if (willBeBelowSafety) {
                                  alertBg = "bg-amber-50 text-amber-700 border-amber-200";
                                  alertLabel = "Below Safety Stock";
                                }

                                return (
                                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="py-3 px-4">
                                      <span className="font-bold text-slate-800">{item.name}</span>
                                      <span className="block text-2xs text-slate-400">Unit: {item.unit} | Cost/unit: ₹{item.costPerUnit ?? 1}</span>
                                    </td>
                                    
                                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                                      {item.stock} {item.unit}
                                    </td>

                                    <td className="py-3 px-4 text-center font-mono text-slate-500">
                                      {item.minStock} {item.unit}
                                    </td>

                                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                                      {item.projected30DayUsage} {item.unit}
                                      <span className="block text-2xs text-slate-400 font-sans">({item.projectedDailyUsage.toFixed(1)}/day)</span>
                                    </td>

                                    <td className="py-3 px-4 text-right font-mono text-red-600 font-bold">
                                      {item.netNeeded > 0 ? `${item.netNeeded} ${item.unit}` : '-'}
                                      {item.netNeeded > 0 && (
                                        <span className="block text-2xs text-slate-400 font-sans">₹{item.projectedCost.toFixed(0)} value</span>
                                      )}
                                    </td>

                                    <td className="py-3 px-4 text-center">
                                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${alertBg}`}>
                                        {alertLabel}
                                      </span>
                                    </td>

                                    <td className="py-3 px-4 text-center font-bold text-slate-600">
                                      {isBelowSafety ? (
                                        <span className="text-red-600">Outage Now</span>
                                      ) : item.projectedDailyUsage === 0 ? (
                                        <span className="text-slate-400">No consumption</span>
                                      ) : item.depletionDay && item.depletionDay <= 30 ? (
                                        <span className={item.depletionDay <= 10 ? "text-red-600 animate-pulse" : "text-amber-600"}>
                                          Day {item.depletionDay} ({Math.round(item.depletionDay)} days left)
                                        </span>
                                      ) : (
                                        <span className="text-emerald-600">&gt; 30 Days</span>
                                      )}
                                    </td>

                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setEditingItemStock(item);
                                            setRestockAmount(String(item.restockRecommended > 0 ? item.restockRecommended : 100));
                                          }}
                                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 shadow-none font-bold text-xs py-1"
                                        >
                                          Restock
                                        </Button>
                                        <button
                                          onClick={() => setEditingItemDetails(item)}
                                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                          title="Edit Details"
                                        >
                                          <IconPencil className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setDeletingItem(item)}
                                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete Material"
                                        >
                                          <IconTrash className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-xs uppercase tracking-wider">
                      <th className="py-3 px-4">Material</th>
                      <th className="py-3 px-4 text-center">Current Stock</th>
                      <th className="py-3 px-4 text-center">Safety Level</th>
                      <th className="py-3 px-4 text-right">Proj. 30D Need</th>
                      <th className="py-3 px-4 text-right">Net Shortage</th>
                      <th className="py-3 px-4 text-center">Procurement Advice</th>
                      <th className="py-3 px-4 text-center">Depletion Day</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {projections.map(item => {
                      const isBelowSafety = item.stock <= item.minStock;
                      const willBeBelowSafety = item.stock - item.projected30DayUsage <= item.minStock;
                      
                      let alertBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                      let alertLabel = "In Stock (Safe)";

                      if (isBelowSafety) {
                        alertBg = "bg-red-50 text-red-700 border-red-200";
                        alertLabel = "CRITICAL OUTAGE";
                      } else if (willBeBelowSafety) {
                        alertBg = "bg-amber-50 text-amber-700 border-amber-200";
                        alertLabel = "Below Safety Stock";
                      }

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <span className="block text-2xs text-slate-400">Unit: {item.unit} | Cost/unit: ₹{item.costPerUnit ?? 1}</span>
                          </td>
                          
                          <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                            {item.stock} {item.unit}
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                            {item.minStock} {item.unit}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                            {item.projected30DayUsage} {item.unit}
                            <span className="block text-2xs text-slate-400 font-sans">({item.projectedDailyUsage.toFixed(1)}/day)</span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono text-red-600 font-bold">
                            {item.netNeeded > 0 ? `${item.netNeeded} ${item.unit}` : '-'}
                            {item.netNeeded > 0 && (
                              <span className="block text-2xs text-slate-400 font-sans">₹{item.projectedCost.toFixed(0)} value</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${alertBg}`}>
                              {alertLabel}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center font-bold text-slate-600">
                            {isBelowSafety ? (
                              <span className="text-red-600">Outage Now</span>
                            ) : item.projectedDailyUsage === 0 ? (
                              <span className="text-slate-400">No consumption</span>
                            ) : item.depletionDay && item.depletionDay <= 30 ? (
                              <span className={item.depletionDay <= 10 ? "text-red-600 animate-pulse" : "text-amber-600"}>
                                Day {item.depletionDay} ({Math.round(item.depletionDay)} days left)
                              </span>
                            ) : (
                              <span className="text-emerald-600">&gt; 30 Days</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItemStock(item);
                                  setRestockAmount(String(item.restockRecommended > 0 ? item.restockRecommended : 100));
                                }}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 shadow-none font-bold text-xs"
                              >
                                Restock
                              </Button>
                              <button
                                onClick={() => setEditingItemDetails(item)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Details"
                              >
                                <IconPencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Material"
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === 'replenishment' && (
        <Card className="p-6 bg-white border-slate-200 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Predictive Replenishment Model</h2>
              <p className="text-xs text-slate-500 mt-1">
                Calculate precise reorder points (ROP) and recommended reorder quantities (ROQ) based on average daily consumption and lead time.
              </p>
            </div>
            
            {/* Model tuning controls */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-150">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 uppercase">Coverage Target:</span>
                <span className="text-brand-blue bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md text-xs font-black">
                  {targetCoverageDays} Days
                </span>
              </div>
              <input 
                type="range" 
                min="7" 
                max="90" 
                step="1"
                value={targetCoverageDays}
                onChange={(e) => setTargetCoverageDays(parseInt(e.target.value))}
                className="accent-brand-accent cursor-ew-resize h-1.5 w-32 bg-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Model Formula Explanation Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150 text-xs text-slate-600 leading-relaxed">
            <div className="space-y-1 border-r border-slate-200/60 pr-3 last:border-r-0">
              <p className="font-extrabold text-slate-800 uppercase text-2xs tracking-wider text-brand-blue">1. Reorder Point (ROP)</p>
              <p className="italic font-semibold text-[11px]">ROP = (Avg Daily Consumption × Lead Time) + Safety Stock</p>
              <p className="text-slate-500">Triggers an order when current inventory falls below this safe threshold to cover lead time usage.</p>
            </div>
            <div className="space-y-1 border-r border-slate-200/60 pr-3 last:border-r-0">
              <p className="font-extrabold text-slate-800 uppercase text-2xs tracking-wider text-indigo-600">2. Reorder Quantity (ROQ)</p>
              <p className="italic font-semibold text-[11px]">ROQ = (Avg Daily Consumption × Coverage Target) + Safety Stock - Current Stock</p>
              <p className="text-slate-500">The optimal lot size to restore stock to standard operating capacity during procurement cycles.</p>
            </div>
            <div className="space-y-1 last:border-r-0">
              <p className="font-extrabold text-slate-800 uppercase text-2xs tracking-wider text-amber-600">3. Status Indicators</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-500 text-[11px]">
                <li><strong className="text-red-600">Critical</strong>: Stock &lt;= Safety level</li>
                <li><strong className="text-amber-600">Reorder Now</strong>: Stock &lt;= ROP</li>
                <li><strong className="text-emerald-600">Stocked</strong>: Stock &gt; ROP</li>
              </ul>
            </div>
          </div>

          {/* Replenishment Summary KPI Cards */}
          {(() => {
            let criticalCount = 0;
            let reorderCount = 0;
            let totalOrderCost = 0;

            activeInventory.forEach(item => {
              const baseDailyRate = materialDailyRates[item.id] || 0;
              const scenarioMultipliers = SEASON_SCENARIOS[seasonScenario]?.multipliers || {};
              const seasonalMultiplier = scenarioMultipliers[item.id] ?? 1.0;
              const projectedDailyUsage = baseDailyRate * growthMultiplier * seasonalMultiplier;
              const currentStock = item.stock;
              const minStock = item.minStock;
              const lt = customLeadTimes[item.id] ?? item.leadTime ?? (item.name.toLowerCase().includes('shampoo') ? 3 : item.name.toLowerCase().includes('tyre') ? 7 : 5);
              const rop = (projectedDailyUsage * lt) + minStock;

              if (currentStock <= minStock) {
                criticalCount++;
              } else if (currentStock <= rop) {
                reorderCount++;
              }

              if (currentStock <= rop) {
                const recommendedQty = Math.max(0, Math.ceil((projectedDailyUsage * targetCoverageDays) + minStock - currentStock));
                totalOrderCost += recommendedQty * (item.costPerUnit || 1);
              }
            });

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-2xs font-black text-slate-400 uppercase tracking-wider">Total Materials Analyzed</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{activeInventory.length}</p>
                </div>
                <div className="bg-red-50/50 border border-red-150 rounded-xl p-4">
                  <p className="text-2xs font-black text-red-500 uppercase tracking-wider">Critically Low Items</p>
                  <p className="text-2xl font-black text-red-700 mt-1">{criticalCount}</p>
                </div>
                <div className="bg-amber-50/50 border border-amber-150 rounded-xl p-4">
                  <p className="text-2xs font-black text-amber-600 uppercase tracking-wider">Items Due for Reorder</p>
                  <p className="text-2xl font-black text-amber-700 mt-1">{reorderCount}</p>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-150 rounded-xl p-4">
                  <p className="text-2xs font-black text-emerald-600 uppercase tracking-wider">Estimated Procurement Cost</p>
                  <p className="text-2xl font-black text-emerald-800 mt-1">₹{totalOrderCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            );
          })()}

          {/* Color-Coded Replenishment Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Material / Category</th>
                    <th className="py-3 px-4 text-center">Avg Daily Consumption</th>
                    <th className="py-3 px-4 text-center w-24">Lead Time (Days)</th>
                    <th className="py-3 px-4 text-center">Safety Stock</th>
                    <th className="py-3 px-4 text-center">Reorder Point (ROP)</th>
                    <th className="py-3 px-4 text-center">Current Stock</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Recommended Reorder Qty</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {activeInventory.map(item => {
                    const baseDailyRate = materialDailyRates[item.id] || 0;
                    const scenarioMultipliers = SEASON_SCENARIOS[seasonScenario]?.multipliers || {};
                    const seasonalMultiplier = scenarioMultipliers[item.id] ?? 1.0;
                    const projectedDailyUsage = baseDailyRate * growthMultiplier * seasonalMultiplier;
                    
                    const currentStock = item.stock;
                    const minStock = item.minStock;
                    const leadTime = customLeadTimes[item.id] ?? item.leadTime ?? (item.name.toLowerCase().includes('shampoo') ? 3 : item.name.toLowerCase().includes('tyre') ? 7 : 5);
                    const rop = Number(((projectedDailyUsage * leadTime) + minStock).toFixed(1));

                    let status: 'CRITICAL' | 'REORDER' | 'STOCKED' = 'STOCKED';
                    let statusLabel = 'STOCKED';
                    let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                    if (currentStock <= minStock) {
                      status = 'CRITICAL';
                      statusLabel = 'CRITICAL';
                      statusClass = 'bg-red-50 text-red-700 border-red-200 animate-pulse';
                    } else if (currentStock <= rop) {
                      status = 'REORDER';
                      statusLabel = 'REORDER NOW';
                      statusClass = 'bg-amber-50 text-amber-700 border-amber-200';
                    } else {
                      status = 'STOCKED';
                      statusLabel = 'STOCKED';
                      statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    }

                    const recommendedQty = Math.max(0, Math.ceil((projectedDailyUsage * targetCoverageDays) + minStock - currentStock));
                    const orderCost = Number((recommendedQty * (item.costPerUnit || 1)).toFixed(2));

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 block text-sm">{item.name}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">{item.category || getMaterialCategory(item)} • {item.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                          {projectedDailyUsage.toFixed(2)} {item.unit}/day
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <input 
                            type="number" 
                            min="1" 
                            max="60"
                            value={leadTime}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setCustomLeadTimes(prev => ({ ...prev, [item.id]: val }));
                            }}
                            className="w-16 px-2 py-1 text-center font-bold border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:bg-white text-xs font-mono"
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                          {minStock} {item.unit}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-600">
                          {rop} {item.unit}
                        </td>
                        <td className={`py-3.5 px-4 text-center font-mono font-black text-sm ${status === 'CRITICAL' ? 'text-red-600' : status === 'REORDER' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {currentStock} {item.unit}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {status !== 'STOCKED' && recommendedQty > 0 ? (
                            <div>
                              <span className="font-black text-slate-800 text-sm font-mono">{recommendedQty} {item.unit}</span>
                              <span className="block text-3xs font-semibold text-slate-400 mt-0.5">Est Cost: ₹{orderCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-semibold">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {status !== 'STOCKED' && recommendedQty > 0 ? (
                            <Button
                              size="sm"
                              onClick={async () => {
                                const updatedItem = {
                                  ...item,
                                  stock: Number((item.stock + recommendedQty).toFixed(1))
                                };
                                await onUpdateInventoryItem(updatedItem);
                              }}
                              className="bg-brand-blue hover:bg-brand-blue/90 text-white font-black text-2xs py-1 px-2.5 rounded-md uppercase tracking-wider"
                            >
                              Fast Order
                            </Button>
                          ) : (
                            <span className="text-slate-400 text-2xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {activeInventory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-400 font-bold">
                        No materials found. Please configure materials first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'recipes' && (
        <Card className="p-6 bg-white border-slate-200">
          <div className="pb-4 border-b mb-6">
            <h2 className="text-lg font-bold text-slate-800">Predefined Service Material Recipes</h2>
            <p className="text-xs text-slate-400 mt-1">
              Recipes define how much material is consumed upon job completion. Specify quantities like "30ml shampoo, 10ml trim restorer" to let the forecast calculate automatic depletions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Available Catalogue Services</h3>
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto border rounded-xl p-2 bg-slate-50/50">
                {predefinedServices.map(service => {
                  const ingredients = parseRecipeToIngredients(service.recipe || '', activeInventory);
                  return (
                    <div 
                      key={service.id} 
                      className={`p-3 rounded-lg transition-all flex justify-between items-center cursor-pointer hover:bg-slate-100 ${editingRecipeService?.id === service.id ? 'bg-amber-50 border-l-4 border-brand-accent' : ''}`}
                      onClick={() => {
                        setEditingRecipeService(service);
                        setRecipeText(service.recipe || '');
                      }}
                    >
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{service.name}</p>
                        <p className="text-xs text-slate-500 italic mt-0.5 max-w-[280px] truncate">
                          {service.recipe ? `Recipe: ${service.recipe}` : '❌ No recipe set (uses keyword fallbacks)'}
                        </p>
                        {ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {ingredients.map((ing, i) => (
                              <span key={i} className="text-2xs bg-blue-50 border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded-full">
                                {ing.quantity}{ing.unit} {ing.itemName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <IconChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  );
                })}
                {predefinedServices.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8">No predefined services found in catalogue.</p>
                )}
              </div>
            </div>

            <div>
              {editingRecipeService ? (
                <form onSubmit={handleRecipeSubmit} className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/40">
                  <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5">
                    <IconPencil className="w-5 h-5 text-brand-accent" />
                    Edit Recipe: {editingRecipeService.name}
                  </h3>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Freeform Recipe Syntax</label>
                    <textarea
                      value={recipeText}
                      onChange={(e) => setRecipeText(e.target.value)}
                      placeholder="e.g. 30ml shampoo, 10ml trim restorer, 0.2pcs microfibre cloth"
                      className="w-full h-24 px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-brand-accent focus:border-brand-accent focus:outline-none transition-all resize-none"
                    />
                    <p className="text-3xs text-slate-400 leading-relaxed">
                      Our system automatically extracts keywords (shampoo, tyre shine, trim restorer, glass cleaner, compound, microfibre cloth, ceramic spray/wax) along with their preceding or following volumes in milliliters (ml), grams (gm), or pieces (pcs).
                    </p>
                  </div>

                  <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-lg">
                    <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1">
                      <IconSparkles className="w-3.5 h-3.5" />
                      Live Extracted Ingredients:
                    </h4>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {parseRecipeToIngredients(recipeText, activeInventory).map((ing, i) => (
                        <span key={i} className="text-xs bg-amber-100/80 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                          {ing.quantity}{ing.unit} of {ing.itemName}
                        </span>
                      ))}
                      {parseRecipeToIngredients(recipeText, activeInventory).length === 0 && (
                        <span className="text-xs text-amber-600 italic">No valid materials detected. Uses default fallbacks.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => setEditingRecipeService(null)}
                      className="bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-none border border-slate-200 font-bold"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      type="submit"
                      disabled={savingRecipe}
                      className="bg-brand-accent text-brand-blue hover:bg-yellow-500 font-bold px-4"
                    >
                      {savingRecipe ? 'Saving...' : 'Save Recipe'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                  <IconClipboardList className="w-12 h-12 mb-2 text-slate-300" />
                  <p className="text-sm font-bold text-slate-500">No Service Selected</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[240px]">Click any service on the left to inspect, adjust, or define its custom material consumption recipe.</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'visualize' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 bg-white border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Stock Levels vs. Operational Limits</h2>
                <p className="text-xs text-slate-400 mt-1">Comparing current stock, safety limits, and projected 30-day usage for top consumed materials.</p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border text-xs font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                Top 10 High-Demand Items
              </div>
            </div>

            <div className="h-[520px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10UsedItems}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={true} vertical={true} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} fontFamily="Inter" />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="#475569" 
                    fontSize={11} 
                    fontFamily="Inter"
                    width={110}
                    tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none', 
                      borderRadius: '8px', 
                      color: '#f8fafc',
                      fontSize: '12px',
                      fontFamily: 'Inter',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    itemStyle={{ color: '#cbd5e1' }}
                    labelStyle={{ color: '#f1f5f9', fontWeight: 'bold', marginBottom: '4px' }}
                    formatter={(value: any, name: string, props: any) => {
                      const unit = props.payload.unit || '';
                      let nameLabel = name;
                      if (name === 'stock') nameLabel = 'Current Stock';
                      if (name === 'minStock') nameLabel = 'Safety Limit';
                      if (name === 'projected30DayUsage') nameLabel = 'Projected 30-Day Demand';
                      return [`${value} ${unit}`, nameLabel];
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconSize={10}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter', fontWeight: 600 }}
                    formatter={(value) => {
                      if (value === 'stock') return 'Current Stock';
                      if (value === 'minStock') return 'Safety Stock Limit';
                      if (value === 'projected30DayUsage') return '30-Day Projected Demand';
                      return value;
                    }}
                  />
                  <Bar dataKey="stock" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="minStock" fill="#f43f5e" radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="projected30DayUsage" fill="#eab308" radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 bg-slate-900 text-white border-none shadow-md overflow-hidden relative">
              <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-8 -translate-y-4">
                <IconChartBar className="w-48 h-48 text-brand-accent" />
              </div>
              <h3 className="font-black text-lg tracking-tight mb-4 flex items-center gap-2">
                <IconSparkles className="w-5 h-5 text-brand-accent" />
                Visualization Insights
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed mb-4">
                This diagnostic chart highlights your high-use resources. Ensure safety limits are maintained to prevent service bottlenecks.
              </p>

              <div className="space-y-3 pt-3 border-t border-slate-800">
                {top10UsedItems.length > 0 ? (
                  <>
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="block text-slate-400 font-bold text-3xs uppercase tracking-wider">Highest Demand Item</span>
                        <span className="font-bold text-sm text-brand-accent truncate max-w-[150px]">{top10UsedItems[0].name}</span>
                      </div>
                      <span className="font-mono text-xs font-black text-white bg-slate-700 px-2 py-1 rounded">
                        {top10UsedItems[0].projected30DayUsage} {top10UsedItems[0].unit}
                      </span>
                    </div>

                    {(() => {
                      const criticalItem = [...top10UsedItems].find(item => item.stock <= item.minStock);
                      const warningItem = [...top10UsedItems].find(item => item.stock - item.projected30DayUsage <= item.minStock);
                      const urgentItem = criticalItem || warningItem || top10UsedItems[0];
                      const isCritical = !!criticalItem;
                      const isWarning = !!warningItem && !criticalItem;
                      
                      return (
                        <div className={`p-3 rounded-xl border flex items-center justify-between ${isCritical ? 'bg-red-950/40 border-red-900/50 text-red-100' : isWarning ? 'bg-amber-950/40 border-amber-900/50 text-amber-100' : 'bg-green-950/40 border-green-900/50 text-green-100'}`}>
                          <div>
                            <span className="block text-slate-400 font-bold text-3xs uppercase tracking-wider">Urgent Attention Item</span>
                            <span className="font-bold text-sm truncate max-w-[150px]">{urgentItem.name}</span>
                          </div>
                          <span className={`text-2xs font-black px-2 py-0.5 rounded uppercase ${isCritical ? 'bg-red-800 text-white' : isWarning ? 'bg-amber-600 text-slate-900' : 'bg-green-600 text-white'}`}>
                            {isCritical ? 'Critical Outage' : isWarning ? 'Low Stock Risk' : 'Optimal'}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">No usage data compiled yet.</p>
                )}
              </div>
            </Card>

            <Card className="p-5 bg-white border-slate-200 shadow-sm">
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-wider mb-3">Material Health Check</h3>
              <div className="divide-y divide-slate-100">
                {top10UsedItems.slice(0, 5).map(item => {
                  const safetyRatio = item.stock / (item.minStock || 1);
                  let ratioColor = 'bg-green-500';
                  let ratioText = 'Healthy';
                  if (safetyRatio < 1) {
                    ratioColor = 'bg-red-500';
                    ratioText = 'Critical';
                  } else if (safetyRatio < 1.5) {
                    ratioColor = 'bg-amber-500';
                    ratioText = 'Nearing Safety';
                  }

                  return (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-700 block truncate">{item.name}</span>
                        <span className="text-slate-400 text-3xs uppercase">Unit: {item.unit}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono font-bold text-slate-600">{item.stock} / {item.minStock}</span>
                        <span className={`w-2 h-2 rounded-full ${ratioColor}`} title={ratioText}></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {editingItemStock && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-800 mb-2 flex items-center gap-1.5">
              <IconPlus className="w-6 h-6 text-brand-accent" strokeWidth={2.5} />
              Restock Material
            </h3>
            <p className="text-slate-500 text-xs mb-4">
              Add inventory stock for **{editingItemStock.name}** to ensure smooth scheduling and prevent outages.
            </p>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border flex justify-between text-sm">
                <div>
                  <span className="block text-slate-400 font-bold text-3xs uppercase tracking-wider">Current Stock</span>
                  <span className="font-mono text-base font-black text-slate-700">{editingItemStock.stock} {editingItemStock.unit}</span>
                </div>
                <div className="text-right">
                  <span className="block text-slate-400 font-bold text-3xs uppercase tracking-wider">Safety Limit</span>
                  <span className="font-mono text-base font-bold text-slate-500">{editingItemStock.minStock} {editingItemStock.unit}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Restock Volume / Quantity ({editingItemStock.unit})</label>
                <div className="relative">
                  <Input
                    label=""
                    name="restockAmount"
                    type="number"
                    value={restockAmount}
                    onChange={(e) => setRestockAmount(e.target.value)}
                    placeholder="Enter quantity"
                    className="pr-12"
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                    {editingItemStock.unit}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  type="button"
                  onClick={() => setEditingItemStock(null)}
                  className="bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-none border border-slate-200 font-bold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  disabled={savingStock || !restockAmount}
                  className="bg-brand-accent text-brand-blue hover:bg-yellow-500 font-bold px-5"
                >
                  {savingStock ? 'Updating...' : 'Add Stock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Material Details Modal */}
      {(isAddModalOpen || editingItemDetails !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-brand-blue text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-black text-lg tracking-tight">
                {editingItemDetails ? 'Edit Detailing Material' : 'Add Detailing Material'}
              </h3>
              <button 
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItemDetails(null);
                }}
                className="text-white/80 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveMaterialDetails} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Material Name *</label>
                <Input
                  label=""
                  name="materialName"
                  type="text"
                  required
                  placeholder="e.g. Microfibre Towel XL"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Material ID (slug) *</label>
                  <Input
                    label=""
                    name="materialId"
                    type="text"
                    required
                    disabled={editingItemDetails !== null}
                    placeholder="e.g. microfibre_towel_xl"
                    value={newMaterialId}
                    onChange={(e) => setNewMaterialId(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, ''))}
                  />
                  <p className="text-3xs text-slate-400">Unique alphanumeric & underscores</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Measurement Unit *</label>
                  <select
                    value={newMaterialUnit}
                    onChange={(e) => setNewMaterialUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-brand-accent focus:border-brand-accent focus:outline-none transition-all"
                  >
                    <option value="ml">ml (Milliliters)</option>
                    <option value="gm">gm (Grams)</option>
                    <option value="pcs">pcs (Pieces)</option>
                    <option value="units">units (Units)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Material Category *</label>
                <select
                  value={newMaterialCategory}
                  onChange={(e) => setNewMaterialCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm focus:ring-2 focus:ring-brand-accent focus:border-brand-accent focus:outline-none transition-all"
                >
                  <option value="Cleaning">Cleaning (shampoo, cloths, wax, sprays)</option>
                  <option value="Tyres">Tyres (tyres, tire shine, valves)</option>
                  <option value="Batteries">Batteries (batteries, acid, terminals)</option>
                  <option value="Mechanical/Spares">Mechanical/Spares (filters, engine oil, parts)</option>
                  <option value="Tools/Accessories">Tools/Accessories (brushes, microfiber towel XL, sprayers)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Current Stock</label>
                  <Input
                    label=""
                    name="materialStock"
                    type="number"
                    step="0.01"
                    value={newMaterialStock}
                    onChange={(e) => setNewMaterialStock(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Safety Level</label>
                  <Input
                    label=""
                    name="materialMinStock"
                    type="number"
                    step="0.01"
                    value={newMaterialMinStock}
                    onChange={(e) => setNewMaterialMinStock(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Cost/Unit (₹)</label>
                  <Input
                    label=""
                    name="materialCost"
                    type="number"
                    step="0.01"
                    value={newMaterialCostPerUnit}
                    onChange={(e) => setNewMaterialCostPerUnit(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingItemDetails(null);
                  }}
                  className="bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-none border border-slate-200 font-bold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  disabled={isSavingDetails || !newMaterialName}
                  className="bg-brand-accent text-brand-blue hover:bg-yellow-500 font-bold px-5"
                >
                  {isSavingDetails ? 'Saving...' : 'Save Material'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <IconAlertTriangle className="w-8 h-8" />
              <h3 className="font-black text-lg tracking-tight">Delete Material?</h3>
            </div>
            
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <span className="font-bold text-slate-800">{deletingItem.name}</span>? 
              This action will permanently remove it from the inventory database and cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => setDeletingItem(null)}
                className="bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-none border border-slate-200 font-bold"
              >
                No, Keep It
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteMaterial}
                className="bg-red-600 text-white hover:bg-red-700 font-bold px-5"
              >
                Yes, Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryForecastingPage;
