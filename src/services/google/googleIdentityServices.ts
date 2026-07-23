const GOOGLE_IDENTITY_SERVICES_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
}

export interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

export interface GoogleAccounts {
  id: {
    initialize(config: {
      client_id: string;
      callback: (response: GoogleCredentialResponse) => void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
    }): void;
    renderButton(
      parent: HTMLElement,
      options: {
        type: 'standard';
        theme?: 'outline' | 'filled_blue' | 'filled_black';
        size?: 'large' | 'medium' | 'small';
        text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
        shape?: 'rectangular' | 'pill' | 'circle' | 'square';
        width?: number;
      },
    ): void;
    disableAutoSelect(): void;
  };
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: GoogleTokenResponse) => void;
      error_callback?: () => void;
      include_granted_scopes?: boolean;
    }): GoogleTokenClient;
    revoke(accessToken: string, callback?: () => void): void;
  };
}

type GoogleWindow = Window & {
  google?: {
    accounts?: GoogleAccounts;
  };
};

let loadPromise: Promise<GoogleAccounts> | null = null;

export function getLoadedGoogleAccounts(): GoogleAccounts | null {
  if (typeof window === 'undefined') return null;
  return (window as GoogleWindow).google?.accounts ?? null;
}

export function loadGoogleIdentityServices(): Promise<GoogleAccounts> {
  const loaded = getLoadedGoogleAccounts();
  if (loaded) return Promise.resolve(loaded);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser'));
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleAccounts>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`,
    );
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      const accounts = getLoadedGoogleAccounts();
      if (accounts) {
        resolve(accounts);
        return;
      }
      loadPromise = null;
      reject(new Error('Google Identity Services did not initialize'));
    };
    const handleError = () => {
      loadPromise = null;
      reject(new Error('Unable to load Google Identity Services'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SERVICES_SRC;
      script.async = true;
      script.defer = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.appendChild(script);
    }
  });

  return loadPromise;
}
