const socket = io('https://baralho-equacao-backend.onrender.com'); // ou a URL do Render

console.log('Socket conectado?', socket.connected);

let salaId = null, meuId = null, meuNome = '';
let jogadores = [], maos = {}, montagens = {}, turno = 0, maxJogadores = 4;
let baralhoRestante = 0, descarte = [], descarteVisivel = null, nomes = {};
let vezDeComprar = false, fase = 'aguardando', cartaSelecionadaUid = null;
let tempoJogada = 30, tempoRestante = 30, timerInterval = null;
let cartasPorJogador = 4;
let turnoAnterior = 0, cartasAnterior = 0;

const SoundManager = {
    init() {
        this.sounds = {
            click: new Audio('assets/sounds/click.mp3'),
            card: new Audio('assets/sounds/card-swish.mp3'),
            fanfare: new Audio('assets/sounds/fanfare.mp3')
        };
        Object.values(this.sounds).forEach(audio => audio.load());
    },
    playClick() { this._play('click'); },
    playCard() { this._play('card'); },
    playVictory() { this._play('fanfare'); },
    _play(key) {
        const audio = this.sounds[key];
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
    }
};
SoundManager.init();

// ===== DOM =====
const menuEl = document.getElementById('menu');
const jogoEl = document.getElementById('jogo');
const statusEl = document.getElementById('status');
const salaIdEl = document.getElementById('sala-id');
const jogadoresInfoEl = document.getElementById('jogadores-info');
const turnoInfoEl = document.getElementById('turno-info');
const vezComprarInfoEl = document.getElementById('vez-comprar-info');
const timerInfoEl = document.getElementById('timer-info');
const mensagemEl = document.getElementById('mensagem');
const baralhoInfoEl = document.getElementById('baralho-info');
const descarteInfoEl = document.getElementById('descarte-info');
const descarteVisualEl = document.getElementById('descarte-visual');
const descarteAcaoEl = document.getElementById('descarte-acao');
const montagemSlotsEl = document.getElementById('montagem-slots');
const maoSlotsEl = document.getElementById('mao-slots');
const listaJogadoresEl = document.getElementById('lista-jogadores');
const progressoMontagemEl = document.getElementById('progresso-montagem');
const btnComprar = document.getElementById('btn-comprar');
const btnDescartar = document.getElementById('btn-descartar');
const btnMontagem = document.getElementById('btn-montagem');
const btnPassar = document.getElementById('btn-passar');
const modalNomeEl = document.getElementById('modal-nome');
const inputNome = document.getElementById('input-nome');
const btnConfirmarNome = document.getElementById('btn-confirmar-nome');
const erroNomeEl = document.getElementById('erro-nome');
const selectJogadores = document.getElementById('select-jogadores');
const selectCartas = document.getElementById('select-cartas');
const inputTempo = document.getElementById('input-tempo');
const modalVitoria = document.getElementById('modal-vitoria');
const vitoriaNome = document.getElementById('vitoria-nome');
const btnReiniciar = document.getElementById('btn-reiniciar');
const modalRegras = document.getElementById('modal-regras');
const btnRegras = document.getElementById('btn-regras');
const btnFecharRegras = document.getElementById('btn-fechar-regras');

// ===== MODAL REGRAS =====
function abrirRegras() { modalRegras.classList.remove('hidden'); }
function fecharRegras() { modalRegras.classList.add('hidden'); }
btnRegras.addEventListener('click', abrirRegras);
btnFecharRegras.addEventListener('click', fecharRegras);
modalRegras.addEventListener('click', (e) => { if (e.target === modalRegras) fecharRegras(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalRegras.classList.contains('hidden')) fecharRegras(); });

// ===== CHAT =====
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnEnviarChat = document.getElementById('btn-enviar-chat');
const btnToggleChat = document.getElementById('btn-toggle-chat');

function adicionarMensagemChat(nome, texto, tipo = 'normal', hora = null) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `msg ${tipo === 'sistema' ? 'sistema' : ''}`;
    if (tipo === 'sistema') {
        div.textContent = texto;
    } else {
        const time = hora || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<span class="nome">${nome}</span>${texto}<span class="hora">${time}</span>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (container.children.length > 100) container.removeChild(container.firstChild);
}

btnToggleChat.addEventListener('click', () => {
    chatContainer.classList.toggle('minimizado');
    btnToggleChat.textContent = chatContainer.classList.contains('minimizado') ? '+' : '−';
});

function enviarMensagemChat() {
    const texto = chatInput.value.trim();
    if (!texto) return;
    if (!salaId) {
        adicionarMensagemChat('Sistema', 'Você precisa estar em uma sala.', 'sistema');
        chatInput.value = '';
        return;
    }
    socket.emit('chat-mensagem', { salaId, texto });
    chatInput.value = '';
    chatInput.focus();
}

btnEnviarChat.addEventListener('click', enviarMensagemChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarMensagemChat(); });

// ===== BOTÕES =====
document.getElementById('btn-criar').addEventListener('click', () => mostrarModalNome('criar'));
document.getElementById('btn-entrar').addEventListener('click', () => {
    const codigo = document.getElementById('input-sala').value.trim();
    if (!codigo) { statusEl.textContent = 'Digite um código de sala!'; return; }
    mostrarModalNome('entrar');
});

btnComprar.addEventListener('click', () => {
    if (fase !== 'jogando' || jogadores[turno]?.id !== meuId) return;
    if (vezDeComprar) { mensagemEl.textContent = 'Você já comprou!'; return; }
    socket.emit('comprar', { salaId });
});

function pegarDescarte() {
    if (fase !== 'jogando' || jogadores[turno]?.id !== meuId) return;
    if (vezDeComprar) { mensagemEl.textContent = 'Você já comprou!'; return; }
    if (!descarteVisivel) { mensagemEl.textContent = 'Nenhuma carta disponível!'; return; }
    socket.emit('pegar-descarte', { salaId });
}

btnDescartar.addEventListener('click', () => {
    if (fase !== 'jogando' || jogadores[turno]?.id !== meuId) return;
    if (!vezDeComprar) { mensagemEl.textContent = 'Compre uma carta primeiro!'; return; }
    if (!cartaSelecionadaUid) { mensagemEl.textContent = 'Selecione uma carta da sua mão!'; return; }
    const carta = (maos[meuId] || []).find(c => c.uid === cartaSelecionadaUid);
    if (!carta) { mensagemEl.textContent = 'Carta não encontrada!'; return; }
    socket.emit('descartar', {
        salaId,
        cartaId: carta.id,
        cartaUid: carta.uid
    });
    cartaSelecionadaUid = null;
    atualizarBotoes();
});

btnMontagem.addEventListener('click', () => {
    console.log('Botão Montagem clicado. Selecionada:', cartaSelecionadaUid);
    if (!cartaSelecionadaUid) return;
    if (fase !== 'jogando') return;
    const carta = (maos[meuId] || []).find(c => c.uid === cartaSelecionadaUid);
    if (!carta) {
        console.log('Carta não encontrada na mão!');
        mensagemEl.textContent = 'Carta não encontrada!';
        return;
    }
    console.log('Enviando carta para montagem:', carta.uid);
    socket.emit('mover-para-montagem', {
        salaId,
        cartaId: carta.id,
        cartaUid: carta.uid
    });
    cartaSelecionadaUid = null;
    atualizarBotoes();
});

btnPassar.addEventListener('click', () => {
    if (fase !== 'jogando' || jogadores[turno]?.id !== meuId) return;
    socket.emit('passar-vez', { salaId });
});

btnReiniciar.addEventListener('click', () => window.location.reload());

// ===== MODAL NOME =====
let acaoAposNome = null;

function mostrarModalNome(acao) {
    acaoAposNome = acao;
    modalNomeEl.classList.remove('hidden');
    inputNome.value = '';
    inputNome.focus();
    erroNomeEl.textContent = '';
}
function fecharModalNome() { modalNomeEl.classList.add('hidden'); }

btnConfirmarNome.addEventListener('click', () => {
    const nome = inputNome.value.trim();
    if (!nome) { erroNomeEl.textContent = 'Digite seu nome!'; return; }
    if (nome.length > 20) { erroNomeEl.textContent = 'Máx 20 caracteres!'; return; }
    meuNome = nome;
    fecharModalNome();
    if (acaoAposNome === 'criar') {
        const max = parseInt(selectJogadores.value);
        const tempo = parseInt(inputTempo.value) || 30;
        const cartas = parseInt(selectCartas.value);
        socket.emit('criar-sala', { maxJogadores: max, nome: meuNome, tempoJogada: tempo, cartasPorJogador: cartas });
    } else if (acaoAposNome === 'entrar') {
        const codigo = document.getElementById('input-sala').value.trim();
        if (!codigo) { statusEl.textContent = 'Digite um código!'; return; }
        socket.emit('entrar-sala', { salaId: codigo, nome: meuNome });
    }
});

// ===== EVENTOS SOCKET =====
socket.on('connect', () => { meuId = socket.id; console.log('Conectado:', meuId); });

socket.on('sala-criada', (id) => {
    salaId = id;
    statusEl.textContent = `Sala criada! Código: ${id}`;
    document.getElementById('input-sala').value = id;
    entrarJogo(id);
});

socket.on('entrou-sala', (id) => {
    salaId = id;
    statusEl.textContent = `Entrou na sala ${id}`;
    entrarJogo(id);
});

socket.on('jogadores', (lista) => {
    jogadores = lista;
    atualizarInfo();
    renderizarListaJogadores();
    const nomesLista = lista.map(j => j.nome || 'Jogador').join(', ');
    adicionarMensagemChat('Sistema', `Jogadores na sala: ${nomesLista}`, 'sistema');
});

socket.on('inicio-jogo', (dados) => {
    maos = dados.maos;
    montagens = dados.montagens;
    turno = dados.turno;
    jogadores = dados.jogadores;
    maxJogadores = dados.maxJogadores;
    baralhoRestante = dados.baralhoRestante;
    descarte = dados.descarte || [];
    descarteVisivel = dados.descarteVisivel || null;
    nomes = dados.nomes || {};
    vezDeComprar = dados.vezDeComprar || false;
    tempoJogada = dados.tempoJogada || 30;
    tempoRestante = dados.tempoRestante || tempoJogada;
    cartasPorJogador = dados.cartasPorJogador || 4;
    fase = 'jogando';
    mensagemEl.textContent = 'Jogo iniciado!';
    turnoAnterior = turno;
    cartasAnterior = (maos[meuId] || []).length;
    atualizarInfo();
    renderizarMontes();
    renderizarMontagem();
    renderizarMao();
    renderizarListaJogadores();
    atualizarBotoes();
    iniciarTimerLocal();
});

socket.on('estado-jogo', (dados) => {
    maos = dados.maos;
    montagens = dados.montagens;
    turno = dados.turno;
    jogadores = dados.jogadores;
    baralhoRestante = dados.baralhoRestante;
    descarte = dados.descarte || [];
    descarteVisivel = dados.descarteVisivel || null;
    nomes = dados.nomes || {};
    vezDeComprar = dados.vezDeComprar || false;
    fase = dados.fase || 'jogando';
    tempoRestante = dados.tempoRestante || tempoJogada;

    if (dados.turno !== turnoAnterior && dados.turno !== undefined) {
        SoundManager.playClick();
        turnoAnterior = dados.turno;
    }
    const minhaMao = maos[meuId] || [];
    if (minhaMao.length > cartasAnterior) {
        SoundManager.playCard();
        cartasAnterior = minhaMao.length;
    }

    atualizarInfo();
    renderizarMontes();
    renderizarMontagem();
    renderizarMao();
    renderizarListaJogadores();
    atualizarBotoes();
    if (dados.fase === 'finalizado') {
        mensagemEl.textContent = 'Jogo finalizado!';
        pararTimerLocal();
    } else {
        iniciarTimerLocal();
    }
});

socket.on('fim-de-jogo', ({ vencedor, maos: maosFinais, montagens: montagensFinais, nomes: nomesFinais }) => {
    maos = maosFinais;
    montagens = montagensFinais;
    nomes = nomesFinais || {};
    fase = 'finalizado';
    const nomeVencedor = vencedor === meuId ? 'Você' : (nomes[vencedor] || 'Jogador ' + (jogadores.findIndex(j => j.id === vencedor) + 1));
    mensagemEl.textContent = `🏆 ${nomeVencedor} venceu!`;
    if (vencedor === meuId) SoundManager.playVictory();
    renderizarMontagem();
    renderizarMao();
    renderizarListaJogadores();
    atualizarBotoes();
    vitoriaNome.textContent = nomeVencedor;
    modalVitoria.classList.remove('hidden');
    pararTimerLocal();
});

socket.on('timer-update', (dados) => {
    tempoRestante = dados.tempoRestante;
    timerInfoEl.textContent = `⏱️ ${tempoRestante}s`;
});

socket.on('chat-mensagem', ({ nome, texto, hora }) => {
    adicionarMensagemChat(nome, texto, 'normal', hora);
});

socket.on('erro', (msg) => {
    statusEl.textContent = '❌ ' + msg;
    setTimeout(() => statusEl.textContent = '', 3000);
});

// ===== FUNÇÕES DE RENDERIZAÇÃO =====
function entrarJogo(id) {
    menuEl.style.display = 'none';
    jogoEl.style.display = 'flex';
    salaIdEl.textContent = `Sala: ${id}`;
    statusEl.textContent = '';
}

function atualizarInfo() {
    jogadoresInfoEl.textContent = `Jogadores: ${jogadores.length}/${maxJogadores}`;
    if (jogadores.length > 0 && turno !== undefined) {
        const jogadorAtual = jogadores[turno];
        const nomeAtual = jogadorAtual ? (nomes[jogadorAtual.id] || 'Jogador ' + (turno+1)) : '—';
        const ehMinhaVez = jogadorAtual && jogadorAtual.id === meuId;
        turnoInfoEl.textContent = `Vez: ${nomeAtual} ${ehMinhaVez ? '⭐' : ''}`;
        vezComprarInfoEl.textContent = ehMinhaVez ? (vezDeComprar ? ' (Descartar)' : ' (Comprar)') : '';
    }
}

function renderizarMontes() {
    baralhoInfoEl.textContent = `${baralhoRestante} cartas`;
    descarteInfoEl.textContent = `${descarte.length} cartas`;
    descarteVisualEl.innerHTML = '';
    if (descarteVisivel) {
        // MUDANÇA: passa TRUE para mostrar o conteúdo da carta
        const card = criarCartaElement(descarteVisivel, true);
        card.classList.add('carta-descarte');
        // Remove os listeners originais para evitar conflito
        card.replaceWith(card.cloneNode(true));
        const novoCard = descarteVisualEl.querySelector('.carta') || card;

        const ehMinhaVez = jogadores[turno]?.id === meuId && fase === 'jogando' && !vezDeComprar;

        // Cria novamente o elemento com conteúdo visível
        descarteVisualEl.innerHTML = '';
        const cardVisivel = criarCartaElement(descarteVisivel, true);
        cardVisivel.classList.add('carta-descarte');
        // Desativa o clique de ampliar na carta do descarte para não conflitar
        cardVisivel.style.pointerEvents = 'none';

        if (ehMinhaVez) {
            cardVisivel.style.pointerEvents = 'auto';
            cardVisivel.style.cursor = 'pointer';
            cardVisivel.addEventListener('click', (e) => {
                e.stopPropagation();
                pegarDescarte();
            });
            cardVisivel.title = 'Clique para pegar esta carta';
        }
        descarteVisualEl.appendChild(cardVisivel);

        if (ehMinhaVez) {
            const btn = document.createElement('button');
            btn.className = 'btn-warning';
            btn.textContent = 'Pegar carta';
            btn.style.padding = '6px 16px';
            btn.style.fontSize = '0.9rem';
            btn.addEventListener('click', pegarDescarte);
            descarteAcaoEl.innerHTML = '';
            descarteAcaoEl.appendChild(btn);
        } else {
            descarteAcaoEl.innerHTML = '';
        }
    } else {
        descarteVisualEl.innerHTML = '<div style="color:#64748b;font-size:0.9rem;">Nenhuma carta</div>';
        descarteAcaoEl.innerHTML = '';
    }
}

function renderizarMontagem() {
    montagemSlotsEl.innerHTML = '';
    const montagem = montagens[meuId] || [];
    const total = cartasPorJogador === 4 ? 4 : 8;
    progressoMontagemEl.textContent = `(${montagem.length}/${total})`;
    if (montagem.length === 0) {
        const vazio = document.createElement('div');
        vazio.className = 'slot-vazio';
        vazio.textContent = 'Arraste cartas para cá';
        montagemSlotsEl.appendChild(vazio);
    } else {
        montagem.forEach(carta => {
            const card = criarCartaElement(carta, true);
            card.classList.add(`tipo-${carta.tipo}`);
            card.addEventListener('dblclick', () => {
                if (fase === 'jogando') {
                    socket.emit('mover-para-mao', {
                        salaId,
                        cartaId: carta.id,
                        cartaUid: carta.uid
                    });
                }
            });
            montagemSlotsEl.appendChild(card);
        });
    }
}

function criarCartaElement(carta, minha) {
    const div = document.createElement('div');
    div.className = 'carta';
    if (!minha) {
        div.classList.add('virada');
        return div;
    }
    div.classList.add('minha-carta');
    div.classList.add(`tipo-${carta.tipo}`);
    if (carta.tipo === 'grafico') {
        div.innerHTML = carta.texto;
    } else {
        div.innerHTML = `<div class="valor">${carta.texto}</div>`;
    }
    div._cartaData = carta;

    // Selo com o id (exceto para curingas)
    if (!String(carta.id).startsWith('curinga')) {
        const selo = document.createElement('span');
        selo.textContent = `#${carta.id}`;
        selo.style.cssText = `
            position: absolute;
            top: 6px; right: 8px;
            background: rgba(0,0,0,0.75);
            color: #f1c40f;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 700;
            z-index: 3;
        `;
        div.appendChild(selo);
    }

    div.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        ampliarCarta(div);
    });
    return div;
}

function renderizarMao() {
    maoSlotsEl.innerHTML = '';
    const mao = maos[meuId] || [];
    const montagemAtual = montagens[meuId] || [];

    if (mao.length === 0) {
        const vazio = document.createElement('div');
        vazio.className = 'slot-vazio';
        vazio.textContent = 'Sem cartas';
        maoSlotsEl.appendChild(vazio);
    } else {
        mao.forEach(carta => {
            const card = criarCartaElement(carta, true);
            card.classList.add(`tipo-${carta.tipo}`);

            if (cartaSelecionadaUid === carta.uid) {
                card.classList.add('selecionada');
            }

            card.addEventListener('click', () => {
                if (fase !== 'jogando') return;
                if (cartaSelecionadaUid === carta.uid) {
                    cartaSelecionadaUid = null;
                } else {
                    cartaSelecionadaUid = carta.uid;
                }
                document.querySelectorAll('#mao-slots .carta').forEach(el => el.classList.remove('selecionada'));
                if (cartaSelecionadaUid) card.classList.add('selecionada');
                atualizarBotoes();
            });

            maoSlotsEl.appendChild(card);
        });
    }
}
// ===== AMPLIAR CARTA (MODAL) =====
let cartaExpandida = null; // ← UNICA DECLARAÇÃO

function ampliarCarta(carta) {
    try {
        if (cartaExpandida) {
            document.body.removeChild(cartaExpandida);
            cartaExpandida = null;
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            backdrop-filter: blur(4px);
            cursor: pointer;
        `;

        const cardContainer = document.createElement('div');
        cardContainer.style.cssText = `
            position: relative;
            max-width: 90%;
            max-height: 90%;
            cursor: default;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const cardClone = carta.cloneNode(true);
        cardClone.style.cssText = `
            width: 420px;
            min-height: 520px;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 30px 60px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 25px;
            transform: scale(1);
            transition: 0.2s;
            cursor: default;
            position: relative;
            overflow: hidden;
        `;
        cardClone.style.pointerEvents = 'none';

        const symbols = document.createElement('div');
        symbols.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            font-size: 5rem;
            color: rgba(0,0,0,0.03);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-around;
            align-items: center;
            pointer-events: none;
            transform: rotate(-10deg) scale(1.2);
            z-index: 0;
        `;
        symbols.textContent = '∫ ∑ π √ ∞ ± ÷ ×';
        cardClone.appendChild(symbols);

        const content = cardClone.querySelector('.valor') || cardClone.querySelector('svg');
        if (content) content.style.zIndex = '1';

        cardContainer.appendChild(cardClone);

        const btnFechar = document.createElement('button');
        btnFechar.innerHTML = '✕';
        btnFechar.style.cssText = `
            position: absolute;
            top: 12px;
            right: 18px;
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 1.6rem;
            font-weight: bold;
            cursor: pointer;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: 0.2s;
        `;
        btnFechar.addEventListener('mouseenter', () => {
            btnFechar.style.background = '#b91c1c';
            btnFechar.style.transform = 'scale(1.1)';
        });
        btnFechar.addEventListener('mouseleave', () => {
            btnFechar.style.background = '#dc2626';
            btnFechar.style.transform = 'scale(1)';
        });
        btnFechar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
                cartaExpandida = null;
            }
        });

        cardContainer.appendChild(btnFechar);
        overlay.appendChild(cardContainer);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                cartaExpandida = null;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.parentNode) {
                document.body.removeChild(overlay);
                cartaExpandida = null;
            }
        });

        document.body.appendChild(overlay);
        cartaExpandida = overlay;

    } catch (error) {
        console.error('Erro ao ampliar carta:', error);
    }
}

function renderizarListaJogadores() {
    listaJogadoresEl.innerHTML = '';
    jogadores.forEach(j => {
        const div = document.createElement('div');
        div.className = 'jogador-item';
        if (j.id === jogadores[turno]?.id && fase === 'jogando') div.classList.add('ativo');
        const ehEu = j.id === meuId;
        const nome = ehEu ? 'Você' : (nomes[j.id] || 'Jogador');
        const qtde = (maos[j.id] || []).length;
        div.innerHTML = `<span class="carta-icone">${ehEu ? '🃏' : '🂠'}</span> ${nome} (${qtde})`;
        listaJogadoresEl.appendChild(div);
    });
}

function atualizarBotoes() {
    const ehMinhaVez = jogadores[turno]?.id === meuId && fase === 'jogando';
    const temSelecionada = cartaSelecionadaUid !== null &&
        (maos[meuId] || []).some(c => c.uid === cartaSelecionadaUid);

    console.log('Atualizar botões. Selecionada:', cartaSelecionadaUid, 'Tem:', temSelecionada);

    btnComprar.style.display = (ehMinhaVez && !vezDeComprar) ? 'inline-block' : 'none';
    btnDescartar.style.display = (ehMinhaVez && vezDeComprar && temSelecionada) ? 'inline-block' : 'none';
    btnMontagem.style.display = (temSelecionada && fase === 'jogando') ? 'inline-block' : 'none';
    btnPassar.style.display = ehMinhaVez ? 'inline-block' : 'none';
}

function iniciarTimerLocal() {
    pararTimerLocal();
    timerInterval = setInterval(() => {
        if (tempoRestante > 0) {
            tempoRestante--;
            timerInfoEl.textContent = `⏱️ ${tempoRestante}s`;
        }
    }, 1000);
}
function pararTimerLocal() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}