import MarketingNav from "@/components/MarketingNav";
import FeatureShowcase from "@/components/FeatureShowcase";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Roadmap — FurIndex",
  description:
    "Where FurIndex is today and where it's going — every block tagged honestly: live now, building, or next up.",
};

export default async function RoadmapPage() {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main">
        <FeatureShowcase />
      </main>
    </div>
  );
}
