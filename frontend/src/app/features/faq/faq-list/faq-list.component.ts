import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FAQ, FAQCreate, FAQUpdate, FAQ_AUDIENCE_OPTIONS, normalizeFaqAudience, faqAudienceChips, faqAudienceLabel } from '../../../core/models/faq.model';
import { FaqService } from '../../../core/services/faq.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { BodyScrollLockService } from '../../../core/services/body-scroll-lock.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { LoadingIndicatorComponent } from '../../../shared/components/loading-indicator/loading-indicator.component';

@Component({
  selector: 'app-faq-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BreadcrumbComponent, SearchableSelectComponent, LoadingIndicatorComponent],
  templateUrl: './faq-list.component.html',
  styleUrl: './faq-list.component.scss',
})
export class FaqListComponent implements OnInit, OnDestroy {
  // State Signals
  faqs = signal<FAQ[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Search & Filter
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('All');
  selectedAudience = signal<string>('All');
  expandedFaqIds = signal<Set<number>>(new Set<number>());

  // Audience options for the Visible To editor and the audience filter.
  readonly audienceOptions = FAQ_AUDIENCE_OPTIONS;

  // User / Permissions
  isAdmin = signal<boolean>(false);
  userRole = signal<string>('CITIZEN');

  // Modal State for Add / Edit
  showModal = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  modalSubmitting = signal<boolean>(false);
  editingFaqId = signal<number | null>(null);

  // Form Fields
  formQuestion = '';
  formAnswer = '';
  formCategory = 'General';
  customCategory = '';
  formStatus = 'PUBLISHED';
  formAudience: string[] = ['ALL'];

  // Delete Confirmation Modal
  showDeleteModal = signal<boolean>(false);
  deletingFaqId = signal<number | null>(null);
  faqToDelete = signal<FAQ | null>(null);
  deleteSubmitting = signal<boolean>(false);

  // Available predefined categories
  predefinedCategories: string[] = [
    'General',
    'Policies',
    'Schemes',
    'Eligibility',
    'Account & Security',
    'Support',
  ];

  // Dynamic Categories derived from loaded FAQs
  categories = computed<string[]>(() => {
    const list = this.faqs();
    const set = new Set<string>();
    set.add('All');
    for (const f of list) {
      if (f.category && f.category.trim()) {
        set.add(f.category.trim());
      }
    }
    return Array.from(set);
  });

  /** PolicyGPT dropdown options (values unchanged). */
  categoryFilterOptions = computed<{ value: string; label: string }[]>(() =>
    this.categories().map((c) => ({
      value: c,
      label: c === 'All' ? 'All Categories' : c,
    })),
  );

  audienceFilterOptions = computed<{ value: string; label: string }[]>(() => [
    { value: 'All', label: 'All Audiences' },
    ...this.audienceOptions.map((opt) => ({
      value: opt.value,
      label: opt.value === 'ALL' ? 'All Users' : opt.label,
    })),
  ]);

  get formCategoryOptions(): string[] {
    return [...this.predefinedCategories, 'Custom'];
  }

  readonly formStatusOptions = [
    { value: 'PUBLISHED', label: 'Published (visible to selected audience)' },
    { value: 'DRAFT', label: 'Draft (hidden from users)' },
  ];

  // Filtered FAQs computed based on search, category and audience
  filteredFaqs = computed<FAQ[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.selectedCategory();
    const audience = this.selectedAudience();
    return this.faqs().filter((faq) => {
      const matchCategory =
        category === 'All' ||
        (faq.category && faq.category.toLowerCase() === category.toLowerCase());

      const matchAudience =
        audience === 'All' || faqAudienceChips(faq).includes(audience);

      const matchQuery =
        !query ||
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query) ||
        (faq.category && faq.category.toLowerCase().includes(query));

      return matchCategory && matchAudience && matchQuery;
    });
  });

  /** Compact audience chip labels for a row (NULL legacy rows → ALL). */
  audienceChips(faq: FAQ): string[] {
    return faqAudienceChips(faq);
  }

  audienceChipLabel(code: string): string {
    return faqAudienceLabel(code);
  }

  /** Visible To checkbox toggle: ALL overrides role-specific picks. */
  toggleAudience(code: string): void {
    const current = new Set(
      (this.formAudience || []).map((c) => (c || '').toUpperCase()),
    );
    if (current.has(code)) {
      current.delete(code);
      if (current.size === 0) {
        current.add('ALL');
      }
    } else if (code === 'ALL') {
      this.formAudience = ['ALL'];
      return;
    } else {
      current.delete('ALL');
      current.add(code);
    }
    this.formAudience = normalizeFaqAudience(Array.from(current));
  }

  isAudienceSelected(code: string): boolean {
    return (this.formAudience || [])
      .map((c) => (c || '').toUpperCase())
      .includes(code);
  }

  selectAudience(audience: string): void {
    this.selectedAudience.set(audience);
  }

  constructor(
    private readonly faqService: FaqService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly scrollLock: BodyScrollLockService,
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadFaqs();
  }

  ngOnDestroy(): void {
    // Safety net: never leave the page scroll-locked. At most one of
    // the two modals can be open at a time, so a single release pairs
    // exactly with the outstanding lock.
    if (this.showModal() || this.showDeleteModal()) {
      this.scrollLock.unlock();
    }
  }

  checkUserRole(): void {
    const role = this.authService.getUserRole() || 'CITIZEN';
    this.userRole.set(role);
    const admin = role === 'ADMIN' || role === 'ADMINISTRATOR';
    this.isAdmin.set(admin);
  }

  loadFaqs(): void {
    this.loading.set(true);
    this.error.set(null);

    this.faqService.getFaqs().subscribe({
      next: (data) => {
        this.faqs.set(data || []);
        this.loading.set(false);
        // All FAQs start collapsed; answers open on demand.
      },
      error: (err) => {
        console.error('Failed to load FAQs:', err);
        this.error.set('Failed to load FAQs. Please check your network or try again.');
        this.loading.set(false);
      },
    });
  }

  toggleFaq(faqId: number): void {
    const current = new Set(this.expandedFaqIds());
    if (current.has(faqId)) {
      current.delete(faqId);
    } else {
      current.add(faqId);
    }
    this.expandedFaqIds.set(current);
  }

  isExpanded(faqId: number): boolean {
    return this.expandedFaqIds().has(faqId);
  }

  /** Single hover-preview target: only one preview visible at a time. */
  hoveredFaqId: number | null = null;

  setHover(faqId: number): void {
    this.hoveredFaqId = faqId;
  }

  clearHover(): void {
    this.hoveredFaqId = null;
  }

  isHovered(faqId: number): boolean {
    return this.hoveredFaqId === faqId;
  }

  isPublished(faq: FAQ): boolean {
    return (faq.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED';
  }

  togglePublish(faq: FAQ, event: Event): void {
    event.stopPropagation();
    const nextStatus = this.isPublished(faq) ? 'DRAFT' : 'PUBLISHED';
    this.faqService.updateFaq(faq.faq_id, { status: nextStatus }).subscribe({
      next: (updated) => {
        this.toastService.success(
          nextStatus === 'PUBLISHED' ? 'FAQ Published' : 'FAQ Unpublished',
          nextStatus === 'PUBLISHED'
            ? 'The FAQ is now visible to all users.'
            : 'The FAQ is hidden from users until republished.'
        );
        this.faqs.update((list) =>
          list.map((f) => (f.faq_id === updated.faq_id ? updated : f))
        );
      },
      error: (err) => {
        console.error('Error updating FAQ status:', err);
        this.toastService.error(
          'Status Update Failed',
          err.error?.detail || 'Could not update FAQ status.'
        );
      },
    });
  }

  expandAll(): void {
    const allIds = new Set(this.filteredFaqs().map((f) => f.faq_id));
    this.expandedFaqIds.set(allIds);
  }

  collapseAll(): void {
    this.expandedFaqIds.set(new Set<number>());
  }

  selectCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  getFeedbackRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') {
      return '/dashboard/admin/feedback';
    }
    return `/dashboard/${r}/feedback`;
  }

  getFaqDetailsRoute(faqId: number): string[] {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') {
      return ['/dashboard/admin/faqs', String(faqId)];
    }
    if (r === 'government_official' || r === 'government') {
      return ['/dashboard/government/faqs', String(faqId)];
    }
    if (r === 'researcher') {
      return ['/dashboard/researcher/faqs', String(faqId)];
    }
    if (r === 'organization') {
      return ['/dashboard/organization/faqs', String(faqId)];
    }
    return ['/dashboard/citizen/faqs', String(faqId)];
  }

  getHomeRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin';
    if (r === 'government_official' || r === 'government') return '/dashboard/government';
    if (r === 'researcher') return '/dashboard/researcher';
    if (r === 'organization') return '/dashboard/organization';
    return '/dashboard/citizen';
  }

  /** Breadcrumb trail: Home > FAQs (role-aware via getHomeRoute). */
  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Home', route: [this.getHomeRoute()] },
      { label: 'FAQs' },
    ];
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate([this.getHomeRoute()]);
    }
  }

  // =========================================================
  // ADMIN ACTIONS: ADD / EDIT
  // =========================================================

  openAddModal(): void {
    this.isEditMode.set(false);
    this.editingFaqId.set(null);
    this.formQuestion = '';
    this.formAnswer = '';
    this.formCategory = 'General';
    this.customCategory = '';
    this.formStatus = 'PUBLISHED';
    this.formAudience = ['ALL'];
    this.showModal.set(true);
    this.scrollLock.lock();
  }

  openEditModal(faq: FAQ, event: Event): void {
    event.stopPropagation();
    this.isEditMode.set(true);
    this.editingFaqId.set(faq.faq_id);
    this.formQuestion = faq.question;
    this.formAnswer = faq.answer;
    this.formStatus = (faq.status || 'PUBLISHED').toUpperCase();
    this.formAudience = normalizeFaqAudience(faqAudienceChips(faq));

    if (this.predefinedCategories.includes(faq.category || '')) {
      this.formCategory = faq.category || 'General';
      this.customCategory = '';
    } else if (faq.category) {
      this.formCategory = 'Custom';
      this.customCategory = faq.category;
    } else {
      this.formCategory = 'General';
      this.customCategory = '';
    }

    this.showModal.set(true);
    this.scrollLock.lock();
  }

  closeModal(): void {
    this.showModal.set(false);
    this.modalSubmitting.set(false);
    this.scrollLock.unlock();
  }

  saveFaq(): void {
    if (!this.formQuestion.trim() || !this.formAnswer.trim()) {
      this.toastService.warning('Validation Warning', 'Please provide both question and answer.');
      return;
    }

    const finalCategory =
      this.formCategory === 'Custom'
        ? this.customCategory.trim() || 'General'
        : this.formCategory;

    this.modalSubmitting.set(true);

    if (this.isEditMode() && this.editingFaqId()) {
      const payload: FAQUpdate = {
        question: this.formQuestion.trim(),
        answer: this.formAnswer.trim(),
        category: finalCategory,
        status: this.formStatus,
        target_roles: normalizeFaqAudience(this.formAudience),
      };

      this.faqService.updateFaq(this.editingFaqId()!, payload).subscribe({
        next: (updated) => {
          this.toastService.success('FAQ Updated', 'FAQ has been successfully updated.');
          this.faqs.update((list) =>
            list.map((f) => (f.faq_id === updated.faq_id ? updated : f))
          );
          this.modalSubmitting.set(false);
          this.closeModal();
        },
        error: (err) => {
          console.error('Error updating FAQ:', err);
          this.toastService.error('Update Failed', err.error?.detail || 'Could not update FAQ.');
          this.modalSubmitting.set(false);
        },
      });
    } else {
      const payload: FAQCreate = {
        question: this.formQuestion.trim(),
        answer: this.formAnswer.trim(),
        category: finalCategory,
        status: this.formStatus,
        target_roles: normalizeFaqAudience(this.formAudience),
      };

      this.faqService.createFaq(payload).subscribe({
        next: (created) => {
          this.toastService.success('FAQ Created', 'New FAQ has been added successfully.');
          this.faqs.update((list) => [created, ...list]);
          this.modalSubmitting.set(false);
          this.closeModal();
        },
        error: (err) => {
          console.error('Error creating FAQ:', err);
          this.toastService.error('Creation Failed', err.error?.detail || 'Could not create FAQ.');
          this.modalSubmitting.set(false);
        },
      });
    }
  }

  // =========================================================
  // ADMIN ACTIONS: DISPLAY ORDER
  // =========================================================

  orderedFaqs(): FAQ[] {
    return [...this.faqs()].sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) ||
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
  }

  moveFaq(faq: FAQ, direction: -1 | 1): void {
    const list = this.orderedFaqs();
    const index = list.findIndex((f) => f.faq_id === faq.faq_id);
    const neighbor = list[index + direction];
    if (index < 0 || !neighbor) {
      return;
    }
    const faqOrder = faq.display_order ?? 0;
    const neighborOrder = neighbor.display_order ?? 0;
    // Swap the two display orders so the public list order changes.
    this.faqService.updateFaq(faq.faq_id, { display_order: neighborOrder }).subscribe({
      next: () => {
        this.faqService
          .updateFaq(neighbor.faq_id, { display_order: faqOrder })
          .subscribe({
            next: () => {
              this.toastService.success('FAQ Reordered', 'Display order updated.');
              this.loadFaqs();
            },
            error: (err) => {
              // Roll back the first write so ordering never corrupts.
              this.faqService
                .updateFaq(faq.faq_id, { display_order: faqOrder })
                .subscribe();
              this.toastService.error(
                'Reorder Failed',
                err.error?.detail || 'Could not update display order.',
              );
            },
          });
      },
      error: (err) => {
        this.toastService.error(
          'Reorder Failed',
          err.error?.detail || 'Could not update display order.',
        );
      },
    });
  }

  // =========================================================
  // ADMIN ACTIONS: DELETE
  // =========================================================

  confirmDelete(faq: FAQ, event: Event): void {
    event.stopPropagation();
    this.faqToDelete.set(faq);
    this.deletingFaqId.set(faq.faq_id);
    this.showDeleteModal.set(true);
    this.scrollLock.lock();
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deletingFaqId.set(null);
    this.faqToDelete.set(null);
    this.deleteSubmitting.set(false);
    this.scrollLock.unlock();
  }

  executeDelete(): void {
    const id = this.deletingFaqId();
    if (!id) return;

    this.deleteSubmitting.set(true);
    this.faqService.deleteFaq(id).subscribe({
      next: () => {
        this.toastService.success('FAQ Deleted', 'FAQ was removed successfully.');
        this.faqs.update((list) => list.filter((f) => f.faq_id !== id));
        this.deleteSubmitting.set(false);
        this.closeDeleteModal();
      },
      error: (err) => {
        console.error('Error deleting FAQ:', err);
        this.toastService.error('Delete Failed', err.error?.detail || 'Could not delete FAQ.');
        this.deleteSubmitting.set(false);
      },
    });
  }
}
