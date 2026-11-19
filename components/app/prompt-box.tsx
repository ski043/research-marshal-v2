"use client";

import { ArrowUpIcon, CircleAlertIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useActionState,
  useId,
  useState,
} from "react";
import { type StartState, startRunAction } from "@/app/actions";
import { type ModelOption, ModelSelect } from "@/components/app/model-select";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useStored } from "@/lib/ui/storage";
import { cn } from "@/lib/utils";

const MODEL_KEY = "research-marshal.model";
const NO_ERROR: StartState = { error: null };

/**
 * The one prompt box of the app (U1): a native form with a Server Action. Enter starts
 * the run, Shift+Enter breaks the line. A start that fails keeps the question.
 *
 * While the box is empty it shows `invitation` once and then one of `examples` after
 * the other. Tab takes the example on screen as the question.
 */
export function PromptBox({
  question,
  onQuestionChange,
  models,
  defaultModel,
  inputRef,
  invitation,
  examples,
  children,
}: {
  question: string;
  onQuestionChange: (text: string) => void;
  models: readonly ModelOption[];
  defaultModel: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  invitation: string;
  examples: readonly string[];
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(startRunAction, NO_ERROR);
  const [stored, storeModel] = useStored(MODEL_KEY);
  const model = models.some((option) => option.key === stored)
    ? (stored as string)
    : defaultModel;
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const empty = question.trim() === "";

  // 0 is the invitation. The examples follow and repeat without it.
  const [shown, setShown] = useState(0);
  const example = shown > 0 ? examples[shown - 1] : undefined;
  const placeholder = example ?? invitation;
  const offer = question === "" ? example : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Tab" && !event.shiftKey && offer) {
      event.preventDefault();
      onQuestionChange(offer);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!empty && !pending) event.currentTarget.form?.requestSubmit();
  };

  return (
    <form action={action} className="flex flex-col">
      <div className="group/box @container relative z-10 rounded-2xl border bg-card shadow-xs/5 transition-[border-color,box-shadow] focus-within:border-ring/64 focus-within:ring-[3px] focus-within:ring-ring/16">
        <div className="relative">
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
            rows={1}
            maxLength={2000}
            readOnly={pending}
            aria-placeholder={placeholder}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={
              cn(state.error && errorId, offer && hintId) || undefined
            }
            className="field-sizing-content block max-h-44 min-h-22 w-full resize-none bg-transparent px-4 pt-3.5 text-base/6 text-foreground outline-none sm:text-sm/6"
          />
          {question === "" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-4 top-3.5 overflow-hidden text-base/6 text-muted-foreground sm:text-sm/6"
            >
              <span
                key={shown}
                onAnimationEnd={() =>
                  setShown((now) => (now < examples.length ? now + 1 : 1))
                }
                className={cn(
                  "block animate-placeholder truncate motion-reduce:animate-none",
                  // The invitation is on screen from the first paint, so it skips the way in.
                  shown === 0 && "[animation-delay:-200ms]",
                )}
              >
                {placeholder}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 p-2 ps-2.5">
          <p
            id={hintId}
            className="flex min-w-0 flex-1 items-center gap-1.5 ps-1.5 text-xs text-muted-foreground"
          >
            {offer ? (
              <span className="hidden items-center gap-1.5 opacity-0 transition-opacity duration-150 group-has-[textarea:focus]/box:opacity-100 @md:flex">
                <Kbd>Tab</Kbd>
                <span className="truncate">uses this question</span>
              </span>
            ) : (
              !empty && (
                <span className="hidden animate-in items-center gap-1.5 duration-200 fade-in motion-reduce:animate-none @md:flex">
                  <Kbd>↵</Kbd>
                  <span className="truncate">starts the run</span>
                </span>
              )
            )}
          </p>
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
            className="size-9 rounded-full transition-[box-shadow,scale,opacity] duration-150 ease-out active:not-aria-[haspopup]:translate-y-0 active:scale-[0.97] sm:size-8"
          >
            {pending ? (
              <GlyphSpinner className="animate-in text-primary-foreground duration-200 fade-in zoom-in-95 motion-reduce:animate-none" />
            ) : (
              <ArrowUpIcon aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {children}
      {state.error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 flex animate-in items-start gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{state.error}</span>
        </p>
      )}
    </form>
  );
}
