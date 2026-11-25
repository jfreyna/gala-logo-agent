/**
 * Gala's icons, with the geometry exported from the Figma component sets.
 * Each draws in the current text color, so a component names the icon's
 * color with the same tokens it uses for text.
 */
const ICONS = {
  paperclip: {
    size: 20,
    body: '<path d="M17.8666 9.20833L10.2082 16.8667C9.27005 17.8049 7.99757 18.3319 6.67075 18.3319C5.34393 18.3319 4.07145 17.8049 3.13325 16.8667C2.19505 15.9285 1.66797 14.656 1.66797 13.3292C1.66797 12.0023 2.19505 10.7299 3.13325 9.79166L10.2749 2.65C10.9004 2.02342 11.7491 1.67098 12.6345 1.6702C13.5198 1.66942 14.3692 2.02036 14.9957 2.64583C15.6223 3.2713 15.9748 4.12006 15.9755 5.00538C15.9763 5.89071 15.6254 6.74009 14.9999 7.36666L7.84158 14.5083C7.52885 14.8211 7.10469 14.9968 6.66242 14.9968C6.22014 14.9968 5.79598 14.8211 5.48325 14.5083C5.17051 14.1956 4.99482 13.7714 4.99482 13.3292C4.99482 12.8869 5.17051 12.4627 5.48325 12.15L12.5582 5.08333" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  arrowUp: {
    size: 24,
    body: '<path d="M12 5V19M19 12L12 5L5 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  stop: { size: 24, body: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>' },
  remove: {
    size: 16,
    body: '<path d="M12 4L4 12M4 4L12 12" stroke-width="1.33333" stroke-linecap="round" stroke="currentColor"/>',
  },
  check: {
    size: 14,
    body: '<path d="M2.91699 7.29167L5.54199 9.91667L11.0837 4.375" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  x: {
    size: 14,
    body: '<path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke-width="1.75" stroke-linecap="round" stroke="currentColor"/>',
  },
  statusDone: {
    size: 20,
    body: '<path d="M18.5 10C18.5 14.6944 14.6944 18.5 10 18.5C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5C14.6944 1.5 18.5 5.30558 18.5 10Z" stroke-width="1.5" stroke="currentColor"/><path d="M6 10.3L8.6 12.9L14 7.5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  statusCurrent: {
    size: 20,
    body: '<path d="M18.5 10C18.5 14.6944 14.6944 18.5 10 18.5C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5C14.6944 1.5 18.5 5.30558 18.5 10Z" stroke-width="1.5" stroke="currentColor"/><path d="M10 14C12.2091 14 14 12.2091 14 10C14 7.79086 12.2091 6 10 6C7.79086 6 6 7.79086 6 10C6 12.2091 7.79086 14 10 14Z" fill="currentColor"/>',
  },
  statusUpcoming: {
    size: 20,
    body: '<path d="M18.5 10C18.5 14.6944 14.6944 18.5 10 18.5C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5C14.6944 1.5 18.5 5.30558 18.5 10Z" stroke-width="1.5" stroke="currentColor"/>',
  },
  back: {
    size: 20,
    body: '<path d="M15.8332 10H4.1665M9.1665 15L4.1665 10L9.1665 5" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  close: {
    size: 20,
    body: '<path d="M5 5L15 15M15 5L5 15" stroke-width="1.66667" stroke-linecap="round" stroke="currentColor"/>',
  },
  download: {
    size: 16,
    body: '<path d="M7.99967 2.66699V10.0003M11.333 6.66699L7.99967 10.0003L4.66634 6.66699M3.33301 13.3337H12.6663" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  checkSmall: {
    size: 12,
    body: '<path d="M2.5 6.25L4.75 8.5L9.5 3.75" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  grid: {
    size: 16,
    body: '<path d="M2 2H6.66667V6.66667H2V2ZM9.33333 2H14V6.66667H9.33333V2ZM9.33333 9.33333H14V14H9.33333V9.33333ZM2 9.33333H6.66667V14H2V9.33333Z" stroke-width="1.33333" stroke-linejoin="round" stroke="currentColor"/>',
  },
  logOut: {
    size: 16,
    body: '<path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 4.66667L14 8L10.6667 11.3333M14 8H6" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  chevron: {
    size: 16,
    body: '<path d="M6 4L10 8L6 12" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  edit: {
    size: 16,
    body: '<path d="M11.3335 2.00021C11.499 1.78792 11.7078 1.61322 11.946 1.48771C12.1841 1.36219 12.4462 1.28872 12.7149 1.27215C12.9836 1.25559 13.2528 1.29632 13.5046 1.39164C13.7563 1.48696 13.985 1.63469 14.1753 1.82505C14.3657 2.01541 14.5134 2.24405 14.6087 2.49582C14.7041 2.74759 14.7448 3.01674 14.7282 3.28544C14.7117 3.55414 14.6382 3.81626 14.5127 4.05441C14.3872 4.29257 14.2125 4.50134 14.0002 4.66688L5.00016 13.6669L1.3335 14.6669L2.3335 11.0002L11.3335 2.00021Z" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
  plus: {
    size: 16,
    body: '<path d="M8.00016 3.33301V12.6663M3.3335 7.99967H12.6668" stroke-width="1.33333" stroke-linecap="round" stroke="currentColor"/>',
  },
  eyedropper: {
    size: 12,
    body: '<path d="M1 11L1.5 10.5H3L7.5 6" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M1.5 10.5V9L6 4.5" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/><path d="M7.49992 2.99992L9.19992 1.29992C9.39883 1.10101 9.66861 0.989258 9.94992 0.989258C10.2312 0.989258 10.501 1.10101 10.6999 1.29992C10.8988 1.49883 11.0106 1.76861 11.0106 2.04992C11.0106 2.33122 10.8988 2.60101 10.6999 2.79992L8.99992 4.49992L9.19992 4.69992C9.29841 4.79841 9.37654 4.91534 9.42984 5.04402C9.48314 5.17271 9.51058 5.31063 9.51058 5.44992C9.51058 5.58921 9.48314 5.72713 9.42984 5.85581C9.37654 5.9845 9.29841 6.10143 9.19992 6.19992C9.10143 6.29841 8.9845 6.37654 8.85581 6.42984C8.72713 6.48314 8.58921 6.51058 8.44992 6.51058C8.31063 6.51058 8.17271 6.48314 8.04402 6.42984C7.91534 6.37654 7.79841 6.29841 7.69992 6.19992L5.79992 4.29992C5.70143 4.20143 5.6233 4.0845 5.57 3.95582C5.51669 3.82713 5.48926 3.68921 5.48926 3.54992C5.48926 3.41063 5.51669 3.27271 5.57 3.14402C5.6233 3.01534 5.70143 2.89841 5.79992 2.79992C5.89841 2.70143 6.01534 2.6233 6.14402 2.57C6.27271 2.51669 6.41063 2.48926 6.54992 2.48926C6.68921 2.48926 6.82713 2.51669 6.95581 2.57C7.0845 2.6233 7.20143 2.70143 7.29992 2.79992L7.49992 2.99992Z" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/>',
  },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size, className = "" }: { name: IconName; size?: number; className?: string }) {
  const icon = ICONS[name];
  const drawn = size ?? icon.size;
  return (
    <svg
      aria-hidden="true"
      width={drawn}
      height={drawn}
      viewBox={`0 0 ${icon.size} ${icon.size}`}
      fill="none"
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
