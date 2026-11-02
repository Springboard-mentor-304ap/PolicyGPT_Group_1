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

interface ActivityUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleClass: string;
  state?: string;
  joinDate?: string;
  logins?: number;
  searches?: number;
  lastActive?: string;
}

@Component({
  selector: 'app-user-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-analytics.component.html',
  styleUrls: ['./user-analytics.component.scss']
})
export class UserAnalyticsComponent implements OnInit {
  // Top KPI Metrics
  topMetrics: MetricCard[] = [
    { title: 'Total Users', value: '5,820', change: '↑ 18%', icon: 'bi-people-fill', iconBg: '#E8F0FE', iconColor: '#1A73E8' },
    { title: 'Active Users', value: '4,320', change: '↑ 22%', icon: 'bi-person-check-fill', iconBg: '#E6F4EA', iconColor: '#137333' },
    { title: 'New Users', value: '980', change: '↑ 15%', icon: 'bi-person-plus-fill', iconBg: '#F3E8FD', iconColor: '#9333EA' },
    { title: 'Government Officials', value: '640', change: '↑ 8%', icon: 'bi-building-fill', iconBg: '#FCE8E6', iconColor: '#C5221F' },
    { title: 'Organizations', value: '290', change: '↑ 12%', icon: 'bi-briefcase-fill', iconBg: '#FEF7E0', iconColor: '#B06000' },
    { title: 'Researchers', value: '410', change: '↑ 20%', icon: 'bi-journal-text', iconBg: '#E8F0FE', iconColor: '#1257C0' }
  ];

  // User Engagement Metrics
  engagementMetrics = [
    { title: 'Total Logins', value: '42,850', change: '↑ 25%', icon: 'bi-eye', iconBg: '#E8F0FE', iconColor: '#1A73E8' },
    { title: 'Total Searches', value: '28,450', change: '↑ 18%', icon: 'bi-search', iconBg: '#F3E8FD', iconColor: '#9333EA' },
    { title: 'Policies Viewed', value: '18,500', change: '↑ 20%', icon: 'bi-file-text', iconBg: '#FEF7E0', iconColor: '#B06000' },
    { title: 'Schemes Viewed', value: '22,000', change: '↑ 22%', icon: 'bi-layers-fill', iconBg: '#E6F4EA', iconColor: '#137333' }
  ];

  // Users by State Data
  stateData = [
    { state: 'Uttar Pradesh', count: 1020, percentage: 100 },
    { state: 'Maharashtra', count: 780, percentage: 76 },
    { state: 'Bihar', count: 520, percentage: 51 },
    { state: 'West Bengal', count: 410, percentage: 40 },
    { state: 'Madhya Pradesh', count: 380, percentage: 37 },
    { state: 'Rajasthan', count: 320, percentage: 31 },
    { state: 'Tamil Nadu', count: 280, percentage: 27 },
    { state: 'Gujarat', count: 260, percentage: 25 },
    { state: 'Karnataka', count: 240, percentage: 23.5 },
    { state: 'Others', count: 630, percentage: 61.7 }
  ];

  // Role Distribution Legend
  distribution = [
    { role: 'Citizens', percent: '77%', color: '#2563EB' },
    { role: 'Government Officials', percent: '11%', color: '#10B981' },
    { role: 'Researchers', percent: '7%', color: '#8B5CF6' },
    { role: 'Organizations', percent: '5%', color: '#F59E0B' },
    { role: 'Administrators', percent: '1%', color: '#EF4444' }
  ];

  // Heatmap Days & Time Slots
  days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  timeSlots = ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

  // Table 1: Recent Registered Users
  recentUsers: ActivityUser[] = [
    { id: 1, name: 'Rahul Sharma', email: 'rahul@example.com', role: 'Citizen', roleClass: 'badge-citizen', state: 'Uttar Pradesh', joinDate: 'Sep 29, 2024' },
    { id: 2, name: 'Priya Singh', email: 'priya@example.com', role: 'Researcher', roleClass: 'badge-researcher', state: 'Delhi', joinDate: 'Sep 29, 2024' },
    { id: 3, name: 'Amit Patel', email: 'amit@example.com', role: 'Govt. Official', roleClass: 'badge-govt', state: 'Gujarat', joinDate: 'Sep 28, 2024' },
    { id: 4, name: 'Sneha Das', email: 'sneha@example.com', role: 'Citizen', roleClass: 'badge-citizen', state: 'West Bengal', joinDate: 'Sep 28, 2024' },
    { id: 5, name: 'Vikram Mehta', email: 'vikram@example.com', role: 'Organization', roleClass: 'badge-org', state: 'Maharashtra', joinDate: 'Sep 27, 2024' }
  ];

  // Table 2: Top Active Users
  topUsers: ActivityUser[] = [
    { id: 1, name: 'rahul.kumar@example.com', email: '', role: 'Citizen', roleClass: 'badge-citizen', logins: 1250, searches: 980, lastActive: 'Sep 30, 2024' },
    { id: 2, name: 'priya.singh@gov.in', email: '', role: 'Govt. Official', roleClass: 'badge-govt', logins: 980, searches: 760, lastActive: 'Sep 30, 2024' },
    { id: 3, name: 'amit.patel@org.in', email: '', role: 'Organization', roleClass: 'badge-org', logins: 760, searches: 620, lastActive: 'Sep 29, 2024' },
    { id: 4, name: 'neha.sharma@example.com', email: '', role: 'Researcher', roleClass: 'badge-researcher', logins: 690, searches: 580, lastActive: 'Sep 29, 2024' },
    { id: 5, name: 'arjun.mehta@univ.ac.in', email: '', role: 'Researcher', roleClass: 'badge-researcher', logins: 620, searches: 540, lastActive: 'Sep 28, 2024' }
  ];

  heatmapGrid: number[][] = [];

  ngOnInit(): void {
    // Generates activity intensity levels (0 to 5) for 7 days x 16 intervals
    this.heatmapGrid = [
      [1, 1, 2, 4, 5, 4, 3, 2, 2, 3, 4, 3, 2, 1, 1, 1],
      [1, 1, 3, 5, 5, 4, 4, 3, 3, 4, 5, 4, 2, 1, 1, 1],
      [1, 2, 3, 4, 5, 5, 4, 3, 3, 4, 4, 3, 2, 1, 1, 1],
      [1, 1, 2, 5, 5, 4, 3, 3, 3, 5, 4, 3, 2, 1, 1, 1],
      [1, 1, 3, 4, 4, 3, 3, 2, 2, 4, 3, 2, 1, 1, 1, 0],
      [0, 0, 1, 2, 3, 3, 2, 2, 2, 3, 2, 1, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, 1, 0, 0, 0, 0]
    ];
  }

  getHeatmapColor(level: number): string {
    switch (level) {
      case 5: return '#1E40AF';
      case 4: return '#2563EB';
      case 3: return '#60A5FA';
      case 2: return '#93C5FD';
      case 1: return '#BFDBFE';
      default: return '#EFF6FF';
    }
  }
}
