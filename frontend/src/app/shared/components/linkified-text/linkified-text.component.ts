import { Component, computed, input } from "@angular/core";
import {
  splitLinkSegments,
  type LinkSegment,
} from "../../../core/utils/linkify.util";

/**
 * Renders plain text with embedded http(s) URLs as real anchors.
 *
 * Segments come from {@link splitLinkSegments} and are rendered with
 * interpolation only (never innerHTML): external links open in a new
 * tab with `noopener noreferrer`, anything else stays literal text.
 */
@Component({
  selector: "app-linkified-text",
  standalone: true,
  template: `
    @for (segment of segments(); track $index) {
      @if (segment.kind === "link") {
        <a
          class="link-inline"
          [href]="segment.href"
          target="_blank"
          rel="noopener noreferrer"
          >{{ segment.text }}</a
        >
      } @else {
        {{ segment.text }}
      }
    }
  `,
  styles: [
    `
      .link-inline {
        color: #1d4ed8;
        font-weight: 500;
        text-decoration: none;
        overflow-wrap: anywhere;
        word-break: break-word;
        transition:
          color 0.15s ease,
          text-decoration-color 0.15s ease;
      }

      .link-inline:hover {
        color: #1e40af;
        text-decoration: underline;
        text-decoration-color: currentColor;
      }

      .link-inline:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
        border-radius: 4px;
      }
    `,
  ],
})
export class LinkifiedTextComponent {
  /** Plain source text that may contain http(s) URLs. */
  readonly text = input<string>("");

  readonly segments = computed<LinkSegment[]>(() =>
    splitLinkSegments(this.text() ?? ""),
  );
}
