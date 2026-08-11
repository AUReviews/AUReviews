/**
 * Bulletin + Banner fetchers (issues #18/#23, v1-spec §9).
 *
 * The one place ingest actually touches the wire, kept out of the orchestrators
 * so they stay network-free and testable.
 *
 * Bulletin: the full COMP catalog is a single server-rendered page — one polite
 * GET covers the whole import. Banner 8 (`ssbprod.auburn.edu`, public,
 * no-login, no robots.txt — scrape politely per §9): the term dropdown is one
 * GET, and each term's full COMP section listing is one POST to the schedule
 * search, so a complete Fall-2007-to-present import is ~60 requests, spaced by
 * a courtesy delay.
 */
import { COMP_CATALOG_URL } from "./import";

const BANNER_BASE_URL = "https://ssbprod.auburn.edu/pls/PROD";
/** The term dropdown — source of the validated `YYYYT0` codes. */
export const BANNER_TERM_LIST_URL = `${BANNER_BASE_URL}/bwckschd.p_disp_dyn_sched`;
/** The class-schedule search one term's listing is POSTed to. */
export const BANNER_SCHEDULE_URL = `${BANNER_BASE_URL}/bwckschd.p_get_crse_unsec`;

/** Pause between Banner requests — unhurried by design (§9). */
const BANNER_REQUEST_DELAY_MS = 500;

/** Transient-failure retries for Banner. A full-history run is ~60 sequential
 * requests; one flaky connect must not abort it. Backoff, then give up. */
const BANNER_RETRY_DELAYS_MS = [2_000, 10_000];

/** Fetch with bounded retries on network errors and 5xx responses; a 4xx is
 * a real answer (bad request/term) and fails immediately. */
async function fetchBannerWithRetry(
  label: string,
  request: () => Promise<Response>,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < BANNER_RETRY_DELAYS_MS.length;

    let response: Response;
    try {
      response = await request();
    } catch (error) {
      if (!canRetry) throw error;
      await sleep(BANNER_RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (response.ok) return response.text();
    if (response.status >= 500 && canRetry) {
      await sleep(BANNER_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText}`,
    );
  }
}

const USER_AGENT =
  "AUReviews-ingest/1.0 (+https://aureviews.com; course-catalog import)";

/** GET the COMP catalog HTML, throwing on any non-2xx response. */
export async function fetchBulletinHtml(
  url: string = COMP_CATALOG_URL,
): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(
      `Bulletin fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }

  return response.text();
}

/** GET the Banner term-dropdown page HTML. */
export async function fetchBannerTermListHtml(): Promise<string> {
  return fetchBannerWithRetry("Banner term-list fetch", () =>
    fetch(BANNER_TERM_LIST_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    }),
  );
}

/**
 * POST the class-schedule search for one term's full COMP listing. The body is
 * Banner's required boilerplate: every `sel_*` filter must appear once with the
 * literal value `dummy` plus its wildcard/blank real value, or the procedure
 * rejects the request. Waits a courtesy delay first so a full-history run
 * doesn't hammer the host.
 */
export async function fetchBannerTermScheduleHtml(
  termCode: string,
): Promise<string> {
  await sleep(BANNER_REQUEST_DELAY_MS);

  const body = new URLSearchParams([
    ["term_in", termCode],
    ["sel_subj", "dummy"],
    ["sel_day", "dummy"],
    ["sel_schd", "dummy"],
    ["sel_insm", "dummy"],
    ["sel_camp", "dummy"],
    ["sel_levl", "dummy"],
    ["sel_sess", "dummy"],
    ["sel_instr", "dummy"],
    ["sel_ptrm", "dummy"],
    ["sel_attr", "dummy"],
    ["sel_subj", "COMP"],
    ["sel_crse", ""],
    ["sel_title", ""],
    ["sel_schd", "%"],
    ["sel_from_cred", ""],
    ["sel_to_cred", ""],
    ["sel_camp", "%"],
    ["sel_levl", "%"],
    ["sel_ptrm", "%"],
    ["sel_instr", "%"],
    ["sel_attr", "%"],
    ["sel_zip_code", ""],
    ["begin_hh", "0"],
    ["begin_mi", "0"],
    ["begin_ap", "a"],
    ["end_hh", "0"],
    ["end_mi", "0"],
    ["end_ap", "a"],
  ]);

  return fetchBannerWithRetry(`Banner schedule fetch for term ${termCode}`, () =>
    fetch(BANNER_SCHEDULE_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
