import {
    login, logout, getUsuarioLogado,
    listarManutencoes, getManutencao, criarManutencao,
    editarManutencao, excluirManutencao, finalizarManutencao,
    getHistorico, getSugestoes,
    listarUsuarios, criarUsuario, excluirUsuario
} from './api.js';

// =============================================
// AUTENTICAÇÃO
// =============================================

let usuarioLogado = null;

// Tenta restaurar sessão do localStorage (persiste entre abas e recarregamentos)
async function iniciarApp() {
    const salvo = getUsuarioLogado();
    if (salvo) {
        // Valida o token junto ao backend antes de mostrar o app
        try {
            await aplicarSessao(salvo);
        } catch {
            encerrarSessao();
        }
    }
    // Se não há sessão salva, a tela de login já está visível por padrão
}

async function aplicarSessao(usuario) {
    usuarioLogado = usuario;
    document.getElementById('telaLogin').style.display    = 'none';
    document.getElementById('appPrincipal').style.display = 'block';
    document.getElementById('usuarioNome').textContent    = usuario.nome;
    document.getElementById('usuarioAvatar').textContent  = usuario.nome.charAt(0).toUpperCase();

    // Mostra aba Usuários apenas para gerência/admin
    const menuUsuarios = document.getElementById('menuUsuarios');
    if (usuario.role === 'gerencia' || usuario.role === 'admin') {
        menuUsuarios.style.display = 'inline-flex';
    } else {
        menuUsuarios.style.display = 'none';
    }

    await updateStats();
    await loadManutencoes();
}

function encerrarSessao() {
    logout(); // limpa localStorage
    usuarioLogado = null;
    document.getElementById('appPrincipal').style.display = 'none';
    document.getElementById('telaLogin').style.display    = 'flex';
    document.getElementById('formLogin').reset();
    document.getElementById('loginErro').style.display    = 'none';
}

document.getElementById('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const u = document.getElementById('loginUsuario').value;
    const s = document.getElementById('loginSenha').value;
    try {
        const data = await login(u, s);
        document.getElementById('loginErro').style.display = 'none';
        await aplicarSessao({ nome: data.nome, username: data.username, role: data.role });
    } catch {
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

// Função auxiliar para mostrar login (usada no api.js ao expirar token)
window.mostrarLogin = encerrarSessao;

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

async function updateStats() {
    try {
        // Busca abertas e finalizadas separadamente para os contadores
        const [abertas, finalizadas] = await Promise.all([
            listarManutencoes({ status: 'Pendente' }).catch(() => []),
            listarManutencoes({ status: 'Concluída' }).catch(() => [])
        ]);
        const emAndamento = await listarManutencoes({ status: 'Em Andamento' }).catch(() => []);
        const todasAbertas = [...abertas, ...emAndamento];

        document.getElementById('totalManutencoes').textContent = todasAbertas.length;
        document.getElementById('totalFinalizados').textContent = finalizadas.length;
        document.getElementById('totalPendentes').textContent   = abertas.length;
    } catch {
        // silencia erros de stats
    }
}

async function populateDatalist() {
    try {
        const sugestoes = await getSugestoes();
        const dl = document.getElementById('equipamentosDatalist');
        if (!dl) return;
        dl.innerHTML = sugestoes.map(n => `<option value="${n}">`).join('');
    } catch { /* ignora */ }
}

// =============================================
// NAVEGAÇÃO
// =============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tab).classList.add('active');
        if (tab === 'manutencoes') await loadManutencoes();
        if (tab === 'finalizados') await loadFinalizados();
        if (tab === 'relatorios')  loadRelatorios();
        if (tab === 'usuarios')    await loadUsuarios();
        await updateStats();
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
async function loadManutencoes() {
    await populateDatalist();

    const search     = (document.getElementById('searchManutencao')?.value || '').toLowerCase();
    const filterLoc  = document.getElementById('filterTipoManutencao')?.value || '';
    const filterSt   = document.getElementById('filterStatusManutencao')?.value || '';

    const container = document.getElementById('listaManutencoes');
    container.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';

    try {
        // Busca manutenções abertas (Pendente + Em Andamento)
        const params = { localizacao: filterLoc || undefined, busca: search || undefined };

        let lista = [];
        if (!filterSt) {
            const [pendentes, emAndamento] = await Promise.all([
                listarManutencoes({ ...params, status: 'Pendente' }),
                listarManutencoes({ ...params, status: 'Em Andamento' })
            ]);
            lista = [...pendentes, ...emAndamento];
        } else {
            lista = await listarManutencoes({ ...params, status: filterSt });
        }

        // Filtra status finalizados fora da listagem de abertas
        lista = lista.filter(m => m.status !== 'Concluída' && m.status !== 'Cancelada');
        lista.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

        if (lista.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>Nenhuma manutenção em aberto</h3><p>Clique em "Nova Manutenção" para registrar</p></div>';
            return;
        }

        const rows = lista.map(m => `
            <tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td><button class="link-equipamento" onclick="verDetalhes(${m.id})" title="Ver detalhes">${m.equipamento || '-'}</button></td>
                <td>${m.localizacao || '-'}</td>
                <td>${m.tecnico || '-'}</td>
                <td class="problema-cell">${(m.problema || '-').substring(0,60)}${(m.problema||'').length>60?'…':''}</td>
                <td><span class="badge ${getStatusBadge(m.status)}">${m.status}</span></td>
                <td>${formatCurrency(m.custo)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-history" onclick="verHistoricoCompleto(${m.id})" title="Histórico de edições">📋</button>
                        <button class="btn-icon btn-edit"    onclick="editManutencao(${m.id})" title="Editar">✏️</button>
                        <button class="btn-icon btn-delete"  onclick="deleteManutencao(${m.id})" title="Excluir">🗑️</button>
                    </div>
                </td>
            </tr>`).join('');

        container.innerHTML = `
            <table>
                <thead><tr>
                    <th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th>
                    <th>Problema</th><th>Status</th><th>Custo</th><th>Ações</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
}

// =============================================
// MODAL NOVA / EDITAR MANUTENÇÃO
// =============================================
async function abrirModalNovaManutencao() {
    document.getElementById('formManutencao').reset();
    document.getElementById('manutencaoId').value = '';
    document.getElementById('manutencaoNumero').value = '(gerado automaticamente)';
    document.getElementById('modalManutencaoTitle').textContent = 'Nova Manutenção';
    document.getElementById('btnFinalizar').style.display = 'none';

    // Preenche técnico com o usuário logado
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
    await populateDatalist();
    openModal('modalManutencao');
}

document.getElementById('btnNovaManutencao').addEventListener('click', abrirModalNovaManutencao);
document.getElementById('formManutencao').addEventListener('submit', async e => {
    e.preventDefault();
    await salvarManutencao(false, null);
});

async function salvarManutencao(finalizar, resultadoReparo) {
    const dados = coletarDadosForm();
    const id = document.getElementById('manutencaoId').value;

    try {
        if (finalizar) {
            await finalizarManutencao(id, {
                resultado_reparo:   resultadoReparo,
                status_equipamento: dados.status,
                solucao:            dados.solucao,
                custo:              dados.custo,
                pecas:              dados.pecas
            });
        } else if (id) {
            await editarManutencao(id, dados);
        } else {
            await criarManutencao(dados);
        }

        closeModal('modalManutencao');
        await loadManutencoes();
        await loadFinalizados();
        await updateStats();
        alert(finalizar ? `Atendimento finalizado! Resultado: ${resultadoReparo}` : 'Manutenção salva com sucesso!');
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

function coletarDadosForm() {
    return {
        equipamento:  document.getElementById('manutencaoEquipamento').value,
        localizacao:  document.getElementById('manutencaoTipo').value,
        data_inicio:  document.getElementById('manutencaoDataInicio').value || null,
        data_fim:     document.getElementById('manutencaoDataFim').value    || null,
        tecnico:      document.getElementById('manutencaoTecnico').value,
        status:       document.getElementById('manutencaoStatus').value,
        problema:     document.getElementById('manutencaoProblema').value,
        solucao:      document.getElementById('manutencaoSolucao').value    || null,
        custo:        parseFloat(document.getElementById('manutencaoCusto').value) || 0,
        pecas:        document.getElementById('manutencaoPecas').value      || null
    };
}

window.finalizarAtendimento = function() {
    const campos = ['manutencaoEquipamento','manutencaoTipo','manutencaoDataInicio','manutencaoTecnico','manutencaoProblema'];
    for (const fid of campos) {
        if (!document.getElementById(fid).value.trim()) {
            document.getElementById(fid).focus();
            alert('Preencha todos os campos obrigatórios antes de finalizar.');
            return;
        }
    }
    openModal('modalResultadoReparo');
};

document.getElementById('btnResultadoConsertado')?.addEventListener('click', async () => {
    closeModal('modalResultadoReparo');
    await salvarManutencao(true, 'Consertado');
});
document.getElementById('btnResultadoSemReparo')?.addEventListener('click', async () => {
    closeModal('modalResultadoReparo');
    await salvarManutencao(true, 'Sem Reparo');
});

window.editManutencao = async function(id) {
    try {
        const m = await getManutencao(id);
        document.getElementById('manutencaoId').value          = m.id;
        document.getElementById('manutencaoNumero').value      = m.numero;
        document.getElementById('manutencaoEquipamento').value = m.equipamento || '';
        document.getElementById('manutencaoTipo').value        = m.localizacao  || '';
        document.getElementById('manutencaoDataInicio').value  = m.data_inicio ? m.data_inicio.slice(0,16) : '';
        document.getElementById('manutencaoDataFim').value     = m.data_fim     ? m.data_fim.slice(0,16)   : '';
        document.getElementById('manutencaoTecnico').value     = m.tecnico      || '';
        document.getElementById('manutencaoStatus').value      = m.status       || '';
        document.getElementById('manutencaoProblema').value    = m.problema     || '';
        document.getElementById('manutencaoSolucao').value     = m.solucao      || '';
        document.getElementById('manutencaoCusto').value       = m.custo        || 0;
        document.getElementById('manutencaoPecas').value       = m.pecas        || '';
        document.getElementById('modalManutencaoTitle').textContent = `Editar Manutenção #${m.numero}`;
        document.getElementById('btnFinalizar').style.display = 'inline-flex';
        document.getElementById('tecnicoAutoTag').style.display = 'none';
        await populateDatalist();
        openModal('modalManutencao');
    } catch (err) {
        alert('Erro ao carregar manutenção: ' + err.message);
    }
};

window.deleteManutencao = async function(id) {
    if (confirm('Tem certeza que deseja excluir esta manutenção?')) {
        try {
            await excluirManutencao(id);
            await loadManutencoes();
            await loadFinalizados();
            await updateStats();
            alert('Manutenção excluída com sucesso!');
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    }
};

// =============================================
// DETALHES
// =============================================
window.verDetalhes = async function(id) {
    try {
        const m = await getManutencao(id);
        const statusExibido = m.status_equipamento || m.status;
        const reparoHtml = m.resultado_reparo
            ? `<div><strong>Resultado do Reparo:</strong> <span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span></div>`
            : '';

        document.getElementById('modalDetalhesTitle').textContent = `Atendimento #${m.numero}`;
        document.getElementById('modalDetalhesContent').innerHTML = `
            <div class="historico-info">
                <div class="historico-info-grid">
                    <div><strong>Nº:</strong> <span class="id-badge">${m.numero}</span></div>
                    <div><strong>Equipamento:</strong> ${m.equipamento || '-'}</div>
                    <div><strong>Localização:</strong> ${m.localizacao || '-'}</div>
                    <div><strong>Técnico:</strong> ${m.tecnico || '-'}</div>
                    <div><strong>Criado por:</strong> ${m.criado_por || '-'}</div>
                    <div><strong>Início:</strong> ${formatDateTime(m.data_inicio)}</div>
                    <div><strong>Conclusão:</strong> ${formatDateTime(m.data_fim)}</div>
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
                <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px;" onclick="verHistoricoCompleto(${m.id})">📋 Ver histórico de edições</button>
            </div>`;

        openModal('modalDetalhes');
    } catch (err) {
        alert('Erro ao carregar detalhes: ' + err.message);
    }
};

// =============================================
// HISTÓRICO DE EDIÇÕES
// =============================================
window.verHistoricoCompleto = async function(id) {
    try {
        const [m, historico] = await Promise.all([getManutencao(id), getHistorico(id)]);
        const statusExibido = m.resultado_reparo || m.status_equipamento || m.status;

        const linhaAtual = `<tr style="background:#f0fdf4;">
            <td style="white-space:nowrap;font-size:.82rem;color:#6b7280;">${formatDateTime(m.data_fim || m.data_inicio)}</td>
            <td><span class="edit-log-motivo-badge atual">Estado atual</span></td>
            <td>${m.tecnico || '-'}</td>
            <td><span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></td>
            <td class="problema-cell">${(m.problema || '-').substring(0,50)}${(m.problema||'').length>50?'…':''}</td>
            <td>${formatCurrency(m.custo)}</td>
        </tr>`;

        const linhasLog = historico.slice().reverse().map(e => {
            const s = e.snapshot || {};
            return `<tr>
                <td style="white-space:nowrap;font-size:.82rem;color:#6b7280;">${formatDateTime(e.ts)}</td>
                <td><span class="edit-log-motivo-badge">${e.motivo || 'Edição'}</span></td>
                <td>${s.tecnico || '-'}</td>
                <td><span class="badge ${getStatusBadge(s.status)}">${s.status || '-'}</span></td>
                <td class="problema-cell">${(s.problema || '-').substring(0,50)}${(s.problema||'').length>50?'…':''}</td>
                <td>${formatCurrency(s.custo)}</td>
            </tr>`;
        }).join('');

        document.getElementById('modalDetalhesTitle').textContent = `Histórico — Atendimento #${m.numero}`;
        document.getElementById('modalDetalhesContent').innerHTML = `
            <div class="historico-info" style="margin-bottom:16px;">
                <div class="historico-info-grid">
                    <div><strong>Equipamento:</strong> ${m.equipamento || '-'}</div>
                    <div><strong>Nº Atendimento:</strong> <span class="id-badge">${m.numero}</span></div>
                    <div><strong>Localização:</strong> ${m.localizacao || '-'}</div>
                    <div><strong>Status atual:</strong> <span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></div>
                    ${m.resultado_reparo ? `<div><strong>Reparo:</strong> <span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span></div>` : ''}
                    <div><strong>Edições registradas:</strong> ${historico.length}</div>
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
                <button class="btn btn-secondary" style="font-size:.88rem;padding:8px 16px;" onclick="verDetalhes(${m.id})">📄 Ver detalhes completos</button>
            </div>`;

        openModal('modalDetalhes');
    } catch (err) {
        alert('Erro ao carregar histórico: ' + err.message);
    }
};

// =============================================
// ABA FINALIZADOS
// =============================================
async function loadFinalizados() {
    const search    = (document.getElementById('searchFinalizado')?.value || '').toLowerCase();
    const filterLoc = document.getElementById('filterTipoFinalizado')?.value || '';
    const container = document.getElementById('listaFinalizados');
    container.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';

    try {
        let lista = await listarManutencoes({ status: 'Concluída', localizacao: filterLoc || undefined, busca: search || undefined });
        lista.sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));

        if (lista.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>Nenhuma manutenção finalizada</h3><p>As manutenções concluídas aparecerão aqui</p></div>';
            return;
        }

        const custoTotal = lista.reduce((s, m) => s + (m.custo || 0), 0);

        const rows = lista.map(m => {
            const statusExibido = m.status_equipamento || m.status;
            const reparoBadge   = m.resultado_reparo
                ? `<span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span>`
                : '—';
            return `<tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td><button class="link-equipamento" onclick="verDetalhes(${m.id})" title="Ver detalhes">${m.equipamento || '-'}</button></td>
                <td>${m.localizacao || '-'}</td>
                <td>${m.tecnico || '-'}</td>
                <td>${formatDateTime(m.data_inicio)}</td>
                <td>${formatDateTime(m.data_fim)}</td>
                <td><span class="badge ${getStatusBadge(statusExibido)}">${statusExibido}</span></td>
                <td>${reparoBadge}</td>
                <td>${formatCurrency(m.custo)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-history" onclick="verHistoricoCompleto(${m.id})" title="Histórico de edições">📋</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `
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
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
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

async function loadEstatisticasPeriodo(ini, fim) {
    try {
        const lista = await listarManutencoes({});
        const filtrada = lista.filter(m => {
            const d = new Date(m.criado_em || m.data_inicio);
            return d >= new Date(ini) && d <= new Date(fim + 'T23:59:59');
        });
        const custo = filtrada.reduce((s, m) => s + (m.custo || 0), 0);
        document.getElementById('estatisticasPeriodo').innerHTML = `
            <div class="stat-item"><span class="stat-item-value">${filtrada.length}</span><span class="stat-item-label">Total</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.resultado_reparo==='Consertado').length}</span><span class="stat-item-label">Consertados</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.resultado_reparo==='Sem Reparo').length}</span><span class="stat-item-label">Sem Reparo</span></div>
            <div class="stat-item"><span class="stat-item-value">${filtrada.filter(m=>m.status==='Concluída').length}</span><span class="stat-item-label">Concluídas</span></div>
            <div class="stat-item"><span class="stat-item-value">${formatCurrency(custo)}</span><span class="stat-item-label">Custo Total</span></div>`;
    } catch { /* silencia */ }
}

document.getElementById('formRelatorio').addEventListener('submit', async e => {
    e.preventDefault();
    const tipo = document.getElementById('tipoRelatorio').value;
    const ini  = document.getElementById('dataInicio').value;
    const fim  = document.getElementById('dataFim').value;
    await loadEstatisticasPeriodo(ini, fim);
    try {
        const lista = await listarManutencoes({});
        const filtrada = lista.filter(m => {
            const d = new Date(m.criado_em || m.data_inicio);
            return d >= new Date(ini) && d <= new Date(fim + 'T23:59:59');
        });
        const fns = {
            manutencoes: () => gerarRelatorioManutencoes(filtrada, ini, fim),
            custos:      () => gerarRelatorioCustos(filtrada, ini, fim)
        };
        document.getElementById('resultadoRelatorio').innerHTML = (fns[tipo] || (() => ''))();
    } catch (err) {
        document.getElementById('resultadoRelatorio').innerHTML = `<p>Erro: ${err.message}</p>`;
    }
});

function gerarRelatorioManutencoes(lista, ini, fim) {
    if (!lista.length) return '<p class="empty-state">Nenhuma manutenção no período.</p>';
    return `<h4>Histórico (${formatDate(ini)} — ${formatDate(fim)})</h4>
        <table>
            <thead><tr><th>Nº</th><th>Equipamento</th><th>Localização</th><th>Técnico</th><th>Problema</th><th>Data</th><th>Status</th><th>Reparo</th><th>Custo</th></tr></thead>
            <tbody>${lista.map(m=>`<tr>
                <td><span class="id-badge">${m.numero}</span></td>
                <td>${m.equipamento||'-'}</td><td>${m.localizacao||'-'}</td><td>${m.tecnico||'-'}</td>
                <td>${(m.problema||'').substring(0,45)}${(m.problema||'').length>45?'…':''}</td>
                <td>${formatDate(m.data_inicio)}</td>
                <td><span class="badge ${getStatusBadge(m.status_equipamento||m.status)}">${m.status_equipamento||m.status}</span></td>
                <td>${m.resultado_reparo?`<span class="badge ${getStatusBadge(m.resultado_reparo)}">${m.resultado_reparo}</span>`:'—'}</td>
                <td>${formatCurrency(m.custo)}</td>
            </tr>`).join('')}</tbody>
        </table>`;
}

function gerarRelatorioCustos(lista, ini, fim) {
    const porLoc = {};
    lista.forEach(m => { porLoc[m.localizacao||'Sem Local'] = (porLoc[m.localizacao||'Sem Local']||0) + (m.custo||0); });
    const total = Object.values(porLoc).reduce((a,b)=>a+b,0);
    if (!total) return '<p class="empty-state">Nenhum custo registrado no período.</p>';
    return `<h4>Análise de Custos (${formatDate(ini)} — ${formatDate(fim)})</h4>
        <div class="chart-container">
            ${Object.entries(porLoc).map(([loc,custo])=>{
                const pct=total?(custo/total*100).toFixed(0):0;
                return `<div class="chart-bar">
                    <span class="chart-label">${loc}</span>
                    <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${pct}%">${formatCurrency(custo)}</div></div>
                </div>`;
            }).join('')}
        </div>
        <p style="margin-top:20px;font-size:1.1rem;"><strong>Custo Total: ${formatCurrency(total)}</strong></p>`;
}

// =============================================
// USUÁRIOS (gerência)
// =============================================
async function loadUsuarios() {
    const container = document.getElementById('listaUsuarios');
    container.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
    try {
        const usuarios = await listarUsuarios();
        if (!usuarios.length) {
            container.innerHTML = '<div class="empty-state"><p>Nenhum usuário cadastrado.</p></div>';
            return;
        }
        const rows = usuarios.map(u => `
            <tr>
                <td>${u.nome}</td>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${formatDate(u.criado_em)}</td>
                <td>
                    <button class="btn-icon btn-delete" onclick="removerUsuario(${u.id}, '${u.username}')" title="Remover">🗑️</button>
                </td>
            </tr>`).join('');
        container.innerHTML = `
            <table>
                <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Criado em</th><th>Ações</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
    }
}

document.getElementById('formNovoUsuario')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await criarUsuario({
            nome:     document.getElementById('novoNome').value,
            username: document.getElementById('novoUsername').value,
            senha:    document.getElementById('novaSenha').value,
            role:     document.getElementById('novoRole').value
        });
        document.getElementById('formNovoUsuario').reset();
        await loadUsuarios();
        alert('Usuário criado com sucesso!');
    } catch (err) {
        alert('Erro ao criar usuário: ' + err.message);
    }
});

window.removerUsuario = async function(id, username) {
    if (confirm(`Deseja remover o usuário "${username}"?`)) {
        try {
            await excluirUsuario(id);
            await loadUsuarios();
            alert('Usuário removido.');
        } catch (err) {
            alert('Erro ao remover: ' + err.message);
        }
    }
};

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
iniciarApp();
