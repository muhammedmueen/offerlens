import { useRef } from "react";

type AutoFocusHandler = (event: Event) => void;

/**
 * Hands focus back to whatever opened a dialog or drawer. Radix only returns focus to its own
 * Trigger, so anything opened from state falls to <body> and a keyboard user restarts at the top.
 * shortcut: Safari does not focus buttons on click, so there the opener is unknown and focus still
 * falls to <body> after a mouse open. Upgrade by passing the opener in if that ever matters.
 */
export function useReturnFocus(onOpenAutoFocus?: AutoFocusHandler, onCloseAutoFocus?: AutoFocusHandler) {
  const opener = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: (event: Event) => {
      opener.current = document.activeElement as HTMLElement | null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      if (event.defaultPrevented || !target || target === document.body || !target.isConnected) return;
      event.preventDefault();
      target.focus();
    },
  };
}
