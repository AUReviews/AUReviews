"use client";

import { type ReactNode, useState } from "react";

// Overview/Reviews tab switcher for the course page (issue #21, §13). A tiny
// client island: both panels are rendered server-side and passed in as props, so
// the full catalog record (Overview) is in the static/ISR HTML and readable with
// JS off — this island only toggles which panel is visible. The prototype's
// course view drove the same two tabs from vanilla JS; this is its RSC-friendly
// translation.

type Tab = "overview" | "reviews";

export default function CourseTabs({
  reviewCount,
  overview,
  reviews,
}: {
  reviewCount: number;
  overview: ReactNode;
  reviews: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-overview"
          aria-selected={tab === "overview"}
          aria-controls="panel-overview"
          className={`tab${tab === "overview" ? " active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          id="tab-reviews"
          aria-selected={tab === "reviews"}
          aria-controls="panel-reviews"
          className={`tab${tab === "reviews" ? " active" : ""}`}
          onClick={() => setTab("reviews")}
        >
          Reviews ({reviewCount})
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-overview"
        aria-labelledby="tab-overview"
        className="panel panel-overview"
        hidden={tab !== "overview"}
      >
        {overview}
      </div>
      <div
        role="tabpanel"
        id="panel-reviews"
        aria-labelledby="tab-reviews"
        className="panel"
        hidden={tab !== "reviews"}
      >
        {reviews}
      </div>
    </>
  );
}
