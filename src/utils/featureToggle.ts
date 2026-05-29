/**
 * Feature Toggle State Management
 * 
 * Determines whether DIFARYX should use the real FastAPI backend or local mock demo data.
 */

const REAL_BACKEND_KEY = 'difaryx_use_real_backend';

/**
 * Check if the real backend connection is enabled.
 * Prioritizes localStorage configuration, and falls back to VITE_USE_REAL_BACKEND.
 */
export function isRealBackendEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return import.meta.env.VITE_USE_REAL_BACKEND === 'true';
  }

  const stored = window.localStorage.getItem(REAL_BACKEND_KEY);
  if (stored !== null) {
    return stored === 'true';
  }

  return import.meta.env.VITE_USE_REAL_BACKEND === 'true';
}

/**
 * Set the real backend connection status in localStorage.
 */
export function setRealBackendEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  window.localStorage.setItem(REAL_BACKEND_KEY, String(enabled));
  
  // Dispatch custom event for cross-component reactivity
  window.dispatchEvent(new CustomEvent('difaryx-backend-toggle-changed', { detail: { enabled } }));
}
