import { RunDesk } from "@/components/RunDesk";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDesk id={id} />;
}
