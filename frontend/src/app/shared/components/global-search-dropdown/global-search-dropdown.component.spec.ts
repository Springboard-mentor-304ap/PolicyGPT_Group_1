import { describe, expect, it } from 'vitest';
import { GlobalSearchDropdownComponent } from './global-search-dropdown.component';

function makeDropdown(): GlobalSearchDropdownComponent {
  return new GlobalSearchDropdownComponent();
}

describe('GlobalSearchDropdownComponent', () => {
  it('reports no results when both lists are empty', () => {
    const c = makeDropdown();
    c.policies = [];
    c.schemes = [];
    c.loading = false;
    c.error = null;
    expect(c.hasResults).toBe(false);
    expect(c.showEmpty).toBe(true);
  });

  it('computes flat keyboard indices (policies first)', () => {
    const c = makeDropdown();
    c.policies = [{ policy_id: 1 } as never, { policy_id: 2 } as never];
    c.schemes = [{ scheme_id: 9 } as never];
    expect(c.flatIndex('policy', 0)).toBe(0);
    expect(c.flatIndex('policy', 1)).toBe(1);
    expect(c.flatIndex('scheme', 0)).toBe(2);
    c.activeIndex = 2;
    expect(c.isActive('scheme', 0)).toBe(true);
    expect(c.isActive('policy', 0)).toBe(false);
  });

  it('highlights query tokens without breaking HTML', () => {
    const c = makeDropdown();
    c.query = 'water policy';
    const html = c.highlight('National Water Policy <test>');
    expect(html).toContain('&lt;test&gt;');
    expect(html.toLowerCase()).toContain('mark');
  });

  it('falls back to whole phrase for short queries', () => {
    const c = makeDropdown();
    c.query = 'a';
    expect(c.highlight('National Health Policy')).toContain('mark');
  });

  it('truncates long descriptions', () => {
    const c = makeDropdown();
    const long = 'x'.repeat(200);
    expect(c.shortDescription(long).length).toBeLessThanOrEqual(96);
    expect(c.shortDescription('')).toBe('No description available.');
  });

  it('builds meta from category + department/ministry', () => {
    const c = makeDropdown();
    expect(
      c.metaForPolicy({ category: 'Health', department: 'Dept', ministry: 'Min' } as never),
    ).toBe('Health · Dept');
    expect(c.metaForScheme({ category: '', department: '', ministry: '' } as never)).toBe('');
  });
});
