import { describe, expect, it } from "vitest";
import { parseBannerSchedule, parseTermOptions } from "./banner";

/**
 * Verbatim excerpt of the live `bwckschd.p_disp_dyn_sched` term dropdown
 * (fetched 2026-08-11) — the source the `YYYYT0` scheme was validated against.
 */
const TERM_DROPDOWN_FIXTURE = `
<select name="p_term" size="1"  BYPASS_ESC="Y" ID="term_input_id">
<OPTION VALUE="">None</OPTION>
<OPTION VALUE="202710">Fall 2026</OPTION>
<OPTION VALUE="202630">Summer 2026 (View only)</OPTION>
<OPTION VALUE="202620">Spring 2026 (View only)</OPTION>
<OPTION VALUE="200810">Fall 2007 (View only)</OPTION>
</select>`;

/**
 * Verbatim excerpts of the live `bwckschd.p_get_crse_unsec` COMP listing for
 * Spring 2025 (fetched 2026-08-11): a two-instructor online section, a
 * single-instructor section whose title contains hyphens/colons, and a
 * combined lecture+lab section whose two meeting rows repeat the same
 * instructor (must not double-count).
 */
const SCHEDULE_FIXTURE = `
<table  CLASS="datadisplaytable" SUMMARY="This layout table is used to present the sections found" width="100%"><caption class="captiontext">Sections Found</caption>
<tr>
<th CLASS="ddtitle" scope="colgroup" ><a href="/pls/PROD/bwckschd.p_disp_detail_sched?term_in=202520&amp;crn_in=26703">Personal Computer Applications - 26703 - COMP 1000 - D01</a></th>
</tr>
<tr>
<TD CLASS="dddefault">
<SPAN class="fieldlabeltext">Associated Term: </SPAN>Spring 2025
<br />
<table  CLASS="datadisplaytable" SUMMARY="This table lists the scheduled meeting times and assigned instructors for this class.."><caption class="captiontext">Scheduled Meeting Times</caption>
<tr>
<th CLASS="ddheader" scope="col" >Type</th>
<th CLASS="ddheader" scope="col" >Time</th>
<th CLASS="ddheader" scope="col" >Days</th>
<th CLASS="ddheader" scope="col" >Where</th>
<th CLASS="ddheader" scope="col" >Date Range</th>
<th CLASS="ddheader" scope="col" >Schedule Type</th>
<th CLASS="ddheader" scope="col" >Instructors</th>
</tr>
<tr>
<td CLASS="dddefault">Class</td>
<td CLASS="dddefault"><ABBR title = "To Be Announced">TBA</ABBR></td>
<td CLASS="dddefault">&nbsp;</td>
<td CLASS="dddefault"><ABBR title = "To Be Announced">TBA</ABBR></td>
<td CLASS="dddefault">Jan 13, 2025 - May 09, 2025</td>
<td CLASS="dddefault">Lecture</td>
<td CLASS="dddefault">Daniela   Marghitu (<ABBR title= "Primary">P</ABBR>)<a href="mailto:marghda@auburn.edu"    target="Daniela Marghitu" ><img src="/wtlgifs/web_email.gif" align="middle" alt="E-mail" CLASS="headerImg" TITLE="E-mail"  NAME="web_email" HSPACE=0 VSPACE=0 BORDER=0 HEIGHT=28 WIDTH=28 /></a>, Aparana   Pant <a href="mailto:azp0200@auburn.edu"    target="Aparana Pant" ><img src="/wtlgifs/web_email.gif" align="middle" alt="E-mail" CLASS="headerImg" TITLE="E-mail"  NAME="web_email" HSPACE=0 VSPACE=0 BORDER=0 HEIGHT=28 WIDTH=28 /></a></td>
</tr>
</table>
<br />
<br />
</TD>
</tr>
<tr>
<th CLASS="ddtitle" scope="colgroup" ><a href="/pls/PROD/bwckschd.p_disp_detail_sched?term_in=202520&amp;crn_in=29110">The Power of AI: Fundamentals to Applications - 29110 - COMP 1100 - 001</a></th>
</tr>
<tr>
<TD CLASS="dddefault">
<SPAN class="fieldlabeltext">Associated Term: </SPAN>Spring 2025
<table  CLASS="datadisplaytable" SUMMARY="This table lists the scheduled meeting times and assigned instructors for this class.."><caption class="captiontext">Scheduled Meeting Times</caption>
<tr>
<th CLASS="ddheader" scope="col" >Type</th>
<th CLASS="ddheader" scope="col" >Time</th>
<th CLASS="ddheader" scope="col" >Days</th>
<th CLASS="ddheader" scope="col" >Where</th>
<th CLASS="ddheader" scope="col" >Date Range</th>
<th CLASS="ddheader" scope="col" >Schedule Type</th>
<th CLASS="ddheader" scope="col" >Instructors</th>
</tr>
<tr>
<td CLASS="dddefault">Class</td>
<td CLASS="dddefault">10:00 am - 10:50 am</td>
<td CLASS="dddefault">MWF</td>
<td CLASS="dddefault">Shelby Center 3129</td>
<td CLASS="dddefault">Jan 13, 2025 - May 09, 2025</td>
<td CLASS="dddefault">Lecture</td>
<td CLASS="dddefault">Sathyanarayanan Narasimhan  Aakur (<ABBR title= "Primary">P</ABBR>)<a href="mailto:san0028@auburn.edu"    target="Sathyanarayanan N. Aakur" ><img src="/wtlgifs/web_email.gif" align="middle" alt="E-mail" CLASS="headerImg" TITLE="E-mail"  NAME="web_email" HSPACE=0 VSPACE=0 BORDER=0 HEIGHT=28 WIDTH=28 /></a></td>
</tr>
</table>
</TD>
</tr>
<tr>
<th CLASS="ddtitle" scope="colgroup" ><a href="/pls/PROD/bwckschd.p_disp_detail_sched?term_in=202520&amp;crn_in=26704">Fundamentals of Computing I - 26704 - COMP 1210 - 001</a></th>
</tr>
<tr>
<TD CLASS="dddefault">
<table  CLASS="datadisplaytable" SUMMARY="This table lists the scheduled meeting times and assigned instructors for this class.."><caption class="captiontext">Scheduled Meeting Times</caption>
<tr>
<th CLASS="ddheader" scope="col" >Type</th>
<th CLASS="ddheader" scope="col" >Time</th>
<th CLASS="ddheader" scope="col" >Days</th>
<th CLASS="ddheader" scope="col" >Where</th>
<th CLASS="ddheader" scope="col" >Date Range</th>
<th CLASS="ddheader" scope="col" >Schedule Type</th>
<th CLASS="ddheader" scope="col" >Instructors</th>
</tr>
<tr>
<td CLASS="dddefault">Lab</td>
<td CLASS="dddefault">9:30 am - 10:45 am</td>
<td CLASS="dddefault">TR</td>
<td CLASS="dddefault">Shelby Center 2205</td>
<td CLASS="dddefault">Jan 13, 2025 - May 09, 2025</td>
<td CLASS="dddefault">Combined Lecture and Lab</td>
<td CLASS="dddefault">Vishalini Laguduva  Ramnath (<ABBR title= "Primary">P</ABBR>)<a href="mailto:vlr0013@auburn.edu"    target="Vishalini L. Ramnath" ><img src="/wtlgifs/web_email.gif" align="middle" alt="E-mail" CLASS="headerImg" TITLE="E-mail"  NAME="web_email" HSPACE=0 VSPACE=0 BORDER=0 HEIGHT=28 WIDTH=28 /></a></td>
</tr>
<tr>
<td CLASS="dddefault">Lecture</td>
<td CLASS="dddefault">2:00 pm - 3:15 pm</td>
<td CLASS="dddefault">TR</td>
<td CLASS="dddefault">Foy Hall 258</td>
<td CLASS="dddefault">Jan 13, 2025 - May 09, 2025</td>
<td CLASS="dddefault">Combined Lecture and Lab</td>
<td CLASS="dddefault">Vishalini Laguduva  Ramnath (<ABBR title= "Primary">P</ABBR>)<a href="mailto:vlr0013@auburn.edu"    target="Vishalini L. Ramnath" ><img src="/wtlgifs/web_email.gif" align="middle" alt="E-mail" CLASS="headerImg" TITLE="E-mail"  NAME="web_email" HSPACE=0 VSPACE=0 BORDER=0 HEIGHT=28 WIDTH=28 /></a></td>
</tr>
</table>
</TD>
</tr>
</table>`;

describe("parseTermOptions", () => {
  it("parses term codes and labels, skipping the empty None option", () => {
    expect(parseTermOptions(TERM_DROPDOWN_FIXTURE)).toEqual([
      { code: "202710", label: "Fall 2026" },
      { code: "202630", label: "Summer 2026" },
      { code: "202620", label: "Spring 2026" },
      { code: "200810", label: "Fall 2007" },
    ]);
  });

  it("returns [] for a page with no dropdown", () => {
    expect(parseTermOptions("<html><body>nope</body></html>")).toEqual([]);
  });
});

describe("parseBannerSchedule", () => {
  const sections = parseBannerSchedule(SCHEDULE_FIXTURE);

  it("finds every section with its course code", () => {
    expect(sections.map((s) => `${s.subject} ${s.number}`)).toEqual([
      "COMP 1000",
      "COMP 1100",
      "COMP 1210",
    ]);
  });

  it("reads multiple instructors from one cell, lifting the NetID from mailto", () => {
    expect(sections[0].instructors).toEqual([
      { displayName: "Daniela Marghitu", bannerKey: "marghda" },
      { displayName: "Aparana Pant", bannerKey: "azp0200" },
    ]);
  });

  it("collapses irregular whitespace in names and parses hyphenated titles", () => {
    // "The Power of AI: Fundamentals to Applications" — the title's own
    // punctuation must not confuse the ` - CRN - CODE - SEQ` suffix parse.
    expect(sections[1].instructors).toEqual([
      { displayName: "Sathyanarayanan Narasimhan Aakur", bannerKey: "san0028" },
    ]);
  });

  it("dedupes the same instructor across a section's meeting rows", () => {
    expect(sections[2].instructors).toEqual([
      { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
    ]);
  });

  it("treats a TBA instructor cell as no instructors", () => {
    const tba = SCHEDULE_FIXTURE.replace(
      /<td CLASS="dddefault">Daniela[\s\S]*?<\/td>/,
      '<td CLASS="dddefault">TBA</td>',
    );
    expect(parseBannerSchedule(tba)[0].instructors).toEqual([]);
  });

  it("keeps an instructor Banner lists without a mailto link, keyed by nothing", () => {
    const keyless = SCHEDULE_FIXTURE.replace(
      /<td CLASS="dddefault">Daniela[\s\S]*?<\/td>/,
      '<td CLASS="dddefault">Daniela   Marghitu (<ABBR title= "Primary">P</ABBR>)</td>',
    );
    expect(parseBannerSchedule(keyless)[0].instructors).toEqual([
      { displayName: "Daniela Marghitu", bannerKey: null },
    ]);
  });

  it("parses Banner numbers with interior letters (live Fall 2007 shape)", () => {
    const oddNumber = SCHEDULE_FIXTURE.replace(
      "Personal Computer Applications - 26703 - COMP 1000 - D01",
      "Computer Competency Test - 10339 - COMP 1AA0 - 001",
    );
    const sections = parseBannerSchedule(oddNumber);
    expect(sections[0].subject).toBe("COMP");
    expect(sections[0].number).toBe("1AA0");
  });

  it("returns [] for a page with no sections", () => {
    expect(parseBannerSchedule("<html><body>No classes</body></html>")).toEqual(
      [],
    );
  });
});
