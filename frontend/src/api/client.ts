import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const empresaId = localStorage.getItem("empresaId") ?? window.location.pathname.match(/^\/empresa\/([^/]+)/)?.[1];
  if (empresaId) {
    config.headers["X-Empresa-Id"] = empresaId;
  }
  return config;
});

function irAlLogin() {
  const ret = window.location.pathname + window.location.search;
  window.location.href = ret && !/^\/login/.test(ret) ? `/login?returnTo=${encodeURIComponent(ret)}` : "/login";
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    // F1: el 401 del propio login es credencial inválida, no una sesión caída.
    if (status === 401 && error.config?.url !== "/auth/login") {
      localStorage.removeItem("token");
      localStorage.removeItem("empresaId");
      irAlLogin();
      return Promise.reject(error);
    }
    // F13: si otra sesión cambió la contraseña, llevar a cambiarla.
    if (status === 403 && error.response?.data?.codigo === "DEBE_CAMBIAR_PASSWORD" && !/^\/cambiar-password/.test(window.location.pathname)) {
      window.location.href = "/cambiar-password";
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);
