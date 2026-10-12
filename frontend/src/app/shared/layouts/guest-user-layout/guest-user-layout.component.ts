import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { FooterComponent } from "../../components/footer/footer.component";
import { TopbarComponent } from "../../components/topbar/topbar.component";

/* =========================================================
   GUEST USER LAYOUT
   Shell layout: shared TopbarComponent (guest mode) +
   router outlet + footer. All topbar/nav/drawer/modal
   logic lives in the topbar.
   ========================================================= */

@Component({
  selector: "app-guest-user-layout",
  standalone: true,
  imports: [RouterOutlet, FooterComponent, TopbarComponent],
  templateUrl: "./guest-user-layout.component.html",
  styleUrl: "./guest-user-layout.component.scss",
})
export class GuestUserLayoutComponent {}
