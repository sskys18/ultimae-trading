import { describe, expect, it } from 'vitest';
import { BrowserManager } from '../../../src/automation/browser-manager';
import { PageActions } from '../../../src/automation/page-actions';
import { BithumbAutomation } from '../../../src/automation/bithumb-automation';

describe('BithumbAutomation', () => {
  it('captures screenshots when ensuring margin session', async () => {
    const automation = new BithumbAutomation(new PageActions(new BrowserManager()));
    const screenshot = await automation.ensureMarginSession();
    expect(screenshot).toContain('bithumb-margin');
  });
});
