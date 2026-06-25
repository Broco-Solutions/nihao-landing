"use client";

import { cn } from "@/lib/utils";
import { Mic, ImageIcon, CreditCard } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "./demo-data";

type ChatMessageProps = {
  message: ChatMessageType;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.sender === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]",
          isUser
            ? "rounded-br-md bg-nihao text-white"
            : "rounded-bl-md bg-white text-ink shadow-sm ring-1 ring-line",
        )}
      >
        {message.type === "audio" ? (
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", isUser ? "bg-white/20" : "bg-nihao/10")}>
              <Mic className={cn("h-4 w-4", isUser ? "text-white" : "text-nihao")} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <div className={cn("h-1.5 rounded-full", isUser ? "bg-white/30" : "bg-line-strong")}>
                <div className={cn("h-1.5 w-2/3 rounded-full", isUser ? "bg-white" : "bg-nihao")} />
              </div>
              <p className={cn("mt-1.5 text-[12px]", isUser ? "text-white/80" : "text-ink-mute")}>
                {message.content}
              </p>
            </div>
          </div>
        ) : message.type === "image" || message.type === "card" ? (
          <div>
            <div
              className={cn(
                "mb-2 flex aspect-[4/3] w-full items-center justify-center rounded-xl",
                isUser ? "bg-white/10" : "bg-paper-warm",
              )}
            >
              {message.type === "card" ? (
                <CreditCard className={cn("h-10 w-10", isUser ? "text-white/60" : "text-ink-faint")} strokeWidth={1.5} />
              ) : (
                <ImageIcon className={cn("h-10 w-10", isUser ? "text-white/60" : "text-ink-faint")} strokeWidth={1.5} />
              )}
            </div>
            <p className="text-[13px]">{message.imageLabel || message.content}</p>
          </div>
        ) : (
          <p className="whitespace-pre-line text-[14px] leading-relaxed">{message.content}</p>
        )}
        <span
          className={cn(
            "mt-2 block text-right text-[10.5px] font-medium",
            isUser ? "text-white/70" : "text-ink-faint",
          )}
        >
          {message.time}
        </span>
      </div>
    </div>
  );
}
