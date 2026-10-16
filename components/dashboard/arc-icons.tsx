import type { ReactNode, SVGProps } from "react";

/**
 * Arcli's own icon set, drawn from the logo: the arc (a signal), the stem
 * (direction) and the dot (a person or a reading). 16px grid, 1.6 stroke,
 * round ends. Icons inherit `currentColor`; pass `accent` to colour the arc
 * separately (the logo's two-tone look on the dark rail).
 */
type ArcSvgProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };
type ArcIconProps = ArcSvgProps & { accent?: string };

function ArcSvg({ size = 16, children, ...props }: ArcSvgProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The logo mark: arc over an upward arrow. */
export function ArcLogoIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M2.5 9.5a5.5 5.5 0 0 1 11 0" stroke={accent} strokeWidth={1.8} />
      <path d="M8 14.5V7.2M5.6 9.6 8 7.2l2.4 2.4" />
    </ArcSvg>
  );
}

/** Prospects: a signal coming down into a tray. */
export function ArcProspectsIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M3 7.5a5 5 0 0 1 10 0" stroke={accent} />
      <path d="M8 5.5v6M5.8 9.3 8 11.5l2.2-2.2M2.5 14h11" />
    </ArcSvg>
  );
}

/** Delivered prospects (assisted pilot): a confirmed signal. */
export function ArcConfirmedIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M2.5 8.5a5.5 5.5 0 0 1 11 0" stroke={accent} />
      <path d="M5.3 11.3 7.2 13.2l3.5-3.7" />
    </ArcSvg>
  );
}

/** Brief: what to listen for. */
export function ArcBriefIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M4.5 6a3.5 3.5 0 0 1 7 0" stroke={accent} />
      <path d="M3 9.5h10M3 12.5h6.5" />
    </ArcSvg>
  );
}

/** Targets: companies, with a signal over the one being watched. (An arc over
    a single box read as a padlock, which the Pro lock already uses.) */
export function ArcAccountsIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M4.5 4.4a2 2 0 0 1 4 0" stroke={accent} />
      <path d="M4 13.5V6.8h5v6.7M9 13.5V9.3h3v4.2M2.5 13.5h11" />
    </ArcSvg>
  );
}

/** Buyer groups: people under one problem. */
export function ArcGroupsIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M2.5 9a5.5 5.5 0 0 1 11 0" stroke={accent} />
      <circle cx="4.5" cy="12.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="12.5" r="1.15" fill="currentColor" stroke="none" />
    </ArcSvg>
  );
}

/** Settings: a dial to tune. */
export function ArcSettingsIcon({ accent = "currentColor", ...props }: ArcIconProps) {
  return (
    <ArcSvg {...props}>
      <path d="M2.5 11a5.5 5.5 0 0 1 11 0" stroke={accent} />
      <path d="m8 11 2.6-3.2" />
      <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
    </ArcSvg>
  );
}

/** Search stays a standard magnifier so it is recognised instantly. */
export function ArcSearchIcon(props: ArcSvgProps) {
  return (
    <ArcSvg {...props}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3.3 3.3" />
    </ArcSvg>
  );
}

/** Locked (Pro-only) destination: an arc closed over a small body. */
export function ArcLockIcon(props: ArcSvgProps) {
  return (
    <ArcSvg {...props}>
      <path d="M5 7.5V6a3 3 0 0 1 6 0v1.5" />
      <path d="M3.5 7.5h9v6h-9z" />
    </ArcSvg>
  );
}
