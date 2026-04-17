// ─── CONFIGURAÇÃO — substitua pela URL real do seu Railway ────────────────────
const API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://manutencao-backend-production-a072.up.railway.app";
    

// ─── Armazenamento — localStorage persiste entre recarregamentos ──────────────
const storage = {
    getToken:    ()  => localStorage.getItem("jwt_token"),
    setToken:    (t) => localStorage.setItem("jwt_token", t),
    clearToken:  ()  => localStorage.removeItem("jwt_token"),
    getUsuario:  ()  => { const s = localStorage.getItem("usuario_logado"); return s ? JSON.parse(s) : null; },
    setUsuario:  (u) => localStorage.setItem("usuario_logado", JSON.stringify(u)),
    clearUsuario:()  => localStorage.removeItem("usuario_logado"),
};

// ─── Headers padrão com token ─────────────────────────────────────────────────
function authHeaders() {
    const token = storage.getToken();
    return {
        "Content-Type":  "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
    };
}

// ─── Fetch central com tratamento de erro ─────────────────────────────────────
async function apiFetch(path, options = {}) {
    let res;
    try {
        res = await fetch(API_BASE + path, {
            headers: { ...authHeaders(), ...(options.headers || {}) },
            ...options,
        });
    } catch (e) {
        // Falha de rede — backend inacessível ou URL errada
        throw new Error(
            "Não foi possível conectar ao servidor. " +
            "Verifique se a URL do Railway em api.js está correta."
        );
    }

    if (res.status === 401) {
        storage.clearToken();
        storage.clearUsuario();
        // Dispara evento para o script.js tratar sem referência circular
        window.dispatchEvent(new CustomEvent("sessao-expirada"));
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (res.status === 204) return null;

    if (!res.ok) {
        let detalhe = `Erro ${res.status}`;
        try {
            const err = await res.json();
            detalhe = err.detail || detalhe;
        } catch {}
        throw new Error(detalhe);
    }

    return res.json();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
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
            "Não foi possível conectar ao servidor. " +
            "Verifique se a URL do Railway em api.js está correta e se o backend está rodando."
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

export function logout() {
    storage.clearToken();
    storage.clearUsuario();
}

export function getUsuarioLogado() {
    return storage.getUsuario();
}

export function isLogado() {
    return !!storage.getToken() && !!storage.getUsuario();
}

// ─── MANUTENÇÕES ──────────────────────────────────────────────────────────────
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

// ─── ANEXOS ───────────────────────────────────────────────────────────────────
export function listarAnexos(manutencaoId) {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos`);
}

export async function adicionarAnexo(manutencaoId, arquivo) {
    // O backend espera JSON com o arquivo em base64
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
        reader.readAsDataURL(arquivo);
    });

    return apiFetch(`/manutencoes/${manutencaoId}/anexos`, {
        method: "POST",
        body: JSON.stringify({
            nome:     arquivo.name,
            tipo:     arquivo.type,
            conteudo: base64,
        }),
    });
}

export function removerAnexo(manutencaoId, anexoId) {
    return apiFetch(`/manutencoes/${manutencaoId}/anexos/${anexoId}`, { method: "DELETE" });
}

// ─── USUÁRIOS (gerência) ──────────────────────────────────────────────────────
export function listarUsuarios()     { return apiFetch("/usuarios"); }
export function criarUsuario(data)   { return apiFetch("/usuarios",        { method: "POST",   body: JSON.stringify(data) }); }
export function excluirUsuario(id)   { return apiFetch(`/usuarios/${id}`,  { method: "DELETE" }); }
