import { ProductLayoutClient } from "@/components/app/ProductLayoutClient";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductLayoutClient>{children}</ProductLayoutClient>;
}
