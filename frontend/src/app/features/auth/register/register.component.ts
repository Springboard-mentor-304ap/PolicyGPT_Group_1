import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from "@angular/forms";

import { Auth } from "../../../core/services/auth";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { STATE_DISTRICT_MAP } from "../../../core/data/india-states";

@Component({
  selector: "app-register",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, SearchableSelectComponent],
  templateUrl: "./register.component.html",
  styleUrl: "./register.component.scss",
})
export class RegisterComponent {
  // ==========================================
  // BASIC VARIABLES
  // ==========================================

  loading = false;
  errorMessage = "";

  hidePassword = true;
  hideConfirmPassword = true;

  // ==========================================
  // STATES AND DISTRICTS DATA
  // ==========================================

  stateDistrictMap: { [state: string]: string[] } = STATE_DISTRICT_MAP;

  // ==========================================
  // NOW CREATE STATES
  // ==========================================

  states = Object.keys(this.stateDistrictMap);

  districts: string[] = [];

  // ==========================================
  // USER ROLES
  // ==========================================

  roles = [
    {
      value: "citizen",
      label: "Citizen",
    },
    {
      value: "researcher",
      label: "Researcher",
    },
    {
      value: "organization",
      label: "Organization",
    },
  ];

  // ==========================================
  // OCCUPATION OPTIONS
  // ==========================================

  occupations = [
    "Student",
    "Teacher / Professor",
    "Researcher",
    "Government Employee",
    "Private Sector Employee",
    "Business Owner",
    "Self-Employed",
    "Farmer",
    "Healthcare Professional",
    "Legal Professional",
    "Engineer / IT Professional",
    "Homemaker",
    "Retired",
    "Unemployed",
    "Other",
  ];

  // ==========================================
  // ORGANIZATION OPTIONS
  // ==========================================

  organizations = [
    "Government Organization",
    "Private Company",
    "Educational Institution",
    "Research Institution",
    "Non-Governmental Organization (NGO)",
    "Non-Profit Organization",
    "Healthcare Organization",
    "Financial Institution",
    "Startup",
    "Business / Enterprise",
    "Self-Employed",
    "Other",
  ];

  // ==========================================
  // FORM
  // ==========================================

  form: FormGroup;

  // ==========================================
  // CONSTRUCTOR
  // ==========================================

  constructor(
    private fb: FormBuilder,
    private authService: Auth,
    private router: Router,
  ) {
    this.form = this.fb.group(
      {
        name: ["", Validators.required],

        email: ["", [Validators.required, Validators.email]],

        phone: ["", [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],

        dob: ["", Validators.required],

        state: ["", Validators.required],

        district: [
          {
            value: "",
            disabled: true,
          },
          Validators.required,
        ],

        occupation: [""],

        organization: [""],

        password: [
          "",
          [
            Validators.required,
            Validators.minLength(8),
            this.passwordStrength.bind(this),
          ],
        ],

        confirmPassword: ["", Validators.required],

        role: ["", Validators.required],

        agreeTerms: [false, Validators.requiredTrue],
      },
      {
        validators: this.passwordsMatch.bind(this),
      },
    );

    // ==========================================
    // STATE → DISTRICT FLOW
    // ==========================================

    this.form.get("state")?.valueChanges.subscribe((selectedState: string) => {
      this.districts = this.stateDistrictMap[selectedState] || [];

      const districtControl = this.form.get("district");

      districtControl?.reset("");

      if (this.districts.length > 0) {
        districtControl?.enable();
      } else {
        districtControl?.disable();
      }
    });
  }

  // ==========================================
  // PASSWORD STRENGTH VALIDATOR
  // ==========================================

  passwordStrength(control: AbstractControl): ValidationErrors | null {
    const password = control.value || "";

    if (!password) {
      return null;
    }

    const hasLowercase = /[a-z]/.test(password);

    const hasUppercase = /[A-Z]/.test(password);

    const hasNumber = /[0-9]/.test(password);

    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const typeCount = [
      hasLowercase,
      hasUppercase,
      hasNumber,
      hasSpecial,
    ].filter(Boolean).length;

    return typeCount >= 3
      ? null
      : {
          passwordStrength: true,
        };
  }

  // ==========================================
  // PASSWORD MATCH VALIDATOR
  // ==========================================

  passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get("password")?.value;

    const confirmPassword = group.get("confirmPassword")?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword
      ? null
      : {
          passwordMismatch: true,
        };
  }

  // ==========================================
  // PASSWORD VISIBILITY
  // ==========================================

  togglePassword(): void {
    this.hidePassword = !this.hidePassword;
  }

  toggleConfirmPassword(): void {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }

  // ==========================================
  // SUBMIT REGISTRATION
  // ==========================================

  submit(): void {
    // Stop if form is invalid
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    this.loading = true;
    this.errorMessage = "";

    // getRawValue() includes disabled district
    const formData = this.form.getRawValue();

    console.log("Registration data:", formData);

    this.authService
      .register({
        name: formData.name,

        email: formData.email,

        phone: formData.phone,

        password: formData.password,

        confirmPassword: formData.confirmPassword,

        dob: formData.dob,

        state: formData.state,

        district: formData.district,

        occupation: formData.occupation || "",

        organization: formData.organization || "",

        role: formData.role,
      })
      .subscribe({
        // ======================================
        // SUCCESS
        // ======================================

        next: () => {
          this.loading = false;

          this.router.navigate(["/auth/login"]);
        },

        // ======================================
        // ERROR
        // ======================================

        error: (err: any) => {
          this.loading = false;

          console.error("Registration error:", err);

          this.errorMessage =
            err?.error?.detail ||
            err?.error?.message ||
            err?.message ||
            "Registration failed. Please try again.";
        },
      });
  }
}
