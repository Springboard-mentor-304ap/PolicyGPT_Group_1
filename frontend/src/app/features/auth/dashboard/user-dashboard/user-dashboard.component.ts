import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface StatCard {
  label: string;
  value: number;
  sublabel: string;
  icon: string;
  color: 'blue' | 'orange' | 'green' | 'blue-alt';
}

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  hasSubmenu?: boolean;
}

export interface SchemeItem {
  id: number;
  title: string;
  ministry: string;
  icon: string;
  iconClass: string;
}

export interface PolicyItem {
  id: number;
  title: string;
  ministry: string;
  savedDate: string;
}

export interface SearchHistoryItem {
  id: number;
  query: string;
  filters: string;
}

export interface ApplicationStatusItem {
  id: number;
  title: string;
  applicationId: string;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.scss'
})
export class UserDashboardComponent implements OnInit {
  userName: string = 'UserName';
  userRole: string = 'User Role';

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard/user', icon: 'home' },
    { label: 'Search Policies', route: '/policies/search', icon: 'manage_search', hasSubmenu: true },
    { label: 'Search Schemes', route: '/schemes/search', icon: 'manage_search', hasSubmenu: true },
    { label: 'Eligibility Checker', route: '/eligibility', icon: 'verified_user' },
    { label: 'Compare', route: '/compare', icon: 'compare_arrows' },
    { label: 'Saved Items', route: '/saved-items', icon: 'bookmark_border' },
    { label: 'Notifications', route: '/notifications', icon: 'notifications_none' },
    { label: 'Search History', route: '/search-history', icon: 'history' },
    { label: 'Reports / Status', route: '/reports-status', icon: 'assessment' },
    { label: 'Support', route: '/support', icon: 'support_agent' }
  ];

  statCards: StatCard[] = [
    { label: 'Searches This Month', value: 12, sublabel: '+ 20% from last month', icon: 'search', color: 'blue' },
    { label: 'Saved Items', value: 8, sublabel: 'Policies & Schemes', icon: 'bookmark_border', color: 'orange' },
    { label: 'Eligible Schemes', value: 10, sublabel: 'Based on your profile', icon: 'verified_user', color: 'green' },
    { label: 'Applications', value: 3, sublabel: 'In progress', icon: 'search', color: 'blue-alt' }
  ];

  eligibleSchemes: SchemeItem[] = [
    {
      id: 1,
      title: 'Pradhan Mantri Jan Arogya Yojana (PM-JAY)',
      ministry: 'Ministry of Health & Family Welfare',
      icon: 'health_and_safety',
      iconClass: 'health'
    },
    {
      id: 2,
      title: 'PM Surya Ghar Muft Bijli Yojana',
      ministry: 'Ministry of New & Renewable Energy',
      icon: 'wb_sunny',
      iconClass: 'sun'
    },
    {
      id: 3,
      title: 'Post Matric Scholarship Scheme',
      ministry: 'Ministry of Health & Family Welfare',
      icon: 'school',
      iconClass: 'edu'
    },
    {
      id: 4,
      title: 'PM Vishwakarma Yojana',
      ministry: 'Ministry of Micro, Small & Medium Enterprises',
      icon: 'engineering',
      iconClass: 'work'
    }
  ];

  savedPolicies: PolicyItem[] = [
    {
      id: 1,
      title: 'National Education Policy 2020',
      ministry: 'Ministry of Education',
      savedDate: 'Saved on 20 May 2026'
    },
    {
      id: 2,
      title: 'Ayushman Bharat Policy',
      ministry: 'Ministry of Health & Family Welfare',
      savedDate: 'Saved on 18 May 2026'
    },
    {
      id: 3,
      title: 'Electricity Act, 2003',
      ministry: 'Ministry of Power',
      savedDate: 'Saved on 15 May 2025'
    }
  ];

  searchHistory: SearchHistoryItem[] = [
    { id: 1, query: 'Ayushman Bharat', filters: 'Filters: Scheme • Health' },
    { id: 2, query: 'Scholarship for students', filters: 'Filters: Scheme • Education • Central' },
    { id: 3, query: 'Solar energy scheme', filters: 'Filters: Scheme • Renewable Energy' },
    { id: 4, query: 'Pension schemes for senior citizens', filters: 'Filters: Scheme • Social Welfare' }
  ];

  applications: ApplicationStatusItem[] = [
    { id: 1, title: 'PM Kisan Samman Nidhi', applicationId: 'Application ID: APP1234567890' },
    { id: 2, title: 'Post Matric Scholarship Scheme', applicationId: 'Application ID: APP1234567889' },
    { id: 3, title: 'PM Awas Yojana (Gramin)', applicationId: 'Application ID: APP1234567888' }
  ];

  ngOnInit(): void {}
}