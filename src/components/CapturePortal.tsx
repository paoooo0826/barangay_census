import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Keep capture screens outside form cards and any transformed/clipped ancestors.
export default function CapturePortal({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return active ? createPortal(children, document.body) : children;
}
