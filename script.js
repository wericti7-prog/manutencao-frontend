// =============================================
// AUTENTICAÇÃO
// =============================================

// Usuários do sistema — { usuario, senha, nome }
// O campo "nome" deve ser idêntico às opções do select de técnico
const USUARIOS = [
    { usuario: 'weric',  senha: 'weric123',  nome: 'Weric'  },
    { usuario: 'jhean',  senha: 'jhean123',  nome: 'Jhean'  },
    { usuario: 'paulo',  senha: 'paulo123',  nome: 'Paulo'  },
    { usuario: 'lucas',  senha: 'lucas123',  nome: 'Lucas'  },
    { usuario: 'volney', senha: 'volney123', nome: 'Volney' },
    { usuario: 'wendel', senha: 'wendel123', nome: 'Wendel' },
];

let usuarioLogado = null;

function tentarLogin(usuario, senha) {
    return USUARIOS.find(u =>
        u.usuario === usuario.toLowerCase().trim() && u.senha === senha
    ) || null;
}

function iniciarSessao(usuario) {
    usuarioLogado = usuario;
    sessionStorage.setItem('usuarioLogado', JSON.stringify(usuario));
    document.getElementById('telaLogin').style.display    = 'none';
    document.getElementById('appPrincipal').style.display = 'block';
    document.getElementById('usuarioNome').textContent    = usuario.nome;
    document.getElementById('usuarioAvatar').textContent  = usuario.nome.charAt(0).toUpperCase();
    updateStats();
    loadManutencoes();
}

function encerrarSessao() {
    usuarioLogado = null;
    sessionStorage.removeItem('usuarioLogado');
    document.getElementById('appPrincipal').style.display = 'none';
    document.getElementById('telaLogin').style.display    = 'flex';
    document.getElementById('formLogin').reset();
    document.getElementById('loginErro').style.display    = 'none';
}

document.getElementById('formLogin').addEventListener('submit', e => {
    e.preventDefault();
    const u = tentarLogin(
        document.getElementById('loginUsuario').value,
        document.getElementById('loginSenha').value
    );
    if (u) {
        document.getElementById('loginErro').style.display = 'none';
        iniciarSessao(u);
    } else {
        document.getElementById('loginErro').style.display = 'block';
        document.getElementById('loginSenha').value = '';
        document.getElementById('loginSenha').focus();
    }
});

document.getElementById('toggleSenha').addEventListener('click', () => {
    const inp = document.getElementById('loginSenha');
    inp.type = inp.type === 'password' ? 'text' : 'password';
});

document.getElementById('btnLogout').addEventListener('click', () => {
    if (confirm('Deseja sair do sistema?')) encerrarSessao();
});

// Restaura sessão ativa (mesma aba/janela)
(function() {
    const salvo = sessionStorage.getItem('usuarioLogado');
    if (salvo) { try { iniciarSessao(JSON.parse(salvo)); } catch { encerrarSessao(); } }
})();

// =============================================
// DATABASE
// =============================================
class Database {
    constructor() {
        this.manutencoes   = this.loadData('manutencoes')   || [];
        this.seqManutencao = parseInt(this.loadRaw('seqManutencao') || '0');
    }

    loadRaw(key) { return localStorage.getItem(key); }

    loadData(key) {
        const d = localStorage.getItem(key);
        return d ? JSON.parse(d) : null;
    }

    saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

    generateManutencaoId() {
        this.seqManutencao++;
        localStorage.setItem('seqManutencao', this.seqManutencao);
        return String(this.seqManutencao).padStart(3, '0');
    }

    addManutencao(m) {
        m.id      = this.generateManutencaoId();
        m.numero  = m.id;
        m.editLog = [];
        this.manutencoes.push(m);
        this.saveData('manutencoes', this.manutencoes);
        return m;
    }

    // Salva snapshot do estado ANTES de aplicar a edição
    updateManutencao(id, data, motivo) {
        const i = this.manutencoes.findIndex(m => m.id === id);
        if (i === -1) return null;

        const antes = { ...this.manutencoes[i] };
        const entrada = {
            ts:     new Date().toISOString(),
            motivo: motivo || 'Edição manual',
            snapshot: {
                equipamento: antes.equipamento,
                tipo:        antes.tipo,
                tecnico:     antes.tecnico,
                status:      antes.status,
                problema:    antes.problema,
                solucao:     antes.solucao,
                custo:       antes.custo,
                pecas:       antes.pecas,
                dataInicio:  antes.dataInicio,
                dataFim:     antes.dataFim
            }
        };

        const logAtual = Array.isArray(antes.editLog) ? antes.editLog : [];
        this.manutencoes[i] = { ...antes, ...data, editLog: [...logAtual, entrada] };
        this.saveData('manutencoes', this.manutencoes);
        return this.manutencoes[i];
    }

    deleteManutencao(id) {
        this.manutencoes = this.manutencoes.filter(m => m.id !== id);
        this.saveData('manutencoes', this.manutencoes);
    }

    getManutencao(id)  { return this.manutencoes.find(m => m.id === id); }
    getAllManutencoes() { return this.manutencoes; }

    getEquipamentosUsados() {
        const nomes = this.manutencoes.map(m => m.equipamento).filter(Boolean);
        return [...new Set(nomes)].sort();
    }
}

const db = new Database();

// =============================================
// UTILITÁRIOS
// =============================================
function formatDate(d)     { return d ? new Date(d).toLocaleDateString('pt-BR') : '-'; }
function formatDateTime(d) { return d ? new Date(d).toLocaleString('pt-BR')     : '-'; }
function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function getStatusBadge(s) {
    const map = {
        'Operacional':      'badge-operacional',
        'Em Manutenção':    'badge-em-manutencao',
        'Aguardando Peças': 'badge-aguardando-pecas',
        'Fora de Operação': 'badge-fora-operacao',
        'Pendente':         'badge-warning',
        'Em Andamento':     'badge-info',
        'Concluída':        'badge-success',
        'Cancelada':        'badge-secondary',
        'Consertado':       'badge-success',
        'Sem Reparo':       'badge-danger'
    };
    return map[s] || 'badge-secondary';
}

function updateStats() {
    const todas     = db.getAllManutencoes();
    const abertas   = todas.filter(m => m.status !== 'Concluída' && m.status !== 'Cancelada');
    const finalizados = todas.filter(m => m.status === 'Concluída' || m.status === 'Cancelada');
    const pendentes = abertas.filter(m => m.status === 'Pendente');

    document.getElementById('totalManutencoes').textContent = abertas.length;
    document.getElementById('totalFinalizados').textContent = finalizados.length;
    document.getElementById('totalPendentes').textContent   = pendentes.length;
}

function populateDatalist() {
    const dl = document.getElementById('equipamentosDatalist');
    if (!dl) return;
    dl.innerHTML = db.getEquipamentosUsados().map(n => `<option value="${n}">`).join('');
}

// =============================================
// NAVEGAÇÃO
// =============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tab).classList.add('active');
        if (tab === 'manutencoes') loadManutencoes();
        if (tab === 'finalizados') loadFinalizados();
        if (tab === 'relatorios')  loadRelatorios();
        updateStats();
    });
});

// =============================================
// MODAIS
// =============================================
function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.close').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);
document.querySelectorAll('.modal').forEach(modal =>
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); })
);
document.querySelectorAll('.btn-secondary[data-modal]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);

// =============================================
// ABA MANUTENÇÕES
// =============================================
function loadManutencoes() {
    populateDatalist();

    const search     = (document.getElementById('searchManutencao')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('filterTipoManutencao')?.value || '';
    const filterSt   = document.getElementById('filterStatusManutencao')?.value || '';

    let lista = db.getAllManutencoes().filter(m => {
        if (m.status === 'Concluída' || m.status === 'Cancelada') return false;
        const ok = (m.equipamento || '').toLowerCase().includes(search)
            || (m.tecnico || '').toLowerCase().includes(search)
            || (m.problema || '').toLowerCase().includes(search);
        return ok && (!filterTipo || m.tipo === filterTipo) && (!filterSt || m.status === filterSt);
    });

    lista.sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));

    if (lista.length === 0) {
        document.getElementById('listaManutencoes').innerHTML =
            '<div class="empty-state"><h3>Nenhuma manutenção em aberto</h3><p>Clique em "Nova Manutenção" para registrar</p></div>';
        return;
    }

    const rows = lista.map(m => `
        <tr>
            <td><span class="id-badge">${m.numero || m.id}</span></td>
            <td><button class="link-equipamento" onclick="verDetalhes('${m.id}')" title="Ver detalhes">${m.equipamento || '-'}</button></td>
            <td>${m.tipo}</td>
            <td>${m.tecnico}</td>
            <td class="problema-cell">${(m.problema || '-').substring(0,60)}${(m.problema||'').length>60?'…':''}</td>
            <td><span class="badge ${getStatusBadge(m.status)}">${m.status}</span></td>
            <td>${formatCurrency(m.custo)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon btn-history" onclick="verHistoricoCompleto('${m.id}')" title="Histórico de edições">📋</button>
                    <button class="btn-icon btn-edit"    onclick="editManutencao('${m.id}')" title="Editar">✏️</button>
                    <button class="btn-icon btn-delete"  onclick="deleteManutencao('${m.id}')" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>`).join('');

    document.getElementById('listaManutencoes').innerHTML = `
        <table>
            <thead><tr>
                <th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                <th>Problema</th><th>Status</th><th>Custo</th><th>Ações</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// =============================================
// MODAL NOVA / EDITAR MANUTENÇÃO
// =============================================
function abrirModalNovaManutencao() {
    document.getElementById('formManutencao').reset();
    document.getElementById('manutencaoId').value = '';
    const proximo = String(db.seqManutencao + 1).padStart(3, '0');
    document.getElementById('manutencaoNumero').value = proximo + ' (novo)';
    document.getElementById('modalManutencaoTitle').textContent = 'Nova Manutenção';
    document.getElementById('btnFinalizar').style.display = 'none';

    // Preenche técnico automaticamente com o usuário logado
    const tecnicoSelect = document.getElementById('manutencaoTecnico');
    const tag = document.getElementById('tecnicoAutoTag');
    if (usuarioLogado) {
        tecnicoSelect.value = usuarioLogado.nome;
        tag.style.display = 'inline';
    } else {
        tag.style.display = 'none';
    }

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('manutencaoDataInicio').value = now.toISOString().slice(0, 16);
    populateDatalist();
    openModal('modalManutencao');
}

document.getElementById('btnNovaManutencao').addEventListener('click', abrirModalNovaManutencao);
document.getElementById('formManutencao').addEventListener('submit', e => {
    e.preventDefault();
    salvarManutencao(false, null);
});

function salvarManutencao(finalizar, resultadoReparo) {
    const dados = coletarDadosForm();
    if (finalizar) {
        dados.statusEquipamento = dados.status;
        dados.resultadoReparo   = resultadoReparo;
        dados.status  = 'Concluída';
        dados.dataFim = dados.dataFim || new Date().toISOString().slice(0, 16);
    }
    const id = document.getElementById('manutencaoId').value;
    if (id) {
        const motivo = finalizar ? 'Finalização do atendimento' : 'Edição manual';
        db.updateManutencao(id, dados, motivo);
    } else {
        db.addManutencao(dados);
    }
    closeModal('modalManutencao');
    loadManutencoes();
    loadFinalizados();
    updateStats();
    alert(finalizar ? `Atendimento finalizado! Resultado: ${resultadoReparo}` : 'Manutenção salva com sucesso!');
}

function coletarDadosForm() {
    return {
        equipamento: document.getElementById('manutencaoEquipamento').value,
        tipo:        document.getElementById('manutencaoTipo').value,
        dataInicio:  document.getElementById('manutencaoDataInicio').value,
        dataFim:     document.getElementById('manutencaoDataFim').value,
        tecnico:     document.getElementById('manutencaoTecnico').value,
        status:      document.getElementById('manutencaoStatus').value,
        problema:    document.getElementById('manutencaoProblema').value,
        solucao:     document.getElementById('manutencaoSolucao').value,
        custo:       parseFloat(document.getElementById('manutencaoCusto').value) || 0,
        pecas:       document.getElementById('manutencaoPecas').value
    };
}

function finalizarAtendimento() {
    const campos = ['manutencaoEquipamento','manutencaoTipo','manutencaoDataInicio','manutencaoTecnico','manutencaoProblema'];
    for (const fid of campos) {
        if (!document.getElementById(fid).value.trim()) {
            document.getElementById(fid).focus();
            alert('Preencha todos os campos obrigatórios antes de finalizar.');
            return;
        }
    }
    openModal('modalResultadoReparo');
}

document.getElementById('btnResultadoConsertado')?.addEventListener('click', () => {
    closeModal('modalResultadoReparo');
    salvarManutencao(true, 'Consertado');
});
document.getElementById('btnResultadoSemReparo')?.addEventListener('click', () => {
    closeModal('modalResultadoReparo');
    salvarManutencao(true, 'Sem Reparo');
});

function editManutencao(id) {
    const m = db.getManutencao(id);
    if (!m) return;
    document.getElementById('manutencaoId').value          = m.id;
    document.getElementById('manutencaoNumero').value      = m.numero || m.id;
    document.getElementById('manutencaoEquipamento').value = m.equipamento || '';
    document.getElementById('manutencaoTipo').value        = m.tipo;
    document.getElementById('manutencaoDataInicio').value  = m.dataInicio;
    document.getElementById('manutencaoDataFim').value     = m.dataFim || '';
    document.getElementById('manutencaoTecnico').value     = m.tecnico;
    document.getElementById('manutencaoStatus').value      = m.status;
    document.getElementById('manutencaoProblema').value    = m.problema;
    document.getElementById('manutencaoSolucao').value     = m.solucao || '';
    document.getElementById('manutencaoCusto').value       = m.custo || 0;
    document.getElementById('manutencaoPecas').value       = m.pecas || '';
    document.getElementById('modalManutencaoTitle').textContent = `Editar Manutenção #${m.numero || m.id}`;
    document.getElementById('btnFinalizar').style.display = 'inline-flex';
    document.getElementById('tecnicoAutoTag').style.display = 'none';
    populateDatalist();
    openModal('modalManutencao');
}

function deleteManutencao(id) {
    if (confirm('Tem certeza que deseja excluir esta manutenção?')) {
        db.deleteManutencao(id);
        loadManutencoes();
        loadFinalizados();
        updateStats();
        alert('Manutenção excluída com sucesso!');
    }
}

// =============================================
// DETALHES — atendimento específico (clique no nome)
// =============================================
function verDetalhes(id) {
    const m = db.getManutencao(id);
    if (!m) return;

    const statusExibido = m.statusEquipamento || m.status;
    const reparoHtml = m.resultadoReparo
        ? `<div><strong>Resultado do Reparo:</strong> <span class="badge ${getStatusBadge(m.resultadoReparo)}">${m.resultadoReparo}</span></div>`
        : '';

    document.getElementById('modalDetalhesTitle').textContent = `Atendimento #${m.numero || m.id}`;
    document.getElementById('modalDetalhesContent').innerHTML = `
        <div class="historico-info">
            <div class="historico-info-grid">
                <div><strong>Nº:</strong> <span class="id-badge">${m.numero || m.id}</span></div>
                <div><strong>Equipamento:</strong> ${m.equipamento || '-'}</div>
                <div><strong>Localização:</strong> ${m.tipo || '-'}</div>
                <div><strong>Técnico:</strong> ${m.tecnico}</div>
                <div><strong>Início:</strong> ${formatDateTime(m.dataInicio)}</div>
                <div><strong>Conclusão:</strong> ${formatDateTime(m.dataFim)}</div>
                <div><strong>Status:</strong> <span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></div>
                ${reparoHtml}
                <div><strong>Custo:</strong> ${formatCurrency(m.custo)}</div>
                ${m.pecas ? `<div><strong>Peças:</strong> ${m.pecas}</div>` : ''}
            </div>
        </div>
        <div style="margin-top:18px;">
            <p><strong>Problema:</strong></p>
            <p style="background:#f9fafb;padding:12px;border-radius:8px;margin-top:6px;">${m.problema || '-'}</p>
        </div>
        <div style="margin-top:14px;">
            <p><strong>Solução Aplicada:</strong></p>
            <p style="background:#f9fafb;padding:12px;border-radius:8px;margin-top:6px;">${m.solucao || '-'}</p>
        </div>
        <div style="margin-top:18px;text-align:right;">
            <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px;" onclick="verHistoricoCompleto('${m.id}')">📋 Ver histórico de edições</button>
        </div>`;

    openModal('modalDetalhes');
}

// =============================================
// HISTÓRICO DE EDIÇÕES — por ID único (botão 📋)
// Cada atendimento tem seu próprio log isolado
// =============================================
function verHistoricoCompleto(id) {
    const m = db.getManutencao(id);
    if (!m) return;

    const log = Array.isArray(m.editLog) ? m.editLog : [];
    const statusExibido = m.resultadoReparo || m.statusEquipamento || m.status;

    // Linha do estado atual
    const linhaAtual = `<tr style="background:#f0fdf4;">
        <td style="white-space:nowrap;font-size:.82rem;color:#6b7280;">${formatDateTime(m.dataFim || m.dataInicio)}</td>
        <td><span class="edit-log-motivo-badge atual">Estado atual</span></td>
        <td>${m.tecnico || '-'}</td>
        <td><span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></td>
        <td class="problema-cell">${(m.problema || '-').substring(0,50)}${(m.problema||'').length>50?'…':''}</td>
        <td>${formatCurrency(m.custo)}</td>
    </tr>`;

    // Linhas de versões anteriores (mais recente no topo)
    const linhasLog = log.slice().reverse().map(e => {
        const s = e.snapshot;
        return `<tr>
            <td style="white-space:nowrap;font-size:.82rem;color:#6b7280;">${formatDateTime(e.ts)}</td>
            <td><span class="edit-log-motivo-badge">${e.motivo || 'Edição'}</span></td>
            <td>${s.tecnico || '-'}</td>
            <td><span class="badge ${getStatusBadge(s.status)}">${s.status || '-'}</span></td>
            <td class="problema-cell">${(s.problema || '-').substring(0,50)}${(s.problema||'').length>50?'…':''}</td>
            <td>${formatCurrency(s.custo)}</td>
        </tr>`;
    }).join('');

    document.getElementById('modalDetalhesTitle').textContent = `Histórico — Atendimento #${m.numero || m.id}`;
    document.getElementById('modalDetalhesContent').innerHTML = `
        <div class="historico-info" style="margin-bottom:16px;">
            <div class="historico-info-grid">
                <div><strong>Equipamento:</strong> ${m.equipamento || '-'}</div>
                <div><strong>Nº Atendimento:</strong> <span class="id-badge">${m.numero || m.id}</span></div>
                <div><strong>Localização:</strong> ${m.tipo || '-'}</div>
                <div><strong>Status atual:</strong> <span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></div>
                ${m.resultadoReparo ? `<div><strong>Reparo:</strong> <span class="badge ${getStatusBadge(m.resultadoReparo)}">${m.resultadoReparo}</span></div>` : ''}
                <div><strong>Edições registradas:</strong> ${log.length}</div>
            </div>
        </div>
        <div class="table-container">
            <table>
                <thead><tr>
                    <th>Data/Hora</th><th>Evento</th><th>Técnico</th>
                    <th>Status</th><th>Problema</th><th>Custo</th>
                </tr></thead>
                <tbody>${linhaAtual}${linhasLog}</tbody>
            </table>
        </div>
        <div style="margin-top:16px;text-align:right;">
            <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px;" onclick="verDetalhes('${m.id}')">📄 Ver detalhes completos</button>
        </div>`;

    openModal('modalDetalhes');
}

// =============================================
// ABA FINALIZADOS
// =============================================
function loadFinalizados() {
    const search     = (document.getElementById('searchFinalizado')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('filterTipoFinalizado')?.value || '';

    let lista = db.getAllManutencoes().filter(m => {
        if (m.status !== 'Concluída' && m.status !== 'Cancelada') return false;
        const ok = (m.equipamento || '').toLowerCase().includes(search)
            || (m.tecnico || '').toLowerCase().includes(search)
            || (m.problema || '').toLowerCase().includes(search);
        return ok && (!filterTipo || m.tipo === filterTipo);
    });

    lista.sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));

    if (lista.length === 0) {
        document.getElementById('listaFinalizados').innerHTML =
            '<div class="empty-state"><h3>Nenhuma manutenção finalizada</h3><p>As manutenções concluídas aparecerão aqui</p></div>';
        return;
    }

    const custoTotal = lista.reduce((s, m) => s + (m.custo || 0), 0);

    const rows = lista.map(m => {
        const statusExibido = m.statusEquipamento || m.status;
        const reparoBadge   = m.resultadoReparo
            ? `<span class="badge ${getStatusBadge(m.resultadoReparo)}">${m.resultadoReparo}</span>`
            : '—';
        return `<tr>
            <td><span class="id-badge">${m.numero || m.id}</span></td>
            <td><button class="link-equipamento" onclick="verDetalhes('${m.id}')" title="Ver detalhes">${m.equipamento || '-'}</button></td>
            <td>${m.tipo}</td>
            <td>${m.tecnico}</td>
            <td>${formatDateTime(m.dataInicio)}</td>
            <td>${formatDateTime(m.dataFim)}</td>
            <td><span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></td>
            <td>${reparoBadge}</td>
            <td>${formatCurrency(m.custo)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon btn-history" onclick="verHistoricoCompleto('${m.id}')" title="Histórico de edições">📋</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    document.getElementById('listaFinalizados').innerHTML = `
        <table>
            <thead><tr>
                <th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                <th>Início</th><th>Conclusão</th><th>Status Equip.</th>
                <th>Reparo</th><th>Custo</th><th>Histórico</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="8" style="text-align:right;font-weight:600;padding:12px 15px;">Custo Total:</td>
                    <td style="font-weight:700;color:var(--primary-color);padding:12px 15px;">${formatCurrency(custoTotal)}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>`;
}

// =============================================
// RELATÓRIOS
// =============================================
function loadRelatorios() {
    const hoje = new Date();
    const fim  = hoje.toISOString().split('T')[0];
    const ini  = new Date(new Date().setMonth(hoje.getMonth() - 1)).toISOString().split('T')[0];
    document.getElementById('dataInicio').value = ini;
    document.getElementById('dataFim').value    = fim;
    loadEstatisticasPeriodo(ini, fim);
}

function loadEstatisticasPeriodo(ini, fim) {
    const lista = db.getAllManutencoes().filter(m => {
        const d = new Date(m.dataInicio);
        return d >= new Date(ini) && d <= new Date(fim);
    });
    const custo = lista.reduce((s, m) => s + (m.custo || 0), 0);
    document.getElementById('estatisticasPeriodo').innerHTML = `
        <div class="stat-item"><span class="stat-item-value">${lista.length}</span><span class="stat-item-label">Total</span></div>
        <div class="stat-item"><span class="stat-item-value">${lista.filter(m=>m.resultadoReparo==='Consertado').length}</span><span class="stat-item-label">Consertados</span></div>
        <div class="stat-item"><span class="stat-item-value">${lista.filter(m=>m.resultadoReparo==='Sem Reparo').length}</span><span class="stat-item-label">Sem Reparo</span></div>
        <div class="stat-item"><span class="stat-item-value">${lista.filter(m=>m.status==='Concluída').length}</span><span class="stat-item-label">Concluídas</span></div>
        <div class="stat-item"><span class="stat-item-value">${formatCurrency(custo)}</span><span class="stat-item-label">Custo Total</span></div>`;
}

document.getElementById('formRelatorio').addEventListener('submit', e => {
    e.preventDefault();
    const tipo = document.getElementById('tipoRelatorio').value;
    const ini  = document.getElementById('dataInicio').value;
    const fim  = document.getElementById('dataFim').value;
    loadEstatisticasPeriodo(ini, fim);
    const fns = {
        manutencoes: () => gerarRelatorioManutencoes(ini, fim),
        custos:      () => gerarRelatorioCustos(ini, fim)
    };
    document.getElementById('resultadoRelatorio').innerHTML = (fns[tipo] || (() => ''))();
});

function gerarRelatorioManutencoes(ini, fim) {
    const lista = db.getAllManutencoes().filter(m => {
        const d = new Date(m.dataInicio); return d >= new Date(ini) && d <= new Date(fim);
    });
    if (!lista.length) return '<p class="empty-state">Nenhuma manutenção no período.</p>';
    return `<h4>Histórico (${formatDate(ini)} — ${formatDate(fim)})</h4>
        <table>
            <thead><tr><th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th><th>Problema</th><th>Data</th><th>Status</th><th>Reparo</th><th>Custo</th></tr></thead>
            <tbody>${lista.map(m=>`<tr>
                <td><span class="id-badge">${m.numero||m.id}</span></td>
                <td>${m.equipamento||'-'}</td><td>${m.tipo}</td><td>${m.tecnico}</td>
                <td>${(m.problema||'').substring(0,45)}${(m.problema||'').length>45?'…':''}</td>
                <td>${formatDate(m.dataInicio)}</td>
                <td><span class="badge ${getStatusBadge(m.statusEquipamento||m.status)}">${m.statusEquipamento||m.status}</span></td>
                <td>${m.resultadoReparo?`<span class="badge ${getStatusBadge(m.resultadoReparo)}">${m.resultadoReparo}</span>`:'—'}</td>
                <td>${formatCurrency(m.custo)}</td>
            </tr>`).join('')}</tbody>
        </table>`;
}

function gerarRelatorioCustos(ini, fim) {
    const lista = db.getAllManutencoes().filter(m => {
        const d = new Date(m.dataInicio); return d >= new Date(ini) && d <= new Date(fim);
    });
    const porTipo = {};
    lista.forEach(m => { porTipo[m.tipo] = (porTipo[m.tipo]||0) + (m.custo||0); });
    const total = Object.values(porTipo).reduce((a,b)=>a+b,0);
    if (!total) return '<p class="empty-state">Nenhum custo registrado no período.</p>';
    return `<h4>Análise de Custos (${formatDate(ini)} — ${formatDate(fim)})</h4>
        <div class="chart-container">
            ${Object.entries(porTipo).map(([tipo,custo])=>{
                const pct=total?(custo/total*100).toFixed(0):0;
                return `<div class="chart-bar">
                    <span class="chart-label">${tipo}</span>
                    <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${pct}%">${formatCurrency(custo)}</div></div>
                </div>`;
            }).join('')}
        </div>
        <p style="margin-top:20px;font-size:1.1rem;"><strong>Custo Total: ${formatCurrency(total)}</strong></p>`;
}

// =============================================
// FILTROS
// =============================================
document.getElementById('searchManutencao')?.addEventListener('input', loadManutencoes);
document.getElementById('filterTipoManutencao')?.addEventListener('change', loadManutencoes);
document.getElementById('filterStatusManutencao')?.addEventListener('change', loadManutencoes);
document.getElementById('searchFinalizado')?.addEventListener('input', loadFinalizados);
document.getElementById('filterTipoFinalizado')?.addEventListener('change', loadFinalizados);

// =============================================
// INICIALIZAÇÃO
// =============================================
updateStats();
loadManutencoes();
