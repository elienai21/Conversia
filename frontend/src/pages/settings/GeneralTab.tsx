import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  default_language: string;
};

export function GeneralTab() {
  const { t, i18n } = useTranslation();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("");

  useEffect(() => {
    ApiService.get<TenantInfo>("/tenants/me")
      .then((data) => {
        setTenant(data);
        setName(data.name);
        setDefaultLanguage(data.default_language);
        if (data.default_language) {
          i18n.changeLanguage(data.default_language);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [i18n]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await ApiService.patch<TenantInfo>("/tenants/me", {
        name,
        default_language: defaultLanguage,
      });
      setTenant(updated);
      alert(t("Settings Saved"));
    } catch (error) {
      console.error(error);
      alert(t("Save Failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setDefaultLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h1>{t("General Settings")}</h1>
        <p>{t("Manage company info")}</p>
      </div>

      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label>{t("Company Name")}</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required 
          />
        </div>

        <div className="form-group">
          <label>{t("URL Slug")}</label>
          <input 
            type="text" 
            value={tenant?.slug || ""} 
            readOnly 
          />
        </div>

        <div className="form-group">
          <label>{t("Default Language")}</label>
          <select 
            value={defaultLanguage} 
            onChange={handleLanguageChange}
          >
            <option value="en">English</option>
            <option value="pt">Portuguese (BR)</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> {t("Saving")}</> : t("Save Changes")}
          </button>
        </div>
      </form>
    </div>
  );
}
