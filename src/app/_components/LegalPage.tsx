import type { ReactNode } from "react";

// Prose shell for the legal pages (issue #29). Static, no data, no session.
export default function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <article className="legal">
      <h1>{title}</h1>
      <p className="legal-meta">Last updated {effective}</p>
      {children}
    </article>
  );
}
