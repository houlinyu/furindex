import ProfileArt from "@/components/feature-art/ProfileArt";
import CalendarArt from "@/components/feature-art/CalendarArt";
import DashboardArt from "@/components/feature-art/DashboardArt";
import SignalsArt from "@/components/feature-art/SignalsArt";

/**
 * The four features as one narrative: know -> care -> understand -> notice.
 * Art alternates sides so the page reads as a progression rather than a grid of
 * equivalent boxes.
 *
 * `status` is deliberate. Two of these are not shipped, and saying so on the
 * page is better than letting someone discover it by clicking.
 */
const FEATURES = [
  {
    step: "Know your pet",
    title: "Smart Pet Profile",
    lede: "Your pet's whole story, always up to date.",
    body: "A living profile for every animal in the household — identity, health history, weight, behaviour, medication and care needs in one place, so you, your family, your sitter or your vet always have the full picture.",
    points: [
      "Breed, birthdate, sex, microchip, photos",
      "Weight and growth over time",
      "Conditions, allergies, medications, procedures",
      "Fields you define, not fields we picked",
    ],
    art: <ProfileArt />,
    status: "live" as const,
  },
  {
    step: "Care for your pet",
    title: "Family Care Calendar",
    lede: "Everyone who cares for your pet, on the same page.",
    body: "Feeding, walks, medication, grooming and vet visits shared across everyone who helps — so nobody double-feeds the dog and nobody assumes someone else gave the tablet.",
    points: [
      "Shared calendar across all caretakers",
      "Recurring routines and one-off appointments",
      "Reminders, and a record of what was actually done",
      "Invite family, housemates or a sitter",
    ],
    art: <CalendarArt />,
    status: "next" as const,
  },
  {
    step: "Understand your pet",
    title: "Health & Wellness Dashboard",
    lede: "Understand your pet's health, not just record it.",
    body: "A medical record tells you what happened. A dashboard shows what is changing — weight, appetite, energy and symptoms read against your own animal's history rather than a generic chart.",
    points: [
      "Longitudinal history in one view",
      "Trends compared to this pet's own baseline",
      "Medication and treatment history",
      "Context for species, breed and age",
    ],
    art: <DashboardArt />,
    status: "partial" as const,
  },
  {
    step: "Notice what changes",
    title: "Connected Care & Insights",
    lede: "Notice changes before they become easy to miss.",
    body: "Sensors measure what you cannot feel. You notice what sensors cannot measure. Joined on one timeline, a small drop in activity and a note saying “less interested in playing” stop being two unrelated things.",
    points: [
      "Wearable signals alongside your own observations",
      "Comparison against this pet's normal, not an average",
      "Change detection rather than raw numbers",
      "Works fully without a wearable",
    ],
    art: <SignalsArt />,
    status: "next" as const,
  },
];

const BADGE = {
  live: null,
  partial: { text: "Partly built", cls: "border-amber-300 text-amber-700" },
  next: { text: "Next up", cls: "border-[var(--border)] muted" },
};

export default function FeatureShowcase() {
  return (
    <section className="border-y border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything about your pet, in one place.
          </h2>
          <p className="muted mt-4 text-base leading-relaxed">
            From everyday care to long-term health — the information, the routines
            and the signals, together. Track what matters, share it with the people
            who look after your pet, and make changes easier to notice over time.
          </p>
        </div>

        <div className="mt-14 space-y-16">
          {FEATURES.map((f, i) => {
            const badge = BADGE[f.status];
            return (
              <div
                key={f.title}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div className={i % 2 ? "md:order-2" : ""}>
                  <p className="muted text-xs font-medium uppercase tracking-widest">
                    {i + 1} · {f.step}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
                    {badge && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}>
                        {badge.text}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--brand-text)]">{f.lede}</p>
                  <p className="muted mt-3 text-sm leading-relaxed">{f.body}</p>
                  <ul className="mt-4 space-y-1.5">
                    {f.points.map((pt) => (
                      <li key={pt} className="muted flex gap-2 text-sm">
                        <span className="text-brand-500" aria-hidden>
                          ·
                        </span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`card p-5 ${i % 2 ? "md:order-1" : ""}`}>{f.art}</div>
              </div>
            );
          })}
        </div>

        <p className="muted mx-auto mt-14 max-w-2xl text-center text-sm leading-relaxed">
          Know your pet. Care for them better. Understand their health. Notice what
          changes.
        </p>
      </div>
    </section>
  );
}
