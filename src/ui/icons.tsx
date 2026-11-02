// Inline SVG icons (decorative: buttons carry their own accessible names).
import type { ReactElement } from "react";

const icon = (path: ReactElement) =>
  function Icon() {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {path}
      </svg>
    );
  };

export const ListIcon = icon(<path d="M4 6h16M4 12h16M4 18h10" />);
export const SearchIcon = icon(
  <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5-1.5L21 21" />,
);
export const SmallerIcon = icon(<path d="M3 17 7 7l4 10M4.5 13.5h5M15 12h6" />);
export const LargerIcon = icon(<path d="M3 19 8 5l5 14M5 14h6M18 9v6M15 12h6" />);
export const ThemeIcon = icon(<path d="M12 3a9 9 0 1 0 0 18V3Zm0 0a9 9 0 0 1 0 18" />);
export const PrintIcon = icon(<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />);
export const InfoIcon = icon(<path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-10v6m0-9.5v.5" />);
export const BackIcon = icon(<path d="M15 5 8 12l7 7" />);
export const SettingsIcon = icon(
  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3 2-1-2-4-2 1-2-1V4h-4v3l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v3h4v-3l2-1 2 1 2-4-2-1z" />,
);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const EditIcon = icon(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />);
export const OpenIcon = icon(<path d="M4 20V4h9l5 5v11zM13 4v5h5" />);
