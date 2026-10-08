import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Subject, finalize, takeUntil } from "rxjs";

import { SupportService } from "../../../core/services/support.service";
import { TicketMessage } from "../../../core/models/support.model";

/**
 * Threaded conversation on a support ticket.
 *
 * Shared by the user ticket-details page and the admin respond modal:
 * chronological messages with sender identity, loading/empty/error
 * states, and a reply box. Real API data only (`/support/.../messages`).
 */
@Component({
  selector: "app-ticket-conversation",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="conversation" aria-label="Ticket conversation">
      @if (loading()) {
        <div class="conv-state" aria-busy="true">
          <span class="conv-spinner" aria-hidden="true"></span>
          <span>Loading conversation...</span>
        </div>
      } @else if (loadError()) {
        <div class="conv-state conv-state--error" role="alert">
          <span class="material-icons" aria-hidden="true">error_outline</span>
          <span>{{ loadError() }}</span>
          <button type="button" class="conv-retry" (click)="load()">
            Try Again
          </button>
        </div>
      } @else if (messages().length === 0) {
        <div class="conv-state conv-state--empty">
          <span class="material-icons" aria-hidden="true">forum</span>
          <span
            >No replies yet.
            {{ canReply ? "Write the first reply below." : "" }}</span
          >
        </div>
      } @else {
        <ol class="conv-list">
          @for (msg of messages(); track msg.id) {
            <li
              class="conv-row"
              [class.conv-row--admin]="isAdminMessage(msg)"
            >
              <div
                class="conv-msg"
                [class.conv-msg--admin]="isAdminMessage(msg)"
              >
                <div class="conv-meta">
                  <span class="conv-sender">
                    {{
                      msg.sender_name ||
                        (isAdminMessage(msg) ? "Support Team" : "You")
                    }}
                  </span>
                  <span
                    class="conv-role"
                    [class.conv-role--admin]="isAdminMessage(msg)"
                  >
                    {{ isAdminMessage(msg) ? "Admin" : "User" }}
                  </span>
                  <time class="conv-time">{{
                    msg.created_at | date: "MMM d, y, h:mm a"
                  }}</time>
                </div>
                <p class="conv-text">{{ msg.message }}</p>
              </div>
            </li>
          }
        </ol>
      }

      @if (canReply) {
        @if (replyError()) {
          <div class="conv-error" role="alert">
            <span class="material-icons" aria-hidden="true">error_outline</span>
            <span>{{ replyError() }}</span>
          </div>
        }
        <form class="conv-reply" (ngSubmit)="sendReply()">
          <label class="conv-reply-label" [for]="replyInputId"
            >Write a reply...</label
          >
          <textarea
            [id]="replyInputId"
            [(ngModel)]="draft"
            name="reply"
            rows="3"
            maxlength="5000"
            placeholder="Write a reply..."
            [disabled]="sending()"
          ></textarea>
          <div class="conv-reply-actions">
            <button
              type="submit"
              class="conv-send"
              [disabled]="sending() || !draft.trim()"
            >
              @if (sending()) {
                <span
                  class="conv-spinner conv-spinner--btn"
                  aria-hidden="true"
                ></span>
                <span>Sending...</span>
              } @else {
                <span class="material-icons" aria-hidden="true">send</span>
                <span>Send Reply</span>
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .conversation {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .conv-state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 16px;
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
        color: #64748b;
        font-size: 13px;
        text-align: center;
      }
      .conv-state--error {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fef2f2;
      }
      .conv-retry {
        border: 1px solid #cbd5e1;
        background: #fff;
        border-radius: 7px;
        padding: 6px 12px;
        font: inherit;
        font-size: 12.5px;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
      }
      .conv-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(36, 87, 214, 0.25);
        border-top-color: #2457d6;
        border-radius: 50%;
        animation: conv-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
      .conv-spinner--btn {
        border-color: rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        width: 15px;
        height: 15px;
      }
      @keyframes conv-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .conv-list {
        list-style: none;
        margin: 0;
        padding: 4px 2px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 300px;
        overflow-y: auto;
      }
      .conv-row {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        display: flex;
        justify-content: flex-start;
      }
      .conv-row--admin {
        justify-content: flex-end;
      }
      .conv-msg {
        width: fit-content;
        max-width: 75%;
        min-width: 0;
        box-sizing: border-box;
        margin-left: 0;
        margin-right: auto;
        border: 1px solid #e4e9f1;
        border-radius: 4px 12px 12px 12px;
        padding: 10px 14px;
        background: #f8fafc;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
      }
      .conv-row--admin .conv-msg {
        margin-left: auto;
        margin-right: 0;
      }
      .conv-msg--admin {
        border-color: #c9dcfa;
        border-radius: 12px 4px 12px 12px;
        background: #e9f0fd;
      }
      .conv-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 4px;
      }
      .conv-sender {
        font-size: 13px;
        font-weight: 700;
        color: #172033;
      }
      .conv-role {
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
        background: #e2e8f0;
        border-radius: 4px;
        padding: 1px 6px;
      }
      .conv-role--admin {
        color: #1d4ed8;
        background: #dbeafe;
      }
      .conv-time {
        font-size: 11.5px;
        color: #94a3b8;
        margin-left: auto;
      }
      .conv-text {
        margin: 0;
        font-size: 13.5px;
        line-height: 1.55;
        color: #1e293b;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .conv-error {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #fef2f2;
        border: 1px solid #fee2e2;
        color: #b91c1c;
        padding: 9px 12px;
        border-radius: 8px;
        font-size: 12.5px;
      }
      .conv-reply {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .conv-reply-label {
        font-size: 12.5px;
        font-weight: 600;
        color: #475569;
      }
      .conv-reply textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
        font-size: 13.5px;
        color: #0f172a;
        resize: vertical;
      }
      .conv-reply textarea:focus {
        outline: 2px solid #2457d6;
        outline-offset: 0;
        border-color: #2457d6;
      }
      .conv-reply-actions {
        display: flex;
        justify-content: flex-end;
      }
      .conv-send {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid #2457d6;
        border-radius: 9px;
        background: #2457d6;
        color: #fff;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .conv-send:hover:not(:disabled) {
        background: #1d49b8;
      }
      .conv-send:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
      .conv-send .material-icons {
        font-size: 17px;
      }
      .conv-send:focus-visible,
      .conv-retry:focus-visible {
        outline: 2px solid #2457d6;
        outline-offset: 2px;
      }
      @media (max-width: 640px) {
        .conv-msg {
          max-width: 85%;
        }
      }
    `,
  ],
})
export class TicketConversationComponent implements OnInit, OnDestroy {
  @Input() ticketId = 0;
  @Input() mode: "user" | "admin" = "user";
  @Input() canReply = true;
  replied = output<TicketMessage>();

  private readonly supportService = inject(SupportService);
  private readonly destroy$ = new Subject<void>();

  messages = signal<TicketMessage[]>([]);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  sending = signal<boolean>(false);
  replyError = signal<string | null>(null);
  draft = "";

  readonly replyInputId = `ticket-reply-${Math.random().toString(36).slice(2, 8)}`;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isAdminMessage(msg: TicketMessage): boolean {
    return (msg.sender_role || "").toUpperCase() === "ADMIN";
  }

  load(): void {
    const id = this.ticketId;
    if (!Number.isFinite(id) || id <= 0) {
      this.loading.set(false);
      this.loadError.set("Invalid ticket reference.");
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    const request =
      this.mode === "admin"
        ? this.supportService.getTicketMessagesAdmin(id)
        : this.supportService.getTicketMessages(id);
    request
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (list) => this.messages.set(Array.isArray(list) ? list : []),
        error: (err) =>
          this.loadError.set(
            err?.status === 403
              ? "You do not have permission to view this conversation."
              : "Unable to load the conversation. Please try again.",
          ),
      });
  }

  sendReply(): void {
    const text = (this.draft || "").trim();
    if (!text || this.sending()) {
      return;
    }
    const id = this.ticketId;
    this.sending.set(true);
    this.replyError.set(null);
    const request =
      this.mode === "admin"
        ? this.supportService.postTicketMessageAdmin(id, { message: text })
        : this.supportService.postTicketMessage(id, { message: text });
    request
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.sending.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.messages.update((list) => [...list, created]);
          this.draft = "";
          this.replied.emit(created);
        },
        error: (err) =>
          this.replyError.set(
            err?.name === "TimeoutError"
              ? "Sending timed out. Please check whether your reply appears before retrying."
              : err?.error?.detail ||
                  "Unable to send your reply. Please try again.",
          ),
      });
  }
}
