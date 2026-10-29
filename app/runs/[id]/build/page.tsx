import { SiteBuilder } from "@/components/SiteBuilder";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteBuilder id={id} />;
}
