import {
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges
} from '@angular/core';
import { prefersReducedMotion } from '../../features/analytics/shared/chart-animation.config';

/**
 * Directive that smoothly animates numeric metrics (count-up)
 * on KPI stat cards across all role dashboards and analytics pages.
 *
 * Example:
 * <p class="dash-stat-card__value" [appCountUp]="card.value">{{ card.value }}</p>
 */
@Directive({
  selector: '[appCountUp]',
  standalone: true
})
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input('appCountUp') value: string | number | null | undefined;
  @Input() countUpDuration = 650; // milliseconds

  private rafId: number | null = null;
  private previousNum = 0;
  private hasRenderedOnce = false;

  constructor(
    private el: ElementRef<HTMLElement>,
    private ngZone: NgZone
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      this.cancelAnimation();
      this.startCountUp();
    }
  }

  ngOnDestroy(): void {
    this.cancelAnimation();
  }

  private cancelAnimation(): void {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  private startCountUp(): void {
    const raw = this.value;
    if (raw === null || raw === undefined || raw === '') {
      this.setText('');
      return;
    }

    const str = String(raw).trim();

    // Check if reduced motion is preferred or if environment doesn't support rAF
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.setText(str);
      return;
    }

    // Match numeric patterns, including commas, decimals, and optional prefix/suffix:
    // e.g. "1,240", "94.2%", "₹120", "+15%"
    const match = str.match(/^([^\d\-+.]*?)([+\-]?[\d,]+(?:\.\d+)?)(.*)$/);
    if (!match) {
      // Non-numeric value (e.g. "—", "Active", "Pending")
      this.setText(str);
      return;
    }

    const prefix = match[1] || '';
    const numPart = match[2].replace(/,/g, '');
    const suffix = match[3] || '';
    const hasCommas = match[2].includes(',');
    const hasDecimal = numPart.includes('.');
    const decimalPlaces = hasDecimal ? numPart.split('.')[1].length : 0;

    const targetNum = parseFloat(numPart);
    if (isNaN(targetNum)) {
      this.setText(str);
      return;
    }

    const startNum = this.hasRenderedOnce ? this.previousNum : 0;
    this.hasRenderedOnce = true;
    this.previousNum = targetNum;

    // Run animation outside Angular zone to avoid triggering change detection on every frame
    this.ngZone.runOutsideAngular(() => {
      const startTime = performance.now();
      const duration = Math.max(200, this.countUpDuration);

      const frame = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Quintic ease-out: 1 - Math.pow(1 - progress, 4)
        const ease = 1 - Math.pow(1 - progress, 4);
        const currentVal = startNum + (targetNum - startNum) * ease;

        let formattedNum: string;
        if (hasDecimal) {
          formattedNum = currentVal.toFixed(decimalPlaces);
        } else {
          formattedNum = Math.round(currentVal).toString();
        }

        if (hasCommas) {
          const parts = formattedNum.split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          formattedNum = parts.join('.');
        }

        this.setText(`${prefix}${formattedNum}${suffix}`);

        if (progress < 1) {
          this.rafId = requestAnimationFrame(frame);
        } else {
          this.setText(str);
          this.rafId = null;
        }
      };

      this.rafId = requestAnimationFrame(frame);
    });
  }

  private setText(text: string): void {
    if (this.el?.nativeElement) {
      this.el.nativeElement.textContent = text;
    }
  }
}
