const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], credentials: true }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'], credentials: true } });

app.use(express.static('../frontend'));

// ===== FUNÇÕES AUXILIARES =====
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== GRÁFICO SVG =====
function gerarSVGGrafico(a, b, raiz) {
    const w = 420, h = 560;
    const margem = 25;
    const xMin = Math.min(-5, raiz - 1);
    const xMax = Math.max(5, raiz + 1);
    const yMin = Math.min(-5, b - 1);
    const yMax = Math.max(5, b + 1);
    const escalaX = (w - 2 * margem) / (xMax - xMin);
    const escalaY = (h - 2 * margem) / (yMax - yMin);
    const cx = (x) => margem + (x - xMin) * escalaX;
    const cy = (y) => h - margem - (y - yMin) * escalaY;
    const x1 = xMin, y1 = a * x1 + b;
    const x2 = xMax, y2 = a * x2 + b;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border-radius:8px;">
        <line x1="${margem}" y1="${cy(0)}" x2="${w - margem}" y2="${cy(0)}" stroke="#1e293b" stroke-width="2.5"/>
        <line x1="${cx(0)}" y1="${margem}" x2="${cx(0)}" y2="${h - margem}" stroke="#1e293b" stroke-width="2.5"/>
        <polygon points="${w - margem},${cy(0)} ${w - margem - 12},${cy(0) - 6} ${w - margem - 12},${cy(0) + 6}" fill="#1e293b"/>
        <polygon points="${cx(0)},${margem} ${cx(0) - 6},${margem + 12} ${cx(0) + 6},${margem + 12}" fill="#1e293b"/>
        <line x1="${cx(x1)}" y1="${cy(y1)}" x2="${cx(x2)}" y2="${cy(y2)}" stroke="#2563eb" stroke-width="4"/>
        <circle cx="${cx(0)}" cy="${cy(b)}" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
        <text x="${cx(0) + 14}" y="${cy(b) - 8}" font-size="18" fill="#1e293b" font-weight="700">${b}</text>
        <circle cx="${cx(raiz)}" cy="${cy(0)}" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
        <text x="${cx(raiz) - 18}" y="${cy(0) - 14}" font-size="18" fill="#1e293b" font-weight="700">${raiz}</text>
        <text x="${cx(0) + 8}" y="${cy(0) + 24}" font-size="16" fill="#64748b" font-weight="500">0</text>
        <text x="${w - margem - 10}" y="${cy(0) - 10}" font-size="18" fill="#1e293b" font-weight="700">x</text>
        <text x="${cx(0) + 16}" y="${margem + 10}" font-size="18" fill="#1e293b" font-weight="700">y</text>
    </svg>`;
}

function formatarEquacao(a, b) {
    let parteA = '';
    if (a === 1) parteA = '';
    else if (a === -1) parteA = '-';
    else parteA = a;
    let parteB = '';
    if (b === 0) parteB = '';
    else if (b > 0) parteB = ` + ${b}`;
    else parteB = ` - ${Math.abs(b)}`;
    return `y = ${parteA}x${parteB}`;
}

// ===== GERAÇÃO DOS 18 QUARTETOS (SEM REPETIR RAÍZES) =====
function gerarQuartetos(qtde = 18) {
    const quartetos = [];
    const equacoesUsadas = new Set();
    const raizesUsadas = new Set();
    let tentativas = 0;
    const maxTentativas = 5000;

    while (quartetos.length < qtde && tentativas < maxTentativas) {
        tentativas++;
        let a = randInt(-5, 5);
        if (a === 0) continue;
        let b = randInt(-10, 10);
        if (b % a !== 0) continue;

        const chaveEq = `${a},${b}`;
        if (equacoesUsadas.has(chaveEq)) continue;

        const raiz = -b / a;
        if (raizesUsadas.has(raiz)) continue; // garante raízes únicas

        equacoesUsadas.add(chaveEq);
        raizesUsadas.add(raiz);

        const classificacao = a > 0 ? 'Crescente' : 'Decrescente';
        quartetos.push({
            id: quartetos.length + 1,
            a, b,
            equacao: formatarEquacao(a, b),
            raiz: raiz,
            classificacao: classificacao,
            grafico: gerarSVGGrafico(a, b, raiz)
        });
    }
    return quartetos;
}

// ===== CRIAÇÃO DO BARALHO (com id curinga para classificação) =====
function criarBaralho() {
    const quartetos = gerarQuartetos(18);
    const baralho = [];
    quartetos.forEach(q => {
        baralho.push({ uid: `${q.id}-equacao`, id: q.id, tipo: 'equacao', texto: q.equacao, valor: q });
        baralho.push({ uid: `${q.id}-grafico`, id: q.id, tipo: 'grafico', texto: q.grafico, valor: q });
        baralho.push({ uid: `${q.id}-solucao`, id: q.id, tipo: 'solucao', texto: `x = ${q.raiz}`, valor: q });
        // Classificação com id curinga
        const idCuringa = q.a > 0 ? 'curinga-crescente' : 'curinga-decrescente';
        baralho.push({ uid: `${q.id}-classificacao`, id: idCuringa, tipo: 'classificacao', texto: q.classificacao, valor: q });
    });
    return baralho;
}

function embaralhar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===== SALAS =====
const salas = {};

io.on('connection', (socket) => {
    console.log('Jogador conectado:', socket.id);

    socket.on('criar-sala', ({ maxJogadores, nome, tempoJogada, cartasPorJogador }) => {
        const salaId = Math.random().toString(36).substring(2, 8);
        const baralho = embaralhar(criarBaralho());
        salas[salaId] = {
            jogadores: [{ id: socket.id, nome: nome || 'Jogador' }],
            maxJogadores: maxJogadores || 4,
            tempoJogada: tempoJogada || 30,
            cartasPorJogador: cartasPorJogador || 4,
            baralho,
            descarte: [],
            descarteVisivel: null,
            maos: {}, montagens: {}, nomes: {},
            turno: 0,
            fase: 'aguardando',
            vencedor: null,
            vezDeComprar: false,
            timerInterval: null,
            tempoRestante: 0,
        };
        salas[salaId].nomes[socket.id] = nome || 'Jogador';
        salas[salaId].maos[socket.id] = [];
        salas[salaId].montagens[socket.id] = [];
        socket.join(salaId);
        socket.emit('sala-criada', salaId);
        console.log(`Sala ${salaId} criada por ${socket.id} (${nome})`);
    });

    socket.on('entrar-sala', ({ salaId, nome }) => {
        const sala = salas[salaId];
        if (!sala) return socket.emit('erro', 'Sala não encontrada');
        if (sala.jogadores.length >= sala.maxJogadores) return socket.emit('erro', 'Sala cheia');
        sala.jogadores.push({ id: socket.id, nome: nome || 'Jogador' });
        sala.nomes[socket.id] = nome || 'Jogador';
        sala.maos[socket.id] = [];
        sala.montagens[socket.id] = [];
        socket.join(salaId);
        socket.emit('entrou-sala', salaId);
        io.to(salaId).emit('jogadores', sala.jogadores);
        if (sala.jogadores.length === sala.maxJogadores) iniciarJogo(salaId);
        console.log(`${socket.id} entrou na sala ${salaId} (${nome})`);
    });

    socket.on('comprar', ({ salaId }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;
        if (sala.jogadores[sala.turno].id !== jogadorId) return socket.emit('erro', 'Não é sua vez!');
        if (sala.vezDeComprar) return socket.emit('erro', 'Você já comprou!');
        if (sala.baralho.length === 0) {
            if (sala.descarte.length === 0) return socket.emit('erro', 'Baralho vazio!');
            const ultima = sala.descarte.pop();
            sala.baralho = embaralhar(sala.descarte);
            sala.descarte = [];
            sala.descarte.push(ultima);
        }
        const carta = sala.baralho.pop();
        sala.maos[jogadorId].push(carta);
        sala.vezDeComprar = true;
        pararTimer(salaId);
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('pegar-descarte', ({ salaId }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;
        if (sala.jogadores[sala.turno].id !== jogadorId) return socket.emit('erro', 'Não é sua vez!');
        if (sala.vezDeComprar) return socket.emit('erro', 'Você já comprou!');
        if (!sala.descarteVisivel) return socket.emit('erro', 'Nenhuma carta disponível!');
        const carta = sala.descarteVisivel;
        sala.descarteVisivel = null;
        sala.maos[jogadorId].push(carta);
        sala.vezDeComprar = true;
        pararTimer(salaId);
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('descartar', ({ salaId, cartaId, cartaUid }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;
        if (sala.jogadores[sala.turno].id !== jogadorId) return socket.emit('erro', 'Não é sua vez!');
        if (!sala.vezDeComprar) return socket.emit('erro', 'Compre uma carta primeiro!');
        const idx = sala.maos[jogadorId].findIndex(c => c.uid === cartaUid);
        if (idx === -1) return socket.emit('erro', 'Carta não encontrada!');
        const carta = sala.maos[jogadorId].splice(idx, 1)[0];
        if (sala.descarteVisivel) sala.descarte.push(sala.descarteVisivel);
        sala.descarteVisivel = carta;
        sala.vezDeComprar = false;
        pararTimer(salaId);
        if (verificarVitoria(sala.montagens[jogadorId], sala.cartasPorJogador)) {
            sala.fase = 'finalizado';
            sala.vencedor = jogadorId;
            io.to(salaId).emit('fim-de-jogo', { vencedor: jogadorId, maos: sala.maos, montagens: sala.montagens, nomes: sala.nomes });
            return;
        }
        proximoTurno(salaId);
        iniciarTimer(salaId);
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('mover-para-montagem', ({ salaId, cartaId, cartaUid }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;

        const idx = sala.maos[jogadorId].findIndex(c => c.uid === cartaUid);
        if (idx === -1) return socket.emit('erro', 'Carta não encontrada!');
        const carta = sala.maos[jogadorId].splice(idx, 1)[0];
        const montagem = sala.montagens[jogadorId] || [];

        if (montagem.length === 0) {
            if (carta.tipo === 'classificacao') {
                sala.maos[jogadorId].push(carta);
                return socket.emit('erro', 'A primeira carta não pode ser uma classificação. Comece com a equação, gráfico ou solução.');
            }
            sala.montagens[jogadorId] = [carta];
        } else {
            const tipos = montagem.map(c => c.tipo);
            if (tipos.includes(carta.tipo)) {
                sala.maos[jogadorId].push(carta);
                return socket.emit('erro', 'Você já tem uma carta desse tipo na montagem!');
            }

            if (carta.tipo === 'classificacao') {
                // REGRA ESPECIAL: valida pelo 'a' da equação
                const equacao = montagem.find(c => c.tipo === 'equacao');
                if (!equacao) {
                    sala.maos[jogadorId].push(carta);
                    return socket.emit('erro', 'Coloque primeiro a equação para validar a classificação.');
                }
                const a = equacao.valor.a;
                const esperado = a > 0 ? 'Crescente' : 'Decrescente';
                if (carta.texto === esperado) {
                    sala.montagens[jogadorId].push(carta);
                } else {
                    sala.maos[jogadorId].push(carta);
                    return socket.emit('erro', `Esta equação é "${esperado}", não "${carta.texto}".`);
                }
            } else {
                // REGRA NORMAL: id deve ser igual
                const idRef = montagem[0].id;
                if (carta.id !== idRef) {
                    sala.maos[jogadorId].push(carta);
                    return socket.emit('erro', `Carta não combina com a montagem (quarteto #${idRef}).`);
                }
                sala.montagens[jogadorId].push(carta);
            }
        }

        if (verificarVitoria(sala.montagens[jogadorId], sala.cartasPorJogador)) {
            sala.fase = 'finalizado';
            sala.vencedor = jogadorId;
            io.to(salaId).emit('fim-de-jogo', { vencedor: jogadorId, maos: sala.maos, montagens: sala.montagens, nomes: sala.nomes });
            return;
        }
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('mover-para-mao', ({ salaId, cartaId, cartaUid }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;
        const idx = sala.montagens[jogadorId].findIndex(c => c.uid === cartaUid);
        if (idx === -1) return socket.emit('erro', 'Carta não encontrada na montagem!');
        const carta = sala.montagens[jogadorId].splice(idx, 1)[0];
        sala.maos[jogadorId].push(carta);
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('passar-vez', ({ salaId }) => {
        const sala = salas[salaId];
        if (!sala || sala.fase !== 'jogando') return;
        const jogadorId = socket.id;
        if (sala.jogadores[sala.turno].id !== jogadorId) return socket.emit('erro', 'Não é sua vez!');
        if (!sala.vezDeComprar) {
            if (sala.baralho.length === 0 && sala.descarte.length > 0) {
                const ultima = sala.descarte.pop();
                sala.baralho = embaralhar(sala.descarte);
                sala.descarte = [];
                sala.descarte.push(ultima);
            }
            if (sala.baralho.length > 0) {
                const carta = sala.baralho.pop();
                sala.maos[jogadorId].push(carta);
            }
            sala.vezDeComprar = true;
        }
        const mao = sala.maos[jogadorId] || [];
        if (mao.length > 0) {
            const idx = Math.floor(Math.random() * mao.length);
            const carta = mao.splice(idx, 1)[0];
            if (sala.descarteVisivel) sala.descarte.push(sala.descarteVisivel);
            sala.descarteVisivel = carta;
        }
        sala.vezDeComprar = false;
        pararTimer(salaId);
        if (verificarVitoria(sala.montagens[jogadorId], sala.cartasPorJogador)) {
            sala.fase = 'finalizado';
            sala.vencedor = jogadorId;
            io.to(salaId).emit('fim-de-jogo', { vencedor: jogadorId, maos: sala.maos, montagens: sala.montagens, nomes: sala.nomes });
            return;
        }
        proximoTurno(salaId);
        iniciarTimer(salaId);
        io.to(salaId).emit('estado-jogo', obterEstado(salaId));
    });

    socket.on('chat-mensagem', ({ salaId, texto }) => {
        const sala = salas[salaId];
        if (!sala) return;
        const nome = sala.nomes[socket.id] || 'Jogador';
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        io.to(salaId).emit('chat-mensagem', { nome, texto, hora });
    });

    socket.on('disconnect', () => {
        for (const [salaId, sala] of Object.entries(salas)) {
            const idx = sala.jogadores.findIndex(j => j.id === socket.id);
            if (idx !== -1) {
                sala.jogadores.splice(idx, 1);
                delete sala.nomes[socket.id];
                delete sala.maos[socket.id];
                delete sala.montagens[socket.id];
                io.to(salaId).emit('jogadores', sala.jogadores);
                if (sala.jogadores.length === 0) {
                    if (sala.timerInterval) clearInterval(sala.timerInterval);
                    delete salas[salaId];
                } else {
                    if (sala.turno >= sala.jogadores.length) sala.turno = 0;
                    io.to(salaId).emit('estado-jogo', obterEstado(salaId));
                }
                break;
            }
        }
    });
});

function obterEstado(salaId) {
    const sala = salas[salaId];
    if (!sala) return null;
    return {
        maos: sala.maos, montagens: sala.montagens,
        turno: sala.turno, jogadores: sala.jogadores,
        baralhoRestante: sala.baralho.length,
        descarte: sala.descarte, descarteVisivel: sala.descarteVisivel,
        nomes: sala.nomes, vezDeComprar: sala.vezDeComprar,
        fase: sala.fase, tempoRestante: sala.tempoRestante
    };
}

function verificarVitoria(montagem, cartasPorJogador) {
    if (!montagem || montagem.length === 0) return false;
    const total = cartasPorJogador === 4 ? 4 : 8;
    return montagem.length >= total;
}

function iniciarJogo(salaId) {
    const sala = salas[salaId];
    if (!sala) return;
    const baralho = sala.baralho;
    const numJogadores = sala.jogadores.length;
    const cartasPorJogador = sala.cartasPorJogador;
    const total = numJogadores * cartasPorJogador;
    if (baralho.length < total) sala.baralho = embaralhar(criarBaralho());
    sala.maos = {}; sala.montagens = {};
    sala.jogadores.forEach(j => {
        sala.maos[j.id] = [];
        for (let i = 0; i < cartasPorJogador; i++) {
            const carta = sala.baralho.pop();
            if (carta) sala.maos[j.id].push(carta);
        }
        sala.montagens[j.id] = [];
    });
    sala.turno = 0;
    sala.fase = 'jogando';
    sala.vezDeComprar = false;
    sala.descarte = [];
    sala.descarteVisivel = null;
    sala.tempoRestante = sala.tempoJogada;
    io.to(salaId).emit('inicio-jogo', {
        maos: sala.maos, montagens: sala.montagens,
        turno: sala.turno, jogadores: sala.jogadores,
        maxJogadores: sala.maxJogadores,
        baralhoRestante: sala.baralho.length,
        descarte: sala.descarte, descarteVisivel: sala.descarteVisivel,
        nomes: sala.nomes, vezDeComprar: false,
        tempoJogada: sala.tempoJogada, tempoRestante: sala.tempoJogada,
        cartasPorJogador: sala.cartasPorJogador
    });
    iniciarTimer(salaId);
}

function proximoTurno(salaId) {
    const sala = salas[salaId];
    if (!sala) return;
    sala.turno = (sala.turno + 1) % sala.jogadores.length;
    sala.vezDeComprar = false;
    sala.tempoRestante = sala.tempoJogada;
}

function iniciarTimer(salaId) {
    const sala = salas[salaId];
    if (!sala || sala.fase !== 'jogando') return;
    pararTimer(salaId);
    sala.tempoRestante = sala.tempoJogada;
    sala.timerInterval = setInterval(() => {
        sala.tempoRestante--;
        io.to(salaId).emit('timer-update', { tempoRestante: sala.tempoRestante });
        if (sala.tempoRestante <= 0) {
            pararTimer(salaId);
            const jogadorId = sala.jogadores[sala.turno].id;
            if (!sala.vezDeComprar) {
                if (sala.baralho.length === 0 && sala.descarte.length > 0) {
                    const ultima = sala.descarte.pop();
                    sala.baralho = embaralhar(sala.descarte);
                    sala.descarte = [];
                    sala.descarte.push(ultima);
                }
                if (sala.baralho.length > 0) {
                    const carta = sala.baralho.pop();
                    sala.maos[jogadorId].push(carta);
                }
                sala.vezDeComprar = true;
            }
            const mao = sala.maos[jogadorId] || [];
            if (mao.length > 0) {
                const idx = Math.floor(Math.random() * mao.length);
                const carta = mao.splice(idx, 1)[0];
                if (sala.descarteVisivel) sala.descarte.push(sala.descarteVisivel);
                sala.descarteVisivel = carta;
            }
            sala.vezDeComprar = false;
            if (verificarVitoria(sala.montagens[jogadorId], sala.cartasPorJogador)) {
                sala.fase = 'finalizado';
                sala.vencedor = jogadorId;
                io.to(salaId).emit('fim-de-jogo', { vencedor: jogadorId, maos: sala.maos, montagens: sala.montagens, nomes: sala.nomes });
                return;
            }
            proximoTurno(salaId);
            if (sala.fase === 'jogando') iniciarTimer(salaId);
            io.to(salaId).emit('estado-jogo', obterEstado(salaId));
        }
    }, 1000);
}

function pararTimer(salaId) {
    const sala = salas[salaId];
    if (sala && sala.timerInterval) {
        clearInterval(sala.timerInterval);
        sala.timerInterval = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});