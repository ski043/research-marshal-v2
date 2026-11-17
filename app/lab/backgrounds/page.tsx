import type { Metadata } from "next";
import { Suspense } from "react";
import { BUDGET } from "@/lib/research/budget";
import { DEFAULT_MODEL } from "@/lib/research/events";
import { MODEL_OPTIONS } from "@/lib/research/model-config";
import { BackgroundsLab } from "./backgrounds-lab";

export const metadata: Metadata = { title: "Backgrounds" };

/** A prototype page: the real start screen over each background variant. */
export default function BackgroundsLabPage() {
  return (
    // The variant comes from the query string, which only the browser knows.
    <Suspense fallback={null}>
      <BackgroundsLab
        models={MODEL_OPTIONS}
        defaultModel={DEFAULT_MODEL}
        budget={{
          rounds: BUDGET.rounds,
          queriesPerRound: BUDGET.queriesPerRound,
          readsPerRound: BUDGET.readsPerRound,
          mapsPerRun: BUDGET.mapsPerRun,
        }}
      />
    </Suspense>
  );
}
