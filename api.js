// ─── STAGING — aponta para o backend de HOMOLOGAÇÃO ──────────────────────────
// ⚠️  Este arquivo é exclusivo do ambiente de staging.
//     NÃO substitua o api.js de produção por este arquivo.
//
// PASSO ÚNICO: cole a URL do seu backend de staging abaixo:
const STAGING_URL = "https://manutencao-staging-production.up.railway.app"; // ← edite aqui

// Expõe para o keep-alive no index.html
window.__STAGING_URL__ = STAGING_URL;

const API_BASE = STAGING_URL;

// ─── localStorage com prefixo "stg_" — nunca conflita com produção ───────────
const storage = {
    getToken:    ()  => localStorage.getItem("stg_jwt_token"),
    setToken:    (t) => localStorage.setItem("stg_jwt_token", t),
    clearToken:  ()  => localStorage.removeItem("stg_jwt_token"),
    getUsuario:  ()  => { const s = localStorage.getItem("stg_usuario_logado"); return s ? JSON.parse(s) : null; },
    setUsuario:  (u) => localStorage.setItem("stg_usuario_logado", JSON.stringify(u)),
    clearUsuario:()  => localStorage.removeItem("stg_usuario_logado"),
};

// ─── (Restante idêntico ao api.js de produção) ────────────────────────────────

function authHeaders() {
    const token = storage.getToken();
    return {
        "Content-Type":  "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
    };
}

async function apiFetch(path, options = {}) {
    let res;
    try {
        res = await fetch(API_BASE + path, {
            headers: { ...authHeaders(), ...(options.headers || {}) },
            ...options,
        });
    } catch (e) {
        throw new Error(
            "Não foi possível conectar ao servidor de STAGING. " +
            "Verifique se a URL em staging/api.js está correta e se o backend está ativo."
        );
    }

    if (res.status === 401) {
        storage.clearToken();
        storage.clearUsuario();
        window.dispatchEvent(new CustomEvent("sessao-expirada"));
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (res.status === 204) return null;

    if (!res.ok) {
        let detalhe = `Erro ${res.status}`;
        try { const err = await res.json(); detalhe = err.detail || detalhe; } catch {}
        throw new Error(detalhe);
    }

    return res.json();
}

export async function login(username, password) {
    const body = new URLSearchParams({ username, password });
    let res;
    try {
        res = await fetch(API_BASE + "/auth/login", {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
    } catch (e) {
        throw new Error(
            "Não foi possível conectar ao servidor de STAGING. " +
            "Verifique a URL em staging/api.js e se o backend de staging está rodando."
        );
    }

    if (!res.ok) {
        let msg = "Usuário ou senha incorretos.";
        try { const e = await res.json(); msg = e.detail || msg; } catch {}
        throw new Error(msg);
    }

    const data = await res.json();
    storage.setToken(data.access_token);
    storage.setUsuario({ nome: data.nome, username: data.username, role: data.role });
    return data;
}

export function logout()           { storage.clearToken(); storage.clearUsuario(); }
export function getUsuarioLogado() { return storage.getUsuario(); }
export function isLogado()         { return !!storage.getToken() && !!storage.getUsuario(); }

export function listarManutencoes(params = {}) {
    const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return apiFetch("/manutencoes" + (qs ? "?" + qs : ""));
}

export function getManutencao(id)       { return apiFetch(`/manutencoes/${id}`); }
export function criarManutencao(data)   { return apiFetch("/manutencoes",        { method: "POST",   body: JSON.stringify(data) }); }
export function editarManutencao(id, d) { return apiFetch(`/manutencoes/${id}`,  { method: "PUT",    body: JSON.stringify(d) }); }
export function excluirManutencao(id)   { return apiFetch(`/manutencoes/${id}`,  { method: "DELETE" }); }
export function getHistorico(id)        { return apiFetch(`/manutencoes/${id}/historico`); }

export function finalizarManutencao(id, data) {
    return apiFetch(`/manutencoes/${id}/finalizar`, { method: "POST", body: JSON.stringify(data) });
}

export function getSugestoes() { return apiFetch("/equipamentos/sugestoes"); }

export function listarAnexos(manutencaoId)          { return apiFetch(`/manutencoes/${manutencaoId}/anexos`); }
export function adicionarAnexo(manutencaoId, dados)  {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos`, { method: "POST", body: JSON.stringify(dados) });
}
export function removerAnexo(manutencaoId, anexoId)  {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos/${anexoId}`, { method: "DELETE" });
}

export function listarUsuarios()        { return apiFetch("/usuarios"); }
export function criarUsuario(data)      { return apiFetch("/usuarios",        { method: "POST",   body: JSON.stringify(data) }); }
export function editarUsuario(id, data) { return apiFetch(`/usuarios/${id}`,  { method: "PUT",    body: JSON.stringify(data) }); }
export function excluirUsuario(id)      { return apiFetch(`/usuarios/${id}`,  { method: "DELETE" }); }
