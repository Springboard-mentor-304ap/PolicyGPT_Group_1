import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { finalize, timeout } from "rxjs";
import {
  SearchHistoryItem,
  SearchHistoryService,
} from "../../core/services/search-history.service";
import { Auth } from "../../core/services/auth";
import { ToastService } from "../../core/services/toast.service";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../shared/components/breadcrumb/breadcrumb.component";

type HistoryFilter = "ALL" | "POLICY" | "SCHEME";

@Component({
  selector: "app-search-history",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ConfirmModalComponent, BreadcrumbComponent],
  templateUrl: "./search-history.component.html",
  styleUrl: "./search-history.component.scss",
})
export class SearchHistoryComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(Auth);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  rows: SearchHistoryItem[] = [];
  loading = true;
  error: string | null = null;

  activeFilter: HistoryFilter = "ALL";
  searchQuery = "";

  clearConfirmOpen = false;
  clearing = false;
  deletingId: number | null = null;

  /** Role-aware breadcrumb trail: Home > Search History. */
  get breadcrumbItems(): BreadcrumbItem[] {
    const role = String(this.authService.getUserRole() || "CITIZEN")
      .trim()
      .toUpperCase();
    const prefix =
      role === "ORGANIZATION" || role === "ORGANISATION"
        ? "organization"
        : role.toLowerCase();
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Search History" },
    ];
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.error = null;
    const user = this.authService.getStoredUser();
    if (!user) {
      this.loading = false;
      this.error = "Could not load search history. Please log in again.";
      return;
    }
    this.searchHistoryService
      .getUserSearchHistory(user.user_id)
      .pipe(
        timeout(30000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.rows = Array.isArray(res) ? res : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = "Could not load search history. Please retry.";
          this.cdr.markForCheck();
        },
      });
  }

  get filteredRows(): SearchHistoryItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.rows.filter((row) => {
      if (
        this.activeFilter !== "ALL" &&
        row.search_type !== this.activeFilter
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (row.search_query || "").toLowerCase().includes(query);
    });
  }

  setFilter(filter: HistoryFilter): void {
    this.activeFilter = filter;
  }

  filterSummary(row: SearchHistoryItem): string {
    const filters = row.filters;
    if (!filters || typeof filters !== "object") {
      return "—";
    }
    const parts = Object.entries(filters)
      .filter(
        ([, value]) => value !== "" && value !== null && value !== undefined,
      )
      .map(([key, value]) => `${key}: ${value}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  formatDate(value: string | null): string {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  searchAgain(row: SearchHistoryItem): void {
    const segments =
      row.search_type === "SCHEME"
        ? ["..", "schemes"]
        : ["..", "policies", "search"];
    const params: Record<string, string> = {};
    if (row.search_query?.trim()) {
      params["q"] = row.search_query.trim();
    }
    const filters = row.filters;
    if (filters && typeof filters === "object") {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== "" && value !== null && value !== undefined) {
          params[key] = String(value);
        }
      }
    }
    void this.router.navigate(segments, {
      queryParams: params,
      relativeTo: this.route,
    });
  }

  askDelete(row: SearchHistoryItem): void {
    this.deletingId = row.history_id;
    this.searchHistoryService
      .deleteSearchHistoryItem(row.history_id)
      .subscribe({
        next: () => {
          this.rows = this.rows.filter(
            (item) => item.history_id !== row.history_id,
          );
          this.deletingId = null;
          this.toastService.success("Deleted", "Search record deleted.");
          this.cdr.markForCheck();
        },
        error: () => {
          this.deletingId = null;
          this.toastService.error(
            "Delete failed",
            "Could not delete the record. Please retry.",
          );
          this.cdr.markForCheck();
        },
      });
  }

  askClear(): void {
    this.clearConfirmOpen = true;
  }

  cancelClear(): void {
    this.clearConfirmOpen = false;
  }

  confirmClear(): void {
    const user = this.authService.getStoredUser();
    if (!user) {
      this.clearConfirmOpen = false;
      return;
    }
    this.clearConfirmOpen = false;
    this.clearing = true;
    this.searchHistoryService.deleteUserSearchHistory(user.user_id).subscribe({
      next: (res) => {
        this.rows = [];
        this.clearing = false;
        this.toastService.success(
          "Cleared",
          `Removed ${res?.deleted_count ?? 0} search records.`,
        );
        this.cdr.markForCheck();
      },
      error: () => {
        this.clearing = false;
        this.toastService.error(
          "Clear failed",
          "Could not clear search history. Please retry.",
        );
        this.cdr.markForCheck();
      },
    });
  }
}
