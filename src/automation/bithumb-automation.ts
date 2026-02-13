import { PageActions } from './page-actions';

export class BithumbAutomation {
  constructor(private readonly actions: PageActions) {}

  async ensureMarginSession() {
    return this.actions.captureScreenshot('bithumb-margin');
  }
}
