import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface HeaderOverride {
  title?: string;
  onBack?: () => void;
}

interface HeaderContextValue {
  override: HeaderOverride;
  setOverride: (override: HeaderOverride) => void;
}

const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<HeaderOverride>({});
  return <HeaderContext.Provider value={{ override, setOverride }}>{children}</HeaderContext.Provider>;
}

function useHeaderContext(): HeaderContextValue {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error("useHeaderContext must be used within a HeaderProvider");
  }
  return context;
}

/** AppShell reads the current screen's title/back-button override, if any. */
export function useHeaderOverride(): HeaderOverride {
  return useHeaderContext().override;
}

/**
 * Lets a screen customize the shared header — e.g. the inbox detail view
 * sets a "Conversation" title and a back handler that returns to the list.
 * Clears itself on unmount so the next screen falls back to its route
 * default.
 */
export function useSetHeader(override: HeaderOverride): void {
  const { setOverride } = useHeaderContext();
  // Re-run whenever the override's own fields change, not on every render.
  const { title, onBack } = override;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    setOverride({ title, onBack: onBackRef.current ? () => onBackRef.current?.() : undefined });
    return () => setOverride({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, !!onBack]);
}
