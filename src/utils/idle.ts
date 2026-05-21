type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function runWhenIdle(task: () => void, timeout = 800) {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  const idleWindow = window as IdleWindow;
  const run = () => {
    if (!cancelled) task();
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(run, 1);
  return () => {
    cancelled = true;
    window.clearTimeout(handle);
  };
}
