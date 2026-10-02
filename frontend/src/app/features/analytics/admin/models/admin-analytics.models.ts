export interface AnalyticsStat {
  label: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  goodWhenDown?: boolean;
}

export interface CategorySlice {
  label: string;
  percentage: number;
}

export interface TrendSeries {
  label: string;
  data: number[];
  color: string;
}

export interface TrendData {
  labels: string[];
  series: TrendSeries[];
}

export interface BarChartData {
  label: string;
  value: number;
}

export interface PolicyRow {
  title: string;
  ministry: string;
  state: string;
  category: string;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Archived' | string;
  date: string;
}

export interface SchemeRow {
  rank: number;
  name: string;
  ministry: string;
  views: number;
  applications: number;
}

export interface SchemeUpdateRow {
  title: string;
  ministry: string;
  type: 'Update' | 'Notification' | 'New Scheme' | string;
  date: string;
  status: 'Active' | 'Pending' | 'Inactive' | string;
}

export interface DepartmentOverview {
  title: string;
  totalPolicies: number;
  activePolicies: number;
  pendingPolicies: number;
  rejectedPolicies: number;
  totalSchemes: number;
  activeSchemes: number;
  pendingSchemes: number;
  rejectedSchemes: number;
}

export interface DepartmentItem {
  id: string;
  name: string;
  count: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  overview: DepartmentOverview;
}

export interface DepartmentPerformanceRow {
  rank: number;
  name: string;
  totalPolicies: number;
  activePolicies: number;
  totalSchemes: number;
  activeSchemes: number;
  totalViews: string;
  downloads: string;
  lastUpdated: string;
}

export interface RecentActivityItem {
  user: string;
  action: string;
  time: string;
  status: string;
}

export interface NotificationActivityItem {
  title: string;
  type: string;
  typeClass: string;
  date: string;
  status: string;
}

export interface UserKpiCard {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtext?: string;
  icon: string;
  iconClass: string;
}

export interface EngagementMetric {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: string;
  iconClass: string;
}

export interface HeatmapCell {
  day: string;
  time: string;
  hour: number;
  dayIndex: number;
  value: number;
  level: number; // 0 to 4
}

export interface RecentRegisteredUser {
  rank: number;
  name: string;
  email: string;
  role: 'Citizen' | 'Researcher' | 'Govt. Official' | 'Organization' | 'Administrator' | string;
  state: string;
  joinDate: string;
}

export interface TopActiveUser {
  rank: number;
  name: string;
  email?: string;
  role: 'Citizen' | 'Researcher' | 'Govt. Official' | 'Organization' | 'Administrator' | string;
  logins: number;
  searches: number;
  lastActive: string;
}

export interface UsageKpiCard {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtext?: string;
  icon: string;
  iconClass: string;
}

export interface TopSearchedItem {
  rank: number;
  title: string;
  searches: string;
  trend: string;
  isPositive: boolean;
}

export interface MostActiveUserUsage {
  rank: number;
  user: string;
  role: 'Citizen' | 'Govt. Official' | 'Organization' | 'Researcher' | 'Administrator' | string;
  activities: string;
}

export interface RecentSearchActivityItem {
  rank: number;
  user: string;
  query: string;
  type: 'Scheme' | 'Policy' | string;
  dateTime: string;
}

