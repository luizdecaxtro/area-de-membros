// =============================================
// ÁREA DE MEMBROS - LOJAS DE CASTRO
// app.js — Lógica completa com Supabase
// =============================================
// INSTRUÇÕES DE CONFIGURAÇÃO:
// 1. Acesse https://supabase.com e crie um projeto
// 2. Vá em Settings > API e copie:
//    - Project URL  → substitua SUPABASE_URL
//    - anon/public key → substitua SUPABASE_KEY
// 3. Execute o SQL em supabase_setup.sql no SQL Editor do Supabase
// =============================================

const SUPABASE_URL = 'https://lmoiiegiceyflgafrygb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtb2lpZWdpY2V5ZmxnYWZyeWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzY5NzUsImV4cCI6MjA5MjIxMjk3NX0.0O-WhXrHdcifkCuzBl0X7hfbZnVgZv_XJG941LGKc2A';            

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Estado global ────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentFilterTopico = null;
let currentModalPostId = null;
let allMembros = [];

// ─── Cores dos avatares ───────────────────────────────
const AV_COLORS = ['av-0','av-1','av-2','av-3','av-4','av-5'];
function avatarColor(str) {
  if (!str) return 'av-0';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

// ─── Init ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    showApp();
  } else {
    showScreen('auth');
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session && !currentUser) {
      currentUser = session.user;
      await loadProfile();
      showApp();
    } else if (!session && currentUser) {
      currentUser = null;
      currentProfile = null;
      showScreen('auth');
    }
  });
});

// ─── Tela / Screen ────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

function showApp() {
  showScreen('app');
  updateSidebarUser();
  loadStats();
  loadFeed();
  loadOnlineMembers();
}

// ─── Auth: Tab switch ─────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

// ─── Auth: Login ──────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) { showError(errEl, 'Preencha e-mail e senha.'); return; }
  setBtnLoading('login', true);

  const { error } = await sb.auth.signInWithPassword({ email, password });
  setBtnLoading('login', false);
  if (error) showError(errEl, traducirError(error.message));
}

// ─── Auth: Cadastro ───────────────────────────────────
async function handleSignup() {
  const nome   = document.getElementById('signup-nome').value.trim();
  const email  = document.getElementById('signup-email').value.trim();
  const pass   = document.getElementById('signup-password').value;
  const cel    = document.getElementById('signup-cel').value.trim();
  const grau   = document.getElementById('signup-grau').value;
  const curso  = document.getElementById('signup-curso').value;
  const bio    = document.getElementById('signup-bio').value.trim();
  const errEl  = document.getElementById('signup-error');
  const okEl   = document.getElementById('signup-success');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (!nome || !email || !pass || !grau || !curso) {
    showError(errEl, 'Preencha todos os campos obrigatórios (*).');
    return;
  }
  if (pass.length < 6) { showError(errEl, 'A senha deve ter no mínimo 6 caracteres.'); return; }
  setBtnLoading('signup', true);

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { nome, cel, grau, curso, bio } }
  });
  setBtnLoading('signup', false);

  if (error) { showError(errEl, traducirError(error.message)); return; }

  // Criar perfil na tabela membros
  if (data.user) {
    await sb.from('membros').upsert({
      id: data.user.id,
      nome, email, cel, grau_instrucao: grau, curso, bio,
      created_at: new Date().toISOString()
    });
  }

  okEl.textContent = '✓ Conta criada! Verifique seu e-mail para confirmar o cadastro.';
  okEl.style.display = 'block';
}

// ─── Auth: Logout / Forgot ────────────────────────────
async function handleLogout() {
  await sb.auth.signOut();
}
async function forgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { alert('Digite seu e-mail no campo acima primeiro.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) alert('Erro: ' + error.message);
  else alert('E-mail de recuperação enviado para ' + email);
}

// ─── Profile ──────────────────────────────────────────
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('membros').select('*').eq('id', currentUser.id).single();
  if (data) {
    currentProfile = data;
    // Atualizar presence
    await sb.from('membros').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
  } else {
    // Primeira vez, criar perfil vazio
    const meta = currentUser.user_metadata || {};
    const { data: novo } = await sb.from('membros').upsert({
      id: currentUser.id,
      nome: meta.nome || currentUser.email,
      email: currentUser.email,
      cel: meta.cel || '',
      grau_instrucao: meta.grau || '',
      curso: meta.curso || '',
      bio: meta.bio || '',
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    }).select().single();
    currentProfile = novo;
  }
}

function updateSidebarUser() {
  if (!currentProfile) return;
  const name = currentProfile.nome || 'Membro';
  const ini = initials(name);
  const col = avatarColor(currentProfile.id);
  document.getElementById('user-name-sidebar').textContent = name;
  document.getElementById('user-course-sidebar').textContent = currentProfile.curso || '--';
  document.getElementById('user-avatar-sidebar').textContent = ini;
  document.getElementById('user-avatar-sidebar').className = 'user-avatar ' + col;
  document.getElementById('composer-avatar').textContent = ini;
  document.getElementById('composer-avatar').className = 'composer-avatar ' + col;
  document.getElementById('topbar-avatar').textContent = ini;
  document.getElementById('topbar-avatar').className = 'topbar-avatar ' + col;
  // Preencher perfil
  document.getElementById('perfil-avatar-display').textContent = ini;
  document.getElementById('perfil-avatar-display').className = 'perfil-avatar ' + col;
  document.getElementById('perfil-name-display').textContent = name;
  document.getElementById('perfil-course-display').textContent = currentProfile.curso || '--';
  document.getElementById('perfil-nome').value = currentProfile.nome || '';
  document.getElementById('perfil-cel').value = currentProfile.cel || '';
  document.getElementById('perfil-bio').value = currentProfile.bio || '';
  setSelectValue('perfil-grau', currentProfile.grau_instrucao);
  setSelectValue('perfil-curso', currentProfile.curso);
}

async function saveProfile() {
  const nome  = document.getElementById('perfil-nome').value.trim();
  const cel   = document.getElementById('perfil-cel').value.trim();
  const grau  = document.getElementById('perfil-grau').value;
  const curso = document.getElementById('perfil-curso').value;
  const bio   = document.getElementById('perfil-bio').value.trim();
  const msgEl = document.getElementById('perfil-msg');

  const { error } = await sb.from('membros').update({ nome, cel, grau_instrucao: grau, curso, bio }).eq('id', currentUser.id);
  if (error) {
    msgEl.textContent = 'Erro ao salvar: ' + error.message;
    msgEl.className = 'msg-error';
  } else {
    currentProfile = { ...currentProfile, nome, cel, grau_instrucao: grau, curso, bio };
    updateSidebarUser();
    msgEl.textContent = '✓ Perfil atualizado com sucesso!';
    msgEl.className = 'msg-success';
  }
  msgEl.style.display = 'block';
  setTimeout(() => msgEl.style.display = 'none', 4000);
}

// ─── Stats ────────────────────────────────────────────
async function loadStats() {
  const [{ count: totalMembros }, posts, onlineNow] = await Promise.all([
    sb.from('membros').select('*', { count: 'exact', head: true }),
    sb.from('posts').select('*', { count: 'exact', head: true }),
    sb.from('membros').select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(Date.now() - 10 * 60000).toISOString())
  ]);
  document.getElementById('stat-membros').textContent = totalMembros || 0;
  document.getElementById('stat-posts').textContent = posts.count || 0;
  document.getElementById('stat-online').textContent = onlineNow.count || 0;

  // Contagens por tópico
  const topicos = ['dica','duvida','parceria','conquista','discussao'];
  for (const t of topicos) {
    const { count } = await sb.from('posts').select('*',{count:'exact',head:true}).eq('topico', t);
    const el = document.getElementById('count-' + t);
    if (el) el.textContent = (count || 0) + ' publicações';
  }
}

// ─── Online Members ───────────────────────────────────
async function loadOnlineMembers() {
  const cutoff = new Date(Date.now() - 10 * 60000).toISOString();
  const { data } = await sb.from('membros').select('id,nome,curso').gte('last_seen', cutoff).limit(8);
  const el = document.getElementById('online-members');
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="online-loading">Nenhum online agora</div>'; return;
  }
  el.innerHTML = data.map(m => `
    <div class="online-item">
      <div class="online-avatar ${avatarColor(m.id)}">${initials(m.nome)}</div>
      <span class="online-name">${m.nome || 'Membro'}</span>
      <div class="online-dot-sm"></div>
    </div>`).join('');
}

// ─── Feed ─────────────────────────────────────────────
async function loadFeed(topicoFilter) {
  const el = document.getElementById('feed-posts');
  el.innerHTML = '<div class="feed-loading">Carregando publicações...</div>';

  let query = sb.from('posts')
    .select('*, membros(id,nome,curso)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (topicoFilter) query = query.eq('topico', topicoFilter);

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    el.innerHTML = '<div class="feed-loading">Nenhuma publicação ainda. Seja o primeiro!</div>'; return;
  }
  el.innerHTML = data.map(p => renderPost(p)).join('');
}

function renderPost(p) {
  const m = p.membros || {};
  const name = m.nome || 'Membro';
  const course = m.curso || '';
  const col = avatarColor(m.id || p.autor_id);
  const ini = initials(name);
  const dt = formatDate(p.created_at);
  const pill = p.topico ? `<div class="post-pill">${topicoLabel(p.topico)}</div>` : '';
  const isLiked = (p.likes_ids || []).includes(currentUser?.id);

  return `<div class="feed-post" id="post-${p.id}">
    <div class="post-header">
      <div class="post-av ${col}">${ini}</div>
      <div>
        <div class="post-meta-name">${escHtml(name)}</div>
        <div class="post-meta-info">${escHtml(course)} · ${dt}</div>
      </div>
    </div>
    ${pill}
    <div class="post-body" onclick="openPost('${p.id}')">${escHtml(p.conteudo)}</div>
    <div class="post-footer">
      <button class="react-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${p.id}', this)">
        👏 ${p.likes || 0}
      </button>
      <button class="react-btn" onclick="openPost('${p.id}')">💬 ${p.comentarios || 0}</button>
      <button class="react-btn" onclick="sharePost('${p.id}')">🔗</button>
    </div>
  </div>`;
}

async function publishPost() {
  const content = document.getElementById('post-content').value.trim();
  const topico = document.getElementById('post-topico').value;
  if (!content) return;
  if (!currentUser) return;

  const { error } = await sb.from('posts').insert({
    autor_id: currentUser.id,
    conteudo: content,
    topico: topico || null,
    likes: 0,
    likes_ids: [],
    comentarios: 0,
    created_at: new Date().toISOString()
  });

  if (!error) {
    document.getElementById('post-content').value = '';
    document.getElementById('post-topico').value = '';
    loadFeed(currentFilterTopico);
    loadStats();
  }
}

async function toggleLike(postId, btn) {
  const { data: post } = await sb.from('posts').select('likes,likes_ids').eq('id', postId).single();
  if (!post) return;
  let ids = post.likes_ids || [];
  let likes = post.likes || 0;
  const userId = currentUser.id;

  if (ids.includes(userId)) {
    ids = ids.filter(i => i !== userId);
    likes = Math.max(0, likes - 1);
    btn.classList.remove('liked');
  } else {
    ids.push(userId);
    likes++;
    btn.classList.add('liked');
  }
  await sb.from('posts').update({ likes, likes_ids: ids }).eq('id', postId);
  btn.innerHTML = '👏 ' + likes;
}

function sharePost(postId) {
  const url = window.location.href.split('#')[0] + '#post-' + postId;
  navigator.clipboard?.writeText(url);
  alert('Link copiado para a área de transferência!');
}

// ─── Modal de post + comentários ──────────────────────
async function openPost(postId) {
  currentModalPostId = postId;
  const modal = document.getElementById('modal-post');
  const contentEl = document.getElementById('modal-content');
  const commentsEl = document.getElementById('modal-comments-list');

  modal.classList.add('open');
  contentEl.innerHTML = '<div class="feed-loading">Carregando...</div>';
  commentsEl.innerHTML = '';

  const [{ data: post }, { data: comments }] = await Promise.all([
    sb.from('posts').select('*, membros(id,nome,curso)').eq('id', postId).single(),
    sb.from('comentarios').select('*, membros(id,nome)').eq('post_id', postId).order('created_at')
  ]);

  if (post) contentEl.innerHTML = renderPost(post);
  if (comments && comments.length > 0) {
    commentsEl.innerHTML = comments.map(c => {
      const m = c.membros || {};
      const col = avatarColor(m.id || c.autor_id);
      return `<div class="comment-item">
        <div class="comment-av ${col}">${initials(m.nome)}</div>
        <div>
          <div class="comment-author">${escHtml(m.nome || 'Membro')} · ${formatDate(c.created_at)}</div>
          <div class="comment-body">${escHtml(c.conteudo)}</div>
        </div>
      </div>`;
    }).join('');
  } else {
    commentsEl.innerHTML = '<div class="feed-loading" style="padding:10px">Nenhum comentário ainda.</div>';
  }
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-post')) {
    document.getElementById('modal-post').classList.remove('open');
  }
}

async function postComment() {
  const content = document.getElementById('modal-comment-input').value.trim();
  if (!content || !currentModalPostId || !currentUser) return;

  await sb.from('comentarios').insert({
    post_id: currentModalPostId,
    autor_id: currentUser.id,
    conteudo: content,
    created_at: new Date().toISOString()
  });
  // Incrementar contador
  const { data: post } = await sb.from('posts').select('comentarios').eq('id', currentModalPostId).single();
  if (post) await sb.from('posts').update({ comentarios: (post.comentarios || 0) + 1 }).eq('id', currentModalPostId);

  document.getElementById('modal-comment-input').value = '';
  openPost(currentModalPostId);
}

// ─── Membros ──────────────────────────────────────────
async function loadMembros() {
  const { data } = await sb.from('membros').select('*').order('created_at');
  allMembros = data || [];
  renderMembros(allMembros);
}

function renderMembros(list) {
  const el = document.getElementById('membros-grid');
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="feed-loading">Nenhum membro encontrado.</div>'; return;
  }
  const cutoff = new Date(Date.now() - 10 * 60000).toISOString();
  el.innerHTML = list.map(m => {
    const online = m.last_seen && m.last_seen > cutoff;
    const col = avatarColor(m.id);
    return `<div class="membro-card">
      <div class="membro-av ${col}">${initials(m.nome)}</div>
      <div class="membro-name">${escHtml(m.nome || 'Membro')}</div>
      <div class="membro-course">${escHtml(m.curso || '--')}</div>
      <div class="membro-grau">${escHtml(m.grau_instrucao || '')}</div>
      ${online ? '<div class="membro-badge-online">● Online</div>' : ''}
    </div>`;
  }).join('');
}

function filterMembros(q) {
  const term = q.toLowerCase();
  const filtered = allMembros.filter(m =>
    (m.nome || '').toLowerCase().includes(term) ||
    (m.curso || '').toLowerCase().includes(term)
  );
  renderMembros(filtered);
}

// ─── Tópicos ──────────────────────────────────────────
function filterByTopico(t) {
  currentFilterTopico = t;
  showPage('feed', document.querySelector('[data-page="feed"]'));
  loadFeed(t);
  // Banner do filtro ativo
  const banner = document.createElement('div');
  banner.style.cssText = 'background:rgba(201,168,76,0.1);border:0.5px solid rgba(201,168,76,0.25);border-radius:8px;padding:8px 14px;font-size:13px;color:#E8C97A;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center';
  banner.innerHTML = `Filtrando: ${topicoLabel(t)} <button onclick="clearFilter(this)" style="background:transparent;border:none;color:#C9A84C;cursor:pointer;font-size:12px">✕ Limpar</button>`;
  const feed = document.getElementById('feed-posts');
  feed.before(banner);
}

function clearFilter(btn) {
  currentFilterTopico = null;
  btn.parentElement.remove();
  loadFeed();
}

// ─── Navigation ───────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) {
    const navItem = document.querySelector(`[data-page="${name}"]`);
    if (navItem) navItem.classList.add('active');
  }
  // Lazy-load ao navegar
  if (name === 'membros') loadMembros();
  if (name === 'feed') loadFeed(currentFilterTopico);
  if (name === 'perfil') updateSidebarUser();
  // Fechar sidebar mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── Helpers ──────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return Math.floor(diff/60) + 'min atrás';
  if (diff < 86400) return Math.floor(diff/3600) + 'h atrás';
  return d.toLocaleDateString('pt-BR');
}

function topicoLabel(t) {
  const map = { dica:'💡 Dica', duvida:'❓ Dúvida', parceria:'🤝 Parceria', conquista:'⭐ Conquista', discussao:'💬 Discussão' };
  return map[t] || t;
}

function setSelectValue(id, val) {
  const el = document.getElementById(id);
  if (!el || !val) return;
  for (let o of el.options) if (o.text === val || o.value === val) { o.selected = true; break; }
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function traducirError(msg) {
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('already registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('Password should be')) return 'Senha fraca: use ao menos 6 caracteres.';
  return msg;
}

function setBtnLoading(tab, loading) {
  const panel = document.getElementById('tab-' + tab);
  const btn = panel.querySelector('.btn-primary');
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  text.style.display = loading ? 'none' : '';
  loader.style.display = loading ? '' : 'none';
}

// Atualizar last_seen a cada 5 minutos
setInterval(async () => {
  if (currentUser) {
    await sb.from('membros').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    loadOnlineMembers();
    loadStats();
  }
}, 5 * 60 * 1000);
