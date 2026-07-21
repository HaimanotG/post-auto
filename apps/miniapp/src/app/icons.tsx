interface IconProps {
  className?: string;
}

/** Shared icon set, traced from the PostAuto Mini App design spec. All use currentColor so a text-color class controls their tint. */

export function BackIcon({ className }: IconProps) {
  return (
    <svg width="11" height="18" viewBox="0 0 11 18" fill="none" className={className} aria-hidden="true">
      <path d="M9.5 1.5L1.5 9L9.5 16.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className={className} aria-hidden="true">
      <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className} aria-hidden="true">
      <path d="M1 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className} aria-hidden="true">
      <path d="M1 4l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RemoveIcon({ className }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M7.5 12.3l3 3 6-6.4" stroke="var(--pa-button-on-link)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GoodCheckIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12l2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ComposeIcon({ className }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 20h4.2L18.8 9.4a2 2 0 000-2.8L17 4.8a2 2 0 00-2.8 0L3.6 15.4V20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InboxIcon({ className }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 6h16v11H8.5L4 20.5V6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13.5 21v-7.6h2.6l.4-3H13.5V8.3c0-.87.24-1.46 1.5-1.46h1.6V4.14C16.3 4.1 15.3 4 14.1 4c-2.5 0-4.2 1.52-4.2 4.3v2.1H7.3v3h2.6V21h3.6z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TabHomeIcon({ className }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 11.5L12 4l8 7.5M6 10v9.5h12V10" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function TabAnalyticsIcon({ className }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 20V11M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function TabMarketplaceIcon({ className }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8l1.5-4h13L20 8M4 8v11h16V8M4 8h16M9 12a3 3 0 006 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
