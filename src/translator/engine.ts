/**
 * 翻译引擎 - 生成注入到渲染进程的 JS 代码
 */
import { zhDict } from "./dictionary"

/**
 * 生成本地化引擎 JS 代码（注入到渲染进程 main world 执行）
 */
export function generateEngineCode(): string {
  const dictJson = JSON.stringify(zhDict)

  return `
(function() {
  'use strict';

  // ========== 词典 ==========
  const dict = ${dictJson};
  const STORAGE_KEY = '1code_language';
  const ATTR_TRANSLATED = 'data-zh';
  let enabled = localStorage.getItem(STORAGE_KEY) === 'zh';

  // ========== 工具函数 ==========
  function isTranslated(node) {
    return node.nodeType === 1 && node.hasAttribute(ATTR_TRANSLATED);
  }

  function markTranslated(node) {
    if (node.nodeType === 1) {
      node.setAttribute(ATTR_TRANSLATED, 'zh');
    }
  }

  // 获取纯文本节点的文本（去除首尾空格）
  function getNodeText(node) {
    if (node.nodeType !== 3) return null;
    return node.textContent.trim();
  }

  // 按文本长度降序排列词典键（优先匹配长字符串）
  const sortedKeys = Object.keys(dict).sort(function(a, b) {
    return b.length - a.length;
  });

  // ========== 翻译逻辑 ==========
  function translateText(text) {
    var result = text;
    for (var i = 0; i < sortedKeys.length; i++) {
      var key = sortedKeys[i];
      // 区分大小写精确匹配
      if (result === key) {
        return dict[key];
      }
      // 包含匹配（替换文本中的英文）
      var idx = result.indexOf(key);
      if (idx !== -1) {
        // 确保是单词边界
        var before = idx > 0 ? result[idx - 1] : ' ';
        var after = idx + key.length < result.length ? result[idx + key.length] : ' ';
        var isWordBoundary = isBoundary(before) && isBoundary(after);
        if (isWordBoundary) {
          result = result.substring(0, idx) + dict[key] + result.substring(idx + key.length);
        }
      }
    }
    return result;
  }

  function isBoundary(ch) {
    return /[\\s\\u3000\\u3001\\u3002\\uff0c\\uff1b\\uff1a\\u2018\\u2019\\u201c\\u201d\\u300a\\u300b\\(\\)\\[\\]\\{\\}.,!?;:'"\\-]/.test(ch);
  }

  // 翻译单个文本节点
  function translateNode(node) {
    if (!enabled) return;
    if (node.nodeType !== 3) return; // 只处理文本节点

    var text = node.textContent;
    var trimmed = text.trim();
    if (!trimmed) return;

    // 检查父元素是否已翻译
    var parent = node.parentElement;
    if (parent && isTranslated(parent)) return;
    if (parent && parent.closest && parent.closest('[' + ATTR_TRANSLATED + ']')) return;

    // 跳过代码块、输入框等
    if (parent) {
      var tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'CODE' || tag === 'PRE') return;
      // 跳过 monaco 编辑器内部
      if (parent.closest && (parent.closest('.monaco-editor') || parent.closest('[contenteditable]'))) return;
    }

    var translated = translateText(text);
    if (translated !== text) {
      node.textContent = translated;
      if (parent) markTranslated(parent);
    }
  }

  // 递归遍历并翻译所有文本节点
  function translateSubtree(root) {
    if (!enabled) return;
    if (isTranslated(root)) return;

    var walker = document.createTreeWalker(
      root,
      4, // NodeFilter.SHOW_TEXT
      null,
      false
    );

    var node;
    var nodes = [];
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    for (var i = 0; i < nodes.length; i++) {
      translateNode(nodes[i]);
    }
  }

  // ========== MutationObserver ==========
  var observer = null;

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function(mutations) {
      if (!enabled) return;
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1 || added[j].nodeType === 3) {
            translateSubtree(added[j]);
          }
        }
        // 文本变化
        if (mutations[i].type === 'characterData') {
          translateNode(mutations[i].target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ========== 切换按钮（通过菜单触发，不再创建浮动按钮） ==========

  // ========== 切换逻辑 ==========
  function enable() {
    enabled = true;
    localStorage.setItem(STORAGE_KEY, 'zh');
    translateSubtree(document.body);
    startObserver();
  }

  function disable() {
    enabled = false;
    localStorage.setItem(STORAGE_KEY, 'en');
    stopObserver();
    // 重新加载页面以恢复原文
    location.reload();
  }

  function toggle() {
    if (enabled) {
      disable();
    } else {
      enable();
    }
  }

  function init() {
    // 等待 DOM 就绪
    if (document.body) {
      setup();
    } else {
      document.addEventListener('DOMContentLoaded', setup);
    }
  }

  function setup() {
    // No floating button — language toggle is in the sidebar menu

    if (enabled) {
      // 延迟执行，等待 React 渲染完成
      setTimeout(function() {
        translateSubtree(document.body);
        startObserver();
      }, 500);
    }
  }

  // 导出到 window 对象以便调试
  window.__translator = {
    enable: enable,
    disable: disable,
    toggle: toggle,
    isEnabled: function() { return enabled; },
    translateNow: function() { translateSubtree(document.body); },
  };

  // 每 2 秒检查一次新内容（React 动态渲染的兜底）
  var intervalId = null;
  if (!intervalId) {
    intervalId = setInterval(function() {
      if (enabled) {
        // 只检查未翻译的区域
        var untranslated = document.querySelectorAll(':not([' + ATTR_TRANSLATED + '])');
        for (var i = 0; i < untranslated.length; i++) {
          translateSubtree(untranslated[i]);
        }
      }
    }, 2000);
  }

  init();
})();
`
}
