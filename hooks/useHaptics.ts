import { useState, useEffect, useCallback } from 'react';
import { 
  haptic, 
  HapticFeedbackType, 
  isHapticsSupported, 
  isAndroidDevice, 
  isTouchDevice, 
  isHapticsEnabled, 
  setHapticsEnabled, 
  triggerHaptic 
} from '../utils/haptics';

export function useHaptics() {
  const [enabled, setEnabledState] = useState<boolean>(() => isHapticsEnabled());
  const [supported] = useState<boolean>(() => isHapticsSupported());
  const [isAndroid] = useState<boolean>(() => isAndroidDevice());
  const [isTouch] = useState<boolean>(() => isTouchDevice());

  useEffect(() => {
    const handleHapticsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnabledState(customEvent.detail.enabled);
      } else {
        setEnabledState(isHapticsEnabled());
      }
    };

    window.addEventListener('app_haptics_changed', handleHapticsChanged);
    return () => {
      window.removeEventListener('app_haptics_changed', handleHapticsChanged);
    };
  }, []);

  const toggle = useCallback(() => {
    const nextState = !enabled;
    setHapticsEnabled(nextState);
    setEnabledState(nextState);
    if (nextState) {
      triggerHaptic('success');
    }
  }, [enabled]);

  const setEnabled = useCallback((value: boolean) => {
    setHapticsEnabled(value);
    setEnabledState(value);
    if (value) {
      triggerHaptic('success');
    }
  }, []);

  const trigger = useCallback((type: HapticFeedbackType = 'light') => {
    return triggerHaptic(type);
  }, []);

  return {
    haptic,
    trigger,
    light: haptic.light,
    medium: haptic.medium,
    heavy: haptic.heavy,
    success: haptic.success,
    warning: haptic.warning,
    error: haptic.error,
    start: haptic.start,
    notification: haptic.notification,
    enabled,
    supported,
    isAndroid,
    isTouch,
    toggle,
    setEnabled,
  };
}

export default useHaptics;
