"use client";

import { motion, useReducedMotion } from "motion/react";

export function WhatsAppFloatingButton() {
  const reduced = useReducedMotion();
  return (
    <motion.a
      href="https://wa.me/5493412426309?text=Hola%20Nihao%2C%20quiero%20recibir%20informaci%C3%B3n%20sobre%20sus%20servicios."
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Hablar con Nihao por WhatsApp"
      initial={reduced ? false : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.2, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={reduced ? undefined : { y: -2 }}
      className="group fixed bottom-5 right-5 z-30 inline-flex h-14 items-center gap-2.5 rounded-full bg-nihao pl-5 pr-6 text-[13.5px] font-medium text-white shadow-[0_18px_40px_-12px_#730D0D/0.55] ring-1 ring-inset ring-white/10 sm:bottom-7 sm:right-7"
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-6 w-6"
          aria-hidden
        >
          <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.2-.3-.2-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.4 1.3 4.8L2 22l5.4-1.4c1.4.8 3 1.2 4.6 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
        </svg>
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-nihao opacity-30" />
      </span>
      <span className="hidden sm:inline">WhatsApp</span>
    </motion.a>
  );
}
