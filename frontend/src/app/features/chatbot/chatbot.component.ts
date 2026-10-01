import { CommonModule } from "@angular/common";
import { Component, ElementRef, HostListener, ViewChild, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { Auth } from "../../core/services/auth";
import { ChatbotService } from "../../core/services/chatbot.service";
import { ToastService } from "../../core/services/toast.service";
import {
  ChatAction,
  ChatHistoryMessage,
  ChatResponseData,
  ChatResultItem,
  ChatUiMessage,
  QuickAction,
} from "../../core/models/chatbot.model";

const ROLE_GREETING_BODY: Record<string, string> = {
  CITIZEN:
    "I can help you find government schemes, check eligibility, understand policies, compare schemes, and get guidance about government programmes.",
  GOVERNMENT_OFFICIAL:
    "I can help you find policies and schemes, understand government programmes, access department information, and navigate PolicyGPT.",
  RESEARCHER:
    "I can help you explore policies, schemes, eligibility rules, comparisons and available government information.",
  ORGANIZATION:
    "I can help you find government schemes, policies, benefits and eligibility information relevant to organizations.",
  ADMIN:
    "I can help you navigate PolicyGPT and retrieve information available to administrators.",
  GUEST:
    "I can help you explore publicly available government policies and schemes.",
};

const ROLE_QUICK_ACTIONS: Record<string, QuickAction[]> = {
  CITIZEN: [
    { label: "Find schemes for me", message: "Find schemes for me", icon: "search" },
    { label: "Check my eligibility", message: "How do I check my eligibility?", icon: "fact_check" },
    { label: "Explain a policy", message: "Explain a policy in simple language", icon: "description" },
    { label: "Compare schemes", message: "Compare two schemes", icon: "compare_arrows" },
    { label: "Show notifications", message: "Show my notifications", icon: "notifications" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
  GOVERNMENT_OFFICIAL: [
    { label: "Search policies", message: "Search government policies", icon: "search" },
    { label: "Search schemes", message: "Search government schemes", icon: "search" },
    { label: "Explain policy", message: "Explain a policy", icon: "description" },
    { label: "Compare schemes", message: "Compare two schemes", icon: "compare_arrows" },
    { label: "Department information", message: "Show department information", icon: "domain" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
  RESEARCHER: [
    { label: "Search policies", message: "Search policies", icon: "search" },
    { label: "Search schemes", message: "Search schemes", icon: "search" },
    { label: "Compare policies", message: "Compare two policies", icon: "compare_arrows" },
    { label: "Compare schemes", message: "Compare two schemes", icon: "compare_arrows" },
    { label: "Policy analysis", message: "Show policy trends and analysis", icon: "analytics" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
  ORGANIZATION: [
    { label: "Find relevant schemes", message: "Find schemes relevant for organizations", icon: "search" },
    { label: "Search policies", message: "Search policies", icon: "search" },
    { label: "Check eligibility", message: "How do I check eligibility?", icon: "fact_check" },
    { label: "Compare schemes", message: "Compare two schemes", icon: "compare_arrows" },
    { label: "Application guidance", message: "How do I apply for a scheme?", icon: "assignment" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
  ADMIN: [
    { label: "Policy information", message: "Show policy information", icon: "description" },
    { label: "Scheme information", message: "Show scheme information", icon: "account_balance" },
    { label: "Analytics information", message: "Show analytics information", icon: "analytics" },
    { label: "Reports information", message: "Show reports information", icon: "query_stats" },
    { label: "User management help", message: "Help with user management", icon: "group" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
  GUEST: [
    { label: "Search public policies", message: "Search public policies", icon: "search" },
    { label: "Search public schemes", message: "Search public schemes", icon: "search" },
    { label: "Explain public information", message: "Explain a government scheme in simple language", icon: "description" },
    { label: "General FAQ", message: "Show frequently asked questions", icon: "quiz" },
    { label: "Help & Support", message: "I need help and support", icon: "support_agent" },
  ],
};

const QUICK_ACTION_DESCRIPTIONS: Record<string, string> = {
  "Find schemes for me": "Discover eligible schemes",
  "Check my eligibility": "Check who qualifies",
  "Explain a policy": "Simple explanations",
  "Compare schemes": "Side-by-side compare",
  "Show notifications": "Your latest updates",
  "Help & Support": "FAQs and help",
  "Search policies": "Browse policies",
  "Search schemes": "Browse schemes",
  "Explain policy": "Simple explanations",
  "Compare policies": "Side-by-side compare",
  "Department information": "Departments & contacts",
  "Search public policies": "Public policies",
  "Search public schemes": "Public schemes",
  "Explain public information": "Simple explanations",
  "General FAQ": "Common questions",
  "Find relevant schemes": "Schemes for orgs",
  "Check eligibility": "Check who qualifies",
  "Application guidance": "How to apply",
  "Policy information": "Policy records",
  "Scheme information": "Scheme records",
  "Analytics information": "Usage insights",
  "Reports information": "Report summaries",
  "User management help": "Manage users",
  "Policy analysis": "Trends & analysis",
};

export interface HistoryGroup {
  label: string;
  items: ChatHistoryMessage[];
}

@Component({
  selector: "app-chatbot",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./chatbot.component.html",
  styleUrl: "./chatbot.component.scss",
})
export class ChatbotComponent {
  private readonly chatbot = inject(ChatbotService);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  @ViewChild("messageList") private messageList?: ElementRef<HTMLElement>;
  @ViewChild("composer") private composer?: ElementRef<HTMLTextAreaElement>;

  // Legacy state names (kept for backward compatibility with tests).
  open = false;
  minimized = false;
  loading = false;
  sending = false;

  messages: ChatUiMessage[] = [];
  draft = "";
  conversationId: number | null = null;
  historyLoaded = false;
  guestLimitReached = false;

  // New UI state (kept separate per spec).
  isFullscreen = false;
  isHistoryOpen = false;
  showDeleteConfirm = false;
  deletingHistory = false;
  rawHistory: ChatHistoryMessage[] = [];
  selectedConversation: number | null = null;
  guestUsage: { message_count: number; guest_remaining: number | null } | null = null;

  private messageSeq = 0;
  private stickToBottom = true;

  // =========================================================
  // STATE ALIASES (spec §29 names, synced with legacy fields)
  // =========================================================

  get isOpen(): boolean {
    return this.open && !this.minimized;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  get activeConversation(): number | null {
    return this.conversationId;
  }

  // =========================================================
  // ROLE + PERSONALIZATION
  // =========================================================

  get userRole(): string {
    return (this.auth.getUserRole() || "GUEST").toUpperCase().trim();
  }

  get displayName(): string {
    const stored = this.auth.getStoredUser() as unknown as Record<string, unknown> | null;
    const fullName =
      typeof stored?.["full_name"] === "string"
        ? (stored["full_name"] as string).trim()
        : "";
    if (fullName) {
      return fullName;
    }
    const email =
      typeof stored?.["email"] === "string" ? (stored["email"] as string) : "";
    if (email && email.includes("@")) {
      const prefix = email.split("@")[0].trim();
      if (prefix) {
        return prefix
          .split(/[._-]+/)
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");
      }
    }
    return "";
  }

  get rolePrefix(): string {
    switch (this.userRole) {
      case "ADMIN":
      case "ADMINISTRATOR":
        return "admin";
      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT":
        return "government";
      case "RESEARCHER":
        return "researcher";
      case "ORGANIZATION":
      case "ORGANISATION":
        return "organization";
      case "GUEST":
        return "guest";
      case "CITIZEN":
      default:
        return "citizen";
    }
  }

  get greeting(): string {
    const body =
      ROLE_GREETING_BODY[this.userRole] ||
      "How can I help you today?";
    const name = this.displayName;
    if (name) {
      return `Hello, ${name}! \u{1F44B}\n\n${body}\n\nHow can I help you today?`;
    }
    return `Hello! I'm your PolicyGPT Assistant. ${body}`;
  }

  get quickActions(): QuickAction[] {
    return ROLE_QUICK_ACTIONS[this.userRole] || ROLE_QUICK_ACTIONS["GUEST"];
  }

  quickDescription(label: string): string {
    return QUICK_ACTION_DESCRIPTIONS[label] || "Ask PolicyGPT";
  }

  // =========================================================
  // PANEL STATE
  // =========================================================

  toggle(): void {
    if (this.open && !this.minimized) {
      this.minimized = true;
      return;
    }
    this.openPanel();
  }

  openPanel(): void {
    this.open = true;
    this.minimized = false;
    if (this.messages.length === 0) {
      this.pushAssistant(this.greeting);
    }
    if (!this.historyLoaded) {
      this.loadHistory();
    }
    this.stickToBottom = true;
    setTimeout(() => {
      this.composer?.nativeElement.focus();
      this.scrollToBottom(true);
    }, 60);
  }

  minimize(): void {
    this.minimized = true;
  }

  close(): void {
    this.open = false;
    this.minimized = false;
    this.isFullscreen = false;
    this.isHistoryOpen = false;
    this.showDeleteConfirm = false;
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    this.stickToBottom = true;
    setTimeout(() => this.scrollToBottom(true), 80);
  }

  openHistory(): void {
    this.isHistoryOpen = true;
    if (!this.historyLoaded) {
      this.loadHistory();
    }
  }

  closeHistory(): void {
    this.isHistoryOpen = false;
    this.showDeleteConfirm = false;
  }

  toggleHistory(): void {
    if (this.isHistoryOpen) {
      this.closeHistory();
    } else {
      this.openHistory();
    }
  }

  @HostListener("document:keydown", ["$event"])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return;
    }
    if (this.showDeleteConfirm) {
      this.cancelDelete();
      return;
    }
    if (this.isHistoryOpen) {
      this.closeHistory();
    }
  }

  onMessagesScroll(): void {
    const el = this.messageList?.nativeElement;
    if (!el) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickToBottom = distance < 80;
  }

  // =========================================================
  // NEW CHAT (non-destructive) + DELETE (with confirmation)
  // =========================================================

  /** Start a fresh view without deleting stored conversations. */
  startNewChat(): void {
    this.messages = [];
    this.conversationId = null;
    this.selectedConversation = null;
    this.guestLimitReached = false;
    this.isHistoryOpen = false;
    this.showDeleteConfirm = false;
    this.stickToBottom = true;
    this.pushAssistant(this.greeting);
    this.scrollToBottom(true);
    setTimeout(() => this.composer?.nativeElement.focus(), 60);
  }

  /** Legacy destructive clear — kept; delegates to confirmed delete. */
  clearConversation(): void {
    this.startNewChat();
  }

  requestDeleteHistory(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDeleteHistory(): void {
    if (this.deletingHistory) {
      return;
    }
    this.deletingHistory = true;
    this.chatbot.clearHistory().subscribe({
      next: () => {
        this.deletingHistory = false;
        this.showDeleteConfirm = false;
        this.isHistoryOpen = false;
        this.messages = [];
        this.rawHistory = [];
        this.conversationId = null;
        this.selectedConversation = null;
        this.historyLoaded = true;
        this.guestLimitReached = false;
        this.pushAssistant(this.greeting);
        this.scrollToBottom(true);
      },
      error: () => {
        this.deletingHistory = false;
        this.showDeleteConfirm = false;
        this.toast.error("Error", "Could not clear the conversation.");
      },
    });
  }

  // =========================================================
  // MESSAGING
  // =========================================================

  sendQuickAction(action: QuickAction): void {
    if (this.sending) {
      return;
    }
    this.draft = action.message;
    this.send();
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.sending) {
      return;
    }
    this.pushUser(text);
    this.draft = "";
    this.sending = true;
    this.loading = true;
    this.stickToBottom = true;
    this.scrollToBottom(true);

    this.chatbot
      .sendMessage({
        message: text,
        conversation_id: this.conversationId,
        context: { page: this.router.url },
      })
      .subscribe({
        next: (response) => {
          this.conversationId = response.conversation_id;
          this.selectedConversation = response.conversation_id;
          this.sending = false;
          this.loading = false;
          if (typeof response.guest_remaining === "number") {
            this.guestLimitReached = response.guest_remaining <= 0;
            this.guestUsage = {
              message_count: this.guestUsage?.message_count || 0,
              guest_remaining: response.guest_remaining,
            };
          }
          this.pushAssistant(
            response.message,
            response.actions || [],
            false,
            response.results || [],
            response.data || null,
          );
          this.scrollToBottom(true);
        },
        error: (error) => {
          this.sending = false;
          this.loading = false;
          this.handleSendError(error);
          this.scrollToBottom(true);
        },
      });
  }

  private handleSendError(error: unknown): void {
    const status = (error as { status?: number })?.status ?? 0;
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    const detailText =
      typeof detail === "string" && detail.length < 500 ? detail : "";
    if (status === 0) {
      this.pushAssistant(
        "That request took too long to process. Please try again.",
      );
    } else if (status === 403 && /guest chatbot limit/i.test(detailText)) {
      this.guestLimitReached = true;
      this.pushAssistant(detailText, [], true);
    } else if (status === 429) {
      this.pushAssistant(
        "You're sending messages too quickly. Please wait a moment and try again.",
      );
    } else if (status === 413) {
      this.pushAssistant(
        "That message is too long. Please shorten your question and try again.",
      );
    } else if (status === 401 || status === 403) {
      this.pushAssistant(
        "Please sign in to continue using PolicyGPT Assistant.",
      );
    } else {
      this.pushAssistant(
        detailText ||
          "Sorry, I couldn't process your request right now. Please try again.",
      );
    }
  }

  runAction(action: ChatAction): void {
    if (action.route) {
      void this.router.navigateByUrl(action.route);
      return;
    }
    const fallback = this.fallbackRoute(action.type);
    if (fallback) {
      void this.router.navigateByUrl(fallback);
    }
  }

  private fallbackRoute(type: string): string | null {
    const prefix = `/dashboard/${this.rolePrefix}`;
    switch ((type || "").toUpperCase()) {
      case "OPEN_NOTIFICATIONS":
        return `${prefix}/notifications`;
      case "OPEN_SAVED":
        return `${prefix}/saved`;
      case "OPEN_HISTORY":
        return `${prefix}/history`;
      case "OPEN_SUPPORT":
      case "OPEN_FAQ":
        return `${prefix}/support`;
      case "OPEN_REPORTS":
        return `${prefix}/reports`;
      case "OPEN_ANALYTICS":
        return `${prefix}/analytics`;
      case "CHECK_ELIGIBILITY":
        return `${prefix}/eligibility`;
      case "COMPARE":
        return `${prefix}/compare`;
      case "COMPARE_SCHEMES":
        return `${prefix}/compare`;
      case "VIEW_POLICY":
      case "VIEW_SCHEME":
        return null;
      case "OPEN_LOGIN":
        return "/auth/login";
      case "OPEN_REGISTER":
        return "/auth/register";
      default:
        return null;
    }
  }

  // =========================================================
  // HISTORY (existing GET /chatbot/history only — no fake data)
  // =========================================================

  private loadHistory(): void {
    this.chatbot.getHistory().subscribe({
      next: (history) => {
        this.historyLoaded = true;
        this.conversationId = history.conversation_id;
        this.selectedConversation = history.conversation_id;
        this.rawHistory = history.messages || [];
        if (history.messages.length > 0) {
          this.messages = history.messages.map((m) => ({
            id: ++this.messageSeq,
            sender: m.sender === "user" ? "user" : "assistant",
            text: m.message,
          }));
        }
        this.scrollToBottom(true);
      },
      error: () => {
        this.historyLoaded = true;
      },
    });
  }

  reloadHistory(): void {
    this.historyLoaded = false;
    this.loadHistory();
  }

  get historyGroups(): HistoryGroup[] {
    if (!this.rawHistory || this.rawHistory.length === 0) {
      return [];
    }
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const todayItems: ChatHistoryMessage[] = [];
    const yesterdayItems: ChatHistoryMessage[] = [];
    const olderItems: ChatHistoryMessage[] = [];
    for (const item of this.rawHistory) {
      const ts = item.created_at ? Date.parse(item.created_at) : NaN;
      if (Number.isNaN(ts)) {
        todayItems.push(item);
      } else if (ts >= startOfToday) {
        todayItems.push(item);
      } else if (ts >= startOfYesterday) {
        yesterdayItems.push(item);
      } else {
        olderItems.push(item);
      }
    }
    const groups: HistoryGroup[] = [];
    if (todayItems.length > 0) {
      groups.push({ label: "Today", items: todayItems });
    }
    if (yesterdayItems.length > 0) {
      groups.push({ label: "Yesterday", items: yesterdayItems });
    }
    if (olderItems.length > 0) {
      groups.push({ label: "Earlier", items: olderItems });
    }
    return groups;
  }

  historyPreview(item: ChatHistoryMessage): string {
    const text = (item.message || "").replace(/\s+/g, " ").trim();
    return text.length > 64 ? `${text.slice(0, 64)}…` : text || "Conversation";
  }

  historyTime(item: ChatHistoryMessage): string {
    if (!item.created_at) {
      return "";
    }
    const ts = Date.parse(item.created_at);
    if (Number.isNaN(ts)) {
      return "";
    }
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  get historyCount(): number {
    return this.rawHistory.length;
  }

  // =========================================================
  // RENDERING (safe markdown-lite: escape first, then markup)
  // =========================================================

  renderMarkdown(text: string): string {
    const escaped = this.escapeHtml(text);
    const lines = escaped.split("\n");
    const html: string[] = [];
    let listOpen: string | null = null;

    const closeList = (): void => {
      if (listOpen) {
        html.push(listOpen === "ul" ? "</ul>" : "</ol>");
        listOpen = null;
      }
    };

    const isTableRow = (line: string): boolean =>
      /^\s*\|.*\|\s*$/.test(line);
    const isSeparatorRow = (line: string): boolean =>
      /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");

    const renderTable = (block: string[]): string => {
      const cells = (row: string): string[] =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const header = cells(block[0]);
      const body = block.slice(1).filter((row) => !isSeparatorRow(row));
      const head = `<thead><tr>${header
        .map((c) => `<th>${this.inline(c)}</th>`)
        .join("")}</tr></thead>`;
      const rows = body
        .map(
          (row) =>
            `<tr>${cells(row)
              .map((c) => `<td>${this.inline(c)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      return `<div class="chatbot-table-wrap"><table class="chatbot-table">${head}<tbody>${rows}</tbody></table></div>`;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (isTableRow(rawLine)) {
        const block: string[] = [];
        while (i < lines.length && isTableRow(lines[i])) {
          block.push(lines[i]);
          i++;
        }
        i--;
        closeList();
        if (block.length >= 2) {
          html.push(renderTable(block));
        } else {
          html.push(`<p>${this.inline(block[0].trim())}</p>`);
        }
        continue;
      }
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const bullet = trimmed.match(/^[-*]\s+(.*)$/);
      const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
      const heading = trimmed.match(/^#{1,3}\s+(.*)$/);
      if (bullet) {
        if (listOpen !== "ul") {
          closeList();
          html.push("<ul>");
          listOpen = "ul";
        }
        html.push(`<li>${this.inline(bullet[1])}</li>`);
      } else if (numbered) {
        if (listOpen !== "ol") {
          closeList();
          html.push("<ol>");
          listOpen = "ol";
        }
        html.push(`<li>${this.inline(numbered[1])}</li>`);
      } else {
        closeList();
        if (!trimmed) {
          continue;
        }
        if (heading) {
          html.push(`<p><strong>${this.inline(heading[1])}</strong></p>`);
        } else {
          html.push(`<p>${this.inline(trimmed)}</p>`);
        }
      }
    }
    closeList();
    return html.join("");
  }

  private inline(text: string): string {
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private pushUser(text: string): void {
    this.messages.push({ id: ++this.messageSeq, sender: "user", text });
  }

  private pushAssistant(
    text: string,
    actions: ChatAction[] = [],
    limitReached = false,
    results: ChatResultItem[] = [],
    data: ChatResponseData | null = null,
  ): void {
    this.messages.push({
      id: ++this.messageSeq,
      sender: "assistant",
      text,
      actions,
      limitReached,
      results,
      data,
    });
  }

  resultAction(item: ChatResultItem): ChatAction | null {
    if (!item.route) {
      return null;
    }
    switch ((item.type || "").toLowerCase()) {
      case "policy":
        return { label: "View Policy", type: "VIEW_POLICY", route: item.route };
      case "scheme":
        return { label: "View Scheme", type: "VIEW_SCHEME", route: item.route };
      case "statistic":
        return { label: "View All", type: "NAVIGATE", route: item.route };
      case "user":
        return { label: "Manage Users", type: "NAVIGATE", route: item.route };
      default:
        return { label: "Open", type: "NAVIGATE", route: item.route };
    }
  }

  resultMeta(item: ChatResultItem): string {
    return [item.ministry, item.category, item.state]
      .filter((v): v is string => !!v)
      .join(" · ");
  }

  statusClass(status: string | null | undefined): string {
    switch ((status || "").toUpperCase().trim()) {
      case "APPROVED":
      case "ACTIVE":
        return "chatbot-badge--approved";
      case "DRAFT":
        return "chatbot-badge--draft";
      case "PENDING_APPROVAL":
        return "chatbot-badge--pending";
      case "REJECTED":
        return "chatbot-badge--rejected";
      case "ARCHIVED":
        return "chatbot-badge--archived";
      case "INACTIVE":
        return "chatbot-badge--inactive";
      default:
        return "chatbot-badge--other";
    }
  }

  private scrollToBottom(force = false): void {
    setTimeout(() => {
      const el = this.messageList?.nativeElement;
      if (!el) {
        return;
      }
      if (!force && !this.stickToBottom) {
        return;
      }
      el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
