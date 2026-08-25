"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession, signOut, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

// Per-user sign-in entry point, resolved on the CLIENT (v1-spec §8): keeping the
// session read out of the server render means the shared layout never calls
// cookies(), so the catalog/browse/course pages stay CDN-static. The session
// carries nothing identifying (v1-spec §7); we branch only on signed-in state.
export default function AuthNav() {
  const { status } = useSession();

  // A sign-in now completes inside a server action and lands on the next page
  // by SOFT navigation (issue #47: the review form's Post, /signin's Sign in),
  // so this layout-persistent provider never remounts and would keep showing
  // "Sign in" until a reload or focus change. Re-read the session on each
  // route change instead; `getSession()` broadcasts the result to the same-tab
  // provider. Only an actual CHANGE of path triggers it; the initial mount
  // (and dev StrictMode's effect replay) is skipped, since the provider
  // fetches on mount anyway.
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    void getSession();
  }, [pathname]);

  if (status === "authenticated") {
    return (
      <>
        {/* The author's pull-only page (issue #26, §11/§13), the one place a
            takedown is surfaced, so it must be reachable from every page. */}
        <Link href="/my" className="nav-link">
          My activity
        </Link>
        <button
          type="button"
          className="hdr-signin"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      </>
    );
  }

  return (
    <Link href="/signin" className="hdr-signin">
      Sign in
    </Link>
  );
}
