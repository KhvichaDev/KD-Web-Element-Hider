/**
 * Utilities and shared state namespace for KD Web Element Hider.
 * Provides helper functions for throttling, selector generation, context validation,
 * and storage synchronization.
 */

(function () {
  /**
   * Global shared namespace for KD Web Element Hider modules.
   */
  const hider = window.kd_hider = window.kd_hider || {
    /**
     * Unique style tag ID for injecting custom element hiding rules.
     */
    kd_STYLE_ID: "kd-element-hider-styles",

    /**
     * The shadow host ID for isolation of the extension's UI components.
     */
    kd_SHADOW_HOST_ID: "kd-element-hider-shadow-host",

    /**
     * State variables for tracking selector mode, active rules, and UI elements.
     */
    kd_isActive: false,
    kd_selectorModeActive: false,
    kd_hoveredElement: null,
    kd_selectedElement: null,
    kd_shadowRoot: null,
    kd_shadowHost: null,
    kd_observer: null,
    kd_throttledReload: null,
    kd_selectionDelayTimeout: null,
    kd_lastParentSelectionTime: 0,
    kd_lastMouseX: -1,
    kd_lastMouseY: -1,
    kd_isMouseOverShadow: false,
    kd_selectionHistory: [],
    kd_iframeOverlays: [],
    kd_relocationTimeout: null,
    kd_relocationDelay: 50,
    kd_firstDisplacementTime: 0,
    kd_lastRelocationTime: 0,
    kd_isSidebarOpen: false,
    kd_isSidebarCollapsed: false,
    kd_siteRules: [],
    kd_tabId: null,
    kd_updateIframeCoversScheduled: false,
    kd_unfreezeTimeout: null,
    kd_sidebarCloseTimeout: null
  };

  /**
   * Throttles a function execution to prevent layout thrashing on rapid DOM mutations.
   * This implementation supports both leading and trailing edge executions to guarantee
   * that the final state change of a rapid sequence of events is always processed
   * and never ignored.
   */
  hider.kd_throttle = function (func, limit) {
    let lastFunc;
    let lastRan;
    return function () {
      const context = this;
      const args = arguments;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        const remaining = limit - (Date.now() - lastRan);
        if (remaining <= 0) {
          func.apply(context, args);
          lastRan = Date.now();
          if (lastFunc) {
            clearTimeout(lastFunc);
            lastFunc = null;
          }
        } else {
          clearTimeout(lastFunc);
          lastFunc = setTimeout(function () {
            func.apply(context, args);
            lastRan = Date.now();
            lastFunc = null;
          }, remaining);
        }
      }
    };
  };

  /**
   * Safely checks if the extension context is still valid.
   * If the extension is reloaded or updated, the context gets invalidated.
   */
  hider.kd_isContextValid = function () {
    return typeof chrome !== "undefined" && chrome.runtime && !!chrome.runtime.id;
  };

  /**
   * Sanitizes a CSS selector to prevent CSS Injection.
   * Removes any characters that can break out of a CSS rule context.
   */
  hider.kd_sanitizeSelector = function (selector) {
    if (typeof selector !== "string") return "";
    return selector
      .replace(/[{}]/g, "")
      .replace(/\/\*|\*\//g, "")
      .replace(/\r?\n|\r/g, "")
      .replace(/@/g, "");
  };

  /**
   * Safely escapes double quotes inside attribute selector values.
   */
  hider.kd_escapeAttributeValue = function (val) {
    if (typeof val !== "string") return "";
    return val.replace(/"/g, '\\"');
  };

  /**
   * Generates a CSS selector path for an element.
   * Generalized mode skips specific index definitions like nth-child to find similar elements.
   */
  hider.kd_generateSelector = function (element, generalized = false) {
    if (!(element instanceof Element)) return "";

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();

      if (current.tagName.toLowerCase() === "iframe" && current.getAttribute("src")) {
        const src = current.getAttribute("src");
        let matchedKeyword = "";
        if (src.includes("googleads")) matchedKeyword = "googleads";
        else if (src.includes("doubleclick")) matchedKeyword = "doubleclick";
        else if (src.includes("googlesyndication")) matchedKeyword = "googlesyndication";
        else if (src.includes("google-vignette")) matchedKeyword = "google-vignette";

        if (matchedKeyword) {
          selector += `[src*="${matchedKeyword}"]`;
          path.unshift(selector);
          break;
        } else {
          const match = src.match(/https?:\/\/([^/]+)/);
          if (match && match[1]) {
            selector += `[src*="${hider.kd_escapeAttributeValue(match[1])}"]`;
            path.unshift(selector);
            break;
          }
        }
      }

      if (current.id) {
        const hasNumbers = /\d/.test(current.id);
        const isLong = current.id.length > 40;
        if (!isLong) {
          if (!hasNumbers && !generalized) {
            selector += `#${CSS.escape(current.id)}`;
            path.unshift(selector);
            break;
          } else {
            const prefixMatch = current.id.match(/^([a-zA-Z_-]+)/);
            if (prefixMatch && prefixMatch[1] && prefixMatch[1].length >= 6) {
              selector += `[id^="${hider.kd_escapeAttributeValue(prefixMatch[1])}"]`;
              path.unshift(selector);
              break;
            }
            const suffixMatch = current.id.match(/([a-zA-Z_-]+)$/);
            if (suffixMatch && suffixMatch[1] && suffixMatch[1].length >= 6) {
              selector += `[id$="${hider.kd_escapeAttributeValue(suffixMatch[1])}"]`;
              path.unshift(selector);
              break;
            }
          }
        }
      }

      const classAttr = current.getAttribute("class");
      if (classAttr && typeof classAttr === "string") {
        const classes = classAttr
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.startsWith("kd-"));
        if (classes.length > 0) {
          selector += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
        }
      }

      if (!generalized && current.parentNode && current.parentNode.nodeType === Node.ELEMENT_NODE) {
        const siblings = Array.from(current.parentNode.children);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);

      if (generalized && path.length >= 2) {
        break;
      }

      current = current.parentNode;
    }

    return path.join(" > ");
  };

  /**
   * Helper to write to session storage with tabId context.
   * If tabId is not loaded yet, retrieves it from the background script.
   */
  hider.kd_setSessionStorage = function (key, value) {
    if (!hider.kd_isContextValid()) return;
    if (hider.kd_tabId) {
      chrome.storage.session.set({ [`${key}_${hider.kd_tabId}`]: value });
    } else {
      chrome.runtime.sendMessage({ type: "kd_get_tab_id" }, (response) => {
        if (!hider.kd_isContextValid()) return;
        if (response && response.tabId) {
          hider.kd_tabId = response.tabId;
          chrome.storage.session.set({ [`${key}_${response.tabId}`]: value });
        }
      });
    }
  };

  /**
   * Sends the count of hidden elements to the background script for updating the badge.
   */
  hider.kd_notifyBadge = function (count) {
    if (!hider.kd_isContextValid()) return;
    chrome.runtime.sendMessage({
      type: "kd_update_badge",
      count: count,
      isActive: hider.kd_isActive
    });
  };

  /**
   * Dynamically determines whether the website is in light or dark theme.
   * Scans body/html background colors, falls back to text color for transparent canvases.
   */
  hider.kd_getPreferredTheme = function () {
    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return "light";

    const getBgColor = (el) => {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return null;
      const match = bg.match(/rgba?\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s/]+([\d.]+)/);
      if (match && parseFloat(match[1]) < 0.1) return null;
      return bg;
    };

    let bg = getBgColor(body) || getBgColor(html);

    if (!bg) {
      const textColor = window.getComputedStyle(body).color;
      if (textColor) {
        const rgb = textColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0], 10);
          const g = parseInt(rgb[1], 10);
          const b = parseInt(rgb[2], 10);
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
          if (brightness > 180) {
            return "dark";
          }
        }
      }
      return "light";
    }

    const rgb = bg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const r = parseInt(rgb[0], 10);
      const g = parseInt(rgb[1], 10);
      const b = parseInt(rgb[2], 10);
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
      return brightness > 128 ? "light" : "dark";
    }

    return "light";
  };
})();
