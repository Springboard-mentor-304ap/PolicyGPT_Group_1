import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  loading = false;
  errorMessage = '';
  hidePassword = true;

  features = [
    { icon: 'search', color: 'blue', title: 'Smart Search', desc: 'Find policies and schemes quickly with advanced filters.' },
    { icon: 'verified_user', color: 'green', title: 'Check Eligibility', desc: 'Discover schemes you are eligible for in just a few steps.' },
    { icon: 'bookmark', color: 'orange', title: 'Save & Track', desc: 'Save important policies and track updates in real time.' },
    { icon: 'notifications', color: 'purple', title: 'Stay Updated', desc: 'Get notified about new policies, schemes and deadlines.' },
  ];

  form: any;

  constructor(private fb: FormBuilder, private auth: Auth, private router: Router) {
    this.form = this.fb.group({
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false],
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { phone, password } = this.form.getRawValue();

    this.auth.login(phone as string, password as string).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard/citizen']);
      },
     error: (err: any) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || 'Invalid phone number or password. Please try again.';
      },
    });
  }

  loginWithGoogle(): void {
    // TODO: wire up OAuth once backend/SSO provider is confirmed
  }

  loginWithMail(): void {
    // Switches to an email-based login variant — placeholder until designed
  }
}