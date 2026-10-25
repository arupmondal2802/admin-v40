import { useEffect } from 'react';
import { registerBackHandler, BackHandlerCallback } from '../utils/backButtonHandler';

/**
 * Hook to register an Android hardware / browser back button handler.
 * @param callback Handler callback to execute when Back is pressed. Return true (or undefined) if handled.
 * @param isActive Whether the handler is currently active (e.g. modal is open).
 * @param priority Priority in the back stack (default 10). Higher numbers execute first.
 */
export function useAndroidBackButton(
  callback: BackHandlerCallback,
  isActive: boolean = true,
  priority: number = 10
) {
  useEffect(() => {
    if (!isActive) return;

    const unregister = registerBackHandler(callback, priority);
    return () => {
      unregister();
    };
  }, [callback, isActive, priority]);
}

export default useAndroidBackButton;
