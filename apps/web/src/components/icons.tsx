import type { SVGProps } from "react";

/** Jeu d'icônes maison : trait 1,6 px, grille 24 px, couleur héritée du texte. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const HomeIcon = (p: P) => (
  <Icon {...p}><path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>
);
export const BoxIcon = (p: P) => (
  <Icon {...p}><path d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z" /><path d="M4 8.2 12 12.4l8-4.2M12 12.4V20" /></Icon>
);
export const ListIcon = (p: P) => (
  <Icon {...p}><path d="M9 6.5h10M9 12h10M9 17.5h10" /><path d="m4 6.5 1 1 1.6-2M4 12l1 1 1.6-2M4 17.5l1 1 1.6-2" /></Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.400 2 7 5.600" /></Icon>
);
export const SunIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="3.8" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.400 1.400M5.6 18.400 7 17M17 7l1.400-1.400" /></Icon>
);
export const MoonIcon = (p: P) => (
  <Icon {...p}><path d="M19.500 14.200A7.800 7.800 0 0 1 9.800 4.500a7.800 7.800 0 1 0 9.700 9.700z" /></Icon>
);
export const ArrowIcon = (p: P) => (
  <Icon {...p}><path d="M5 12h14M13.500 6.500 19 12l-5.500 5.500" /></Icon>
);
export const FlaskIcon = (p: P) => (
  <Icon {...p}><path d="M9.500 4h5M10.500 4v5.200L5.600 17.600A1.600 1.600 0 0 0 7 20h10a1.600 1.600 0 0 0 1.400-2.400L13.500 9.200V4" /><path d="M8 14.500h8" /></Icon>
);

export const StarIcon = (p: P) => (
  <Icon {...p}>
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8L12 3.5Z" />
  </Icon>
);

export const ScanIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 9v6M11 9v6M14 9v6M17 9v6" />
  </Icon>
);
