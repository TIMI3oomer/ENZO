import { lazy } from "react";

// React.lazy() that survives a new deploy. Each deploy renames the page
// files (index-abc123.js...), so a tab opened BEFORE the deploy asks for
// files that no longer exist and the page stays blank. When that happens
// the site reloads once to pick up the new version; a sessionStorage flag
// stops it from reloading in a loop if something else is wrong.
export function lazyWithReload(load) {
  return lazy(async () => {
    try {
      const mod = await load();
      sessionStorage.removeItem("enzo_chunk_reload");
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem("enzo_chunk_reload")) {
        sessionStorage.setItem("enzo_chunk_reload", "1");
        window.location.reload();
        return new Promise(() => {}); // page is reloading
      }
      throw err;
    }
  });
}
