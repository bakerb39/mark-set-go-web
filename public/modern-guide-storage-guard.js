/* Mark, Set, Go! Modern Guide storage guard v0.11.4 */
(() => {
  'use strict';
  const BLOCKED_KEY = 'markSetGoModernGuideLibraryV1';
  try { window.localStorage.removeItem(BLOCKED_KEY); } catch {}

  const nativeSetItem = Storage.prototype.setItem;
  if (nativeSetItem.__msgModernGuideGuard === true) return;

  function guardedSetItem(key, value) {
    if (String(key) === BLOCKED_KEY) {
      try { this.removeItem(BLOCKED_KEY); } catch {}
      return;
    }
    return nativeSetItem.call(this, key, value);
  }

  Object.defineProperty(guardedSetItem, '__msgModernGuideGuard', { value:true });
  Storage.prototype.setItem = guardedSetItem;
})();
