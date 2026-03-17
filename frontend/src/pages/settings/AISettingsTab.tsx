import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2 } from "lucide-react";

type AISettingsInfo = {
  openai_model: string;
  ai_temperature: number;
  ai_system_prompt: string;
  ai_max_tokens: number;
};

export function AISettingsTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [model, setModel] = useState("gpt-4.1-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(200);

  useEffect(() => {
    ApiService.get<AISettingsInfo>("/tenants/me/ai-settings")
      .then((res) => {
        setModel(res.openai_model);
        setTemperature(res.ai_temperature);
        setSystemPrompt(res.ai_system_prompt || "");
        setMaxTokens(res.ai_max_tokens);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await ApiService.patch("/tenants/me/ai-settings", {
        openai_model: model,
        ai_temperature: temperature,
        ai_system_prompt: systemPrompt || null,
        ai_max_tokens: maxTokens
      });
      alert("AI Settings saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to save AI Settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container ai-settings-tab">
      <div className="tab-header">
        <h1>AI Settings</h1>
        <p>Configure how your AI Copilot responds and behaves.</p>
      </div>

      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label>OpenAI Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gpt-4.1-mini">GPT-4.1 Mini (Fast, Cheap)</option>
            <option value="gpt-4.1">GPT-4.1 (Standard, Default)</option>
            <option value="gpt-4o">GPT-4o (Premium)</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Temperature ({temperature})</label>
          <div className="flex items-center gap-4">
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={temperature} 
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer"
            />
            <span className="text-sm font-medium w-8 text-center">{temperature}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">Lower values are more deterministic. Higher values are more creative.</p>
        </div>

        <div className="form-group">
          <label>Max Tokens</label>
          <input 
            type="number" 
            min="50" 
            max="2000" 
            value={maxTokens} 
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>System Prompt (Persona & Instructions)</label>
          <textarea 
            rows={8}
            value={systemPrompt} 
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful customer service assistant for our hotel..."
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Note: This prompt will be combined automatically with active Knowledge Base entries.
          </p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Save AI Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
