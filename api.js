// ─── Configuração ─────────────────────────────────────────────────────────────
// Em desenvolvimento aponta para localhost; em produção troque pela URL do Railway
const API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://manutencao-backend-production-a072.up.railway.app";   // ← troque após o deploy

// ─── Token JWT — localStorage mantém após fechar/reabrir o navegador ──────────
function getToken() { return localStorage.getItem("jwt_token"); }
function setToken(t) { localStorage.setItem("jwt_token", t); }
function clearToken() { localStorage.removeItem("jwt_token"); }

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
    };
}

// ─── Fetch com tratamento de erros ────────────────────────────────────────────
async function apiFetch(path, options = {}) {
    const res = await fetch(API_BASE + path, {
        headers: authHeaders(),
        ...options,
    });
    if (res.status === 401) {
        clearToken();
        mostrarLogin();
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
export async function login(username, password) {
    const form = new URLSearchParams({ username, password });
    const res = await fetch(API_BASE + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
    });
    if (!res.ok) throw new Error("Usuário ou senha incorretos.");
    const data = await res.json();
    setToken(data.access_token);
    localStorage.setItem("usuario_logado", JSON.stringify({
        nome: data.nome, username: data.username, role: data.role
    }));
    return data;
}

export function logout() {
    clearToken();
    localStorage.removeItem("usuario_logado");
}

export function getUsuarioLogado() {
    const s = localStorage.getItem("usuario_logado");
    return s ? JSON.parse(s) : null;
}

// ─── Manutenções ───────────────────────────────────────────────────────────────
export function listarManutencoes(params = {}) {
    const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return apiFetch("/manutencoes" + (qs ? "?" + qs : ""));
}

export function getManutencao(id) { return apiFetch(`/manutencoes/${id}`); }

export function criarManutencao(data) {
    return apiFetch("/manutencoes", { method: "POST", body: JSON.stringify(data) });
}

export function editarManutencao(id, data) {
    return apiFetch(`/manutencoes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function finalizarManutencao(id, data) {
    return apiFetch(`/manutencoes/${id}/finalizar`, { method: "POST", body: JSON.stringify(data) });
}

export function excluirManutencao(id) {
    return apiFetch(`/manutencoes/${id}`, { method: "DELETE" });
}

export function getHistorico(id) { return apiFetch(`/manutencoes/${id}/historico`); }

export function getSugestoes() { return apiFetch("/equipamentos/sugestoes"); }

// ─── Usuários (gerência) ───────────────────────────────────────────────────────
export function listarUsuarios()       { return apiFetch("/usuarios"); }
export function criarUsuario(data)     { return apiFetch("/usuarios", { method: "POST", body: JSON.stringify(data) }); }
export function excluirUsuario(id)     { return apiFetch(`/usuarios/${id}`, { method: "DELETE" }); }
