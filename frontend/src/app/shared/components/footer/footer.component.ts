import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnInit {
  currentYear = new Date().getFullYear();
  userRole = signal<string>('GUEST');

  constructor(private readonly authService: Auth) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole();
    if (role) {
      this.userRole.set(role.toUpperCase().trim());
    }
  }

  getFeedbackRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/feedback';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/feedback';
    if (r === 'researcher') return '/dashboard/researcher/feedback';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/feedback';
    if (r === 'citizen') return '/dashboard/citizen/feedback';
    return '/feedback';
  }

  getFaqRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/faqs';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/faqs';
    if (r === 'researcher') return '/dashboard/researcher/faqs';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/faqs';
    if (r === 'citizen') return '/dashboard/citizen/faqs';
    return '/faqs';
  }

  getPoliciesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/policies';
    if (r === 'government_official' || r === 'government') return '/government/policies';
    if (r === 'researcher') return '/dashboard/researcher/policies/search';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/policies';
    if (r === 'citizen') return '/dashboard/citizen/policies/search';
    return '/policies/search';
  }

  getSchemesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/schemes';
    if (r === 'government_official' || r === 'government') return '/government/schemes';
    if (r === 'researcher') return '/dashboard/researcher/schemes';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/schemes';
    if (r === 'citizen') return '/dashboard/citizen/schemes';
    return '/schemes/search';
  }

  getEligibilityRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'citizen') return '/dashboard/citizen/eligibility';
    return '/eligibility';
  }

  getCompareRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/compare';
    if (r === 'researcher') return '/dashboard/researcher/compare';
    if (r === 'citizen') return '/dashboard/citizen/compare';
    return '/compare';
  }
}
