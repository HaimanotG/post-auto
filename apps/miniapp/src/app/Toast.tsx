import type { ReactNode } from "react";

export interface ToastProps {
  kind: "status" | "alert";
  children: ReactNode;
}

/** Floating pill notification matching the design's toast — used for save confirmations, copy/share results, and transient errors. */
export function Toast({ kind, children }: ToastProps) {
  return (
    <div
      role={kind}
      className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-pa-toast-bg px-[18px] py-2.5 text-[13.5px] font-semibold text-pa-toast-text shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
      style={{ animation: "pa-toast-in 0.2s ease-out" }}
    >
      {children}
    </div>
  );
}
