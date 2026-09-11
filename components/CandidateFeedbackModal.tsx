"use client";

import { useEffect } from "react";
import { dashIfEmpty, statusToneClass } from "@/lib/format";
import type { Candidate } from "@/lib/types";

// Loose shape rather than the full Candidate type — callers select different
// column subsets (Search fetches everything, Company Sheet fetches only the
// funnel columns), so this only requires the fields the modal actually shows.
export type FeedbackCandidate = Pick<
  Candidate,
  | "name"
  | "job_role"
  | "call_done_by"
  | "call_date"
  | "call_status"
  | "call_remarks"
  | "interested"
  | "tr_status"
  | "tr_tech_rating"
  | "tr_comm_rating"
  | "tr_remarks"
  | "tech_screening_taken_by"
  | "tech_status"
  | "tech_tech_rating"
  | "tech_comm_rating"
  | "tech_remarks"
> & { companyName?: string | null };

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-sm text-ink">{dashIfEmpty(value)}</span>
    </div>
  );
}

function RemarksBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || value.trim() === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <p className="whitespace-pre-wrap text-sm text-ink rounded-md bg-surface-hover border border-line px-3 py-2">
        {value}
      </p>
    </div>
  );
}

/** Full-feedback modal for one candidate row — every field this app currently
 * captures from the "call" stage, the Technical Recruiter's screening, and the
 * Tech Team's screening, including the two long-form remarks fields
 * (call_remarks, tr_remarks) that were never surfaced anywhere before this
 * (confirmed 2026-09-11: only tech_remarks was ever shown, truncated, in a
 * table cell — recruiters had no way to see a candidate's full feedback in
 * one place without opening the source Google Sheet). */
export function CandidateFeedbackModal({
  candidate,
  onClose,
}: {
  candidate: FeedbackCandidate;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasAnyRemarks = candidate.call_remarks || candidate.tr_remarks || candidate.tech_remarks;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-line bg-surface shadow-lg mt-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{dashIfEmpty(candidate.name)}</h2>
            <p className="text-xs text-ink-muted">
              {[candidate.companyName, candidate.job_role].filter(Boolean).join(" — ") || "-"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4 max-h-[70vh] overflow-y-auto">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Call</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Call done by" value={candidate.call_done_by} />
              <Field label="Call date" value={candidate.call_date} />
              <Field label="Call status" value={candidate.call_status} />
              <Field label="Interested" value={candidate.interested ? "Yes" : "No"} />
            </div>
            <RemarksBlock label="Call remarks" value={candidate.call_remarks} />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Technical Recruiter</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">TR status</span>
                <span className={`text-sm ${statusToneClass(candidate.tr_status)}`}>
                  {dashIfEmpty(candidate.tr_status)}
                </span>
              </div>
              <Field label="Tech rating" value={candidate.tr_tech_rating} />
              <Field label="Comm rating" value={candidate.tr_comm_rating} />
            </div>
            <RemarksBlock label="TR remarks" value={candidate.tr_remarks} />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Tech Team</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Taken by" value={candidate.tech_screening_taken_by} />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">Tech team status</span>
                <span className={`text-sm ${statusToneClass(candidate.tech_status)}`}>
                  {dashIfEmpty(candidate.tech_status)}
                </span>
              </div>
              <Field label="Tech rating" value={candidate.tech_tech_rating} />
              <Field label="Comm rating" value={candidate.tech_comm_rating} />
            </div>
            <RemarksBlock label="Tech team remarks" value={candidate.tech_remarks} />
          </section>

          {!hasAnyRemarks && (
            <p className="text-sm italic text-ink-muted">No remarks written for this candidate yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
