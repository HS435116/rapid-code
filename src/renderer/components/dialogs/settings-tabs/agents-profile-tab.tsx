import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"

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

interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export function AgentsProfileTab() {
  const [user, setUser] = useState<DesktopUser | null>(null)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const isNarrowScreen = useIsNarrowScreen()
  const savedNameRef = useRef("")
  const savedEmailRef = useRef("")

  // Restore saved values from localStorage before API call
  const cachedName = typeof localStorage !== 'undefined' ? localStorage.getItem('profile_cached_name') : null
  const cachedEmail = typeof localStorage !== 'undefined' ? localStorage.getItem('profile_cached_email') : null

  // Force set the email and name — persist so they survive restarts
  useEffect(() => {
    localStorage.setItem('profile_cached_email', 'hs0714@qq.com')
    localStorage.setItem('profile_cached_name', '晨曦微光工作室')
  }, [])

  // Fetch real user data from desktop API
  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser()
        setUser(userData)
        // Always use our cached values, ignore server data for these fields
        const name = '晨曦微光工作室'
        const emailVal = 'hs0714@qq.com'
        setFullName(name)
        setEmail(emailVal)
        savedNameRef.current = name
        savedEmailRef.current = emailVal
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  const handleBlurSave = useCallback(async () => {
    const trimmed = fullName.trim()
    if (trimmed === savedNameRef.current) return
    try {
      if (window.desktopApi?.updateUser) {
        const updatedUser = await window.desktopApi.updateUser({ name: trimmed })
        if (updatedUser) {
          setUser(updatedUser)
          const newName = updatedUser.name || ""
          savedNameRef.current = newName
          setFullName(newName)
          // Cache to localStorage so it survives re-mount
          localStorage.setItem('profile_cached_name', newName)
          toast.success("Name updated")
        } else {
          // API returned no data — keep our local value anyway
          savedNameRef.current = trimmed
          localStorage.setItem('profile_cached_name', trimmed)
        }
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      )
    }
  }, [fullName])

  const handleEmailSave = useCallback(async () => {
    const trimmed = email.trim()
    if (trimmed === savedEmailRef.current) return
    setIsSavingEmail(true)
    try {
      if (window.desktopApi?.updateUser) {
        const updatedUser = await window.desktopApi.updateUser({ email: trimmed })
        if (updatedUser) {
          setUser(updatedUser)
          const newEmail = updatedUser.email || ""
          savedEmailRef.current = newEmail
          setEmail(newEmail)
          // Cache to localStorage so it survives re-mount
          localStorage.setItem('profile_cached_email', newEmail)
          toast.success("Email updated successfully")
        } else {
          // API returned no data — keep our local value anyway
          savedEmailRef.current = trimmed
          localStorage.setItem('profile_cached_email', trimmed)
        }
      }
    } catch (error) {
      console.error("Error updating email:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update email"
      )
    } finally {
      setIsSavingEmail(false)
    }
  }, [email])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Profile Settings Card */}
      <div className="space-y-2">
        {/* Header - hidden on narrow screens since it's in the navigation bar */}
        {!isNarrowScreen && (
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Account</h3>
          </div>
        )}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Full Name Field */}
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Full Name</Label>
              <p className="text-sm text-muted-foreground">
                This is your display name
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={handleBlurSave}
                className="w-full"
                placeholder="Enter your name"
              />
            </div>
          </div>

          {/* Email Field (editable) */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Email</Label>
              <p className="text-sm text-muted-foreground">
                Your account email
              </p>
            </div>
            <div className="flex-shrink-0 w-80 flex items-center gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailSave}
                className="w-full"
                placeholder="Enter your email"
              />
              {isSavingEmail && <IconSpinner className="h-4 w-4 shrink-0" />}
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
