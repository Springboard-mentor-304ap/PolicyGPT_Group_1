import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { RemoveUserComponent } from "./remove-user.component";
import { AdminUsersService, AdminUserApi } from "../../../../../core/services/admin-user.service";
import { Auth } from "../../../../../core/services/auth";
import { ToastService } from "../../../../../core/services/toast.service";

describe("RemoveUserComponent", () => {
  let component: RemoveUserComponent;
  let fixture: ComponentFixture<RemoveUserComponent>;
  let mockAdminUsersService: any;
  let mockAuth: any;
  let mockToastService: any;
  let mockRouter: any;

  const mockUsers: AdminUserApi[] = [
    {
      user_id: 1,
      full_name: "Admin User",
      email: "admin@gmail.com",
      role: "ADMINISTRATOR",
      phone: "+91 9876543210",
      date_of_birth: "1985-05-15",
      state: "Delhi",
      district: "New Delhi",
      occupation: "Administrator",
      organization: "Ministry of Electronics & IT",
      is_active: true,
      created_at: "2026-01-10T10:00:00Z",
      updated_at: "2026-01-10T10:00:00Z",
    },
    {
      user_id: 2,
      full_name: "Rahul Sharma",
      email: "rahul@test.gov.in",
      role: "GOVERNMENT_OFFICIAL",
      phone: "+91 9876500001",
      date_of_birth: "1990-08-20",
      state: "Maharashtra",
      district: "Mumbai",
      occupation: "Policy Officer",
      organization: "Ministry of Agriculture",
      is_active: true,
      created_at: "2026-02-15T10:00:00Z",
      updated_at: "2026-02-15T10:00:00Z",
    },
    {
      user_id: 3,
      full_name: "Priya Patel",
      email: "priya@research.org",
      role: "RESEARCHER",
      phone: "+91 9876500002",
      date_of_birth: "1992-11-12",
      state: "Gujarat",
      district: "Ahmedabad",
      occupation: "Senior Researcher",
      organization: "Policy Research Institute",
      is_active: false,
      created_at: "2026-03-01T10:00:00Z",
      updated_at: "2026-03-01T10:00:00Z",
    },
  ];

  beforeEach(async () => {
    mockAdminUsersService = {
      getUsers: vi.fn().mockReturnValue(of(mockUsers)),
      deleteUser: vi.fn().mockReturnValue(of({ message: "User deleted successfully", email: "rahul@test.gov.in" })),
      getPastUsersCount: vi.fn().mockReturnValue(of({ past_users: 5 })),
      getUserStats: vi.fn().mockReturnValue(of({ past_users: 5, total_users: 3, active_users: 2, inactive_users: 1, administrators: 1 })),
    };

    mockAuth = {
      getStoredUser: vi.fn().mockReturnValue({
        user_id: 1,
        email: "admin@gmail.com",
        role: "ADMINISTRATOR",
      }),
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RemoveUserComponent],
      providers: [
        { provide: AdminUsersService, useValue: mockAdminUsersService },
        { provide: Auth, useValue: mockAuth },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RemoveUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create the RemoveUserComponent and load users and past users count", () => {
    expect(component).toBeTruthy();
    expect(mockAdminUsersService.getUsers).toHaveBeenCalled();
    expect(mockAdminUsersService.getPastUsersCount).toHaveBeenCalled();
    expect(component.users.length).toBe(3);
    expect(component.pastUsersCount).toBe(5);
    expect(component.isLoading).toBe(false);
  });

  it("should correctly separate active, inactive, administrators, and past users", () => {
    expect(component.activeUsers).toBe(2);
    expect(component.inactiveUsers).toBe(1);
    expect(component.administratorUsers).toBe(1);
    expect(component.pastUsersCount).toBe(5);
  });

  it("should prevent currently logged-in Admin from removing their own account", () => {
    const adminUser = component.users.find((u) => u.id === 1)!;
    expect(component.isSelf(adminUser)).toBe(true);

    component.openRemoveModal(adminUser);
    expect(mockToastService.warning).toHaveBeenCalledWith(
      "Action Restricted",
      expect.stringContaining("cannot remove your own")
    );
    expect(component.isModalOpen).toBe(false);
  });

  it("should open confirmation modal when remove button is clicked for a removable user", () => {
    const targetUser = component.users.find((u) => u.id === 2)!;
    expect(component.isSelf(targetUser)).toBe(false);

    component.openRemoveModal(targetUser);

    expect(component.isModalOpen).toBe(true);
    expect(component.selectedUser?.email).toBe("rahul@test.gov.in");
    expect(component.deleteError).toBe("");
  });

  it("should close modal when cancel is clicked without making API deletion call", () => {
    const targetUser = component.users.find((u) => u.id === 2)!;
    component.openRemoveModal(targetUser);
    expect(component.isModalOpen).toBe(true);

    component.closeModal();

    expect(component.isModalOpen).toBe(false);
    expect(component.selectedUser).toBeNull();
    expect(mockAdminUsersService.deleteUser).not.toHaveBeenCalled();
  });

  it("should call deleteUser and refresh the user list and past users count on confirmation", () => {
    const targetUser = component.users.find((u) => u.id === 2)!;
    component.openRemoveModal(targetUser);

    // Mock count increment upon reload
    mockAdminUsersService.getPastUsersCount.mockReturnValue(of({ past_users: 6 }));

    component.confirmRemoval();

    expect(mockAdminUsersService.deleteUser).toHaveBeenCalledWith("rahul@test.gov.in");
    expect(mockToastService.success).toHaveBeenCalledWith(
      "User Removed",
      expect.any(String)
    );
    expect(component.isModalOpen).toBe(false);
    // getUsers re-called on success
    expect(mockAdminUsersService.getUsers).toHaveBeenCalledTimes(2);
    // getPastUsersCount re-called on success
    expect(mockAdminUsersService.getPastUsersCount).toHaveBeenCalledTimes(2);
    expect(component.pastUsersCount).toBe(6);
  });

  it("should display error message and leave past users count unchanged if deletion fails", () => {
    mockAdminUsersService.deleteUser.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { detail: "Cannot delete user with active policy assignments." },
      }))
    );

    const initialPastCount = component.pastUsersCount;
    const targetUser = component.users.find((u) => u.id === 2)!;
    component.openRemoveModal(targetUser);

    component.confirmRemoval();

    expect(component.isDeleting).toBe(false);
    expect(component.deleteError).toBe("Cannot delete user with active policy assignments.");
    expect(mockToastService.error).toHaveBeenCalledWith(
      "Removal Failed",
      "Cannot delete user with active policy assignments."
    );
    // Past users count unchanged
    expect(component.pastUsersCount).toBe(initialPastCount);
    // Modal remains open on error
    expect(component.isModalOpen).toBe(true);
  });

  it("should filter users by search text and role", () => {
    component.searchText = "Priya";
    component.applyFilters();
    expect(component.filteredUsers.length).toBe(1);
    expect(component.filteredUsers[0].fullName).toBe("Priya Patel");

    component.clearFilters();
    expect(component.filteredUsers.length).toBe(3);

    component.selectedRole = "GOVERNMENT_OFFICIAL";
    component.applyFilters();
    expect(component.filteredUsers.length).toBe(1);
    expect(component.filteredUsers[0].role).toBe("GOVERNMENT_OFFICIAL");
  });
});
