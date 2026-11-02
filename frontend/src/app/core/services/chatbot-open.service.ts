import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

/* =========================================================
   CHATBOT OPEN SERVICE
   Lets any surface (e.g. the public homepage assistant card)
   open the shared floating chatbot without touching its
   messaging logic, history, or rendering.
   ========================================================= */

@Injectable({ providedIn: "root" })
export class ChatbotOpenService {
  private readonly openSubject = new Subject<void>();

  /** Emits every time some UI asks for the chatbot panel. */
  readonly open$ = this.openSubject.asObservable();

  /** Open the floating chatbot panel. */
  requestOpen(): void {
    this.openSubject.next();
  }
}
