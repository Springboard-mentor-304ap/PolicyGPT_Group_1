import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import {
  RecentActivityItem,
  NotificationActivityItem,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

@Component({
  selector: "app-admin-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./admin-dashboard.component.html",
  styleUrl: "./admin-dashboard.component.scss",
})
export class AdminDashboardComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);

  readonly isSampleData = this.dataService.isSampleData;

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");

  // Trend timeframe selection
  trendTimeframe = signal<string>("Last 9 Months");
  showTimeframeMenu = signal<boolean>(false);
  timeframeOptions = [
    "Last 3 Months",
    "Last 6 Months",
    "Last 9 Months",
    "Last 12 Months",
  ];

  // Policies Trend Line Chart Data
  trendLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  policiesTrendDatasets: LineDataset[] = [
    {
      label: "Approved",
      data: [75, 85, 112, 118, 125, 108, 115, 120, 140],
      borderColor: "#3cb371",
    },
    {
      label: "Pending",
      data: [35, 40, 42, 45, 48, 42, 40, 38, 45],
      borderColor: "#f5a524",
    },
    {
      label: "Rejected",
      data: [12, 14, 12, 15, 10, 12, 11, 10, 10],
      borderColor: "#e5484d",
    },
  ];

  // Schemes by Category
  schemesCategoryLabels = [
    "Agriculture (28%)",
    "Education (18%)",
    "Healthcare (15%)",
    "Social Welfare (12%)",
    "Employment (10%)",
    "Others (17%)",
  ];
  schemesCategoryData = [28, 18, 15, 12, 10, 17];

  // User Distribution
  userDistLabels = [
    "Citizens (77%)",
    "Government Officials (11%)",
    "Researchers (7%)",
    "Organizations (5%)",
    "Administrators (1%)",
  ];
  userDistData = [77, 11, 7, 5, 1];

  // Recent User Activity Data
  recentActivities: RecentActivityItem[] = [
    {
      user: "john.doe@example.com",
      action: "Logged in",
      time: "2 minutes ago",
      status: "Success",
    },
    {
      user: "priya.singh@gov.in",
      action: "Searched schemes",
      time: "5 minutes ago",
      status: "Success",
    },
    {
      user: "rahul.kumar@example.com",
      action: "Viewed policy",
      time: "12 minutes ago",
      status: "Success",
    },
    {
      user: "meera.sharma@org.in",
      action: "Downloaded document",
      time: "18 minutes ago",
      status: "Success",
    },
    {
      user: "amit.patel@example.com",
      action: "Submitted feedback",
      time: "25 minutes ago",
      status: "Success",
    },
  ];

  // Latest Notifications Data
  notifications: NotificationActivityItem[] = [
    {
      title: "New Agriculture Scheme Launched",
      type: "Scheme Update",
      typeClass: "blue",
      date: "2 hours ago",
      status: "Sent",
    },
    {
      title: "Policy Amendment Notification",
      type: "Policy Alert",
      typeClass: "purple",
      date: "5 hours ago",
      status: "Sent",
    },
    {
      title: "Application Deadline Reminder",
      type: "Deadline Reminder",
      typeClass: "orange",
      date: "1 day ago",
      status: "Sent",
    },
    {
      title: "New Guidelines Published",
      type: "Policy Update",
      typeClass: "purple",
      date: "2 days ago",
      status: "Sent",
    },
    {
      title: "System Maintenance Notice",
      type: "System Alert",
      typeClass: "red",
      date: "3 days ago",
      status: "Sent",
    },
  ];

  ngOnInit(): void {
    this.dataService.getAdminAnalytics().subscribe();
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  toggleTimeframeMenu(event: Event): void {
    event.stopPropagation();
    this.showTimeframeMenu.update((v) => !v);
  }

  selectTimeframe(option: string): void {
    this.trendTimeframe.set(option);
    this.showTimeframeMenu.set(false);

    if (option === "Last 3 Months") {
      this.trendLabels = ["Jul", "Aug", "Sep"];
      this.policiesTrendDatasets = [
        { label: "Approved", data: [115, 120, 140], borderColor: "#3cb371" },
        { label: "Pending", data: [40, 38, 45], borderColor: "#f5a524" },
        { label: "Rejected", data: [11, 10, 10], borderColor: "#e5484d" },
      ];
    } else if (option === "Last 6 Months") {
      this.trendLabels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
      this.policiesTrendDatasets = [
        {
          label: "Approved",
          data: [118, 125, 108, 115, 120, 140],
          borderColor: "#3cb371",
        },
        {
          label: "Pending",
          data: [45, 48, 42, 40, 38, 45],
          borderColor: "#f5a524",
        },
        {
          label: "Rejected",
          data: [15, 10, 12, 11, 10, 10],
          borderColor: "#e5484d",
        },
      ];
    } else {
      this.trendLabels = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
      ];
      this.policiesTrendDatasets = [
        {
          label: "Approved",
          data: [75, 85, 112, 118, 125, 108, 115, 120, 140],
          borderColor: "#3cb371",
        },
        {
          label: "Pending",
          data: [35, 40, 42, 45, 48, 42, 40, 38, 45],
          borderColor: "#f5a524",
        },
        {
          label: "Rejected",
          data: [12, 14, 12, 15, 10, 12, 11, 10, 10],
          borderColor: "#e5484d",
        },
      ];
    }
  }
}
