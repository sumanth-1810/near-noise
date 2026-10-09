import type { SVGProps } from 'react'

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="7" cy="7" r="4.75" />
    <path d="m10.5 10.5 3.25 3.25" />
  </svg>
)

export const SlidersIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M2.5 5h6M12 5h1.5M2.5 11H4M7.5 11h6" />
    <circle cx="10.25" cy="5" r="1.75" />
    <circle cx="5.75" cy="11" r="1.75" />
  </svg>
)

export const ShuffleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M2 4.5h2.2c1.1 0 2.1.6 2.7 1.5l2.2 4c.6.9 1.6 1.5 2.7 1.5H14M2 11.5h2.2c.8 0 1.5-.3 2-.8M9.8 5.3c.5-.5 1.2-.8 2-.8H14" />
    <path d="m12.25 2.75 1.75 1.75-1.75 1.75M12.25 9.75l1.75 1.75-1.75 1.75" />
  </svg>
)

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
  </svg>
)

export const RecenterIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
)

export const MinusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3.5 8h9" />
  </svg>
)

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}>
    <path d="M5 3.4v9.2c0 .5.5.8.9.5l7-4.6a.6.6 0 0 0 0-1L5.9 2.9c-.4-.3-.9 0-.9.5Z" />
  </svg>
)

export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}>
    <rect x="4" y="3" width="2.8" height="10" rx="0.8" />
    <rect x="9.2" y="3" width="2.8" height="10" rx="0.8" />
  </svg>
)

export const NextIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}>
    <path d="M3 4.1v7.8c0 .4.5.7.8.4l5.6-3.9a.5.5 0 0 0 0-.8L3.8 3.7c-.3-.3-.8 0-.8.4Z" />
    <rect x="10.5" y="3.5" width="2.2" height="9" rx="0.7" />
  </svg>
)

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </svg>
)
