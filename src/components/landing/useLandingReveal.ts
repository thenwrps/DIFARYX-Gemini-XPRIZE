import { useEffect, useRef, useState } from 'react';

type RevealOptions = {
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
};

export function useLandingReveal<T extends HTMLElement>({
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.08,
  once = true,
}: RevealOptions = {}) {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);

        if (entry.isIntersecting && once) {
          observer.unobserve(node);
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, isVisible };
}
