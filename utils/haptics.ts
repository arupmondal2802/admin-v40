/**
 * Android & Mobile Haptic Feedback Engine
 * Utilizes the W3C Vibration API (navigator.vibrate) with custom vibration patterns
 * specifically optimized for Android and mobile web devices.
 */

export type HapticFeedbackType = 
  | 'light' 
  | 'selection' 
  | 'medium' 
  | 'heavy' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'start' 
  | 'notification';

const HAPTIC_STORAGE_KEY = 'app_haptics_enabled';

// Vibration patterns (duration in ms or [vibrate, pause, vibrate, ...])
const HAPTIC_PATTERNS: Record<HapticFeedbackType, number | number[]> = {
  light: 12,
  selection: 15,
  medium: 28,
  heavy: 45,
  success: [15, 50, 30],
  warning: [30, 60, 30],
  error: [45, 60, 45, 60, 45],
  start: [20, 40, 25],
  notification: [30, 80, 30, 80, 50],
};

/**
 * Check if the current browser and platform support the Vibration API
 */
export const isHapticsSupported = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return typeof navigator.vibrate === 'function';
};

/**
 * Detect if current device is running Android
 */
export const isAndroidDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /android/i.test(userAgent);
};

/**
 * Detect if device has touch capabilities
 */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0);
};

/**
 * Check whether haptic feedback is currently enabled by the user
 */
export const isHapticsEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(HAPTIC_STORAGE_KEY);
    // Enabled by default unless explicitly set to 'false'
    return saved !== 'false';
  } catch {
    return true;
  }
};

/**
 * Enable or disable haptic feedback globally
 */
export const setHapticsEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HAPTIC_STORAGE_KEY, enabled ? 'true' : 'false');
    // Dispatch custom event so listeners/components re-render
    window.dispatchEvent(new CustomEvent('app_haptics_changed', { detail: { enabled } }));
  } catch (e) {
    console.warn('Failed to save haptics preference:', e);
  }
};

// Throttle vibrations to prevent rapid-fire stacking
let lastVibrationTimestamp = 0;
const MIN_VIBRATION_INTERVAL_MS = 35;

/**
 * Trigger a haptic feedback vibration
 * Safe to call anywhere - silently no-ops if not supported or disabled.
 */
export const triggerHaptic = (type: HapticFeedbackType = 'light'): boolean => {
  if (!isHapticsSupported() || !isHapticsEnabled()) {
    return false;
  }

  const now = Date.now();
  if (now - lastVibrationTimestamp < MIN_VIBRATION_INTERVAL_MS) {
    return false;
  }
  lastVibrationTimestamp = now;

  try {
    const pattern = HAPTIC_PATTERNS[type] ?? 15;
    return navigator.vibrate(pattern);
  } catch (err) {
    // Some browsers might throw security exceptions if not initiated from a user gesture
    console.debug('Haptics trigger skipped:', err);
    return false;
  }
};

/**
 * Helper object with direct method calls
 */
export const haptic = {
  light: () => triggerHaptic('light'),
  selection: () => triggerHaptic('selection'),
  medium: () => triggerHaptic('medium'),
  heavy: () => triggerHaptic('heavy'),
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),
  start: () => triggerHaptic('start'),
  notification: () => triggerHaptic('notification'),
  custom: (pattern: number | number[]) => {
    if (!isHapticsSupported() || !isHapticsEnabled()) return false;
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  },
  isSupported: isHapticsSupported,
  isAndroid: isAndroidDevice,
  isTouch: isTouchDevice,
  isEnabled: isHapticsEnabled,
  setEnabled: setHapticsEnabled,
  toggle: () => {
    const current = isHapticsEnabled();
    setHapticsEnabled(!current);
    if (!current) {
      triggerHaptic('success');
    }
    return !current;
  }
};

/**
 * Initialize global event listener for interactive elements with data-haptic
 * and standard touch controls.
 */
let globalHapticsInitialized = false;

export const initGlobalHaptics = (): void => {
  if (globalHapticsInitialized || typeof window === 'undefined') return;
  globalHapticsInitialized = true;

  // Use pointerdown or touchstart for instantaneous physical feedback before mouseup
  const handleUserInteraction = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Check for explicit data-haptic attribute
    const hapticEl = target.closest('[data-haptic]') as HTMLElement | null;
    if (hapticEl) {
      const type = (hapticEl.getAttribute('data-haptic') || 'light') as HapticFeedbackType;
      triggerHaptic(type);
      return;
    }

    // Check for common interactive elements if on mobile/Android
    const interactiveEl = target.closest('button, [role="button"], [role="tab"], nav a, .interactive-haptic') as HTMLElement | null;
    if (interactiveEl && (isAndroidDevice() || isTouchDevice())) {
      // Avoid vibrating for disabled elements
      if ((interactiveEl as HTMLButtonElement).disabled) return;
      triggerHaptic('light');
    }
  };

  window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
};

export default haptic;
