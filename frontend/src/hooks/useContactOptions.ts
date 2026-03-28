import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";

export type RoleOption = { value: string; label: string };

export type ContactOptions = {
  tags: string[];
  roles: RoleOption[];
};

const DEFAULT_OPTIONS: ContactOptions = {
  tags: ["VIP", "Lead", "Premium", "Regular", "Novo", "Equipe", "Diretoria", "Parceiro"],
  roles: [
    { value: "guest", label: "Hóspede" },
    { value: "owner", label: "Proprietário" },
    { value: "staff", label: "Funcionário" },
    { value: "lead", label: "Lead" },
  ],
};

export function useContactOptions() {
  const [options, setOptions] = useState<ContactOptions>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.get<ContactOptions>("/tenants/me/contact-options")
      .then(setOptions)
      .catch(() => setOptions(DEFAULT_OPTIONS))
      .finally(() => setLoading(false));
  }, []);

  return { options, loading };
}
