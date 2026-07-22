import { useEffect, useRef, useCallback } from 'react';

/**
 * Trap keyboard focus inside a container when `active` is true.
 * Returns a ref to attach to the container element.
 * 
 * Automatically:
 * - Focuses the first focusable element on activation
 * - Returns focus to the previously focused element on deactivation
 * - Cycles Tab/Shift+Tab within the container
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      // Return focus when trap deactivates
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
      return;
    }

    // Save the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the container
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector =
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

    // Small delay to allow rendering
    requestAnimationFrame(() => {
      const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
      firstFocusable?.focus();
    });
  }, [active]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusableSelector =
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      );

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active]
  );

  useEffect(() => {
    if (!active) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);

  return containerRef;
}
