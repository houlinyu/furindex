"use client";

import { useActionState, useState } from "react";
import { addClaim, addPolicy, deletePolicy, type InsuranceState } from "@/app/insurance-actions";
import { formatDate, formatMoney } from "@/lib/format";
import {
  CLAIM_STATUS_LABEL,
  INSURERS,
  type ClaimStatus,
  type InsuranceClaim,
  type InsurancePolicy,
} from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";
const submit =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60";

/** Claims that are still moving vs. finished — drives the colour of the pill. */
const OPEN: ClaimStatus[] = ["draft", "submitted", "in_review", "approved"];

export default function InsuranceSection({
  petId,
  policies,
  claims,
}: {
  petId: string;
  policies: InsurancePolicy[];
  claims: InsuranceClaim[];
}) {
  const [showPolicy, setShowPolicy] = useState(policies.length === 0);
  const [policyState, policyAction, policyPending] = useActionState<InsuranceState, FormData>(
    addPolicy,
    {}
  );
  const [claimState, claimAction, claimPending] = useActionState<InsuranceState, FormData>(
    addClaim,
    {}
  );

  const today = new Date().toISOString().slice(0, 10);
  const totalPaid = claims.reduce((sum, c) => sum + (c.amount_paid_cents ?? 0), 0);
  const totalClaimed = claims.reduce((sum, c) => sum + (c.amount_claimed_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      {policies.length > 0 && (
        <>
          <ul className="card divide-y divide-[var(--border)]">
            {policies.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl">🛡️</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {p.provider}
                      {p.plan_name && <span className="muted font-normal"> · {p.plan_name}</span>}
                    </p>
                    <p className="muted text-xs">
                      {[
                        p.policy_number && `#${p.policy_number}`,
                        p.reimbursement_pct != null && `${p.reimbursement_pct}% reimbursement`,
                        p.deductible_cents != null &&
                          `${formatMoney(p.deductible_cents)} deductible`,
                        p.monthly_premium_cents != null &&
                          `${formatMoney(p.monthly_premium_cents)}/mo`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details recorded"}
                    </p>
                    {(p.start_date || p.end_date) && (
                      <p className="muted mt-0.5 text-xs">
                        {formatDate(p.start_date)} → {p.end_date ? formatDate(p.end_date) : "ongoing"}
                        {p.end_date && p.end_date < today && (
                          <span className="ml-1 text-amber-600">· expired</span>
                        )}
                      </p>
                    )}
                  </div>
                  <form action={deletePolicy}>
                    <input type="hidden" name="policy_id" value={p.id} />
                    <input type="hidden" name="pet_id" value={petId} />
                    <button className="muted shrink-0 text-xs underline underline-offset-4 hover:text-red-600">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          {claims.length > 0 && (
            <div className="card flex flex-wrap gap-6 p-4 text-sm">
              <div>
                <p className="muted text-xs">Claimed</p>
                <p className="font-semibold">{formatMoney(totalClaimed)}</p>
              </div>
              <div>
                <p className="muted text-xs">Reimbursed</p>
                <p className="font-semibold text-brand-600">{formatMoney(totalPaid)}</p>
              </div>
              <div>
                <p className="muted text-xs">Claims</p>
                <p className="font-semibold">{claims.length}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------- policy --- */}
      {showPolicy ? (
        <form action={policyAction} className="card grid gap-3 p-4 sm:grid-cols-2">
          <input type="hidden" name="pet_id" value={petId} />
          <div className="sm:col-span-2">
            <label htmlFor="provider" className="mb-1 block text-sm font-medium">
              Insurer <span className="text-red-500">*</span>
            </label>
            <input
              id="provider"
              name="provider"
              required
              list="insurers"
              placeholder="Start typing, or write anything"
              className={field}
            />
            <datalist id="insurers">
              {INSURERS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </div>
          <input name="plan_name" placeholder="Plan name" className={field} />
          <input name="policy_number" placeholder="Policy number" className={field} />
          <label className="muted text-xs">
            Starts
            <input name="start_date" type="date" className={field} />
          </label>
          <label className="muted text-xs">
            Renews / ends
            <input name="end_date" type="date" className={field} />
          </label>
          <input name="monthly_premium" type="number" step="0.01" min="0" placeholder="Premium / month" className={field} />
          <input name="deductible" type="number" step="0.01" min="0" placeholder="Deductible" className={field} />
          <input name="reimbursement_pct" type="number" min="0" max="100" placeholder="Reimbursement %" className={field} />
          <input name="annual_limit" type="number" step="0.01" min="0" placeholder="Annual limit" className={field} />

          {policyState.error && (
            <p className="text-sm text-red-600 sm:col-span-2" role="alert">
              {policyState.error}
            </p>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <button disabled={policyPending} className={submit}>
              {policyPending ? "Saving…" : "Save policy"}
            </button>
            {policies.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPolicy(false)}
                className="muted text-xs underline underline-offset-4"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowPolicy(true)}
          className="muted text-xs underline underline-offset-4 hover:text-brand-600"
        >
          + Add another policy
        </button>
      )}

      {/* ----------------------------------------------------------- claims --- */}
      {policies.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide muted">Claims</h3>

          <form action={claimAction} className="card mb-3 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="pet_id" value={petId} />
            <select name="policy_id" className={field} defaultValue={policies[0].id}>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider}
                  {p.plan_name ? ` · ${p.plan_name}` : ""}
                </option>
              ))}
            </select>
            <input name="claim_number" placeholder="Claim number" className={field} />
            <label className="muted text-xs">
              Date of service
              <input name="service_date" type="date" defaultValue={today} max={today} className={field} />
            </label>
            <select name="status" defaultValue="submitted" className={field}>
              {Object.entries(CLAIM_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input name="amount_claimed" type="number" step="0.01" min="0" placeholder="Amount claimed" className={field} />
            <input name="amount_paid" type="number" step="0.01" min="0" placeholder="Amount reimbursed" className={field} />
            <input name="description" placeholder="What was it for?" className={`${field} sm:col-span-2`} />

            {claimState.error && (
              <p className="text-sm text-red-600 sm:col-span-2" role="alert">
                {claimState.error}
              </p>
            )}
            <div className="sm:col-span-2">
              <button disabled={claimPending} className={submit}>
                {claimPending ? "Saving…" : "Add claim"}
              </button>
            </div>
          </form>

          {claims.length === 0 ? (
            <p className="card muted px-4 py-6 text-center text-sm">No claims recorded yet.</p>
          ) : (
            <ul className="card divide-y divide-[var(--border)]">
              {claims.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {c.description || c.claim_number || "Claim"}
                    </p>
                    <p className="muted text-xs">
                      {formatDate(c.service_date)}
                      {c.amount_claimed_cents != null &&
                        ` · claimed ${formatMoney(c.amount_claimed_cents)}`}
                      {c.amount_paid_cents != null &&
                        ` · paid ${formatMoney(c.amount_paid_cents)}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                      c.status === "denied"
                        ? "border-red-300 text-red-600"
                        : OPEN.includes(c.status)
                          ? "border-amber-300 text-amber-700"
                          : "border-brand-300 text-brand-700"
                    }`}
                  >
                    {CLAIM_STATUS_LABEL[c.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
