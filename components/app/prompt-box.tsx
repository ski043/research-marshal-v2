"use client";

import { ArrowUpIcon, CircleAlertIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useActionState,
  useId,
} from "react";
import { type StartState, startRunAction } from "@/app/actions";
import { type ModelOption, ModelSelect } from "@/components/app/model-select";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import { Button } from "@/components/ui/button";
import { useStored } from "@/lib/ui/storage";

const MODEL_KEY = "research-marshal.model";
const NO_ERROR: StartState = { error: null };

/**
 * The one prompt box of the app (U1): a native form with a Server Action. Enter starts
 * the run, Shift+Enter breaks the line. A start that fails keeps the question.
 */
export function PromptBox({
  question,
  onQuestionChange,
  models,
  defaultModel,
  inputRef,
}: {
  question: string;
  onQuestionChange: (text: string) => void;
  models: readonly ModelOption[];
  defaultModel: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [state, action, pending] = useActionState(startRunAction, NO_ERROR);
  const [stored, storeModel] = useStored(MODEL_KEY);
  const model = models.some((option) => option.key === stored)
    ? (stored as string)
    : defaultModel;
  const inputId = useId();
  const errorId = useId();
  const empty = question.trim() === "";

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!empty && !pending) event.currentTarget.form?.requestSubmit();
  };

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="rounded-2xl border border-input bg-card shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <label htmlFor={inputId} className="sr-only">
          Research question
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          name="question"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a research question"
          rows={1}
          maxLength={2000}
          readOnly={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="field-sizing-content block max-h-52 min-h-22 w-full resize-none bg-transparent px-4 pt-3.5 text-base/6 text-foreground outline-none placeholder:text-muted-foreground sm:text-[0.9375rem]/6"
        />
        <div className="flex items-center justify-between gap-2 p-2">
          <ModelSelect
            name="model"
            options={models}
            value={model}
            onChange={storeModel}
            disabled={pending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={empty || pending}
            aria-label={pending ? "Starting the run" : "Start the run"}
            className="rounded-full transition-[background-color,opacity,scale] duration-150 active:scale-95"
          >
            {pending ? (
              <GlyphSpinner className="text-primary-foreground" />
            ) : (
              <ArrowUpIcon aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {state.error && (
        <p
          id={errorId}
          role="alert"
          className="flex animate-in items-start gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{state.error}</span>
        </p>
      )}
    </form>
  );
}
