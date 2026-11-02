import { afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule } from '@angular/platform-browser/testing';
import { platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

// Initialise the Angular TestBed once for raw `vitest` runs.
// (`ng test` provides its own equivalent setup via the unit-test builder.)
// NOTE: BrowserTestingModule lives in @angular/platform-browser/testing —
// @angular/platform-browser-dynamic/testing only exports
// BrowserDynamicTestingModule + platformBrowserDynamicTesting.
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserDynamicTesting(),
);

// Mirror the unit-test builder behaviour: destroy fixtures and reset the
// test module after every test so the next test can re-configure TestBed.
afterEach(() => {
  getTestBed().resetTestingModule();
});

