import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Single authoritative avatar renderer for the authenticated user.
 *
 * One user always maps to one visual: the uploaded photo when
 * `photoSrc` is set, otherwise the shared PolicyGPT default avatar
 * (the topbar's circular blue `account_circle`, NOT the old
 * illustrated profile SVG). The component fills its parent container,
 * so each location (topbar ~42px, settings ~52px, profile ~124px,
 * edit ~132px) shows the SAME image at its own display size with
 * `object-fit: cover` and no distortion.
 *
 * Photo bytes/URLs still come from AvatarService (per-version cached
 * blob URLs, cleared on logout); this component only decides
 * photo-vs-default and keeps that decision in exactly one place.
 */
@Component({
  selector: "app-user-avatar",
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="user-avatar" role="img" [attr.aria-label]="label">
      @if (photoSrc) {
        <img [src]="photoSrc" [alt]="label" class="user-avatar__photo" />
      } @else {
        <span class="material-icons user-avatar__icon" aria-hidden="true"
          >account_circle</span
        >
      }
    </span>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .user-avatar {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
        height: 100%;

        border-radius: 50%;

        overflow: hidden;

        background: #dcecff;

        /* Icon scales with the rendered avatar size. */
        container-type: size;
      }

      .user-avatar__photo {
        width: 100%;
        height: 100%;

        object-fit: cover;

        display: block;
      }

      .user-avatar__icon {
        color: #5d7795;

        /* Fallback for browsers without container-query units. */
        font-size: 38px;
        font-size: 78cqmin;

        line-height: 1;
      }
    `,
  ],
})
export class UserAvatarComponent {
  /** Object URL (or any URL) of the user's photo; null = default. */
  @Input() photoSrc: string | null = null;

  /** Accessible label for the avatar image. */
  @Input() label = "Profile avatar";
}
