"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const Landing = dynamic(() => import("@/components/Landing"), {
  ssr: false,
  loading: () => <div className="boot">Loading the map…</div>,
});

export default function Page() {
  return (
    <Suspense fallback={<div className="boot">Loading the map…</div>}>
      <Landing />
    </Suspense>
  );
}
