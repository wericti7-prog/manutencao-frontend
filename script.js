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
    const menuLixeira = document.getElementById("menuLixeira");
    if (menuLixeira) menuLixeira.style.display = ["gerencia","admin"].includes(u.role) ? "block" : "none";

    // Aba Relatórios: visível somente para gerencia/admin
    const menuRelatorios = document.querySelector(".tab-btn[data-tab='relatorios']");
    if (menuRelatorios) menuRelatorios.style.display = ["gerencia","admin"].includes(u.role) ? "block" : "none";

    // Botão Nova Manutenção: oculto para observador
    const btnNova = document.getElementById("btnNovaManutencao");
    if (btnNova) btnNova.style.display = u.role === "observador" ? "none" : "inline-flex";

    updateStats();
    loadManutencoes();
    chatIniciar();
}

function mostrarLogin() {
    chatParar();
    const w = document.getElementById("chat-widget");
    const f = document.getElementById("chat-fab");
    if (w) w.remove();
    if (f) f.remove();
    _chatUltimoId = 0; _chatNaoLidas = 0; _chatAnexos = [];
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
        if (tab === "lixeira")     loadLixeira();
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
                <button class="btn-icon btn-history" onclick="verDetalhes(${m.id})" title="Ver detalhes">📋</button>
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
        const userRole = api.getUsuarioLogado()?.role || "";
        const [m, anexos] = await Promise.all([api.getManutencao(id), api.listarAnexos(id).catch(() => [])]);
        const statusEx  = m.resultado_reparo || m.status_equipamento || m.status;
        const reparoHtml = m.resultado_reparo
            ? `<div><strong>Reparo:</strong> <span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span></div>` : "";

        document.getElementById("modalDetalhesTitle").textContent = `Atendimento #${m.numero}`;

        // ─── Aba RESPONDER (Observador e Manutenção) ───────────────────────────
        const podeUsarResposta = ["observador", "manutencao"].includes(userRole);

        const tabsHtml = podeUsarResposta ? `
            <div class="det-tabs">
                <button class="det-tab-btn active" onclick="detSwitchTab('detalhes','${id}')">📄 Detalhes</button>
                <button class="det-tab-btn" onclick="detSwitchTab('responder','${id}')">💬 Responder</button>
            </div>` : "";

        document.getElementById("modalDetalhesContent").innerHTML = `
            ${tabsHtml}
            <div id="det-panel-detalhes" class="det-panel active">
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
                <div id="det-respostas-lista-${id}" style="margin-top:20px"></div>
            </div>
            <div id="det-panel-responder" class="det-panel" style="display:none">
                <div id="det-responder-content-${id}">
                    <p style="color:var(--text-secondary);font-size:.9rem">Carregando...</p>
                </div>
            </div>`;

        // Todos os perfis veem respostas; podeUsarResposta controla o formulário
        detCarregarRespostas(id, userRole);

        openModal("modalDetalhes");
    } catch (err) { showError(err.message); }
};

window.detSwitchTab = function(tab, id) {
    document.querySelectorAll(".det-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".det-panel").forEach(p => p.style.display = "none");
    document.getElementById(`det-panel-${tab}`).style.display = "block";
    event.currentTarget.classList.add("active");
};

async function detCarregarRespostas(id, userRole) {
    const listaEl    = document.getElementById(`det-respostas-lista-${id}`);
    const contentEl  = document.getElementById(`det-responder-content-${id}`);

    // Garante que o usuário está logado antes de fazer requisições
    if (!api.isLogado()) return;

    try {
        const respostas = await api.listarRespostas(id);

        // Renderiza thread de respostas no painel de detalhes
        if (listaEl) {
            if (respostas.length) {
                const itens = respostas.map(r => {
                    const isManut   = r.role === "manutencao";
                    const cor       = isManut ? "#eff6ff" : "#f0fdf4";
                    const borda     = isManut ? "#3b82f6" : "#22c55e";
                    const label     = isManut ? "🔧 Manutenção" : "👁️ Observador";
                    const anexosHtml = r.anexos_resposta?.map((a, i) => `
                        <div class="nf-item" style="margin-top:6px">
                            <span class="nf-icone">${nfIcone(a.tipo)}</span>
                            <div class="nf-info">
                                <span class="nf-nome">${a.nome}</span>
                                <span class="nf-meta">${nfFormatarTamanho(a.tamanho)} · ${a.data}</span>
                            </div>
                            <div class="nf-acoes">
                                <button type="button" class="btn-nf btn-nf-ver"
                                    onclick="detVisualizarAnexoResposta('${a.base64}','${a.nome}','${a.tipo}')" title="Visualizar">👁️</button>
                                <button type="button" class="btn-nf btn-nf-baixar"
                                    onclick="detBaixarAnexoResposta('${a.base64}','${a.nome}')" title="Download">⬇️</button>
                            </div>
                        </div>`).join("") || "";
                    return `
                        <div style="border-left:3px solid ${borda};background:${cor};
                                    padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:10px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                                <strong style="font-size:.88rem">${label} — ${r.autor}</strong>
                                <span style="font-size:.78rem;color:var(--text-secondary)">${formatDateTime(r.criado_em)}</span>
                            </div>
                            ${r.texto ? `<p style="font-size:.9rem;margin:0 0 6px">${r.texto}</p>` : ""}
                            ${anexosHtml}
                        </div>`;
                }).join("");
                listaEl.innerHTML = `<p><strong>💬 Mensagens (${respostas.length})</strong></p>${itens}`;
            }
        }

        // Painel RESPONDER: formulário só para observador/manutencao
        if (!contentEl) return;

        const podeUsarResposta = ["observador", "manutencao"].includes(userRole);
        if (!podeUsarResposta) {
            contentEl.innerHTML = "";
            return;
        }

        // Formulário de resposta
        const labelAnexo = userRole === "observador"
            ? "📎 Anexo (obrigatório)"
            : "📎 Anexo (opcional)";
        contentEl.innerHTML = `
            <div id="resp-form-${id}">
                <div style="margin-bottom:14px">
                    <label style="font-weight:600;font-size:.9rem;display:block;margin-bottom:6px">✍️ Mensagem</label>
                    <textarea id="resp-texto-${id}" rows="4"
                        style="width:100%;border:1px solid var(--border-color);border-radius:8px;
                               padding:10px;font-size:.9rem;resize:vertical;box-sizing:border-box"
                        placeholder="Digite sua mensagem..."></textarea>
                </div>
                <div style="margin-bottom:14px">
                    <label style="font-weight:600;font-size:.9rem;display:block;margin-bottom:6px">${labelAnexo}</label>
                    <div id="resp-dropzone-${id}" class="nf-dropzone"
                        style="cursor:pointer" onclick="document.getElementById('resp-input-${id}').click()">
                        <p style="margin:0;font-size:.88rem;color:var(--text-secondary)">
                            📂 Clique ou arraste arquivos aqui (máx. 5 MB cada)
                        </p>
                    </div>
                    <input type="file" id="resp-input-${id}" multiple style="display:none">
                    <div id="resp-lista-${id}" style="margin-top:8px"></div>
                </div>
                <button class="btn btn-primary" onclick="respEnviar('${id}','${userRole}')"
                    style="width:100%">📤 Enviar Resposta</button>
            </div>`;

        // Pendurando arquivos selecionados em memória
        window[`_respAnexos_${id}`] = [];

        document.getElementById(`resp-input-${id}`).addEventListener("change", e => {
            respAdicionarArquivos(id, e.target.files);
            e.target.value = "";
        });

        const dz = document.getElementById(`resp-dropzone-${id}`);
        dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("nf-drag-over"); });
        dz.addEventListener("dragleave", () => dz.classList.remove("nf-drag-over"));
        dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("nf-drag-over"); respAdicionarArquivos(id, e.dataTransfer.files); });

    } catch (err) {
        if (contentEl) contentEl.innerHTML = `<p style="color:red">Erro ao carregar: ${err.message}</p>`;
    }
}

window.detBaixarAnexoResposta = function(base64, nome) {
    const a = document.createElement("a");
    a.href = base64; a.download = nome; a.click();
};

window.detVisualizarAnexoResposta = function(base64, nome, tipo) {
    document.getElementById("modalAnexoNome").textContent  = nome;
    document.getElementById("modalAnexoIcone").textContent = nfIcone(tipo);
    const body = document.getElementById("modalAnexoBody");
    if (tipo.includes("image")) {
        body.innerHTML = `<img src="${base64}" alt="${nome}" class="modal-anexo-img">`;
    } else if (tipo.includes("pdf")) {
        body.innerHTML = `<iframe src="${base64}" class="modal-anexo-iframe"></iframe>`;
    } else {
        body.innerHTML = `
            <div class="modal-anexo-sem-preview">
                <div style="font-size:4rem;margin-bottom:16px">${nfIcone(tipo)}</div>
                <p style="font-size:1.05rem;font-weight:600;color:var(--text-primary);margin-bottom:8px">${nome}</p>
                <p style="font-size:.9rem;color:var(--text-secondary)">
                    Este tipo de arquivo não pode ser visualizado aqui.<br>Use o botão Download para abrir.
                </p>
            </div>`;
    }
    document.getElementById("btnModalAnexoBaixar").onclick = () => {
        const a = document.createElement("a");
        a.href = base64; a.download = nome; a.click();
    };
    openModal("modalAnexo");
};

function respAdicionarArquivos(id, files) {
    const MAX = 5 * 1024 * 1024;
    const lista = window[`_respAnexos_${id}`] || [];
    Array.from(files).forEach(file => {
        if (file.size > MAX) { alert(`"${file.name}" ultrapassa 5 MB.`); return; }
        const reader = new FileReader();
        reader.onload = e => {
            lista.push({ nome: file.name, tipo: file.type, tamanho: file.size,
                         data: new Date().toLocaleDateString("pt-BR"), base64: e.target.result });
            window[`_respAnexos_${id}`] = lista;
            respRenderizarLista(id);
        };
        reader.readAsDataURL(file);
    });
}

function respRenderizarLista(id) {
    const lista = window[`_respAnexos_${id}`] || [];
    const el = document.getElementById(`resp-lista-${id}`);
    if (!el) return;
    if (!lista.length) { el.innerHTML = ""; return; }
    el.innerHTML = lista.map((a, i) => `
        <div class="nf-item">
            <span class="nf-icone">${nfIcone(a.tipo)}</span>
            <div class="nf-info">
                <span class="nf-nome">${a.nome}</span>
                <span class="nf-meta">${nfFormatarTamanho(a.tamanho)}</span>
            </div>
            <div class="nf-acoes">
                <button type="button" class="btn-nf btn-nf-remover"
                    onclick="respRemoverArquivo('${id}',${i})" title="Remover">🗑️</button>
            </div>
        </div>`).join("");
}

window.respRemoverArquivo = function(id, i) {
    const lista = window[`_respAnexos_${id}`] || [];
    lista.splice(i, 1);
    window[`_respAnexos_${id}`] = lista;
    respRenderizarLista(id);
};

window.respEnviar = async function(id, userRole) {
    const texto  = document.getElementById(`resp-texto-${id}`)?.value?.trim() || "";
    const anexos = window[`_respAnexos_${id}`] || [];

    if (!texto && !anexos.length) {
        alert("Digite uma mensagem ou adicione pelo menos um anexo."); return;
    }
    if (userRole === "observador" && !anexos.length) {
        alert("O Observador deve incluir pelo menos um anexo na resposta."); return;
    }

    try {
        await api.criarResposta(id, { texto, anexos });
        alert("Resposta enviada com sucesso!");
        // Limpa e recarrega
        window[`_respAnexos_${id}`] = [];
        // Volta para aba de detalhes e recarrega
        document.querySelectorAll(".det-tab-btn")[0]?.click();
        verDetalhes(parseInt(id));
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
                <button class="btn btn-primary" style="font-size:.88rem;padding:8px 16px;margin-right:8px" onclick="verDetalhes(${m.id})">📄 Ver detalhes completos</button>
                <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px" onclick="verHistorico(${m.id})">📋 Ver histórico de edições</button>
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
            const u = api.getUsuarioLogado();
            const isGerencia = u && ["gerencia","admin"].includes(u.role);
            return `<tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td><button class="link-equipamento" onclick="verDetalhes(${m.id})">${m.equipamento}</button></td>
                <td>${m.localizacao || "-"}</td>
                <td>${m.tecnico || "-"}</td>
                <td>${formatDateTime(m.data_inicio)}</td>
                <td>${formatDateTime(m.data_fim)}</td>
                <td>${m.resultado_reparo ? `<span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span>` : "—"}</td>
                <td>${formatCurrency(m.custo)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-history" onclick="verDetalhes(${m.id})" title="Ver detalhes">📋</button>
                        ${isGerencia ? `<button class="btn-icon btn-edit" onclick="abrirModalReabrir(${m.id})" title="Reabrir chamado">↩️</button>` : ""}
                        ${isGerencia ? `<button class="btn-icon btn-delete" onclick="deleteManutencao(${m.id})" title="Excluir">🗑️</button>` : ""}
                    </div>
                </td>
            </tr>`;
        }).join("");
        document.getElementById("listaFinalizados").innerHTML = `
            <table>
                <thead><tr><th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                    <th>Início</th><th>Conclusão</th><th>Reparo</th><th>Custo</th><th>Ações</th>
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

// ─── REABRIR CHAMADO (gerência) ───────────────────────────────────────────────
window.abrirModalReabrir = function(id) {
    document.getElementById("reabrirId").value = id;
    document.getElementById("reabrirStatus").value = "Em Manutenção";
    openModal("modalReabrir");
};

document.getElementById("btnConfirmarReabrir")?.addEventListener("click", async () => {
    const id     = document.getElementById("reabrirId").value;
    const status = document.getElementById("reabrirStatus").value;
    try {
        await api.reabrirManutencao(id, status);
        closeModal("modalReabrir");
        loadManutencoes();
        loadFinalizados();
        updateStats();
    } catch (err) { showError(err.message); }
});

// ─── LIXEIRA (gerência) ───────────────────────────────────────────────────────
async function loadLixeira() {
    const el = document.getElementById("listaLixeira");
    if (!el) return;
    try {
        const lista = await api.listarLixeira();
        if (!lista.length) {
            el.innerHTML = `<div class="empty-state"><h3>Lixeira vazia</h3><p>Nenhum chamado excluído.</p></div>`;
            return;
        }
        const rows = await Promise.all(lista.map(async m => {
            const deletadoEm = m.deletado_em ? new Date(m.deletado_em).toLocaleString("pt-BR") : "—";
            return `<tr>
                <td><span class="id-badge">#${m.numero}</span></td>
                <td>${m.equipamento}</td>
                <td>${m.localizacao || "—"}</td>
                <td>${m.tecnico || "—"}</td>
                <td><span class="badge badge-secondary">${m.status}</span></td>
                <td style="font-size:.85rem;color:var(--text-secondary)">${deletadoEm}</td>
                <td style="font-size:.85rem;color:var(--text-secondary)">${m.deletado_por || "—"}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" title="Restaurar" onclick="restaurarChamado(${m.id})">↩️</button>
                    </div>
                </td>
            </tr>`;
        }));
        el.innerHTML = `<table>
            <thead><tr>
                <th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                <th>Status</th><th>Excluído em</th><th>Excluído por</th><th>Ações</th>
            </tr></thead>
            <tbody>${rows.join("")}</tbody>
        </table>`;
    } catch (err) { showError(err.message); }
}

window.restaurarChamado = async function(id) {
    if (!confirm("Restaurar este chamado da lixeira?")) return;
    try {
        await api.restaurarManutencao(id);
        loadLixeira();
        updateStats();
    } catch (err) { showError(err.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT FLUTUANTE GLOBAL (Suprimentos ↔ Manutenção)
// ═══════════════════════════════════════════════════════════════════════════════
let _chatAberto       = false;
let _chatUltimoId     = 0;
let _chatAnexos       = [];
let _chatPollingTimer = null;
let _chatNaoLidas     = 0;

function chatPodeEnviar() {
    const role = api.getUsuarioLogado()?.role || "";
    return ["observador", "manutencao"].includes(role);
}

function chatIniciar() {
    if (!api.isLogado()) return;
    _chatCriarWidget();
    chatPolling();
}

function chatParar() {
    if (_chatPollingTimer) { clearInterval(_chatPollingTimer); _chatPollingTimer = null; }
}

async function chatPolling() {
    chatParar();
    await chatCarregarNovas();
    _chatPollingTimer = setInterval(chatCarregarNovas, 5000);
}

async function chatCarregarNovas() {
    if (!api.isLogado()) return;
    try {
        const msgs = await api.listarChat(_chatUltimoId);
        if (!msgs.length) return;
        _chatUltimoId = msgs[msgs.length - 1].id;
        const lista = document.getElementById("chat-lista");
        if (!lista) return;
        msgs.forEach(m => {
            const minha = m.autor === api.getUsuarioLogado()?.nome;
            lista.appendChild(_chatCriarBolha(m, minha));
        });
        // Badge de não lidas quando minimizado
        if (!_chatAberto) {
            _chatNaoLidas += msgs.length;
            _chatAtualizarBadge();
        } else {
            _chatScrollBottom();
        }
    } catch {}
}

function _chatAtualizarBadge() {
    const badge = document.getElementById("chat-badge");
    if (!badge) return;
    if (_chatNaoLidas > 0) {
        badge.textContent = _chatNaoLidas > 99 ? "99+" : _chatNaoLidas;
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

function _chatScrollBottom() {
    const lista = document.getElementById("chat-lista");
    if (lista) lista.scrollTop = lista.scrollHeight;
}

function _chatCriarBolha(m, minha) {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg-wrap " + (minha ? "chat-msg-minha" : "chat-msg-deles");

    const hora = m.criado_em ? new Date(m.criado_em).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}) : "";
    const label = m.role === "manutencao" ? "🔧 " + m.autor : "👁️ " + m.autor;

    let anexosHtml = "";
    if (m.anexos?.length) {
        anexosHtml = m.anexos.map(a => `
            <div class="chat-anexo" onclick="chatVerAnexo('${encodeURIComponent(a.base64)}','${encodeURIComponent(a.nome)}','${encodeURIComponent(a.tipo)}')">
                <span class="chat-anexo-icone">${nfIcone(a.tipo)}</span>
                <div class="chat-anexo-info">
                    <span class="chat-anexo-nome">${a.nome}</span>
                    <span class="chat-anexo-meta">${nfFormatarTamanho(a.tamanho)}</span>
                </div>
                <span class="chat-anexo-dl">⬇️</span>
            </div>`).join("");
    }

    wrap.innerHTML = `
        <div class="chat-bolha">
            <div class="chat-autor">${label}</div>
            ${m.texto ? `<div class="chat-texto">${m.texto}</div>` : ""}
            ${anexosHtml}
            <div class="chat-hora">${hora}</div>
        </div>`;
    return wrap;
}

window.chatVerAnexo = function(b64enc, nomeEnc, tipoEnc) {
    const base64 = decodeURIComponent(b64enc);
    const nome   = decodeURIComponent(nomeEnc);
    const tipo   = decodeURIComponent(tipoEnc);
    const a = document.createElement("a");
    a.href = base64; a.download = nome; a.click();
};

function _chatCriarWidget() {
    if (document.getElementById("chat-widget")) return;

    const role = api.getUsuarioLogado()?.role || "";
    const podeEnviar = chatPodeEnviar();

    const inputArea = podeEnviar ? `
        <div class="chat-input-area">
            <div class="chat-anexos-preview" id="chat-anexos-preview"></div>
            <div class="chat-input-row">
                <button class="chat-btn-anexo" onclick="document.getElementById('chat-file-input').click()" title="Anexar arquivo">📎</button>
                <input type="file" id="chat-file-input" multiple style="display:none">
                <textarea id="chat-textarea" class="chat-textarea" rows="1"
                    placeholder="Mensagem..." onkeydown="chatKeyDown(event)"></textarea>
                <button class="chat-btn-enviar" onclick="chatEnviar()" title="Enviar">➤</button>
            </div>
        </div>` : `
        <div class="chat-somente-leitura">
            👁️ Apenas Suprimentos e Manutenção podem enviar mensagens.
        </div>`;

    const widget = document.createElement("div");
    widget.id = "chat-widget";
    widget.className = "chat-widget chat-fechado";
    widget.innerHTML = `
        <div class="chat-header" onclick="chatToggle()">
            <div class="chat-header-info">
                <span class="chat-header-icone">💬</span>
                <div>
                    <div class="chat-header-titulo">Chat — Suprimentos & Manutenção</div>
                    <div class="chat-header-sub">Canal direto entre equipes</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span class="chat-status-dot" title="Online"></span>
                <span class="chat-toggle-icone" id="chat-toggle-icone">▲</span>
            </div>
        </div>
        <div class="chat-body" id="chat-body">
            <div class="chat-lista" id="chat-lista">
                <div class="chat-vazio" id="chat-vazio">
                    <div style="font-size:2rem;margin-bottom:8px">💬</div>
                    <p>Nenhuma mensagem ainda.</p>
                    <p style="font-size:.8rem;opacity:.7">As mensagens ficam visíveis para todos.</p>
                </div>
            </div>
            ${inputArea}
        </div>`;

    document.body.appendChild(widget);

    // Badge no botão flutuante
    const fab = document.createElement("div");
    fab.id = "chat-fab";
    fab.className = "chat-fab";
    fab.title = "Abrir chat";
    fab.onclick = chatToggle;
    fab.innerHTML = `
        <span style="font-size:1.4rem">💬</span>
        <span class="chat-badge" id="chat-badge" style="display:none">0</span>`;
    document.body.appendChild(fab);

    // Eventos de arquivo
    document.getElementById("chat-file-input")?.addEventListener("change", e => {
        chatAdicionarArquivos(e.target.files);
        e.target.value = "";
    });
}

window.chatToggle = function() {
    const widget = document.getElementById("chat-widget");
    const fab    = document.getElementById("chat-fab");
    const icone  = document.getElementById("chat-toggle-icone");
    if (!widget) return;

    _chatAberto = !_chatAberto;
    widget.classList.toggle("chat-fechado", !_chatAberto);
    widget.classList.toggle("chat-aberto",   _chatAberto);
    fab.style.display = _chatAberto ? "none" : "flex";

    if (icone) icone.textContent = _chatAberto ? "▼" : "▲";

    if (_chatAberto) {
        _chatNaoLidas = 0;
        _chatAtualizarBadge();
        setTimeout(_chatScrollBottom, 100);
    }
};

window.chatKeyDown = function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatEnviar();
    }
};

function chatAdicionarArquivos(files) {
    const MAX = 5 * 1024 * 1024;
    Array.from(files).forEach(file => {
        if (file.size > MAX) { alert(`"${file.name}" ultrapassa 5 MB.`); return; }
        const reader = new FileReader();
        reader.onload = e => {
            _chatAnexos.push({ nome: file.name, tipo: file.type, tamanho: file.size,
                               data: new Date().toLocaleDateString("pt-BR"), base64: e.target.result });
            chatRenderizarPreview();
        };
        reader.readAsDataURL(file);
    });
}

function chatRenderizarPreview() {
    const el = document.getElementById("chat-anexos-preview");
    if (!el) return;
    el.innerHTML = _chatAnexos.map((a, i) => `
        <div class="chat-preview-item">
            <span>${nfIcone(a.tipo)}</span>
            <span class="chat-preview-nome">${a.nome}</span>
            <button onclick="chatRemoverAnexo(${i})" class="chat-preview-rm">✕</button>
        </div>`).join("");
    el.style.display = _chatAnexos.length ? "block" : "none";
}

window.chatRemoverAnexo = function(i) {
    _chatAnexos.splice(i, 1);
    chatRenderizarPreview();
};

window.chatEnviar = async function() {
    const textarea = document.getElementById("chat-textarea");
    const texto    = textarea?.value?.trim() || "";
    if (!texto && !_chatAnexos.length) return;

    const btnEnviar = document.querySelector(".chat-btn-enviar");
    if (btnEnviar) btnEnviar.disabled = true;

    try {
        await api.enviarChat({ texto, anexos: _chatAnexos });
        if (textarea) textarea.value = "";
        _chatAnexos = [];
        chatRenderizarPreview();
        // Remove aviso de vazio
        const vazio = document.getElementById("chat-vazio");
        if (vazio) vazio.remove();
        await chatCarregarNovas();
    } catch (err) {
        alert("Erro ao enviar: " + err.message);
    } finally {
        if (btnEnviar) btnEnviar.disabled = false;
        textarea?.focus();
    }
};
