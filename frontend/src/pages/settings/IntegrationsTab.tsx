import { useState, useEffect, useRef } from "react";
import { ApiService } from "@/services/api";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import "./IntegrationsTab.css";

type IntegrationsInfo = {
  whatsapp: {
    provider: string;
    phone_number_id: string | null;
    business_account_id: string | null;
    api_token_set: boolean;
    verify_token: string | null;
    evolution_server_url: string | null;
    evolution_instance_token_set: boolean;
    connected: boolean;
  };
  openai: {
    api_key_set: boolean;
    api_key_preview: string | null;
  };
  deepl: {
    api_key_set: boolean;
    api_key_preview: string | null;
  };
  instagram: {
    page_id: string | null;
    page_access_token_set: boolean;
  };
};

export function IntegrationsTab() {
  const [data, setData] = useState<IntegrationsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // WhatsApp provider
  const [waProvider, setWaProvider] = useState<"evolution" | "official">("evolution");

  // Evolution fields
  const [evoServerUrl, setEvoServerUrl] = useState("");
  const [evoApiKey, setEvoApiKey] = useState("");
  const [showEvoKey, setShowEvoKey] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [isConnectingWa, setIsConnectingWa] = useState(false);
  const [isDisconnectingWa, setIsDisconnectingWa] = useState(false);

  // Cloud API fields
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
  const [whatsappBizId, setWhatsappBizId] = useState("");
  const [showWhatsapp, setShowWhatsapp] = useState(false);

  // Other integrations
  const [openaiKey, setOpenaiKey] = useState("");
  const [deeplKey, setDeeplKey] = useState("");
  const [instagramToken, setInstagramToken] = useState("");
  const [instagramPageId, setInstagramPageId] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showDeepl, setShowDeepl] = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadIntegrations();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const loadIntegrations = async () => {
    try {
      const res = await ApiService.get<IntegrationsInfo>("/tenants/me/integrations");
      setData(res);

      // WhatsApp
      setWaProvider((res.whatsapp.provider as "evolution" | "official") || "evolution");
      setEvoServerUrl(res.whatsapp.evolution_server_url || "");
      setEvoApiKey("");
      setWaConnected(res.whatsapp.connected);
      setWhatsappToken("");
      setWhatsappPhoneId(res.whatsapp.phone_number_id || "");
      setWhatsappBizId(res.whatsapp.business_account_id || "");

      // Other
      setOpenaiKey(res.openai.api_key_preview || "");
      setDeeplKey(res.deepl.api_key_preview || "");
      setInstagramToken("");
      setInstagramPageId(res.instagram.page_id || "");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: Record<string, string> = {};

      // WhatsApp provider
      payload.whatsapp_provider = waProvider;

      // Evolution fields
      if (evoServerUrl) payload.evolution_server_url = evoServerUrl;
      if (evoApiKey) payload.evolution_instance_token = evoApiKey;

      // Cloud API fields
      if (whatsappToken) payload.whatsapp_api_token = whatsappToken;
      if (whatsappPhoneId) payload.whatsapp_phone_number_id = whatsappPhoneId;
      if (whatsappBizId) payload.whatsapp_business_account_id = whatsappBizId;

      // Other integrations
      if (openaiKey && !openaiKey.includes("...")) payload.openai_api_key = openaiKey;
      if (deeplKey && !deeplKey.includes("...")) payload.deepl_api_key = deeplKey;
      if (instagramToken) payload.instagram_page_access_token = instagramToken;
      if (instagramPageId) payload.instagram_page_id = instagramPageId;

      await ApiService.patch("/tenants/me/integrations", payload);
      showToast("success", "Integrações salvas com sucesso!");
      await loadIntegrations();
    } catch (error) {
      console.error(error);
      showToast("error", "Falha ao salvar integrações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectWhatsapp = async () => {
    setIsConnectingWa(true);
    setWaQrCode(null);
    try {
      const res = await ApiService.post<{ connected?: boolean; qrCode?: string }>("/whatsapp/connect", {});
      if (res.connected) {
        setWaConnected(true);
        showToast("success", "WhatsApp já conectado!");
      } else if (res.qrCode) {
        setWaQrCode(res.qrCode);
        pollWaStatus();
      }
    } catch (error) {
      console.error(error);
      showToast("error", "Erro ao conectar. Salve as configurações do servidor primeiro.");
    } finally {
      setIsConnectingWa(false);
    }
  };

  const pollWaStatus = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await ApiService.get<{ connected: boolean }>("/whatsapp/connection");
        if (res.connected) {
          setWaConnected(true);
          setWaQrCode(null);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          showToast("success", "WhatsApp conectado com sucesso!");
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  const handleDisconnectWhatsapp = async () => {
    if (!confirm("Tem certeza que deseja desconectar o WhatsApp?")) return;
    setIsDisconnectingWa(true);
    try {
      await ApiService.delete("/whatsapp/disconnect");
      setWaConnected(false);
      setWaQrCode(null);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      showToast("success", "WhatsApp desconectado.");
    } catch (error) {
      console.error(error);
      showToast("error", "Erro ao desconectar WhatsApp.");
    } finally {
      setIsDisconnectingWa(false);
    }
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container integrations-tab">
      {toast && (
        <div className={`integration-toast ${toast.type}`}>
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
      <div className="tab-header">
        <h1>Integrações</h1>
        <p>Conecte seu tenant com APIs e serviços externos.</p>
      </div>

      <form className="integrations-grid" onSubmit={handleSave}>
        {/* WhatsApp Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>WhatsApp</h3>
              {waProvider === "evolution" && waConnected ? (
                <span className="status-badge connected"><CheckCircle2 size={14} /> Conectado</span>
              ) : waProvider === "official" && data?.whatsapp.api_token_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14} /> Configurado</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14} /> Não Configurado</span>
              )}
            </div>
            <p>Conecte seu número de WhatsApp para enviar e receber mensagens.</p>
          </div>

          {/* Provider Tabs */}
          <div className="provider-tabs">
            <button
              type="button"
              className={`provider-tab ${waProvider === "evolution" ? "active" : ""}`}
              onClick={() => setWaProvider("evolution")}
            >
              Evolution API
            </button>
            <button
              type="button"
              className={`provider-tab ${waProvider === "official" ? "active" : ""}`}
              onClick={() => setWaProvider("official")}
            >
              Cloud API (Oficial)
            </button>
          </div>

          {waProvider === "evolution" ? (
            <div className="provider-content">
              <div className="form-group">
                <label>Server URL</label>
                <input
                  type="text"
                  value={evoServerUrl}
                  onChange={(e) => setEvoServerUrl(e.target.value)}
                  placeholder="https://seu-servidor.com"
                />
              </div>
              <div className="form-group relative-input">
                <label>API Key</label>
                <div className="input-with-icon">
                  <input
                    type={showEvoKey ? "text" : "password"}
                    value={evoApiKey}
                    onChange={(e) => setEvoApiKey(e.target.value)}
                    placeholder={data?.whatsapp.evolution_instance_token_set ? "••••••••••• (já configurada)" : "Sua API Key da Evolution"}
                  />
                  <button type="button" className="icon-btn" onClick={() => setShowEvoKey(!showEvoKey)}>
                    {showEvoKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="wa-connection-section">
                {waConnected ? (
                  <div className="wa-connected-state">
                    <div className="wa-connected-info">
                      <CheckCircle2 size={20} className="text-success" />
                      <span>WhatsApp conectado e pronto para uso.</span>
                    </div>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleDisconnectWhatsapp}
                      disabled={isDisconnectingWa}
                    >
                      {isDisconnectingWa ? <><Loader2 size={16} className="animate-spin" /> Desconectando...</> : "Desconectar"}
                    </button>
                  </div>
                ) : waQrCode ? (
                  <div className="wa-qrcode-area">
                    <p className="qr-instruction">Escaneie o QR Code no seu WhatsApp:</p>
                    <div className="qr-code-wrapper">
                      <img src={waQrCode} alt="WhatsApp QR Code" />
                    </div>
                    <div className="qr-waiting">
                      <Loader2 className="animate-spin" size={16} />
                      <span>Aguardando leitura do QR Code...</span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-connect"
                    onClick={handleConnectWhatsapp}
                    disabled={isConnectingWa}
                  >
                    {isConnectingWa ? <><Loader2 size={16} className="animate-spin" /> Gerando QR Code...</> : "Conectar WhatsApp"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="provider-content">
              <div className="form-group relative-input">
                <label>API Token (Permanente)</label>
                <div className="input-with-icon">
                  <input
                    type={showWhatsapp ? "text" : "password"}
                    value={whatsappToken}
                    onChange={(e) => setWhatsappToken(e.target.value)}
                    placeholder="EAA..."
                  />
                  <button type="button" className="icon-btn" onClick={() => setShowWhatsapp(!showWhatsapp)}>
                    {showWhatsapp ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Phone Number ID</label>
                <input
                  type="text"
                  value={whatsappPhoneId}
                  onChange={(e) => setWhatsappPhoneId(e.target.value)}
                  placeholder="e.g. 10123456789"
                />
              </div>
              <div className="form-group">
                <label>Business Account ID</label>
                <input
                  type="text"
                  value={whatsappBizId}
                  onChange={(e) => setWhatsappBizId(e.target.value)}
                  placeholder="e.g. 10098765432"
                />
              </div>
            </div>
          )}
        </div>

        {/* OpenAI Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>OpenAI</h3>
              {data?.openai.api_key_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14} /> Conectado</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14} /> Não configurado</span>
              )}
            </div>
            <p>Usado para sugestões do Copilot e funcionalidades de IA.</p>
          </div>
          <div className="form-group relative-input">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                type={showOpenai ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button type="button" className="icon-btn" onClick={() => setShowOpenai(!showOpenai)}>
                {showOpenai ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* DeepL Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>DeepL</h3>
              {data?.deepl.api_key_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14} /> Conectado</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14} /> Não configurado</span>
              )}
            </div>
            <p>Tradução automática de alta qualidade para mensagens.</p>
          </div>
          <div className="form-group relative-input">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                type={showDeepl ? "text" : "password"}
                value={deeplKey}
                onChange={(e) => setDeeplKey(e.target.value)}
                placeholder="DeepL Auth Key"
              />
              <button type="button" className="icon-btn" onClick={() => setShowDeepl(!showDeepl)}>
                {showDeepl ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Instagram DM Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>Instagram DM</h3>
              {data?.instagram.page_access_token_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14} /> Conectado</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14} /> Não configurado</span>
              )}
            </div>
            <p>Receba e responda mensagens diretas do Instagram.</p>
          </div>
          <div className="form-group relative-input">
            <label>Page Access Token</label>
            <div className="input-with-icon">
              <input
                type={showInstagram ? "text" : "password"}
                value={instagramToken}
                onChange={(e) => setInstagramToken(e.target.value)}
                placeholder="EAA..."
              />
              <button type="button" className="icon-btn" onClick={() => setShowInstagram(!showInstagram)}>
                {showInstagram ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Instagram Page ID</label>
            <input
              type="text"
              value={instagramPageId}
              onChange={(e) => setInstagramPageId(e.target.value)}
              placeholder="e.g. 17841400000000000"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : "Salvar Integrações"}
          </button>
        </div>
      </form>
    </div>
  );
}
