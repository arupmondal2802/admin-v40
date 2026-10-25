import { VehicleCategoryTag } from '../types';

/**
 * Determines the vehicle category tag based on the car's brand and model string.
 * This uses a set of keywords and heuristics based on the provided examples.
 * @param carBrandModel The full string of the car's brand and model (e.g., "Maruti Suzuki Swift").
 * @returns The determined VehicleCategoryTag. Defaults to Hatch.
 */
export const getCategoryForVehicle = (carBrandModel: string): VehicleCategoryTag => {
    const model = carBrandModel.toLowerCase();

    // Luxury brands
    if (model.includes('audi') || model.includes('mercedes') || model.includes('bmw') || model.includes('jaguar') || model.includes('land rover') || model.includes('porsche') || model.includes('lexus') || model.includes('volvo')) {
        return VehicleCategoryTag.Luxury;
    }

    // SUVs
    if (model.includes('scorpio') || model.includes('fortuner') || model.includes('endeavour') || model.includes('xuv700') || model.includes('gloster') || model.includes('safari') || model.includes('harrier')) {
        return VehicleCategoryTag.Suv;
    }

    // Crossovers
    if (model.includes('nexon') || model.includes('triber') || model.includes('ertiga') || model.includes('xylo') || model.includes('brezza') || model.includes('creta') || model.includes('seltos') || model.includes('sonet') || model.includes('venue') || model.includes('xuv300') || model.includes('kiger')) {
        return VehicleCategoryTag.CrossOver;
    }
    
    // Prime Sedans
    if (model.includes('verna') || model.includes('city') || model.includes('vento') || model.includes('virtus') || model.includes('ciaz') || model.includes('slavia') || model.includes('octavia') || model.includes('elantra')) {
        return VehicleCategoryTag.Prime;
    }

    // Micro cars
    if (model.includes('omni') || model.includes('alto') || model.includes('kwid') || model.includes('s-presso') || model.includes('nano')) {
        return VehicleCategoryTag.Micro;
    }

    // Hatchbacks (default for many common cars)
    if (model.includes('dzire') || model.includes('alroz') || model.includes('punch') || model.includes('i20') || model.includes('swift') || model.includes('baleno') || model.includes('glanza') || model.includes('tiago') || model.includes('figo') || model.includes('polo')) {
        return VehicleCategoryTag.Hatch;
    }
    
    // Default fallback
    return VehicleCategoryTag.Hatch;
};
