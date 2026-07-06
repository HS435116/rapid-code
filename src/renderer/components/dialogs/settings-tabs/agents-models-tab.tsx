import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Check, ChevronDown, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexApiKeyAtom,
  codexLoginModalOpenAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  customModelsEnabledAtom,
  hiddenModelsAtom,
  modelProfilesAtom,
  activeProfileIdAtom,
  type ModelProfile,
  normalizeCodexApiKey,
  openaiApiKeyAtom,
  type CustomClaudeConfig,
} from "../../../lib/atoms"
import { ClaudeCodeIcon, CodexIcon, SearchIcon } from "../../ui/icons"
import { CLAUDE_MODELS, CODEX_MODELS } from "../../../features/agents/lib/models"
import { trpc } from "../../../lib/trpc"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

// Account row component
function AccountRow({
  account,
  isActive,
  onSetActive,
  onRename,
  onRemove,
  isLoading,
}: {
  account: {
    id: string
    displayName: string | null
    email: string | null
    connectedAt: string | null
  }
  isActive: boolean
  onSetActive: () => void
  onRename: () => void
  onRemove: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-sm font-medium">
            {account.displayName || "Anthropic Account"}
          </div>
          {account.email && (
            <div className="text-xs text-muted-foreground">{account.email}</div>
          )}
          {!account.email && account.connectedAt && (
            <div className="text-xs text-muted-foreground">
              Connected{" "}
              {new Date(account.connectedAt).toLocaleDateString(undefined, {
                dateStyle: "short",
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            disabled={isLoading}
          >
            Switch
          </Button>
        )}
        {isActive && (
          <Badge variant="secondary" className="text-xs">
            Active
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchList } =
    trpc.anthropicAccounts.list.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const trpcUtils = trpc.useUtils()

  // Auto-migrate legacy account if needed
  const migrateLegacy = trpc.anthropicAccounts.migrateLegacy.useMutation({
    onSuccess: async () => {
      await refetchList()
      await refetchActive()
    },
  })

  // Trigger migration if: no accounts, not loading, has legacy connection, not already migrating
  useEffect(() => {
    if (
      !isAccountsLoading &&
      accounts?.length === 0 &&
      claudeCodeIntegration?.isConnected &&
      !migrateLegacy.isPending &&
      !migrateLegacy.isSuccess
    ) {
      migrateLegacy.mutate()
    }
  }, [isAccountsLoading, accounts, claudeCodeIntegration, migrateLegacy])

  const setActiveMutation = trpc.anthropicAccounts.setActive.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account switched")
    },
    onError: (err) => {
      toast.error(`Failed to switch account: ${err.message}`)
    },
  })

  const renameMutation = trpc.anthropicAccounts.rename.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      toast.success("Account renamed")
    },
    onError: (err) => {
      toast.error(`Failed to rename account: ${err.message}`)
    },
  })

  const removeMutation = trpc.anthropicAccounts.remove.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account removed")
    },
    onError: (err) => {
      toast.error(`Failed to remove account: ${err.message}`)
    },
  })

  const handleRename = (accountId: string, currentName: string | null) => {
    const newName = window.prompt(
      "Enter new name for this account:",
      currentName || "Anthropic Account"
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${displayName || "this account"}"? You will need to re-authenticate to use it again.`
    )
    if (confirmed) {
      removeMutation.mutate({ accountId })
    }
  }

  const isLoading =
    setActiveMutation.isPending ||
    renameMutation.isPending ||
    removeMutation.isPending

  // Don't show section if no accounts
  if (!isAccountsLoading && (!accounts || accounts.length === 0)) {
    return null
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
        {isAccountsLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading accounts...
          </div>
        ) : (
          accounts?.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={activeAccount?.id === account.id}
              onSetActive={() => setActiveMutation.mutate({ accountId: account.id })}
              onRename={() => handleRename(account.id, account.displayName)}
              onRemove={() => handleRemove(account.id, account.displayName)}
              isLoading={isLoading}
            />
          ))
        )}
    </div>
  )
}

export function AgentsModelsTab() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const setClaudeLoginModalConfig = useSetAtom(claudeLoginModalConfigAtom)
  const setClaudeLoginModalOpen = useSetAtom(agentsLoginModalOpenAtom)
  const setCodexLoginModalOpen = useSetAtom(codexLoginModalOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected
  const { data: codexIntegration, isLoading: isCodexLoading } =
    trpc.codex.getIntegration.useQuery()

  // OpenAI API key state
  const [storedCodexApiKey, setStoredCodexApiKey] = useAtom(codexApiKeyAtom)
  const [codexApiKey, setCodexApiKey] = useState(storedCodexApiKey)
  const [isSavingCodexApiKey, setIsSavingCodexApiKey] = useState(false)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const codexOnboardingAuthMethod = useAtomValue(codexOnboardingAuthMethodAtom)
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const codexLogoutMutation = trpc.codex.logout.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  useEffect(() => {
    setCodexApiKey(storedCodexApiKey)
  }, [storedCodexApiKey])

  const savedConfigRef = useRef(storedConfig)

  // === Custom Model Profiles ===
  const [profiles, setProfiles] = useAtom(modelProfilesAtom)
  const [activeProfileId, setActiveProfileId] = useAtom(activeProfileIdAtom)
  const [editingProfile, setEditingProfile] = useState<ModelProfile | null>(null)
  const [isAddingProfile, setIsAddingProfile] = useState(false)

  // Profile form state
  const [editJson, setEditJson] = useState("")
  const [editName, setEditName] = useState("")
  const [editModel, setEditModel] = useState("")
  const [editToken, setEditToken] = useState("")
  const [editBaseUrl, setEditBaseUrl] = useState("")
  const [jsonError, setJsonError] = useState("")

  const openProfileEditor = (profile?: ModelProfile) => {
    if (profile) {
      setEditingProfile(profile)
      setEditName(profile.name)
      setEditModel(profile.config.model)
      setEditToken(profile.config.token)
      setEditBaseUrl(profile.config.baseUrl)
      setEditJson(profile.requestTemplate || "")
      setIsAddingProfile(false)
      setJsonError("")
    } else {
      setEditingProfile(null)
      setEditName("")
      setEditModel("")
      setEditToken("")
      setEditBaseUrl("")
      setEditJson("")
      setIsAddingProfile(true)
      setJsonError("")
    }
  }

  const handleJsonChange = (value: string) => {
    setEditJson(value)
    try {
      const data = JSON.parse(value)
      setEditName(data.name || "")
      setEditModel(data.model || "")
      setEditToken(data.token || "")
      setEditBaseUrl(data.baseUrl || "")
      setJsonError("")
    } catch (e: any) {
      if (value.trim()) {
        setJsonError(`JSON error: ${e.message}`)
      } else {
        setJsonError("")
      }
    }
  }

  const saveProfile = () => {
    const name = editName.trim()
    const model = editModel.trim()
    const token = editToken.trim()
    const baseUrl = editBaseUrl.trim()
    if (!name || !model || !token || !baseUrl) {
      toast.error("Please fill in: name, model, API key, base URL")
      return
    }

    if (isAddingProfile) {
      const newProfile: ModelProfile = {
        id: `custom-${Date.now()}`,
        name,
        config: { model, token, baseUrl },
        rawJson: editJson,
        requestTemplate: editJson || undefined,
      }
      setProfiles([...profiles, newProfile])
    } else if (editingProfile) {
      setProfiles(
        profiles.map((p) =>
          p.id === editingProfile.id
            ? { ...p, name, config: { model, token, baseUrl }, rawJson: editJson, requestTemplate: editJson || undefined }
            : p,
        ),
      )
    }
    setIsAddingProfile(false)
    setEditingProfile(null)
    toast.success(isAddingProfile ? "Custom model added" : "Custom model updated")
  }

  const deleteProfile = (id: string) => {
    if (activeProfileId === id) setActiveProfileId(null)
    setProfiles(profiles.filter((p) => p.id !== id))
    toast.success("Custom model removed")
  }

  const customProfiles = profiles.filter((p) => !p.isOffline)
  const [customModelsEnabled, setCustomModelsEnabled] = useAtom(customModelsEnabledAtom)
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null)
  const [testingMap, setTestingMap] = useState<Record<string, "testing" | "success" | "failed">>({})

  const copyProfileJson = (profile: ModelProfile) => {
    const json = JSON.stringify({ name: profile.name, model: profile.config.model, token: profile.config.token, baseUrl: profile.config.baseUrl }, null, 2)
    navigator.clipboard.writeText(json)
    setCopiedProfileId(profile.id)
    setTimeout(() => setCopiedProfileId(null), 2000)
  }

  const testConnectionMutation = trpc.openai.test.useMutation()

  const testConnection = async (profile: ModelProfile) => {
    setTestingMap(prev => ({ ...prev, [profile.id]: "testing" }))
    try {
      console.log(`[Test] Testing: ${profile.name} (${profile.config.baseUrl})`)
      const result = await testConnectionMutation.mutateAsync({
        model: profile.config.model,
        token: profile.config.token,
        baseUrl: profile.config.baseUrl,
        requestTemplate: profile.requestTemplate,
      })
      console.log(`[Test] Result:`, result)
      setTestingMap(prev => ({ ...prev, [profile.id]: result.ok ? "success" : "failed" }))
      if (!result.ok) {
        console.warn(`[Test] Connection failed:`, result)
      }
    } catch (err) {
      console.error(`[Test] Error:`, err)
      setTestingMap(prev => ({ ...prev, [profile.id]: "failed" }))
    }
    // 8秒后清除状态，可再次测试
    setTimeout(() => {
      setTestingMap(prev => {
        const next = { ...prev }
        delete next[profile.id]
        return next
      })
    }, 5000)
  }

  const handleBlurSave = useCallback(() => {
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedToken = token.trim()

    // Only save if all fields are filled
    if (trimmedModel && trimmedBaseUrl && trimmedToken) {
      const next: CustomClaudeConfig = {
        model: trimmedModel,
        token: trimmedToken,
        baseUrl: trimmedBaseUrl,
      }
      if (
        next.model !== savedConfigRef.current.model ||
        next.token !== savedConfigRef.current.token ||
        next.baseUrl !== savedConfigRef.current.baseUrl
      ) {
        setStoredConfig(next)
        savedConfigRef.current = next
      }
    } else if (!trimmedModel && !trimmedBaseUrl && !trimmedToken) {
      // All cleared — reset
      if (savedConfigRef.current.model || savedConfigRef.current.token || savedConfigRef.current.baseUrl) {
        setStoredConfig(EMPTY_CONFIG)
        savedConfigRef.current = EMPTY_CONFIG
      }
    }
  }, [model, baseUrl, token, setStoredConfig])

  const handleReset = () => {
    setStoredConfig(EMPTY_CONFIG)
    savedConfigRef.current = EMPTY_CONFIG
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const canReset = Boolean(model.trim() || baseUrl.trim() || token.trim())

  const handleClaudeCodeSetup = () => {
    setClaudeLoginModalConfig({
      hideCustomModelSettingsLink: true,
      autoStartAuth: true,
    })
    setClaudeLoginModalOpen(true)
  }

  const handleCodexSetup = () => {
    setCodexLoginModalOpen(true)
  }

  const handleCodexLogout = async () => {
    const confirmed = window.confirm(
      "Log out from Codex on this device?",
    )
    if (!confirmed) return

    try {
      await codexLogoutMutation.mutateAsync()
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex disconnected")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect Codex"
      toast.error(message)
    }
  }

  const normalizedStoredCodexApiKey = normalizeCodexApiKey(storedCodexApiKey)
  const hasAppCodexApiKey = Boolean(normalizedStoredCodexApiKey)
  const hasLocalCodexSubscription =
    codexOnboardingCompleted && codexOnboardingAuthMethod === "chatgpt"
  const isCodexSubscriptionConnected =
    codexIntegration?.state === "connected_chatgpt" ||
    (!codexIntegration && hasLocalCodexSubscription)
  const isCodexSubscriptionActive =
    isCodexSubscriptionConnected && !hasAppCodexApiKey
  const [hiddenModels, setHiddenModels] = useAtom(hiddenModelsAtom)

  const toggleModelVisibility = useCallback((modelId: string) => {
    setHiddenModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      return [...prev, modelId]
    })
  }, [setHiddenModels])

  const codexConnectionText = isCodexSubscriptionConnected
    ? "Connected via ChatGPT"
    : codexIntegration?.state === "connected_api_key"
      ? "Not connected to subscription"
      : codexIntegration?.state === "not_logged_in"
        ? "Not connected"
        : "Status unavailable"
  const showCodexLoading =
    isCodexLoading && !hasAppCodexApiKey && !hasLocalCodexSubscription

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleCodexApiKeyBlur = async () => {
    const trimmedKey = codexApiKey.trim()

    if (trimmedKey === storedCodexApiKey) return
    if (!trimmedKey) return

    const normalized = normalizeCodexApiKey(trimmedKey)
    if (!normalized) {
      toast.error("Invalid Codex API key format. Key should start with 'sk-'")
      setCodexApiKey(storedCodexApiKey)
      return
    }

    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey(normalized)
      setCodexApiKey(normalized)
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex API key saved")
    } catch {
      toast.error("Failed to save Codex API key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleRemoveCodexApiKey = async () => {
    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey("")
      setCodexApiKey("")

      if (codexIntegration?.state === "connected_api_key") {
        await codexLogoutMutation.mutateAsync().catch(() => {
          toast.error("Codex API key removed, but failed to log out Codex CLI")
        })
      }

      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex API key removed")
    } catch {
      toast.error("Failed to remove Codex API key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey === storedOpenAIKey) return // No change
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  // All models merged into one list for the top section
  const allModels = useMemo(() => {
    const items: { id: string; name: string; provider: "claude" | "codex" }[] = []
    for (const m of CLAUDE_MODELS) {
      items.push({ id: m.id, name: `${m.name} ${m.version}`, provider: "claude" })
    }
    for (const m of CODEX_MODELS) {
      items.push({ id: m.id, name: m.name, provider: "codex" })
    }
    return items
  }, [])

  const [modelSearch, setModelSearch] = useState("")
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return allModels
    const q = modelSearch.toLowerCase().trim()
    return allModels.filter((m) => m.name.toLowerCase().includes(q))
  }, [allModels, modelSearch])

  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
        </div>
      )}

      {/* ===== Models Section ===== */}
      <div className="space-y-2">
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Search */}
          <div className="px-1.5 pt-1.5 pb-0.5">
            <div className="flex items-center gap-1.5 h-7 px-1.5 rounded-md bg-muted/50">
              <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Add or search model"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Model list */}
          <div className="divide-y divide-border">
            {filteredModels.map((m) => {
              const isEnabled = !hiddenModels.includes(m.id)
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    {m.provider === "claude" ? (
                      <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <CodexIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleModelVisibility(m.id)}
                  />
                </div>
              )
            })}
            {filteredModels.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Accounts Section ===== */}
      <div className="space-y-2">
        {/* Anthropic Accounts */}
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Anthropic Accounts
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your Claude API accounts
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClaudeCodeSetup}
            disabled={isClaudeCodeLoading}
          >
            <Plus className="h-3 w-3 mr-1" />
            {isClaudeCodeConnected ? "Add" : "Connect"}
          </Button>
        </div>

        <AnthropicAccountsSection />
      </div>

      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Codex Account
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your Codex account
            </p>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
          {showCodexLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading account...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-6 p-4 hover:bg-muted/50">
                <div>
                  <div className="text-sm font-medium">Codex Subscription</div>
                  <div className="text-xs text-muted-foreground">
                    {codexConnectionText}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCodexSubscriptionActive && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                  {isCodexSubscriptionConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexLogout()}
                      disabled={codexLogoutMutation.isPending}
                    >
                      {codexLogoutMutation.isPending ? "..." : "Logout"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexSetup()}
                      disabled={
                        isCodexLoading ||
                        codexLogoutMutation.isPending ||
                        isSavingCodexApiKey
                      }
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Custom Models Section ===== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Custom Models</h3>
              <p className="text-xs text-muted-foreground">
                Add third-party API models (OpenAI, OpenRouter, or custom endpoints)
              </p>
            </div>
            <Switch
              checked={customModelsEnabled}
              onCheckedChange={setCustomModelsEnabled}
              aria-label="Toggle custom models"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openProfileEditor()}
            disabled={!customModelsEnabled}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Model
          </Button>
        </div>

        {!customModelsEnabled && customProfiles.length > 0 && (
          <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
            Custom models are disabled. Toggle the switch above to enable them in the chat model selector.
          </div>
        )}

        {/* Profile List */}
        {customProfiles.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
            No custom models configured. Click "Add Model" to add one.
          </div>
        ) : (
          <div className="space-y-2">
            {customProfiles.map((profile) => {
              const isActive = activeProfileId === profile.id
              const testStatus = testingMap[profile.id]
              return (
                <div
                  key={profile.id}
                  className={`relative flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isActive
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{profile.name}</span>
                      {testStatus === "success" && (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Connected" />
                      )}
                      {testStatus === "failed" && (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Connection failed" />
                      )}
                      {testStatus === "testing" && (
                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" title="Testing..." />
                      )}
                      {isActive && (
                        <Badge variant="default" className="text-[10px] h-4 px-1.5">Active</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {profile.config.model}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">
                      {profile.config.baseUrl}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono opacity-60">
                      {profile.config.token.slice(0, 12)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setActiveProfileId(profile.id)}
                      >
                        Use
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => setActiveProfileId(null)}
                      >
                        Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openProfileEditor(profile)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => copyProfileJson(profile)}
                      title="Copy as JSON"
                    >
                      {copiedProfileId === profile.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${testingMap[profile.id] === "testing" ? "text-yellow-500" : "text-muted-foreground hover:text-green-500"}`}
                      onClick={() => testConnection(profile)}
                      disabled={testingMap[profile.id] === "testing"}
                      title="Test connection"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => deleteProfile(profile.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add/Edit Profile Dialog */}
        {(isAddingProfile || editingProfile) && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
            <h4 className="text-sm font-medium">
              {isAddingProfile ? "Add Custom Model" : "Edit Custom Model"}
            </h4>

            {/* Profile Name */}
            <div>
              <Label className="text-xs">Profile Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1"
                placeholder="e.g. My API Model"
              />
            </div>

            {/* Model + Base URL + Token */}
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label className="text-xs">Model</Label>
                <Input
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="agnes-2.0-flash"
                />
              </div>
              <div>
                <Label className="text-xs">API Token</Label>
                <Input
                  type="password"
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>

            {/* Request JSON Template */}
            <div>
              <Label className="text-xs">
                Request JSON Template <span className="text-muted-foreground">(use {'{user_input}'} for message)</span>
              </Label>
              <textarea
                className="w-full h-32 font-mono text-xs p-2 border border-border rounded-md bg-background resize-y mt-1"
                placeholder='{
  "model": "agnes-2.0-flash",
  "messages": [
    {"role": "system", "content": "You are helpful"},
    {"role": "user", "content": "{user_input}"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}'
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsAddingProfile(false); setEditingProfile(null) }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveProfile}
              >
                {isAddingProfile ? "Add" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ===== API Keys Section (Collapsible) ===== */}
      <Collapsible open={isApiKeysOpen} onOpenChange={setIsApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          <ChevronDown className={`h-4 w-4 transition-transform ${isApiKeysOpen ? "" : "-rotate-90"}`} />
          API Keys
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* Codex API Key */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Codex API Key</Label>
                  {hasAppCodexApiKey && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Takes priority over subscription
                </p>
              </div>
              <div className="flex-shrink-0 w-80 flex items-center gap-2">
                <Input
                  type="password"
                  value={codexApiKey}
                  onChange={(e) => setCodexApiKey(e.target.value)}
                  onBlur={handleCodexApiKeyBlur}
                  className="w-full font-mono"
                  placeholder="sk-..."
                />
                {hasAppCodexApiKey && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleRemoveCodexApiKey()}
                    disabled={isSavingCodexApiKey}
                    aria-label="Remove Codex API key"
                    className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* OpenAI API Key for Voice Input */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">OpenAI API Key</Label>
                  {canResetOpenAI && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetOpenAI}
                      disabled={setOpenAIKeyMutation.isPending}
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription (Whisper API)
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onBlur={handleSaveOpenAI}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          {/* Override Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                Override Model
              </h4>
              {canReset && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10">
                  Reset
                </Button>
              )}
            </div>
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <Label className="text-sm font-medium">Model name</Label>
                  <p className="text-xs text-muted-foreground">
                    Model identifier to use for requests
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="claude-3-7-sonnet-20250219"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">API token</Label>
                  <p className="text-xs text-muted-foreground">
                    ANTHROPIC_AUTH_TOKEN env
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="sk-ant-..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">Base URL</Label>
                  <p className="text-xs text-muted-foreground">
                    ANTHROPIC_BASE_URL env
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="https://api.anthropic.com"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
