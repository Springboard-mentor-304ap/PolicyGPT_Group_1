import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

export interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  dob: string;
  gender: string;
  state: string;
  district: string;
  occupation: string;
  phone: string;
  avatarUrl: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent implements OnInit {
  private location = inject(Location);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Modal Visibility Controls
  showDeleteModal: boolean = false;
  showPasswordModal: boolean = false;

  // Password Input State
  confirmPasswordValue: string = '';
  showPasswordText: boolean = false;

  userProfile: UserProfile = {
    fullName: 'USER NAME',
    email: 'user.mail@gmail.com',
    role: 'USER ROLE',
    dob: 'DD-YY-MM',
    gender: 'Female / Male',
    state: 'your_state',
    district: 'your_district',
    occupation: 'xyz',
    phone: '+919876543210',
    avatarUrl: 'assets/images/user-avatar.png'
  };

  ngOnInit(): void {
    this.cdr.markForCheck();
  }

  goBack(): void {
    this.location.back();
  }

  // Updated to navigate to the Edit Profile route
  onEditProfile(): void {
    this.router.navigate(['/profile/edit']);
  }

  onChangePassword(): void {
    this.router.navigate(['/auth/change-password']);
  }

  // Step 1: Open "Want to delete your account?" modal
  onDeleteAccount(): void {
    this.showDeleteModal = true;
    this.showPasswordModal = false;
    this.cdr.markForCheck();
  }

  // Step 1 -> Step 2: User clicks YES
  confirmDeleteAccount(): void {
    this.showDeleteModal = false;
    this.showPasswordModal = true;
    this.confirmPasswordValue = '';
    this.showPasswordText = false;
    this.cdr.markForCheck();
  }

  // Cancel deletion at any stage
  cancelDeleteAccount(): void {
    this.showDeleteModal = false;
    this.showPasswordModal = false;
    this.confirmPasswordValue = '';
    this.cdr.markForCheck();
  }

  // Toggle eye visibility icon in password input
  togglePasswordVisibility(): void {
    this.showPasswordText = !this.showPasswordText;
    this.cdr.markForCheck();
  }

  // Final confirmation step
  submitPasswordConfirmation(): void {
    if (!this.confirmPasswordValue.trim()) {
      alert('Please enter your password to confirm.');
      return;
    }

    console.log('Account Deletion Confirmed with Password:', this.confirmPasswordValue);
    
    // Perform account deletion logic or API call here
    this.showPasswordModal = false;
    this.confirmPasswordValue = '';
    this.cdr.markForCheck();
  }
}
