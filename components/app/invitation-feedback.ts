import type { InvitationEmailDelivery } from "@/lib/bot/invitation-email";

export function invitationDeliveryMessage(delivery: InvitationEmailDelivery | null, reused: boolean) {
  if (reused) return "Ya había una invitación pendiente. Regenerá el enlace para obtener uno nuevo.";
  return delivery === "SENT" ? "Invitación enviada por email." : "Invitación creada, pero no pudimos enviar el email.";
}

export function invitationResendMessage(delivery: InvitationEmailDelivery) {
  return delivery === "SENT" ? "Invitación enviada por email. El enlace anterior dejó de funcionar." : "Enlace regenerado, pero no pudimos enviar el email. Copialo para compartirlo.";
}
