import { CommonModule } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { finalize } from "rxjs";

import { Auth } from "../../core/services/auth";
import { ChatbotService } from "../../core/services/chatbot.service";
import { PermissionService } from "../../core/services/permission.service";
import { ChatbotOpenService } from "../../core/services/chatbot-open.service";
import { NavigationContextService } from "../../core/services/navigation-context.service";
import { ToastService } from "../../core/services/toast.service";
import { LoadingIndicatorComponent } from "../../shared/components/loading-indicator/loading-indicator.component";
import {
  ChatAction,
  ChatConversation,
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
    {
      label: "Find schemes for me",
      message: "Find schemes for me",
      icon: "search",
    },
    {
      label: "Check my eligibility",
      message: "How do I check my eligibility?",
      icon: "fact_check",
    },
    {
      label: "Explain a policy",
      message: "Explain a policy in simple language",
      icon: "description",
    },
    {
      label: "Explain a scheme",
      message: "Explain a government scheme in simple language",
      icon: "menu_book",
    },
    {
      label: "Compare schemes",
      message: "Compare two schemes",
      icon: "compare_arrows",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
  GOVERNMENT_OFFICIAL: [
    {
      label: "Search policies",
      message: "Search government policies",
      icon: "search",
    },
    {
      label: "Search schemes",
      message: "Search government schemes",
      icon: "search",
    },
    {
      label: "Explain policy",
      message: "Explain a policy",
      icon: "description",
    },
    {
      label: "Explain a scheme",
      message: "Explain a government scheme in simple language",
      icon: "menu_book",
    },
    {
      label: "Compare schemes",
      message: "Compare two schemes",
      icon: "compare_arrows",
    },
    {
      label: "Department information",
      message: "Show department information",
      icon: "domain",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
  RESEARCHER: [
    { label: "Search policies", message: "Search policies", icon: "search" },
    { label: "Search schemes", message: "Search schemes", icon: "search" },
    {
      label: "Compare policies",
      message: "Compare two policies",
      icon: "compare_arrows",
    },
    {
      label: "Compare schemes",
      message: "Compare two schemes",
      icon: "compare_arrows",
    },
    {
      label: "Policy analysis",
      message: "Show policy trends and analysis",
      icon: "analytics",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
  ORGANIZATION: [
    {
      label: "Find relevant schemes",
      message: "Find schemes relevant for organizations",
      icon: "search",
    },
    { label: "Search policies", message: "Search policies", icon: "search" },
    {
      label: "Check eligibility",
      message: "How do I check eligibility?",
      icon: "fact_check",
    },
    {
      label: "Compare schemes",
      message: "Compare two schemes",
      icon: "compare_arrows",
    },
    {
      label: "Application guidance",
      message: "How do I apply for a scheme?",
      icon: "assignment",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
  ADMIN: [
    {
      label: "Policy information",
      message: "Show policy information",
      icon: "description",
    },
    {
      label: "Scheme information",
      message: "Show scheme information",
      icon: "account_balance",
    },
    {
      label: "Analytics information",
      message: "Show analytics information",
      icon: "analytics",
    },
    {
      label: "Reports information",
      message: "Show reports information",
      icon: "query_stats",
    },
    {
      label: "User management help",
      message: "Help with user management",
      icon: "group",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
  GUEST: [
    {
      label: "Search public policies",
      message: "Search public policies",
      icon: "search",
    },
    {
      label: "Search public schemes",
      message: "Search public schemes",
      icon: "search",
    },
    {
      label: "Explain public information",
      message: "Explain a government scheme in simple language",
      icon: "description",
    },
    {
      label: "General FAQ",
      message: "Show frequently asked questions",
      icon: "quiz",
    },
    {
      label: "Help & Support",
      message: "I need help and support",
      icon: "support_agent",
    },
  ],
};

const QUICK_ACTION_DESCRIPTIONS: Record<string, string> = {
  "Find schemes for me": "Discover eligible schemes",
  "Check my eligibility": "Check who qualifies",
  "Explain a policy": "Simple explanations",
  "Compare schemes": "Side-by-side compare",
  "Explain a scheme": "Simple scheme explanations",
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

export interface ConversationGroup {
  label: string;
  items: ChatConversation[];
}

@Component({
  selector: "app-chatbot",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingIndicatorComponent],
  templateUrl: "./chatbot.component.html",
  styleUrl: "./chatbot.component.scss",
})
export class ChatbotComponent {
  private readonly chatbot = inject(ChatbotService);
  private readonly auth = inject(Auth);
  private readonly permissions = inject(PermissionService);
  private readonly navContext = inject(NavigationContextService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  // External open requests (e.g. the public homepage assistant card).
  // App-lifetime component: no teardown needed. Additive only — the
  // messaging, history, and rendering logic below is untouched.
  private readonly openRequestSub = inject(ChatbotOpenService).open$.subscribe(
    () => this.openPanel(),
  );
  // The app runs zoneless: plain-field writes inside async subscriptions do
  // NOT schedule change detection (replies appeared only after the next
  // click). markForCheck() after each completed request renders the new
  // messages, typing state, and guest-limit card immediately.
  private readonly cdr = inject(ChangeDetectorRef);

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
  guestLimitReached = false;
  serviceOnline = true;

  // New UI state (kept separate per spec).
  isFullscreen = false;
  isHistoryOpen = false;
  showDeleteConfirm = false;
  deletingHistory = false;
  selectedConversation: number | null = null;
  guestUsage: { message_count: number; guest_remaining: number | null } | null =
    null;

  // Conversation state: the active view (`messages`) renders exactly one
  // conversation; every conversation keeps its own cached turns so
  // switching never mixes chats and stale replies land in their origin.
  conversations: ChatConversation[] = [];
  historyLoading = false;
  historyError: string | null = null;
  loadingConversation = false;
  conversationError: string | null = null;
  pendingDeleteId: number | null = null;
  deletingConversation = false;
  menuOpenId: number | null = null;

  private messageSeq = 0;
  private stickToBottom = true;
  private messagesByConversation = new Map<number, ChatUiMessage[]>();
  private loadedConversations = new Set<number>();
  private pendingNewChat = true;
  private creatingNew = false;
  private sendingFor = new Set<number>();
  // Monotonic guards against stale async work (superseded restores /
  // abandoned creations) after New Chat or conversation switches.
  private chatEpoch = 0;
  private loadToken = 0;

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

  /** Active conversation id (per-conversation state model). */
  get activeConversationId(): number | null {
    return this.conversationId;
  }

  /** True while the active view is an unsent, server-detached new chat. */
  get isNewChat(): boolean {
    return this.pendingNewChat;
  }

  /** True while the conversation list is being fetched. */
  get isLoadingHistory(): boolean {
    return this.historyLoading;
  }

  /** True while the active conversation has a message in flight. */
  get isSendingMessage(): boolean {
    return this.sending;
  }

  /** True while a selected conversation's messages are being restored. */
  get isLoadingConversation(): boolean {
    return this.loadingConversation;
  }

  // =========================================================
  // ROLE + PERSONALIZATION
  // =========================================================

  get userRole(): string {
    return (this.auth.getUserRole() || "GUEST").toUpperCase().trim();
  }

  /**
   * Public roles (Citizen, Researcher, Organization, Guest) never see
   * internal workflow statuses on result cards. Admin and Government
   * Official retain full visibility.
   */
  get isPublicRole(): boolean {
    return this.permissions.isPublicRole(this.userRole);
  }

  /** True on the public homepage (`/`), where logged-out visitors see an
   * auth gate inside the chatbot panel instead of the chat UI. */
  get isPublicHomepage(): boolean {
    const path = (this.router.url || "")
      .split("?")[0]
      .split("#")[0]
      .trim();
    return path === "" || path === "/";
  }

  /** Whether the panel must show the login/signup gate instead of chat.
   * Only applies on the public homepage for visitors without a session;
   * every dashboard (including guest mode) keeps its existing behavior. */
  get needsAuthGate(): boolean {
    return this.isPublicHomepage && !this.isAuthenticated();
  }

  /** Session check through the Auth service (token-backed). Tolerant of
   * partial doubles in tests: falls back to a stored token or user read. */
  private isAuthenticated(): boolean {
    const auth = this.auth as unknown as {
      isLoggedIn?: () => boolean;
      getToken?: () => string | null;
      getStoredUser?: () => unknown;
    };
    try {
      if (typeof auth.isLoggedIn === "function") {
        return !!auth.isLoggedIn();
      }
      if (typeof auth.getToken === "function") {
        return !!auth.getToken();
      }
      if (typeof auth.getStoredUser === "function") {
        return !!auth.getStoredUser();
      }
    } catch {
      return false;
    }
    return false;
  }

  /** Gate actions (public homepage, logged-out visitors only). */
  goToLogin(): void {
    this.close();
    void this.router.navigate(["/auth/login"]);
  }

  goToSignup(): void {
    this.close();
    void this.router.navigate(["/auth/register"]);
  }

  /** Dismiss the gate without granting chatbot access. The visitor stays
   * on the public homepage; reopening shows the gate again. */
  continueAsGuestFromGate(): void {
    this.close();
  }

  get displayName(): string {
    const stored = this.auth.getStoredUser() as unknown as Record<
      string,
      unknown
    > | null;
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
      ROLE_GREETING_BODY[this.userRole] || "How can I help you today?";
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
    // Never auto-attach to a previous conversation: a fresh view always
    // starts as an isolated pending new chat (welcome message only).
    if (this.messages.length === 0) {
      this.pendingNewChat = this.conversationId === null;
      this.pushAssistant(this.greeting);
    }
    this.stickToBottom = true;
    setTimeout(() => {
      if (this.needsAuthGate && typeof document !== "undefined") {
        // No composer in the gate view: focus its primary action instead.
        const btn = document.querySelector(
          ".chatbot-gate .chatbot-gate__btn-login",
        ) as HTMLElement | null;
        btn?.focus();
        return;
      }
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
    this.loadConversations();
  }

  closeHistory(): void {
    this.isHistoryOpen = false;
    this.showDeleteConfirm = false;
    this.menuOpenId = null;
    this.pendingDeleteId = null;
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
    // Dismiss the public-homepage auth gate like the panel close button.
    if (this.isOpen && this.needsAuthGate) {
      this.close();
      return;
    }
    if (this.menuOpenId !== null) {
      this.closeMenu();
      return;
    }
    if (this.pendingDeleteId !== null) {
      this.cancelDeleteConversation();
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
  // NEW CHAT (isolated, non-destructive) + DELETE
  // =========================================================

  /**
   * Start a completely independent conversation. Only the local view is
   * reset (welcome message); nothing is deleted server-side, and the new
   * server conversation id is minted on first send, so no message can
   * ever attach to the previously active chat.
   */
  startNewChat(): void {
    this.chatEpoch++;
    this.pendingNewChat = true;
    this.conversationId = null;
    this.selectedConversation = null;
    this.guestLimitReached = false;
    this.isHistoryOpen = false;
    this.showDeleteConfirm = false;
    this.conversationError = null;
    this.loadingConversation = false;
    this.menuOpenId = null;
    this.pendingDeleteId = null;
    this.messages = [];
    this.stickToBottom = true;
    this.pushAssistant(this.greeting);
    this.syncSendFlags();
    this.scrollToBottom(true);
    setTimeout(() => this.composer?.nativeElement.focus(), 60);
  }

  /** Legacy destructive clear — kept; delegates to confirmed delete. */
  clearConversation(): void {
    this.startNewChat();
  }

  /** Adopt a freshly minted server conversation for the pending new chat. */
  private adoptConversation(conversationId: number): void {
    this.conversationId = conversationId;
    this.selectedConversation = conversationId;
    this.pendingNewChat = false;
    // Reset the view to a clean welcome, then seed the new conversation's
    // cache with it: the welcome is already rendered, so dropping it from
    // the cache would make the next append wipe it while typing. The first
    // user message follows through the normal send path and is cached
    // with its reply.
    this.messages = [];
    this.pushAssistant(this.greeting);
    this.messagesByConversation.set(conversationId, [...this.messages]);
    this.loadedConversations.add(conversationId);
    const now = new Date().toISOString();
    this.conversations = [
      {
        conversation_id: conversationId,
        role: this.userRole,
        message_count: 0,
        title: null,
        preview: null,
        created_at: now,
        updated_at: now,
      },
      ...this.conversations.filter((c) => c.conversation_id !== conversationId),
    ];
  }

  /** Render exactly the active conversation's cached messages. */
  private renderActive(): void {
    if (this.conversationId === null) {
      return;
    }
    this.messages = [
      ...(this.messagesByConversation.get(this.conversationId) ?? []),
    ];
  }

  /** Append a turn to its originating conversation's cache (and the view
   * when that conversation is active). */
  private appendToConversation(convId: number, msg: ChatUiMessage): void {
    const list = this.messagesByConversation.get(convId) ?? [];
    list.push(msg);
    this.messagesByConversation.set(convId, list);
    if (convId === this.conversationId) {
      this.messages = [...list];
    }
  }

  /** Keep the header/typing indicators truthful per active conversation. */
  private syncSendFlags(): void {
    const active = this.conversationId;
    this.sending =
      this.creatingNew || (active !== null && this.sendingFor.has(active));
    this.loading = this.sending;
  }

  /** Refresh the history-list entry from the local cache (no refetch). */
  private touchConversationEntry(convId: number): void {
    const cached = this.messagesByConversation.get(convId) ?? [];
    const firstUser = cached.find((m) => m.sender === "user");
    const last = cached[cached.length - 1];
    const now = new Date().toISOString();
    const entry: ChatConversation = {
      conversation_id: convId,
      role: this.userRole,
      message_count: cached.length,
      title: firstUser ? firstUser.text.slice(0, 80) : null,
      preview: last ? last.text.slice(0, 160) : null,
      created_at: now,
      updated_at: now,
    };
    this.conversations = [
      entry,
      ...this.conversations.filter((c) => c.conversation_id !== convId),
    ];
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
    this.chatbot
      .clearHistory()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: () => {
          this.deletingHistory = false;
          this.showDeleteConfirm = false;
          this.isHistoryOpen = false;
          this.conversations = [];
          this.messagesByConversation.clear();
          this.loadedConversations.clear();
          this.pendingDeleteId = null;
          this.startNewChat();
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
    if (!text) {
      return;
    }
    // A pending new chat has no server conversation yet: mint one first so
    // the message can never attach to the previously active chat.
    if (this.conversationId === null) {
      if (this.creatingNew) {
        return;
      }
      this.creatingNew = true;
      // Optimistic render: show the user's message and clear the composer
      // immediately, before the create-conversation round trip, so the
      // sent message never waits on the network. adoptConversation() below
      // resets the view to a clean greeting and sendToConversation()
      // re-seeds this same text into the minted conversation, so the
      // message is rendered exactly once and never duplicated.
      this.draft = "";
      this.messages = [
        ...this.messages,
        { id: ++this.messageSeq, sender: "user" as const, text },
      ];
      this.syncSendFlags();
      this.stickToBottom = true;
      this.scrollToBottom(true);
      const epoch = this.chatEpoch;
      this.chatbot
        .createConversation()
        .pipe(finalize(() => this.cdr.markForCheck()))
        .subscribe({
          next: (created) => {
            this.creatingNew = false;
            if (epoch !== this.chatEpoch) {
              // The user moved on while creating; drop the abandoned empty
              // conversation quietly and keep the fresh view untouched.
              this.syncSendFlags();
              this.chatbot
                .deleteConversation(created.conversation_id)
                .subscribe({ error: () => undefined });
              return;
            }
            this.adoptConversation(created.conversation_id);
            this.sendToConversation(created.conversation_id, text, epoch);
          },
          error: (error) => {
            this.creatingNew = false;
            this.syncSendFlags();
            this.handleSendError(error);
            this.scrollToBottom(true);
          },
        });
      return;
    }
    // Duplicate-submission guard, scoped per conversation so other chats
    // stay usable while one reply is being generated.
    if (this.sendingFor.has(this.conversationId)) {
      return;
    }
    this.sendToConversation(this.conversationId, text, this.chatEpoch);
  }

  private sendToConversation(
    convId: number,
    text: string,
    epoch: number,
  ): void {
    this.sendingFor.add(convId);
    this.draft = "";
    this.pushUserToConversation(convId, text);
    this.syncSendFlags();
    this.stickToBottom = true;
    this.scrollToBottom(true);
    const sentAt = performance.now();

    this.chatbot
      .sendMessage({
        message: text,
        conversation_id: convId,
        context: { page: this.router.url },
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (response) => {
          console.debug(
            `[chatbot] client-observed response time: ${Math.round(performance.now() - sentAt)} ms ` +
              `(conversation ${response.conversation_id})`,
          );
          this.sendingFor.delete(convId);
          this.serviceOnline = true;
          const target = response.conversation_id;
          if (typeof response.guest_remaining === "number") {
            this.guestLimitReached = response.guest_remaining <= 0;
            this.guestUsage = {
              message_count: this.guestUsage?.message_count || 0,
              guest_remaining: response.guest_remaining,
            };
          }
          this.appendToConversation(target, {
            id: ++this.messageSeq,
            sender: "assistant",
            text: response.message,
            actions: response.actions || [],
            limitReached: false,
            results: response.results || [],
            data: response.data || null,
          });
          this.loadedConversations.add(target);
          this.touchConversationEntry(target);
          // appendToConversation renders only when the reply's own
          // conversation is still the active view; otherwise the reply
          // stays cached without overwriting the newer chat
          // (stale-response guard).
          this.syncSendFlags();
          this.scrollToBottom(true);
        },
        error: (error) => {
          this.sendingFor.delete(convId);
          this.syncSendFlags();
          // Surface the failure only in its originating conversation.
          if (convId === this.conversationId && epoch === this.chatEpoch) {
            this.handleSendError(error);
            this.scrollToBottom(true);
          }
        },
      });
  }

  private pushUserToConversation(convId: number, text: string): void {
    this.appendToConversation(convId, {
      id: ++this.messageSeq,
      sender: "user",
      text,
    });
  }

  private handleSendError(error: unknown): void {
    const status = (error as { status?: number })?.status ?? 0;
    if (status === 0 || status >= 500) {
      this.serviceOnline = false;
    }
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
      this.navContext.markActionSource();
      void this.router.navigateByUrl(action.route);
      return;
    }
    const fallback = this.fallbackRoute(action.type);
    if (fallback) {
      this.navContext.markActionSource();
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
  // HISTORY (conversation list + per-conversation restore)
  // =========================================================

  /** Fetch the caller's conversation list for the history drawer. */
  loadConversations(): void {
    if (this.historyLoading) {
      return;
    }
    this.historyLoading = true;
    this.historyError = null;
    this.chatbot
      .listConversations()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (res) => {
          this.historyLoading = false;
          this.serviceOnline = true;
          this.conversations = res.conversations || [];
        },
        error: () => {
          this.historyLoading = false;
          this.historyError =
            "Couldn't load your conversations. Please try again.";
        },
      });
  }

  /**
   * Open a conversation and make it active. Uses the reliable session
   * cache when available; otherwise restores from the backend (ownership
   * enforced server-side) including structured cards and actions.
   */
  openConversation(conversationId: number, force = false): void {
    if (
      !force &&
      conversationId === this.conversationId &&
      !this.pendingNewChat
    ) {
      this.isHistoryOpen = false;
      return;
    }
    this.chatEpoch++;
    const token = ++this.loadToken;
    this.pendingNewChat = false;
    this.conversationId = conversationId;
    this.selectedConversation = conversationId;
    this.conversationError = null;
    this.menuOpenId = null;
    this.pendingDeleteId = null;
    if (
      this.loadedConversations.has(conversationId) &&
      this.messagesByConversation.has(conversationId)
    ) {
      this.renderActive();
      this.isHistoryOpen = false;
      this.stickToBottom = true;
      this.syncSendFlags();
      this.scrollToBottom(true);
      return;
    }
    this.loadingConversation = true;
    this.messages = [];
    this.isHistoryOpen = false;
    this.stickToBottom = true;
    this.chatbot
      .getHistory(conversationId)
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (history) => {
          if (
            token !== this.loadToken ||
            this.conversationId !== conversationId
          ) {
            return;
          }
          const mapped = (history.messages || []).map((m) =>
            this.mapHistoryMessage(m),
          );
          this.messagesByConversation.set(conversationId, mapped);
          this.loadedConversations.add(conversationId);
          this.loadingConversation = false;
          this.serviceOnline = true;
          this.renderActive();
          this.touchConversationEntry(conversationId);
          this.syncSendFlags();
          this.scrollToBottom(true);
        },
        error: (error) => {
          if (
            token !== this.loadToken ||
            this.conversationId !== conversationId
          ) {
            return;
          }
          this.loadingConversation = false;
          const status = (error as { status?: number })?.status ?? 0;
          if (status === 0 || status >= 500) {
            this.serviceOnline = false;
          }
          this.conversationError =
            status === 404
              ? "This conversation is no longer available."
              : status === 401 || status === 403
                ? "Please sign in to continue using PolicyGPT Assistant."
                : "Couldn't load this conversation. Please try again.";
        },
      });
  }

  /** Retry restoring the currently selected conversation. */
  retryConversation(): void {
    if (this.conversationId !== null) {
      this.conversationError = null;
      this.openConversation(this.conversationId, true);
    }
  }

  /** Map one stored turn back to a UI message, restoring its structured
   * payload (cards, buttons, eligibility) when present. */
  private mapHistoryMessage(m: ChatHistoryMessage): ChatUiMessage {
    const payload = m.payload ?? null;
    const actions = Array.isArray(payload?.actions) ? payload.actions : [];
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const data =
      payload && typeof payload.data === "object" ? payload.data : null;
    return {
      id: ++this.messageSeq,
      sender: m.sender === "user" ? "user" : "assistant",
      text: m.message,
      actions,
      limitReached: false,
      results,
      data,
    };
  }

  get conversationGroups(): ConversationGroup[] {
    if (!this.conversations || this.conversations.length === 0) {
      return [];
    }
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const todayItems: ChatConversation[] = [];
    const yesterdayItems: ChatConversation[] = [];
    const olderItems: ChatConversation[] = [];
    for (const item of this.conversations) {
      const ts = item.updated_at ? Date.parse(item.updated_at) : NaN;
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
    const groups: ConversationGroup[] = [];
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

  conversationTitle(item: ChatConversation): string {
    const title = (item.title || "").replace(/\s+/g, " ").trim();
    return title || "New conversation";
  }

  conversationPreview(item: ChatConversation): string {
    const preview = (item.preview || "").replace(/\s+/g, " ").trim();
    if (preview) {
      return preview.length > 64 ? `${preview.slice(0, 64)}…` : preview;
    }
    return item.message_count > 0 ? "Conversation" : "No messages yet";
  }

  /** Relative timestamp ("just now", "5m ago", "Yesterday", …). */
  relativeTime(iso: string | null | undefined): string {
    if (!iso) {
      return "";
    }
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) {
      return "";
    }
    const diffMs = Date.now() - ts;
    if (diffMs < 0) {
      return "";
    }
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days === 1) {
      return "Yesterday";
    }
    if (days < 7) {
      return `${days}d ago`;
    }
    return new Date(ts).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year:
        new Date(ts).getFullYear() === new Date().getFullYear()
          ? undefined
          : "numeric",
    });
  }

  get historyCount(): number {
    return this.conversations.length;
  }

  // ---------- Per-conversation menu + delete ----------

  toggleMenu(conversationId: number, event?: Event): void {
    event?.stopPropagation();
    this.menuOpenId =
      this.menuOpenId === conversationId ? null : conversationId;
    if (this.menuOpenId !== null) {
      this.pendingDeleteId = null;
    }
  }

  closeMenu(): void {
    this.menuOpenId = null;
  }

  requestDeleteConversation(conversationId: number, event?: Event): void {
    event?.stopPropagation();
    this.menuOpenId = null;
    this.pendingDeleteId = conversationId;
  }

  cancelDeleteConversation(): void {
    this.pendingDeleteId = null;
  }

  confirmDeleteConversation(): void {
    const conversationId = this.pendingDeleteId;
    if (conversationId === null || this.deletingConversation) {
      return;
    }
    this.deletingConversation = true;
    this.chatbot
      .deleteConversation(conversationId)
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: () => {
          this.deletingConversation = false;
          this.pendingDeleteId = null;
          this.menuOpenId = null;
          this.conversations = this.conversations.filter(
            (c) => c.conversation_id !== conversationId,
          );
          this.messagesByConversation.delete(conversationId);
          this.loadedConversations.delete(conversationId);
          if (this.conversationId === conversationId) {
            // The active chat was deleted: move to a clean new chat.
            this.startNewChat();
          }
        },
        error: () => {
          this.deletingConversation = false;
          this.pendingDeleteId = null;
          this.toast.error("Error", "Could not delete the conversation.");
        },
      });
  }

  // =========================================================
  // RENDERING (safe markdown-lite: escape first, then markup)
  // =========================================================

  renderMarkdown(text: string): string {
    const escaped = this.escapeHtml(text || "");
    const lines = escaped.split("\n");
    const html: string[] = [];
    let listOpen: string | null = null;
    // Index in `html` of the last emitted <li> while a list is open. Used
    // to fold indented continuation lines (backend record metadata such as
    // "   Ministry; Category") into the current item instead of closing
    // the list — which previously restarted numbering at 1 for every item.
    let lastLi: number | null = null;

    const closeList = (): void => {
      if (listOpen) {
        html.push(listOpen === "ul" ? "</ul>" : "</ol>");
        listOpen = null;
      }
      lastLi = null;
    };

    const isTableRow = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);
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
      // Indented, non-list content directly after a list item belongs to
      // that item (backend metadata continuation lines). Fold it into the
      // open <li> so the ordered list stays continuous (1, 2, 3, …).
      const continuation =
        !bullet && !numbered && !heading && listOpen !== null && lastLi !== null
          ? rawLine.match(/^\s+\S[\s\S]*$/)
          : null;
      if (continuation) {
        html[lastLi as number] = (html[lastLi as number] as string).replace(
          /<\/li>$/,
          `<br><span class="chatbot-list-detail">${this.inline(trimmed)}</span></li>`,
        );
      } else if (bullet) {
        if (listOpen !== "ul") {
          closeList();
          html.push("<ul>");
          listOpen = "ul";
        }
        html.push(`<li>${this.inline(bullet[1])}</li>`);
        lastLi = html.length - 1;
      } else if (numbered) {
        if (listOpen !== "ol") {
          closeList();
          html.push("<ol>");
          listOpen = "ol";
        }
        html.push(`<li>${this.inline(numbered[1])}</li>`);
        lastLi = html.length - 1;
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

  // =========================================================
  // STRUCTURED DISPLAY (render structured results, not prose)
  // =========================================================

  /** True for navigable record results (policy/scheme/user), not summaries. */
  isRecordResult(item: ChatResultItem | null | undefined): boolean {
    const type = (item?.type || "").toLowerCase();
    return type === "policy" || type === "scheme" || type === "user";
  }

  /**
   * Display text for an assistant message. When structured record cards
   * are rendered from `results`, the backend's enumerated record lines
   * would duplicate them, so those lines (plus their indented metadata
   * continuations) are omitted. Prose — headings, summaries, counts,
   * footers, tables, criteria — is always preserved. Messages without
   * structured results (e.g. conversation history) render in full.
   */
  displayText(msg: ChatUiMessage): string {
    const text = msg.text || "";
    const results = msg.results || [];
    if (!results.some((item) => this.isRecordResult(item))) {
      return text;
    }
    const kept: string[] = [];
    let skipping = false;
    for (const line of text.split("\n")) {
      if (/^\s*\d+[.)]\s+\S/.test(line)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (/^\s+\S/.test(line)) {
          continue;
        }
        skipping = false;
      }
      kept.push(line);
    }
    return kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Sequential card number for a record result. Continuous within the
   * message's record cards; when the backend reports pagination
   * (data.page/page_size), numbering continues across pages instead of
   * restarting at 1.
   */
  cardNumber(msg: ChatUiMessage, index: number): number {
    const results = msg.results || [];
    let position = 0;
    for (let i = 0; i <= index && i < results.length; i++) {
      if (this.isRecordResult(results[i])) {
        position++;
      }
    }
    const data = msg.data || null;
    const page = Number(data?.page) || 0;
    const size = Number(data?.page_size) || 0;
    const base = page > 0 && size > 0 ? (page - 1) * size : 0;
    return base + position;
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
        return {
          label: "View Policy Details",
          type: "VIEW_POLICY",
          route: item.route,
        };
      case "scheme":
        return {
          label: "View Scheme Details",
          type: "VIEW_SCHEME",
          route: item.route,
        };
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

  eligibilityClass(label: unknown): string {
    const text = String(label || "").toLowerCase();
    if (text.startsWith("eligible based")) {
      return "chatbot-eligibility--eligible";
    }
    if (text.startsWith("possibly eligible")) {
      return "chatbot-eligibility--possible";
    }
    if (text.startsWith("not eligible")) {
      return "chatbot-eligibility--not-eligible";
    }
    return "chatbot-eligibility--unknown";
  }

  eligibilityIcon(label: unknown): string {
    const text = String(label || "").toLowerCase();
    if (text.startsWith("eligible based")) {
      return "check_circle";
    }
    if (text.startsWith("possibly eligible")) {
      return "help";
    }
    if (text.startsWith("not eligible")) {
      return "cancel";
    }
    return "info";
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
