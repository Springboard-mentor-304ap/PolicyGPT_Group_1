import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

export type LoadingIndicatorSize = "md" | "sm";

/**
 * Shared animated loading indicator (PolicyGPT blue theme).
 *
 * Replaces skeleton/shimmer placeholders on data-loading screens:
 * a rotating circular spinner with a short status label underneath,
 * centered in the available content area. The `sm` size suits compact
 * inline contexts (stat tiles, small panels) where a full content
 * loader would be disruptive.
 */
@Component({
  selector: "app-loading-indicator",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./loading-indicator.component.html",
  styleUrl: "./loading-indicator.component.scss",
})
export class LoadingIndicatorComponent {
  /** Status text shown below the spinner (announced to assistive tech). */
  @Input() message = "Loading...";

  /** `md` (36px, content areas) or `sm` (20px, compact contexts). */
  @Input() size: LoadingIndicatorSize = "md";
}
