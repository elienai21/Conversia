// src/components/InstallPrompt.tsx
// Shows a native-looking "Add to home screen" banner when the browser fires
// the beforeinstallprompt event (Android Chrome / Edge).
// On iOS Safari the banner shows a manual tip since iOS doesn't support the event.
import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";
import "./InstallPrompt.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or user dismissed permanently
    if (isInStandaloneMode()) return;
    if (localStorage.getItem("pwa-install-dismissed")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS: show manual hint after 30s if not standalone
    if (isIOS()) {
      const timer = setTimeout(() => {
        if (!localStorage.getItem("pwa-install-dismissed")) {
          setShowIOSHint(true);
        }
      }, 30_000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDeferredPrompt(null);
    setShowIOSHint(false);
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  if (dismissed) return null;

  // Android Chrome / Edge: native install prompt
  if (deferredPrompt) {
    return (
      <div className="install-prompt" role="banner">
        <div className="install-prompt-icon">
          <Download size={20} />
        </div>
        <div className="install-prompt-text">
          <strong>Instalar Conversia</strong>
          <span>Acesso rápido na tela inicial</span>
        </div>
        <button className="install-prompt-cta" onClick={handleInstall}>
          Instalar
        </button>
        <button className="install-prompt-close" onClick={handleDismiss} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
    );
  }

  // iOS Safari: manual instructions
  if (showIOSHint) {
    return (
      <div className="install-prompt install-prompt--ios" role="banner">
        <div className="install-prompt-icon">
          <Share size={20} />
        </div>
        <div className="install-prompt-text">
          <strong>Instalar no iPhone</strong>
          <span>
            Toque em <Share size={12} style={{ verticalAlign: "middle" }} /> e depois{" "}
            <em>"Adicionar à Tela de Início"</em>
          </span>
        </div>
        <button className="install-prompt-close" onClick={handleDismiss} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
}
