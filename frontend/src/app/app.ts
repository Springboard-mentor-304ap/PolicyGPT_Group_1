import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ChatbotComponent } from './features/chatbot/chatbot.component';

@Component({
  imports: [RouterOutlet, ToastContainerComponent, ChatbotComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly title = signal('policygpt-frontend');

  private readonly router = inject(Router);

  /** Chatbot is hidden on authentication-only pages (see isAuthRoute). */
  showChatbot = true;

  ngOnInit(): void {
    this.showChatbot = !isAuthRoute(this.router.url);
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.showChatbot = !isAuthRoute((event as NavigationEnd).urlAfterRedirects);
      });
  }
}

/**
 * Authentication-only routes where the chatbot launcher must not render.
 * Covers /auth/login, /auth/register, /auth/signup and
 * /auth/password-reset (forgot-password + OTP verification + password
 * reset steps all live in that single component), plus any future
 * /auth child route. Authenticated dashboard pages such as
 * /dashboard/.../change-password are NOT matched and keep the chatbot.
 */
export function isAuthRoute(url: string): boolean {
  const path = (url || '').split('?')[0].split('#')[0].trim().toLowerCase();
  if (path === '' || path === '/') {
    return true;
  }
  return path === '/auth' || path.startsWith('/auth/');
}
