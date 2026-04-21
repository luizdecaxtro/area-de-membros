// =============================================
// ÁREA DE MEMBROS · LOJAS DE CASTRO  v3
// app.js — Feed, Fotos, Notificações, Eventos, Ranking, Posts Fixados
// =============================================
// CONFIGURAÇÃO: substitua as duas linhas abaixo

const SUPABASE_URL = 'https://lmoiiegiceyflgafrygb.supabase.co'; // substituida
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtb2lpZWdpY2V5ZmxnYWZyeWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzY5NzUsImV4cCI6MjA5MjIxMjk3NX0.0O-WhXrHdcifkCuzBl0X7hfbZnVgZv_XJG941LGKc2A'; // ← SUBSTITUiDA

// E-mail do administrador — só esse e-mail pode fixar posts e criar eventos
const ADMIN_EMAIL = 'lojasdecastro@gmail.com';            // ← SUBSTITUA pelo seu e-mail

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Estado global ────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentFilterTopico = null;
let currentModalPostId = null;
let allMembros = [];
let pendingPhotoFile = { signup: null, perfil: null };
let notifInterval = null;

// ─── Cores avatares ───────────────────────────────────
const AV_COLORS = ['av-0','av-1','av-2','av-3','av-4','av-5'];
function avatarColor(str) {
  if (!str) return 'av-0';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}
function avatarHtml(member, size=38) {
  const col = avatarColor(member.id);
  const ini = initials(member.nome);
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size*.37)}px`;
  if (member.avatar_url) {
    return `<div class="post-av ${col}" style="${s};padding:0;overflow:hidden"><img src="${member.avatar_url}" class="av-photo" alt="${escHtml(member.nome)}"></div>`;
  }
  return `<div class="post-av ${col}" style="${s}">${ini}</div>`;
}
function isAdmin() {
  return currentUser && currentUser.email === ADMIN_EMAIL;
}

// ─── Photo preview ────────────────────────────────────
function previewPhoto(context) {
  const input = document.getElementById(context + '-photo-input');
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Foto muito grande! Use uma imagem menor que 2MB.'); return; }
  pendingPhotoFile[context] = file;
  const reader = new FileReader();
  reader.onload = e => {
    if (context === 'signup') {
      document.getElementById('signup-photo-preview').style.display = 'none';
      const img = document.getElementById('signup-photo-img');
      img.src = e.target.result; img.style.display = 'block';
    } else {
      const av = document.getElementById('perfil-avatar-display');
      const img = document.getElementById('perfil-photo-img');
      av.style.display = 'none'; img.src = e.target.result; img.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}
async function uploadPhoto(userId, file) {
  if (!file) return null;
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) { console.error('Upload error:', error); return null; }
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now();
}

// ─── Init ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; await loadProfile(); showApp(); }
  else showScreen('auth');

  sb.auth.onAuthStateChange(async (_ev, session) => {
    if (session && !currentUser) { currentUser = session.user; await loadProfile(); showApp(); }
    else if (!session && currentUser) { currentUser = null; currentProfile = null; showScreen('auth'); }
  });
});

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

async function showApp() {
  showScreen('app');
  updateSidebarUser();
  loadStats();
  loadFeed();
  loadOnlineMembers();
  loadNotifications();
  // Admin: mostrar botão de novo evento
  if (isAdmin()) {
    const btn = document.getElementById('btn-add-evento');
    if (btn) btn.style.display = 'inline-flex';
  }
  // Atualizar notificações a cada 60s
  notifInterval = setInterval(loadNotifications, 60000);
}

// ─── Auth ─────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

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

async function handleSignup() {
  const nome = document.getElementById('signup-nome').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const cel = document.getElementById('signup-cel').value.trim();
  const grau = document.getElementById('signup-grau').value;
  const curso = document.getElementById('signup-curso').value;
  const bio = document.getElementById('signup-bio').value.trim();
  const errEl = document.getElementById('signup-error');
  const okEl = document.getElementById('signup-success');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (!nome || !email || !pass || !grau || !curso) { showError(errEl, 'Preencha todos os campos obrigatórios (*).'); return; }
  if (pass.length < 6) { showError(errEl, 'A senha deve ter no mínimo 6 caracteres.'); return; }
  setBtnLoading('signup', true);

  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nome, cel, grau, curso, bio } } });
  if (error) { setBtnLoading('signup', false); showError(errEl, traducirError(error.message)); return; }

  let avatar_url = '';
  if (data.user && pendingPhotoFile.signup) {
    avatar_url = await uploadPhoto(data.user.id, pendingPhotoFile.signup) || '';
    pendingPhotoFile.signup = null;
  }
  if (data.user) {
    await sb.from('membros').upsert({ id: data.user.id, nome, email, cel, grau_instrucao: grau, curso, bio, avatar_url, created_at: new Date().toISOString() });
  }
  setBtnLoading('signup', false);
  okEl.textContent = '✓ Conta criada! Verifique seu e-mail para confirmar o cadastro.';
  okEl.style.display = 'block';
}

async function handleLogout() {
  if (notifInterval) clearInterval(notifInterval);
  await sb.auth.signOut();
}
async function forgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { alert('Digite seu e-mail primeiro.'); return; }
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
    await sb.from('membros').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
  } else {
    const meta = currentUser.user_metadata || {};
    const { data: novo } = await sb.from('membros').upsert({
      id: currentUser.id, nome: meta.nome || currentUser.email,
      email: currentUser.email, cel: meta.cel || '', grau_instrucao: meta.grau || '',
      curso: meta.curso || '', bio: meta.bio || '', avatar_url: '',
      created_at: new Date().toISOString(), last_seen: new Date().toISOString()
    }).select().single();
    currentProfile = novo;
  }
}

function setAvatarEl(el, member) {
  if (!el) return;
  const col = avatarColor(member.id);
  el.className = el.className.replace(/av-\d/g, '').trim() + ' ' + col;
  if (member.avatar_url) {
    el.innerHTML = `<img src="${member.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    el.textContent = initials(member.nome);
  }
}

function updateSidebarUser() {
  if (!currentProfile) return;
  const name = currentProfile.nome || 'Membro';
  setAvatarEl(document.getElementById('user-avatar-sidebar'), currentProfile);
  setAvatarEl(document.getElementById('composer-avatar'), currentProfile);
  setAvatarEl(document.getElementById('topbar-avatar'), currentProfile);
  document.getElementById('user-name-sidebar').textContent = name;
  document.getElementById('user-course-sidebar').textContent = currentProfile.curso || '--';

  // Perfil page
  const perfilAv = document.getElementById('perfil-avatar-display');
  const perfilImg = document.getElementById('perfil-photo-img');
  perfilAv.className = 'perfil-avatar ' + avatarColor(currentProfile.id);
  if (currentProfile.avatar_url) {
    perfilAv.style.display = 'none'; perfilImg.src = currentProfile.avatar_url; perfilImg.style.display = 'block';
  } else {
    perfilAv.style.display = 'flex'; perfilAv.textContent = initials(name); perfilImg.style.display = 'none';
  }
  document.getElementById('perfil-name-display').textContent = name;
  document.getElementById('perfil-course-display').textContent = currentProfile.curso || '--';
  document.getElementById('perfil-nome').value = currentProfile.nome || '';
  document.getElementById('perfil-cel').value = currentProfile.cel || '';
  document.getElementById('perfil-bio').value = currentProfile.bio || '';
  setSelectValue('perfil-grau', currentProfile.grau_instrucao);
  setSelectValue('perfil-curso', currentProfile.curso);
}

async function saveProfile() {
  const nome = document.getElementById('perfil-nome').value.trim();
  const cel = document.getElementById('perfil-cel').value.trim();
  const grau = document.getElementById('perfil-grau').value;
  const curso = document.getElementById('perfil-curso').value;
  const bio = document.getElementById('perfil-bio').value.trim();
  const msgEl = document.getElementById('perfil-msg');

  let avatar_url = currentProfile.avatar_url || '';
  if (pendingPhotoFile.perfil) {
    const up = await uploadPhoto(currentUser.id, pendingPhotoFile.perfil);
    if (up) { avatar_url = up; pendingPhotoFile.perfil = null; }
  }
  const { error } = await sb.from('membros').update({ nome, cel, grau_instrucao: grau, curso, bio, avatar_url }).eq('id', currentUser.id);
  if (error) { msgEl.textContent = 'Erro: ' + error.message; msgEl.className = 'msg-error'; }
  else { currentProfile = { ...currentProfile, nome, cel, grau_instrucao: grau, curso, bio, avatar_url }; updateSidebarUser(); msgEl.textContent = '✓ Perfil atualizado!'; msgEl.className = 'msg-success'; }
  msgEl.style.display = 'block';
  setTimeout(() => msgEl.style.display = 'none', 4000);
}

// ─── Stats ────────────────────────────────────────────
async function loadStats() {
  const [{ count: m }, { count: p }, { count: o }] = await Promise.all([
    sb.from('membros').select('*',{count:'exact',head:true}),
    sb.from('posts').select('*',{count:'exact',head:true}),
    sb.from('membros').select('*',{count:'exact',head:true}).gte('last_seen', new Date(Date.now()-10*60000).toISOString())
  ]);
  document.getElementById('stat-membros').textContent = m || 0;
  document.getElementById('stat-posts').textContent = p || 0;
  document.getElementById('stat-online').textContent = o || 0;
  for (const t of ['dica','duvida','parceria','conquista','discussao']) {
    const { count } = await sb.from('posts').select('*',{count:'exact',head:true}).eq('topico',t);
    const el = document.getElementById('count-'+t);
    if (el) el.textContent = (count||0) + ' publicações';
  }
}

// ─── Online ───────────────────────────────────────────
async function loadOnlineMembers() {
  const cutoff = new Date(Date.now()-10*60000).toISOString();
  const { data } = await sb.from('membros').select('id,nome,curso,avatar_url').gte('last_seen',cutoff).limit(8);
  const el = document.getElementById('online-members');
  if (!data||data.length===0){el.innerHTML='<div class="online-loading">Nenhum online agora</div>';return;}
  el.innerHTML = data.map(m=>{
    const col=avatarColor(m.id);
    const av=m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(m.nome);
    return `<div class="online-item"><div class="online-avatar ${col}">${av}</div><span class="online-name">${escHtml(m.nome||'Membro')}</span><div class="online-dot-sm"></div></div>`;
  }).join('');
}

// ─── NOTIFICAÇÕES ─────────────────────────────────────
let notifData = [];

async function loadNotifications() {
  if (!currentUser) return;
  const { data } = await sb.from('notificacoes')
    .select('*')
    .eq('dest_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);
  notifData = data || [];
  renderNotifications();
}

function renderNotifications() {
  const unread = notifData.filter(n => !n.lida).length;
  ['notif-badge','notif-badge-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (unread > 0) { el.textContent = unread > 9 ? '9+' : unread; el.style.display = 'block'; }
    else el.style.display = 'none';
  });
  const listEl = document.getElementById('notif-list');
  if (!notifData.length) { listEl.innerHTML = '<div class="notif-empty">Nenhuma notificação ainda</div>'; return; }
  listEl.innerHTML = notifData.map(n => {
    const col = avatarColor(n.autor_id || '');
    const dot = !n.lida ? '<div class="notif-dot"></div>' : '';
    return `<div class="notif-item ${n.lida?'':'unread'}" onclick="goToNotif('${n.post_id||''}','${n.id}')">
      <div class="notif-av ${col}">${n.autor_ini||'?'}</div>
      <div class="notif-text"><strong>${escHtml(n.autor_nome||'Alguém')}</strong> ${escHtml(n.mensagem||'')}
        <div class="notif-time">${formatDate(n.created_at)}</div>
      </div>
      ${dot}
    </div>`;
  }).join('');
}

async function goToNotif(postId, notifId) {
  await sb.from('notificacoes').update({ lida: true }).eq('id', notifId);
  closeNotifs();
  if (postId) openPost(postId);
  loadNotifications();
}

async function markAllRead() {
  if (!currentUser) return;
  await sb.from('notificacoes').update({ lida: true }).eq('dest_id', currentUser.id);
  loadNotifications();
}

function toggleNotifs() {
  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');
  const isOpen = panel.classList.contains('open');
  if (isOpen) { panel.classList.remove('open'); overlay.style.display = 'none'; }
  else { panel.classList.add('open'); overlay.style.display = 'block'; loadNotifications(); }
}
function closeNotifs() {
  document.getElementById('notif-panel').classList.remove('open');
  document.getElementById('notif-overlay').style.display = 'none';
}

async function createNotif(destId, mensagem, postId) {
  if (!currentUser || destId === currentUser.id) return;
  await sb.from('notificacoes').insert({
    dest_id: destId,
    autor_id: currentUser.id,
    autor_nome: currentProfile?.nome || 'Alguém',
    autor_ini: initials(currentProfile?.nome || ''),
    mensagem,
    post_id: postId || null,
    lida: false,
    created_at: new Date().toISOString()
  });
}

// ─── POST FIXADO (admin) ──────────────────────────────
async function loadPinnedPost() {
  const { data } = await sb.from('posts').select('*, membros(id,nome,curso,avatar_url)')
    .eq('fixado', true).limit(1).single();
  const area = document.getElementById('pinned-post-area');
  if (!data || !area) return;
  area.innerHTML = `<div class="pinned-post">
    <div class="pinned-label">📌 Aviso importante</div>
    ${renderPost(data)}
  </div>`;
  // Admin: botão de desafixar
  if (isAdmin()) {
    area.innerHTML += `<button class="btn-admin" style="margin-bottom:12px" onclick="unpinPost('${data.id}')">Remover fixação</button>`;
  }
}

async function pinPost(postId) {
  await sb.from('posts').update({ fixado: false }).neq('id', postId);
  await sb.from('posts').update({ fixado: true }).eq('id', postId);
  loadPinnedPost(); loadFeed();
}
async function unpinPost(postId) {
  await sb.from('posts').update({ fixado: false }).eq('id', postId);
  document.getElementById('pinned-post-area').innerHTML = '';
}

// ─── Feed ─────────────────────────────────────────────
async function loadFeed(topicoFilter) {
  const el = document.getElementById('feed-posts');
  el.innerHTML = '<div class="feed-loading">Carregando publicações...</div>';
  loadPinnedPost();

  let query = sb.from('posts').select('*, membros(id,nome,curso,avatar_url)')
    .eq('fixado', false).order('created_at', { ascending: false }).limit(30);
  if (topicoFilter) query = query.eq('topico', topicoFilter);

  const { data, error } = await query;
  if (error||!data||data.length===0){el.innerHTML='<div class="feed-loading">Nenhuma publicação ainda. Seja o primeiro!</div>';return;}
  el.innerHTML = data.map(p => renderPost(p)).join('');
}

function renderPost(p) {
  const m = p.membros || {};
  const name = m.nome || 'Membro';
  const dt = formatDate(p.created_at);
  const pill = p.topico ? `<div class="post-pill">${topicoLabel(p.topico)}</div>` : '';
  const isLiked = (p.likes_ids||[]).includes(currentUser?.id);
  const av = avatarHtml(m, 38);
  const adminPin = isAdmin() && !p.fixado ? `<button class="react-btn" onclick="pinPost('${p.id}')" title="Fixar post">📌</button>` : '';

  return `<div class="feed-post" id="post-${p.id}">
    <div class="post-header">${av}
      <div><div class="post-meta-name">${escHtml(name)}</div><div class="post-meta-info">${escHtml(m.curso||'')} · ${dt}</div></div>
    </div>
    ${pill}
    <div class="post-body" onclick="openPost('${p.id}')">${escHtml(p.conteudo)}</div>
    <div class="post-footer">
      <button class="react-btn ${isLiked?'liked':''}" onclick="toggleLike('${p.id}','${m.id||''}',this)">👏 ${p.likes||0}</button>
      <button class="react-btn" onclick="openPost('${p.id}')">💬 ${p.comentarios||0}</button>
      <button class="react-btn" onclick="sharePost('${p.id}')">🔗</button>
      ${adminPin}
    </div>
  </div>`;
}

async function publishPost() {
  const content = document.getElementById('post-content').value.trim();
  const topico = document.getElementById('post-topico').value;
  if (!content||!currentUser) return;
  await sb.from('posts').insert({
    autor_id: currentUser.id, conteudo: content,
    topico: topico||null, likes: 0, likes_ids: [], comentarios: 0,
    fixado: false, created_at: new Date().toISOString()
  });
  document.getElementById('post-content').value = '';
  document.getElementById('post-topico').value = '';
  loadFeed(currentFilterTopico); loadStats();
}

async function toggleLike(postId, autorId, btn) {
  const { data: post } = await sb.from('posts').select('likes,likes_ids').eq('id',postId).single();
  if (!post) return;
  let ids = post.likes_ids||[]; let likes = post.likes||0;
  if (ids.includes(currentUser.id)) {
    ids=ids.filter(i=>i!==currentUser.id); likes=Math.max(0,likes-1); btn.classList.remove('liked');
  } else {
    ids.push(currentUser.id); likes++;  btn.classList.add('liked');
    if (autorId) createNotif(autorId, 'curtiu sua publicação', postId);
  }
  await sb.from('posts').update({ likes, likes_ids: ids }).eq('id', postId);
  btn.innerHTML = '👏 ' + likes;
}

function sharePost(postId) {
  const url = window.location.href.split('#')[0] + '#post-' + postId;
  navigator.clipboard?.writeText(url);
  alert('Link copiado para a área de transferência!');
}

// ─── Modal post + comentários ─────────────────────────
async function openPost(postId) {
  currentModalPostId = postId;
  const modal = document.getElementById('modal-post');
  modal.classList.add('open');
  document.getElementById('modal-content').innerHTML = '<div class="feed-loading">Carregando...</div>';
  document.getElementById('modal-comments-list').innerHTML = '';

  const [{ data: post }, { data: comments }] = await Promise.all([
    sb.from('posts').select('*, membros(id,nome,curso,avatar_url)').eq('id',postId).single(),
    sb.from('comentarios').select('*, membros(id,nome,avatar_url)').eq('post_id',postId).order('created_at')
  ]);

  if (post) document.getElementById('modal-content').innerHTML = renderPost(post);
  if (comments&&comments.length) {
    document.getElementById('modal-comments-list').innerHTML = comments.map(c=>{
      const m=c.membros||{}; const col=avatarColor(m.id||c.autor_id);
      const av=m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(m.nome);
      return `<div class="comment-item"><div class="comment-av ${col}">${av}</div>
        <div><div class="comment-author">${escHtml(m.nome||'Membro')} · ${formatDate(c.created_at)}</div>
        <div class="comment-body">${escHtml(c.conteudo)}</div></div></div>`;
    }).join('');
  } else {
    document.getElementById('modal-comments-list').innerHTML = '<div class="feed-loading" style="padding:10px">Nenhum comentário ainda.</div>';
  }
}

function closeModal(e) {
  if (e.target===document.getElementById('modal-post')) document.getElementById('modal-post').classList.remove('open');
}

async function postComment() {
  const content = document.getElementById('modal-comment-input').value.trim();
  if (!content||!currentModalPostId||!currentUser) return;
  await sb.from('comentarios').insert({ post_id: currentModalPostId, autor_id: currentUser.id, conteudo: content, created_at: new Date().toISOString() });
  const { data: post } = await sb.from('posts').select('comentarios,autor_id').eq('id',currentModalPostId).single();
  if (post) {
    await sb.from('posts').update({ comentarios: (post.comentarios||0)+1 }).eq('id',currentModalPostId);
    createNotif(post.autor_id, 'comentou na sua publicação', currentModalPostId);
  }
  document.getElementById('modal-comment-input').value = '';
  openPost(currentModalPostId);
}

// ─── Membros ──────────────────────────────────────────
async function loadMembros() {
  const { data } = await sb.from('membros').select('*').order('created_at');
  allMembros = data||[];
  renderMembros(allMembros);
}
function renderMembros(list) {
  const el = document.getElementById('membros-grid');
  if (!list||!list.length){el.innerHTML='<div class="feed-loading">Nenhum membro encontrado.</div>';return;}
  const cutoff = new Date(Date.now()-10*60000).toISOString();
  el.innerHTML = list.map(m=>{
    const online=m.last_seen&&m.last_seen>cutoff;
    const col=avatarColor(m.id);
    const av=m.avatar_url?`<img src="${m.avatar_url}" class="av-photo" alt="${escHtml(m.nome)}">`:initials(m.nome);
    return `<div class="membro-card"><div class="membro-av ${col}" style="overflow:hidden">${av}</div>
      <div class="membro-name">${escHtml(m.nome||'Membro')}</div>
      <div class="membro-course">${escHtml(m.curso||'--')}</div>
      <div class="membro-grau">${escHtml(m.grau_instrucao||'')}</div>
      ${online?'<div class="membro-badge-online">● Online</div>':''}
    </div>`;
  }).join('');
}
function filterMembros(q) {
  const t=q.toLowerCase();
  renderMembros(allMembros.filter(m=>(m.nome||'').toLowerCase().includes(t)||(m.curso||'').toLowerCase().includes(t)));
}

// ─── Tópicos ──────────────────────────────────────────
function filterByTopico(t) {
  currentFilterTopico=t;
  showPage('feed', document.querySelector('[data-page="feed"]'));
  loadFeed(t);
  const banner=document.createElement('div');
  banner.style.cssText='background:rgba(201,168,76,0.1);border:0.5px solid rgba(201,168,76,0.25);border-radius:8px;padding:8px 14px;font-size:13px;color:#E8C97A;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center';
  banner.innerHTML=`Filtrando: ${topicoLabel(t)} <button onclick="clearFilter(this)" style="background:transparent;border:none;color:#C9A84C;cursor:pointer;font-size:12px">✕ Limpar</button>`;
  document.getElementById('feed-posts').before(banner);
}
function clearFilter(btn) { currentFilterTopico=null; btn.parentElement.remove(); loadFeed(); }

// ─── EVENTOS ──────────────────────────────────────────
async function loadEventos() {
  const el = document.getElementById('eventos-list');
  el.innerHTML = '<div class="feed-loading">Carregando eventos...</div>';
  const { data } = await sb.from('eventos').select('*').order('data_hora', { ascending: true });
  if (!data||!data.length) { el.innerHTML='<div class="eventos-empty">📅 Nenhum evento agendado ainda.<br>Fique de olho nas novidades!</div>'; return; }

  const now = new Date();
  const futuros = data.filter(e => new Date(e.data_hora) >= now);
  const passados = data.filter(e => new Date(e.data_hora) < now);

  let html = '';
  if (futuros.length) {
    html += '<div class="eventos-section-title">Próximos eventos</div>';
    html += futuros.map(e => renderEvento(e, false)).join('');
  }
  if (passados.length) {
    html += '<div class="eventos-section-title">Eventos anteriores</div>';
    html += passados.map(e => renderEvento(e, true)).join('');
  }
  el.innerHTML = html;
}

function renderEvento(e, passado) {
  const d = new Date(e.data_hora);
  const dia = d.getDate().toString().padStart(2,'0');
  const mes = d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
  const hora = d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const linkBtn = e.link ? `<a href="${escHtml(e.link)}" target="_blank" class="btn-evento-link">▶ Acessar evento</a>` : '';
  const cursoTag = e.curso ? `<span class="evento-tag curso">📚 ${escHtml(e.curso)}</span>` : '<span class="evento-tag">📚 Todos os cursos</span>';
  const adminDel = isAdmin() ? `<button class="btn-admin" style="margin-left:auto" onclick="deleteEvento('${e.id}')">Excluir</button>` : '';

  return `<div class="evento-card ${passado?'passado':''}">
    <div class="evento-date-box"><div class="evento-dia">${dia}</div><div class="evento-mes">${mes}</div></div>
    <div class="evento-info">
      <div class="evento-titulo">${escHtml(e.titulo)}</div>
      <div class="evento-desc">${escHtml(e.descricao||'')}</div>
      <div class="evento-meta">
        <span class="evento-tag">🕐 ${hora}</span>
        ${cursoTag}
        ${linkBtn}
        ${adminDel}
      </div>
      ${passado ? '<div style="font-size:11px;color:var(--text-dim);margin-top:6px">Evento encerrado</div>' : ''}
    </div>
  </div>`;
}

function openEventoModal() { document.getElementById('modal-evento').classList.add('open'); }
function closeEventoModal(e) {
  if (e.target===document.getElementById('modal-evento')) document.getElementById('modal-evento').classList.remove('open');
}
async function saveEvento() {
  const titulo = document.getElementById('ev-titulo').value.trim();
  const desc = document.getElementById('ev-desc').value.trim();
  const data = document.getElementById('ev-data').value;
  const hora = document.getElementById('ev-hora').value;
  const link = document.getElementById('ev-link').value.trim();
  const curso = document.getElementById('ev-curso').value;
  const errEl = document.getElementById('ev-error');
  errEl.style.display = 'none';

  if (!titulo||!data||!hora) { showError(errEl,'Preencha título, data e horário.'); return; }

  const data_hora = new Date(`${data}T${hora}:00`).toISOString();
  const { error } = await sb.from('eventos').insert({ titulo, descricao: desc, data_hora, link, curso, criado_por: currentUser.id, created_at: new Date().toISOString() });
  if (error) { showError(errEl, error.message); return; }
  document.getElementById('modal-evento').classList.remove('open');
  loadEventos();
}
async function deleteEvento(id) {
  if (!confirm('Excluir este evento?')) return;
  await sb.from('eventos').delete().eq('id', id);
  loadEventos();
}

// ─── RANKING ──────────────────────────────────────────
async function loadRanking() {
  const el = document.getElementById('ranking-list');
  el.innerHTML = '<div class="feed-loading">Calculando ranking...</div>';

  const [{ data: membros }, { data: posts }, { data: comentarios }] = await Promise.all([
    sb.from('membros').select('id,nome,curso,avatar_url'),
    sb.from('posts').select('autor_id,likes'),
    sb.from('comentarios').select('autor_id')
  ]);

  if (!membros) { el.innerHTML = '<div class="feed-loading">Erro ao carregar ranking.</div>'; return; }

  // Calcular pontos: 3 por post, 1 por comentário, 1 por curtida recebida
  const pts = {};
  membros.forEach(m => pts[m.id] = { posts: 0, likes: 0, comentarios: 0 });
  (posts||[]).forEach(p => { if (pts[p.autor_id]) { pts[p.autor_id].posts++; pts[p.autor_id].likes += (p.likes||0); } });
  (comentarios||[]).forEach(c => { if (pts[c.autor_id]) pts[c.autor_id].comentarios++; });

  const ranked = membros.map(m => ({
    ...m,
    total: (pts[m.id]?.posts||0)*3 + (pts[m.id]?.comentarios||0) + (pts[m.id]?.likes||0),
    posts: pts[m.id]?.posts||0,
    comentarios: pts[m.id]?.comentarios||0,
    likes: pts[m.id]?.likes||0
  })).sort((a,b) => b.total - a.total);

  const medals = ['🥇','🥈','🥉'];
  const medalClass = ['rank-medal-1','rank-medal-2','rank-medal-3'];
  const itemClass = ['top1','top2','top3'];

  el.innerHTML = ranked.map((m, i) => {
    const col = avatarColor(m.id);
    const av = m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(m.nome);
    const posHtml = i < 3
      ? `<span class="${medalClass[i]}">${medals[i]}</span>`
      : `<span class="rank-pos-num">${i+1}º</span>`;
    const isMe = currentUser && m.id === currentUser.id;
    return `<div class="ranking-item ${itemClass[i]||''}" ${isMe?'style="border-color:rgba(201,168,76,0.5)"':''}>
      <div class="rank-pos">${posHtml}</div>
      <div class="rank-av ${col}">${av}</div>
      <div class="rank-info">
        <div class="rank-name">${escHtml(m.nome||'Membro')} ${isMe?'<span style="font-size:11px;color:var(--gold-light)">(você)</span>':''}</div>
        <div class="rank-course">${escHtml(m.curso||'--')}</div>
        <div class="rank-breakdown">${m.posts} posts · ${m.comentarios} comentários · ${m.likes} curtidas recebidas</div>
      </div>
      <div class="rank-pts">
        <div class="rank-pts-num">${m.total}</div>
        <div class="rank-pts-lbl">pontos</div>
      </div>
    </div>`;
  }).join('');
}

// ─── Navigation ───────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const navItem = document.querySelector(`[data-page="${name}"]`);
  if (navItem) navItem.classList.add('active');
  if (name==='membros') loadMembros();
  if (name==='feed') loadFeed(currentFilterTopico);
  if (name==='perfil') updateSidebarUser();
  if (name==='eventos') loadEventos();
  if (name==='ranking') loadRanking();
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ─── Helpers ──────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  if (!iso) return '';
  const d=new Date(iso), now=new Date(), diff=Math.floor((now-d)/1000);
  if (diff<60) return 'agora mesmo';
  if (diff<3600) return Math.floor(diff/60)+'min atrás';
  if (diff<86400) return Math.floor(diff/3600)+'h atrás';
  return d.toLocaleDateString('pt-BR');
}
function topicoLabel(t) {
  return {dica:'💡 Dica',duvida:'❓ Dúvida',parceria:'🤝 Parceria',conquista:'⭐ Conquista',discussao:'💬 Discussão'}[t]||t;
}
function setSelectValue(id,val) {
  const el=document.getElementById(id); if (!el||!val) return;
  for (let o of el.options) if (o.text===val||o.value===val){o.selected=true;break;}
}
function showError(el,msg){el.textContent=msg;el.style.display='block';}
function traducirError(msg) {
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('already registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('Password should be')) return 'Senha fraca: use ao menos 6 caracteres.';
  return msg;
}
function setBtnLoading(tab, loading) {
  const btn = document.getElementById('tab-'+tab).querySelector('.btn-primary');
  btn.disabled=loading;
  btn.querySelector('.btn-text').style.display=loading?'none':'';
  btn.querySelector('.btn-loader').style.display=loading?'':'none';
}

setInterval(async()=>{
  if (currentUser){
    await sb.from('membros').update({last_seen:new Date().toISOString()}).eq('id',currentUser.id);
    loadOnlineMembers(); loadStats();
  }
}, 5*60*1000);
