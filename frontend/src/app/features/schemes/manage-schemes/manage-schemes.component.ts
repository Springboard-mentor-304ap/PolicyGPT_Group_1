import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, AuthUser } from '../../../core/services/auth';

export interface Scheme {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  state: string;
  sector: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT' | 'ARCHIVED';
  targetGroup: string;
  publicationDate: string;
}

@Component({
  selector: 'app-manage-schemes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './manage-schemes.component.html',
  styleUrls: ['./manage-schemes.component.scss'],
})
export class ManageSchemesComponent implements OnInit {
  /* ============================================================
     ROLE & ROUTING
  ============================================================ */
  rolePrefix = 'government';
  isAdmin = false;

  /* ============================================================
     FILTER VALUES
  ============================================================ */
  searchText = '';
  selectedCategory = '';
  selectedMinistry = '';
  selectedDepartment = '';
  selectedState = '';
  selectedSector = '';
  selectedStatus = '';
  fromDate = '';
  toDate = '';

  currentPage = 1;
  pageSize = 6;
  menuOpenId: number | null = null;

  /* ============================================================
     DROPDOWN OPTIONS
  ============================================================ */
  categories = [
    'Agriculture',
    'Education',
    'Health & Wellness',
    'Skill Development',
    'Housing & Shelter',
    'Social Welfare',
    'Financial Services',
    'Energy & Power',
    'Infrastructure',
    'Employment',
  ];

  ministries = [
    'Ministry of Agriculture & Farmers Welfare',
    'Ministry of Education',
    'Ministry of Health & Family Welfare',
    'Ministry of New & Renewable Energy',
    'Ministry of Micro, Small & Medium Enterprises',
    'Ministry of Housing and Urban Affairs',
    'Ministry of Finance',
    'Ministry of Labour & Employment',
    'Ministry of Electronics & IT',
  ];

  departments = [
    'Department of Agriculture & Farmers Welfare',
    'Department of School Education & Literacy',
    'Department of Higher Education',
    'Department of Health & Family Welfare',
    'Department of Renewable Energy',
    'Department of MSME',
    'Department of Housing',
    'Department of Financial Services',
    'Department of Rural Development',
  ];

  states = [
    'All India',
    'Andhra Pradesh',
    'Assam',
    'Bihar',
    'Delhi',
    'Gujarat',
    'Haryana',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Tamil Nadu',
    'Telangana',
    'Uttar Pradesh',
    'West Bengal',
  ];

  sectors = [
    'Agriculture',
    'Education',
    'Healthcare',
    'Renewable Energy',
    'MSME & Skills',
    'Urban Housing',
    'Social Welfare',
    'Finance & Banking',
    'Employment',
    'Information Technology',
  ];

  statuses = ['APPROVED', 'PENDING', 'REJECTED', 'DRAFT', 'ARCHIVED'];

  /* ============================================================
     SCHEMES DATA
  ============================================================ */
  schemes: Scheme[] = [
    {
      id: 1,
      title: 'PM Kisan Samman Nidhi',
      description: 'Income support of Rs. 6000 per year in three equal installments to all landholding farmer families.',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      department: 'Department of Agriculture & Farmers Welfare',
      state: 'All India',
      sector: 'Agriculture',
      status: 'APPROVED',
      targetGroup: 'Farmers',
      publicationDate: '15 Jan 2024',
    },
    {
      id: 2,
      title: 'PM Surya Ghar Muft Bijli Yojana',
      description: 'Rooftop solar scheme providing up to 300 units of free electricity every month to 1 crore households.',
      category: 'Energy & Power',
      ministry: 'Ministry of New & Renewable Energy',
      department: 'Department of Renewable Energy',
      state: 'All India',
      sector: 'Renewable Energy',
      status: 'APPROVED',
      targetGroup: 'Citizens',
      publicationDate: '13 Feb 2024',
    },
    {
      id: 3,
      title: 'Post Matric Scholarship Scheme',
      description: 'Financial assistance to students from marginalized communities pursuing post-matriculation studies.',
      category: 'Education',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      state: 'All India',
      sector: 'Education',
      status: 'PENDING',
      targetGroup: 'Students',
      publicationDate: '01 Mar 2024',
    },
    {
      id: 4,
      title: 'PM Vishwakarma Yojana',
      description: 'End-to-end holistic support to traditional artisans and craftspeople with collateral-free credit and toolkit incentive.',
      category: 'Skill Development',
      ministry: 'Ministry of Micro, Small & Medium Enterprises',
      department: 'Department of MSME',
      state: 'All India',
      sector: 'MSME & Skills',
      status: 'APPROVED',
      targetGroup: 'Artisans',
      publicationDate: '17 Sep 2023',
    },
    {
      id: 5,
      title: 'Pradhan Mantri Jan Arogya Yojana (PM-JAY)',
      description: 'Health insurance coverage up to Rs. 5 lakh per family per year for secondary and tertiary care hospitalization.',
      category: 'Health & Wellness',
      ministry: 'Ministry of Health & Family Welfare',
      department: 'Department of Health & Family Welfare',
      state: 'All India',
      sector: 'Healthcare',
      status: 'APPROVED',
      targetGroup: 'Low Income Citizens',
      publicationDate: '23 Sep 2023',
    },
    {
      id: 6,
      title: 'Pradhan Mantri Awas Yojana (PMAY)',
      description: 'Pucca houses with basic amenities to all eligible urban and rural households across the nation.',
      category: 'Housing & Shelter',
      ministry: 'Ministry of Housing and Urban Affairs',
      department: 'Department of Housing',
      state: 'All India',
      sector: 'Urban Housing',
      status: 'PENDING',
      targetGroup: 'Low Income Families',
      publicationDate: '10 Nov 2023',
    },
    {
      id: 7,
      title: 'National Rural Livelihood Mission',
      description: 'Empowering rural poor women through self-help groups and sustainable livelihood opportunities.',
      category: 'Social Welfare',
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      department: 'Department of Rural Development',
      state: 'All India',
      sector: 'Social Welfare',
      status: 'DRAFT',
      targetGroup: 'Rural Women',
      publicationDate: '-',
    },
    {
      id: 8,
      title: 'PM Kaushal Vikas Yojana 4.0',
      description: 'Industry-relevant skill training for Indian youth across modern sectors like AI, robotics, and 3D printing.',
      category: 'Skill Development',
      ministry: 'Ministry of Labour & Employment',
      department: 'Department of Higher Education',
      state: 'Maharashtra',
      sector: 'Employment',
      status: 'APPROVED',
      targetGroup: 'Youth',
      publicationDate: '12 Jan 2024',
    },
    {
      id: 9,
      title: 'Jal Jeevan Mission - Har Ghar Jal',
      description: 'Providing functional household tap connection to every rural household with safe drinking water.',
      category: 'Infrastructure',
      ministry: 'Ministry of Housing and Urban Affairs',
      department: 'Department of Housing',
      state: 'Punjab',
      sector: 'Infrastructure',
      status: 'PENDING',
      targetGroup: 'Rural Households',
      publicationDate: '20 Feb 2024',
    },
    {
      id: 10,
      title: 'Atal Pension Yojana',
      description: 'Universal pension scheme for all citizens in the unorganized sector with guaranteed monthly payouts.',
      category: 'Financial Services',
      ministry: 'Ministry of Finance',
      department: 'Department of Financial Services',
      state: 'All India',
      sector: 'Finance & Banking',
      status: 'APPROVED',
      targetGroup: 'Unorganized Workers',
      publicationDate: '09 May 2023',
    },
    {
      id: 11,
      title: 'Pradhan Mantri Fasal Bima Yojana',
      description: 'Comprehensive risk insurance coverage for crops against non-preventable natural risks from pre-sowing to post-harvest.',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      department: 'Department of Agriculture & Farmers Welfare',
      state: 'Gujarat',
      sector: 'Agriculture',
      status: 'REJECTED',
      targetGroup: 'Farmers',
      publicationDate: '18 Jul 2023',
    },
    {
      id: 12,
      title: 'Sub-Mission on Agricultural Mechanization',
      description: 'Assisting small and marginal farmers with farm machinery subsidies and Custom Hiring Centres.',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      department: 'Department of Agriculture & Farmers Welfare',
      state: 'Uttar Pradesh',
      sector: 'Agriculture',
      status: 'ARCHIVED',
      targetGroup: 'Farmers',
      publicationDate: '01 Apr 2021',
    },
  ];

  constructor(
    private router: Router,
    private authService: Auth
  ) {}

  ngOnInit(): void {
    const url = this.router.url;
    if (url.includes('/admin')) {
      this.isAdmin = true;
      this.rolePrefix = 'admin';
    } else {
      const storedUser: AuthUser | null = this.authService.getStoredUser();
      if (storedUser && storedUser.role === 'ADMINISTRATOR') {
        this.isAdmin = true;
        this.rolePrefix = 'admin';
      } else {
        this.isAdmin = false;
        this.rolePrefix = 'government';
      }
    }
  }

  /* ============================================================
     FILTERED SCHEMES
  ============================================================ */
  get filteredSchemes(): Scheme[] {
    return this.schemes.filter((scheme) => {
      const search = this.searchText.toLowerCase().trim();

      const matchesSearch =
        !search ||
        scheme.title.toLowerCase().includes(search) ||
        scheme.description.toLowerCase().includes(search) ||
        scheme.category.toLowerCase().includes(search) ||
        scheme.ministry.toLowerCase().includes(search) ||
        scheme.targetGroup.toLowerCase().includes(search);

      const matchesCategory =
        !this.selectedCategory || scheme.category === this.selectedCategory;

      const matchesMinistry =
        !this.selectedMinistry || scheme.ministry === this.selectedMinistry;

      const matchesDepartment =
        !this.selectedDepartment || scheme.department === this.selectedDepartment;

      const matchesState =
        !this.selectedState || scheme.state === this.selectedState;

      const matchesSector =
        !this.selectedSector || scheme.sector === this.selectedSector;

      const matchesStatus =
        !this.selectedStatus || scheme.status === this.selectedStatus;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinistry &&
        matchesDepartment &&
        matchesState &&
        matchesSector &&
        matchesStatus
      );
    });
  }

  /* ============================================================
     PAGINATION
  ============================================================ */
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSchemes.length / this.pageSize));
  }

  get paginatedSchemes(): Scheme[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSchemes.slice(start, start + this.pageSize);
  }

  get startItem(): number {
    if (this.filteredSchemes.length === 0) {
      return 0;
    }
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredSchemes.length
    );
  }

  /* ============================================================
     STATISTICS
  ============================================================ */
  get totalSchemes(): number {
    return this.schemes.length;
  }

  get approvedCount(): number {
    return this.schemes.filter((s) => s.status === 'APPROVED').length;
  }

  get pendingCount(): number {
    return this.schemes.filter((s) => s.status === 'PENDING').length;
  }

  get rejectedCount(): number {
    return this.schemes.filter((s) => s.status === 'REJECTED').length;
  }

  get archivedCount(): number {
    return this.schemes.filter((s) => s.status === 'ARCHIVED').length;
  }

  /* ============================================================
     FILTER HANDLING
  ============================================================ */
  applyFilters(): void {
    this.currentPage = 1;
  }

  resetFilters(): void {
    this.searchText = '';
    this.selectedCategory = '';
    this.selectedMinistry = '';
    this.selectedDepartment = '';
    this.selectedState = '';
    this.selectedSector = '';
    this.selectedStatus = '';
    this.fromDate = '';
    this.toDate = '';
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
  viewScheme(scheme: Scheme): void {
    this.router.navigate(['/dashboard', this.rolePrefix, 'schemes', scheme.id]);
  }

  editScheme(scheme: Scheme): void {
    this.router.navigate([
      '/dashboard',
      this.rolePrefix,
      'schemes',
      'edit',
      scheme.id,
    ]);
  }

  archiveScheme(scheme: Scheme): void {
    scheme.status = 'ARCHIVED';
    this.closeMenu();
  }

  deleteScheme(scheme: Scheme): void {
    this.schemes = this.schemes.filter((s) => s.id !== scheme.id);
    this.closeMenu();
  }

  addNewScheme(): void {
    this.router.navigate(['/dashboard', this.rolePrefix, 'schemes', 'add']);
  }

  exportSchemes(): void {
    const data = this.filteredSchemes;
    const csv = [
      ['ID', 'Title', 'Category', 'Ministry', 'State', 'Status', 'Target Group', 'Publication Date'],
      ...data.map((scheme) => [
        scheme.id,
        `"${scheme.title.replace(/"/g, '""')}"`,
        `"${scheme.category}"`,
        `"${scheme.ministry}"`,
        `"${scheme.state}"`,
        scheme.status,
        `"${scheme.targetGroup}"`,
        scheme.publicationDate,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schemes.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ============================================================
     STATUS HELPERS
  ============================================================ */
  getStatusLabel(status: Scheme['status']): string {
    return status;
  }

  getCategoryClass(category: string): string {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  trackByScheme(index: number, scheme: Scheme): number {
    return scheme.id;
  }
}
