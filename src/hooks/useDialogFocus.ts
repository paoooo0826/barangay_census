import { useEffect, useRef } from "react";

export function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  desktopWidth: number | null = 1024,
) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.hidden && getComputedStyle(element).display !== "none",
      );
    (focusable()[0] ?? panel).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const desktop =
      desktopWidth === null
        ? null
        : window.matchMedia(`(min-width: ${desktopWidth}px)`);
    const onResize = () => {
      if (desktop?.matches) closeRef.current();
    };
    desktop?.addEventListener("change", onResize);
    onResize();
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop?.removeEventListener("change", onResize);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open, desktopWidth]);
  return ref;
}
