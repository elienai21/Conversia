// src/services/api.ts
const base_url = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
export const API_URL = base_url.endsWith("/") ? base_url.slice(0, -1) : base_url;

export class ApiService {
  static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("conversia_token");
    const tenantId = localStorage.getItem("conversia_tenant_id"); // Optional, if using manual header, otherwise JWT holds it

    const headers = new Headers(options.headers);
    
    if (options.body && !headers.has("Content-Type")) {
      // Se o corpo for string, assumimos JSON. Se for FormData, o fetch deve cuidar do boundary.
      if (typeof options.body === "string") {
        headers.set("Content-Type", "application/json");
      }
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    
    if (tenantId) {
      headers.set("x-tenant-id", tenantId);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Auto-logout logic can be hooked here via event dispatch
        window.dispatchEvent(new Event("unauthorized_api_call"));
      }
      
      let errorDetail = "API Error";
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorData.message || response.statusText;
      } catch (e: any) { // Changed 'e' to 'e: any' for consistency with user's snippet
        errorDetail = response.statusText;
      }
      
      throw new Error(errorDetail);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  static get<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  static post<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  static patch<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  static put<T>(endpoint: string, body: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  static delete<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "DELETE",
    });
  }

  static async getBlob(endpoint: string): Promise<Blob> {
    const token = localStorage.getItem("conversia_token");
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`);
    }
    return response.blob();
  }

  static async uploadAudio(endpoint: string, audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    // Send it as a file named "audio.webm"
    formData.append("file", audioBlob, "audio.webm");

    const token = localStorage.getItem("conversia_token"); // Using existing token retrieval
    const headers: Record<string, string> = {
      // Do NOT set Content-Type here, let fetch handle the boundary for FormData
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to upload audio");
    }

    const data = await response.json();
    return data.text; // Return the transcribed text directly
  }

  static async uploadFile<T>(endpoint: string, file: File, caption?: string): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);
    if (caption) {
      formData.append("caption", caption);
    }

    const token = localStorage.getItem("conversia_token");
    const headers: Record<string, string> = {};

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to upload file");
    }

    return response.json();
  }
}
