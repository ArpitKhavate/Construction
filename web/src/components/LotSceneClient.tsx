"use client";

import dynamic from "next/dynamic";
import type { SceneView } from "./StreetScene";

const StreetScene = dynamic(() => import("./StreetScene"), { ssr: false });

export default function LotSceneClient({ view = "street" }: { view?: SceneView }) {
  return <StreetScene view={view} />;
}
