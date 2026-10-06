import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  Observable,
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  timeout,
} from "rxjs";
import { environment } from "../../../environments/environment";
import { Auth, AuthUser } from "./auth";

/**
 * Single source of truth for the authenticated user's avatar image.
 *
 * The backend stores photo bytes (never in JSON); this service fetches
 * them with the authenticated HttpClient (the JWT interceptor attaches
 * the token, so no credential ever appears in a URL), converts them to
 * an object URL for `<img [src]>`, and caches per user+version in
 * memory only. The version signal (`profile_photo_updated_at`, NULL =
 * no photo) keeps the URL stable until the photo actually changes, so
 * browser caching can never show a stale avatar after an update.
 * All cached object URLs are revoked and dropped on logout, so one
 * user's photo can never leak into the next session.
 */
@Injectable({
  providedIn: "root",
})
export class AvatarService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  private readonly photoUrl = `${environment.apiUrl}/auth/profile/photo`;

  /** Upper bound for photo upload/download HTTP calls. */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  /** Client-side validation mirror of the backend rules. */
  private static readonly MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  private static readonly ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  /** version-key -> object URL (in-memory only, never persisted). */
  private readonly objectUrls = new Map<string, string>();
  private readonly photoInflight = new Map<string, Observable<string | null>>();

  /**
   * Shared avatar image for the currently authenticated user.
   *
   * Derived from the shared Auth current-user state, so Topbar,
   * Dashboard, Profile, Settings and every other avatar location
   * consume ONE stream and share ONE underlying blob fetch (per
   * user+version). Emits an object URL when the user has a photo,
   * null when the user has no photo or the photo cannot be loaded
   * (callers show the default avatar), and re-emits automatically
   * when the shared user changes (login, /me refresh, photo
   * upload/removal) without any component fetching independently.
   */
  public readonly currentAvatar$: Observable<string | null> =
    this.auth.currentUser$.pipe(
      distinctUntilChanged(
        (prev, curr) =>
          prev?.user_id === curr?.user_id &&
          (prev?.profile_photo_updated_at ?? null) ===
            (curr?.profile_photo_updated_at ?? null),
      ),
      switchMap((user) => this.photoSrcFor(user)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  constructor() {
    this.auth.onLoggedOut?.(() => {
      this.clearCache();
    });
  }

  /**
   * Validate a candidate file before preview/upload.
   * Returns an error message, or null when the file is acceptable.
   */
  validateImageFile(file: File | null | undefined): string | null {
    if (!file) {
      return "Please select an image file.";
    }
    if (!AvatarService.ALLOWED_TYPES.has(file.type)) {
      return "Only JPG, PNG, and WEBP images are allowed.";
    }
    if (file.size <= 0) {
      return "The selected file is empty.";
    }
    if (file.size > AvatarService.MAX_PHOTO_BYTES) {
      return "Profile photo must be 5 MB or smaller.";
    }
    return null;
  }

  /**
   * Resolve an `<img>`-ready URL for the given user, or null when the
   * user has no photo (caller shows the default avatar instead).
   * Emits the cached object URL when the version is unchanged.
   */
  photoSrcFor(user: AuthUser | null | undefined): Observable<string | null> {
    const version = user?.profile_photo_updated_at ?? null;
    if (!user || !version) {
      return of(null);
    }
    const key = `${user.user_id}:${version}`;
    const cached = this.objectUrls.get(key);
    if (cached) {
      return of(cached);
    }
    const ongoing = this.photoInflight.get(key);
    if (ongoing) {
      return ongoing;
    }
    // Drop object URLs for older versions of this user.
    for (const [entryKey, url] of this.objectUrls) {
      if (entryKey.startsWith(`${user.user_id}:`) && entryKey !== key) {
        URL.revokeObjectURL(url);
        this.objectUrls.delete(entryKey);
      }
    }
    const request = this.http
      .get(this.photoUrl, { responseType: "blob" })
      .pipe(
        timeout(AvatarService.REQUEST_TIMEOUT_MS),
        map((blob) => {
          // Backend may return an empty body with 200 on edge cases;
          // treat it as "no photo" rather than a broken image.
          if (!blob || blob.size === 0) {
            return null;
          }
          const url = URL.createObjectURL(blob);
          this.objectUrls.set(key, url);
          return url;
        }),
        catchError(() => {
          // No photo (404) or any other failure: emit null so callers
          // keep the default avatar instead of a broken image or an
          // unhandled error that would leave the topbar stuck on the
          // default until another page triggers a retry.
          return of(null);
        }),
        finalize(() => {
          this.photoInflight.delete(key);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.photoInflight.set(key, request);
    return request;
  }

  /**
   * Warm the avatar cache for the given user without waiting.
   *
   * Called immediately after login (before dashboard navigation) and
   * during app initialization (after /me), so the topbar's first
   * `photoSrcFor` hits the in-flight request or the cached object URL
   * instead of starting a cold fetch after the dashboard has rendered.
   * Failures resolve to null (default avatar) and never throw.
   */
  prefetchForUser(user: AuthUser | null | undefined): void {
    if (!user || !user.profile_photo_updated_at) {
      return;
    }
    try {
      this.photoSrcFor(user).subscribe();
    } catch {
      /* prefetch is best-effort only */
    }
  }

  /**
   * Upload a new profile photo for the authenticated user.
   * Returns the backend-confirmed user (with the new version signal).
   */
  uploadPhoto(file: File): Observable<AuthUser> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return this.http
      .put<AuthUser>(this.photoUrl, formData)
      .pipe(timeout(AvatarService.REQUEST_TIMEOUT_MS));
  }

  /** Remove the authenticated user's profile photo. */
  removePhoto(): Observable<AuthUser> {
    return this.http
      .delete<AuthUser>(this.photoUrl)
      .pipe(timeout(AvatarService.REQUEST_TIMEOUT_MS));
  }

  /** Revoke cached object URLs and drop them (logout/user switch). */
  clearCache(): void {
    for (const url of this.objectUrls.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    this.objectUrls.clear();
    this.photoInflight.clear();
  }
}
