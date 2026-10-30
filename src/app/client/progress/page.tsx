import { requireUser } from "@/lib/session";
import { ReportForm } from "@/components/ReportForm";
import { ProgressPanel } from "@/components/workout/ProgressPanel";

const reportNow = () => Date.now();

export default async function Progress({ searchParams }: { searchParams: Promise<{ ex?: string }> }) {
  const { ex } = await searchParams;
  const { supabase, profile } = await requireUser("client");
  return (<section className="space-y-4"><h1 className="text-2xl font-semibold">Mi progreso</h1><ProgressPanel supabase={supabase} clientId={profile.id} ex={ex} basePath="/client/progress" audience="client" /><ReportForm trainer={false} now={reportNow()} /></section>);
}
