import { createSignal } from "solid-js";
import { getLocale, setLocale as setParaglideLocale } from "../paraglide/runtime.js";

type supportedLangs = "en" | "de";

const [locale, setLocaleState] = createSignal<supportedLangs>(getLocale());

export { locale, setLocale };

function setLocale(newLang: supportedLangs)
{
  setParaglideLocale(newLang, { reload: false });
  setLocaleState(newLang);
}
