import type { Transition } from 'motion/react'

/** Critically damped: the default for anything that moves on its own. */
export const SPRING: Transition = { type: 'spring', bounce: 0, duration: 0.4 }
export const SPRING_FAST: Transition = { type: 'spring', bounce: 0, duration: 0.28 }
export const FADE: Transition = { duration: 0.16, ease: 'easeOut' }
