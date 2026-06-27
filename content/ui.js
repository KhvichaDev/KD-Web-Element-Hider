/**
 * User Interface and DOM manipulation module for KD Web Element Hider.
 * Handles styles application, iframe covers, selector overlays, Shadow DOM UI components,
 * toast notifications, and sidebar controls.
 */

(function () {
  const hider = window.kd_hider;
  if (!hider) return;

  /**
   * Restores display parameters to DOM elements previously modified by JS hiding rules.
   */
  hider.kd_restoreJSElements = function () {
    const hiddenElements = document.querySelectorAll("[data-kd-hidden='true']");
    hiddenElements.forEach((el) => {
      el.style.removeProperty("display");
      el.removeAttribute("data-kd-hidden");
    });
  };

  /**
   * Inject CSS styles into the document to hide selected elements.
   */
  hider.kd_applyStyles = function (rules) {
    let styleEl = document.getElementById(hider.kd_STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = hider.kd_STYLE_ID;
    }

    const targetParent = document.head || document.documentElement;
    if (styleEl.parentNode !== targetParent) {
      targetParent.appendChild(styleEl);
    }

    if (rules.length > 0) {
      styleEl.textContent = rules
        .map((r) => `${hider.kd_sanitizeSelector(r.kd_selector)} { display: none !important; }`)
        .join("\n");
    } else {
      styleEl.textContent = "";
    }
  };

  /**
   * Removes custom CSS styling to make all elements visible again.
   */
  hider.kd_removeStyles = function () {
    const styleEl = document.getElementById(hider.kd_STYLE_ID);
    if (styleEl) {
      styleEl.remove();
    }
    hider.kd_restoreJSElements();
    hider.kd_notifyBadge(0);
  };

  /**
   * Identifies all iframe elements on the page and covers them with a transparent div.
   */
  hider.kd_coverIframes = function () {
    if (!hider.kd_selectorModeActive) return;

    const iframes = document.querySelectorAll("iframe:not([data-kd-covered='true'])");
    iframes.forEach((iframe) => {
      try {
        if (hider.kd_shadowHost && hider.kd_shadowHost.contains(iframe)) return;

        const rect = iframe.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const overlay = document.createElement("div");
        overlay.className = "kd-iframe-cover";

        const style = window.getComputedStyle(iframe);
        const position = style.position;

        if (position === "fixed") {
          overlay.style.position = "fixed";
          overlay.style.top = `${rect.top}px`;
          overlay.style.left = `${rect.left}px`;
        } else {
          overlay.style.position = "absolute";
          overlay.style.top = `${iframe.offsetTop}px`;
          overlay.style.left = `${iframe.offsetLeft}px`;
        }

        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        overlay.style.marginTop = style.marginTop;
        overlay.style.marginRight = style.marginRight;
        overlay.style.marginBottom = style.marginBottom;
        overlay.style.marginLeft = style.marginLeft;

        overlay.style.transform = style.transform;
        overlay.style.transformOrigin = style.transformOrigin;

        const iframeZ = parseInt(style.zIndex, 10);
        overlay.style.zIndex = isNaN(iframeZ) ? "2147483639" : `${Math.min(iframeZ + 1, 2147483639)}`;

        overlay.style.background = "transparent";
        overlay.style.pointerEvents = "auto";
        overlay.style.cursor = "pointer";

        overlay.kd_targetIframe = iframe;
        iframe.setAttribute("data-kd-covered", "true");

        if (iframe.parentNode) {
          iframe.parentNode.insertBefore(overlay, iframe.nextSibling);
        } else {
          document.documentElement.appendChild(overlay);
        }
        hider.kd_iframeOverlays.push(overlay);
      } catch (e) {}
    });
  };

  /**
   * Removes all temporary transparent iframe cover overlays from the page.
   */
  hider.kd_uncoverIframes = function () {
    hider.kd_iframeOverlays.forEach((el) => {
      if (el.kd_targetIframe) {
        el.kd_targetIframe.removeAttribute("data-kd-covered");
      }
      el.remove();
    });
    hider.kd_iframeOverlays = [];
  };

  /**
   * Debounces the iframe cover updates using requestAnimationFrame.
   */
  hider.kd_scheduledUpdateIframeCovers = function () {
    if (!hider.kd_isContextValid()) {
      hider.kd_cleanUpOrphanedListeners();
      return;
    }
    if (hider.kd_updateIframeCoversScheduled) return;
    hider.kd_updateIframeCoversScheduled = true;
    requestAnimationFrame(() => {
      if (!hider.kd_isContextValid()) return;
      hider.kd_updateIframeCovers();
      hider.kd_updateIframeCoversScheduled = false;
    });
  };

  /**
   * Updates the positions and sizes of all active iframe cover overlays to match their targets.
   */
  hider.kd_updateIframeCovers = function () {
    if (!hider.kd_selectorModeActive) return;

    hider.kd_iframeOverlays = hider.kd_iframeOverlays.filter((overlay) => {
      const iframe = overlay.kd_targetIframe;

      if (!iframe || !iframe.parentNode || !document.contains(iframe)) {
        overlay.remove();
        return false;
      }

      if (overlay.parentNode !== iframe.parentNode) {
        iframe.parentNode.insertBefore(overlay, iframe.nextSibling);
      }

      try {
        const rect = iframe.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          if (overlay.style.display !== "none") {
            overlay.style.display = "none";
          }
          return true;
        }

        const style = window.getComputedStyle(iframe);
        const position = style.position;
        const currentTop = position === "fixed" ? rect.top : iframe.offsetTop;
        const currentLeft = position === "fixed" ? rect.left : iframe.offsetLeft;

        const last = overlay.kd_lastLayout || {};
        if (
          last.position === position &&
          last.top === currentTop &&
          last.left === currentLeft &&
          last.width === rect.width &&
          last.height === rect.height &&
          last.display === "block" &&
          last.marginTop === style.marginTop &&
          last.marginRight === style.marginRight &&
          last.marginBottom === style.marginBottom &&
          last.marginLeft === style.marginLeft &&
          last.transform === style.transform &&
          last.transformOrigin === style.transformOrigin &&
          last.zIndex === style.zIndex
        ) {
          return true;
        }

        overlay.kd_lastLayout = {
          position: position,
          top: currentTop,
          left: currentLeft,
          width: rect.width,
          height: rect.height,
          display: "block",
          marginTop: style.marginTop,
          marginRight: style.marginRight,
          marginBottom: style.marginBottom,
          marginLeft: style.marginLeft,
          transform: style.transform,
          transformOrigin: style.transformOrigin,
          zIndex: style.zIndex
        };

        if (overlay.style.display !== "block") {
          overlay.style.display = "block";
        }
        if (overlay.style.position !== (position === "fixed" ? "fixed" : "absolute")) {
          overlay.style.position = position === "fixed" ? "fixed" : "absolute";
        }
        overlay.style.top = `${currentTop}px`;
        overlay.style.left = `${currentLeft}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        overlay.style.marginTop = style.marginTop;
        overlay.style.marginRight = style.marginRight;
        overlay.style.marginBottom = style.marginBottom;
        overlay.style.marginLeft = style.marginLeft;

        overlay.style.transform = style.transform;
        overlay.style.transformOrigin = style.transformOrigin;

        const iframeZ = parseInt(style.zIndex, 10);
        overlay.style.zIndex = isNaN(iframeZ) ? "2147483639" : `${Math.min(iframeZ + 1, 2147483639)}`;
      } catch (e) {}

      return true;
    });
  };

  /**
   * Instantiates the Shadow DOM host and appends interface components.
   */
  hider.kd_createShadowUI = function () {
    if (document.getElementById(hider.kd_SHADOW_HOST_ID)) return;

    hider.kd_shadowHost = document.createElement("div");
    hider.kd_shadowHost.id = hider.kd_SHADOW_HOST_ID;
    hider.kd_shadowHost.style.position = "fixed";
    hider.kd_shadowHost.style.top = "0";
    hider.kd_shadowHost.style.left = "0";
    hider.kd_shadowHost.style.width = "100vw";
    hider.kd_shadowHost.style.height = "100vh";
    hider.kd_shadowHost.style.pointerEvents = "none";
    hider.kd_shadowHost.style.zIndex = "2147483640";

    hider.kd_shadowRoot = hider.kd_shadowHost.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      #kd-overlay {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px dashed #6366f1;
        background: rgba(99, 102, 241, 0.12);
        box-shadow: 0 0 12px rgba(99, 102, 241, 0.25);
        border-radius: 4px;
        transition: all 0.1s cubic-bezier(0.16, 1, 0.3, 1);
        display: none;
      }
      #kd-tooltip {
        position: fixed;
        pointer-events: auto;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 12px;
        color: #ffffff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: opacity 0.15s ease;
        display: none;
      }
      .kd-tag {
        background: #6366f1;
        color: #ffffff;
        padding: 3px 6px;
        border-radius: 4px;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.5px;
      }
      .kd-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        padding: 5px 10px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .kd-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        border-color: rgba(255, 255, 255, 0.35);
      }
      .kd-btn-delete {
        background: #ef4444;
        border: none;
      }
      .kd-btn-delete:hover {
        background: #dc2626;
      }
      :host {
        --kd-sidebar-width: clamp(320px, 24vw, 420px);
      }
      #kd-toast-container {
        position: fixed;
        bottom: 24px;
        right: calc(var(--kd-sidebar-width) + 40px);
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: auto;
      }
      .kd-toast {
        position: relative;
        background: rgba(10, 10, 12, 0.98);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 12px;
        padding: 16px;
        color: #ffffff;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        width: 320px;
        box-sizing: border-box;
        animation: kd-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .kd-toast-close {
        position: absolute;
        top: 10px;
        right: 12px;
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 18px;
        font-weight: 500;
        cursor: pointer;
        padding: 2px 6px;
        line-height: 1;
        transition: color 0.2s;
      }
      .kd-toast-close:hover {
        color: #ffffff;
      }
      .kd-toast-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 6px;
      }
      .kd-toast-desc {
        font-size: 12px;
        color: #94a3b8;
        margin-bottom: 12px;
        line-height: 1.4;
      }
      .kd-toast-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      @keyframes kd-slide-up {
        from { transform: translateY(24px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      #kd-sidebar {
        position: fixed;
        top: 20px;
        right: 20px;
        width: var(--kd-sidebar-width);
        height: calc(100vh - 40px);
        background: rgba(13, 13, 17, 0.85);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.02);
        display: flex;
        flex-direction: column;
        color: #ffffff;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        box-sizing: border-box;
        opacity: 0;
        transform: translateX(calc(var(--kd-sidebar-width) + 60px));
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease;
        pointer-events: auto;
        overscroll-behavior: contain;
      }
      #kd-sidebar.kd-open {
        opacity: 1;
        transform: translateX(0);
      }
      #kd-sidebar.kd-collapsed {
        opacity: 1;
        transform: translateX(calc(var(--kd-sidebar-width) + 20px)) !important;
      }
      @media (max-width: 480px) {
        #kd-sidebar {
          --kd-sidebar-width: calc(100vw - 20px) !important;
          top: 10px;
          right: 10px;
          height: calc(100vh - 20px);
          border-radius: 16px;
          transform: translateX(calc(var(--kd-sidebar-width) + 30px));
        }
        #kd-sidebar.kd-collapsed {
          transform: translateX(calc(var(--kd-sidebar-width) + 10px)) !important;
        }
        #kd-toast-container {
          right: 10px;
          left: 10px;
          width: auto;
        }
      }
      #kd-sb-collapse-tab {
        position: absolute;
        left: -50px;
        top: 50%;
        transform: translateY(-50%);
        width: 42px;
        height: 42px;
        background: rgba(13, 13, 17, 0.85);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 50%;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10;
      }
      #kd-sb-collapse-tab:hover {
        background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
        border-color: transparent;
        color: #ffffff;
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
      }
      #kd-sb-collapse-tab svg {
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
        transition: transform 0.25s ease, filter 0.25s ease;
      }
      #kd-sb-collapse-tab:hover svg {
        transform: scale(1.1);
        filter: drop-shadow(0 2px 6px rgba(167, 139, 250, 0.6)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.3));
      }
      #kd-sidebar.kd-collapsed #kd-sb-collapse-tab svg {
        transform: rotate(180deg);
      }
      #kd-sidebar.kd-collapsed #kd-sb-collapse-tab:hover svg {
        transform: rotate(180deg) scale(1.15);
      }
      .kd-sb-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 16px 16px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .kd-sb-logo-section {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .kd-sb-app-logo {
        border-radius: 8px;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
      }
      .kd-sb-header h3 {
        font-size: 16px;
        font-weight: 700;
        font-style: italic;
        margin: 0;
        color: #ffffff;
        line-height: 1.2;
        letter-spacing: 0.3px;
      }
      .kd-sb-subtitle {
        font-size: 10px;
        color: #94a3b8;
        display: block;
        font-weight: 400;
        letter-spacing: 0.2px;
      }
      .kd-sb-header-version {
        font-size: 9px;
        color: #818cf8;
        background: rgba(99, 102, 241, 0.1);
        border: 1px solid rgba(99, 102, 241, 0.2);
        padding: 1px 4px;
        border-radius: 4px;
        font-weight: 600;
        margin-left: 6px;
        display: inline-block;
        vertical-align: super;
        font-style: normal;
      }
      .kd-sb-close-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        color: #94a3b8;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.25s ease;
        box-sizing: border-box;
      }
      .kd-sb-close-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.2);
        transform: rotate(90deg);
      }
      .kd-sb-controls {
        padding: 20px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .kd-sb-control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 12px;
        padding: 12px 16px;
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .kd-sb-toggle-switch {
        position: relative;
        display: inline-block;
        width: 38px;
        height: 22px;
      }
      .kd-sb-toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .kd-sb-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(255, 255, 255, 0.1);
        transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
        border-radius: 22px;
      }
      .kd-sb-toggle-slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
        border-radius: 50%;
      }
      .kd-sb-toggle-switch input:checked + .kd-sb-toggle-slider {
        background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      }
      .kd-sb-toggle-switch input:checked + .kd-sb-toggle-slider:before {
        transform: translateX(16px);
      }
      .kd-sb-btn-select {
        width: 100%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: white;
        padding: 12px;
        border-radius: 12px;
        font-family: inherit;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }
      .kd-sb-btn-select:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .kd-sb-btn-select:active:not(:disabled) {
        transform: translateY(1px);
      }
      .kd-sb-btn-select.kd-active {
        background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%) !important;
        border: none !important;
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
        position: relative;
        overflow: hidden;
      }
      .kd-sb-btn-select.kd-active::after {
        content: "";
        position: absolute;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        background-color: #ef4444;
        border-radius: 50%;
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
        animation: kd-pulse 1.2s infinite;
      }
      @keyframes kd-pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
        }
        70% {
          box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        }
      }
      .kd-sb-main {
        flex-grow: 1;
        padding: 14px 16px 20px 16px;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .kd-sb-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }
      .kd-sb-section-header h4 {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 0;
        line-height: 1.2;
      }
      .kd-sb-badge {
        background: rgba(99, 102, 241, 0.12);
        color: #818cf8;
        border: 1px solid rgba(99, 102, 241, 0.2);
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 20px;
        line-height: 1.2;
      }
      .kd-sb-domain-container {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(99, 102, 241, 0.06);
        border: 1px solid rgba(99, 102, 241, 0.12);
        color: #a5b4fc;
        padding: 6px 12px;
        border-radius: 8px;
        width: fit-content;
        max-width: 50%;
        box-sizing: border-box;
      }
      .kd-sb-domain {
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
      }
      .kd-sb-scroll-area {
        flex-grow: 1;
        overflow-y: auto;
        border: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.15);
        border-radius: 14px;
        padding: 10px;
        min-height: 0;
        overscroll-behavior: contain;
      }
      .kd-sb-scroll-area::-webkit-scrollbar {
        width: 4px;
      }
      .kd-sb-scroll-area::-webkit-scrollbar-track {
        margin: 8px 0;
        background: transparent;
      }
      .kd-sb-scroll-area::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
      }
      .kd-sb-scroll-area::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .kd-sb-rules-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .kd-sb-rule-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.04);
        margin-bottom: 8px;
        gap: 10px;
        box-sizing: border-box;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .kd-sb-rule-item:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.08);
        transform: translateX(2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      .kd-sb-rule-item[data-type="single"] {
        border-left: 2px solid #10b981;
      }
      .kd-sb-rule-item[data-type="all"] {
        border-left: 2px solid #8b5cf6;
      }
      .kd-sb-rule-item.kd-broken {
        border-left-color: #ef4444 !important;
      }
      .kd-sb-rule-item.kd-inactive {
        border-left-color: #64748b !important;
        opacity: 0.7;
      }
      .kd-sb-rule-details {
        flex-grow: 1;
        overflow: hidden;
      }
      .kd-sb-rule-selector {
        font-size: 11px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #f1f5f9;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kd-sb-rule-meta {
        font-size: 9px;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
      }
      .kd-sb-rule-tag {
        font-weight: 600;
        font-size: 8px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        border-radius: 4px;
        padding: 1px 5px;
      }
      .kd-sb-rule-item[data-type="single"] .kd-sb-rule-tag {
        background: rgba(16, 185, 129, 0.1);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.15);
      }
      .kd-sb-rule-item[data-type="all"] .kd-sb-rule-tag {
        background: rgba(139, 92, 246, 0.1);
        color: #a78bfa;
        border: 1px solid rgba(139, 92, 246, 0.15);
      }
      .kd-sb-rule-status-tag {
        font-weight: 600;
        font-size: 8px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        border-radius: 4px;
        padding: 1px 5px;
      }
      .kd-sb-rule-status-tag[data-status="active"] {
        background: rgba(16, 185, 129, 0.08);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.15);
      }
      .kd-sb-rule-status-tag[data-status="broken"] {
        background: rgba(239, 68, 68, 0.08);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.15);
      }
      .kd-sb-rule-status-tag[data-status="inactive"] {
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .kd-sb-rule-item.kd-broken .kd-sb-rule-selector {
        opacity: 0.45;
        text-decoration: line-through;
        text-decoration-color: rgba(239, 68, 68, 0.4);
      }
      .kd-sb-btn-delete-rule {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s;
        box-sizing: border-box;
      }
      .kd-sb-btn-delete-rule:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.2);
        transform: scale(1.05);
      }
      .kd-sb-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
        height: 100%;
        box-sizing: border-box;
      }
      .kd-sb-empty-icon {
        color: rgba(99, 102, 241, 0.25);
        margin-bottom: 12px;
      }
      .kd-sb-empty-state p {
        font-size: 12px;
        color: #94a3b8;
        margin: 0;
        line-height: 1.5;
      }
      .kd-sb-footer {
        padding: 16px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .kd-sb-version {
        font-size: 11px;
        color: #94a3b8;
      }
      .kd-sb-author-link {
        color: #818cf8;
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s ease;
      }
      .kd-sb-author-link:hover {
        color: #a855f7;
        text-decoration: underline;
      }
      .kd-sb-btn-reset {
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #f87171;
        font-family: inherit;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .kd-sb-btn-reset:hover {
        background: #ef4444;
        color: white;
        border-color: transparent;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
        transform: translateY(-1px);
      }
      .kd-sb-btn-reset:active {
        transform: translateY(1px);
      }
    `;

    hider.kd_shadowRoot.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "kd-overlay";
    hider.kd_shadowRoot.appendChild(overlay);

    const tooltip = document.createElement("div");
    tooltip.id = "kd-tooltip";
    tooltip.innerHTML = `
      <span class="kd-tag" id="kd-tag-name">DIV</span>
      <button class="kd-btn" id="kd-btn-parent">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>Parent
      </button>
      <button class="kd-btn" id="kd-btn-back" disabled style="opacity: 0.5; cursor: not-allowed;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>Back
      </button>
      <button class="kd-btn kd-btn-delete" id="kd-btn-hide">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="3" y1="3" x2="21" y2="21"/>
        </svg>Hide
      </button>
    `;

    tooltip.querySelector("#kd-btn-parent").addEventListener("click", () => {
      if (hider.kd_selectedElement && hider.kd_selectedElement.parentElement) {
        hider.kd_selectionHistory.push(hider.kd_selectedElement);
        hider.kd_lastParentSelectionTime = Date.now();
        hider.kd_selectElement(hider.kd_selectedElement.parentElement);
      }
    });

    tooltip.querySelector("#kd-btn-back").addEventListener("click", () => {
      if (hider.kd_selectionHistory.length > 0) {
        const backElement = hider.kd_selectionHistory.pop();
        hider.kd_lastParentSelectionTime = Date.now();
        hider.kd_selectElement(backElement);
      }
    });

    tooltip.querySelector("#kd-btn-hide").addEventListener("click", () => {
      if (hider.kd_selectedElement) {
        hider.kd_confirmSelection(hider.kd_selectedElement);
      }
    });

    hider.kd_shadowRoot.appendChild(tooltip);



    const sidebar = document.createElement("div");
    sidebar.id = "kd-sidebar";
    sidebar.innerHTML = `
      <div id="kd-sb-collapse-tab" title="Toggle Sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <header class="kd-sb-header">
        <div class="kd-sb-logo-section">
          <svg class="kd-sb-app-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="38" height="38">
            <defs>
              <linearGradient id="kd_sb_grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#7c3aed" />
              </linearGradient>
              <filter id="kd_sb_shadow" x="-20%" y="-20%" width="150%" height="150%">
                <feDropShadow dx="3" dy="5" stdDeviation="4" flood-opacity="0.4" />
              </filter>
            </defs>
            <rect width="128" height="128" rx="28" fill="url(#kd_sb_grad)" />
            <rect x="16" y="16" width="96" height="96" rx="14" fill="none" stroke="#ffffff" stroke-width="8" stroke-dasharray="12 8" opacity="0.9" />
            <path d="M28 64 C40 39, 88 39, 100 64 C88 89, 40 89, 28 64 Z" fill="none" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" />
            <circle cx="64" cy="64" r="12" fill="#ffffff" />
            <line x1="24" y1="24" x2="104" y2="104" stroke="#f43f5e" stroke-width="10" stroke-linecap="round" filter="url(#kd_sb_shadow)" />
          </svg>
          <div>
            <h3>KD Element Hider <span class="kd-sb-header-version">v1.0.0</span></h3>
            <span class="kd-sb-subtitle">Click to Remove Any Element</span>
          </div>
        </div>
        <button class="kd-sb-close-btn" id="kd-sb-close" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <div class="kd-sb-controls">
        <div class="kd-sb-control-row">
          <span>Extension Active</span>
          <label class="kd-sb-toggle-switch">
            <input type="checkbox" id="kd-sb-global-toggle">
            <span class="kd-sb-toggle-slider"></span>
          </label>
        </div>
        <button class="kd-sb-btn-select" id="kd-sb-select-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/>
            <path d="m12 12 9 3-4 1-1 4-4-9Z"/>
          </svg>
          <span>Launch Element Selector</span>
        </button>
      </div>

      <main class="kd-sb-main">
        <div class="kd-sb-section-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h4>Hiding Rules</h4>
            <span class="kd-sb-badge" id="kd-sb-rules-count">0</span>
          </div>
          <div class="kd-sb-domain-container">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.7;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span class="kd-sb-domain" id="kd-sb-domain-name"></span>
          </div>
        </div>
        
        <div class="kd-sb-scroll-area">
          <ul class="kd-sb-rules-list" id="kd-sb-rules-list"></ul>
          <div class="kd-sb-empty-state" id="kd-sb-empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="kd-sb-empty-icon">
              <circle cx="12" cy="12" r="10"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <p>No elements hidden yet. Use the tool above to hide any unwanted element.</p>
          </div>
        </div>
      </main>

      <footer class="kd-sb-footer">
        <span class="kd-sb-version">Crafted by <a href="https://khvichadev.com" target="_blank" class="kd-sb-author-link">KhvichaDev</a></span>
        <button class="kd-sb-btn-reset" id="kd-sb-clear-site" style="display: none;">Restore All Elements</button>
      </footer>
    `;

    sidebar.querySelector("#kd-sb-domain-name").textContent = window.location.hostname;

    sidebar.querySelector("#kd-sb-collapse-tab").addEventListener("click", () => {
      if (!hider.kd_isContextValid()) return;
      const isCollapsed = sidebar.classList.toggle("kd-collapsed");
      hider.kd_isSidebarCollapsed = isCollapsed;
      hider.kd_setSessionStorage("kd_isSidebarCollapsed", isCollapsed);
    });

    sidebar.querySelector("#kd-sb-close").addEventListener("click", () => {
      hider.kd_toggleSidebar();
    });

    sidebar.querySelector("#kd-sb-global-toggle").addEventListener("change", (e) => {
      if (!hider.kd_isContextValid()) return;
      const isActive = e.target.checked;
      chrome.storage.local.set({ kd_isActive: isActive }, () => {
        if (window.KDNotification) {
          window.KDNotification.show({
            type: isActive ? "success" : "warning",
            message: isActive ? "Element hider enabled." : "Element hider disabled.",
            duration: 2000,
            position: "center",
            theme: hider.kd_getPreferredTheme()
          });
        }
      });
    });

    sidebar.querySelector("#kd-sb-select-btn").addEventListener("click", () => {
      if (!hider.kd_isActive) return;
      if (!hider.kd_selectorModeActive) {
        hider.kd_activateSelectorMode();
      } else {
        hider.kd_deactivateSelectorMode();
      }
    });

    sidebar.querySelector("#kd-sb-clear-site").addEventListener("click", () => {
      if (!hider.kd_isContextValid()) return;
      const hostname = window.location.hostname;

      const performClear = () => {
        chrome.storage.local.get(["kd_hiddenRules"], (data) => {
          if (!hider.kd_isContextValid()) return;
          const rules = data.kd_hiddenRules || {};
          if (rules[hostname]) {
            delete rules[hostname];
            if (!hider.kd_isSidebarOpen) {
              chrome.runtime.sendMessage({ type: "kd_unregister_script", origin: `${window.location.protocol}//${window.location.hostname}/*` });
            }
            chrome.storage.local.set({ kd_hiddenRules: rules }, () => {
              if (window.KDNotification) {
                window.KDNotification.show({
                  type: "info",
                  message: "All elements restored.",
                  duration: 2000,
                  position: "center",
                  theme: hider.kd_getPreferredTheme()
                });
              }
            });
          }
        });
      };

      if (window.KDNotification) {
        window.KDNotification.show({
          type: "warning",
          title: "Restore all elements?",
          message: "Are you sure you want to restore all hidden elements on this website?",
          isModal: true,
          position: "center",
          theme: hider.kd_getPreferredTheme(),
          buttons: [
            { text: "Restore All", className: "kd-btn-danger", value: "restore" },
            { text: "Cancel", value: "cancel" }
          ]
        }).then((res) => {
          if (res === "restore") {
            performClear();
          }
        });
      } else {
        performClear();
      }
    });

    hider.kd_shadowRoot.appendChild(sidebar);
    document.documentElement.appendChild(hider.kd_shadowHost);
  };

  /**
   * Destroys the Shadow UI elements from the page.
   */
  hider.kd_removeShadowUI = function () {
    hider.kd_clearActiveToast();
    const host = document.getElementById(hider.kd_SHADOW_HOST_ID);
    if (host) {
      host.remove();
    }
    hider.kd_shadowRoot = null;
    hider.kd_shadowHost = null;
  };

  /**
   * Safely removes the currently active toast notification.
   */
  hider.kd_clearActiveToast = function () {
    if (window.KDNotification) {
      window.KDNotification.close();
    }
  };

  /**
   * Resets active selection variables and hides the selection overlays.
   */
  hider.kd_clearSelection = function () {
    hider.kd_selectedElement = null;
    hider.kd_hoveredElement = null;
    hider.kd_selectionHistory = [];
    if (hider.kd_shadowRoot) {
      const overlay = hider.kd_shadowRoot.getElementById("kd-overlay");
      const tooltip = hider.kd_shadowRoot.getElementById("kd-tooltip");
      if (overlay) overlay.style.display = "none";
      if (tooltip) tooltip.style.display = "none";
    }
  };

  /**
   * Highlights a target element in the overlay framework.
   */
  hider.kd_selectElement = function (element) {
    if (!element || element === document.body || element === document.documentElement) return;
    if (element === hider.kd_shadowHost) return;

    if (!hider.kd_isMouseOverShadow) {
      hider.kd_selectionHistory = [];
    }

    hider.kd_selectedElement = element;

    const rect = element.getBoundingClientRect();
    const overlay = hider.kd_shadowRoot.getElementById("kd-overlay");
    const tooltip = hider.kd_shadowRoot.getElementById("kd-tooltip");

    if (overlay && tooltip) {
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = "block";

      const tagName = hider.kd_shadowRoot.getElementById("kd-tag-name");
      tagName.textContent = element.tagName;

      if (!hider.kd_isMouseOverShadow) {
        let tooltipTop = rect.top - 50;
        if (tooltipTop < 10) {
          tooltipTop = rect.bottom + 10;
        }
        let tooltipLeft = rect.left + (rect.width / 2) - 130;
        if (tooltipLeft < 10) tooltipLeft = 10;
        if (tooltipLeft + 260 > window.innerWidth) {
          tooltipLeft = window.innerWidth - 270;
        }

        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.left = `${tooltipLeft}px`;
      }

      const parentBtn = hider.kd_shadowRoot.getElementById("kd-btn-parent");
      if (parentBtn) {
        const parent = element.parentElement;
        const hasParent = parent && parent !== document.body && parent !== document.documentElement;
        parentBtn.disabled = !hasParent;
        parentBtn.style.opacity = hasParent ? "1" : "0.5";
        parentBtn.style.cursor = hasParent ? "pointer" : "not-allowed";
      }

      const backBtn = hider.kd_shadowRoot.getElementById("kd-btn-back");
      if (backBtn) {
        const hasHistory = hider.kd_selectionHistory.length > 0;
        backBtn.disabled = !hasHistory;
        backBtn.style.opacity = hasHistory ? "1" : "0.5";
        backBtn.style.cursor = hasHistory ? "pointer" : "not-allowed";
      }

      tooltip.style.display = "flex";
    }
  };

  /**
   * Synchronizes the text and styling state of the selector button in the sidebar.
   */
  hider.kd_updateSelectorButtonState = function (active) {
    if (!hider.kd_shadowRoot) return;
    const btn = hider.kd_shadowRoot.getElementById("kd-sb-select-btn");
    if (!btn) return;

    if (active) {
      btn.classList.add("kd-active");
      btn.querySelector("span").textContent = "Click on Element to Hide";
    } else {
      btn.classList.remove("kd-active");
      btn.querySelector("span").textContent = "Launch Element Selector";
    }
    btn.disabled = !hider.kd_isActive;
    btn.style.opacity = hider.kd_isActive ? "1" : "0.5";
  };

  /**
   * Renders the list of rules in the sidebar using real-time storage states.
   */
  hider.kd_renderSidebarRules = function (rules) {
    if (!hider.kd_shadowRoot) return;

    const listEl = hider.kd_shadowRoot.getElementById("kd-sb-rules-list");
    const countEl = hider.kd_shadowRoot.getElementById("kd-sb-rules-count");
    const emptyEl = hider.kd_shadowRoot.getElementById("kd-sb-empty-state");
    const clearEl = hider.kd_shadowRoot.getElementById("kd-sb-clear-site");

    if (!listEl || !countEl || !emptyEl || !clearEl) return;

    listEl.innerHTML = "";
    countEl.textContent = rules.length;

    if (rules.length === 0) {
      listEl.style.display = "none";
      emptyEl.style.display = "flex";
      clearEl.style.display = "none";
      return;
    }

    listEl.style.display = "block";
    emptyEl.style.display = "none";
    clearEl.style.display = "block";

    const hostname = window.location.hostname;
    const currentPath = window.location.pathname;

    // Build a combined selector for all rules to query the DOM once in bulk
    const matchedSelectors = new Set();
    const validSelectors = rules
      .map((r) => r.kd_selector)
      .filter((s) => {
        try {
          document.querySelector(s);
          return true;
        } catch (e) {
          return false;
        }
      });

    if (validSelectors.length > 0) {
      try {
        const combinedSelector = validSelectors.join(", ");
        const matchedElements = document.querySelectorAll(combinedSelector);
        if (matchedElements.length > 0) {
          matchedElements.forEach((el) => {
            rules.forEach((rule) => {
              try {
                if (el.matches(rule.kd_selector)) {
                  matchedSelectors.add(rule.kd_selector);
                }
              } catch (e) {}
            });
          });
        }
      } catch (e) {
        // Fallback: individual query if combined selector fails
        rules.forEach((rule) => {
          try {
            if (document.querySelector(rule.kd_selector) !== null) {
              matchedSelectors.add(rule.kd_selector);
            }
          } catch (err) {}
        });
      }
    }

    rules.forEach((rule, index) => {
       const li = document.createElement("li");
       li.className = "kd-sb-rule-item";
       li.setAttribute("data-type", rule.kd_type);

       const isMatching = matchedSelectors.has(rule.kd_selector);

       let status = "";
       if (isMatching) {
         status = "active";
       } else if (rule.kd_pathname === currentPath) {
         status = "broken";
       } else {
         status = "inactive";
       }

        if (status === "broken") {
          li.classList.add("kd-broken");
        } else if (status === "inactive") {
          li.classList.add("kd-inactive");
        }

       const details = document.createElement("div");
       details.className = "kd-sb-rule-details";

       const selectorText = document.createElement("div");
       selectorText.className = "kd-sb-rule-selector";
       selectorText.textContent = rule.kd_selector;

       const meta = document.createElement("div");
       meta.className = "kd-sb-rule-meta";

       const tag = document.createElement("span");
       tag.className = "kd-sb-rule-tag";
       tag.textContent = rule.kd_type === "all" ? "Group" : "Single";
       tag.title = rule.kd_type === "all"
         ? "Hides all elements matching this selector"
         : "Hides only this specific element";

       meta.appendChild(tag);

       if (status) {
         const statusTag = document.createElement("span");
         statusTag.className = "kd-sb-rule-status-tag";
         statusTag.setAttribute("data-status", status);
         statusTag.textContent = status.charAt(0).toUpperCase() + status.slice(1);

         if (status === "active") {
           statusTag.title = "Currently hiding elements on this page";
         } else if (status === "broken") {
           statusTag.title = "This element is no longer found on this page. It has probably been removed from the site.";
         } else if (status === "inactive") {
           statusTag.title = "This element is not found on this page, although it was created on a different URL.";
         }

         meta.appendChild(statusTag);
       }

       const dateText = document.createElement("span");
       const d = new Date(rule.kd_timestamp);
       const day = String(d.getDate()).padStart(2, '0');
       const month = String(d.getMonth() + 1).padStart(2, '0');
       const year = d.getFullYear();
       dateText.textContent = `${day}/${month}/${year}`;

       meta.appendChild(dateText);
       details.appendChild(selectorText);
       details.appendChild(meta);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "kd-sb-btn-delete-rule";
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
      deleteBtn.addEventListener("click", () => {
        hider.kd_removeRuleByIndex(hostname, index);
      });

      li.appendChild(details);
      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });
  };

  /**
   * Prompts the user using KDNotification to hide either the clicked element or similar elements.
   */
  hider.kd_showMultiDeletePrompt = function (element, singleSelector, generalizedSelector, count) {
    if (!window.KDNotification) return;

    window.KDNotification.show({
      type: "info",
      title: "Similar elements detected",
      message: `We found <strong style="font-weight: 800; color: var(--kd-text-primary);">${count}</strong> matching elements with similar classes on this page. Do you want to hide all of them?`,
      duration: 0, // Keep visible until choice is made
      position: "center",
      theme: hider.kd_getPreferredTheme(),
      buttons: [
        { text: "Only This", value: "single" },
        { text: "Hide All", className: "kd-btn-danger", value: "all" },
        { text: "Cancel", value: "cancel" }
      ]
    }).then((res) => {
      if (res === "single") {
        hider.kd_saveRule(singleSelector, "single");
        hider.kd_clearSelection();
      } else if (res === "all") {
        hider.kd_saveRule(generalizedSelector, "all");
        hider.kd_clearSelection();
      } else {
        hider.kd_clearSelection();
      }
    });
  };
})();
