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
  pendingPolicies: number;
  rejectedPolicies: number;
  totalSchemes: number;
  activeSchemes: number;
  pendingSchemes: number;
  rejectedSchemes: number;
  totalViews: number;
  lastUpdated: string;
}

export interface DepartmentViewTotals {
  policy_views: number;
  scheme_views: number;
  total_views: number;
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

export interface SchemesByCategoryItem {
  label: string;
  percentage: number;
  count?: number;
}

export interface UserDistributionData {
  labels: string[];
  data: number[];
  colors: string[];
  total: string;
}

export interface AdminOverviewResponse {
  metrics: AnalyticsStat[];
  policyStatusTrend: TrendData;
  schemesByCategory: SchemesByCategoryItem[];
  userDistribution: UserDistributionData;
  recentActivities: RecentActivityItem[];
  notifications: NotificationActivityItem[];
}

export interface AdminPolicyAnalyticsResponse {
  stats: AnalyticsStat[];
  by_category: CategorySlice[];
  trend: TrendData;
  by_state: BarChartData[];
  by_ministry: BarChartData[];
  latest_policies: PolicyRow[];
}

export interface AdminSchemeAnalyticsResponse {
  stats: AnalyticsStat[];
  by_category: CategorySlice[];
  trend: TrendData;
  by_state: BarChartData[];
  by_ministry: BarChartData[];
  top_schemes: SchemeRow[];
  recent_updates: SchemeUpdateRow[];
}

export interface HeatmapData {
  days: string[];
  times: string[];
  cells: HeatmapCell[];
}

export interface AdminUserAnalyticsResponse {
  kpis: UserKpiCard[];
  growth_trend: TrendData;
  role_distribution: UserDistributionData;
  registration_trend: { labels: string[]; values: number[] };
  users_by_state: { labels: string[]; values: number[] };
  engagement_metrics: EngagementMetric[];
  heatmap: HeatmapData;
  recent_registered_users: RecentRegisteredUser[];
  top_active_users: TopActiveUser[];
}

export interface DepartmentTrendDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor?: string;
  tension?: number;
  fill?: boolean;
}

export interface AdminDepartmentAnalyticsResponse {
  departments_list: DepartmentItem[];
  all_departments_list: DepartmentItem[];
  selected_overview: DepartmentOverview;
  month_labels: string[];
  trend_datasets: DepartmentTrendDataset[];
  top_by_policies: BarChartData[];
  top_by_schemes: BarChartData[];
  performance_table: DepartmentPerformanceRow[];
  view_totals: DepartmentViewTotals;
}

export interface AdminUsageStatisticsResponse {
  kpis: UsageKpiCard[];
  activity_trend: TrendData;
  daily_usage: { labels: string[]; values: number[] };
  role_distribution: UserDistributionData;
  top_policies: TopSearchedItem[];
  top_schemes: TopSearchedItem[];
  most_active_users: MostActiveUserUsage[];
  recent_searches: RecentSearchActivityItem[];
}

