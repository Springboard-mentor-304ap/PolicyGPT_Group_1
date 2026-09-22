import { Component, HostListener, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { FooterComponent } from "../../components/footer/footer.component";
import { Auth } from "../../../core/services/auth";

/* =========================================================
   NAVIGATION ITEM
   ========================================================= */

export interface GuestNavItem {
  icon: string;
  label: string;
  route: string;
  exact?: boolean;
  requiresLogin?: boolean;
}

/* =========================================================
   GUEST USER LAYOUT
   ========================================================= */

@Component({
  selector: "app-guest-user-layout",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
  ],
  templateUrl: "./guest-user-layout.component.html",
  styleUrl: "./guest-user-layout.component.scss",
})
export class GuestUserLayoutComponent implements OnInit {
  // =========================================================
  // GUEST STATE
  // =========================================================

  userName = "Guest User";
  userRole = "GUEST";
  mobileMenuOpen = false;

  // =========================================================
  // LOGIN REQUIRED MODAL STATE
  // =========================================================

  showLoginMessage = false;
  loginMessage = "";

  // =========================================================
  // TOPBAR NAVIGATION
  // =========================================================

  navItems: GuestNavItem[] = [
    {
      icon: "home",
      label: "Home",
      route: "/dashboard/guest",
      exact: true,
      requiresLogin: false,
    },
    {
      icon: "policy",
      label: "Policy",
      route: "/dashboard/guest/policies/search",
      exact: false,
      requiresLogin: false,
    },
    {
      icon: "account_balance",
      label: "Scheme",
      route: "/dashboard/guest/schemes",
      exact: false,
      requiresLogin: false,
    },
    {
      icon: "fact_check",
      label: "Eligibility Checker",
      route: "/dashboard/guest/eligibility",
      exact: false,
      requiresLogin: true,
    },
    {
      icon: "compare_arrows",
      label: "Compare",
      route: "/dashboard/guest/compare",
      exact: false,
      requiresLogin: true,
    },
  ];

  constructor(
    private readonly router: Router,
    private readonly authService: Auth,
  ) {}

  ngOnInit(): void {
    const storedUser = this.authService.getStoredUser();
    if (storedUser?.full_name) {
      this.userName = storedUser.full_name;
    } else {
      this.userName = "Guest User";
    }
    this.userRole = "GUEST";
  }

  // =========================================================
  // MOBILE MENU CONTROLS
  // =========================================================

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 992) {
      this.mobileMenuOpen = false;
    }
  }

  // =========================================================
  // LOGIN REQUIRED MODAL
  // =========================================================

  requireLogin(feature: string): void {
    this.loginMessage = `${feature} requires you to login or sign up first.`;
    this.showLoginMessage = true;
    this.closeMobileMenu();
  }

  closeLoginMessage(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
  }

  // =========================================================
  // AUTH NAVIGATION
  // =========================================================

  goToLogin(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeMobileMenu();
    this.router.navigate(["/auth/login"]);
  }

  goToSignup(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeMobileMenu();
    this.router.navigate(["/auth/register"]);
  }
}
