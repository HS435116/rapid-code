/**
 * GitHub 插件目录搜索
 * 通过 GitHub Search API 发现 claude-plugin 主题的仓库
 * 结果缓存 5 分钟以减少 API 调用
 */
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

// ── 类型定义 ──

export interface GitHubPlugin {
  name: string
  fullName: string         // "owner/repo"
  description: string | null
  repoUrl: string
  stars: number
  topics: string[]
  updatedAt: string
  isInstalled: boolean
  installPath?: string     // 已安装时的本地路径
}

interface GitHubSearchResponse {
  items: {
    full_name: string
    name: string
    description: string | null
    html_url: string
    stargazers_count: number
    topics: string[]
    updated_at: string
  }[]
  total_count: number
}

// ── 缓存 ──

interface CacheEntry {
  data: GitHubPlugin[]
  timestamp: number
}

let searchCache: CacheEntry | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

export function clearSearchCache() {
  searchCache = null
}

// ── 已安装插件扫描（复用 discoverInstalledPlugins 逻辑） ──

interface InstalledRef {
  source: string // "marketplace:name"
  name: string
  path: string
}

/**
 * 扫描已安装插件，用于标记 isInstalled
 */
async function scanInstalledPlugins(): Promise<Map<string, InstalledRef>> {
  const map = new Map<string, InstalledRef>()
  const marketplacesDir = path.join(os.homedir(), ".claude", "plugins", "marketplaces")

  try {
    await fs.access(marketplacesDir)
  } catch {
    return map
  }

  const entries = await fs.readdir(marketplacesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (!entry.isDirectory()) continue

    const marketplacePath = path.join(marketplacesDir, entry.name)
    const marketplaceJsonPath = path.join(marketplacePath, ".claude-plugin", "marketplace.json")

    try {
      const content = await fs.readFile(marketplaceJsonPath, "utf-8")
      const json = JSON.parse(content)

      if (!Array.isArray(json.plugins)) continue

      for (const plugin of json.plugins) {
        const sourcePath = typeof plugin.source === "string" ? plugin.source : null
        if (!sourcePath) continue

        const pluginPath = path.resolve(marketplacePath, sourcePath)
        try {
          await fs.stat(pluginPath)
          map.set(plugin.name.toLowerCase(), {
            source: `${json.name}:${plugin.name}`,
            name: plugin.name,
            path: pluginPath,
          })
        } catch {
          // Plugin directory not found
        }
      }
    } catch {
      // No marketplace.json
    }
  }

  return map
}

// ── GitHub API 搜索 ──

/**
 * 从 GitHub 搜索 claude-plugin 主题的仓库
 * @param query 可选搜索关键词（默认搜索 topic:claude-plugin）
 * @param forceRefresh 强制刷新缓存
 */
export async function searchGitHubPlugins(
  query?: string,
  forceRefresh?: boolean,
): Promise<GitHubPlugin[]> {
  // 检查缓存
  if (!forceRefresh && searchCache && Date.now() - searchCache.timestamp < CACHE_TTL_MS) {
    return searchCache.data
  }

  // 构建搜索查询
  const searchQuery = query
    ? `topic:claude-plugin ${query}`
    : "topic:claude-plugin"

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&per_page=50`

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "1Code-App",
    },
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("GitHub API rate limit exceeded. Try again later.")
    }
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const data: GitHubSearchResponse = await response.json()

  // 获取已安装插件列表用于标记
  const installedMap = await scanInstalledPlugins()

  const plugins: GitHubPlugin[] = data.items.map((item) => {
    const nameLower = item.name.toLowerCase()
    const installed = installedMap.get(nameLower)

    return {
      name: item.name,
      fullName: item.full_name,
      description: item.description,
      repoUrl: item.html_url,
      stars: item.stargazers_count,
      topics: item.topics,
      updatedAt: item.updated_at,
      isInstalled: !!installed,
      installPath: installed?.path,
    }
  })

  // 更新缓存
  searchCache = { data: plugins, timestamp: Date.now() }

  return plugins
}

// ── 安装插件 ──

/**
 * 从 GitHub 克隆插件仓库到本地插件目录
 */
export async function installPluginFromGitHub(
  repoUrl: string,
  marketplaceName: string = "community",
): Promise<{ success: boolean; path?: string; error?: string }> {
  // 提取仓库名称
  const repoName = repoUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop()

  if (!repoName) {
    return { success: false, error: "Invalid repository URL" }
  }

  const marketplacesDir = path.join(os.homedir(), ".claude", "plugins", "marketplaces")
  const marketplaceDir = path.join(marketplacesDir, marketplaceName)
  const pluginDir = path.join(marketplaceDir, repoName)
  const claudePluginDir = path.join(marketplaceDir, ".claude-plugin")
  const marketplaceJsonPath = path.join(claudePluginDir, "marketplace.json")

  // 检查是否已存在
  try {
    await fs.stat(pluginDir)
    return { success: false, error: `Plugin "${repoName}" is already installed` }
  } catch {
    // 目录不存在，可以安装
  }

  // 创建目录结构
  await fs.mkdir(claudePluginDir, { recursive: true })

  // 执行 git clone
  const { execSync } = await import("child_process")
  try {
    execSync(`git clone --depth 1 "${repoUrl}" "${pluginDir}"`, {
      stdio: "pipe",
      timeout: 120_000, // 2 分钟超时
    })
  } catch (err: any) {
    // 清理可能的部分下载
    try { await fs.rm(pluginDir, { recursive: true, force: true }) } catch {}
    return {
      success: false,
      error: `Failed to clone repository: ${err.message?.slice(0, 200) || "Unknown error"}`,
    }
  }

  // 更新 marketplace.json
  try {
    let marketplace: { name: string; plugins: any[] }
    try {
      const content = await fs.readFile(marketplaceJsonPath, "utf-8")
      marketplace = JSON.parse(content)
    } catch {
      marketplace = { name: marketplaceName, plugins: [] }
    }

    // 检查是否已存在同名插件
    const existingIndex = marketplace.plugins.findIndex(
      (p) => p.name === repoName,
    )
    const pluginEntry = {
      name: repoName,
      version: "0.0.0",
      description: `Plugin installed from ${repoUrl}`,
      source: repoName,
      homepage: repoUrl,
      tags: ["community-installed"],
    }

    if (existingIndex >= 0) {
      marketplace.plugins[existingIndex] = pluginEntry
    } else {
      marketplace.plugins.push(pluginEntry)
    }

    await fs.writeFile(marketplaceJsonPath, JSON.stringify(marketplace, null, 2), "utf-8")
  } catch (err: any) {
    // marketplace.json 更新失败不阻止安装，但记录警告
    console.warn(`[GitHubCatalog] Failed to update marketplace.json: ${err.message}`)
  }

  // 清除缓存
  clearSearchCache()
  const { clearPluginCache } = await import("./index")
  clearPluginCache()

  return { success: true, path: pluginDir }
}

// ── 卸载插件 ──

/**
 * 从本地卸载插件
 * @param source 插件 source，如 "community:my-plugin"
 */
export async function uninstallPlugin(source: string): Promise<{ success: boolean; error?: string }> {
  const [marketplaceName, pluginName] = source.split(":")
  if (!marketplaceName || !pluginName) {
    return { success: false, error: `Invalid plugin source: "${source}"` }
  }

  const marketplacesDir = path.join(os.homedir(), ".claude", "plugins", "marketplaces")
  const marketplaceDir = path.join(marketplacesDir, marketplaceName)
  const pluginDir = path.join(marketplaceDir, pluginName)

  // 检查插件是否存在
  try {
    await fs.stat(pluginDir)
  } catch {
    return { success: false, error: `Plugin "${pluginName}" not found` }
  }

  // 删除插件目录
  try {
    await fs.rm(pluginDir, { recursive: true, force: true })
  } catch (err: any) {
    return { success: false, error: `Failed to remove plugin: ${err.message}` }
  }

  // 更新 marketplace.json
  const marketplaceJsonPath = path.join(marketplaceDir, ".claude-plugin", "marketplace.json")
  try {
    const content = await fs.readFile(marketplaceJsonPath, "utf-8")
    const marketplace = JSON.parse(content)
    marketplace.plugins = marketplace.plugins.filter(
      (p: any) => p.name !== pluginName && p.source !== pluginName,
    )
    await fs.writeFile(marketplaceJsonPath, JSON.stringify(marketplace, null, 2), "utf-8")
  } catch {
    // marketplace.json 更新失败不阻止卸载
  }

  // 清除缓存
  clearSearchCache()
  const { clearPluginCache } = await import("./index")
  clearPluginCache()

  return { success: true }
}
