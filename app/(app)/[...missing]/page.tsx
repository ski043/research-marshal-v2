import { notFound } from "next/navigation";

// An address that no route has. Without this page it would get the root not-found,
// which stands outside the app shell and so has no sidebar.
export default function Missing() {
  notFound();
}
