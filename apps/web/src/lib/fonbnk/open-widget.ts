/**
 * Opens a Fonbnk widget (on-ramp or off-ramp) in the most compatible way for
 * the current browser.
 *
 * Desktop / normal mobile browsers: a popup window is opened synchronously
 * (inside the click handler so it isn't blocked) and then navigated to the
 * Fonbnk URL. The opener stays on the dashboard and receives a postMessage from
 * /fonbnk/return when the order finishes.
 *
 * In-app browsers (e.g. MetaMask's built-in WebView): window.open() popups are
 * unsupported and return null, so we fall back to navigating the CURRENT tab to
 * the Fonbnk URL. /fonbnk/return detects the missing opener and offers a "Back
 * to Drip" link instead of postMessage + window.close().
 */
export async function openFonbnkWidget(opts: {
  endpoint: string; // e.g. "/api/fonbnk/widget-url" | "/api/fonbnk/offramp-url"
  params: URLSearchParams; // address, asset, network, redirectUrl
  popupName?: string;
}): Promise<"popup" | "redirect"> {
  // Must be opened synchronously in the click handler so browsers don't block
  // it. In a WebView this simply returns null and we redirect instead.
  const popup = window.open(
    "about:blank",
    opts.popupName ?? "fonbnk",
    "width=480,height=760,menubar=no,toolbar=no,location=yes,resizable=yes",
  );

  let json: { url?: string; error?: string };
  try {
    const res = await fetch(`${opts.endpoint}?${opts.params}`);
    json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      throw new Error(json.error ?? "Could not get Fonbnk URL");
    }
  } catch (err) {
    if (popup && !popup.closed) popup.close();
    throw err;
  }

  if (popup && !popup.closed) {
    popup.location.href = json.url;
    popup.focus();
    return "popup";
  }

  // Popup blocked / unsupported (in-app browser) → navigate the current tab.
  window.location.href = json.url;
  return "redirect";
}
