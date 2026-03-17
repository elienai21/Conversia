// src/services/api.ts
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export class ApiService {
  static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("conversia_token");
    const tenantId = localStorage.getItem("conversia_tenant_id"); // Optional, if using manual header, otherwise JWT holds it

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    // As noted by the user, the Fastify backend extracts from JWT, 
    // but if an explicit manual header is needed in the future, we send it here:
    if (tenantId) {
      headers["x-tenant-id"] = tenantId;
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
      } catch (e) {
        errorDetail = response.statusText;
      }
      
      throw new Error(errorDetail);
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
}
