import { Service, User, Permission, ValidationErrors } from '../types';

export type { ValidationErrors };


// Helper to check if current user is an admin or manager with edit permission
const checkIsAdmin = (user?: User): boolean => {
  if (!user) return false;
  return user.role === 'admin' || 
         user.role === 'manager' || 
         user.permissions?.includes(Permission.CAN_EDIT_ANY_ORDER);
};

// Helper to normalize mobile numbers for validation purposes.
// It extracts the last 10 digits from any string.
const normalizeForValidation = (phone: string | number | undefined | null): string => {
  if (!phone) return '';
  const phoneString = String(phone);
  // Remove all non-digit characters
  const digitsOnly = phoneString.replace(/\D/g, '');
  // If the number is longer than 10 digits (e.g., includes a country code), take the last 10.
  if (digitsOnly.length > 10) {
    return digitsOnly.slice(-10);
  }
  return digitsOnly;
};


const PHONE_REGEX = /^\d{10}$/;

const validateCustomerDetails = (state: Service, currentUser?: User): ValidationErrors => {
  const errors: ValidationErrors = {};
  if (!state.customerFirstName.trim()) errors.customerFirstName = 'First name is required.';
  
  const mobileNumberStr = String(state.mobileNumber || '');
  const normalizedMobile = normalizeForValidation(mobileNumberStr);

  if (!mobileNumberStr.trim()) {
    errors.mobileNumber = 'Mobile number is required.';
  } else if (!PHONE_REGEX.test(normalizedMobile)) {
    errors.mobileNumber = 'Please enter a valid 10-digit mobile number. Prefixes like +91 are okay.';
  }

  if (!state.carBrandModel.trim() || !state.carBrandModel.includes(' - ')) {
    errors.carBrandModel = 'Please select both a car brand and a model.';
  }
  return errors;
};

const validateServiceSelection = (state: Service, currentUser?: User): ValidationErrors => {
  const errors: ValidationErrors = {};
  if (state.serviceSelection.length === 0) {
    errors.serviceSelection = 'At least one service must be selected.';
  }
  return errors;
};

const validateCarCare = (state: Service, currentUser?: User): ValidationErrors => {
  const errors: ValidationErrors = {};
  const isAdmin = checkIsAdmin(currentUser);

  if (!state.carCareDetails?.careType) {
    errors.careType = 'Please select a Car Care package.';
  }

  // Mandatory photo update for agents and sales team (non-admins)
  if (!isAdmin && state.carCareDetails?.careType) {
    if (!state.beforeWashingPhoto) {
      errors.beforeWashingPhoto = 'Inspection photo upload is mandatory for agents and sales team.';
    }
  }

  return errors;
};

const validateServiceDetails = (state: Service, currentUser?: User): ValidationErrors => {
  const errors: ValidationErrors = {};
  const isAdmin = checkIsAdmin(currentUser);

  if (state.serviceSelection.includes('Car Washing')) {
    const washQty = state.carwashQuantity ?? 1;
    if (washQty <= 0) {
      errors.carwashQuantity = 'Quantity for Car Washing must be at least 1.';
    }
    // Mandatory photo update for agents and sales team (non-admins)
    if (!isAdmin && !state.beforeWashingPhoto) {
      errors.beforeWashingPhoto = 'Inspection photo upload is mandatory for agents and sales team.';
    }
  }

  if (state.serviceSelection.includes('Tyre Replacement')) {
    if (state.tyreReplacementQuantity <= 0) {
        errors.tyreReplacementQuantity = 'Quantity for Tyre Replacement must be at least 1.';
    } else {
        const tyreErrors: Record<string, string>[] = [];
        state.tyreDetails.forEach((tyre, index) => {
            const singleTyreErrors: { [key: string]: string } = {};
            if (!tyre.dotCode.trim()) singleTyreErrors.dotCode = 'DOT Code is required.';
            if (!tyre.tyreSize.trim()) singleTyreErrors.tyreSize = 'Tyre Size is required.';
            // Mandatory photo update for agents and sales team (non-admins)
            if (!isAdmin && !tyre.dotSerialNumberImage) {
              singleTyreErrors.dotSerialNumberImage = 'DOT Serial Number photo is mandatory for agents and sales team.';
            }
            if (Object.keys(singleTyreErrors).length > 0) {
                tyreErrors[index] = singleTyreErrors;
            }
        });
        if (tyreErrors.length > 0) errors.tyreDetails = tyreErrors;
    }
  }
  
  if (state.serviceSelection.includes('Battery Replacement')) {
     if (state.batteryReplacementQuantity <= 0) {
        errors.batteryReplacementQuantity = 'Quantity for Battery Replacement must be at least 1.';
    } else {
        const batteryErrors: Record<string, string>[] = [];
        const batteries = Array.isArray(state.batteryDetails) ? state.batteryDetails : [];
        batteries.forEach((battery, index) => {
            const singleBatteryErrors: { [key: string]: string } = {};
            if (!battery?.serialNumber?.trim()) singleBatteryErrors.serialNumber = 'Serial Number is required.';
            if ((battery?.newBatteryAmount || 0) <= 0) singleBatteryErrors.newBatteryAmount = 'Amount must be greater than 0.';
            if (Object.keys(singleBatteryErrors).length > 0) {
                batteryErrors[index] = singleBatteryErrors;
            }
        });
        if (batteryErrors.length > 0) errors.batteryDetails = batteryErrors;
    }
  }

  return errors;
};

const validateAddons = (state: Service, currentUser?: User): ValidationErrors => {
    const errors: ValidationErrors = {};
    const addonErrors: Record<string, string>[] = [];
    const addons = Array.isArray(state.categorizedAddons) ? state.categorizedAddons : [];
    addons.forEach((addon, index) => {
        const singleAddonErrors: { [key: string]: string } = {};
        if (!addon?.productName?.trim()) singleAddonErrors.productName = 'Product name is required.';
        if ((addon?.quantity || 0) <= 0) singleAddonErrors.quantity = 'Qty must be > 0.';
        if ((addon?.amount || 0) <= 0) singleAddonErrors.amount = 'Amount must be > 0.';
        if (Object.keys(singleAddonErrors).length > 0) {
            addonErrors[index] = singleAddonErrors;
        }
    });
    if (addonErrors.length > 0) errors.categorizedAddons = addonErrors;
    return errors;
};

const validateCustomServices = (state: Service, currentUser?: User): ValidationErrors => {
    const errors: ValidationErrors = {};
    const serviceErrors: Record<string, string>[] = [];
    state.customServices.forEach((service, index) => {
        const singleServiceErrors: { [key: string]: string } = {};
        if (!service.serviceDescription.trim()) singleServiceErrors.serviceDescription = 'Description is required.';
        if (service.amount <= 0) singleServiceErrors.amount = 'Amount must be > 0.';
        if (Object.keys(singleServiceErrors).length > 0) {
            serviceErrors[index] = singleServiceErrors;
        }
    });
    if (serviceErrors.length > 0) errors.customServices = serviceErrors;
    return errors;
};


export const validateStep = (stepName: string, state: Service, currentUser?: User): ValidationErrors => {
  switch (stepName) {
    case 'Customer Details':
      return validateCustomerDetails(state, currentUser);
    case 'Service Selection':
      return validateServiceSelection(state, currentUser);
    case 'Car Care':
      return validateCarCare(state, currentUser);
    case 'Service Details':
      return validateServiceDetails(state, currentUser);
    case 'Add-ons':
      return validateAddons(state, currentUser);
    case 'Custom Services':
      return validateCustomServices(state, currentUser);
    default:
      return {};
  }
};
