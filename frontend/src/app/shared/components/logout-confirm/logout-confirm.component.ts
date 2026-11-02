import { Component, EventEmitter, Output } from "@angular/core";

@Component({
  selector: "app-logout-confirm",
  standalone: true,
  templateUrl: "./logout-confirm.component.html",
  styleUrl: "./logout-confirm.component.scss",
})
export class LogoutConfirmComponent {
  @Output() confirm = new EventEmitter<void>();

  @Output() cancel = new EventEmitter<void>();

  // =====================================================
  // YES BUTTON
  // =====================================================

  onConfirm(): void {
    console.log("YES button clicked");

    this.confirm.emit();
  }

  // =====================================================
  // NO BUTTON
  // =====================================================

  onCancel(): void {
    console.log("NO button clicked");

    this.cancel.emit();
  }
}
