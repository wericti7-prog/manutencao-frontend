// ═══════════════════════════════════════════════════════════════════════════
// ════════════════ CALENDÁRIO DE MANUTENÇÕES - LÓGICA ═════════════════════
// ═══════════════════════════════════════════════════════════════════════════

// ─── Variáveis Globais ─────────────────────────────────────────────────────
let _calendarioData = new Date();
let _calendarioManuencoes = {}; // { "YYYY-MM-DD": [manutencoes...] }
let _calendarioCarregando = false;

// ─── Inicialização ────────────────────────────────────────────────────────
function calendarioInit() {
    document.getElementById("btnMesAnterior").addEventListener("click", calendarioMesAnterior);
    document.getElementById("btnProximoMes").addEventListener("click", calendarioProximoMes);
    document.getElementById("btnHoje").addEventListener("click", calendarioIrHoje);
}

// ─── Navegação ────────────────────────────────────────────────────────────
function calendarioMesAnterior() {
    _calendarioData.setMonth(_calendarioData.getMonth() - 1);
    calendarioCarregar(); // Recarrega dados ao mudar mês
}

function calendarioProximoMes() {
    _calendarioData.setMonth(_calendarioData.getMonth() + 1);
    calendarioCarregar(); // Recarrega dados ao mudar mês
}

function calendarioIrHoje() {
    _calendarioData = new Date();
    calendarioCarregar(); // Recarrega dados ao voltar para hoje
}

// ─── Carregar Manutenções ─────────────────────────────────────────────────
async function calendarioCarregar() {
    if (_calendarioCarregando) return;
    _calendarioCarregando = true;

    try {
        const manuencoes = await api.listarManutencoes();
        _calendarioManuencoes = {};

        manuencoes.forEach(m => {
            // Registra data de início
            if (m.data_inicio) {
                const dataCriacao = new Date(m.data_inicio);
                const chave = calendarioFormatarData(dataCriacao);
                if (!_calendarioManuencoes[chave]) _calendarioManuencoes[chave] = [];
                _calendarioManuencoes[chave].push({ ...m, evento: "abertura" });
            }

            // Registra data de fechamento
            if (m.data_fim && (m.status === "Concluída" || m.status === "Cancelada")) {
                const dataFim = new Date(m.data_fim);
                const chave = calendarioFormatarData(dataFim);
                if (!_calendarioManuencoes[chave]) _calendarioManuencoes[chave] = [];
                _calendarioManuencoes[chave].push({ ...m, evento: "fechamento" });
            }
        });

        calendarioRenderizar();
    } catch (err) {
        console.error("Erro ao carregar manutenções:", err);
        showError("Erro ao carregar calendário de manutenções");
    } finally {
        _calendarioCarregando = false;
    }
}

// ─── Renderizar Calendário ────────────────────────────────────────────────
function calendarioRenderizar() {
    const mes = _calendarioData.getMonth();
    const ano = _calendarioData.getFullYear();
    const hoje = new Date();

    // Atualizar título
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                   "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById("calendarioMesAno").textContent = `${meses[mes]} ${ano}`;

    // Obter primeiro dia do mês e número de dias
    const primeroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diaInicial = primeroDia.getDay(); // 0 = domingo
    const diasMes = ultimoDia.getDate();
    const diasMesAnterior = new Date(ano, mes, 0).getDate();

    // Container do calendário
    const container = document.getElementById("calendarioCorpo");
    
    // Limpar dias anteriores (manter apenas cabeçalho)
    while (container.children.length > 7) {
        container.removeChild(container.lastChild);
    }

    // Adicionar dias do mês anterior
    for (let i = diaInicial - 1; i >= 0; i--) {
        const dia = diasMesAnterior - i;
        const el = calendarioCriarDiaElement(dia, mes - 1, ano, true);
        container.appendChild(el);
    }

    // Adicionar dias do mês atual
    for (let dia = 1; dia <= diasMes; dia++) {
        const ehHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
        const el = calendarioCriarDiaElement(dia, mes, ano, false, ehHoje);
        container.appendChild(el);
    }

    // Adicionar dias do próximo mês
    const diasRestantes = 42 - (diaInicial + diasMes); // 6 linhas × 7 dias
    for (let dia = 1; dia <= diasRestantes; dia++) {
        const el = calendarioCriarDiaElement(dia, mes + 1, ano, true);
        container.appendChild(el);
    }
}

// ─── Criar Elemento de Dia ────────────────────────────────────────────────
function calendarioCriarDiaElement(dia, mes, ano, foraDoMes = false, ehHoje = false) {
    // Corrigir mês/ano se sair do intervalo
    while (mes < 0) { ano--; mes += 12; }
    while (mes > 11) { ano++; mes -= 12; }

    const el = document.createElement("div");
    el.className = "calendario-dia";

    if (foraDoMes) {
        el.classList.add("fora-do-mes");
    } else if (ehHoje) {
        el.classList.add("hoje");
    }

    const chave = `${String(ano).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const manuencoes = _calendarioManuencoes[chave] || [];

    // Adicionar número do dia
    const numEl = document.createElement("div");
    numEl.className = "calendario-dia-numero";
    numEl.textContent = dia;
    el.appendChild(numEl);

    // Adicionar badge de contagem
    if (manuencoes.length > 0) {
        const badge = document.createElement("div");
        badge.className = "calendario-dia-badge";
        if (manuencoes.length > 1) badge.classList.add("multiple");
        badge.textContent = manuencoes.length;
        el.appendChild(badge);
    }

    // Adicionar container de manutenções
    if (!foraDoMes && manuencoes.length > 0) {
        // Determinar classe de cor predominante
        const hasAberta = manuencoes.some(m => m.status !== "Concluída" && m.status !== "Cancelada");
        const hasEncerrada = manuencoes.some(m => m.status === "Concluída");
        const hasCancelada = manuencoes.some(m => m.status === "Cancelada");

        if (manuencoes.length > 1) {
            el.classList.add("com-multipla");
        } else if (hasEncerrada) {
            el.classList.add("com-concluida");
        } else if (hasCancelada) {
            el.classList.add("com-cancelada");
        } else if (hasAberta) {
            el.classList.add("com-aberta");
        }

        const manutencoeDiv = document.createElement("div");
        manutencoeDiv.className = "calendario-dia-manuencoes";

        manuencoes.slice(0, 3).forEach(m => {
            const tag = document.createElement("div");
            tag.className = "calendario-manuencao-tag";
            
            const statusClass = m.status === "Concluída" ? "concluida"
                              : m.status === "Cancelada" ? "cancelada"
                              : "aberta";
            tag.classList.add(statusClass);

            const label = m.evento === "fechamento" ? "✓" : "•";
            tag.textContent = `${label} ${m.numero || m.equipamento.substring(0, 12)}`;
            tag.title = m.equipamento;
            
            manutencoeDiv.appendChild(tag);
        });

        if (manuencoes.length > 3) {
            const extra = document.createElement("div");
            extra.className = "calendario-manuencao-tag";
            extra.textContent = `+${manuencoes.length - 3} mais`;
            extra.style.fontStyle = "italic";
            extra.style.opacity = "0.7";
            manutencoeDiv.appendChild(extra);
        }

        el.appendChild(manutencoeDiv);
    } else if (!foraDoMes) {
        const vazioEl = document.createElement("div");
        vazioEl.className = "calendario-dia-vazio";
        vazioEl.textContent = "—";
        el.appendChild(vazioEl);
    }

    // Adicionar listener de clique
    if (!foraDoMes && manuencoes.length > 0) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => calendarioMostrarDetalhes(chave, manuencoes));
    }

    return el;
}

// ─── Mostrar Detalhes do Dia ──────────────────────────────────────────────
function calendarioMostrarDetalhes(chave, manuencoes) {
    const [ano, mes, dia] = chave.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia);
    const diaSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][data.getDay()];
    
    document.getElementById("calendarioDiaData").textContent = 
        `${diaSemana}, ${dia} de ${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", 
                                    "Jul", "Ago", "Set", "Out", "Nov", "Dez"][mes - 1]} de ${ano}`;

    // Separar manutenções por tipo
    const abertas = manuencoes.filter(m => m.status !== "Concluída" && m.status !== "Cancelada");
    const concluidas = manuencoes.filter(m => m.status === "Concluída");
    const canceladas = manuencoes.filter(m => m.status === "Cancelada");

    let html = "";

    if (abertas.length > 0) {
        html += `<h4 style="margin-top:0; color:var(--primary-color);">📂 Manutenções Abertas (${abertas.length})</h4>`;
        html += calendarioMontarTabela(abertas);
    }

    if (concluidas.length > 0) {
        html += `<h4 style="margin-top:20px; color:#10b981;">✓ Manutenções Concluídas (${concluidas.length})</h4>`;
        html += calendarioMontarTabela(concluidas);
    }

    if (canceladas.length > 0) {
        html += `<h4 style="margin-top:20px; color:#ef4444;">✕ Manutenções Canceladas (${canceladas.length})</h4>`;
        html += calendarioMontarTabela(canceladas);
    }

    document.getElementById("calendarioDiaLista").innerHTML = html;
    openModal("modalCalendarioDia");
}

// ─── Montar Tabela de Detalhes ────────────────────────────────────────────
function calendarioMontarTabela(manuencoes) {
    let html = `
        <table class="calendario-dia-detalhes-tabela">
            <thead>
                <tr>
                    <th style="width:10%;">Nº</th>
                    <th style="width:30%;">Equipamento</th>
                    <th style="width:20%;">Local</th>
                    <th style="width:20%;">Status</th>
                    <th style="width:20%;">Ação</th>
                </tr>
            </thead>
            <tbody>`;

    manuencoes.forEach(m => {
        html += `
            <tr>
                <td><strong>${esc(m.numero)}</strong></td>
                <td><span class="link-equipamento" onclick="window.abrirDetalhesManutencao(${m.id})">${esc(m.equipamento)}</span></td>
                <td>${esc(m.localizacao || "-")}</td>
                <td><span class="badge ${getStatusBadge(m.status)}">${esc(m.status)}</span></td>
                <td>
                    <button class="btn-icon btn-edit" onclick="window.abrirDetalhesManutencao(${m.id})" title="Ver detalhes">👁️</button>
                </td>
            </tr>`;
    });

    html += `
            </tbody>
        </table>`;

    return html;
}

// ─── Utilitários ──────────────────────────────────────────────────────────
function calendarioFormatarData(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

// ─── Abrir Modal Calendário ───────────────────────────────────────────────
window.abrirCalendario = function() {
    openModal("modalCalendario");
    calendarioCarregar();
};

// ─── Abrir Detalhes da Manutenção do Calendário ───────────────────────────
window.abrirDetalhesManutencao = function(id) {
    // Fechar AMBAS as modais do calendário
    closeModal("modalCalendarioDia");
    closeModal("modalCalendario");
    
    // Aguardar um pouco para garantir que as modais foram fechadas
    setTimeout(() => {
        // Agora chamar verDetalhes que abre a modal de detalhes
        if (window.verDetalhes) {
            verDetalhes(id);
        } else {
            showError("Erro ao carregar detalhes");
        }
    }, 100);
};

// ─── Inicializar quando o documento carregar ──────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    if (typeof calendarioInit === "function") {
        calendarioInit();
    }
});
