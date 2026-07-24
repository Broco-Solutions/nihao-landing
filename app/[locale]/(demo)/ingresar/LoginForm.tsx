"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Lock, ArrowRight } from "lucide-react";
import { loginAction } from "./actions";

const initialState: { error?: string } = {};

export function LoginForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="relative flex min-h-[calc(100vh-72px-56px)] flex-col items-center justify-center bg-paper-soft px-4 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-glow" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo Nihao */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-card">
            <Image
              src="/logo-nihao.png"
              alt="Nihao Negocios"
              fill
              sizes="80px"
              className="scale-[1.25] object-contain p-2"
            />
          </div>
          <div className="text-center">
            <p className="font-display text-[14px] font-semibold uppercase tracking-[0.15em] text-ink">
              NIHΛO
            </p>
            <p className="-mt-0.5 font-display text-[10px] font-medium uppercase tracking-[0.25em] text-ink-mute">
              Negocios
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-line bg-paper p-8 shadow-soft">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nihao/10 text-nihao">
              <Lock className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-[16px] font-medium tracking-tight text-ink">
                {t("demo.login.title")}
              </h1>
              <span className="text-[11px] font-medium uppercase tracking-wider text-nihao">
                {t("demo.login.eyebrow")}
              </span>
            </div>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-ink-mute">
                {t("demo.login.username")}
              </label>
              <input
                type="text"
                name="user"
                required
                autoComplete="username"
                className="w-full rounded-xl border border-line bg-paper-soft px-4 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-nihao/40 focus:outline-none focus:ring-2 focus:ring-nihao/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-ink-mute">
                {t("demo.login.password")}
              </label>
              <input
                type="password"
                name="pass"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-line bg-paper-soft px-4 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-nihao/40 focus:outline-none focus:ring-2 focus:ring-nihao/10"
              />
            </div>

            {state?.error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
                {t("demo.login.error")}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nihao px-6 text-[14px] font-medium text-white shadow-[0_14px_34px_-10px_#730D0D/0.55] transition-all hover:bg-nihao-deep disabled:opacity-60"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  {t("demo.login.submit")}
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}