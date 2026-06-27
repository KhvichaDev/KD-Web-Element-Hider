/**
 * Background script for KD Web Element Hider.
 * Handles toolbar icon clicks to toggle the injected sidebar dashboard.
 */

// Enable content scripts to access chrome.storage.session for tab-specific state tracking
if (chrome.storage && chrome.storage.session && chrome.storage.session.setAccessLevel) {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {
    // Silent catch
  });
}

/**
 * Updates the badge count for a specific tab to show the number of hidden elements.
 */
function kd_updateTabBadge(tabId, count, isActive) {
  if (isActive) {
    if (count > 0) {
      chrome.action.setBadgeText({ tabId: tabId, text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#6366f1" }); // Indigo for hidden count
    } else {
      chrome.action.setBadgeText({ tabId: tabId, text: "ON" });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#10b981" }); // Emerald green for ON state
    }
  } else {
    chrome.action.setBadgeText({ tabId: tabId, text: "" });
  }
}

/**
 * Listens for toolbar icon clicks. Handles host permission request (user gesture context)
 * and dynamically injects content.js if not running.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url) return;

  // Only request host permissions for http and https web URLs
  const urlString = tab.url;
  if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
    kd_injectAndToggle(tab);
    return;
  }

  try {
    const url = new URL(urlString);
    const origin = `${url.protocol}//${url.hostname}/*`;

    // Check if we have global host permissions first
    chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }, (hasGlobalPermission) => {
      if (chrome.runtime.lastError) {
        kd_injectAndToggle(tab);
        return;
      }

      if (hasGlobalPermission) {
        kd_reconcileDynamicScripts();
        kd_injectAndToggle(tab);
      } else {
        // Check if we have permission for this specific origin
        chrome.permissions.contains({ origins: [origin] }, (hasSitePermission) => {
          if (!chrome.runtime.lastError && hasSitePermission) {
            kd_reconcileDynamicScripts();
            kd_injectAndToggle(tab);
          } else {
            kd_requestConsentAndPermission(tab, origin);
          }
        });
      }
    });
  } catch (e) {
    kd_injectAndToggle(tab);
  }
});

/**
 * Verifies if the content script is alive and active, otherwise injects it dynamically.
 */
/**
 * Injects content scripts and requests user permission consent via KDNotification modal.
 */
function kd_requestConsentAndPermission(tab, origin) {
  chrome.tabs.sendMessage(tab.id, { type: "kd_ping" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.alive) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/utils.js", "content/notifications-kd.min.js", "content/ui.js", "content/content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          kd_injectAndToggle(tab);
          return;
        }
        kd_sendConsentMessage(tab, origin);
      });
    } else {
      kd_sendConsentMessage(tab, origin);
    }
  });
}

/**
 * Sends a message to the content script to display the permission explanation modal.
 */
function kd_sendConsentMessage(tab, origin) {
  chrome.tabs.sendMessage(tab.id, { type: "kd_request_global_permission_consent", origin: origin }, (response) => {
    if (chrome.runtime.lastError) {
      kd_injectAndToggle(tab);
    }
  });
}

function kd_injectAndToggle(tab) {
  chrome.tabs.sendMessage(tab.id, { type: "kd_ping" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.alive) {
      // Content script is not running or responsive. Inject it dynamically!
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/utils.js", "content/notifications-kd.min.js", "content/ui.js", "content/content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to inject content script:", chrome.runtime.lastError);
          return;
        }
        // Script is injected! Send toggle message
        chrome.tabs.sendMessage(tab.id, { type: "kd_toggle_sidebar", tabId: tab.id }, () => {
          if (chrome.runtime.lastError) {
            // Silent catch
          }
        });
      });
    } else {
      // Script is already active. Just toggle it!
      chrome.tabs.sendMessage(tab.id, { type: "kd_toggle_sidebar", tabId: tab.id }, () => {
        if (chrome.runtime.lastError) {
          // Silent catch
        }
      });
    }
  });
}

let kd_isRegistering = false;
let kd_pendingRegistration = null;

/**
 * Helper to register or update the single global dynamic content script with a list of matches.
 * Restricts matches only to origins for which the extension has host permissions.
 */
function kd_updateGlobalScript(origins) {
  const scriptId = "kd_global_hider_script";
  
  if (origins.length === 0) {
    kd_registerOrUpdateScript(scriptId, []);
    return;
  }

  // Filter origins to only those we currently have host permissions for (prevents registration errors)
  const permittedOrigins = [];
  let pending = origins.length;

  origins.forEach((origin) => {
    chrome.permissions.contains({ origins: [origin] }, (permitted) => {
      if (!chrome.runtime.lastError && permitted) {
        permittedOrigins.push(origin);
      }
      pending--;
      if (pending === 0) {
        kd_registerOrUpdateScript(scriptId, permittedOrigins);
      }
    });
  });
}

/**
 * Performs the actual unregister and register calls to update the global script.
 * Utilizes a concurrency lock queue to prevent race conditions.
 */
function kd_registerOrUpdateScript(scriptId, origins) {
  if (kd_isRegistering) {
    kd_pendingRegistration = origins;
    return;
  }

  kd_isRegistering = true;
  
  const next = () => {
    kd_isRegistering = false;
    if (kd_pendingRegistration) {
      const nextOrigins = kd_pendingRegistration;
      kd_pendingRegistration = null;
      kd_registerOrUpdateScript(scriptId, nextOrigins);
    }
  };

  if (origins.length === 0) {
    chrome.scripting.unregisterContentScripts({ ids: [scriptId] }, () => {
      if (chrome.runtime.lastError) {
        // Silent catch
      }
      next();
    });
    return;
  }

  chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] }, (scripts) => {
    if (chrome.runtime.lastError) {
      next();
      return;
    }

    if (scripts && scripts.length > 0) {
      chrome.scripting.unregisterContentScripts({ ids: [scriptId] }, () => {
        if (chrome.runtime.lastError) {
          next();
          return;
        }
        kd_registerScriptActual(scriptId, origins, next);
      });
    } else {
      kd_registerScriptActual(scriptId, origins, next);
    }
  });
}

/**
 * Registers the global content script object inside Chrome's registry.
 */
function kd_registerScriptActual(scriptId, origins, callback) {
  chrome.scripting.registerContentScripts([
    {
      id: scriptId,
      matches: origins,
      js: ["content/utils.js", "content/notifications-kd.min.js", "content/ui.js", "content/content.js"],
      runAt: "document_start"
    }
  ], () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to register global content script:", chrome.runtime.lastError.message);
    }
    if (callback) callback();
  });
}

/**
 * Reconciles the single registered content script matches with saved rules and active sidebars.
 * This completely avoids Chrome's 100-domain registration limit.
 */
function kd_reconcileDynamicScripts() {
  chrome.storage.local.get(["kd_isActive", "kd_hiddenRules"], (localData) => {
    if (chrome.runtime.lastError) return;

    const isActive = localData.kd_isActive !== false;
    const rules = localData.kd_hiddenRules || {};

    chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }, (hasGlobal) => {
      if (!chrome.runtime.lastError && hasGlobal && isActive) {
        // If active globally and we have global permissions, register the script for all URLs!
        kd_updateGlobalScript(["http://*/*", "https://*/*"]);
      } else {
        // Otherwise, reconcile site-by-site based on rules and open sidebars
        const activeOrigins = new Set();

        // 1. Add origins that have active rules saved
        Object.keys(rules).forEach((hostname) => {
          if (rules[hostname] && rules[hostname].length > 0) {
            activeOrigins.add(`*://${hostname}/*`);
          }
        });

        // 2. Add origins that have an open sidebar (survival across refresh with 0 rules)
        chrome.storage.session.get(null, (sessionData) => {
          if (chrome.runtime.lastError) return;
          
          const sessionKeys = Object.keys(sessionData || {});
          let pendingTabs = 0;

          sessionKeys.forEach((key) => {
            if (key.startsWith("kd_isSidebarOpen_") && sessionData[key] === true) {
              const tabId = parseInt(key.replace("kd_isSidebarOpen_", ""), 10);
              if (!isNaN(tabId)) {
                pendingTabs++;
                chrome.tabs.get(tabId, (tab) => {
                  if (!chrome.runtime.lastError && tab && tab.url) {
                    try {
                      const url = new URL(tab.url);
                      if (url.protocol.startsWith("http")) {
                        activeOrigins.add(`*://${url.hostname}/*`);
                      }
                    } catch (e) {}
                  }
                  pendingTabs--;
                  if (pendingTabs === 0) {
                    kd_updateGlobalScript(Array.from(activeOrigins));
                  }
                });
              }
            }
          });

          if (pendingTabs === 0) {
            kd_updateGlobalScript(Array.from(activeOrigins));
          }
        });
      }
    });
  });
}

/**
 * Listens for messages from content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "kd_get_tab_id") {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
  } else if (message.type === "kd_update_badge" && sender.tab) {
    kd_updateTabBadge(sender.tab.id, message.count, message.isActive);
  } else if (message.type === "kd_register_script") {
    kd_reconcileDynamicScripts();
  } else if (message.type === "kd_unregister_script") {
    kd_reconcileDynamicScripts();
  } else if (message.type === "kd_global_consent_granted" && sender.tab) {
    chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] }, (granted) => {
      if (!chrome.runtime.lastError && granted) {
        kd_reconcileDynamicScripts();
      }
      kd_injectAndToggle(sender.tab);
    });
  } else if (message.type === "kd_consent_granted" && sender.tab) {
    chrome.permissions.request({ origins: [message.origin] }, (granted) => {
      if (!chrome.runtime.lastError && granted) {
        kd_reconcileDynamicScripts();
      }
      kd_injectAndToggle(sender.tab);
    });
  } else if (message.type === "kd_consent_denied" && sender.tab) {
    kd_injectAndToggle(sender.tab);
  }
  return true;
});

/**
 * Monitors storage changes. Reconciles scripts if session storage changed (sidebar toggle),
 * and resets badges if globally deactivated.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session") {
    kd_reconcileDynamicScripts();
  }
  
  if (areaName === "local") {
    if (changes.kd_isActive) {
      kd_reconcileDynamicScripts();
      if (changes.kd_isActive.newValue === false) {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.action.setBadgeText({ tabId: tab.id, text: "" });
            }
          });
        });
      }
    }
  }
});

/**
 * Cleans up session storage when a tab is removed, preventing zombie tab states.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.remove([
      `kd_isSidebarOpen_${tabId}`,
      `kd_isSidebarCollapsed_${tabId}`
    ]).catch(() => {});
  }
});

// Reconcile and register dynamic scripts on startup/install
chrome.runtime.onInstalled.addListener(() => {
  kd_reconcileDynamicScripts();
});

chrome.runtime.onStartup.addListener(() => {
  kd_reconcileDynamicScripts();
});

// Run immediately when background script loads
kd_reconcileDynamicScripts();
