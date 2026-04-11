import { normalizeBaseUrl } from "./lib/pihole-client.js";

const form = document.getElementById("form");
const baseUrlEl = document.getElementById("baseUrl");
const passwordEl = document.getElementById("password");
const savedEl = document.getElementById("saved");

async function load() {
  const stored = await chrome.storage.local.get([
    "piholeBaseUrl",
    "piholePassword",
  ]);
  baseUrlEl.value = stored.piholeBaseUrl || "";
  passwordEl.value = stored.piholePassword || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const baseUrl = normalizeBaseUrl(baseUrlEl.value);
  const password = passwordEl.value;
  await chrome.storage.local.set({
    piholeBaseUrl: baseUrl,
    piholePassword: password,
  });
  savedEl.textContent = "Opgeslagen.";
  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 2000);
});

load();
