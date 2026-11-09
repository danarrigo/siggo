"use client";

import "./ask-siggo.css";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, MessageCircle, Send, Square, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  assistantQuestionLimit,
  assistantDailyLimit,
  assistantCooldownSeconds,
  assistantReplySchema,
  type AssistantMessage,
  type AssistantReply,
} from "@/lib/assistant";
import { formatDate } from "@/lib/ranking";

class ChatError extends Error {}
type Turn = { question: string; reply: AssistantReply };
const prompts = [
  "Find finance competitions I can explore.",
  "Which game or simulation challenges are listed?",
  "Explain provider-listed cutoffs.",
];

export function AskSiggo({
  open,
  onOpenChange,
  enabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, pending, error, open]);
  useEffect(() => {
    if (open && !pending && (turns.length || error)) input.current?.focus();
  }, [open, pending, turns, error]);

  function clear() {
    const active = controller.current;
    controller.current = null;
    active?.abort();
    setTurns([]);
    setPending("");
    setDraft("");
    setError("");
    input.current?.focus();
  }
  async function send() {
    const question = draft.trim();
    if (!enabled || !question || controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setPending(question);
    setDraft("");
    setError("");
    const messages: AssistantMessage[] = turns.slice(-2).flatMap((turn) => [
      { role: "user", content: turn.question },
      { role: "assistant", content: turn.reply.answer },
    ]);
    messages.push({ role: "user", content: question });
    const timeout = window.setTimeout(() => active.abort(), 40_000);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: active.signal,
        body: JSON.stringify({ messages }),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const message =
          json && typeof json === "object" && "error" in json && typeof json.error === "string"
            ? json.error.slice(0, 250)
            : "Ask Siggo is unavailable. Try again later.";
        throw new ChatError(message);
      }
      const reply = assistantReplySchema.parse(json);
      if (controller.current !== active) return;
      // Only this tab's last six turns are retained, never browser storage or the workspace.
      setTurns((previous) => [...previous, { question, reply }].slice(-6));
    } catch (failure) {
      if (controller.current !== active) return;
      setDraft(question);
      setError(
        active.signal.aborted
          ? "The response stopped. Your question is kept below; you can send it again."
          : failure instanceof ChatError
            ? failure.message
            : "Could not get a valid reply. Check your connection and try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === active) {
        controller.current = null;
        setPending("");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) controller.current?.abort();
        onOpenChange(next);
      }}
    >
      <DialogContent className="assistant-dialog">
        <DialogHeader className="assistant-heading">
          <div className="assistant-eyebrow">
            <MessageCircle size={14} /> Catalog assistant <span>Read only</span>
          </div>
          <DialogTitle>
            Ask <span className="text-highlight">Siggo</span>
          </DialogTitle>
          <DialogDescription>
            Find a starting point. Compare the details. Know what to check.
          </DialogDescription>
        </DialogHeader>
        <p className="assistant-privacy">
          Your question, recent chat, and selected catalog facts go to Groq. Notes, saved lists,
          personal listings, and preferences are not included. Chat stays in this tab until you
          clear it or reload. Avoid sensitive information.{" "}
          <a
            href="https://console.groq.com/docs/your-data"
            target="_blank"
            rel="noopener noreferrer"
          >
            Groq privacy <ArrowUpRight size={11} />
          </a>
        </p>
        {!enabled && (
          <p className="assistant-setup" role="status">
            Ask Siggo is not configured. Add the server-only GROQ_API_KEY and sign in to use it. The
            directory works without AI.
          </p>
        )}
        <div
          ref={log}
          className="assistant-conversation"
          role="log"
          aria-label="Ask Siggo conversation"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
        >
          {!turns.length && !pending && (
            <div className="assistant-empty">
              <h3>A little less searching.</h3>
              <p>Start with a topic, an event title, or a date you want to understand.</p>
              <div className="assistant-prompts">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    disabled={!enabled}
                    onClick={() => {
                      setDraft(prompt);
                      input.current?.focus();
                    }}
                  >
                    {prompt}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn, index) => (
            <div className="assistant-turn" key={index}>
              <div className="assistant-question">
                <span>You</span>
                <p>{turn.question}</p>
              </div>
              <div className="assistant-answer">
                <span>Siggo</span>
                <p>{turn.reply.answer}</p>
                {turn.reply.sources.length > 0 && (
                  <ol className="assistant-sources" aria-label="Catalog sources">
                    {turn.reply.sources.map((source) => (
                      <li key={source.number}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          <span>[{source.number}]</span>
                          {source.title}
                          <ArrowUpRight size={12} />
                        </a>
                        {source.metadataSource && (
                          <span className="assistant-provenance">
                            Metadata via{" "}
                            <a
                              href={source.metadataSource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {source.metadataSource.name}
                            </a>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <p className="assistant-snapshot">
                  {turn.reply.selectedCount} of {turn.reply.catalogCount} catalog listings selected
                  · Snapshot {formatDate(turn.reply.catalogUpdatedAt, true)}. Not exhaustive.
                </p>
              </div>
            </div>
          ))}
          {pending && (
            <div className="assistant-turn">
              <div className="assistant-question">
                <span>You</span>
                <p>{pending}</p>
              </div>
              <p className="assistant-pending" role="status">
                <Loader2 size={14} className="spin" /> Looking through the catalog selection…
              </p>
            </div>
          )}
        </div>
        {error && (
          <p className="assistant-error" role="alert">
            {error}
          </p>
        )}
        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor="assistant-question">Your question</label>
          <textarea
            id="assistant-question"
            ref={input}
            rows={2}
            value={draft}
            maxLength={assistantQuestionLimit}
            disabled={!enabled}
            readOnly={Boolean(pending)}
            placeholder="What would you like to explore?"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="assistant-composer-actions">
            <span>
              {draft.length}/{assistantQuestionLimit}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={!turns.length && !pending && !draft && !error}
            >
              <Trash2 size={13} /> Clear chat
            </Button>
            {pending ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => controller.current?.abort()}
              >
                <Square size={12} /> Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!enabled || !draft.trim()}>
                <Send size={13} /> Ask
              </Button>
            )}
          </div>
        </form>
        <p className="assistant-disclaimer">
          AI can be wrong. Verify linked listings and organizer rules. {assistantDailyLimit}{" "}
          requests per UTC day, {assistantCooldownSeconds}s apart; Groq quotas also apply. No paid
          fallback.
        </p>
      </DialogContent>
    </Dialog>
  );
}
