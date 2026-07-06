"use client"

import { memo, useState, useEffect, useRef } from "react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"

interface AgentToolCallProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  isPending: boolean
  isError: boolean
  isNested?: boolean
  onClick?: () => void
}

export const AgentToolCall = memo(
  function AgentToolCall({
    icon: _Icon,
    title,
    subtitle,
    tooltipContent,
    isPending,
    isError: _isError,
    isNested,
    onClick,
  }: AgentToolCallProps) {
    // Ensure title and subtitle are strings (copied from canvas)
    const titleStr = String(title)
    const subtitleStr = subtitle ? String(subtitle) : undefined

    // ── Thinking mode: timer + reasoning text ──
    const isThinking = titleStr === "Thinking"
    const [elapsed, setElapsed] = useState(0)
    const [expanded, setExpanded] = useState(true)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
      if (isThinking && isPending) {
        setElapsed(0)
        timerRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1)
        }, 1000)
      }
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }, [isThinking, isPending])

    // Reasoning text from subtitle or tooltipContent
    const reasoningText = subtitleStr || tooltipContent || ""

    // ── Render subtitle with optional tooltip ──
    const clickableClass = onClick
      ? " cursor-pointer hover:text-muted-foreground transition-colors"
      : ""

    const subtitleElement = subtitleStr && !isThinking ? (
      tooltipContent ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`text-muted-foreground/60 font-normal truncate min-w-0${clickableClass}`}
              dangerouslySetInnerHTML={{ __html: subtitleStr }}
              onClick={onClick}
            />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="px-2 py-1.5 max-w-none flex items-center justify-center"
          >
            <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
              {tooltipContent}
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span
          className={`text-muted-foreground/60 font-normal truncate min-w-0${clickableClass}`}
          dangerouslySetInnerHTML={{ __html: subtitleStr }}
          onClick={onClick}
        />
      )
    ) : null

    // ── Thinking UI ──
    if (isThinking) {
      return (
        <div className="flex flex-col gap-1 py-1 px-2 rounded-md bg-accent/30 border border-border/50">
          {/* Header: icon + title + timer */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-base leading-none">🧠</span>
            <span className="font-medium">
              {isPending ? (
                <TextShimmer as="span" duration={1.2} className="inline-flex items-center text-xs leading-none h-4">
                  Thinking
                </TextShimmer>
              ) : (
                "Thought"
              )}
            </span>
            <span className="text-muted-foreground/60 font-mono text-[10px]">
              {isPending ? `${elapsed}s` : tooltipContent || `${elapsed}s`}
            </span>
            {reasoningText && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-auto text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {expanded ? "Collapse" : "Show"}
              </button>
            )}
          </div>

          {/* Reasoning text */}
          {expanded && reasoningText && (
            <div className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border-t border-border/30 pt-1.5 mt-0.5">
              {reasoningText}
              {isPending && (
                <span className="inline-block w-1.5 h-3.5 bg-muted-foreground/40 ml-0.5 animate-pulse" />
              )}
            </div>
          )}
        </div>
      )
    }

    // ── Normal tool call UI ──
    return (
      <div
        className={`flex items-start gap-1.5 py-0.5 ${
          isNested ? "px-2.5" : "rounded-md px-2"
        }`}
      >
        {/* Content container - matches canvas exactly */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {titleStr}
                </TextShimmer>
              ) : (
                titleStr
              )}
            </span>
            {subtitleElement}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization (copied from canvas)
    return (
      prevProps.title === nextProps.title &&
      prevProps.subtitle === nextProps.subtitle &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isPending === nextProps.isPending &&
      prevProps.isError === nextProps.isError &&
      prevProps.isNested === nextProps.isNested &&
      prevProps.onClick === nextProps.onClick
    )
  },
)
