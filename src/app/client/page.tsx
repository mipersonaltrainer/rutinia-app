import Link from "next/link";
import { requireUser } from "@/lib/session";
import { loadClientHome } from "@/lib/dashboard/client-home-data";
import { Achievements, Challenges, Hero, Onboarding, ProgressCard, QuickLinks, StreakCard, TodayCard, WeekCard } from "@/components/client-home/HomeSections";

const reportNow = () => new Date();

export default async function ClientHome() {
  const { profile, supabase } = await requireUser("client");
  const h = await loadClientHome(supabase, profile, reportNow());
  return (
    <div className="stagger space-y-5">
      <Hero h={h} />
      {h.needsAssessment && h.hasPlan && <p className="rounded-lg border border-[var(--accent)]/40 p-4 text-sm">Completa tu <Link className="text-[var(--accent)] underline" href="/client/assessment">evaluación inicial</Link> para que tu entrenador pueda preparar tu plan.</p>}
      <TodayCard h={h} />
      {h.hasPlan ? (
        <>
          <div className="grid gap-5 md:grid-cols-2"><WeekCard h={h} /><StreakCard h={h} /></div>
          <Challenges h={h} />
          <ProgressCard h={h} />
          <Achievements h={h} />
        </>
      ) : <Onboarding h={h} />}
      <QuickLinks h={h} />
    </div>
  );
}
