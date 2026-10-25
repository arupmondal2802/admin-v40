import React, { useState, useMemo } from 'react';
import { RecipeItem, InventoryItem } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { 
  IconPlus, 
  IconTrash, 
  IconSearch, 
  IconSparkles, 
  IconClock, 
  IconCheck, 
  IconChevronUp, 
  IconChevronDown 
} from '../ui/Icon';
import { triggerHapticFeedback } from '../../services/hapticService';

// Default labor unit presets available for quick bundling
const DEFAULT_LABOR_PRESETS: Array<{ id: string; name: string; unit: string; costPerUnit: number; minutes: number }> = [
  { id: 'labor_tech_std', name: 'Standard Technician Labor', unit: 'hrs', costPerUnit: 250, minutes: 60 },
  { id: 'labor_wash_prep', name: 'Washing & Foam Spray Labor', unit: 'units', costPerUnit: 120, minutes: 30 },
  { id: 'labor_polishing_buff', name: 'Polish & Machine Buffing Labor', unit: 'hrs', costPerUnit: 450, minutes: 90 },
  { id: 'labor_alignment_bal', name: 'Wheel Alignment & Balancing Labor', unit: 'units', costPerUnit: 350, minutes: 45 },
  { id: 'labor_interior_spa', name: 'Deep Interior Vacuum & Steam Labor', unit: 'hrs', costPerUnit: 300, minutes: 60 },
  { id: 'labor_battery_install', name: 'Battery Installation & Test Labor', unit: 'units', costPerUnit: 150, minutes: 20 },
  { id: 'labor_oil_filter_change', name: 'Oil & Filter Replacement Labor', unit: 'units', costPerUnit: 200, minutes: 30 },
  { id: 'labor_electrical_diag', name: 'Electrical & Scanner Diagnostic', unit: 'hrs', costPerUnit: 500, minutes: 45 },
];

// Quick Prebuilt Recipe Bundles for 1-click loading
const QUICK_RECIPE_PRESETS = [
  {
    name: 'Full Synthetic Oil Service Spa',
    bundlePrice: 2850,
    laborMinutes: 60,
    items: [
      { type: 'PRODUCT' as const, name: 'Engine Oil Synthetic 5W-30', quantity: 4, unit: 'L', costPerUnit: 420, notes: 'Grade 5W-30 Synthetic' },
      { type: 'PRODUCT' as const, name: 'Oil Filter Cartridge', quantity: 1, unit: 'pcs', costPerUnit: 180, notes: 'OEM Specification' },
      { type: 'PRODUCT' as const, name: 'Car Shampoo', quantity: 50, unit: 'ml', costPerUnit: 0.5, notes: 'Foam wash prep' },
      { type: 'LABOR' as const, name: 'Oil & Filter Replacement Labor', quantity: 1, unit: 'units', costPerUnit: 200, notes: 'Torque drain plug to spec' },
      { type: 'LABOR' as const, name: 'Standard Technician Labor', quantity: 0.5, unit: 'hrs', costPerUnit: 250, notes: 'Multi-point inspection' },
    ]
  },
  {
    name: 'Full Exterior Wash & Polish Wax',
    bundlePrice: 1450,
    laborMinutes: 75,
    items: [
      { type: 'PRODUCT' as const, name: 'Car Shampoo', quantity: 100, unit: 'ml', costPerUnit: 0.5, notes: 'High-foam snow cannon' },
      { type: 'PRODUCT' as const, name: 'Tyre Shine', quantity: 40, unit: 'ml', costPerUnit: 0.8, notes: 'Coat 4 tyres evenly' },
      { type: 'PRODUCT' as const, name: 'Hybrid Ceramic Wax', quantity: 30, unit: 'gm', costPerUnit: 3.5, notes: 'Hand buff' },
      { type: 'PRODUCT' as const, name: 'Microfibre Cloth', quantity: 2, unit: 'pcs', costPerUnit: 40, notes: 'Scratch-free drying' },
      { type: 'LABOR' as const, name: 'Washing & Foam Spray Labor', quantity: 1, unit: 'units', costPerUnit: 120, notes: 'High pressure wash' },
      { type: 'LABOR' as const, name: 'Polish & Machine Buffing Labor', quantity: 0.75, unit: 'hrs', costPerUnit: 450, notes: 'Orbital machine buff' },
    ]
  },
  {
    name: '4-Wheel Alignment & Balancing Bundle',
    bundlePrice: 1200,
    laborMinutes: 45,
    items: [
      { type: 'PRODUCT' as const, name: 'Wheel Balance Weights', quantity: 4, unit: 'pcs', costPerUnit: 25, notes: 'Zinc stick-on weights' },
      { type: 'LABOR' as const, name: 'Wheel Alignment & Balancing Labor', quantity: 1, unit: 'units', costPerUnit: 350, notes: '3D Laser Camera Calibration' },
    ]
  }
];

interface Props {
  recipeItems: RecipeItem[];
  onChangeRecipe: (items: RecipeItem[], bundlePrice?: number, laborMinutes?: number) => void;
  inventoryItems?: InventoryItem[];
  initialBundlePrice?: number;
  initialLaborMinutes?: number;
}

export const ServiceRecipeBuilder: React.FC<Props> = ({
  recipeItems = [],
  onChangeRecipe,
  inventoryItems = [],
  initialBundlePrice,
  initialLaborMinutes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PRODUCTS' | 'LABOR' | 'PRESETS'>('ALL');
  const [isDraggingOverCanvas, setIsDraggingOverCanvas] = useState(false);
  const [targetMarginPercentage, setTargetMarginPercentage] = useState<number>(35);
  const [bundlePriceOverride, setBundlePriceOverride] = useState<number | undefined>(initialBundlePrice);
  const [laborMinutes, setLaborMinutes] = useState<number>(initialLaborMinutes || 45);
  const [draggedCanvasIndex, setDraggedCanvasIndex] = useState<number | null>(null);

  // Modal / Creator State
  const [showCustomCreator, setShowCustomCreator] = useState(false);
  const [customType, setCustomType] = useState<'PRODUCT' | 'LABOR'>('PRODUCT');
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState<number>(1);
  const [customUnit, setCustomUnit] = useState('pcs');
  const [customCost, setCustomCost] = useState<number>(100);

  // Combine inventory items with standard items
  const availableProducts = useMemo(() => {
    const list: Array<{ id: string; name: string; unit: string; costPerUnit: number; stock?: number }> = [];
    
    // Add real inventory items
    inventoryItems.forEach(inv => {
      list.push({
        id: inv.id,
        name: inv.name,
        unit: inv.unit || 'pcs',
        costPerUnit: inv.costPerUnit || 10,
        stock: inv.stock
      });
    });

    // Fallbacks if inventory is empty
    if (list.length === 0) {
      list.push(
        { id: 'prod_shampoo', name: 'Car Shampoo', unit: 'ml', costPerUnit: 0.5 },
        { id: 'prod_tyreshine', name: 'Tyre Shine Dressing', unit: 'ml', costPerUnit: 0.8 },
        { id: 'prod_microfiber', name: 'Microfiber Towel', unit: 'pcs', costPerUnit: 40 },
        { id: 'prod_engine_oil', name: 'Engine Oil Synthetic 5W-30', unit: 'L', costPerUnit: 420 },
        { id: 'prod_oil_filter', name: 'Oil Filter Cartridge', unit: 'pcs', costPerUnit: 180 },
        { id: 'prod_compound', name: 'Rubbing Compound Paste', unit: 'gm', costPerUnit: 2.0 },
        { id: 'prod_ceramic_wax', name: 'Hybrid Ceramic Wax', unit: 'gm', costPerUnit: 3.5 },
        { id: 'prod_brake_fluid', name: 'DOT 4 Brake Fluid', unit: 'ml', costPerUnit: 1.2 }
      );
    }
    return list;
  }, [inventoryItems]);

  // Filter available items based on tab & query
  const filteredLibrary = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const products = availableProducts
      .filter(p => !query || p.name.toLowerCase().includes(query) || p.unit.toLowerCase().includes(query))
      .map(p => ({
        type: 'PRODUCT' as const,
        id: `lib_prod_${p.id}`,
        inventoryItemId: p.id,
        name: p.name,
        unit: p.unit,
        costPerUnit: p.costPerUnit,
        stock: p.stock
      }));

    const labor = DEFAULT_LABOR_PRESETS
      .filter(l => !query || l.name.toLowerCase().includes(query) || l.unit.toLowerCase().includes(query))
      .map(l => ({
        type: 'LABOR' as const,
        id: `lib_lab_${l.id}`,
        name: l.name,
        unit: l.unit,
        costPerUnit: l.costPerUnit,
        minutes: l.minutes
      }));

    if (activeTab === 'PRODUCTS') return products;
    if (activeTab === 'LABOR') return labor;
    return [...products, ...labor];
  }, [availableProducts, searchQuery, activeTab]);

  // Calculations
  const { totalMaterialCost, totalLaborCost, totalRecipeCost } = useMemo(() => {
    let material = 0;
    let labor = 0;
    recipeItems.forEach(item => {
      const lineCost = (item.quantity || 0) * (item.costPerUnit || 0);
      if (item.type === 'PRODUCT') material += lineCost;
      else labor += lineCost;
    });
    return {
      totalMaterialCost: material,
      totalLaborCost: labor,
      totalRecipeCost: material + labor
    };
  }, [recipeItems]);

  // Suggested Retail Price calculation
  const suggestedRetailPrice = useMemo(() => {
    if (totalRecipeCost <= 0) return 0;
    // Price = Cost / (1 - Margin%)
    const marginDec = Math.min(0.9, Math.max(0, targetMarginPercentage / 100));
    return Math.round(totalRecipeCost / (1 - marginDec));
  }, [totalRecipeCost, targetMarginPercentage]);

  const activeSellingPrice = bundlePriceOverride !== undefined ? bundlePriceOverride : suggestedRetailPrice;
  const netProfit = activeSellingPrice - totalRecipeCost;
  const netProfitMarginPct = activeSellingPrice > 0 ? Math.round((netProfit / activeSellingPrice) * 100) : 0;

  // Add Item to Recipe
  const handleAddItemToRecipe = (item: {
    type: 'PRODUCT' | 'LABOR';
    name: string;
    unit: string;
    costPerUnit: number;
    inventoryItemId?: string;
    notes?: string;
  }) => {
    triggerHapticFeedback('light');
    const newItem: RecipeItem = {
      id: `recipe_item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: item.type,
      name: item.name,
      quantity: item.type === 'PRODUCT' ? (item.unit === 'ml' || item.unit === 'gm' ? 50 : 1) : 1,
      unit: item.unit,
      costPerUnit: item.costPerUnit,
      inventoryItemId: item.inventoryItemId,
      notes: item.notes || ''
    };

    const updated = [...recipeItems, newItem];
    onChangeRecipe(updated, bundlePriceOverride, laborMinutes);
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    triggerHapticFeedback('light');
    const updated = recipeItems.filter(i => i.id !== id);
    onChangeRecipe(updated, bundlePriceOverride, laborMinutes);
  };

  // Update Item Field
  const handleUpdateItemField = (id: string, field: keyof RecipeItem, value: any) => {
    const updated = recipeItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChangeRecipe(updated, bundlePriceOverride, laborMinutes);
  };

  // Load Quick Preset
  const handleLoadPreset = (preset: typeof QUICK_RECIPE_PRESETS[0]) => {
    triggerHapticFeedback('success');
    const items: RecipeItem[] = preset.items.map((it, idx) => ({
      id: `recipe_preset_${Date.now()}_${idx}`,
      type: it.type,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      costPerUnit: it.costPerUnit,
      notes: it.notes
    }));
    setBundlePriceOverride(preset.bundlePrice);
    setLaborMinutes(preset.laborMinutes);
    onChangeRecipe(items, preset.bundlePrice, preset.laborMinutes);
  };

  // Clear Canvas
  const handleClearRecipe = () => {
    if (recipeItems.length === 0) return;
    if (window.confirm('Clear all items from this bundle recipe?')) {
      triggerHapticFeedback('light');
      onChangeRecipe([], undefined, 30);
      setBundlePriceOverride(undefined);
    }
  };

  // Drag and Drop Event Handlers
  const handleLibraryDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      source: 'LIBRARY',
      data: item
    }));
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingOverCanvas) setIsDraggingOverCanvas(true);
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverCanvas(false);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverCanvas(false);
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const parsed = JSON.parse(rawData);

      if (parsed.source === 'LIBRARY') {
        handleAddItemToRecipe(parsed.data);
      } else if (parsed.source === 'REORDER' && typeof parsed.index === 'number') {
        // Reordering within canvas handled via drag drop
      }
    } catch (err) {
      console.error('Failed to parse drag drop data:', err);
    }
  };

  // Canvas Item Reordering
  const handleCanvasItemDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCanvasIndex(index);
    e.dataTransfer.setData('application/json', JSON.stringify({
      source: 'REORDER',
      index
    }));
  };

  const handleCanvasItemDropOnItem = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedCanvasIndex === null || draggedCanvasIndex === targetIndex) return;

    const newItems = [...recipeItems];
    const [moved] = newItems.splice(draggedCanvasIndex, 1);
    newItems.splice(targetIndex, 0, moved);
    setDraggedCanvasIndex(null);
    onChangeRecipe(newItems, bundlePriceOverride, laborMinutes);
  };

  // Custom Item Submission
  const handleAddCustomItem = () => {
    if (!customName.trim()) return;
    handleAddItemToRecipe({
      type: customType,
      name: customName.trim(),
      unit: customUnit,
      costPerUnit: customCost
    });
    setCustomName('');
    setShowCustomCreator(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-blue to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-slate-700/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500/20 text-brand-accent rounded-xl border border-amber-500/30">
                <IconSparkles className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight">Interactive Service Recipe Builder</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Drag and drop material products and labor units to compose dynamic service bundles. Automatically calculates live material costs, labor overheads, target retail margins, and technician instructions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCustomCreator(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white border-slate-600 text-xs font-semibold"
            >
              <IconPlus className="w-4 h-4 mr-1 text-brand-accent" /> Custom Product / Labor
            </Button>
            {recipeItems.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleClearRecipe}
                className="text-xs font-semibold"
              >
                <IconTrash className="w-4 h-4 mr-1" /> Clear Bundle
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Library (Left) vs Canvas (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Library & Palette */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Resource Library
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Drag or click +
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <IconSearch className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search products or labor..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
                />
              </div>

              {/* Tabs */}
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('ALL')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    activeTab === 'ALL'
                      ? 'bg-white dark:bg-slate-800 text-brand-blue dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  All ({filteredLibrary.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('PRODUCTS')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    activeTab === 'PRODUCTS'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Products
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('LABOR')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    activeTab === 'LABOR'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Labor
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('PRESETS')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    activeTab === 'PRESETS'
                      ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Presets
                </button>
              </div>

              {/* Library Scroll Container */}
              {activeTab === 'PRESETS' ? (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Load 1-click prebuilt service recipes to instantly populate your bundle canvas:
                  </p>
                  {QUICK_RECIPE_PRESETS.map((preset, idx) => (
                    <div
                      key={`preset_${idx}`}
                      className="p-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl hover:border-amber-500 transition-all cursor-pointer"
                      onClick={() => handleLoadPreset(preset)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {preset.name}
                        </span>
                        <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                          ₹{preset.bundlePrice}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                        {preset.items.length} items • Est. {preset.laborMinutes} mins
                      </p>
                      <Button size="sm" variant="secondary" className="w-full text-xs font-bold py-1">
                        <IconSparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Apply This Recipe
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredLibrary.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No matching products or labor units found.
                    </div>
                  ) : (
                    filteredLibrary.map(item => {
                      const isProduct = item.type === 'PRODUCT';
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => handleLibraryDragStart(e, item)}
                          className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing hover:shadow-md ${
                            isProduct
                              ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/50'
                              : 'bg-indigo-500/5 border-indigo-500/20 hover:border-indigo-500/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`p-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-center min-w-[28px] ${
                                isProduct
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                              }`}
                            >
                              {isProduct ? 'PR' : 'LB'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {item.name}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span>Unit: <strong className="text-slate-700 dark:text-slate-300">{item.unit}</strong></span>
                                <span>• Rate: <strong className="text-slate-700 dark:text-slate-300">₹{item.costPerUnit}</strong></span>
                                {isProduct && 'stock' in item && item.stock !== undefined && (
                                  <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                                    item.stock <= 0 ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                                    item.stock <= 10 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                    'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    {item.stock <= 0 ? 'Out of Stock' : item.stock <= 10 ? `Low: ${item.stock} ${item.unit}` : `In Stock: ${item.stock} ${item.unit}`}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddItemToRecipe(item)}
                            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-brand-accent hover:border-brand-accent hover:text-slate-900 rounded-lg text-slate-600 dark:text-slate-300 font-bold transition-all shadow-2xs flex-shrink-0"
                            title="Add to Recipe Canvas"
                          >
                            <IconPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Canvas & Recipe Target Zone */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span>Service Recipe Canvas</span>
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-brand-blue text-white">
                      {recipeItems.length} items
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Drop items here from the library to compose your bundle recipe.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                    <IconClock className="w-3.5 h-3.5 text-brand-accent" />
                    <span>Est. Time:</span>
                    <input
                      type="number"
                      min="5"
                      max="480"
                      value={laborMinutes}
                      onChange={e => {
                        const mins = Math.max(5, parseInt(e.target.value) || 0);
                        setLaborMinutes(mins);
                        onChangeRecipe(recipeItems, bundlePriceOverride, mins);
                      }}
                      className="w-12 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 text-center font-bold text-xs"
                    />
                    <span>mins</span>
                  </div>
                </div>
              </div>

              {/* Drop Target Canvas Container */}
              <div
                onDragOver={handleCanvasDragOver}
                onDragLeave={handleCanvasDragLeave}
                onDrop={handleCanvasDrop}
                className={`min-h-[260px] p-4 rounded-2xl border-2 border-dashed transition-all space-y-3 ${
                  isDraggingOverCanvas
                    ? 'border-brand-accent bg-amber-500/10 scale-[1.01]'
                    : recipeItems.length === 0
                    ? 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                }`}
              >
                {recipeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-2">
                    <div className="p-3 bg-slate-200/60 dark:bg-slate-800/60 rounded-full">
                      <IconPlus className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      Recipe Canvas is Empty
                    </p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Drag products & labor units from the left resource library or click quick preset bundles to build this service recipe.
                    </p>
                  </div>
                ) : (
                  recipeItems.map((item, index) => {
                    const isProduct = item.type === 'PRODUCT';
                    const lineCost = (item.quantity || 0) * (item.costPerUnit || 0);

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={e => handleCanvasItemDragStart(e, index)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleCanvasItemDropOnItem(e, index)}
                        className={`p-3 rounded-xl border bg-white dark:bg-slate-900 shadow-2xs transition-all space-y-2.5 ${
                          isProduct
                            ? 'border-emerald-500/30 hover:border-emerald-500/60'
                            : 'border-indigo-500/30 hover:border-indigo-500/60'
                        }`}
                      >
                        {/* Line 1: Type, Title, Unit Cost, Line Total, Remove */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                              ⋮⋮
                            </span>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                isProduct
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                              }`}
                            >
                              {item.type}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {item.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right leading-none">
                              <span className="text-[10px] text-slate-400 block">Line Total</span>
                              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                                ₹{lineCost.toFixed(2)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Remove item"
                            >
                              <IconTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Line 2: Quantity, Unit, Cost per unit */}
                        <div className="grid grid-cols-12 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div className="col-span-5 flex items-center gap-1">
                            <span className="text-[10px] font-semibold text-slate-500">Qty:</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateItemField(item.id, 'quantity', Math.max(0.1, Number((item.quantity - 1).toFixed(2))))
                              }
                              className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              step="0.1"
                              min="0.01"
                              value={item.quantity}
                              onChange={e =>
                                handleUpdateItemField(item.id, 'quantity', Math.max(0, parseFloat(e.target.value) || 0))
                              }
                              className="w-14 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 text-center font-bold text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateItemField(item.id, 'quantity', Number((item.quantity + 1).toFixed(2)))
                              }
                              className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                            >
                              +
                            </button>
                          </div>

                          <div className="col-span-3 flex items-center gap-1">
                            <span className="text-[10px] font-semibold text-slate-500">Unit:</span>
                            <select
                              value={item.unit}
                              onChange={e => handleUpdateItemField(item.id, 'unit', e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 font-semibold text-xs text-slate-700 dark:text-slate-300"
                            >
                              <option value="pcs">pcs</option>
                              <option value="ml">ml</option>
                              <option value="L">L</option>
                              <option value="gm">gm</option>
                              <option value="kg">kg</option>
                              <option value="hrs">hrs</option>
                              <option value="units">units</option>
                              <option value="sets">sets</option>
                            </select>
                          </div>

                          <div className="col-span-4 flex items-center gap-1 justify-end">
                            <span className="text-[10px] font-semibold text-slate-500">Rate ₹:</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={item.costPerUnit}
                              onChange={e =>
                                handleUpdateItemField(item.id, 'costPerUnit', Math.max(0, parseFloat(e.target.value) || 0))
                              }
                              className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 text-right font-bold text-xs"
                            />
                          </div>
                        </div>

                        {/* Line 3: Tech Note input & Stock Item Link Dropdown */}
                        <div className="space-y-1.5 pt-1">
                          {isProduct && (
                            <div className="flex items-center gap-2 bg-slate-100/70 dark:bg-slate-950/80 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] font-bold text-slate-500 uppercase flex-shrink-0">Linked Stock:</span>
                              <select
                                value={item.inventoryItemId || ''}
                                onChange={(e) => {
                                  const selectedInvId = e.target.value;
                                  const matched = availableProducts.find(p => p.id === selectedInvId);
                                  if (matched) {
                                    handleUpdateItemField(item.id, 'inventoryItemId', matched.id);
                                    handleUpdateItemField(item.id, 'name', matched.name);
                                    handleUpdateItemField(item.id, 'unit', matched.unit || 'ml');
                                    handleUpdateItemField(item.id, 'costPerUnit', matched.costPerUnit || 0);
                                  } else {
                                    handleUpdateItemField(item.id, 'inventoryItemId', undefined);
                                  }
                                }}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand-accent"
                              >
                                <option value="">-- Choose Material from Available Stock --</option>
                                {availableProducts.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.stock !== undefined ? `(Stock: ${p.stock} ${p.unit})` : ''} - ₹{p.costPerUnit}/{p.unit}
                                  </option>
                                ))}
                              </select>
                              {item.inventoryItemId && (() => {
                                const matched = availableProducts.find(p => p.id === item.inventoryItemId);
                                if (!matched || matched.stock === undefined) return null;
                                const isOut = matched.stock <= 0;
                                const isLow = matched.stock <= 10;
                                return (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${
                                    isOut ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' :
                                    isLow ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                                    'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                  }`}>
                                    {isOut ? 'Out of Stock' : isLow ? `Low: ${matched.stock} ${matched.unit}` : `In Stock: ${matched.stock} ${matched.unit}`}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          <input
                            type="text"
                            placeholder="Technician instruction note (e.g. 'Use 4.5L synthetic oil')"
                            value={item.notes || ''}
                            onChange={e => handleUpdateItemField(item.id, 'notes', e.target.value)}
                            className="w-full bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-accent/40"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Financial & Cost Breakdown Metrics Card */}
              {recipeItems.length > 0 && (
                <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Material Cost
                      </span>
                      <span className="text-sm font-extrabold text-emerald-400">
                        ₹{totalMaterialCost.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Labor Cost
                      </span>
                      <span className="text-sm font-extrabold text-indigo-400">
                        ₹{totalLaborCost.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Total Recipe Cost
                      </span>
                      <span className="text-sm font-black text-amber-400">
                        ₹{totalRecipeCost.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Est. Time
                      </span>
                      <span className="text-sm font-extrabold text-slate-200">
                        {laborMinutes} mins
                      </span>
                    </div>
                  </div>

                  {/* Markup Slider & Bundle Selling Price Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    <div className="sm:col-span-6 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-medium">Target Profit Margin:</span>
                        <span className="font-bold text-brand-accent">{targetMarginPercentage}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="80"
                        step="5"
                        value={targetMarginPercentage}
                        onChange={e => setTargetMarginPercentage(parseInt(e.target.value))}
                        className="w-full accent-brand-accent cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">
                        Suggested Retail: <span className="font-bold text-white">₹{suggestedRetailPrice}</span>
                      </p>
                    </div>

                    <div className="sm:col-span-6 bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Bundle Price Override
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-sm font-extrabold text-brand-accent">₹</span>
                          <input
                            type="number"
                            placeholder={String(suggestedRetailPrice)}
                            value={bundlePriceOverride !== undefined ? bundlePriceOverride : ''}
                            onChange={e => {
                              const val = e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value));
                              setBundlePriceOverride(val);
                              onChangeRecipe(recipeItems, val, laborMinutes);
                            }}
                            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-sm font-extrabold text-white text-right focus:ring-1 focus:ring-brand-accent/50"
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Net Margin
                        </span>
                        <span
                          className={`inline-block mt-0.5 text-xs font-black px-2.5 py-0.5 rounded-full border ${
                            netProfitMarginPct >= 25
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : netProfitMarginPct >= 10
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          +₹{netProfit.toFixed(0)} ({netProfitMarginPct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal for adding custom products or labor */}
      {showCustomCreator && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                Add Custom Product or Labor Unit
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomCreator(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Resource Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomType('PRODUCT')}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      customType === 'PRODUCT'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300'
                    }`}
                  >
                    Product / Material
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomType('LABOR')}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      customType === 'LABOR'
                        ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300'
                    }`}
                  >
                    Labor / Work Unit
                  </button>
                </div>
              </div>

              <Input
                label="Resource Name"
                id="customName"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder={customType === 'PRODUCT' ? 'e.g., Synthetic Gear Oil' : 'e.g., Transmission Inspection'}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Unit
                  </label>
                  <select
                    value={customUnit}
                    onChange={e => setCustomUnit(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <option value="pcs">pcs</option>
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                    <option value="gm">gm</option>
                    <option value="kg">kg</option>
                    <option value="hrs">hrs</option>
                    <option value="units">units</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Cost per Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={customCost}
                    onChange={e => setCustomCost(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" size="sm" onClick={() => setShowCustomCreator(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddCustomItem} disabled={!customName.trim()}>
                Add to Bundle Recipe
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceRecipeBuilder;
