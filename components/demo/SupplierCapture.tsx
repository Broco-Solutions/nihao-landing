import Link from "next/link";
import { suppliers } from "./demo-data";

/** Public demo is a fixed sample catalogue. Real capture requires a user account. */
export function SupplierCapture() {
  return <section className="mx-auto max-w-3xl"><p className="text-eyebrow-mark">Demostración · datos de ejemplo</p><h1 className="mt-3 text-3xl text-ink">Capturá, revisá y organizá proveedores</h1><p className="mt-3 text-sm leading-6 text-ink-mute">Estos ejemplos muestran cómo quedan tus notas, contactos y productos. Para cargar información real, ingresá con tu cuenta; esta demostración no guarda notas ni archivos.</p><Link href="/cuenta/ingresar" className="app-primary-button mt-5 inline-flex">Ingresar para capturar</Link><div className="mt-6 grid gap-4 sm:grid-cols-2">{suppliers.slice(0, 4).map((supplier) => <article key={supplier.id} className="rounded-2xl border border-line bg-white p-5"><p className="text-xs text-ink-mute">Ejemplo · {supplier.city}</p><h2 className="mt-2 text-xl">{supplier.name}</h2><p className="mt-2 text-sm">{supplier.category}</p><p className="mt-2 text-sm text-ink-mute">{supplier.notes}</p><p className="mt-3 text-sm">{supplier.productCount} productos · interés {supplier.interest}</p></article>)}</div></section>;
}
