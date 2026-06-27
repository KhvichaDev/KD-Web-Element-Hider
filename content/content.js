/**
 * Coordinator/controller module for KD Web Element Hider.
 * Sets up mutation observers, handles page events (clicks, hovers, shortcuts),
 * synchronizes storage states, unfreezes scroll layouts, and manages sidebar toggle transitions.
 */

(function () {
  const hider = window.kd_hider;
  if (!hider) return;

  /**
   * Direct programmatic application of style hidden attributes.
   * Modifying inline styles directly bypasses Content Security Policy (CSP) limitations.
   */
  hider.kd_applyJSRules = function (rules) {
    if (!hider.kd_isActive) return;

    rules.forEach((rule) => {
      try {
        const elements = document.querySelectorAll(rule.kd_selector);
        elements.forEach((el) => {
          if (el.style.getPropertyValue("display") !== "none") {
            el.style.setProperty("display", "none", "important");
            el.setAttribute("data-kd-hidden", "true");
          }
        });
      } catch (err) {}
    });
  };

  /**
   * Starts a mutation observer targeting the head or documentElement to prevent
   * single-page application framework script loads from purging our styles.
   */
  hider.kd_startObserver = function () {
    if (hider.kd_observer) {
      hider.kd_observer.disconnect();
    }

    hider.kd_throttledReload = hider.kd_throttle(() => {
      if (!hider.kd_isContextValid()) {
        hider.kd_cleanUpOrphanedListeners();
        return;
      }

      const currentPath = window.location.pathname;
      if (hider.kd_lastPathname !== currentPath) {
        hider.kd_lastPathname = currentPath;
        hider.kd_reloadRules();
      }

      if (hider.kd_isActive) {
        hider.kd_applyJSRules(hider.kd_siteRules);

        if (!document.getElementById(hider.kd_STYLE_ID)) {
          hider.kd_applyStyles(hider.kd_siteRules);
        }

        if (hider.kd_selectorModeActive) {
          hider.kd_coverIframes();
          hider.kd_updateIframeCovers();
        }

        if (hider.kd_siteRules.length > 0) {
          hider.kd_scheduledUnfreezePage();
        }
      }

      if (hider.kd_isSidebarOpen && !document.getElementById(hider.kd_SHADOW_HOST_ID)) {
        if (document.body) {
          hider.kd_toggleSidebar(true);
        }
      }

      if (hider.kd_shadowHost) {
        const parent = document.documentElement;
        if (hider.kd_shadowHost.parentNode !== parent || parent.lastChild !== hider.kd_shadowHost) {
          const now = Date.now();
          if (now - hider.kd_lastRelocationTime < 500) {
            hider.kd_relocationDelay = Math.min(hider.kd_relocationDelay * 2, 2000);
          } else {
            hider.kd_relocationDelay = 50;
          }

          if (hider.kd_firstDisplacementTime === 0) {
            hider.kd_firstDisplacementTime = now;
          }

          const elapsed = now - hider.kd_firstDisplacementTime;

          if (hider.kd_relocationTimeout) {
            if (elapsed > 2000) {
              clearTimeout(hider.kd_relocationTimeout);
              hider.kd_relocationTimeout = null;
              hider.kd_performRelocation();
            } else {
              clearTimeout(hider.kd_relocationTimeout);
              hider.kd_scheduleRelocation();
            }
          } else {
            hider.kd_scheduleRelocation();
          }
        } else {
          hider.kd_firstDisplacementTime = 0;
        }
      }
    }, 150);

    hider.kd_observer = new MutationObserver(hider.kd_throttledReload);
    hider.kd_observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  /**
   * Performs the actual relocation of the shadow host to the end of documentElement.
   */
  hider.kd_performRelocation = function () {
    if (!hider.kd_isContextValid()) return;
    const parent = document.documentElement;
    if (hider.kd_shadowHost && (hider.kd_shadowHost.parentNode !== parent || parent.lastChild !== hider.kd_shadowHost)) {
      hider.kd_observer.disconnect();
      parent.appendChild(hider.kd_shadowHost);
      hider.kd_observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    hider.kd_relocationTimeout = null;
    hider.kd_firstDisplacementTime = 0;
    hider.kd_lastRelocationTime = Date.now();
    hider.kd_relocationDelay = 50;
  };

  /**
   * Schedules a relocation timeout.
   */
  hider.kd_scheduleRelocation = function () {
    hider.kd_relocationTimeout = setTimeout(hider.kd_performRelocation, hider.kd_relocationDelay);
  };

  /**
   * Reloads rules from storage and applies them to the current document.
   */
  hider.kd_reloadRules = function () {
    if (!hider.kd_isContextValid()) return;
    hider.kd_restoreJSElements();

    if (hider.kd_isActive) {
      hider.kd_applyStyles(hider.kd_siteRules);
      hider.kd_applyJSRules(hider.kd_siteRules);
      hider.kd_notifyBadge(hider.kd_siteRules.length);

      if (hider.kd_siteRules.length > 0) {
        hider.kd_scheduledUnfreezePage();
      }
    } else {
      hider.kd_removeStyles();
    }

    hider.kd_renderSidebarRules(hider.kd_siteRules);
  };

  /**
   * Cleans up all global event listeners if the extension context is invalidated.
   */
  hider.kd_cleanUpOrphanedListeners = function () {
    document.removeEventListener("mouseover", hider.kd_handleMouseOver, true);
    document.removeEventListener("mouseout", hider.kd_handleMouseOut, true);
    document.removeEventListener("click", hider.kd_handleMouseClick, true);
    document.removeEventListener("mousedown", hider.kd_handleMouseDown, true);
    document.removeEventListener("mouseup", hider.kd_handleMouseUp, true);
    document.removeEventListener("keydown", hider.kd_handleKeyDown, true);
    window.removeEventListener("resize", hider.kd_scheduledUpdateIframeCovers);
    window.removeEventListener("scroll", hider.kd_scheduledUpdateIframeCovers);
    window.removeEventListener("popstate", hider.kd_handleUrlChange);
    window.removeEventListener("hashchange", hider.kd_handleUrlChange);
    if (hider.kd_observer) {
      try {
        hider.kd_observer.disconnect();
      } catch (e) {}
    }
  };

  /**
   * Listens for hover transitions over document elements.
   */
  hider.kd_handleMouseOver = function (e) {
    if (!hider.kd_isContextValid()) {
      hider.kd_cleanUpOrphanedListeners();
      return;
    }

    const isNotification = e.composedPath().some((el) => 
      el.classList && (el.classList.contains("kd-toast-overlay") || el.classList.contains("kd-toast"))
    );
    if (isNotification) return;

    if (hider.kd_shadowHost && e.composedPath().includes(hider.kd_shadowHost)) {
      hider.kd_isMouseOverShadow = true;
      if (hider.kd_selectionDelayTimeout) {
        clearTimeout(hider.kd_selectionDelayTimeout);
        hider.kd_selectionDelayTimeout = null;
      }
      return;
    }

    hider.kd_isMouseOverShadow = false;

    if (e.clientX === hider.kd_lastMouseX && e.clientY === hider.kd_lastMouseY) {
      return;
    }

    if (Date.now() - hider.kd_lastParentSelectionTime < 500) {
      if (hider.kd_selectionDelayTimeout) {
        clearTimeout(hider.kd_selectionDelayTimeout);
        hider.kd_selectionDelayTimeout = null;
      }
      return;
    }

    hider.kd_lastMouseX = e.clientX;
    hider.kd_lastMouseY = e.clientY;

    let target = e.target;
    if (target.classList && target.classList.contains("kd-iframe-cover")) {
      target = target.kd_targetIframe;
    }

    if (hider.kd_selectedElement) {
      if (Date.now() - hider.kd_lastParentSelectionTime < 1000 && hider.kd_selectedElement.contains(target)) {
        if (hider.kd_selectionDelayTimeout) {
          clearTimeout(hider.kd_selectionDelayTimeout);
          hider.kd_selectionDelayTimeout = null;
        }
        return;
      }

      if (hider.kd_selectionDelayTimeout) {
        clearTimeout(hider.kd_selectionDelayTimeout);
      }
      hider.kd_selectionDelayTimeout = setTimeout(() => {
        hider.kd_hoveredElement = target;
        hider.kd_selectElement(target);
      }, 200);
    } else {
      hider.kd_hoveredElement = target;
      hider.kd_selectElement(target);
    }
  };

  /**
   * Hides the highlighting frame when mouse leaves elements.
   */
  hider.kd_handleMouseOut = function (e) {
    if (!hider.kd_isContextValid()) {
      hider.kd_cleanUpOrphanedListeners();
      return;
    }

    const isNotification = e.composedPath().some((el) => 
      el.classList && (el.classList.contains("kd-toast-overlay") || el.classList.contains("kd-toast"))
    );
    if (isNotification) return;

    if (hider.kd_shadowHost && e.composedPath().includes(hider.kd_shadowHost)) return;
    hider.kd_hoveredElement = null;
  };

  /**
   * Catches mouse clicks to confirm element selection.
   */
  hider.kd_handleMouseClick = function (e) {
    if (!hider.kd_isContextValid()) {
      hider.kd_cleanUpOrphanedListeners();
      return;
    }

    const isNotification = e.composedPath().some((el) => 
      el.classList && (el.classList.contains("kd-toast-overlay") || el.classList.contains("kd-toast"))
    );
    if (isNotification) return;

    if (hider.kd_shadowHost && e.composedPath().includes(hider.kd_shadowHost)) return;
    e.preventDefault();
    e.stopPropagation();

    let target = e.target;
    if (target.classList && target.classList.contains("kd-iframe-cover")) {
      target = target.kd_targetIframe;
    }

    if (target) {
      hider.kd_confirmSelection(target);
    }
  };

  /**
   * Prevents mouse down events on host page elements during selector mode.
   */
  hider.kd_handleMouseDown = function (e) {
    if (!hider.kd_isContextValid()) return;
    const isNotification = e.composedPath().some((el) => 
      el.classList && (el.classList.contains("kd-toast-overlay") || el.classList.contains("kd-toast"))
    );
    if (isNotification) return;
    if (hider.kd_shadowHost && e.composedPath().includes(hider.kd_shadowHost)) return;

    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Prevents mouse up events on host page elements during selector mode.
   */
  hider.kd_handleMouseUp = function (e) {
    if (!hider.kd_isContextValid()) return;
    const isNotification = e.composedPath().some((el) => 
      el.classList && (el.classList.contains("kd-toast-overlay") || el.classList.contains("kd-toast"))
    );
    if (isNotification) return;
    if (hider.kd_shadowHost && e.composedPath().includes(hider.kd_shadowHost)) return;

    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Handles keyboard shortcuts for active navigation within visual selector mode.
   */
  hider.kd_handleKeyDown = function (e) {
    if (!hider.kd_isContextValid()) {
      hider.kd_cleanUpOrphanedListeners();
      return;
    }

    if (e.key === "Escape") {
      hider.kd_deactivateSelectorMode();
    } else if (e.key === "Shift") {
      e.preventDefault();
      if (hider.kd_selectedElement && hider.kd_selectedElement.parentElement) {
        hider.kd_lastParentSelectionTime = Date.now();
        hider.kd_selectElement(hider.kd_selectedElement.parentElement);
      }
    }
  };

  /**
   * Confirms selection and checks if identical elements exist.
   */
  hider.kd_confirmSelection = function (element) {
    hider.kd_clearActiveToast();

    const singleSelector = hider.kd_generateSelector(element, false);
    const generalizedSelector = hider.kd_generateSelector(element, true);

    let identicalCount = 0;
    try {
      if (generalizedSelector) {
        identicalCount = document.querySelectorAll(generalizedSelector).length;
      }
    } catch {
      identicalCount = 0;
    }

    hider.kd_clearSelection();

    if (identicalCount > 1 && generalizedSelector !== singleSelector) {
      hider.kd_showMultiDeletePrompt(element, singleSelector, generalizedSelector, identicalCount);
    } else {
      hider.kd_saveRule(singleSelector, "single");
    }
  };

  /**
   * Sends a message to the background service worker to register a dynamic content script.
   */
  hider.kd_registerDynamicScriptForCurrentOrigin = function () {
    if (!hider.kd_isContextValid()) return;
    const origin = `${window.location.protocol}//${window.location.hostname}/*`;
    chrome.runtime.sendMessage({ type: "kd_register_script", origin: origin });
  };

  /**
   * Saves a new rule in chrome storage and runs page layout unfreeze routines.
   */
  hider.kd_saveRule = function (selector, type) {
    if (!hider.kd_isContextValid()) return;
    const hostname = window.location.hostname;
    chrome.storage.local.get(["kd_hiddenRules"], (data) => {
      if (!hider.kd_isContextValid()) return;
      const rules = data.kd_hiddenRules || {};
      if (!rules[hostname]) {
        rules[hostname] = [];
      }

      const exists = rules[hostname].some((r) => r.kd_selector === selector);
      if (!exists) {
        rules[hostname].push({
          kd_selector: selector,
          kd_type: type,
          kd_timestamp: Date.now(),
          kd_pathname: window.location.pathname
        });

        chrome.storage.local.set({ kd_hiddenRules: rules }, () => {
          hider.kd_reloadRules();
          hider.kd_scheduledUnfreezePage();
          hider.kd_registerDynamicScriptForCurrentOrigin();
          if (window.KDNotification) {
            window.KDNotification.show({
              type: "success",
              message: "Element hidden successfully.",
              duration: 2000,
              position: "center",
              theme: hider.kd_getPreferredTheme()
            });
          }
        });
      }
    });
  };

  /**
   * Throttles unfreeze runs using a debounced timer.
   */
  hider.kd_scheduledUnfreezePage = function () {
    if (hider.kd_unfreezeTimeout) {
      clearTimeout(hider.kd_unfreezeTimeout);
    }
    hider.kd_unfreezeTimeout = setTimeout(() => {
      if (!hider.kd_isContextValid()) return;
      hider.kd_unfreezePage();
      hider.kd_unfreezeTimeout = null;
    }, 150);
  };

  /**
   * Traverses structural wrapper variables of critical HTML nodes.
   * Restores overflow parameters and terminates blocking layers post element deletion.
   */
  hider.kd_unfreezePage = function () {
    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return;

    const bodyStyle = window.getComputedStyle(body);
    const htmlStyle = window.getComputedStyle(html);

    const isBodyLocked = bodyStyle.overflow === "hidden" || bodyStyle.overflowY === "hidden" || bodyStyle.position === "fixed";
    const isHtmlLocked = htmlStyle.overflow === "hidden" || htmlStyle.overflowY === "hidden";

    if (isBodyLocked) {
      body.style.setProperty("overflow", "auto", "important");
      body.style.setProperty("overflow-y", "auto", "important");
      if (bodyStyle.position === "fixed") {
        body.style.setProperty("position", "static", "important");
      }
      body.style.setProperty("padding-right", "", "");
      body.style.setProperty("margin-right", "", "");
    }

    if (isHtmlLocked) {
      html.style.setProperty("overflow", "auto", "important");
      html.style.setProperty("overflow-y", "auto", "important");
    }

    if (!isBodyLocked && !isHtmlLocked) {
      return;
    }

    const candidates = document.querySelectorAll("body > div, html > div, body > ins, html > ins");
    candidates.forEach((div) => {
      if (div.id === hider.kd_SHADOW_HOST_ID || div.classList.contains("kd-iframe-cover")) return;
      if (div.children.length > 3) return;

      const id = div.id ? div.id.toLowerCase() : "";
      if (id === "root" || id === "app" || id === "wrapper" || id === "container") return;
      if (div.textContent && div.textContent.trim() !== "") return;

      const style = window.getComputedStyle(div);
      const isOverlayStyle =
        (style.position === "fixed" || style.position === "absolute") &&
        parseFloat(style.zIndex) > 100 &&
        (style.backgroundColor.includes("rgba") || parseFloat(style.opacity) < 1);

      if (!isOverlayStyle) return;

      const rect = div.getBoundingClientRect();
      const isFullScreen =
        rect.width >= window.innerWidth * 0.95 &&
        rect.height >= window.innerHeight * 0.95;

      if (isFullScreen) {
        let hasVisibleDescendants = false;
        const descendants = div.getElementsByTagName("*");

        if (descendants.length <= 15) {
          for (let i = 0; i < descendants.length; i++) {
            const d = descendants[i];
            if (d.id === hider.kd_SHADOW_HOST_ID) continue;
            
            const dStyle = window.getComputedStyle(d);
            const dRect = d.getBoundingClientRect();
            if (
              dStyle.display !== "none" &&
              dStyle.visibility !== "hidden" &&
              parseFloat(dStyle.opacity) > 0 &&
              dRect.width > 0 &&
              dRect.height > 0
            ) {
              hasVisibleDescendants = true;
              break;
            }
          }
        } else {
          hasVisibleDescendants = true;
        }

        if (!hasVisibleDescendants) {
          div.remove();
        }
      }
    });
  };

  /**
   * Toggles the floating sidebar visual wrapper.
   */
  hider.kd_toggleSidebar = function (isAutoOpen = false) {
    if (!hider.kd_isContextValid()) return;
    const isRendered = !!document.getElementById(hider.kd_SHADOW_HOST_ID);
    if (isAutoOpen && isRendered) {
      return;
    }

    hider.kd_createShadowUI();

    const sidebar = hider.kd_shadowRoot.getElementById("kd-sidebar");
    if (!sidebar) return;

    if (hider.kd_isSidebarOpen && !isAutoOpen) {
      sidebar.classList.remove("kd-open");
      hider.kd_deactivateSelectorMode();
      
      hider.kd_isSidebarOpen = false;
      hider.kd_setSessionStorage("kd_isSidebarOpen", false);
      
      if (hider.kd_siteRules.length === 0) {
        if (hider.kd_isContextValid()) {
          chrome.runtime.sendMessage({ type: "kd_unregister_script", origin: `${window.location.protocol}//${window.location.hostname}/*` });
        }
      }
      
      hider.kd_sidebarCloseTimeout = setTimeout(() => {
        if (hider.kd_shadowHost && !sidebar.classList.contains("kd-open") && !hider.kd_isSidebarOpen) {
          hider.kd_removeShadowUI();
        }
        hider.kd_sidebarCloseTimeout = null;
      }, 400);
    } else {
      if (hider.kd_sidebarCloseTimeout) {
        clearTimeout(hider.kd_sidebarCloseTimeout);
        hider.kd_sidebarCloseTimeout = null;
      }
      
      hider.kd_isSidebarOpen = true;
      hider.kd_setSessionStorage("kd_isSidebarOpen", true);

      chrome.storage.local.get(["kd_isActive", "kd_hiddenRules"], (data) => {
        if (!hider.kd_isContextValid()) return;
        hider.kd_isActive = data.kd_isActive !== false;
        const rules = data.kd_hiddenRules || {};
        const hostname = window.location.hostname;
        const siteRules = rules[hostname] || [];

        const toggle = hider.kd_shadowRoot.getElementById("kd-sb-global-toggle");
        if (toggle) toggle.checked = hider.kd_isActive;

        hider.kd_renderSidebarRules(siteRules);

        if (hider.kd_isSidebarCollapsed) {
          sidebar.classList.add("kd-collapsed");
        } else {
          sidebar.classList.remove("kd-collapsed");
        }

        if (isAutoOpen) {
          sidebar.classList.add("kd-open");
        } else {
          setTimeout(() => {
            if (hider.kd_isSidebarOpen) {
              sidebar.classList.add("kd-open");
            }
          }, 50);
        }

        hider.kd_updateSelectorButtonState(hider.kd_selectorModeActive);
      });
    }
  };

  /**
   * Removes a single rule from storage based on hostname index.
   */
  hider.kd_removeRuleByIndex = function (hostname, index) {
    if (!hider.kd_isContextValid()) return;
    chrome.storage.local.get(["kd_hiddenRules"], (data) => {
      if (!hider.kd_isContextValid()) return;
      const rules = data.kd_hiddenRules || {};
      if (rules[hostname]) {
        rules[hostname].splice(index, 1);
        if (rules[hostname].length === 0) {
          delete rules[hostname];
          if (!hider.kd_isSidebarOpen) {
            chrome.runtime.sendMessage({ type: "kd_unregister_script", origin: `${window.location.protocol}//${window.location.hostname}/*` });
          }
        }
        chrome.storage.local.set({ kd_hiddenRules: rules }, () => {
          if (window.KDNotification) {
            window.KDNotification.show({
              type: "info",
              message: "Element restored successfully.",
              duration: 2000,
              position: "center",
              theme: hider.kd_getPreferredTheme()
            });
          }
        });
      }
    });
  };

  /**
   * Activates the visual selection mode, enabling mouse hover highlights.
   */
  hider.kd_activateSelectorMode = function () {
    if (hider.kd_selectorModeActive) return;
    hider.kd_selectorModeActive = true;
    hider.kd_createShadowUI();

    hider.kd_lastMouseX = -1;
    hider.kd_lastMouseY = -1;

    hider.kd_coverIframes();

    // Inject custom cursor styling when selector is active
    let cursorStyle = document.getElementById("kd-selector-cursor-styles");
    if (!cursorStyle) {
      cursorStyle = document.createElement("style");
      cursorStyle.id = "kd-selector-cursor-styles";
      cursorStyle.textContent = `
        html.kd-selector-active *:not(#kd-element-hider-shadow-host):not(#kd-element-hider-shadow-host *):not(.kd-toast-overlay):not(.kd-toast-overlay *) {
          cursor: crosshair !important;
        }
        html.kd-selector-active .kd-toast-overlay {
          cursor: default !important;
        }
        html.kd-selector-active .kd-toast-overlay button,
        html.kd-selector-active .kd-toast-overlay a,
        html.kd-selector-active .kd-toast-overlay [role="button"] {
          cursor: pointer !important;
        }
      `;
      (document.head || document.documentElement).appendChild(cursorStyle);
    }
    document.documentElement.classList.add("kd-selector-active");

    document.addEventListener("mouseover", hider.kd_handleMouseOver, true);
    document.addEventListener("mouseout", hider.kd_handleMouseOut, true);
    document.addEventListener("click", hider.kd_handleMouseClick, true);
    document.addEventListener("mousedown", hider.kd_handleMouseDown, true);
    document.addEventListener("mouseup", hider.kd_handleMouseUp, true);
    document.addEventListener("keydown", hider.kd_handleKeyDown, true);
    window.addEventListener("resize", hider.kd_scheduledUpdateIframeCovers, { passive: true });
    window.addEventListener("scroll", hider.kd_scheduledUpdateIframeCovers, { passive: true });
    hider.kd_updateSelectorButtonState(true);
    if (window.KDNotification) {
      window.KDNotification.show({
        type: "info",
        message: "Selector active. Click an element to hide, or press ESC to exit.",
        duration: 3500,
        position: "center",
        theme: hider.kd_getPreferredTheme()
      });
    }
  };

  /**
   * Deactivates the visual selection mode.
   */
  hider.kd_deactivateSelectorMode = function () {
    if (!hider.kd_selectorModeActive) return;
    hider.kd_selectorModeActive = false;
    hider.kd_hoveredElement = null;
    hider.kd_selectedElement = null;

    hider.kd_isMouseOverShadow = false;
    hider.kd_selectionHistory = [];

    hider.kd_uncoverIframes();

    // Clean up custom cursor styling
    document.documentElement.classList.remove("kd-selector-active");
    const cursorStyle = document.getElementById("kd-selector-cursor-styles");
    if (cursorStyle) {
      cursorStyle.remove();
    }

    if (hider.kd_selectionDelayTimeout) {
      clearTimeout(hider.kd_selectionDelayTimeout);
      hider.kd_selectionDelayTimeout = null;
    }

    document.removeEventListener("mouseover", hider.kd_handleMouseOver, true);
    document.removeEventListener("mouseout", hider.kd_handleMouseOut, true);
    document.removeEventListener("click", hider.kd_handleMouseClick, true);
    document.removeEventListener("mousedown", hider.kd_handleMouseDown, true);
    document.removeEventListener("mouseup", hider.kd_handleMouseUp, true);
    document.removeEventListener("keydown", hider.kd_handleKeyDown, true);
    window.removeEventListener("resize", hider.kd_scheduledUpdateIframeCovers);
    window.removeEventListener("scroll", hider.kd_scheduledUpdateIframeCovers);

    if (hider.kd_shadowRoot) {
      const overlay = hider.kd_shadowRoot.getElementById("kd-overlay");
      const tooltip = hider.kd_shadowRoot.getElementById("kd-tooltip");
      if (overlay) overlay.style.display = "none";
      if (tooltip) tooltip.style.display = "none";
    }
    hider.kd_clearActiveToast();
    if (window.KDNotification) {
      window.KDNotification.show({
        type: "info",
        message: "Selector deactivated.",
        duration: 2000,
        position: "center",
        theme: hider.kd_getPreferredTheme()
      });
    }
    hider.kd_updateSelectorButtonState(false);
  };

  /**
   * Initializes the content script. Loads active rules, sets up style injections,
   * and registers listeners for storage changes.
   */
  function kd_init() {
    hider.kd_lastPathname = window.location.pathname;

    hider.kd_handleUrlChange = function () {
      const currentPath = window.location.pathname;
      if (hider.kd_lastPathname !== currentPath) {
        hider.kd_lastPathname = currentPath;
        hider.kd_reloadRules();
      }
    };
    window.addEventListener("popstate", hider.kd_handleUrlChange);
    window.addEventListener("hashchange", hider.kd_handleUrlChange);

    chrome.runtime.sendMessage({ type: "kd_get_tab_id" }, (response) => {
      if (!hider.kd_isContextValid()) return;
      const tabId = response ? response.tabId : null;
      if (!tabId) return;

      hider.kd_tabId = tabId;

      chrome.storage.local.get(["kd_isActive", "kd_hiddenRules"], (localData) => {
        if (!hider.kd_isContextValid()) return;
        hider.kd_isActive = localData.kd_isActive !== false;
        hider.kd_selectorModeActive = false;

        const allRules = localData.kd_hiddenRules || {};
        const hostname = window.location.hostname;
        hider.kd_siteRules = allRules[hostname] || [];

        chrome.storage.session.get([`kd_isSidebarOpen_${tabId}`, `kd_isSidebarCollapsed_${tabId}`], (sessionData) => {
          if (!hider.kd_isContextValid()) return;
          hider.kd_isSidebarOpen = !!sessionData[`kd_isSidebarOpen_${tabId}`];
          hider.kd_isSidebarCollapsed = !!sessionData[`kd_isSidebarCollapsed_${tabId}`];

          if (hider.kd_isActive) {
            hider.kd_applyStyles(hider.kd_siteRules);
            hider.kd_applyJSRules(hider.kd_siteRules);
            hider.kd_notifyBadge(hider.kd_siteRules.length);
            hider.kd_startObserver();

            // Auto-open sidebar in collapsed state if rules exist and it's not already open
            if (!hider.kd_isSidebarOpen && hider.kd_siteRules.length > 0) {
              hider.kd_isSidebarOpen = true;
              hider.kd_isSidebarCollapsed = true;
              hider.kd_setSessionStorage("kd_isSidebarOpen", true);
              hider.kd_setSessionStorage("kd_isSidebarCollapsed", true);
            }

            if (hider.kd_isSidebarOpen) {
              if (document.body) {
                hider.kd_toggleSidebar(true);
              } else {
                document.addEventListener("DOMContentLoaded", () => {
                  hider.kd_toggleSidebar(true);
                });
              }
            }
          }
        });
      });
    });

    document.addEventListener("DOMContentLoaded", () => {
      if (hider.kd_isActive) {
        hider.kd_reloadRules();
        hider.kd_startObserver();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "kd_ping") {
        if (sendResponse) sendResponse({ alive: true });
        return true;
      }
      if (message.type === "kd_toggle_sidebar") {
        if (message.tabId) {
          hider.kd_tabId = message.tabId;
        }
        if (document.body) {
          hider.kd_toggleSidebar();
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            hider.kd_toggleSidebar();
          });
        }
        if (sendResponse) sendResponse({ success: true });
      }
      if (message.type === "kd_request_global_permission_consent") {
        if (window.KDNotification) {
          window.KDNotification.show({
            type: "warning",
            title: "Enable Global Hiding",
            message: `KD Web Element Hider works best when it can automatically hide elements across all websites. Grant global access for seamless filtering, or choose a scoped option below.`,
            isModal: true,
            position: "center",
            theme: hider.kd_getPreferredTheme(),
            buttons: [
              { text: "Allow on All Sites", className: "kd-btn-primary", value: "global" },
              { text: "Current Site Only", value: "site" },
              { text: "This Session Only", value: "temporary" }
            ]
          }).then((res) => {
            if (res === "global") {
              chrome.runtime.sendMessage({ type: "kd_global_consent_granted" });
            } else if (res === "site") {
              chrome.runtime.sendMessage({ type: "kd_consent_granted", origin: message.origin });
            } else {
              chrome.runtime.sendMessage({ type: "kd_consent_denied" });
            }
          });
          if (sendResponse) sendResponse({ success: true });
        } else {
          chrome.runtime.sendMessage({ type: "kd_global_consent_granted" });
          if (sendResponse) sendResponse({ success: false });
        }
      }
      return true;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (!hider.kd_isContextValid()) return;

      if (changes.kd_isActive) {
        hider.kd_isActive = changes.kd_isActive.newValue;
        
        if (hider.kd_shadowRoot) {
          const toggle = hider.kd_shadowRoot.getElementById("kd-sb-global-toggle");
          if (toggle) toggle.checked = hider.kd_isActive;
          
          const selectBtn = hider.kd_shadowRoot.getElementById("kd-sb-select-btn");
          if (selectBtn) {
            selectBtn.disabled = !hider.kd_isActive;
            selectBtn.style.opacity = hider.kd_isActive ? "1" : "0.5";
          }
        }

        if (!hider.kd_isActive) {
          hider.kd_restoreJSElements();
          hider.kd_removeStyles();
          hider.kd_deactivateSelectorMode();
          if (hider.kd_observer) {
            hider.kd_observer.disconnect();
          }
        } else {
          hider.kd_reloadRules();
          hider.kd_startObserver();
        }
      }

      if (changes.kd_hiddenRules) {
        const allRules = changes.kd_hiddenRules.newValue || {};
        const hostname = window.location.hostname;
        hider.kd_siteRules = allRules[hostname] || [];
        hider.kd_reloadRules();
      }
      /**
       * Synchronizes the sidebar open state from tab-specific session storage.
       * Session storage keys are isolated per tab ID to avoid state leaks between tabs.
       */
      if (hider.kd_tabId) {
        const key = `kd_isSidebarOpen_${hider.kd_tabId}`;
        if (changes[key]) {
          hider.kd_isSidebarOpen = !!changes[key].newValue;
        }
      }
    });
  }

  kd_init();
})();
