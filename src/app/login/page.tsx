import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl">🐾</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">FurIndex</h1>
          <p className="muted mt-1 text-sm">
            Vaccinations, meds, weight and vet visits — in one place.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="muted mt-6 text-center text-xs leading-relaxed">
          We email you a one-time sign-in link. No password to forget.
        </p>
      </div>
    </main>
  );
}
