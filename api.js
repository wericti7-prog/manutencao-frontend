const API_BASE = "https://manutencao-backend-production-a072.up.railway.app";

// ─── localStorage de produção ─────────────────────────────────────────────────
const storage = {
    getToken:    ()  => localStorage.getItem("jwt_token"),
    setToken:    (t) => localStorage.setItem("jwt_token", t),
    clearToken:  ()  => localStorage.removeItem("jwt_token"),
    getUsuario:  ()  => { const s = localStorage.getItem("usuario_logado"); return s ? JSON.parse(s) : null; },
    setUsuario:  (u) => localStorage.setItem("usuario_logado", JSON.stringify(u)),
    clearUsuario:()  => localStorage.removeItem("usuario_logado"),
};

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
        throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
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
        throw new Error("Não foi possível conectar ao servidor.");
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
export function reabrirManutencao(id, status) { return apiFetch(`/manutencoes/${id}/reabrir`, { method: "POST", body: JSON.stringify({ status }) }); }

export function finalizarManutencao(id, data) {
    return apiFetch(`/manutencoes/${id}/finalizar`, { method: "POST", body: JSON.stringify(data) });
}

export function getSugestoes() { return apiFetch("/equipamentos/sugestoes"); }

export function listarAnexos(manutencaoId)         { return apiFetch(`/manutencoes/${manutencaoId}/anexos`); }
export function adicionarAnexo(manutencaoId, dados) {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos`, { method: "POST", body: JSON.stringify(dados) });
}
export function removerAnexo(manutencaoId, anexoId) {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos/${anexoId}`, { method: "DELETE" });
}

export function listarRespostas(manutencaoId)       { return apiFetch(`/manutencoes/${manutencaoId}/respostas`); }
export function podeResponder(manutencaoId)         { return apiFetch(`/manutencoes/${manutencaoId}/respostas/pode-responder`); }
export function criarResposta(manutencaoId, dados)  {
    return apiFetch(`/manutencoes/${manutencaoId}/respostas`, { method: "POST", body: JSON.stringify(dados) });
}

export function listarUsuarios()        { return apiFetch("/usuarios"); }
export function criarUsuario(data)      { return apiFetch("/usuarios",        { method: "POST",   body: JSON.stringify(data) }); }
export function editarUsuario(id, data) { return apiFetch(`/usuarios/${id}`,  { method: "PUT",    body: JSON.stringify(data) }); }
export function excluirUsuario(id)      { return apiFetch(`/usuarios/${id}`,  { method: "DELETE" }); }

export function listarLixeira()         { return apiFetch("/lixeira"); }
export function restaurarManutencao(id) { return apiFetch(`/lixeira/${id}/restaurar`, { method: "POST" }); }
