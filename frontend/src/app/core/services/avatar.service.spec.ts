import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { AvatarService } from "./avatar.service";
import { Auth, AuthUser } from "./auth";
import { environment } from "../../../environments/environment";

function userWithPhoto(): AuthUser {
  return {
    user_id: 11,
    full_name: "Citizen One",
    email: "citizen11@example.com",
    role: "CITIZEN",
    phone: null,
    date_of_birth: null,
    state: null,
    district: null,
    occupation: null,
    organization: null,
    is_active: true,
    profile_photo_updated_at: "2026-05-01T12:00:00",
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-05-01T12:00:00",
  };
}

describe("AvatarService", () => {
  let service: AvatarService;
  let httpMock: HttpTestingController;
  const photoUrl = `${environment.apiUrl}/auth/profile/photo`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [Auth, AvatarService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AvatarService);
    httpMock = TestBed.inject(HttpTestingController);
    vi.stubGlobal("URL.createObjectURL", vi.fn(() => "blob:photo-1"));
    vi.stubGlobal("URL.revokeObjectURL", vi.fn());
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("1. returns null without fetching when the user has no photo", () => {
    service.photoSrcFor({ ...userWithPhoto(), profile_photo_updated_at: null }).subscribe((src) => {
      expect(src).toBeNull();
    });
    httpMock.expectNone(photoUrl);
  });

  it("2. returns null for anonymous users without fetching", () => {
    service.photoSrcFor(null).subscribe((src) => {
      expect(src).toBeNull();
    });
    httpMock.expectNone(photoUrl);
  });

  it("3. fetches the photo blob once and caches per version", () => {
    const user = userWithPhoto();
    let first: string | null = null;
    service.photoSrcFor(user).subscribe((src) => (first = src));
    const req = httpMock.expectOne(photoUrl);
    expect(req.request.method).toBe("GET");
    req.flush(new Blob(["bytes"], { type: "image/png" }));
    expect(first).toBe("blob:photo-1");

    // Same version: served from cache, no second request.
    service.photoSrcFor(user).subscribe((src) => {
      expect(src).toBe("blob:photo-1");
    });
    httpMock.expectNone(photoUrl);
  });

  it("4. refetches when the photo version changes", () => {
    const user = userWithPhoto();
    service.photoSrcFor(user).subscribe();
    httpMock.expectOne(photoUrl).flush(new Blob(["a"], { type: "image/png" }));

    service
      .photoSrcFor({ ...user, profile_photo_updated_at: "2026-06-01T00:00:00" })
      .subscribe((src) => {
        expect(src).toBe("blob:photo-1");
      });
    httpMock.expectOne(photoUrl).flush(new Blob(["b"], { type: "image/png" }));
  });

  it("5. uploads via multipart PUT and returns the confirmed user", () => {
    const file = new File(["bytes"], "me.png", { type: "image/png" });
    service.uploadPhoto(file).subscribe((user) => {
      expect(user.profile_photo_updated_at).toBe("2026-06-01T00:00:00");
    });
    const req = httpMock.expectOne(photoUrl);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({ ...userWithPhoto(), profile_photo_updated_at: "2026-06-01T00:00:00" });
  });

  it("6. removes the photo via DELETE", () => {
    service.removePhoto().subscribe((user) => {
      expect(user.profile_photo_updated_at).toBeNull();
    });
    const req = httpMock.expectOne(photoUrl);
    expect(req.request.method).toBe("DELETE");
    req.flush({ ...userWithPhoto(), profile_photo_updated_at: null });
  });

  it("7. rejects invalid and oversized files client-side", () => {
    expect(service.validateImageFile(null)).toContain("select an image");
    expect(
      service.validateImageFile(new File(["x"], "evil.exe", { type: "application/x-msdownload" }))
    ).toContain("JPG, PNG");
    expect(
      service.validateImageFile(new File(["x"], "pic.svg", { type: "image/svg+xml" }))
    ).toContain("JPG, PNG");
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect(service.validateImageFile(big)).toContain("5 MB");
    expect(
      service.validateImageFile(new File(["bytes"], "me.webp", { type: "image/webp" }))
    ).toBeNull();
  });

  it("8. clears cached avatar state on logout", () => {
    const user = userWithPhoto();
    service.photoSrcFor(user).subscribe();
    httpMock.expectOne(photoUrl).flush(new Blob(["a"], { type: "image/png" }));

    TestBed.inject(Auth).logout();

    // Same version after logout must NOT reuse the revoked URL.
    service.photoSrcFor(user).subscribe();
    httpMock.expectOne(photoUrl).flush(new Blob(["b"], { type: "image/png" }));
  });
});
