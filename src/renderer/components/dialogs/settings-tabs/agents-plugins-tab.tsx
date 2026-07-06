import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSetAtom } from "jotai"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { settingsPluginsSidebarWidthAtom } from "../../../features/agents/atoms"
import { agentsSettingsDialogActiveTabAtom, type SettingsTab } from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Terminal, ChevronRight, Loader2, Search, Github, ExternalLink, Trash2, Download } from "lucide-react"
import { PluginFilledIcon, SkillIconFilled, CustomAgentIconFilled, OriginalMCPIcon } from "../../ui/icons"
import { Button } from "../../ui/button"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../ui/alert-dialog"
import { toast } from "sonner"

/** Format plugin name: "pyright-lsp" → "Pyright Lsp" */
function formatPluginName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PluginComponent {
  name: string
  description?: string
}

interface PluginData {
  name: string
  version: string
  description?: string
  path: string
  source: string
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  isDisabled: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
    mcpServers: string[]
  }
}

interface GitHubPlugin {
  name: string
  fullName: string
  description: string | null
  repoUrl: string
  stars: number
  topics: string[]
  updatedAt: string
  isInstalled: boolean
}

interface McpServerStatus {
  status: string
  needsAuth: boolean
}

// ── Detail Panel ──

function PluginDetail({
  plugin,
  onToggleEnabled,
  isTogglingEnabled,
  onNavigateToTab,
  mcpServerStatuses,
  onMcpAuth,
  isAuthenticating,
  onUninstall,
}: {
  plugin: PluginData
  onToggleEnabled: (enabled: boolean) => void
  isTogglingEnabled: boolean
  onNavigateToTab: (tab: SettingsTab) => void
  mcpServerStatuses: Record<string, McpServerStatus>
  onMcpAuth: (serverName: string) => void
  isAuthenticating: boolean
  onUninstall: () => void
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          {/* Name & category with integrated toggle */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{formatPluginName(plugin.name)}</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    plugin.isDisabled ? "bg-muted-foreground/40" : "bg-emerald-500"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    plugin.isDisabled ? "text-muted-foreground" : "text-emerald-500"
                  )}>
                    {plugin.isDisabled ? "Disabled" : "Active"}
                  </span>
                </div>
                <Switch
                  checked={!plugin.isDisabled}
                  onCheckedChange={onToggleEnabled}
                  disabled={isTogglingEnabled}
                />
              </div>
            </div>
            {plugin.category && (
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{plugin.category}</p>
            )}
          </div>

          {/* Description */}
          {plugin.description && (
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          )}

          {/* Info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Version</Label>
              <p className="text-sm text-foreground font-mono">{plugin.version}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <p className="text-sm text-foreground font-mono">{plugin.source}</p>
            </div>
            {plugin.homepage && (
              <div className="space-y-1.5">
                <Label>Homepage</Label>
                <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-400 hover:underline break-all">{plugin.homepage}</a>
              </div>
            )}
            {plugin.tags && plugin.tags.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1">
                  {plugin.tags.map((tag) => (
                    <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Components — clickable, navigate to respective tabs */}
          {plugin.components.commands.length > 0 && (
            <div className="space-y-1.5">
              <Label>Commands ({plugin.components.commands.length})</Label>
              <div className="space-y-1">
                {plugin.components.commands.map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => onNavigateToTab("skills")}
                    className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 hover:bg-foreground/5 transition-colors cursor-pointer text-left group"
                  >
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">/{cmd.name}</p>
                      {cmd.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{cmd.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.skills.length > 0 && (
            <div className="space-y-1.5">
              <Label>Skills ({plugin.components.skills.length})</Label>
              <div className="space-y-1">
                {plugin.components.skills.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => onNavigateToTab("skills")}
                    className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 hover:bg-foreground/5 transition-colors cursor-pointer text-left group"
                  >
                    <SkillIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">{skill.name}</p>
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{skill.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.agents.length > 0 && (
            <div className="space-y-1.5">
              <Label>Agents ({plugin.components.agents.length})</Label>
              <div className="space-y-1">
                {plugin.components.agents.map((agent) => (
                  <button
                    key={agent.name}
                    onClick={() => onNavigateToTab("agents")}
                    className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 hover:bg-foreground/5 transition-colors cursor-pointer text-left group"
                  >
                    <CustomAgentIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">{agent.name}</p>
                      {agent.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{agent.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.mcpServers.length > 0 && (
            <div className="space-y-1.5">
              <Label>MCP Servers ({plugin.components.mcpServers.length})</Label>
              <div className="space-y-1">
                {plugin.components.mcpServers.map((serverName) => {
                  const serverStatus = mcpServerStatuses[serverName]
                  const needsAuth = serverStatus?.needsAuth
                  const isConnected = serverStatus?.status === "connected"
                  return (
                    <div
                      key={serverName}
                      className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 group"
                    >
                      <OriginalMCPIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <button
                        onClick={() => onNavigateToTab("mcp")}
                        className="min-w-0 flex-1 text-left hover:underline"
                      >
                        <p className="text-xs font-mono font-medium text-foreground">{serverName}</p>
                      </button>
                      {needsAuth ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[11px] shrink-0"
                          disabled={isAuthenticating}
                          onClick={() => onMcpAuth(serverName)}
                        >
                          {isAuthenticating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sign in"}
                        </Button>
                      ) : isConnected ? (
                        <span className="text-[11px] text-emerald-500 shrink-0">Connected</span>
                      ) : serverStatus ? (
                        <span className="text-[11px] text-muted-foreground shrink-0">{serverStatus.status}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Uninstall button */}
          <div className="pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30"
              onClick={onUninstall}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Uninstall Plugin
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar list item ──

function PluginListItem({
  plugin,
  isSelected,
  onSelect,
}: {
  plugin: PluginData
  isSelected: boolean
  onSelect: (source: string) => void
}) {
  return (
    <button
      data-item-id={plugin.source}
      onClick={() => onSelect(plugin.source)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      <div className="text-sm leading-tight truncate">{formatPluginName(plugin.name)}</div>
      {plugin.description && (
        <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
          {plugin.description}
        </div>
      )}
    </button>
  )
}

// ── GitHub Plugin Card (Browse view) ──

function GitHubPluginCard({
  plugin,
  onInstall,
  onInstallUrl,
  isInstalling,
}: {
  plugin: GitHubPlugin
  onInstall: () => void
  onInstallUrl: (url: string) => void
  isInstalling: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 hover:bg-foreground/5 transition-colors">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Github className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{plugin.name}</span>
          <span className="text-[11px] text-muted-foreground/60 truncate">{plugin.fullName}</span>
        </div>
        {plugin.description && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{plugin.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-muted-foreground/60">★ {plugin.stars}</span>
          {plugin.topics.slice(0, 3).map((topic) => (
            <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/70">
              {topic}
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0">
        {plugin.isInstalled ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-emerald-500">Installed</span>
            <a
              href={plugin.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-3 text-[11px]"
            disabled={isInstalling}
            onClick={onInstall}
          >
            {isInstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            Install
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──

export function AgentsPluginsTab() {
  const [selectedPluginSource, setSelectedPluginSource] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const setActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // View mode: "installed" | "browse"
  const [viewMode, setViewMode] = useState<"installed" | "browse">("installed")

  // GitHub search
  const [gitHubQuery, setGitHubQuery] = useState("")
  const githubSearchInputRef = useRef<HTMLInputElement>(null)

  // Custom install URL
  const [customInstallUrl, setCustomInstallUrl] = useState("")
  const [isCustomInstalling, setIsCustomInstalling] = useState(false)

  // Uninstall confirm dialog
  const [uninstallTarget, setUninstallTarget] = useState<PluginData | null>(null)

  // Focus search on "/" hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        if (viewMode === "browse") {
          githubSearchInputRef.current?.focus()
        } else {
          searchInputRef.current?.focus()
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [viewMode])

  const { data: plugins = [], isLoading, refetch } = trpc.plugins.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  // GitHub browse query - always fetch full catalog, filter locally
  const {
    data: gitHubPlugins = [],
    isLoading: isBrowseLoading,
    refetch: refetchBrowse,
  } = trpc.plugins.browseGitHub.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  )

  // MCP server statuses
  const { data: allMcpConfig, refetch: refetchMcp } = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const mcpServerStatuses = useMemo(() => {
    const map: Record<string, McpServerStatus> = {}
    if (!allMcpConfig?.groups) return map
    for (const group of allMcpConfig.groups) {
      for (const server of group.mcpServers) {
        map[server.name] = { status: server.status, needsAuth: server.needsAuth }
      }
    }
    return map
  }, [allMcpConfig])

  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const handleMcpAuth = useCallback(async (serverName: string) => {
    try {
      const result = await startOAuthMutation.mutateAsync({
        serverName,
        projectPath: "__global__",
      })
      if (result.success) {
        toast.success(`${serverName} authenticated`)
        await refetchMcp()
      } else {
        toast.error(result.error || "Authentication failed")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed")
    }
  }, [startOAuthMutation, refetchMcp])

  const setPluginEnabledMutation = trpc.claudeSettings.setPluginEnabled.useMutation()

  // Install plugin mutation
  const installPluginMutation = trpc.plugins.installPlugin.useMutation()

  // Uninstall plugin mutation
  const uninstallPluginMutation = trpc.plugins.uninstallPlugin.useMutation()

  // ── Filter installed plugins ──
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return plugins
    const q = searchQuery.toLowerCase()
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return plugins.filter((p) => {
      const name = p.name.toLowerCase()
      if (name.includes(q) || name.includes(qNoDashes) || name.includes(qWithDashes)) return true
      if (p.source.toLowerCase().includes(q)) return true
      if (p.marketplace.toLowerCase().includes(q)) return true
      if (p.description?.toLowerCase().includes(q)) return true
      if (p.path.toLowerCase().includes(q)) return true
      if (p.components.commands.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.skills.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.agents.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.mcpServers.some((s) => s.toLowerCase().includes(q))) return true
      return false
    })
  }, [plugins, searchQuery])

  const enabledPlugins = filteredPlugins.filter((p) => !p.isDisabled)
  const disabledPlugins = filteredPlugins.filter((p) => p.isDisabled)

  const marketplaceGroups = useMemo(() => {
    const groups = new Map<string, PluginData[]>()
    for (const plugin of disabledPlugins) {
      const existing = groups.get(plugin.marketplace) || []
      existing.push(plugin)
      groups.set(plugin.marketplace, existing)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [disabledPlugins])

  const allPluginSources = useMemo(
    () => [
      ...enabledPlugins.map((p) => p.source),
      ...marketplaceGroups.flatMap(([, pList]) => pList.map((p) => p.source)),
    ],
    [enabledPlugins, marketplaceGroups]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allPluginSources,
    selectedItem: selectedPluginSource,
    onSelect: setSelectedPluginSource,
  })

  const selectedPlugin = plugins.find((p) => p.source === selectedPluginSource) || null

  // Auto-select first plugin
  useEffect(() => {
    if (selectedPluginSource || isLoading || plugins.length === 0) return
    const first = enabledPlugins[0] || marketplaceGroups[0]?.[1]?.[0]
    if (first) setSelectedPluginSource(first.source)
  }, [plugins, selectedPluginSource, isLoading, enabledPlugins, marketplaceGroups])

  const approveAllMutation = trpc.claudeSettings.approveAllPluginMcpServers.useMutation()
  const revokeAllMutation = trpc.claudeSettings.revokeAllPluginMcpServers.useMutation()

  const handleToggleEnabled = useCallback(async (plugin: PluginData, enabled: boolean) => {
    try {
      await setPluginEnabledMutation.mutateAsync({
        pluginSource: plugin.source,
        enabled,
      })
      if (plugin.components.mcpServers.length > 0) {
        if (enabled) {
          await approveAllMutation.mutateAsync({
            pluginSource: plugin.source,
            serverNames: plugin.components.mcpServers,
          })
        } else {
          await revokeAllMutation.mutateAsync({
            pluginSource: plugin.source,
          })
        }
      }
      toast.success(enabled ? "Plugin enabled" : "Plugin disabled", {
        description: formatPluginName(plugin.name),
      })
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update plugin"
      toast.error(message)
    }
  }, [setPluginEnabledMutation, approveAllMutation, revokeAllMutation, refetch])

  // ── Install handler ──
  const [installingRepo, setInstallingRepo] = useState<string | null>(null)

  const handleInstall = useCallback(async (repoUrl: string) => {
    setInstallingRepo(repoUrl)
    try {
      const result = await installPluginMutation.mutateAsync({
        repoUrl,
        marketplaceName: "community",
      })
      if (result.success) {
        toast.success("Plugin installed successfully")
        await refetch()
        await refetchBrowse()
      } else {
        toast.error(result.error || "Failed to install plugin")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to install plugin")
    } finally {
      setInstallingRepo(null)
    }
  }, [installPluginMutation, refetch, refetchBrowse])

  // ── Uninstall handler ──
  const handleUninstallConfirm = useCallback(async () => {
    if (!uninstallTarget) return
    try {
      const result = await uninstallPluginMutation.mutateAsync({
        source: uninstallTarget.source,
      })
      if (result.success) {
        toast.success("Plugin uninstalled")
        setUninstallTarget(null)
        setSelectedPluginSource(null)
        await refetch()
        await refetchBrowse()
      } else {
        toast.error(result.error || "Failed to uninstall plugin")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to uninstall plugin")
    }
  }, [uninstallTarget, uninstallPluginMutation, refetch, refetchBrowse])

  // ── Custom URL install ──
  const handleCustomInstall = useCallback(async () => {
    if (!customInstallUrl.trim()) return
    setIsCustomInstalling(true)
    await handleInstall(customInstallUrl.trim())
    setCustomInstallUrl("")
    setIsCustomInstalling(false)
  }, [customInstallUrl, handleInstall])

  // ── Filter GitHub plugins by local search ──
  const filteredGitHubPlugins = useMemo(() => {
    if (!gitHubQuery.trim()) return gitHubPlugins
    const q = gitHubQuery.toLowerCase()
    return gitHubPlugins.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.fullName.toLowerCase().includes(q)) return true
      if (p.description?.toLowerCase().includes(q)) return true
      if (p.topics.some((t) => t.toLowerCase().includes(q))) return true
      return false
    })
  }, [gitHubPlugins, gitHubQuery])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsPluginsSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          {/* View mode tabs */}
          <div className="flex-shrink-0 flex border-b border-border">
            <button
              onClick={() => setViewMode("installed")}
              className={cn(
                "flex-1 text-xs font-medium py-2 px-3 transition-colors",
                viewMode === "installed"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Installed
            </button>
            <button
              onClick={() => setViewMode("browse")}
              className={cn(
                "flex-1 text-xs font-medium py-2 px-3 transition-colors",
                viewMode === "browse"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Browse
            </button>
          </div>

          {viewMode === "installed" ? (
            <>
              {/* Search */}
              <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
                <input
                  ref={searchInputRef}
                  placeholder="Search plugins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={listKeyDown}
                  className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
                />
              </div>
              {/* Plugin list */}
              <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  </div>
                ) : plugins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <PluginFilledIcon className="h-8 w-8 text-border mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">No plugins</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      Install plugins to ~/.claude/plugins/
                    </p>
                  </div>
                ) : filteredPlugins.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-muted-foreground">No results found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {enabledPlugins.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                          Enabled
                        </p>
                        <div className="space-y-0.5">
                          {enabledPlugins.map((plugin) => (
                            <PluginListItem
                              key={plugin.source}
                              plugin={plugin}
                              isSelected={selectedPluginSource === plugin.source}
                              onSelect={setSelectedPluginSource}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {marketplaceGroups.map(([marketplace, groupPlugins]) => (
                      <div key={marketplace}>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                          {marketplace}
                        </p>
                        <div className="space-y-0.5">
                          {groupPlugins.map((plugin) => (
                            <PluginListItem
                              key={plugin.source}
                              plugin={plugin}
                              isSelected={selectedPluginSource === plugin.source}
                              onSelect={setSelectedPluginSource}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Browse view */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* GitHub search */}
              <div className="px-2 pt-2 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <input
                    ref={githubSearchInputRef}
                    placeholder="Search GitHub plugins..."
                    value={gitHubQuery}
                    onChange={(e) => setGitHubQuery(e.target.value)}
                    className="h-7 w-full rounded-lg text-sm bg-muted border border-input pl-8 pr-3 placeholder:text-muted-foreground/40 outline-none"
                  />
                </div>
              </div>

              {/* GitHub plugin list */}
              <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
                {isBrowseLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredGitHubPlugins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Github className="h-8 w-8 text-border mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">
                      {gitHubQuery.trim() ? "No plugins found" : "No plugins available"}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {gitHubQuery.trim()
                        ? "Try a different search term"
                        : "Browse GitHub repositories with topic:claude-plugin"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredGitHubPlugins.map((plugin) => (
                      <GitHubPluginCard
                        key={plugin.repoUrl}
                        plugin={plugin}
                        onInstall={() => handleInstall(plugin.repoUrl)}
                        onInstallUrl={handleInstall}
                        isInstalling={installingRepo === plugin.repoUrl}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Custom install URL */}
              <div className="flex-shrink-0 border-t border-border px-2 py-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Install from GitHub URL
                </p>
                <div className="flex gap-1.5">
                  <input
                    placeholder="https://github.com/user/repo"
                    value={customInstallUrl}
                    onChange={(e) => setCustomInstallUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCustomInstall() }}
                    className="h-7 flex-1 rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none font-mono text-[11px]"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2.5 text-[11px] shrink-0"
                    disabled={isCustomInstalling || !customInstallUrl.trim()}
                    onClick={handleCustomInstall}
                  >
                    {isCustomInstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                    Install
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </ResizableSidebar>

      {/* Right content - detail panel */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {viewMode === "installed" && selectedPlugin ? (
          <PluginDetail
            plugin={selectedPlugin}
            onToggleEnabled={(enabled) => handleToggleEnabled(selectedPlugin, enabled)}
            isTogglingEnabled={setPluginEnabledMutation.isPending}
            onNavigateToTab={setActiveTab}
            mcpServerStatuses={mcpServerStatuses}
            onMcpAuth={handleMcpAuth}
            isAuthenticating={startOAuthMutation.isPending}
            onUninstall={() => setUninstallTarget(selectedPlugin)}
          />
        ) : viewMode === "installed" ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <PluginFilledIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {plugins.length > 0
                ? "Select a plugin to view details"
                : "No plugins installed"}
            </p>
            {plugins.length === 0 && (
              <p className="text-xs text-muted-foreground/70 mt-2">
                Switch to "Browse" tab to find and install plugins
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Github className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              Browse & install plugins from GitHub
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Search results show repositories tagged with "claude-plugin"
            </p>
          </div>
        )}
      </div>

      {/* Uninstall confirmation dialog */}
      <AlertDialog open={!!uninstallTarget} onOpenChange={(open) => { if (!open) setUninstallTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall Plugin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to uninstall <strong>{uninstallTarget?.name}</strong>?
              This will remove the plugin directory and its files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUninstallConfirm}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={uninstallPluginMutation.isPending}
            >
              {uninstallPluginMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Uninstalling...</>
              ) : (
                "Uninstall"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
