"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { saveProfileBlock, type ProfileBlockState } from "@/app/profile-actions";
import BreedInput from "@/components/BreedInput";
import {
  BLOCK_COUNT,
  PROFILE_BLOCKS,
  questionsOf,
  type ChoiceQuestion,
  type MultiQuestion,
} from "@/lib/pet-profile";
import type { Pet, PetProfile, ProfileTristate } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * The profile questionnaire: one block per screen.
 *
 * WHAT THIS COMPONENT IS TRYING NOT TO BE
 * Every question in here is optional, and the design has to make that true
 * rather than merely say it:
 *
 *   - Skip is a real control on every single screen, the same size and in the
 *     same place as Continue. An optional questionnaire whose only way past a
 *     question is to answer it is not optional.
 *   - Back is a SUBMIT, not a link. Going back saves the current screen first,
 *     so "I'll just check what I put last time" can't cost anyone their taps.
 *   - Progress is stated as "3 of 7" and never as a percentage. A percentage
 *     implies a score, and there is nothing here to score.
 *   - Nothing is graded, nothing is flagged, and the health block in particular
 *     records what the owner reports and stops there — no red states, no
 *     warnings, no "you should see a vet".
 *
 * Each screen posts to saveProfileBlock, so closing the tab loses at most the
 * screen on the display, and reopening shows what was already answered.
 */
export default function ProfileQuiz({
  pet,
  profile,
  blockIndex,
  isNew,
  storageReady,
}: {
  pet: Pet;
  profile: PetProfile | null;
  blockIndex: number;
  /** Arrived straight from creating this pet — changes the intro, nothing else. */
  isNew: boolean;
  /** False when the pet_profiles migration hasn't been applied yet. */
  storageReady: boolean;
}) {
  const [state, formAction, pending] = useActionState<ProfileBlockState, FormData>(
    saveProfileBlock,
    {}
  );
  const block = PROFILE_BLOCKS[blockIndex];
  const { multi, choice, hasBasics } = questionsOf(block);
  const errorId = useId();

  /**
   * Single-choice answers are held in state because one of them is a gate: the
   * list of condition areas only exists while "Any current health conditions?"
   * is Yes. Multi-selects stay uncontrolled — they are plain checkboxes and the
   * browser is better at remembering them than we are.
   */
  const [choices, setChoices] = useState<Record<string, ProfileTristate | null>>(() => {
    const initial: Record<string, ProfileTristate | null> = {};
    for (const q of choice) initial[q.column] = profile?.[q.column] ?? null;
    return initial;
  });

  const isFirst = blockIndex === 0;
  const isLast = blockIndex === BLOCK_COUNT - 1;

  return (
    <form action={formAction} className="card p-5 sm:p-6">
      <input type="hidden" name="pet_id" value={pet.id} />
      <input type="hidden" name="block" value={block.id} />

      <Progress index={blockIndex} title={block.title} />

      {isNew && isFirst && (
        <p className="mt-4 text-sm leading-relaxed">
          {pet.name} is saved. These next few screens are optional — answer what you
          feel like and skip the rest.
        </p>
      )}

      <h1 className="mt-4 text-xl font-semibold tracking-tight">{block.title}</h1>
      <p className="muted mt-1 text-sm leading-relaxed">{block.intro}</p>

      {!storageReady && (
        <p className="muted mt-4 rounded-lg border border-[var(--border)] p-3 text-xs leading-relaxed">
          Answers can&apos;t be saved yet on this environment — the profile table
          hasn&apos;t been created. You can read the questions, but saving will
          fail until that migration is applied, so don&apos;t fill this in yet.
        </p>
      )}

      {/* Disabling the whole set while a save is in flight is what stops a
          double-tap on Continue from writing the block twice and skipping a
          screen. A form here without it once produced eleven duplicate rows. */}
      <fieldset disabled={pending} className="min-w-0">
        <div className="mt-6 space-y-8">
          {hasBasics && <Basics pet={pet} />}

          {block.questions.map((q) => {
            if (q.kind === "choice") {
              return (
                <ChoiceField
                  key={q.column}
                  question={q}
                  value={choices[q.column] ?? null}
                  onChange={(v) => setChoices((c) => ({ ...c, [q.column]: v }))}
                />
              );
            }
            if (q.kind === "multi") {
              // A gated follow-up is not rendered until its gate opens, rather
              // than rendered disabled: a greyed-out list of health conditions
              // reads as something being withheld.
              if (q.showWhen && choices[q.showWhen.column] !== q.showWhen.equals) {
                return null;
              }
              return <MultiField key={q.column} question={q} profile={profile} />;
            }
            return null;
          })}
        </div>

        {state.error && (
          <p
            id={errorId}
            role="alert"
            className="mt-6 text-sm text-red-600 dark:text-red-400"
          >
            {state.error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
          {/* Saves this screen on the way past — see the note at the top. */}
          <button
            type="submit"
            name="intent"
            value="back"
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)] disabled:opacity-60"
          >
            ← Back
          </button>

          <button
            type="submit"
            name="intent"
            value="next"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : isLast ? "Save & finish" : "Save & continue"}
          </button>

          {/* Same weight and the same row as Continue. Skip is not a way out of
              the flow, it is one of the two normal ways through it. */}
          <button
            type="submit"
            name="intent"
            value="skip"
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)] disabled:opacity-60"
          >
            Skip this one
          </button>

          <Link
            href={`/pets/${pet.id}`}
            className="muted ml-auto inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            Finish later
          </Link>
        </div>
      </fieldset>

      <p className="muted mt-4 text-xs leading-relaxed">
        Every question here is optional, and each screen saves on its own — leaving
        halfway through keeps everything you&apos;ve already answered.
      </p>
    </form>
  );
}

function Progress({ index, title }: { index: number; title: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="muted text-xs uppercase tracking-wide">Pet profile</p>
        <p className="muted text-xs tabular-nums">
          {index + 1} of {BLOCK_COUNT}
        </p>
      </div>
      {/* Decoration: the count above says the same thing, and says it to a
          screen reader properly. */}
      <div className="mt-2 flex gap-1" aria-hidden>
        {PROFILE_BLOCKS.map((b, i) => (
          <span
            key={b.id}
            className={`h-1.5 flex-1 rounded-full ${
              i <= index ? "bg-brand-500" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>
      <p className="sr-only">
        Block {index + 1} of {BLOCK_COUNT}: {title}
      </p>
    </div>
  );
}

/**
 * Block 1. Reuses BreedInput so the species/breed pair behaves exactly as it
 * does on the create form — including breed staying free text, which is the
 * only thing that works for a mix or a rescue of unknown parentage.
 */
function Basics({ pet }: { pet: Pet }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={pet.name}
          className={field}
        />
      </div>

      <BreedInput defaultSpecies={pet.species} defaultBreed={pet.breed ?? ""} />

      <div>
        <label htmlFor="sex" className="mb-1 block text-sm font-medium">
          Sex
        </label>
        <select id="sex" name="sex" defaultValue={pet.sex} className={field}>
          <option value="unknown">Unknown</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </div>

      <div>
        <label htmlFor="birth_date" className="mb-1 block text-sm font-medium">
          Birth date
        </label>
        <input
          id="birth_date"
          name="birth_date"
          type="date"
          max={today}
          defaultValue={pet.birth_date ?? ""}
          className={field}
        />
        <p className="muted mt-1 text-xs">Approximate is fine. Leave blank if unknown.</p>
      </div>
    </div>
  );
}

function MultiField({
  question,
  profile,
}: {
  question: MultiQuestion;
  profile: PetProfile | null;
}) {
  const selected = new Set(profile?.[question.column] ?? []);
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">{question.prompt}</legend>
      <p className="muted mt-1 text-xs">
        {question.hint ?? "Pick as many as apply, or none."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {question.options.map((o) => (
          <Chip
            key={o.key}
            type="checkbox"
            name={question.column}
            value={o.key}
            label={o.label}
            defaultChecked={selected.has(o.key)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ChoiceField({
  question,
  value,
  onChange,
}: {
  question: ChoiceQuestion;
  value: ProfileTristate | null;
  onChange: (v: ProfileTristate | null) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">{question.prompt}</legend>
      {question.hint && <p className="muted mt-1 text-xs">{question.hint}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {question.options.map((o) => (
          <Chip
            key={o.key}
            type="radio"
            name={question.column}
            value={o.key}
            label={o.label}
            checked={value === o.key}
            onChange={() => onChange(o.key)}
          />
        ))}
        {/* A radio group cannot be un-picked by clicking, and "I'd rather not
            say after all" has to stay reachable in a questionnaire that claims
            everything is optional. */}
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="muted inline-flex min-h-11 items-center px-2 text-xs underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            Clear answer
          </button>
        )}
      </div>
    </fieldset>
  );
}

/**
 * One tappable option.
 *
 * min-h-11 / min-w-11 is 44px, the smallest target that is reliably hit with a
 * thumb — these are meant to be tapped on a phone while holding an animal.
 *
 * The selected state is carried by THREE things at once: a filled tick box, a
 * heavier border, and bolder text. Colour is the fourth, not the first — the
 * brand green against the unselected grey is a hue difference that a red-green
 * colour-blind reader can miss entirely, and the tick is what they read instead.
 */
function Chip({
  type,
  name,
  value,
  label,
  defaultChecked,
  checked,
  onChange,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
}) {
  return (
    <label
      className={[
        "inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full",
        "border border-[var(--border)] px-4 py-2 text-sm transition-colors",
        "hover:border-brand-500",
        // :has() rather than :peer here because the styling sits on the label,
        // which is the input's parent and so out of reach of a sibling selector.
        "has-[:checked]:border-brand-600 has-[:checked]:bg-brand-500/10 has-[:checked]:font-medium",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600",
      ].join(" ")}
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={[
          "grid h-5 w-5 shrink-0 place-items-center border text-[11px] leading-none",
          type === "radio" ? "rounded-full" : "rounded",
          "border-[var(--border)] text-transparent",
          "peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white",
        ].join(" ")}
      >
        ✓
      </span>
      <span>{label}</span>
    </label>
  );
}
