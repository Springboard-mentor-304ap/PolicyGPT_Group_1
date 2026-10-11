import { Component, Input } from "@angular/core";
import {
  QuotedTextSegment,
  splitQuotedSegments,
} from "../../../core/utils/quoted-text.util";

/**
 * Renders operational text with every double-quoted record name in
 * bold WITHOUT the quotation marks
 * (`Policy "River Plan" approved successfully.` renders as
 * Policy **River Plan** approved successfully.).
 *
 * Safe by construction: plain text interpolation only (never
 * innerHTML), all original characters preserved, apostrophes and
 * lone/empty quotes untouched.
 */
@Component({
  selector: "app-quoted-names",
  standalone: true,
  template: `
    @for (seg of segments(); track $index) {
      @if (seg.bold) {
        <strong>{{ seg.text }}</strong>
      } @else {
        <span>{{ seg.text }}</span>
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline;
      }
      strong {
        font-weight: 700;
        color: inherit;
      }
    `,
  ],
})
export class QuotedNamesComponent {
  @Input() text = "";

  segments(): QuotedTextSegment[] {
    return splitQuotedSegments(this.text ?? "");
  }
}
