/**
 * Security Guard: Disables DevTools (Right-click, F12, Inspect shortcuts, Console)
 * for all remote machines / clients, while preserving full access for the host machine (localhost).
 */
export const initDevToolsProtection = () => {
  // Check if running on the local host machine or authorized developer session
  const isHost = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname === '::1';

  if (window.location.search.includes('devtools=allow')) {
    try { 
      // Store with a 24-hour expiry timestamp so it can't persist forever
      const expiry = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('allow_devtools', String(expiry)); 
    } catch (e) {}
  }

  let isDevTokenValid = false;
  try {
    const storedExpiry = localStorage.getItem('allow_devtools');
    if (storedExpiry) {
      const expiryMs = parseInt(storedExpiry, 10);
      if (!isNaN(expiryMs) && Date.now() < expiryMs) {
        isDevTokenValid = true;
      } else {
        // Token expired — remove it
        localStorage.removeItem('allow_devtools');
      }
    }
  } catch (e) {}

  const isDevAuthorized = isHost || isDevTokenValid;

  // Do nothing on the host machine or authorized developer session - full access allowed
  if (isDevAuthorized) return;

  // 1. Block Context Menu (Right Click)
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // 2. Block DevTools Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // F12 key
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    // Ctrl+Shift+C / Cmd+Option+C (Inspect Element)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && 
        ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
      e.preventDefault();
      return false;
    }

    // Ctrl+U / Cmd+Option+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      return false;
    }

    // Ctrl+S (Windows/Linux) / Cmd+S (Mac) (Save Page)
    // Explicitly check !e.shiftKey so Win+Shift+S (Windows Snipping Tool) is NEVER intercepted
    if (!e.shiftKey && !e.altKey && (e.ctrlKey || (e.metaKey && !navigator.userAgent.includes('Windows'))) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      return false;
    }
  });

  // 3. Silence debug/verbose Console outputs on remote devices (keep console.error for diagnostics)
  try {
    const noop = () => {};
    window.console.log = noop;
    window.console.debug = noop;
    window.console.info = noop;
    window.console.dir = noop;
  } catch (err) {}
};
