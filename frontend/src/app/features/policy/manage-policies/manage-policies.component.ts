import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";

interface Policy {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  state: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "DRAFT" | "ARCHIVED";
  publicationDate: string;
}

@Component({
  selector: "app-manage-policies",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./manage-policies.component.html",
  styleUrls: ["./manage-policies.component.scss"],
})
export class ManagePoliciesComponent {
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

  policies: Policy[] = [
    {
      id: 1,
      title: "National Education Policy 2020",
      description: "Transforming India's education system...",
      category: "Education",
      ministry: "Ministry of Education",
      state: "All India",
      status: "APPROVED",
      publicationDate: "29 Jul 2020",
    },

    {
      id: 2,
      title: "Digital India Policy",
      description: "Promoting digital infrastructure...",
      category: "Technology",
      ministry: "Ministry of Electronics & IT",
      state: "All India",
      status: "APPROVED",
      publicationDate: "05 Jan 2018",
    },

    {
      id: 3,
      title: "National Health Policy",
      description: "Universal access to quality healthcare...",
      category: "Health",
      ministry: "Ministry of Health & Family Welfare",
      state: "All India",
      status: "PENDING",
      publicationDate: "15 Aug 2023",
    },

    {
      id: 4,
      title: "Green Energy Policy",
      description: "Accelerating clean and renewable energy...",
      category: "Environment",
      ministry: "Ministry of New & Renewable Energy",
      state: "All India",
      status: "DRAFT",
      publicationDate: "-",
    },

    {
      id: 5,
      title: "Agricultural Marketing Policy",
      description: "Strengthening farmer-centric markets...",
      category: "Agriculture",
      ministry: "Ministry of Agriculture",
      state: "Maharashtra",
      status: "REJECTED",
      publicationDate: "12 Mar 2022",
    },

    {
      id: 6,
      title: "Urban Development Policy",
      description: "Sustainable and inclusive urban growth...",
      category: "Urban Development",
      ministry: "Ministry of Housing & Urban Affairs",
      state: "All India",
      status: "ARCHIVED",
      publicationDate: "01 Apr 2021",
    },

    {
      id: 7,
      title: "National Skill Development Policy",
      description: "Improving skill development opportunities...",
      category: "Employment",
      ministry: "Ministry of Labour & Employment",
      state: "All India",
      status: "APPROVED",
      publicationDate: "15 Jul 2021",
    },

    {
      id: 8,
      title: "Digital Health Mission Policy",
      description: "Building a connected digital healthcare ecosystem...",
      category: "Health",
      ministry: "Ministry of Health & Family Welfare",
      state: "All India",
      status: "APPROVED",
      publicationDate: "27 Sep 2021",
    },

    {
      id: 9,
      title: "National Agriculture Policy",
      description: "Supporting sustainable agricultural development...",
      category: "Agriculture",
      ministry: "Ministry of Agriculture",
      state: "Punjab",
      status: "PENDING",
      publicationDate: "10 Feb 2024",
    },

    {
      id: 10,
      title: "Renewable Energy Transition Policy",
      description: "Accelerating renewable energy adoption...",
      category: "Environment",
      ministry: "Ministry of New & Renewable Energy",
      state: "All India",
      status: "APPROVED",
      publicationDate: "18 Jun 2022",
    },

    {
      id: 11,
      title: "Smart Cities Development Policy",
      description: "Developing sustainable and technology-enabled cities...",
      category: "Urban Development",
      ministry: "Ministry of Housing & Urban Affairs",
      state: "All India",
      status: "DRAFT",
      publicationDate: "-",
    },

    {
      id: 12,
      title: "Financial Inclusion Policy",
      description: "Expanding access to financial services...",
      category: "Finance",
      ministry: "Ministry of Finance",
      state: "All India",
      status: "APPROVED",
      publicationDate: "05 Nov 2022",
    },
  ];

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
        policy.ministry.toLowerCase().includes(search);

      const matchesCategory =
        !this.selectedCategory || policy.category === this.selectedCategory;

      const matchesMinistry =
        !this.selectedMinistry || policy.ministry === this.selectedMinistry;

      const matchesState =
        !this.selectedState || policy.state === this.selectedState;

      const matchesStatus =
        !this.selectedStatus || policy.status === this.selectedStatus;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinistry &&
        matchesState &&
        matchesStatus
      );
    });
  }

  /* ============================================================
     PAGINATION
  ============================================================ */

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPolicies.length / this.pageSize));
  }

  get paginatedPolicies(): Policy[] {
    const start = (this.currentPage - 1) * this.pageSize;

    return this.filteredPolicies.slice(start, start + this.pageSize);
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
      this.filteredPolicies.length,
    );
  }

  /* ============================================================
     STATISTICS
  ============================================================ */

  get totalPolicies(): number {
    return this.policies.length;
  }

  get approvedCount(): number {
    return this.policies.filter((p) => p.status === "APPROVED").length;
  }

  get pendingCount(): number {
    return this.policies.filter((p) => p.status === "PENDING").length;
  }

  get rejectedCount(): number {
    return this.policies.filter((p) => p.status === "REJECTED").length;
  }

  get archivedCount(): number {
    return this.policies.filter((p) => p.status === "ARCHIVED").length;
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
    console.log("View policy:", policy);

    // Later:
    // this.router.navigate(['/admin/policies', policy.id]);
  }

  editPolicy(policy: Policy): void {
    console.log("Edit policy:", policy);

    // Later:
    // this.router.navigate(['/admin/policies/edit', policy.id]);
  }

  archivePolicy(policy: Policy): void {
    console.log("Archive policy:", policy);

    this.closeMenu();
  }

  deletePolicy(policy: Policy): void {
    console.log("Delete policy:", policy);

    this.closeMenu();
  }

  addNewPolicy(): void {
    console.log("Add new policy");

    // Later:
    // this.router.navigate(['/admin/policies/add']);
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
