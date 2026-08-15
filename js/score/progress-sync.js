// Compatibility facade for legacy game calls.
// Canonical persistence now lives in phase1-canonical-state.js on every Login Free surface.
(function (global) {
  'use strict';

  function canonical() { return global.PHASE1_CANONICAL || null; }
  function push() {
    var api = canonical();
    if (api) api.schedule();
  }
  function pull() {
    var api = canonical();
    if (api) api.pull();
  }

  global.TF_SYNC = {
    push: push,
    pull: pull,
    isOn: function () {
      var api = canonical();
      return !!(api && api.status().owner);
    }
  };
})(window);
