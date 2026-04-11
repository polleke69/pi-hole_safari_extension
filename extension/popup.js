import {
  extractHostname,
  normalizeBaseUrl,
  createSession,
  addAllowExactDomain,
  removeAllowExactDomain,
  isDomainAlreadyOnAllowlistError,
} from "./lib/pihole-client.js";

const domainEl = document.getElementById("domain");
const statusEl = document.getElementById("status");
const addBtn = document.getElementById("add");
const removeBtn = document.getElementById("remove");
const openOptionsBtn = document.getElementById("open-options");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setActionsBusy(busy) {
  addBtn.disabled = busy;
  removeBtn.disabled = busy;
}

function isRestrictedUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return !["http:", "https:"].includes(u.protocol);
  } catch {
    return true;
  }
}

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.url ?? null;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "piholeBaseUrl",
    "piholePassword",
  ]);
  return {
    baseUrl: normalizeBaseUrl(stored.piholeBaseUrl || ""),
    password: stored.piholePassword || "",
  };
}

async function main() {
  const tabUrl = await getActiveTabUrl();

  if (isRestrictedUrl(tabUrl)) {
    domainEl.textContent = "Geen website (gebruik een http(s)-pagina).";
    addBtn.disabled = true;
    removeBtn.disabled = true;
    return;
  }

  let hostname;
  try {
    hostname = extractHostname(tabUrl);
  } catch {
    domainEl.textContent = "Ongeldige URL.";
    addBtn.disabled = true;
    removeBtn.disabled = true;
    return;
  }

  domainEl.textContent = hostname;

  addBtn.addEventListener("click", async () => {
    const { baseUrl, password } = await loadSettings();
    if (!baseUrl) {
      setStatus("Stel eerst de Pi-hole URL in (Instellingen).", true);
      return;
    }

    setActionsBusy(true);
    setStatus("Bezig…");

    try {
      const { sid } = await createSession(baseUrl, password);
      const result = await addAllowExactDomain(baseUrl, sid, hostname, {
        comment: "Pi-hole Allowlist (Safari)",
      });

      if (result.errors?.length) {
        const first = result.errors[0];
        if (isDomainAlreadyOnAllowlistError(first)) {
          setStatus(`Stond al op de allowlist: ${hostname}`, false);
          return;
        }
        const hint = first?.error || first?.message || "";
        setStatus(
          `Mislukt voor ${hostname}${hint ? `: ${hint}` : ""}`,
          true,
        );
        return;
      }

      if (!result.success?.length) {
        setStatus("Geen bevestiging van Pi-hole; controleer de web UI.", true);
        return;
      }

      setStatus(`Toegevoegd: ${hostname}`, false);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    } finally {
      setActionsBusy(false);
    }
  });

  removeBtn.addEventListener("click", async () => {
    const { baseUrl, password } = await loadSettings();
    if (!baseUrl) {
      setStatus("Stel eerst de Pi-hole URL in (Instellingen).", true);
      return;
    }

    setActionsBusy(true);
    setStatus("Bezig…");

    try {
      const { sid } = await createSession(baseUrl, password);
      const result = await removeAllowExactDomain(baseUrl, sid, hostname);

      if (result.notFound) {
        setStatus(`Stond niet op de allowlist: ${hostname}`, false);
        return;
      }

      if (result.removed) {
        setStatus(`Verwijderd van allowlist: ${hostname}`, false);
        return;
      }

      setStatus("Geen bevestiging van Pi-hole; controleer de web UI.", true);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    } finally {
      setActionsBusy(false);
    }
  });
}

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

main();
