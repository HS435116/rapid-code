/**
 * Beta 设置页 — 实验性功能 + 更新通道
 */
import { useState, useEffect, useCallback } from "react"
import { useAtom } from "jotai"
import { betaKanbanEnabledAtom } from "../../../lib/atoms"
import { Switch } from "../../ui/switch"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"

export function AgentsBetaTab() {
  const [betaKanbanEnabled, setBetaKanbanEnabled] = useAtom(betaKanbanEnabledAtom)
  const [updateChannel, setUpdateChannel] = useState<"latest" | "beta">("latest")
  const [isLoadingChannel, setIsLoadingChannel] = useState(true)

  // Load current update channel from backend
  useEffect(() => {
    async function loadChannel() {
      try {
        const channel = await window.desktopApi?.getUpdateChannel?.()
        if (channel === "beta" || channel === "latest") {
          setUpdateChannel(channel)
        }
      } catch {
        // Ignore
      }
      setIsLoadingChannel(false)
    }
    loadChannel()
  }, [])

  const handleChannelChange = useCallback(async (useBeta: boolean) => {
    const newChannel = useBeta ? "beta" : "latest"
    try {
      const success = await window.desktopApi?.setUpdateChannel?.(newChannel)
      if (success) {
        setUpdateChannel(newChannel)
        toast.success(
          useBeta
            ? "Beta updates enabled"
            : "Stable updates only",
          {
            description: useBeta
              ? "You will receive beta releases with new features"
              : "You will only receive stable releases",
          },
        )
      }
    } catch (error) {
      toast.error("Failed to change update channel")
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Beta Features Card */}
      <div className="space-y-2">
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Update Channel */}
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Beta Updates</Label>
              <p className="text-sm text-muted-foreground">
                Receive beta releases with the latest features before they are released to stable
              </p>
            </div>
            <div className="flex-shrink-0">
              {isLoadingChannel ? (
                <IconSpinner className="h-4 w-4" />
              ) : (
                <Switch
                  checked={updateChannel === "beta"}
                  onCheckedChange={handleChannelChange}
                />
              )}
            </div>
          </div>

          {/* Kanban Beta Feature */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Kanban Board</Label>
              <p className="text-sm text-muted-foreground">
                Enable the Kanban board view for task management (experimental)
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={betaKanbanEnabled}
                onCheckedChange={setBetaKanbanEnabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
