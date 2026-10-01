import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface MetricCard {
  title: string;
  value: string;
  change: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

interface SearchPolicy {
  id: number;
  title: string;
  searches: string;
  trend: string;
}

interface SearchScheme {
  id: number;
  title: string;
  searches: string;
  trend: string;
}

interface ActiveUser {
  id: number;
  user: string;
  role: string;
  activities: string;
}

interface SearchActivity {
  id: number;
  user: string;
  query: string;
  type: string;
  badgeClass: string;
  dateTime: string;
}

@Component({
  selector: 'app-usage-statistics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usage-statistics.component.html',
  styleUrls: ['./usage-statistics.component.scss']
})
export class UsageStatisticsComponent implements OnInit {

  // Top KPI Metrics
  topMetrics: MetricCard[] = [
    { title: 'Total Visits', value: '50,240', change: '↑ 18%', icon: 'bi bi-people-fill', iconBg: '#E8F0FE', iconColor: '#2563EB' },
    { title: 'Total Searches', value: '28,450', change: '↑ 12%', icon: 'bi bi-search', iconBg: '#F3E8FD', iconColor: '#9333EA' },
    { title: 'Policy Views', value: '18,500', change: '↑ 15%', icon: 'bi bi-file-earmark-text-fill', iconBg: '#FEF3C7', iconColor: '#D97706' },
    { title: 'Scheme Views', value: '22,000', change: '↑ 20%', icon: 'bi bi-layers-fill', iconBg: '#DCFCE7', iconColor: '#16A34A' },
    { title: 'Eligibility Checks', value: '12,800', change: '↑ 25%', icon: 'bi bi-check-circle-fill', iconBg: '#DCFCE7', iconColor: '#15803D' },
    { title: 'Document Downloads', value: '5,600', change: '↑ 10%', icon: 'bi bi-download', iconBg: '#DBEAFE', iconColor: '#1D4ED8' }
  ];

  // Role Distribution
  distribution = [
    { role: 'Citizens', percent: '77%', color: '#2563EB' },
    { role: 'Government Officials', percent: '11%', color: '#10B981' },
    { role: 'Researchers', percent: '7%', color: '#8B5CF6' },
    { role: 'Organizations', percent: '5%', color: '#F59E0B' },
    { role: 'Administrators', percent: '1%', color: '#EF4444' }
  ];

  // Top 10 Searched Policies
  topPolicies: SearchPolicy[] = [
    { id: 1, title: 'National Education Policy 2020', searches: '2,450', trend: '↑ 18%' },
    { id: 2, title: 'Digital India 2.0 Guidelines', searches: '1,980', trend: '↑ 12%' },
    { id: 3, title: 'PM Kisan Samman Nidhi', searches: '1,750', trend: '↑ 25%' },
    { id: 4, title: 'Ayushman Bharat Policy', searches: '1,620', trend: '↑ 10%' },
    { id: 5, title: 'New Labour Codes', searches: '1,480', trend: '↑ 8%' },
    { id: 6, title: 'National Health Mission', searches: '1,320', trend: '↑ 15%' },
    { id: 7, title: 'Startup India Policy', searches: '1,210', trend: '↑ 20%' },
    { id: 8, title: 'Right to Education Act', searches: '980', trend: '↑ 5%' },
    { id: 9, title: 'Atmanirbhar Bharat', searches: '860', trend: '↑ 12%' },
    { id: 10, title: 'Swachh Bharat Mission', searches: '750', trend: '↑ 18%' }
  ];

  // Top 10 Searched Schemes
  topSchemes: SearchScheme[] = [
    { id: 1, title: 'PM Kisan Samman Nidhi', searches: '2,980', trend: '↑ 22%' },
    { id: 2, title: 'Ayushman Bharat', searches: '2,450', trend: '↑ 18%' },
    { id: 3, title: 'PM Awas Yojana', searches: '2,100', trend: '↑ 15%' },
    { id: 4, title: 'PM Ujjwala Yojana', searches: '1,860', trend: '↑ 12%' },
    { id: 5, title: 'National Scholarship Portal', searches: '1,620', trend: '↑ 20%' },
    { id: 6, title: 'PM Mudra Yojana', searches: '1,450', trend: '↑ 10%' },
    { id: 7, title: 'PM Matru Vandana Yojana', searches: '1,200', trend: '↑ 8%' },
    { id: 8, title: 'Skill India Mission', searches: '980', trend: '↑ 15%' },
    { id: 9, title: 'Make in India', searches: '860', trend: '↑ 6%' },
    { id: 10, title: 'Stand Up India', searches: '750', trend: '↑ 9%' }
  ];

  // Most Active Users
  mostActiveUsers: ActiveUser[] = [
    { id: 1, user: 'rahul.kumar@example.com', role: 'Citizen', activities: '1,250' },
    { id: 2, user: 'priya.singh@gov.in', role: 'Govt. Official', activities: '980' },
    { id: 3, user: 'amit.patel@org.in', role: 'Organization', activities: '760' },
    { id: 4, user: 'neha.sharma@example.com', role: 'Citizen', activities: '690' },
    { id: 5, user: 'arjun.mehta@univ.ac.in', role: 'Researcher', activities: '620' },
    { id: 6, user: 'sneha.das@example.com', role: 'Citizen', activities: '580' },
    { id: 7, user: 'vikram.jain@gov.in', role: 'Govt. Official', activities: '540' },
    { id: 8, user: 'kavita.r@ngo.org', role: 'Organization', activities: '510' },
    { id: 9, user: 'rohit.verma@example.com', role: 'Citizen', activities: '480' },
    { id: 10, user: 'ananya@college.ac.in', role: 'Researcher', activities: '450' }
  ];

  // Recent Search Activity
  recentActivity: SearchActivity[] = [
    { id: 1, user: 'john.doe@example.com', query: 'PM Kisan Yojana', type: 'Scheme', badgeClass: 'badge-scheme', dateTime: 'Sep 30, 2024 10:24 AM' },
    { id: 2, user: 'priya.singh@gov.in', query: 'education policy 2020', type: 'Policy', badgeClass: 'badge-policy', dateTime: 'Sep 30, 2024 10:18 AM' },
    { id: 3, user: 'meera.sharma@org.in', query: 'scholarship for girls', type: 'Scheme', badgeClass: 'badge-scheme', dateTime: 'Sep 30, 2024 10:12 AM' },
    { id: 4, user: 'rahul.kumar@example.com', query: 'healthcare schemes', type: 'Scheme', badgeClass: 'badge-scheme', dateTime: 'Sep 30, 2024 10:05 AM' },
    { id: 5, user: 'amit.patel@gov.in', query: 'labour code', type: 'Policy', badgeClass: 'badge-policy', dateTime: 'Sep 30, 2024 09:58 AM' }
  ];

  ngOnInit(): void {}
}
