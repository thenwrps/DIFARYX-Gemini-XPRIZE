export interface AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
  subscribe?(listener: () => void): () => void;
}

class DefaultAccessTokenProvider implements AccessTokenProvider {
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      // Listen to storage events to notify of auth changes/signouts
      window.addEventListener('storage', (e) => {
        if (e.key === 'demoProfile' || e.key === 'demoAuth') {
          this.notifyListeners();
        }
      });
    }
  }

  async getAccessToken(): Promise<string | null> {
    const mode = import.meta.env.VITE_WORKSPACE_DATA_MODE;
    if (mode !== 'server') {
      return null;
    }

    const isDev = import.meta.env.DEV;
    const isTestProvider = import.meta.env.VITE_AUTH_PROVIDER === 'test';

    // DEV test auth adapter
    if (isDev && isTestProvider) {
      const profileStr = localStorage.getItem('demoProfile');
      if (!profileStr) return null;
      try {
        const user = JSON.parse(profileStr);
        if (user && user.email) {
          const email = user.email;
          const emailPrefix = email.split('@')[0];
          const subject = emailPrefix.match(/^[a-z]+[0-9]+$/) ? `sub-${emailPrefix}` : `sub-${email}`;
          return `mock:firebase|${subject}|${email}`;
        }
      } catch {
        return null;
      }
    }

    // Production Firebase integration placeholder
    const firebaseUser = (window as any).firebaseAuthUser;
    if (firebaseUser) {
      return await firebaseUser.getIdToken();
    }

    return null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notifyListeners() {
    this.listeners.forEach((l) => l());
  }

  // Trigger manually on programmatical logout
  triggerChange() {
    this.notifyListeners();
  }
}

export const tokenProvider = new DefaultAccessTokenProvider();
