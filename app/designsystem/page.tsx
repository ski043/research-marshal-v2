import type { Metadata } from "next";
import { DesignSystemPage } from "@/components/design-system/design-system-page";

export const metadata: Metadata = {
  title: "Design system",
  description:
    "The colours, the type, the shapes, the brand, the ASCII art and the components of Research Marshal, with the rule behind each.",
};

export default function Page() {
  return <DesignSystemPage cut />;
}
