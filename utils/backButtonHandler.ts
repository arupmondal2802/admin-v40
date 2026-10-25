/**
 * Android Hardware & Browser Back Button Handler
 * Intercepts physical back button (Capacitor App plugin) and browser popstate
 * to dismiss active modals, drawers, sub-steps, or return to dashboard without
 * terminating the application abruptly.
 */

export type BackHandlerCallback = () => boolean | void;

interface RegisteredHandler {
  id: string;
  callback: BackHandlerCallback;
  priority: number; // Higher numbers execute first
}

let handlers: RegisteredHandler[] = [];
let isInitialized = false;
let capacitorAppPlugin: any = null;

// Attempt to detect Capacitor App plugin if available in runtime
async function getCapacitorApp() {
  if (capacitorAppPlugin) return capacitorAppPlugin;
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win?.Capacitor?.Plugins?.App) {
      capacitorAppPlugin = win.Capacitor.Plugins.App;
      return capacitorAppPlugin;
    }
  }
  return null;
}

/**
 * Register a back button handler.
 * Returns an unregister function.
 */
export function registerBackHandler(callback: BackHandlerCallback, priority = 10, id?: string): () => void {
  const handlerId = id || `handler_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Push state to browser history if not already having one so browser popstate can catch it
  if (typeof window !== 'undefined' && typeof window.history !== 'undefined') {
    try {
      if (!window.history.state || window.history.state.__appBackHandled !== true) {
        window.history.pushState({ __appBackHandled: true, handlerId }, '');
      }
    } catch {
      // Ignore if pushState fails
    }
  }

  handlers.push({ id: handlerId, callback, priority });
  // Sort descending by priority
  handlers.sort((a, b) => b.priority - a.priority);

  return () => {
    handlers = handlers.filter(h => h.id !== handlerId);
  };
}

/**
 * Execute back action through the registered handler stack.
 * Returns true if an action was handled/consumed, false otherwise.
 */
export function triggerBackAction(): boolean {
  if (handlers.length === 0) return false;

  for (let i = 0; i < handlers.length; i++) {
    const current = handlers[i];
    try {
      const result = current.callback();
      // If callback returns explicitly false, continue to next handler; otherwise consider it consumed
      if (result !== false) {
        // Remove one-time or completed handler if appropriate or leave it to caller
        return true;
      }
    } catch (e) {
      console.warn('Error in back button handler:', e);
    }
  }

  return false;
}

/**
 * Initialize global listeners for Capacitor Hardware Back Button and Web Popstate
 */
export function initBackButtonHandler() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. Browser & PWA Popstate Listener
  window.addEventListener('popstate', (e) => {
    const handled = triggerBackAction();
    if (handled) {
      // Push state back so subsequent back clicks can still be intercepted
      try {
        window.history.pushState({ __appBackHandled: true }, '');
      } catch {}
    }
  });

  // 2. Capacitor Android Hardware Back Button
  getCapacitorApp().then((app) => {
    if (app && typeof app.addListener === 'function') {
      try {
        app.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
          const handled = triggerBackAction();
          if (!handled) {
            if (canGoBack && typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else if (app.exitApp) {
              app.exitApp();
            }
          }
        });
      } catch (err) {
        console.info('Capacitor backButton listener notice:', err);
      }
    }
  });
}
