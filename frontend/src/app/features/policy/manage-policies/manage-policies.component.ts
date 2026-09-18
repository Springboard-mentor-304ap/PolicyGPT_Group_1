import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { PolicyService, Policy as ApiPolicy } from "../../../core/services/policy.services";
import { Auth } from "../../../core/services/auth";

interface Policy {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  state: string;
  sector: string;
  status:
    | "APPROVED"
    | "PENDING"
    | "REJECTED"
    | "DRAFT"
    | "ARCHIVED"
    | "ARCHIVE_REQUESTED"
    | "DELETE_REQUESTED";
  publicationDate: string;
}
@Component({
  selector: "app-manage-policies",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./manage-policies.component.html",
  styleUrls: ["./manage-policies.component.scss"],
})
export class ManagePoliciesComponent implements OnInit {

  constructor(
  private policyService: PolicyService,
  private router: Router,
  private auth: Auth
) {}
  /* ============================================================
     FILTER VALUES
  ============================================================ */
  searchText = "";
  selectedCategory = "";
  selectedMinistry = "";
  selectedDepartment = "";
  selectedState = "";
  selectedSector = "";
  selectedStatus = "";
  fromDate = "";
  toDate = "";

  currentPage = 1;
  pageSize = 6;

  menuOpenId: number | null = null;
  userRole: string | null = null;

  /* ============================================================
     DROPDOWN OPTIONS
  ============================================================ */

  categories = [
    "Education",
    "Technology",
    "Health",
    "Environment",
    "Agriculture",
    "Urban Development",
    "Employment",
    "Finance",
    "Infrastructure",
    "Social Welfare",
  ];

  ministries = [
    "Ministry of Education",
    "Ministry of Electronics & IT",
    "Ministry of Health & Family Welfare",
    "Ministry of New & Renewable Energy",
    "Ministry of Agriculture",
    "Ministry of Housing & Urban Affairs",
    "Ministry of Labour & Employment",
    "Ministry of Finance",
  ];

  departments = [
    "Department of School Education",
    "Department of Higher Education",
    "Department of Health",
    "Department of Electronics & IT",
    "Department of Agriculture",
    "Department of Renewable Energy",
    "Department of Urban Development",
    "Department of Economic Affairs",
  ];

  states = [
    "All India",
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Delhi",
    "Gujarat",
    "Haryana",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "West Bengal",
  ];

  sectors = [
    "Agriculture",
    "Education",
    "Healthcare",
    "Information Technology",
    "Infrastructure",
    "Finance",
    "Employment",
    "Social Welfare",
    "Environment",
  ];

  statuses = ["APPROVED", "PENDING", "REJECTED", "DRAFT", "ARCHIVED"];

  /* ============================================================
     POLICY DATA
  ============================================================ */

  policies: Policy[] = [];

  get totalPolicies(): number {
  return this.policies.length;
}

get approvedCount(): number {
  return this.policies.filter(
    policy => policy.status === "APPROVED"
  ).length;
}

get pendingCount(): number {
  return this.policies.filter(
    policy => policy.status === "PENDING"
  ).length;
}

get rejectedCount(): number {
  return this.policies.filter(
    policy => policy.status === "REJECTED"
  ).length;
}

get archivedCount(): number {
  return this.policies.filter(
    policy => policy.status === "ARCHIVED"
  ).length;
}

    ngOnInit(): void {
  this.userRole = this.auth.getUserRole();
  this.loadPolicies();
}

loadPolicies(): void {
  this.policyService.getPolicies({
    page: 1,
    limit: 100
  }).subscribe({
    next: (response) => {

      this.policies = response.policies.map((policy: ApiPolicy) => ({
        id: policy.policy_id,
        title: policy.title,
        description: policy.description,
        category: policy.category,
        ministry: policy.ministry || "",
        department: policy.department || "",
        state: policy.state || "",
        sector: policy.sector || "",
        status: this.mapStatus(policy.status),
        publicationDate: policy.publication_date
          ? this.formatDate(policy.publication_date)
          : "-"
      }));

      this.currentPage = 1;
    },

    error: (error) => {
      console.error("Failed to load policies:", error);
    }
  });
}mapStatus(status: string): Policy["status"] {
  switch (status) {
    case "PENDING_APPROVAL":
      return "PENDING";

    case "APPROVED":
      return "APPROVED";

    case "REJECTED":
      return "REJECTED";

    case "DRAFT":
      return "DRAFT";

    case "ARCHIVED":
      return "ARCHIVED";

    case "ARCHIVE_REQUESTED":
      return "ARCHIVE_REQUESTED";

    case "DELETE_REQUESTED":
      return "DELETE_REQUESTED";

    default:
      return "DRAFT";
  }
}
formatDate(date: string): string {
  const parsedDate = new Date(date);

  if (isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

  /* ============================================================
     FILTERED POLICIES
  ============================================================ */

  get filteredPolicies(): Policy[] {
  return this.policies.filter((policy) => {
    const search = this.searchText.toLowerCase().trim();

    const matchesSearch =
      !search ||
      policy.title.toLowerCase().includes(search) ||
      policy.description.toLowerCase().includes(search) ||
      policy.category.toLowerCase().includes(search) ||
      policy.ministry.toLowerCase().includes(search) ||
      policy.department.toLowerCase().includes(search) ||
      policy.state.toLowerCase().includes(search) ||
      policy.sector.toLowerCase().includes(search);

    const matchesCategory =
      !this.selectedCategory ||
      policy.category === this.selectedCategory;

    const matchesMinistry =
      !this.selectedMinistry ||
      policy.ministry === this.selectedMinistry;

    const matchesDepartment =
      !this.selectedDepartment ||
      policy.department === this.selectedDepartment;

    const matchesState =
      !this.selectedState ||
      policy.state === this.selectedState;

    const matchesSector =
      !this.selectedSector ||
      policy.sector === this.selectedSector;

    const matchesStatus =
      !this.selectedStatus ||
      policy.status === this.selectedStatus;

    let matchesFromDate = true;
    let matchesToDate = true;

    if (this.fromDate && policy.publicationDate !== "-") {
      const policyDate = new Date(policy.publicationDate);
      const fromDate = new Date(this.fromDate);

      policyDate.setHours(0, 0, 0, 0);
      fromDate.setHours(0, 0, 0, 0);

      matchesFromDate = policyDate >= fromDate;
    }

    if (this.toDate && policy.publicationDate !== "-") {
      const policyDate = new Date(policy.publicationDate);
      const toDate = new Date(this.toDate);

      policyDate.setHours(0, 0, 0, 0);
      toDate.setHours(0, 0, 0, 0);

      matchesToDate = policyDate <= toDate;
    }

    return (
      matchesSearch &&
      matchesCategory &&
      matchesMinistry &&
      matchesDepartment &&
      matchesState &&
      matchesSector &&
      matchesStatus &&
      matchesFromDate &&
      matchesToDate
    );
  });
}

  /* ============================================================
     STATISTICS
  ============================================================ */

  get totalPages(): number {
  return Math.max(
    1,
    Math.ceil(this.filteredPolicies.length / this.pageSize)
  );
}

get paginatedPolicies(): Policy[] {
  const start = (this.currentPage - 1) * this.pageSize;

  return this.filteredPolicies.slice(
    start,
    start + this.pageSize
  );
}

get startItem(): number {
  if (this.filteredPolicies.length === 0) {
    return 0;
  }

  return (this.currentPage - 1) * this.pageSize + 1;
}

get endItem(): number {
  return Math.min(
    this.currentPage * this.pageSize,
    this.filteredPolicies.length
  );
}

previousPage(): void {
  if (this.currentPage > 1) {
    this.currentPage--;
  }
}

nextPage(): void {
  if (this.currentPage < this.totalPages) {
    this.currentPage++;
  }
}

goToPage(page: number): void {
  if (page >= 1 && page <= this.totalPages) {
    this.currentPage = page;
  }
}
  /* ============================================================
     FILTER HANDLING
  ============================================================ */

  applyFilters(): void {
    this.currentPage = 1;
  }

  resetFilters(): void {
    this.searchText = "";
    this.selectedCategory = "";
    this.selectedMinistry = "";
    this.selectedDepartment = "";
    this.selectedState = "";
    this.selectedSector = "";
    this.selectedStatus = "";
    this.fromDate = "";
    this.toDate = "";

    this.currentPage = 1;
  }

  /* ============================================================
     PAGE SIZE
  ============================================================ */

  changePageSize(): void {
    this.currentPage = 1;
  }

  /* ============================================================
     PAGINATION
  ============================================================ */

  /* ============================================================
     MENU
  ============================================================ */

  toggleMenu(id: number): void {
    if (this.menuOpenId === id) {
      this.menuOpenId = null;
    } else {
      this.menuOpenId = id;
    }
  }

  closeMenu(): void {
    this.menuOpenId = null;
  }

  /* ============================================================
     ACTIONS
  ============================================================ */

  viewPolicy(policy: Policy): void {
    // console.log("View policy:", policy);

    // Later:
    this.router.navigate(['/policies', policy.id]);
  }

  editPolicy(policy: Policy): void {
  this.closeMenu();

  this.router.navigate([
    "/admin/policies/edit",
    policy.id
  ]);
}

  archivePolicy(policy: Policy): void {
  this.closeMenu();

  if (this.userRole === "GOVERNMENT_OFFICIAL") {
    const reason = window.prompt(
      "Enter reason for requesting archive:"
    );

    if (!reason?.trim()) {
      return;
    }

    this.policyService.requestArchivePolicy(
      policy.id,
      reason.trim()
    ).subscribe({
      next: () => {
        alert("Archive request submitted successfully.");
        this.loadPolicies();
      },
      error: (error) => {
        console.error("Archive request failed:", error);
        alert(
          error?.error?.detail ||
          "Unable to request archive."
        );
      }
    });

    return;
  }

  if (this.userRole === "ADMIN") {
    if (policy.status !== "ARCHIVE_REQUESTED") {
      alert("This policy does not have an archive request.");
      return;
    }

    if (!confirm("Approve archive for this policy?")) {
      return;
    }

    this.policyService.approveArchivePolicy(policy.id).subscribe({
      next: () => {
        alert("Policy archived successfully.");
        this.loadPolicies();
      },
      error: (error) => {
        console.error("Approve archive failed:", error);
        alert(
          error?.error?.detail ||
          "Unable to approve archive."
        );
      }
    });

    return;
  }

  alert("You do not have permission to archive this policy.");
}

deletePolicy(policy: Policy): void {
  this.closeMenu();

  if (this.userRole === "GOVERNMENT_OFFICIAL") {
    const reason = window.prompt(
      "Enter reason for requesting deletion:"
    );

    if (!reason?.trim()) {
      return;
    }

    this.policyService.requestDeletePolicy(
      policy.id,
      reason.trim()
    ).subscribe({
      next: () => {
        alert("Delete request submitted successfully.");
        this.loadPolicies();
      },
      error: (error) => {
        console.error("Delete request failed:", error);
        alert(
          error?.error?.detail ||
          "Unable to request deletion."
        );
      }
    });

    return;
  }

  if (this.userRole === "ADMIN") {
    if (policy.status !== "DELETE_REQUESTED") {
      if (!confirm(
        "This will permanently delete the policy. Continue?"
      )) {
        return;
      }

      this.policyService.deletePolicy(policy.id).subscribe({
        next: () => {
          alert("Policy permanently deleted.");
          this.loadPolicies();
        },
        error: (error) => {
          console.error("Delete failed:", error);
          alert(
            error?.error?.detail ||
            "Unable to delete policy."
          );
        }
      });

      return;
    }

    if (!confirm("Approve this delete request?")) {
      return;
    }

    this.policyService.approveDeletePolicy(policy.id).subscribe({
      next: () => {
        alert("Delete request approved.");
        this.loadPolicies();
      },
      error: (error) => {
        console.error("Approve delete failed:", error);
        alert(
          error?.error?.detail ||
          "Unable to approve delete."
        );
      }
    });
  }
}

submitPolicy(policy: Policy): void {
  this.closeMenu();

  if (!confirm("Submit this policy for approval?")) {
    return;
  }

  this.policyService.submitPolicy(policy.id).subscribe({
    next: () => {
      alert("Policy submitted for approval.");
      this.loadPolicies();
    },
    error: (error) => {
      console.error("Submit failed:", error);
      alert(
        error?.error?.detail ||
        "Unable to submit policy."
      );
    }
  });
}

approvePolicy(policy: Policy): void {
  this.closeMenu();

  if (!confirm("Approve this policy?")) {
    return;
  }

  this.policyService.approvePolicy(policy.id).subscribe({
    next: () => {
      alert("Policy approved successfully.");
      this.loadPolicies();
    },
    error: (error) => {
      console.error("Approve failed:", error);
      alert(
        error?.error?.detail ||
        "Unable to approve policy."
      );
    }
  });
}

rejectPolicy(policy: Policy): void {
  this.closeMenu();

  const reason = window.prompt(
    "Enter reason for rejecting this policy:"
  );

  if (!reason?.trim()) {
    return;
  }

  this.policyService.rejectPolicy(
    policy.id,
    reason.trim()
  ).subscribe({
    next: () => {
      alert("Policy rejected successfully.");
      this.loadPolicies();
    },
    error: (error) => {
      console.error("Reject failed:", error);
      alert(
        error?.error?.detail ||
        "Unable to reject policy."
      );
    }
  });
}

restorePolicy(policy: Policy): void {
  this.closeMenu();

  if (!confirm("Restore this archived policy?")) {
    return;
  }

  this.policyService.restorePolicy(policy.id).subscribe({
    next: () => {
      alert("Policy restored successfully.");
      this.loadPolicies();
    },
    error: (error) => {
      console.error("Restore failed:", error);
      alert(
        error?.error?.detail ||
        "Unable to restore policy."
      );
    }
  });
}

  addNewPolicy(): void {
    // console.log("Add new policy");

    // Later:
    this.router.navigate(['/admin/policies/add']);
  }

  exportPolicies(): void {
    console.log("Export policies");

    const data = this.filteredPolicies;

    const csv = [
      [
        "ID",
        "Title",
        "Category",
        "Ministry",
        "State",
        "Status",
        "Publication Date",
      ],

      ...data.map((policy) => [
        policy.id,
        policy.title,
        policy.category,
        policy.ministry,
        policy.state,
        policy.status,
        policy.publicationDate,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "policies.csv";

    link.click();

    URL.revokeObjectURL(url);
  }

  /* ============================================================
     STATUS HELPERS
  ============================================================ */

  getStatusLabel(status: Policy["status"]): string {
  switch (status) {
    case "APPROVED":
      return "APPROVED";

    case "PENDING":
      return "PENDING";

    case "REJECTED":
      return "REJECTED";

    case "DRAFT":
      return "DRAFT";

    case "ARCHIVED":
      return "ARCHIVED";

    case "ARCHIVE_REQUESTED":
      return "ARCHIVE REQUESTED";

    case "DELETE_REQUESTED":
      return "DELETE REQUESTED";

    default:
      return status;
  }
}

  getCategoryClass(category: string): string {
    return category.toLowerCase().replace(/\s+/g, "-");
  }

  trackByPolicy(index: number, policy: Policy): number {
    return policy.id;
  }
}
