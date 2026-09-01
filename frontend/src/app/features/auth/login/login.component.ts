import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  form: FormGroup;

  loading = false;
  errorMessage = '';

  hidePassword = true;

  // Controls whether the user logs in using email or phone number
  loginMode: 'email' | 'phone' = 'email';

  constructor(
    private fb: FormBuilder,
    private authService: Auth,
    private router: Router
  ) {
    this.form = this.fb.group({
      email: [
        '',
        [
          Validators.email
        ]
      ],

      phone: [
        '',
        [
          Validators.pattern(/^[0-9]{10}$/)
        ]
      ],

      password: [
        '',
        Validators.required
      ],

      rememberMe: [false]
    });

    // Set the initial validators for email login
    this.setLoginValidators();
  }


  // ==========================================
  // TOGGLE EMAIL / PHONE LOGIN
  // ==========================================

  toggleLoginMode(): void {

    this.loginMode =
      this.loginMode === 'email'
        ? 'phone'
        : 'email';

    this.errorMessage = '';

    // Clear validation state of the identifier fields
    this.form.get('email')?.reset('');
    this.form.get('phone')?.reset('');

    this.setLoginValidators();
  }


  // ==========================================
  // UPDATE VALIDATORS BASED ON LOGIN MODE
  // ==========================================

  private setLoginValidators(): void {

    const emailControl =
      this.form.get('email');

    const phoneControl =
      this.form.get('phone');


    if (this.loginMode === 'email') {

      emailControl?.setValidators([
        Validators.required,
        Validators.email
      ]);

      phoneControl?.clearValidators();

    } else {

      phoneControl?.setValidators([
        Validators.required,
        Validators.pattern(/^[0-9]{10}$/)
      ]);

      emailControl?.clearValidators();

    }


    emailControl?.updateValueAndValidity();
    phoneControl?.updateValueAndValidity();

  }


  // ==========================================
  // SUBMIT LOGIN
  // ==========================================

  submit(): void {

    this.setLoginValidators();


    // Validate form
    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;

    }


    this.loading = true;
    this.errorMessage = '';


    const identifier =
      this.loginMode === 'email'
        ? this.form.get('email')?.value
        : this.form.get('phone')?.value;


    const password =
      this.form.get('password')?.value;


    const rememberMe =
      this.form.get('rememberMe')?.value;


    /*
      IMPORTANT:
      This sends either email or phone as the first value.

      This will work for phone login only if your backend
      supports phone-number authentication.
    */
    this.authService.login(identifier, password).subscribe({

      next: () => {

        this.loading = false;

        console.log(
          'Remember me:',
          rememberMe
        );

        this.router.navigate([
          '/dashboard'
        ]);

      },


      error: (err: any) => {

        this.loading = false;

        console.error(
          'Login error:',
          err
        );


        this.errorMessage =
          err?.error?.detail ||
          err?.error?.message ||
          'Login failed. Please check your credentials.';

      }

    });

  }


  // ==========================================
  // GOOGLE LOGIN
  // ==========================================

  loginWithGoogle(): void {

    console.log(
      'Google login clicked'
    );

    this.errorMessage =
      'Google login is not available yet.';

  }

}
