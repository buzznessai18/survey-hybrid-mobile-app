import { ArrowRight, Printer, Search, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Wordmark } from "@/components/Brand";
import { env } from "@/config/env";
import { useAuth } from "@/store/auth";
import "./landing.css";

/** The receipt in the hero is the real receipt layout, filled with a sample record. */
const SAMPLE = {
  record_no: "RC-000124",
  when: "23 Oct 2026, 10:20 AM",
  rows: [
    ["Farmer name", "Ramesh Gaonkar"],
    ["Gender", "Male"],
    ["Address", "Aldona, Bardez"],
    ["Survey no.", "312"],
    ["Sub-division", "4B"],
    ["Land size", "2.5 Acres"],
  ],
  service: "Tractor provided. Land ploughing completed.",
};

const STEPS = [
  { title: "Fill in the record", body: "Farmer name, survey and sub-division number, land size in acres or square metres, and what was provided or done." },
  { title: "Save it", body: "The server gives it the next receipt number and stamps the date, time and who recorded it. A dropped connection never creates a duplicate." },
  { title: "Print the receipt", body: "Hand the farmer a printed receipt with space for both signatures. Reprint it any time from the record." },
];

const SEARCHES = [
  { q: "Ramesh", what: "by farmer name" },
  { q: "312", what: "by survey number" },
  { q: "312/4B", what: "with the sub-division" },
  { q: "RC-000124", what: "by receipt number" },
];

export default function Landing() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const cta = signedIn ? { to: "/app", label: "Open Field Survey" } : { to: "/login", label: "Sign in" };

  return (
    <div className="landing">
      <header className="l-hero">
        <nav className="l-nav" aria-label="Main">
          <Wordmark light />
          <Link to={cta.to} className="btn btn-secondary btn-sm l-nav-cta">{cta.label}</Link>
        </nav>

        <div className="l-hero-grid">
          <div className="l-hero-copy">
            <h1 className="wide">Every farmer leaves with a receipt.</h1>
            <p className="l-lede">
              Record the farmer, the land and the equipment or service provided, then print a numbered receipt on the spot.
              The same records as the Field Survey Android app, now in your browser.
            </p>
            <div className="l-hero-actions">
              <Link to={cta.to} className="btn btn-primary l-cta">
                {cta.label}
                <ArrowRight aria-hidden />
              </Link>
              <a href="#how" className="l-textlink">How it works</a>
            </div>
          </div>

          <div className="l-printer" aria-label={`Sample receipt ${SAMPLE.record_no}`} role="img">
            <div className="l-slot" aria-hidden />
            <div className="l-slip-clip">
              <article className="l-slip" aria-hidden>
                <div className="l-slip-head">
                  <p className="l-slip-org">{env.receiptOrgName}</p>
                  {env.receiptOrgSubtitle ? <p className="l-slip-sub">{env.receiptOrgSubtitle}</p> : null}
                  <p className="l-slip-title">Farmer receipt</p>
                </div>
                <div className="l-slip-meta">
                  <span>Receipt no.<b className="receipt-no">{SAMPLE.record_no}</b></span>
                  <span className="r">Date &amp; time<b>{SAMPLE.when}</b></span>
                </div>
                <dl className="l-slip-rows">
                  {SAMPLE.rows.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="l-slip-service">
                  <p className="l-slip-service-h">Equipment / service details</p>
                  <p>{SAMPLE.service}</p>
                </div>
                <div className="l-slip-sign"><span>Farmer signature</span><span>Authorised signature</span></div>
                <div className="l-stamp">Recorded</div>
              </article>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section id="how" className="l-section l-how" aria-labelledby="how-h">
          <h2 id="how-h" className="wide">From the field to a printed receipt in three steps</h2>
          <ol className="l-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="l-step-n" aria-hidden>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="l-section l-search" aria-labelledby="search-h">
          <div>
            <h2 id="search-h" className="wide">Find any record again</h2>
            <p className="l-section-lede">
              Type what you have in hand: the farmer's name, the survey number from the land papers, or the number printed on the receipt.
            </p>
          </div>
          <ul className="l-queries">
            {SEARCHES.map((s) => (
              <li key={s.q}>
                <span className="l-query"><Search aria-hidden />{s.q}</span>
                <span className="l-query-what">{s.what}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="l-section l-roles" aria-labelledby="roles-h">
          <h2 id="roles-h" className="wide">Two kinds of account</h2>
          <p className="l-section-lede">Accounts are created by an administrator. There is no public sign-up.</p>
          <div className="l-role-table" role="table" aria-label="What each account can do">
            <div role="row" className="l-role-head">
              <span role="columnheader">What you can do</span>
              <span role="columnheader">Regular user</span>
              <span role="columnheader">Admin</span>
            </div>
            {[
              ["Add records", true, true],
              ["Search and open records", true, true],
              ["Print and reprint receipts", true, true],
              ["Delete records", false, true],
              ["Add and manage user accounts", false, true],
              ["Excel and PDF reports", false, true],
              ["Audit history of every change", false, true],
            ].map(([what, user, admin]) => (
              <div role="row" key={what as string}>
                <span role="cell">{what}</span>
                <span role="cell" className={user ? "yes" : "no"}>{user ? "Yes" : "No"}</span>
                <span role="cell" className={admin ? "yes" : "no"}>{admin ? "Yes" : "No"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="l-section l-devices" aria-labelledby="devices-h">
          <div className="l-device">
            <Printer aria-hidden />
            <div>
              <h2 id="devices-h">Prints on the printer you already have</h2>
              <p>Receipts go through your browser's print dialog, so any office or receipt printer connected to the computer works. Choose "Save as PDF" to keep a copy.</p>
            </div>
          </div>
          <div className="l-device">
            <Smartphone aria-hidden />
            <div>
              <h2>Same records on the phone</h2>
              <p>The web and the Android app share one database. A record saved in the field shows up here straight away, and the other way round.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <Wordmark light />
        <Link to={cta.to} className="btn btn-primary">{cta.label}</Link>
      </footer>
    </div>
  );
}
