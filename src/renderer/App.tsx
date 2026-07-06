import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect, useMemo, useRef, useState } from "react"
import { Toaster } from "sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { WindowProvider, getInitialWindowParams } from "./contexts/WindowContext"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "./features/agents/atoms"
import { useAgentSubChatStore } from "./features/agents/stores/sub-chat-store"
import { AgentsLayout } from "./features/layout/agents-layout"
import {
  AnthropicOnboardingPage,
  ApiKeyOnboardingPage,
  BillingMethodPage,
  CodexOnboardingPage,
  SelectRepoPage,
} from "./features/onboarding"
import { identify, initAnalytics, shutdown } from "./lib/analytics"
import {
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  codexOnboardingCompletedAtom,
} from "./lib/atoms"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { trpc } from "./lib/trpc"

/**
 * Custom Toaster that adapts to theme
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  )
}

/**
 * Main content router - decides which page to show based on onboarding state
 */
function AppContent() {
  const billingMethod = useAtomValue(billingMethodAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom
  )
  const setAnthropicOnboardingCompleted = useSetAtom(anthropicOnboardingCompletedAtom)
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const { setActiveSubChat, addToOpenSubChats, setChatId } = useAgentSubChatStore()

  // Apply initial window params (chatId/subChatId) when opening via "Open in new window"
  useEffect(() => {
    const params = getInitialWindowParams()
    if (params.chatId) {
      console.log("[App] Opening chat from window params:", params.chatId, params.subChatId)
      setSelectedChatId(params.chatId)
      setChatId(params.chatId)
      if (params.subChatId) {
        addToOpenSubChats(params.subChatId)
        setActiveSubChat(params.subChatId)
      }
    }
  }, [setSelectedChatId, setChatId, addToOpenSubChats, setActiveSubChat])

  // Claim the initially selected chat to prevent duplicate windows.
  // For new windows opened via "Open in new window", the chat is pre-claimed by main process.
  // For restored windows (persisted localStorage), we need to claim here.
  // Read atom directly from store to avoid stale closure with empty deps.
  useEffect(() => {
    if (!window.desktopApi?.claimChat) return
    const currentChatId = appStore.get(selectedAgentChatIdAtom)
    if (!currentChatId) return
    window.desktopApi.claimChat(currentChatId).then((result) => {
      if (!result.ok) {
        // Another window already has this chat — clear our selection
        setSelectedChatId(null)
      }
    })
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check if user has existing CLI config (API key or proxy)
  // Based on PR #29 by @sa4hnd
  // Add timeout: if the tRPC query takes too long, treat as no config to prevent hang
  const [cliConfigTimedOut, setCliConfigTimedOut] = useState(false)
  const cliConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { data: cliConfig, isLoading: isLoadingCliConfig } =
    trpc.claudeCode.hasExistingCliConfig.useQuery(undefined, {
      // If query fails or times out, treat as no config
      retry: false,
    })

  // Set timeout for CLI config check (5 seconds)
  // Also clear timeout when query completes successfully
  useEffect(() => {
    if (!isLoadingCliConfig) {
      // Query completed (success or error) - clear timeout
      if (cliConfigTimeoutRef.current) {
        clearTimeout(cliConfigTimeoutRef.current)
        cliConfigTimeoutRef.current = null
      }
      return
    }
    // Still loading - set timeout
    cliConfigTimeoutRef.current = setTimeout(() => {
      console.warn("[App] CLI config check timed out, skipping to prevent hang")
      setCliConfigTimedOut(true)
    }, 5000)
    return () => {
      if (cliConfigTimeoutRef.current) {
        clearTimeout(cliConfigTimeoutRef.current)
      }
    }
  }, [isLoadingCliConfig, cliConfig])

  // Migration: If user already completed Anthropic onboarding but has no billing method set,
  // automatically set it to "claude-subscription" (legacy users before billing method was added)
  useEffect(() => {
    if (!billingMethod && anthropicOnboardingCompleted) {
      setBillingMethod("claude-subscription")
    }
  }, [billingMethod, anthropicOnboardingCompleted, setBillingMethod])

  // Auto-skip onboarding if user has existing CLI config (API key or proxy)
  // This allows users with ANTHROPIC_API_KEY to use the app without OAuth
  useEffect(() => {
    if (cliConfig?.hasConfig && !billingMethod) {
      console.log("[App] Detected existing CLI config, auto-completing onboarding")
      setBillingMethod("api-key")
      setApiKeyOnboardingCompleted(true)
    }
  }, [cliConfig?.hasConfig, billingMethod, setBillingMethod, setApiKeyOnboardingCompleted])

  // If CLI config check timed out, auto-complete onboarding to prevent hang
  // This allows users without CLI config to still enter the app
  useEffect(() => {
    if (cliConfigTimedOut && !billingMethod) {
      console.log("[App] CLI config check timed out, auto-completing onboarding to prevent hang")
      setBillingMethod("api-key")
      setApiKeyOnboardingCompleted(true)
    }
  }, [cliConfigTimedOut, billingMethod, setBillingMethod, setApiKeyOnboardingCompleted])

  // Fetch projects to validate selectedProject exists
  const [projectsTimedOut, setProjectsTimedOut] = useState(false)
  const projectsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery(undefined, {
      retry: false,
    })

  // Set timeout for projects list (5 seconds)
  useEffect(() => {
    if (!isLoadingProjects) return
    projectsTimeoutRef.current = setTimeout(() => {
      console.warn("[App] Projects list timed out, allowing proceed without validation")
      setProjectsTimedOut(true)
    }, 5000)
    return () => {
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current)
      }
    }
  }, [isLoadingProjects])

  // Validated project - only valid if exists in DB
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Determine which page to show:
  // Auth bypass: check if we're in local dev mode, skip all onboarding
  const authBypassActive = typeof window !== "undefined" && 
    window.location.hostname === "localhost"

  if (authBypassActive) {
    // Dev mode: skip all onboarding/login pages and go straight to the app
    return <AgentsLayout />
  }

  // 1. No billing method selected -> BillingMethodPage
  // 2. Claude subscription selected but not completed -> AnthropicOnboardingPage
  // 3. Codex selected but not completed -> CodexOnboardingPage
  // 4. API key or custom model selected but not completed -> ApiKeyOnboardingPage
  // 5. No valid project selected -> SelectRepoPage
  // 6. Otherwise -> AgentsLayout
  if (!billingMethod) {
    return <BillingMethodPage />
  }

  if (billingMethod === "claude-subscription" && !anthropicOnboardingCompleted) {
    return <AnthropicOnboardingPage />
  }

  if (
    (billingMethod === "codex-subscription" ||
      billingMethod === "codex-api-key") &&
    !codexOnboardingCompleted
  ) {
    return <CodexOnboardingPage />
  }

  if (
    (billingMethod === "api-key" || billingMethod === "custom-model") &&
    !apiKeyOnboardingCompleted
  ) {
    return <ApiKeyOnboardingPage />
  }

  // If projects query timed out, skip project validation to prevent hang
  // User can still select a project manually from AgentsLayout
  const skipProjectValidation = projectsTimedOut || !isLoadingProjects && !projects

  if (!validatedProject && !isLoadingProjects && !skipProjectValidation) {
    return <SelectRepoPage />
  }

  return <AgentsLayout />
}

export function App() {
  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics()

    // Sync analytics opt-out status to main process
    const syncOptOutStatus = async () => {
      try {
        const optOut =
          localStorage.getItem("preferences:analytics-opt-out") === "true"
        await window.desktopApi?.setAnalyticsOptOut(optOut)
      } catch (error) {
        console.warn("[Analytics] Failed to sync opt-out status:", error)
      }
    }
    syncOptOutStatus()

    // Identify user if already authenticated
    const identifyUser = async () => {
      try {
        const user = await window.desktopApi?.getUser()
        if (user?.id) {
          identify(user.id, { email: user.email, name: user.name })
        }
      } catch (error) {
        console.warn("[Analytics] Failed to identify user:", error)
      }
    }
    identifyUser()

    // Cleanup on unmount
    return () => {
      shutdown()
    }
  }, [])

  return (
    <WindowProvider>
      <JotaiProvider store={appStore}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <VSCodeThemeProvider>
            <TooltipProvider delayDuration={100}>
              <TRPCProvider>
                <div
                  data-agents-page
                  className="h-screen w-screen bg-background text-foreground overflow-hidden"
                >
                  <AppContent />
                </div>
                <ThemedToaster />
              </TRPCProvider>
            </TooltipProvider>
          </VSCodeThemeProvider>
        </ThemeProvider>
      </JotaiProvider>
    </WindowProvider>
  )
}
