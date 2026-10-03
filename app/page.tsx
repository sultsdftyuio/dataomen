import { redirect } from "next/navigation";

// The root rewrite serves the supplied landing export. Keep a route fallback.
export default function Page() {
  redirect("/landing/index.html");
}
