import { Component, EventEmitter, Output } from "@angular/core";

@Component({
  selector: "app-logout-confirm",
  standalone: true,
  templateUrl: "./logout-confirm.component.html",
  styleUrl: "./logout-confirm.component.scss",
})
export class LogoutConfirmComponent {
  @Output()
  confirmed = new EventEmitter<void>();

  @Output()
  cancelled = new EventEmitter<void>();

  // =======================================================
  // YES
  // =======================================================

  onConfirm(): void {
    this.confirmed.emit();
  }

  // =======================================================
  // NO
  // =======================================================

  onCancel(): void {
    this.cancelled.emit();
  }

  // =======================================================
  // CLOSE WHEN CLICKING OUTSIDE
  // =======================================================

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
