"use client";
import dynamic from "next/dynamic";
const Workspace = dynamic(() => import("@/components/recall-workspace"), {
  ssr: false,
  loading: () => (
    <main className="workspace loading-workspace" aria-busy="true">
      <h1>REcall</h1>
      <p role="status">Opening your research workspace…</p>
    </main>
  ),
});
export default function Page() {
  return <Workspace />;
}
