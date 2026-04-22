// STAGING — importa api.js local desta pasta (staging/api.js)
import * as api from "./api.js";

// ─── Utilitários ───────────────────────────────────────────────────────────────
const formatDate     = d => d ? new Date(d).toLocaleDateString("pt-BR") : "-";
const formatDateTime = d => d ? new Date(d).toLocaleString("pt-BR")     : "-";
const formatCurrency = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function getStatusBadge(s) {
    const map = {
        "Operacional":           "badge-operacional",
        "Em Manutenção":         "badge-em-manutencao",
        "Aguardando Peças":      "badge-aguardando-pecas",
        "Fora de Operação":      "badge-fora-operacao",
        "Aguardando aprovação":  "badge-warning",
        "Concluída":             "badge-success",
        "Cancelada":             "badge-secondary",
        "Consertado":            "badge-success",
        "Sem Reparo":            "badge-danger",
    };
    return map[s] || "badge-secondary";
}

function showError(msg) { alert("Erro: " + msg); }

// ─── Login / Logout ────────────────────────────────────────────────────────────
function mostrarApp() {
    const u = api.getUsuarioLogado();
    document.getElementById("telaLogin").style.display    = "none";
    document.getElementById("appPrincipal").style.display = "block";
    document.getElementById("usuarioNome").textContent    = u.nome;
    document.getElementById("usuarioAvatar").textContent  = u.nome.charAt(0).toUpperCase();
    // Controle de permissões por perfil
    const menuUsuarios = document.getElementById("menuUsuarios");
    if (menuUsuarios) menuUsuarios.style.display = ["gerencia","admin"].includes(u.role) ? "block" : "none";

    // Aba Relatórios: visível somente para gerencia/admin
    const menuRelatorios = document.querySelector(".tab-btn[data-tab='relatorios']");
    if (menuRelatorios) menuRelatorios.style.display = ["gerencia","admin"].includes(u.role) ? "block" : "none";

    // Botão Nova Manutenção: oculto para observador
    const btnNova = document.getElementById("btnNovaManutencao");
    if (btnNova) btnNova.style.display = u.role === "observador" ? "none" : "inline-flex";

    updateStats();
    loadManutencoes();
}

function mostrarLogin() {
    document.getElementById("appPrincipal").style.display = "none";
    document.getElementById("telaLogin").style.display    = "flex";
    document.getElementById("formLogin").reset();
    document.getElementById("loginErro").style.display    = "none";
}

// Restaura sessão — localStorage persiste entre recarregamentos e reaberturas
if (api.isLogado()) {
    mostrarApp();
}

// Sessão expirada (token JWT venceu) — volta para login sem erro brusco
window.addEventListener("sessao-expirada", () => {
    mostrarLogin();
    document.getElementById("loginErro").style.display = "block";
    document.getElementById("loginErro").textContent   = "Sua sessão expirou. Faça login novamente.";
});

document.getElementById("formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const u = document.getElementById("loginUsuario").value;
    const p = document.getElementById("loginSenha").value;
    try {
        await api.login(u, p);
        mostrarApp();
    } catch (err) {
        const erroEl = document.getElementById("loginErro");
        erroEl.style.display = "block";
        erroEl.textContent   = err.message || "Erro ao conectar. Verifique a URL do backend.";
        document.getElementById("loginSenha").value = "";
    }
});

document.getElementById("toggleSenha").addEventListener("click", () => {
    const inp = document.getElementById("loginSenha");
    inp.type = inp.type === "password" ? "text" : "password";
});

document.getElementById("btnLogout").addEventListener("click", () => {
    if (confirm("Deseja sair do sistema?")) {
        api.logout();
        mostrarLogin();
    }
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
async function updateStats() {
    try {
        const todas = await api.listarManutencoes();
        const abertas     = todas.filter(m => m.status !== "Concluída" && m.status !== "Cancelada");
        const finalizadas = todas.filter(m => m.status === "Concluída" || m.status === "Cancelada");
        const pendentes   = abertas.filter(m => m.status === "Aguardando aprovação");
        document.getElementById("totalManutencoes").textContent = abertas.length;
        document.getElementById("totalFinalizados").textContent = finalizadas.length;
        document.getElementById("totalPendentes").textContent   = pendentes.length;
    } catch {}
}

// ─── Abas ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(btn.dataset.tab).classList.add("active");
        const tab = btn.dataset.tab;
        if (tab === "manutencoes") loadManutencoes();
        if (tab === "finalizados") loadFinalizados();
        if (tab === "relatorios")  loadRelatorios();
        if (tab === "usuarios")    loadUsuarios();
        updateStats();
    });
});

// ─── Modais ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add("active"); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }

document.querySelectorAll(".close").forEach(btn =>
    btn.addEventListener("click", () => closeModal(btn.dataset.modal))
);
document.querySelectorAll(".modal").forEach(modal =>
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(modal.id); })
);
document.querySelectorAll(".btn-secondary[data-modal]").forEach(btn =>
    btn.addEventListener("click", () => closeModal(btn.dataset.modal))
);

// ─── Autocomplete de equipamentos ──────────────────────────────────────────────
async function populateDatalist() {
    try {
        const nomes = await api.getSugestoes();
        const dl = document.getElementById("equipamentosDatalist");
        if (dl) dl.innerHTML = nomes.map(n => `<option value="${n}">`).join("");
    } catch {}
}

// ─── ABA MANUTENÇÕES ──────────────────────────────────────────────────────────
async function loadManutencoes() {
    const search = document.getElementById("searchManutencao")?.value || "";
    const tipo   = document.getElementById("filterTipoManutencao")?.value || "";
    const st     = document.getElementById("filterStatusManutencao")?.value || "";

    document.getElementById("listaManutencoes").innerHTML =
        '<div class="empty-state"><p>Carregando...</p></div>';

    try {
        // Busca TODAS as manutenções sem passar "busca" para a API
        // O filtro de texto é feito 100% localmente para garantir busca por número do chamado
        const params = {};
        if (tipo) params.localizacao = tipo;
        if (st)   params.status = st;

        let lista = await api.listarManutencoes(params);

        // Filtro local por número do chamado, equipamento, técnico ou problema
        if (search) {
            const s = search.toLowerCase();
            lista = lista.filter(m =>
                (m.numero      || "").toString().toLowerCase().includes(s) ||
                (m.equipamento || "").toLowerCase().includes(s) ||
                (m.tecnico     || "").toLowerCase().includes(s) ||
                (m.problema    || "").toLowerCase().includes(s)
            );
        }

        // Se não há filtro de status específico, remove as finalizadas
        if (!st) {
            lista = lista.filter(m => m.status !== "Concluída" && m.status !== "Cancelada");
        }

        if (!lista.length) {
            document.getElementById("listaManutencoes").innerHTML =
                '<div class="empty-state"><h3>Nenhuma manutenção em aberto</h3></div>';
            return;
        }

        const userRole = api.getUsuarioLogado()?.role || "";
        const rows = lista.map(m => {
            // observador: só histórico
            // manutencao: histórico + editar (sem excluir, sem criar)
            // tecnico/gerencia/admin: tudo
            const podeEditar  = !["observador"].includes(userRole);
            const podeExcluir = ["tecnico","gerencia","admin"].includes(userRole);
            const acoes = `
                <button class="btn-icon btn-history" onclick="verHistorico(${m.id})" title="Histórico">📋</button>
                ${podeEditar  ? `<button class="btn-icon btn-edit"   onclick="editManutencao(${m.id})" title="Editar">✏️</button>` : ""}
                ${podeExcluir ? `<button class="btn-icon btn-delete" onclick="deleteManutencao(${m.id})" title="Excluir">🗑️</button>` : ""}`;
            return `<tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td><button class="link-equipamento" onclick="verDetalhes(${m.id})">${m.equipamento}</button></td>
                <td>${m.localizacao || "-"}</td>
                <td>${m.tecnico || "-"}</td>
                <td class="problema-cell">${(m.problema || "-").substring(0,60)}${(m.problema||"").length>60?"…":""}</td>
                <td><span class="badge ${getStatusBadge(m.status)}">${m.status}</span></td>
                <td>${formatCurrency(m.custo)}</td>
                <td><div class="action-buttons">${acoes}</div></td>
            </tr>`;
        }).join("");

        document.getElementById("listaManutencoes").innerHTML = `
            <table>
                <thead><tr>
                    <th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                    <th>Problema</th><th>Status</th><th>Custo</th><th>Ações</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (err) { showError(err.message); }
}

// ─── NOVA / EDITAR MANUTENÇÃO ─────────────────────────────────────────────────
document.getElementById("btnNovaManutencao").addEventListener("click", () => {
    document.getElementById("formManutencao").reset();
    document.getElementById("manutencaoId").value = "";
    const prox = "---";
    document.getElementById("manutencaoNumero").value = prox + " (novo)";
    document.getElementById("modalManutencaoTitle").textContent = "Nova Manutenção";
    document.getElementById("btnFinalizar").style.display = "none";
    // Preenche técnico automaticamente
    const u = api.getUsuarioLogado();
    if (u) {
        document.getElementById("manutencaoTecnico").value = u.nome;
        document.getElementById("tecnicoAutoTag").style.display = "inline";
    }
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById("manutencaoDataInicio").value = now.toISOString().slice(0,16);
    populateDatalist();
    openModal("modalManutencao");
    // Nova manutenção: limpa área de anexos
    const nfLista = document.getElementById("nfLista");
    if (nfLista) nfLista.innerHTML = "<p class='nf-vazio'>Salve primeiro para habilitar anexos.</p>";
});

document.getElementById("formManutencao").addEventListener("submit", async e => {
    e.preventDefault();
    await salvarManutencao(false, null);
});

async function salvarManutencao(finalizar, resultadoReparo) {
    const id = document.getElementById("manutencaoId").value;
    const dados = {
        equipamento: document.getElementById("manutencaoEquipamento").value,
        localizacao: document.getElementById("manutencaoTipo").value,
        tecnico:     document.getElementById("manutencaoTecnico").value,
        status:      document.getElementById("manutencaoStatus").value,
        problema:    document.getElementById("manutencaoProblema").value.trim() || "Não informado",
        solucao:     document.getElementById("manutencaoSolucao").value,
        custo:       parseFloat(document.getElementById("manutencaoCusto").value) || 0,
        pecas:       document.getElementById("manutencaoPecas").value,
        data_inicio: document.getElementById("manutencaoDataInicio").value || null,
        data_fim:    document.getElementById("manutencaoDataFim").value    || null,
    };

    try {
        if (finalizar) {
            await api.finalizarManutencao(id, {
                resultado_reparo:   resultadoReparo,
                status_equipamento: dados.status,
                solucao:            dados.solucao,
                custo:              dados.custo,
                pecas:              dados.pecas,
            });
        } else if (id) {
            await api.editarManutencao(id, dados);
        } else {
            await api.criarManutencao(dados);
        }
        closeModal("modalManutencao");
        loadManutencoes();
        loadFinalizados();
        updateStats();
        alert(finalizar ? `Atendimento finalizado! Resultado: ${resultadoReparo}` : "Manutenção salva com sucesso!");
    } catch (err) { showError(err.message); }
}

window.finalizarAtendimento = function() {
    const campos = ["manutencaoEquipamento","manutencaoTipo","manutencaoDataInicio","manutencaoTecnico"];
    for (const fid of campos) {
        if (!document.getElementById(fid).value.trim()) {
            document.getElementById(fid).focus();
            alert("Preencha todos os campos obrigatórios.");
            return;
        }
    }
    openModal("modalResultadoReparo");
};

document.getElementById("btnResultadoConsertado").addEventListener("click", () => {
    closeModal("modalResultadoReparo"); salvarManutencao(true, "Consertado");
});
document.getElementById("btnResultadoSemReparo").addEventListener("click", () => {
    closeModal("modalResultadoReparo"); salvarManutencao(true, "Sem Reparo");
});

window.editManutencao = async function(id) {
    const userRole = api.getUsuarioLogado()?.role || "";
    if (userRole === "observador") return; // observador não edita
    try {
        const [m, anexos] = await Promise.all([api.getManutencao(id), api.listarAnexos(id).catch(() => [])]);
        document.getElementById("manutencaoId").value          = m.id;
        document.getElementById("manutencaoNumero").value      = m.numero;
        document.getElementById("manutencaoEquipamento").value = m.equipamento || "";
        document.getElementById("manutencaoTipo").value        = m.localizacao || "";
        document.getElementById("manutencaoDataInicio").value  = m.data_inicio?.slice(0,16) || "";
        document.getElementById("manutencaoDataFim").value     = m.data_fim?.slice(0,16)    || "";
        document.getElementById("manutencaoTecnico").value     = m.tecnico   || "";
        document.getElementById("manutencaoStatus").value      = m.status    || "Pendente";
        document.getElementById("manutencaoProblema").value    = m.problema  || "";
        document.getElementById("manutencaoSolucao").value     = m.solucao   || "";
        document.getElementById("manutencaoCusto").value       = m.custo     || 0;
        document.getElementById("manutencaoPecas").value       = m.pecas     || "";
        document.getElementById("modalManutencaoTitle").textContent = `Editar Manutenção #${m.numero}`;

        // Perfil "manutencao": bloqueia campos que ele não pode alterar
        const bloqueados = ["manutencaoEquipamento","manutencaoTipo",
                            "manutencaoDataInicio","manutencaoDataFim","manutencaoTecnico"];
        bloqueados.forEach(fid => {
            const el = document.getElementById(fid);
            if (el) el.disabled = (userRole === "manutencao");
        });

        // Perfil "manutencao" não pode finalizar nem excluir
        document.getElementById("btnFinalizar").style.display =
            userRole === "manutencao" ? "none" : "inline-flex";
        document.getElementById("tecnicoAutoTag").style.display = "none";
        populateDatalist();
        openModal("modalManutencao");
        // Carrega anexos deste atendimento
        nfRenderizar(String(m.id));
    } catch (err) { showError(err.message); }
};

window.deleteManutencao = async function(id) {
    if (!confirm("Excluir esta manutenção?")) return;
    try {
        await api.excluirManutencao(id);
        loadManutencoes(); loadFinalizados(); updateStats();
    } catch (err) { showError(err.message); }
};

// ─── DETALHES + HISTÓRICO ─────────────────────────────────────────────────────
window.verDetalhes = async function(id) {
    try {
        const [m, anexos] = await Promise.all([api.getManutencao(id), api.listarAnexos(id).catch(() => [])]);
        const statusEx  = m.resultado_reparo || m.status_equipamento || m.status;
        const reparoHtml = m.resultado_reparo
            ? `<div><strong>Reparo:</strong> <span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span></div>` : "";

        document.getElementById("modalDetalhesTitle").textContent = `Atendimento #${m.numero}`;
        document.getElementById("modalDetalhesContent").innerHTML = `
            <div class="historico-info"><div class="historico-info-grid">
                <div><strong>Nº:</strong> <span class="id-badge">${m.numero}</span></div>
                <div><strong>Equipamento:</strong> ${m.equipamento}</div>
                <div><strong>Localização:</strong> ${m.localizacao || "-"}</div>
                <div><strong>Técnico:</strong> ${m.tecnico || "-"}</div>
                <div><strong>Início:</strong> ${formatDateTime(m.data_inicio)}</div>
                <div><strong>Conclusão:</strong> ${formatDateTime(m.data_fim)}</div>
                <div><strong>Status:</strong> <span class="badge ${getStatusBadge(statusEx)}">${statusEx}</span></div>
                ${reparoHtml}
                <div><strong>Custo:</strong> ${formatCurrency(m.custo)}</div>
                ${m.pecas ? `<div><strong>Peças:</strong> ${m.pecas}</div>` : ""}
            </div></div>
            <div style="margin-top:16px"><p><strong>Problema:</strong></p>
                <p style="background:#f9fafb;padding:12px;border-radius:8px;margin-top:6px">${m.problema || "-"}</p>
            </div>
            <div style="margin-top:12px"><p><strong>Solução:</strong></p>
                <p style="background:#f9fafb;padding:12px;border-radius:8px;margin-top:6px">${m.solucao || "-"}</p>
            </div>
            <div style="margin-top:16px;text-align:right">
                <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px" onclick="verHistorico(${m.id})">📋 Ver histórico de edições</button>
            </div>
            ${nfHtmlSomenteLeitura(anexos, String(m.id))}
            <div style="display:none"><!-- fim -->
            </div>`;
        openModal("modalDetalhes");
    } catch (err) { showError(err.message); }
};

window.verHistorico = async function(id) {
    try {
        const [m, logs, anexos] = await Promise.all([api.getManutencao(id), api.getHistorico(id), api.listarAnexos(id).catch(() => [])]);
        const statusEx = m.resultado_reparo || m.status_equipamento || m.status;

        const linhaAtual = `<tr style="background:#f0fdf4">
            <td style="font-size:.82rem;color:#6b7280">${formatDateTime(m.data_fim || m.data_inicio)}</td>
            <td><span class="edit-log-motivo-badge atual">Estado atual</span></td>
            <td>${m.tecnico || "-"}</td>
            <td><span class="badge ${getStatusBadge(statusEx)}">${statusEx}</span></td>
            <td class="problema-cell">${(m.problema || "-").substring(0,50)}</td>
            <td>${formatCurrency(m.custo)}</td>
        </tr>`;

        const linhasLog = logs.map(e => {
            const s = e.snapshot || {};
            return `<tr>
                <td style="font-size:.82rem;color:#6b7280">${formatDateTime(e.ts)}</td>
                <td><span class="edit-log-motivo-badge">${e.motivo || "Edição"}</span></td>
                <td>${s.tecnico || "-"}</td>
                <td><span class="badge ${getStatusBadge(s.status)}">${s.status || "-"}</span></td>
                <td class="problema-cell">${(s.problema || "-").substring(0,50)}</td>
                <td>${formatCurrency(s.custo)}</td>
            </tr>`;
        }).join("");

        document.getElementById("modalDetalhesTitle").textContent = `Histórico — Atendimento #${m.numero}`;
        document.getElementById("modalDetalhesContent").innerHTML = `
            <div class="historico-info" style="margin-bottom:16px">
                <div class="historico-info-grid">
                    <div><strong>Equipamento:</strong> ${m.equipamento}</div>
                    <div><strong>Localização:</strong> ${m.localizacao || "-"}</div>
                    <div><strong>Status atual:</strong> <span class="badge ${getStatusBadge(statusEx)}">${statusEx}</span></div>
                    ${m.resultado_reparo ? `<div><strong>Reparo:</strong> <span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span></div>` : ""}
                    <div><strong>Edições registradas:</strong> ${logs.length}</div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Data/Hora</th><th>Evento</th><th>Técnico</th><th>Status</th><th>Problema</th><th>Custo</th></tr></thead>
                    <tbody>${linhaAtual}${linhasLog}</tbody>
                </table>
            </div>
            <div style="margin-top:16px;text-align:right">
                <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px" onclick="verDetalhes(${m.id})">📄 Ver detalhes completos</button>
            </div>
            ${nfHtmlSomenteLeitura(anexos, String(m.id))}
            <div style="display:none"><!-- fim -->
            </div>`;
        openModal("modalDetalhes");
    } catch (err) { showError(err.message); }
};

// ─── ABA FINALIZADOS ──────────────────────────────────────────────────────────
async function loadFinalizados() {
    const search = document.getElementById("searchFinalizado")?.value || "";
    const tipo   = document.getElementById("filterTipoFinalizado")?.value || "";

    document.getElementById("listaFinalizados").innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
    try {
        const params = {};
        if (tipo) params.localizacao = tipo;

        const todas = await api.listarManutencoes(params);
        // Filtra localmente só as finalizadas
        let lista = todas.filter(m => m.status === "Concluída" || m.status === "Cancelada");

        // Filtro local por número do chamado, equipamento, técnico ou problema
        if (search) {
            const s = search.toLowerCase();
            lista = lista.filter(m =>
                (m.numero      || "").toString().toLowerCase().includes(s) ||
                (m.equipamento || "").toLowerCase().includes(s) ||
                (m.tecnico     || "").toLowerCase().includes(s) ||
                (m.problema    || "").toLowerCase().includes(s)
            );
        }
        if (!lista.length) {
            document.getElementById("listaFinalizados").innerHTML =
                '<div class="empty-state"><h3>Nenhuma manutenção finalizada</h3></div>';
            return;
        }
        const custoTotal = lista.reduce((s, m) => s + (m.custo || 0), 0);
        const rows = lista.map(m => {
            return `<tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td><button class="link-equipamento" onclick="verDetalhes(${m.id})">${m.equipamento}</button></td>
                <td>${m.localizacao || "-"}</td>
                <td>${m.tecnico || "-"}</td>
                <td>${formatDateTime(m.data_inicio)}</td>
                <td>${formatDateTime(m.data_fim)}</td>
                <td>${m.resultado_reparo ? `<span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span>` : "—"}</td>
                <td>${formatCurrency(m.custo)}</td>
                <td><button class="btn-icon btn-history" onclick="verHistorico(${m.id})" title="Histórico">📋</button></td>
            </tr>`;
        }).join("");
        document.getElementById("listaFinalizados").innerHTML = `
            <table>
                <thead><tr><th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                    <th>Início</th><th>Conclusão</th><th>Reparo</th><th>Custo</th><th>Hist.</th>
                </tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr>
                    <td colspan="7" style="text-align:right;font-weight:600;padding:12px 15px">Custo Total:</td>
                    <td style="font-weight:700;color:var(--primary-color);padding:12px 15px">${formatCurrency(custoTotal)}</td>
                    <td></td>
                </tr></tfoot>
            </table>`;
    } catch (err) { showError(err.message); }
}

// ─── ABA RELATÓRIOS ───────────────────────────────────────────────────────────
async function loadRelatorios() {
    const hoje = new Date();
    document.getElementById("dataFim").value   = hoje.toISOString().split("T")[0];
    document.getElementById("dataInicio").value = new Date(new Date().setMonth(hoje.getMonth()-1)).toISOString().split("T")[0];
    await loadEstatisticasPeriodo();
}

async function loadEstatisticasPeriodo() {
    try {
        const ini = document.getElementById("dataInicio").value;
        const fim = document.getElementById("dataFim").value;
        const todas = await api.listarManutencoes();
        const filtrada = todas.filter(m => {
            if (!m.data_inicio) return false;
            const d = new Date(m.data_inicio);
            return d >= new Date(ini) && d <= new Date(fim + "T23:59:59");
        });
        const custo = filtrada.reduce((s, m) => s + (m.custo || 0), 0);
        document.getElementById("estatisticasPeriodo").innerHTML = `
            <div class="stat-item"><span class="stat-item-value">${filtrada.length}</span><span class="stat-item-label">Total</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.resultado_reparo==="Consertado").length}</span><span class="stat-item-label">Consertados</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.resultado_reparo==="Sem Reparo").length}</span><span class="stat-item-label">Sem Reparo</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.status==="Concluída").length}</span><span class="stat-item-label">Concluídas</span></div>
            <div class="stat-item"><span class="stat-item-value">${formatCurrency(custo)}</span><span class="stat-item-label">Custo Total</span></div>`;
    } catch {}
}

document.getElementById("formRelatorio").addEventListener("submit", async e => {
    e.preventDefault();
    await loadEstatisticasPeriodo();
});

// ─── ABA USUÁRIOS (gerência) ──────────────────────────────────────────────────
async function loadUsuarios() {
    try {
        const lista = await api.listarUsuarios();
        const rows = lista.map(u => `
            <tr>
                <td>${u.nome}</td>
                <td>${u.username}</td>
                <td><span class="badge ${
                {gerencia:"badge-info", admin:"badge-info",
                 manutencao:"badge-warning", observador:"badge-secondary",
                 tecnico:"badge-secondary"}[u.role] || "badge-secondary"
            }">${
                {gerencia:"Gerência", admin:"Admin", manutencao:"Manutenção",
                 observador:"Observador", tecnico:"Técnico"}[u.role] || u.role
            }</span></td>
                <td>${formatDate(u.criado_em)}</td>
                <td><button class="btn-icon btn-edit" onclick="editarUsuario(${u.id}, '${u.nome}', '${u.username}', '${u.role}')" title="Editar">✏️</button>
                    <button class="btn-icon btn-delete" onclick="removeUsuario(${u.id}, '${u.username}')">🗑️</button></td>
            </tr>`).join("");
        document.getElementById("listaUsuarios").innerHTML = `
            <table>
                <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Criado em</th><th>Ações</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (err) { showError(err.message); }
}

window.removeUsuario = async function(id, username) {
    if (!confirm(`Remover o usuário "${username}"?`)) return;
    try { await api.excluirUsuario(id); loadUsuarios(); }
    catch (err) { showError(err.message); }
};

window.editarUsuario = function(id, nome, username, role) {
    document.getElementById("editUserId").value    = id;
    document.getElementById("editNome").value      = nome;
    document.getElementById("editUsername").value  = username;
    document.getElementById("editRole").value      = role;
    document.getElementById("editSenha").value     = "";
    openModal("modalEditarUsuario");
};

document.getElementById("formEditarUsuario")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = document.getElementById("editUserId").value;
    const data = {
        nome:     document.getElementById("editNome").value,
        username: document.getElementById("editUsername").value,
        role:     document.getElementById("editRole").value,
    };
    const senha = document.getElementById("editSenha").value;
    if (senha) data.senha = senha;
    try {
        await api.editarUsuario(id, data);
        closeModal("modalEditarUsuario");
        loadUsuarios();
        alert("Usuário atualizado com sucesso!");
    } catch (err) { showError(err.message); }
});

document.getElementById("formNovoUsuario")?.addEventListener("submit", async e => {
    e.preventDefault();
    const data = {
        username: document.getElementById("novoUsername").value,
        nome:     document.getElementById("novoNome").value,
        senha:    document.getElementById("novaSenha").value,
        role:     document.getElementById("novoRole").value,
    };
    try {
        await api.criarUsuario(data);
        document.getElementById("formNovoUsuario").reset();
        loadUsuarios();
        alert("Usuário criado com sucesso!");
    } catch (err) { showError(err.message); }
});

// =============================================
// NOTAS FISCAIS — armazenamento no backend (API)
// Rota: /manutencoes/{id}/anexos
// =============================================

const NF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo

function nfFormatarTamanho(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function nfIcone(tipo) {
    if (tipo.includes("pdf"))   return "📄";
    if (tipo.includes("image")) return "🖼️";
    if (tipo.includes("word") || tipo.includes("document")) return "📝";
    if (tipo.includes("sheet") || tipo.includes("excel"))   return "📊";
    return "📎";
}

// Busca anexos do backend
async function nfCarregar(id) {
    try {
        const lista = await api.listarAnexos(id);
        return lista || [];
    } catch { return []; }
}

// Renderiza a lista de anexos no modal (agora async)
async function nfRenderizar(id) {
    const el = document.getElementById("nfLista");
    if (!el) return;
    el.innerHTML = "<p class='nf-vazio'>Carregando anexos...</p>";

    const lista = await nfCarregar(id);

    if (!lista.length) {
        el.innerHTML = "<p class='nf-vazio'>Nenhum anexo adicionado.</p>";
        return;
    }

    el.innerHTML = lista.map((arq, i) => `
        <div class="nf-item">
            <span class="nf-icone">${nfIcone(arq.tipo)}</span>
            <div class="nf-info">
                <span class="nf-nome">${arq.nome}</span>
                <span class="nf-meta">${nfFormatarTamanho(arq.tamanho)} · ${arq.data}</span>
            </div>
            <div class="nf-acoes">
                <button type="button" class="btn-nf btn-nf-ver"      onclick="nfVisualizar(${i},'${id}')" title="Visualizar">👁️</button>
                <button type="button" class="btn-nf btn-nf-baixar"   onclick="nfBaixar(${i},'${id}')"    title="Download">⬇️</button>
                <button type="button" class="btn-nf btn-nf-remover"  onclick="nfRemover(${arq.id},'${id}')"   title="Remover">🗑️</button>
            </div>
        </div>`).join("");
}

// Adiciona arquivos — envia para o backend
window.nfAdicionarArquivos = function(files) {
    const id = document.getElementById("manutencaoId").value;
    if (!id) { alert("Salve a manutenção antes de adicionar anexos."); return; }

    Array.from(files).forEach(file => {
        if (file.size > NF_MAX_BYTES) {
            alert(`"${file.name}" ultrapassa 5 MB e não foi adicionado.`);
            return;
        }
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                await api.adicionarAnexo(id, {
                    nome:    file.name,
                    tipo:    file.type,
                    tamanho: file.size,
                    data:    new Date().toLocaleDateString("pt-BR"),
                    base64:  e.target.result,
                });
                nfRenderizar(id);
            } catch (err) {
                alert("Erro ao salvar anexo: " + err.message);
            }
        };
        reader.readAsDataURL(file);
    });

    document.getElementById("nfInput").value = "";
};

// Drag-and-drop na dropzone
document.getElementById("nfDropzone")?.addEventListener("dragover", e => {
    e.preventDefault();
    e.currentTarget.classList.add("nf-drag-over");
});
document.getElementById("nfDropzone")?.addEventListener("dragleave", e => {
    e.currentTarget.classList.remove("nf-drag-over");
});
document.getElementById("nfDropzone")?.addEventListener("drop", e => {
    e.preventDefault();
    e.currentTarget.classList.remove("nf-drag-over");
    window.nfAdicionarArquivos(e.dataTransfer.files);
});

// Visualizar: abre em nova aba
// Renderiza anexos somente-leitura (histórico / detalhes)
function nfHtmlSomenteLeitura(lista, id) {
    if (!lista.length) return "";
    const itens = lista.map((arq, i) => `
        <div class="nf-item">
            <span class="nf-icone">${nfIcone(arq.tipo)}</span>
            <div class="nf-info">
                <span class="nf-nome">${arq.nome}</span>
                <span class="nf-meta">${nfFormatarTamanho(arq.tamanho)} · ${arq.data}</span>
            </div>
            <div class="nf-acoes">
                <button type="button" class="btn-nf btn-nf-ver"    onclick="nfVisualizar(${i},'${id}')" title="Visualizar">👁️</button>
                <button type="button" class="btn-nf btn-nf-baixar" onclick="nfBaixar(${i},'${id}')"    title="Download">⬇️</button>
            </div>
        </div>`).join("");
    return `
        <div style="margin-top:20px">
            <p><strong>📎 Anexos (${lista.length})</strong></p>
            <div class="nf-lista" style="margin-top:8px">${itens}</div>
        </div>`;
}

// ─── Visualizador em modal interno (sem abrir nova aba) ──────────────────────
window.nfVisualizar = async function(i, id) {
    const lista = await nfCarregar(id);
    const arq = lista[i];
    if (!arq) return;

    document.getElementById("modalAnexoNome").textContent  = arq.nome;
    document.getElementById("modalAnexoIcone").textContent = nfIcone(arq.tipo);

    const body = document.getElementById("modalAnexoBody");
    if (arq.tipo.includes("image")) {
        body.innerHTML = `<img src="${arq.base64}" alt="${arq.nome}" class="modal-anexo-img">`;
    } else if (arq.tipo.includes("pdf")) {
        body.innerHTML = `<iframe src="${arq.base64}" class="modal-anexo-iframe"></iframe>`;
    } else {
        body.innerHTML = `
            <div class="modal-anexo-sem-preview">
                <div style="font-size:4rem;margin-bottom:16px">${nfIcone(arq.tipo)}</div>
                <p style="font-size:1.05rem;font-weight:600;color:var(--text-primary);margin-bottom:8px">${arq.nome}</p>
                <p style="font-size:.9rem;color:var(--text-secondary)">
                    Este tipo de arquivo não pode ser visualizado aqui.<br>Use o botão Download para abrir.
                </p>
            </div>`;
    }

    // Botão de download dentro do modal
    document.getElementById("btnModalAnexoBaixar").onclick = () => {
        const a = document.createElement("a");
        a.href = arq.base64; a.download = arq.nome; a.click();
    };

    openModal("modalAnexo");
};

// Download
window.nfBaixar = async function(i, id) {
    const lista = await nfCarregar(id);
    const arq = lista[i];
    if (!arq) return;
    const a = document.createElement("a");
    a.href     = arq.base64;
    a.download = arq.nome;
    a.click();
};

// Remover — deleta no backend pelo ID do anexo
window.nfRemover = async function(anexoId, manutencaoId) {
    const lista = await nfCarregar(manutencaoId);
    const arq = lista.find(a => a.id === anexoId);
    if (!confirm(`Remover "${arq?.nome || "este anexo"}"?`)) return;
    try {
        await api.removerAnexo(manutencaoId, anexoId);
        nfRenderizar(manutencaoId);
    } catch (err) {
        alert("Erro ao remover anexo: " + err.message);
    }
};

// Mostra contagem de anexos (agora async)
async function nfContagem(id) {
    const lista = await nfCarregar(id);
    const n = lista.length;
    return n ? `<span class="nf-badge">${n} anexo${n > 1 ? "s" : ""}</span>` : "";
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
document.getElementById("searchManutencao")?.addEventListener("input", loadManutencoes);
document.getElementById("filterTipoManutencao")?.addEventListener("change", loadManutencoes);
document.getElementById("filterStatusManutencao")?.addEventListener("change", loadManutencoes);
document.getElementById("searchFinalizado")?.addEventListener("input", loadFinalizados);
document.getElementById("filterTipoFinalizado")?.addEventListener("change", loadFinalizados);
