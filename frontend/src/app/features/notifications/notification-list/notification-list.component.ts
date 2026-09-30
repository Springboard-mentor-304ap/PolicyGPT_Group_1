import { Component, OnInit, OnDestroy, ChangeDetectorRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";
import { Subscription } from "rxjs";

import { NotificationService } from "../../../core/services/notification.service";
import { Auth, AuthUser } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import {
  AdminNotificationStats,
  NotificationDeliveryRecord,
  NotificationItem,
  NotificationListResponse,
  NotificationSummary,
  NotificationTab,
  NotificationQueryParams,
} from "../../../core/models/notification.model";

@Component({
  selector: "app-notification-list",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: "./notification-list.component.html",
  styleUrls: ["./notification-list.component.scss"],
})
export class NotificationListComponent implements OnInit, OnDestroy {
  // State
  currentUser: AuthUser | null = null;
  userRole: string = "CITIZEN";
  isAdmin = false;
  isGuest = false;

  loading = true;
  errorMessage = "";

  // Data
  notifications: NotificationItem[] = [];
  selectedNotification: NotificationItem | null = null;
  summary: NotificationSummary = { total: 0, unread: 0, read: 0, this_week: 0 };

  // Admin Diagnostics & Delivery State
  adminStats: AdminNotificationStats | null = null;
  adminDeliveries: NotificationDeliveryRecord[] = [];
  loadingAdminStats = false;
  testEmailAddress = "";
  testPhoneNumber = "";
  testingEmail = false;
  testingSms = false;
  deliveryFilterChannel = "ALL";
  deliveryFilterStatus = "ALL";

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  totalItems = 0;

  // Tabs & Filters
  activeTab = "all";
  tabs: NotificationTab[] = [];

  searchQuery = "";
  sortBy = "latest";

  showFiltersDropdown = false;
  filterReadStatus: string = "all"; // 'all', 'unread', 'read'
  filterPriority: string = "ALL"; // 'ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'
  filterChannel: string = "ALL"; // 'ALL', 'IN_APP', 'EMAIL', 'SMS'
  filterDateRange: string = ""; // '', 'today', 'this_week', 'this_month'

  // Overflow menu state per item
  activeMenuId: number | null = null;

  private routeSub?: Subscription;
  private paramsSub?: Subscription;
  private liveSub?: Subscription;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getStoredUser();
    let currentRole = (this.authService.getUserRole() || "")
      .toUpperCase()
      .trim();
    if (!currentRole) {
      const url = this.router.url;
      if (url.includes("/admin")) currentRole = "ADMIN";
      else if (url.includes("/government")) currentRole = "GOVERNMENT_OFFICIAL";
      else if (url.includes("/researcher")) currentRole = "RESEARCHER";
      else if (url.includes("/organization")) currentRole = "ORGANIZATION";
      else if (url.includes("/citizen")) currentRole = "CITIZEN";
    }
    this.userRole = currentRole || "CITIZEN";
    this.isAdmin =
      this.userRole === "ADMIN" || this.userRole === "ADMINISTRATOR";
    this.isGuest =
      this.authService.isGuest() ||
      (!this.authService.isLoggedIn() && !this.authService.getToken());

    if (this.isGuest) {
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // Initialize dynamic role tabs
    this.initRoleTabs();

    // Subscribe to live pushes so new notifications appear without a refresh.
    this.setupLiveUpdates();

    // Check route param :id or query params ?id=
    const routeParamVal =
      this.route.snapshot?.params?.["id"] ||
      this.route.snapshot?.paramMap?.get("id");
    const routeId = routeParamVal ? parseInt(routeParamVal, 10) : null;
    const queryId = this.route.snapshot?.queryParams?.["id"]
      ? parseInt(this.route.snapshot.queryParams["id"], 10)
      : null;
    const initialId = routeId || queryId;

    // Check if directly navigating to delivery monitoring
    const toDeliveries =
      this.isAdmin &&
      (this.router.url.includes("/delivery") ||
        this.route.snapshot?.queryParams?.["tab"] === "deliveries");
    if (toDeliveries) {
      // The deliveries tab never calls getNotifications(), so refresh the
      // top bar / bell badge with a dedicated request on this path only.
      this.notificationService.getUnreadCount().subscribe({
        next: () => this.cdr.detectChanges(),
        error: () => {},
      });
      this.selectTab("deliveries");
    } else {
      // getNotifications() already syncs the bell badge via tap, so no
      // extra /unread-count request is needed on this path.
      this.loadNotifications(initialId);
    }

    // Watch query param changes
    if (this.route?.queryParams) {
      this.routeSub = this.route.queryParams.subscribe((params) => {
        if (params["id"]) {
          const paramId = parseInt(params["id"], 10);
          if (
            paramId &&
            paramId !== this.selectedNotification?.notification_id
          ) {
            const match = this.notifications.find(
              (n) => n.notification_id === paramId,
            );
            if (match) {
              this.openDetail(match);
            } else {
              this.fetchDetailById(paramId);
            }
          }
        } else if (!params["id"] && this.selectedNotification) {
          // User clicked Back or navigated to list
          this.selectedNotification = null;
          this.cdr.detectChanges();
        }
      });
    }

    // Watch route params e.g. /notifications/:id
    if (this.route?.params) {
      this.paramsSub = this.route.params.subscribe((params) => {
        if (params["id"]) {
          const paramId = parseInt(params["id"], 10);
          if (
            paramId &&
            paramId !== this.selectedNotification?.notification_id
          ) {
            const match = this.notifications.find(
              (n) => n.notification_id === paramId,
            );
            if (match) {
              this.openDetail(match);
            } else {
              this.fetchDetailById(paramId);
            }
          }
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.paramsSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  /**
   * Live updates. A new notification prepends itself to the currently loaded
   * page only when the user is on the first page, has no active search or
   * filter, and is not on a category tab the new item may not belong to.
   * Re-fetching instead in all those cases would either reshuffle a paginated
   * list under the cursor or drop an item that does not match the filter.
   */
  private setupLiveUpdates(): void {
    this.notificationService.startRealtime();

    this.liveSub = this.notificationService.liveNotification$.subscribe(
      (item) => {
        if (!this.canPrependLive(item)) {
          return;
        }

        this.notifications = [item, ...this.notifications].slice(
          0,
          this.pageSize,
        );
        this.totalItems += 1;
        this.summary.total += 1;
        this.summary.unread += 1;
        this.cdr.detectChanges();
      },
    );
  }

  private canPrependLive(item: NotificationItem): boolean {
    // A non-'all' tab is a category filter, so a new item may not belong in it.
    if (this.activeTab !== "all") {
      return false;
    }
    // Prepending into page 3+ would push the user's current page around.
    if (this.currentPage !== 1) {
      return false;
    }
    // Any active filter could exclude the new item, so let the server decide.
    if (
      this.searchQuery ||
      this.filterReadStatus !== "all" ||
      this.filterPriority !== "ALL" ||
      this.filterChannel !== "ALL" ||
      this.filterDateRange
    ) {
      return false;
    }
    return !this.notifications.some(
      (n) => n.notification_id === item.notification_id,
    );
  }

  // ============================================================
  // ROLE-AWARE TABS INITIALIZATION (Section 13)
  // ============================================================

  private initRoleTabs(): void {
    if (this.isAdmin) {
      this.tabs = [
        { id: "all", label: "All" },
        { id: "policy_requests", label: "Policy Requests" },
        { id: "scheme_requests", label: "Scheme Requests" },
        { id: "user_alerts", label: "User Alerts" },
        { id: "feedback_issues", label: "Feedback & Issues" },
        { id: "system_alerts", label: "System Alerts" },
        { id: "deliveries", label: "Delivery Monitoring" },
      ];
    } else if (
      this.userRole === "GOVERNMENT_OFFICIAL" ||
      this.userRole === "GOVERNMENT_OFFICER" ||
      this.userRole === "GOVERNMENT"
    ) {
      this.tabs = [
        { id: "all", label: "All" },
        { id: "policy_decisions", label: "Policy Decisions" },
        { id: "scheme_decisions", label: "Scheme Decisions" },
        { id: "request_decisions", label: "Request Decisions" },
      ];
    } else {
      // CITIZEN, RESEARCHER, ORGANIZATION
      this.tabs = [
        { id: "all", label: "All" },
        { id: "policy_alerts", label: "Policies" },
        { id: "scheme_updates", label: "Schemes" },
        { id: "deadline_reminders", label: "Deadline Reminders" },
      ];
    }
  }

  // ============================================================
  // LOAD NOTIFICATIONS (Runs immediately on page load)
  // ============================================================

  loadNotifications(targetIdToSelect?: number | null): void {
    this.loading = true;
    this.errorMessage = "";

    const queryParams: NotificationQueryParams = {
      search: this.searchQuery.trim() || undefined,
      category: this.activeTab !== "all" ? this.activeTab : undefined,
      sort_by: this.sortBy,
      page: this.currentPage,
      page_size: this.pageSize,
    };

    if (this.filterReadStatus === "unread") {
      queryParams.is_read = false;
    } else if (this.filterReadStatus === "read") {
      queryParams.is_read = true;
    }

    if (this.filterPriority !== "ALL") {
      queryParams.priority = this.filterPriority;
    }
    if (this.filterChannel !== "ALL") {
      queryParams.channel = this.filterChannel;
    }
    if (this.filterDateRange) {
      queryParams.date_range = this.filterDateRange;
    }

    this.notificationService.getNotifications(queryParams).subscribe({
      next: (res: NotificationListResponse) => {
        this.notifications = res.items || [];
        this.totalItems = res.total;
        this.totalPages = res.total_pages || 1;
        this.summary = res.summary || {
          total: res.total,
          unread: res.unread_count,
          read: Math.max(0, res.total - res.unread_count),
          this_week: res.total,
        };

        // If target ID was explicitly requested in URL (e.g. /notifications/102 or ?id=102)
        if (targetIdToSelect) {
          const match = this.notifications.find(
            (n) => n.notification_id === targetIdToSelect,
          );
          if (match) {
            this.openDetail(match);
          } else {
            this.fetchDetailById(targetIdToSelect);
          }
        } else {
          // IMPORTANT: Do NOT auto-select notification.
          // The list must remain FULL WIDTH until user clicks an item!
          this.selectedNotification = null;
        }

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err.status === 401) {
          this.errorMessage = "Please sign in to view your notifications.";
        } else if (err.status === 403) {
          this.errorMessage =
            "You don't have permission to access notifications.";
        } else {
          this.errorMessage =
            "Unable to load notifications. Please check your connection and try again.";
        }
        this.cdr.detectChanges();
      },
    });
  }

  // ============================================================
  // FULL-WIDTH DETAIL & SELECTION ACTIONS
  // ============================================================

  selectNotification(item: NotificationItem): void {
    this.openDetail(item);
  }

  openDetail(item: NotificationItem): void {
    this.selectedNotification = item;
    this.cdr.detectChanges();

    // Automatically mark read if unread
    if (!item.is_read) {
      this.markItemAsRead(item);
    }

    // Fetch full enriched detail from backend to get live entity fields
    this.notificationService
      .getNotificationById(item.notification_id)
      .subscribe({
        next: (fullDetail) => {
          this.selectedNotification = { ...item, ...fullDetail };
          this.cdr.detectChanges();
        },
        error: () => {
          // Fallback to item
        },
      });

    // Update query params to reflect open notification if not on direct :id route
    if (!this.route.snapshot.params?.["id"]) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { id: item.notification_id },
        queryParamsHandling: "merge",
      });
    }
  }

  fetchDetailById(id: number): void {
    this.notificationService.getNotificationById(id).subscribe({
      next: (detail) => {
        this.selectedNotification = detail;
        if (!detail.is_read) {
          this.markItemAsRead(detail);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.selectedNotification = null;
        this.cdr.detectChanges();
      },
    });
  }

  backToList(): void {
    this.selectedNotification = null;
    this.cdr.detectChanges();

    // If on a dedicated detail route e.g. /notifications/102, navigate up to /notifications
    if (this.route.snapshot.params?.["id"]) {
      this.router.navigate(["../"], { relativeTo: this.route });
    } else {
      // Clear id from query params without re-fetching
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { id: null },
        queryParamsHandling: "merge",
      });
    }
  }

  // ============================================================
  // TAB & FILTER ACTIONS
  // ============================================================

  selectTab(tabId: string): void {
    if (this.activeTab === tabId) return;
    this.activeTab = tabId;
    this.selectedNotification = null;
    this.cdr.detectChanges();
    if (tabId === "deliveries") {
      this.loadAdminData();
    } else {
      this.currentPage = 1;
      this.loadNotifications();
    }
  }

  // ============================================================
  // ADMIN DELIVERY MONITORING & TEST ENDPOINTS
  // ============================================================

  loadAdminData(): void {
    if (!this.isAdmin) return;
    this.loadingAdminStats = true;
    this.notificationService.getAdminStatistics().subscribe({
      next: (stats) => {
        this.adminStats = stats;
        this.loadingAdminStats = false;
      },
      error: () => {
        this.loadingAdminStats = false;
        this.toastService.error("Error", "Unable to load delivery statistics");
      },
    });

    this.notificationService.getAdminDeliveries(50).subscribe({
      next: (res) => {
        this.adminDeliveries = res.items || [];
      },
      error: () => {},
    });
  }

  get filteredAdminDeliveries(): NotificationDeliveryRecord[] {
    return this.adminDeliveries.filter((d) => {
      const matchChannel =
        this.deliveryFilterChannel === "ALL" ||
        d.channel === this.deliveryFilterChannel;
      const matchStatus =
        this.deliveryFilterStatus === "ALL" ||
        d.status === this.deliveryFilterStatus;
      return matchChannel && matchStatus;
    });
  }

  sendTestEmail(): void {
    if (!this.testEmailAddress || !this.testEmailAddress.includes("@")) {
      this.toastService.warning(
        "Validation",
        "Please enter a valid email address",
      );
      return;
    }
    this.testingEmail = true;
    this.notificationService.testEmail(this.testEmailAddress).subscribe({
      next: (res) => {
        this.testingEmail = false;
        if (res.success) {
          this.toastService.success(
            "Email Sent",
            `Test email dispatched successfully (ID: ${res.message_id || "N/A"})`,
          );
        } else {
          this.toastService.error(
            "Email Failed",
            res.error || "Failed to dispatch test email",
          );
        }
        this.loadAdminData();
      },
      error: (err) => {
        this.testingEmail = false;
        this.toastService.error(
          "Error",
          err?.error?.detail || "Failed to send test email",
        );
      },
    });
  }

  sendTestSms(): void {
    if (!this.testPhoneNumber || this.testPhoneNumber.length < 10) {
      this.toastService.warning(
        "Validation",
        "Please enter a valid mobile number",
      );
      return;
    }
    this.testingSms = true;
    this.notificationService.testSms(this.testPhoneNumber).subscribe({
      next: (res) => {
        this.testingSms = false;
        if (res.success) {
          this.toastService.success(
            "SMS Sent",
            `Test SMS dispatched successfully (ID: ${res.message_id || "N/A"})`,
          );
        } else {
          this.toastService.error(
            "SMS Failed",
            res.error || "Failed to dispatch test SMS",
          );
        }
        this.loadAdminData();
      },
      error: (err) => {
        this.testingSms = false;
        this.toastService.error(
          "Error",
          err?.error?.detail || "Failed to send test SMS",
        );
      },
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadNotifications();
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.currentPage = 1;
    this.loadNotifications();
  }

  onSortChange(): void {
    this.currentPage = 1;
    this.loadNotifications();
  }

  toggleFiltersDropdown(): void {
    this.showFiltersDropdown = !this.showFiltersDropdown;
  }

  applyFilters(): void {
    this.showFiltersDropdown = false;
    this.currentPage = 1;
    this.loadNotifications();
  }

  resetFilters(): void {
    this.filterReadStatus = "all";
    this.filterPriority = "ALL";
    this.filterChannel = "ALL";
    this.filterDateRange = "";
    this.showFiltersDropdown = false;
    this.currentPage = 1;
    this.loadNotifications();
  }

  get hasActiveFilters(): boolean {
    return (
      this.filterReadStatus !== "all" ||
      this.filterPriority !== "ALL" ||
      this.filterChannel !== "ALL" ||
      !!this.filterDateRange
    );
  }

  // ============================================================
  // PAGINATION CONTROLS
  // ============================================================

  get startItem(): number {
    if (this.totalItems === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.loadNotifications();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  changePageSize(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 1;
    this.loadNotifications();
  }

  // ============================================================
  // NOTIFICATION ACTIONS
  // ============================================================

  markItemAsRead(item: NotificationItem, event?: Event): void {
    event?.stopPropagation();
    this.closeMenus();

    this.notificationService.markAsRead(item.notification_id).subscribe({
      next: () => {
        item.is_read = true;
        if (this.summary.unread > 0) {
          this.summary.unread--;
          this.summary.read++;
        }
      },
      error: () => {
        this.toastService.error("Error", "Unable to mark notification as read");
      },
    });
  }

  markItemAsUnread(item: NotificationItem, event?: Event): void {
    event?.stopPropagation();
    this.closeMenus();

    this.notificationService.markAsUnread(item.notification_id).subscribe({
      next: () => {
        item.is_read = false;
        this.summary.unread++;
        if (this.summary.read > 0) this.summary.read--;
      },
      error: () => {
        this.toastService.error(
          "Error",
          "Unable to mark notification as unread",
        );
      },
    });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe({
      next: (res: { message: string; updated_count: number }) => {
        this.notifications.forEach((n) => (n.is_read = true));
        this.summary.read += this.summary.unread;
        this.summary.unread = 0;
        this.toastService.success(
          "Success",
          res.message || "All notifications marked as read",
        );
      },
      error: () => {
        this.toastService.error(
          "Error",
          "Unable to mark all notifications as read",
        );
      },
    });
  }

  deleteItem(item: NotificationItem, event?: Event): void {
    event?.stopPropagation();
    this.closeMenus();

    this.notificationService
      .deleteNotification(item.notification_id)
      .subscribe({
        next: () => {
          this.notifications = this.notifications.filter(
            (n) => n.notification_id !== item.notification_id,
          );
          if (
            this.selectedNotification?.notification_id === item.notification_id
          ) {
            this.selectedNotification = null;
          }
          if (!item.is_read && this.summary.unread > 0) {
            this.summary.unread--;
          }
          this.summary.total = Math.max(0, this.summary.total - 1);
          this.toastService.info(
            "Deleted",
            "Notification deleted successfully",
          );
        },
        error: () => {
          this.toastService.error("Error", "Unable to delete notification");
        },
      });
  }

  // ============================================================
  // OVERFLOW MENU
  // ============================================================

  toggleMenu(notificationId: number, event: Event): void {
    event.stopPropagation();
    if (this.activeMenuId === notificationId) {
      this.activeMenuId = null;
    } else {
      this.activeMenuId = notificationId;
    }
  }

  closeMenus(): void {
    this.activeMenuId = null;
  }

  // ============================================================
  // NAVIGATION HELPERS FOR ACTION BUTTONS (Section 23)
  // ============================================================

  getRolePrefix(): string {
    const url = this.router.url || "";
    if (url.includes("/dashboard/admin") || url.includes("/admin/"))
      return "admin";
    if (url.includes("/dashboard/government") || url.includes("/government/"))
      return "government";
    if (url.includes("/dashboard/researcher") || url.includes("/researcher/"))
      return "researcher";
    if (
      url.includes("/dashboard/organization") ||
      url.includes("/organization/")
    )
      return "organization";
    if (url.includes("/dashboard/citizen") || url.includes("/citizen/"))
      return "citizen";
    if (url.includes("/dashboard/guest") || url.includes("/guest/"))
      return "guest";

    const role = (this.userRole || this.authService.getUserRole() || "")
      .toUpperCase()
      .trim();
    if (
      role === "ADMIN" ||
      role === "ADMINISTRATOR" ||
      role === "ADMINISTRATOR_ROLE"
    )
      return "admin";
    if (
      role === "GOVERNMENT_OFFICIAL" ||
      role === "GOVERNMENT_OFFICER" ||
      role === "GOVERNMENT" ||
      role === "GOVT"
    ) {
      return "government";
    }
    if (role === "RESEARCHER") return "researcher";
    if (role === "ORGANIZATION" || role === "ORGANISATION")
      return "organization";
    if (this.isGuest || this.authService.isGuest()) return "guest";
    return "citizen";
  }

  navigateToHome(): void {
    const prefix = this.getRolePrefix();
    this.router.navigate([`/dashboard/${prefix}`]);
  }

  navigateToPreferences(): void {
    const prefix = this.getRolePrefix();
    this.router.navigate([`/dashboard/${prefix}/notifications/preferences`]);
  }

  navigateToResource(item: NotificationItem): void {
    if (item.action_url) {
      this.router.navigateByUrl(item.action_url);
      return;
    }

    const prefix = this.getRolePrefix();
    if (
      item.related_policy_id ||
      (item.entity_type === "POLICY" && item.entity_id)
    ) {
      const pid = item.related_policy_id || item.entity_id;
      this.router.navigate([`/dashboard/${prefix}/policies`, pid]);
    } else if (
      item.related_scheme_id ||
      (item.entity_type === "SCHEME" && item.entity_id)
    ) {
      const sid = item.related_scheme_id || item.entity_id;
      this.router.navigate([`/dashboard/${prefix}/schemes`, sid]);
    } else if (item.entity_type === "USER") {
      this.router.navigate(["/dashboard/admin/users"]);
    } else if (item.notification_type.includes("DELIVERY")) {
      this.selectTab("deliveries");
    } else {
      this.router.navigate([`/dashboard/${prefix}`]);
    }
  }

  getActionLabel(item: NotificationItem): string {
    const type = (item.notification_type || "").toUpperCase();

    // Requests requiring Admin review
    if (type.includes("APPROVAL_REQUEST") || type.includes("PENDING_REQUEST")) {
      return type.includes("SCHEME") ? "Review Scheme" : "Review Policy";
    }
    if (type.includes("DELETE_REQUEST") || type.includes("ARCHIVE_REQUEST")) {
      return "Review Request";
    }

    // Approved / Rejected / Decisions
    if (
      type === "POLICY_APPROVED" ||
      type === "POLICY_REJECTED" ||
      type === "NEW_POLICY" ||
      type === "POLICY_UPDATE"
    ) {
      return "View Policy";
    }
    if (
      type === "SCHEME_APPROVED" ||
      type === "SCHEME_REJECTED" ||
      type === "NEW_SCHEME" ||
      type === "SCHEME_UPDATE"
    ) {
      return "View Scheme";
    }
    if (type.includes("DEADLINE")) {
      return "Apply / View Scheme";
    }
    if (type === "REQUEST_APPROVED" || type === "REQUEST_REJECTED") {
      return item.entity_type === "POLICY" ? "View Policy" : "View Scheme";
    }
    if (type.includes("USER")) {
      return "Manage Users";
    }
    if (type.includes("FEEDBACK")) {
      return "Review Feedback";
    }
    if (type.includes("DELIVERY")) {
      return "View Delivery Monitoring";
    }

    return "View Details";
  }

  // ============================================================
  // VISUAL ICON & BADGE HELPERS
  // ============================================================

  getNotificationIcon(type: string): string {
    const t = type.toUpperCase();
    if (t.includes("SCHEME")) return "campaign";
    if (t.includes("POLICY")) return "description";
    if (t.includes("DEADLINE")) return "event";
    if (t.includes("APPLICATION")) return "check_circle";
    if (t.includes("SYSTEM")) return "warning";
    if (t.includes("FEEDBACK")) return "feedback";
    if (t.includes("USER")) return "person";
    if (t.includes("DELIVERY") || t.includes("EMAIL") || t.includes("SMS"))
      return "outgoing_mail";
    return "notifications";
  }

  getIconClass(type: string): string {
    const t = type.toUpperCase();
    if (t.includes("SCHEME")) return "icon--scheme";
    if (t.includes("POLICY")) return "icon--policy";
    if (t.includes("DEADLINE")) return "icon--deadline";
    if (t.includes("SYSTEM")) return "icon--system";
    if (t.includes("FEEDBACK")) return "icon--feedback";
    if (t.includes("USER")) return "icon--user";
    if (t.includes("DELIVERY")) return "icon--delivery";
    return "icon--default";
  }

  getBadgeLabel(type: string): string {
    const map: Record<string, string> = {
      // Admin Workflow Types
      POLICY_APPROVAL_REQUEST: "Policy Approval Request",
      POLICY_PENDING_REQUEST: "Policy Request",
      POLICY_DELETE_REQUEST: "Policy Delete Request",
      POLICY_ARCHIVE_REQUEST: "Policy Archive Request",
      SCHEME_APPROVAL_REQUEST: "Scheme Approval Request",
      SCHEME_PENDING_REQUEST: "Scheme Request",
      SCHEME_DELETE_REQUEST: "Scheme Delete Request",
      SCHEME_ARCHIVE_REQUEST: "Scheme Archive Request",
      NEW_USER: "User Alert",
      USER_ROLE_CHANGE: "Role Changed",
      USER_STATUS_CHANGE: "User Status",
      NEW_FEEDBACK: "Feedback & Issues",
      ISSUE_REPORTED: "Issue Reported",
      FEEDBACK_ESCALATED: "Feedback Escalated",
      FEEDBACK_RESOLVED: "Feedback Resolved",
      SYSTEM_ALERT: "System Alert",
      BACKGROUND_JOB_FAILURE: "Job Failure",
      API_FAILURE: "API Failure",
      DATABASE_ALERT: "Database Alert",
      SECURITY_ALERT: "Security Alert",
      EMAIL_DELIVERY_FAILURE: "Delivery Failure",
      SMS_DELIVERY_FAILURE: "SMS Failure",
      EMAIL_BOUNCE: "Email Bounce",

      // Government Official Types
      POLICY_APPROVED: "Policy Approved",
      POLICY_REJECTED: "Policy Rejected",
      SCHEME_APPROVED: "Scheme Approved",
      SCHEME_REJECTED: "Scheme Rejected",
      REQUEST_APPROVED: "Request Approved",
      REQUEST_REJECTED: "Request Rejected",

      // Citizen / Public Types
      NEW_POLICY: "New Policy",
      POLICY_UPDATE: "Policy Update",
      NEW_SCHEME: "New Scheme",
      SCHEME_UPDATE: "Scheme Update",
      DEADLINE_REMINDER: "Deadline Reminder",
      FEEDBACK_UPDATE: "Feedback Update",
      APPLICATION_SUBMITTED: "Application Submitted",
      APPLICATION_APPROVED: "Application Approved",
      APPLICATION_REJECTED: "Application Rejected",
      APPLICATION_UPDATE: "Application Update",
      REPORT_COMPLETED: "Report Completed",
      RESEARCH_REPORT: "Research Report",
      SAVED_SEARCH_ALERT: "Saved Search Alert",
    };
    return map[type] || "Notification";
  }

  getBadgeClass(type: string): string {
    const t = type.toUpperCase();
    if (t.includes("APPROVED")) return "badge--success";
    if (t.includes("REJECTED") || t.includes("FAILURE") || t.includes("BOUNCE"))
      return "badge--danger";
    if (t.includes("SCHEME")) return "badge--scheme";
    if (t.includes("POLICY")) return "badge--policy";
    if (t.includes("DEADLINE")) return "badge--deadline";
    if (t.includes("SYSTEM")) return "badge--system";
    if (t.includes("FEEDBACK")) return "badge--feedback";
    if (t.includes("USER")) return "badge--user";
    return "badge--default";
  }

  formatRelativeTime(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return "1 week ago";
    return `${diffWeeks} weeks ago`;
  }
}
