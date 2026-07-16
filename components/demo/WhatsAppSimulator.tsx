"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./ChatMessage";
import { DetectedInfoPanel } from "./DetectedInfoPanel";
import { useToast } from "./useToast";
import { Toast } from "./Toast";
import { whatsappConversations } from "./demo-data";
import { Bot, CheckCheck, Mic, Paperclip, Smile, MoreVertical, Phone, Search, Send } from "lucide-react";

export function WhatsAppSimulator() {
  const [selectedId, setSelectedId] = useState(whatsappConversations[0].id);
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const { toasts, addToast, removeToast } = useToast();
  const t = useTranslations();

  const conversation = whatsappConversations.find((c) => c.id === selectedId) || whatsappConversations[0];

  const handleAction = (actionId: string, responseText: string) => {
    setResponses((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] || []), actionId],
    }));
    addToast(responseText, "success");
  };

  return (
    <div className="flex h-[calc(100vh-72px-56px)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-card md:h-[720px]">
      {/* Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-[280px] flex-col border-r border-line bg-paper-soft md:flex">
          <div className="flex h-16 items-center gap-3 border-b border-line px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nihao/10">
              <Bot className="h-5 w-5 text-nihao" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-ink">Asistente Nihao</p>
              <p className="text-[11px] text-ink-mute">{t("demo.assistant.simulator")}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {whatsappConversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-3 text-left transition-colors",
                    active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-ink">{c.titleKey ? t(c.titleKey) : c.title}</p>
                    {c.unread && !active && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-nihao" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ink-faint">{c.previewKey ? t(c.previewKey) : c.preview}</p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-1 flex-col bg-[#f6f7f9]">
          {/* Chat header */}
          <div className="flex h-16 items-center justify-between border-b border-line bg-paper px-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-nihao/10">
                <Image
                  src="/logo-nihao.png"
                  alt="Nihao"
                  fill
                  sizes="40px"
                  className="scale-[1.3] object-contain"
                />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-ink">Asistente Nihao</p>
                <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t("demo.assistant.online")}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-1 text-ink-faint sm:flex">
              <button className="rounded-full p-2 hover:bg-paper-warm" aria-label={t("demo.assistant.search")}>
                <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button className="rounded-full p-2 hover:bg-paper-warm" aria-label={t("demo.assistant.call")}>
                <Phone className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button className="rounded-full p-2 hover:bg-paper-warm" aria-label={t("demo.assistant.moreOptions")}>
                <MoreVertical className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Mobile conversation selector */}
          <div className="border-b border-line bg-paper-soft p-2 md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {whatsappConversations.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                      active ? "bg-nihao text-white" : "bg-white text-ink-mute ring-1 ring-line",
                    )}
                  >
                    {c.titleKey ? t(c.titleKey) : c.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-5">
              {conversation.messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {(responses[selectedId] || []).map((actionId, idx) => (
                <div key={`${actionId}-${idx}`} className="flex w-full justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
                      {t("demo.assistant.actionCompleted")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="border-t border-line bg-paper px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {t("demo.assistant.quickActions")}
            </p>
            <div className="flex flex-wrap gap-2">
              {conversation.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id, action.response)}
                  disabled={(responses[selectedId] || []).includes(action.id)}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-[12px] font-medium transition-all",
                    (responses[selectedId] || []).includes(action.id)
                      ? "bg-paper-warm text-ink-faint ring-1 ring-line"
                      : "bg-nihao text-white hover:bg-nihao-deep",
                  )}
                >
                  {(responses[selectedId] || []).includes(action.id) ? t("demo.assistant.done") : (action.labelKey ? t(action.labelKey) : action.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-line bg-paper p-3">
            <div className="flex items-center gap-2 rounded-full bg-paper-soft px-3 py-2 ring-1 ring-line">
              <button className="p-2 text-ink-faint hover:text-ink" aria-label={t("demo.assistant.attach")}>
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button className="p-2 text-ink-faint hover:text-ink" aria-label={t("demo.assistant.emoji")}>
                <Smile className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <input
                type="text"
                placeholder={t("demo.assistant.typeMessage")}
                readOnly
                className="flex-1 bg-transparent px-2 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button className="p-2 text-ink-faint hover:text-ink" aria-label={t("demo.assistant.audio")}>
                <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-nihao text-white"
                aria-label={t("demo.assistant.send")}
              >
                <Send className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* Detected info panel */}
        <DetectedInfoPanel conversation={conversation} className="hidden w-[280px] xl:flex" />
      </div>

      <Toast toasts={toasts} onClose={removeToast} />
    </div>
  );
}
