import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [ToastService],
    });
    service = TestBed.inject(ToastService);
    service.clear();
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
  });

  it('should be created with an empty toast list', () => {
    expect(service).toBeTruthy();
    expect(service.toasts()).toEqual([]);
  });

  it('should add a success toast with default duration 5000ms', () => {
    service.success('Operation Successful', 'Data has been saved.');
    const active = service.toasts();
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('success');
    expect(active[0].title).toBe('Operation Successful');
    expect(active[0].message).toBe('Data has been saved.');
    expect(active[0].duration).toBe(5000);
  });

  it('should add an error toast with default duration 7000ms', () => {
    service.error('Failed', 'Network connection timed out.');
    const active = service.toasts();
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('error');
    expect(active[0].duration).toBe(7000);
  });

  it('should add a warning toast with default duration 6000ms', () => {
    service.warning('Warning', 'Approaching quota limit.');
    const active = service.toasts();
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].duration).toBe(6000);
  });

  it('should add an info toast with default duration 5000ms', () => {
    service.info('Info', 'New updates available.');
    const active = service.toasts();
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('info');
    expect(active[0].duration).toBe(5000);
  });

  it('should prevent duplicate notifications triggered in rapid succession (<1500ms)', () => {
    service.success('Export Successful', 'Policies exported as PDF.');
    service.success('Export Successful', 'Policies exported as PDF.');
    service.success('Export Successful', 'Policies exported as PDF.');

    expect(service.toasts().length).toBe(1);
  });

  it('should allow distinct notifications and stack them', () => {
    service.success('Export Successful', 'Policies exported as PDF.');
    service.info('Background Sync', 'Syncing latest records.');
    service.error('Validation Warning', 'One item requires review.');

    const active = service.toasts();
    expect(active.length).toBe(3);
    expect(active[0].title).toBe('Export Successful');
    expect(active[1].title).toBe('Background Sync');
    expect(active[2].title).toBe('Validation Warning');
  });

  it('should allow identical notifications after dedup window and previous dismissal', () => {
    service.success('Action Done', 'Item updated.');
    expect(service.toasts().length).toBe(1);

    // Fast-forward past dismissal and dedup window
    vi.advanceTimersByTime(6000);
    expect(service.toasts().length).toBe(0);

    service.success('Action Done', 'Item updated.');
    expect(service.toasts().length).toBe(1);
  });

  it('should remove a toast manually by id', () => {
    service.success('Toast 1');
    service.info('Toast 2');
    const [t1, t2] = service.toasts();

    service.remove(t1.id);
    expect(service.toasts().map(t => t.id)).toEqual([t2.id]);
  });

  it('should automatically dismiss toasts when duration expires', () => {
    service.success('Auto Dismiss', 'Will disappear in 5s', 5000);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(4999);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(service.toasts().length).toBe(0);
  });

  it('should clear all toasts and dedup state on clear()', () => {
    service.success('Toast 1');
    service.error('Toast 2');
    expect(service.toasts().length).toBe(2);

    service.clear();
    expect(service.toasts().length).toBe(0);

    // After clear, same message can be shown immediately
    service.success('Toast 1');
    expect(service.toasts().length).toBe(1);
  });
});
