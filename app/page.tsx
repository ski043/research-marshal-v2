import { StartScreen } from "@/components/app/start-screen";
import { BUDGET } from "@/lib/research/budget";
import { DEFAULT_MODEL } from "@/lib/research/events";
import { MODEL_OPTIONS } from "@/lib/research/model-config";

export default function StartPage() {
  return (
    <StartScreen
      models={MODEL_OPTIONS}
      defaultModel={DEFAULT_MODEL}
      budget={{
        rounds: BUDGET.rounds,
        queriesPerRound: BUDGET.queriesPerRound,
        readsPerRound: BUDGET.readsPerRound,
        mapsPerRun: BUDGET.mapsPerRun,
      }}
    />
  );
}
