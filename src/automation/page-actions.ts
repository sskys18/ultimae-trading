import { BrowserManager } from './browser-manager';

export class PageActions {
  constructor(private readonly browserManager: BrowserManager) {}

  async captureScreenshot(label: string) {
    const browser = await this.browserManager.start();
    // Real implementation would navigate and capture
    await browser.close();
    return `screenshot-${label}.png`;
  }
}
