import { Service, PredefinedService, InventoryItem, InventoryMovement } from '../types';

export interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

/**
 * Returns the default stock items for the inventory, utilizing standard quantities
 * and realistic units based on the user's requirements.
 */
export const getDefaultInventoryItems = (): InventoryItem[] => [
  { id: 'shampoo', name: 'Car Shampoo', stock: 2000, unit: 'ml', minStock: 200, costPerUnit: 0.5 },
  { id: 'trim_restorer', name: 'Trim Restorer', stock: 500, unit: 'ml', minStock: 50, costPerUnit: 1.2 },
  { id: 'tyre_shine', name: 'Tyre Shine', stock: 1000, unit: 'ml', minStock: 100, costPerUnit: 0.8 },
  { id: 'glass_cleaner', name: 'Glass Cleaner', stock: 1500, unit: 'ml', minStock: 150, costPerUnit: 0.4 },
  { id: 'compound_cream', name: 'Compound Cream', stock: 500, unit: 'gm', minStock: 50, costPerUnit: 2.0 },
  { id: 'microfibre_cloth', name: 'Microfibre Cloth', stock: 50, unit: 'pcs', minStock: 5, costPerUnit: 40.0 },
  { id: 'seal_shine_liquid', name: 'Seal & Shine Liquid', stock: 1000, unit: 'ml', minStock: 100, costPerUnit: 1.5 },
  { id: 'hybrid_spray', name: 'Hybrid Ceramic Spray', stock: 1000, unit: 'ml', minStock: 100, costPerUnit: 2.5 },
  { id: 'hybrid_wax', name: 'Hybrid Ceramic Wax', stock: 500, unit: 'gm', minStock: 50, costPerUnit: 3.5 }
];

/**
 * Parses freeform recipe text from the predefined service catalogue to extract 
 * ingredient consumption quantities.
 * Handles inputs like "30ml shampoo, 10ml trim restorer" dynamically and robustly.
 */
export function parseRecipeToIngredients(recipeText: string, knownItems?: InventoryItem[]): RecipeIngredient[] {
  if (!recipeText) return [];
  
  const ingredients: RecipeIngredient[] = [];
  // Clean up whitespace and standard punctuation to facilitate matching
  const lowercaseText = recipeText.toLowerCase().replace(/[\n\r,;]+/g, ' ');

  // Standard material mappings based on typical car care and detailing items
  let mappings = [
    { id: 'shampoo', name: 'Car Shampoo', unit: 'ml', keywords: ['shampoo', 'shampooo'] },
    { id: 'trim_restorer', name: 'Trim Restorer', unit: 'ml', keywords: ['trim restorer', 'trim_restorer'] },
    { id: 'tyre_shine', name: 'Tyre Shine', unit: 'ml', keywords: ['tyre shine', 'tyre_shine'] },
    { id: 'glass_cleaner', name: 'Glass Cleaner', unit: 'ml', keywords: ['glass cleaner', 'glass_cleaner'] },
    { id: 'compound_cream', name: 'Compound Cream', unit: 'gm', keywords: ['compound cream', 'compound_cream', 'compound'] },
    { id: 'microfibre_cloth', name: 'Microfibre Cloth', unit: 'pcs', keywords: ['microfibre cloth', 'micro fibre cloth', 'microfibre_cloth', 'cloth'] },
    { id: 'seal_shine_liquid', name: 'Seal & Shine Liquid', unit: 'ml', keywords: ['seal & shine', 'seal and shine', 'seal_shine_liquid', 'seal & shine liquid'] },
    { id: 'hybrid_spray', name: 'Hybrid Ceramic Spray', unit: 'ml', keywords: ['hybrid ceramic spray', 'hybrid_spray', 'ceramic spray'] },
    { id: 'hybrid_wax', name: 'Hybrid Ceramic Wax', unit: 'gm', keywords: ['hybrid ceramic wax', 'hybrid_wax', 'ceramic wax'] },
  ];

  if (knownItems && knownItems.length > 0) {
    mappings = knownItems.map(item => {
      const keywords = [
        item.id.toLowerCase().replace(/_/g, ' '),
        item.id.toLowerCase(),
        item.name.toLowerCase().replace(/_/g, ' '),
        item.name.toLowerCase(),
      ];
      // Filter unique non-empty keywords
      const uniqueKeywords = Array.from(new Set(keywords.filter(Boolean)));
      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        keywords: uniqueKeywords
      };
    });
  }

  for (const map of mappings) {
    for (const keyword of map.keywords) {
      const idx = lowercaseText.indexOf(keyword);
      if (idx !== -1) {
        // Examine characters around the keyword for numbers and units
        const beforeText = lowercaseText.substring(Math.max(0, idx - 20), idx);
        const afterText = lowercaseText.substring(idx + keyword.length, Math.min(lowercaseText.length, idx + keyword.length + 20));
        
        const numRegex = /(\d+(\.\d+)?)\s*(ml|gm|g|pcs|pc|units|unit)?/i;
        const matchAfter = afterText.match(numRegex);
        const matchBefore = beforeText.match(/(\d+(\.\d+)?)\s*(ml|gm|g|pcs|pc|units|unit)?\s*$/i);
        
        let qty = 1; // Default fallback
        if (matchAfter) {
          qty = parseFloat(matchAfter[1]);
        } else if (matchBefore) {
          qty = parseFloat(matchBefore[1]);
        } else {
          // Defaults if the item is listed but without specified qty
          qty = map.unit === 'pcs' ? 1 : 10;
        }
        
        ingredients.push({
          itemId: map.id,
          itemName: map.name,
          quantity: qty,
          unit: map.unit
        });
        break; // Match found, move to next item
      }
    }
  }

  return ingredients;
}

/**
 * Automates inventory stock depletion when a service is completed.
 * It detects the recipes used in the order, calculates stock changes,
 * creates transaction movement logs, and persists changes to the cloud.
 */
export async function depleteInventoryForCompletedService(
  service: Service,
  predefinedServices: PredefinedService[],
  currentItems: InventoryItem[],
  onSaveRecord: (sheetName: string, record: any) => Promise<any>
): Promise<{ updatedItems: InventoryItem[]; movements: InventoryMovement[] }> {
  const updatedItems = [...currentItems];
  const movements: InventoryMovement[] = [];
  const serviceSelection = service.serviceSelection || [];

  if (serviceSelection.length === 0) {
    return { updatedItems, movements };
  }

  console.log(`🧪 [Inventory] Checking stock depletion for job ${service.submissionId}...`);

  for (const selectionName of serviceSelection) {
    // Find the predefined service matching this selected item
    const matchedService = predefinedServices.find(
      s => s.name.trim().toLowerCase() === selectionName.trim().toLowerCase()
    );

    if (matchedService && matchedService.recipe) {
      const ingredients = parseRecipeToIngredients(matchedService.recipe, currentItems);
      
      for (const ingredient of ingredients) {
        const itemIdx = updatedItems.findIndex(i => i.id === ingredient.itemId);
        
        if (itemIdx !== -1) {
          const item = updatedItems[itemIdx];
          const newStock = Math.max(0, Number((item.stock - ingredient.quantity).toFixed(2)));
          
          const updatedItem = {
            ...item,
            stock: newStock
          };
          updatedItems[itemIdx] = updatedItem;

          const movementId = `mvt_dep_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const movement: InventoryMovement = {
            id: movementId,
            itemId: ingredient.itemId,
            itemName: ingredient.itemName,
            change: -ingredient.quantity,
            unit: ingredient.unit,
            reason: `Auto-consumption: Job #${service.submissionId} (${selectionName})`,
            timestamp: new Date().toISOString()
          };

          movements.push(movement);

          // Save to database
          try {
            await onSaveRecord('InventoryItems', updatedItem);
            await onSaveRecord('InventoryMovements', movement);
            console.log(`✅ [Inventory] Depleted ${ingredient.quantity}${ingredient.unit} of ${ingredient.itemName} for ${selectionName}`);
          } catch (err) {
            console.error(`❌ [Inventory] Failed to save updated stock for ${ingredient.itemName}:`, err);
          }
        }
      }
    }
  }

  return { updatedItems, movements };
}
