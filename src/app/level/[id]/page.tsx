import { ALL_LEVELS } from "@/content";
import { LevelPlayer } from "./Player";

export function generateStaticParams() {
  return ALL_LEVELS.map((l) => ({ id: l.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LevelPlayer id={id} />;
}
