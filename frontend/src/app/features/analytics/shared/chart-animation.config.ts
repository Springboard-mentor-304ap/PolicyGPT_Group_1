/**
 * Reusable, type-safe Chart Animation Configuration for PolicyGPT.
 *
 * Provides smooth, professional, government-grade animation presets
 * for Chart.js across all dashboards, modules, and roles.
 * Fully respects user accessibility settings (prefers-reduced-motion).
 */

import { ChartOptions } from 'chart.js';

/**
 * Checks whether the user's OS has requested reduced motion.
 * Safe for SSR and headless testing environments (jsdom).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Standard animation duration constants (in milliseconds).
 */
export const ANIMATION_DURATIONS = {
  ENTRY_DEFAULT: 750,
  ENTRY_DOUGHNUT: 800,
  UPDATE: 550,
  HOVER: 200,
  REDUCED_MOTION: 0
} as const;

/**
 * Standard cubic-bezier and easing curve for professional, subtle motion.
 */
export const ANIMATION_EASINGS = {
  DEFAULT: 'easeOutQuart' as const,
  LINEAR: 'linear' as const,
  IN_OUT: 'easeInOutQuart' as const
};

/**
 * Shared Line Chart Animation Configuration.
 * Creates smooth line drawing, progressive data reveal, and animated point transitions.
 */
export function getLineChartAnimationConfig(): ChartOptions<'line'>['animation'] {
  if (prefersReducedMotion()) {
    return false;
  }

  return {
    duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
    easing: ANIMATION_EASINGS.DEFAULT,
  };
}

/**
 * Advanced Line Chart animations property with progressive point and tension reveals.
 */
export function getLineChartAnimationsProperty(): ChartOptions<'line'>['animations'] {
  if (prefersReducedMotion()) {
    return {};
  }

  return {
    y: {
      type: 'number',
      duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
      easing: ANIMATION_EASINGS.DEFAULT
    },
    tension: {
      duration: ANIMATION_DURATIONS.UPDATE,
      easing: ANIMATION_EASINGS.LINEAR,
      from: 0.8,
      to: 0.35,
      loop: false
    }
  };
}

/**
 * Shared Bar Chart Animation Configuration.
 * - Vertical bar (indexAxis 'x'): Bars grow upward smoothly from baseline y=0.
 * - Horizontal bar (indexAxis 'y'): Bars extend smoothly from left to right from x=0.
 */
export function getBarChartAnimationConfig(
  indexAxis: 'x' | 'y' = 'x'
): { animation: ChartOptions<'bar'>['animation']; animations: ChartOptions<'bar'>['animations'] } {
  if (prefersReducedMotion()) {
    return {
      animation: false,
      animations: {}
    };
  }

  if (indexAxis === 'y') {
    // Horizontal bar chart
    return {
      animation: {
        duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
        easing: ANIMATION_EASINGS.DEFAULT
      },
      animations: {
        x: {
          type: 'number',
          duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
          easing: ANIMATION_EASINGS.DEFAULT
        }
      }
    };
  }

  // Vertical bar chart
  return {
    animation: {
      duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
      easing: ANIMATION_EASINGS.DEFAULT
    },
    animations: {
      y: {
        type: 'number',
        duration: ANIMATION_DURATIONS.ENTRY_DEFAULT,
        easing: ANIMATION_EASINGS.DEFAULT
      }
    }
  };
}

/**
 * Shared Doughnut and Pie Chart Animation Configuration.
 * Enables smooth rotation arc reveal and smooth scale transitions on load and update.
 */
export function getDoughnutChartAnimationConfig(): ChartOptions<'doughnut'>['animation'] {
  if (prefersReducedMotion()) {
    return false;
  }

  return {
    animateRotate: true,
    animateScale: true,
    duration: ANIMATION_DURATIONS.ENTRY_DOUGHNUT,
    easing: ANIMATION_EASINGS.DEFAULT
  };
}

/**
 * Standard hover interaction options for all charts.
 */
export const CHART_HOVER_OPTIONS = {
  mode: 'nearest' as const,
  intersect: true,
  animationDuration: prefersReducedMotion() ? 0 : ANIMATION_DURATIONS.HOVER
};
