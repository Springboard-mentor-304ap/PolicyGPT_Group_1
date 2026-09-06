import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
  selector: "app-guest",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./guest.component.html",
  styleUrl: "./guest.component.scss",
})
export class GuestComponent {
  constructor(private readonly router: Router) {}

  // =========================================================
  // NAVIGATION
  // =========================================================

  goToPolicies(): void {
    this.router.navigate(["/policies"]);
  }

  goToSchemes(): void {
    this.router.navigate(["/schemes"]);
  }

  goToLogin(): void {
    this.router.navigate(["/auth/login"]);
  }

  goToSignup(): void {
    this.router.navigate(["/auth/signup"]);
  }

  // =========================================================
  // SEARCH
  // =========================================================

  searchSchemes(query: string): void {
    const search = query.trim();

    if (!search) {
      return;
    }

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: search,
      },
    });
  }
}
