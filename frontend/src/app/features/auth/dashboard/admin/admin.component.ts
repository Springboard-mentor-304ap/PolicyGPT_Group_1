import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface StatCard {
  label: string;
  value: number;
  sublabel: string;
  icon: string;
  color: 'blue' | 'orange' | 'green' | 'purple';
}

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  hasSubmenu?: boolean;
}

export interface ListItem {
  id: number;
  title: string;
  ministry: string;
  icon?: string;
  iconClass?: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  userName: string = 'UserName';
  userRole: string = 'Admin';

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard/admin', icon: 'home' },
    { label: 'Policies', route: '/admin/policies', icon: 'policy', hasSubmenu: true },
    { label: 'Scheme', route: '/admin/schemes', icon: 'article', hasSubmenu: true },
    { label: 'Notifications', route: '/admin/notifications', icon: 'notifications_none' },
    { label: 'Users', route: '/admin/users', icon: 'group' },
    { label: 'Reports', route: '/admin/reports', icon: 'assessment' },
    { label: 'Audit Logs', route: '/admin/audit-logs', icon: 'history' }
  ];

  statCards: StatCard[] = [
    { label: 'Total Policies', value: 1242, sublabel: '+32 this week', icon: 'policy', color: 'blue' },
    { label: 'Total Schemes', value: 897, sublabel: '+18 this week', icon: 'article', color: 'orange' },
    { label: 'Total Users', value: 432, sublabel: '+2,154 this week', icon: 'person_outline', color: 'green' },
    { label: 'Applications', value: 321, sublabel: '+61 this week', icon: 'assignment', color: 'purple' }
  ];

  schemes: ListItem[] = [
    {
      id: 1,
      title: 'PM Surya Ghar Muft Bijli Yojana',
      ministry: 'Ministry of New & Renewable Energy',
      icon: 'wb_sunny',
      iconClass: 'sun'
    },
    {
      id: 2,
      title: 'Pradhan Mantri Jan Arogya Yojana (PM-JAY)',
      ministry: 'Ministry of Health & Family Welfare',
      icon: 'health_and_safety',
      iconClass: 'health'
    },
    {
      id: 3,
      title: 'PM Vishwakarma Yojana',
      ministry: 'Ministry of Micro, Small & Medium Enterprises',
      icon: 'engineering',
      iconClass: 'work'
    },
    {
      id: 4,
      title: 'Post Matric Scholarship Scheme',
      ministry: 'Ministry of Health & Family Welfare',
      icon: 'school',
      iconClass: 'edu'
    }
  ];

  policies: ListItem[] = [
    {
      id: 1,
      title: 'National Education Policy 2020',
      ministry: 'Ministry of Education'
    },
    {
      id: 2,
      title: 'Ayushman Bharat Policy',
      ministry: 'Ministry of Health & Family Welfare'
    },
    {
      id: 3,
      title: 'Electricity Act, 2003',
      ministry: 'Ministry of Power'
    }
  ];

  ngOnInit(): void {}
}