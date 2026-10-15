import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Bridges footer login-gated actions to the existing guest topbar
 * login/signup modal (TopbarComponent.requireLogin). The footer and the
 * topbar are sibling components, so the footer publishes a prompt request
 * and the mounted topbar opens its own modal — no duplicated modal.
 */
@Injectable({ providedIn: 'root' })
export class LoginPromptService {
  private readonly promptSubject = new Subject<string>();

  readonly prompt$: Observable<string> =
    this.promptSubject.asObservable();

  requestLogin(feature: string): void {
    this.promptSubject.next(feature);
  }
}
