// Lego Game Set 1 — 現在未來式 only.
(function () {
  'use strict';

  window.rgToggleFont = function () {
    const on = document.body.classList.toggle('rg-modern-font');
    try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch (_) {}
  };
  try { if (localStorage.getItem('rg_modern_font') === '1') document.body.classList.add('rg-modern-font'); } catch (_) {}

  const APP_KEY = 'lego_set1_session_v1';
  const MODE_NAMES = { positive: '肯定句', negative: '否定句', question: '問句' };
  const $ = (selector) => document.querySelector(selector);
  if (!$('#lego-set1-app')) return;
  const W = (th, zh, extra) => Object.assign({ th, zh: zh || '' }, extra || {});
  const POOLS = {
    subject: [
      W('ผม', '我（男）', { groups: ['positive'] }), W('ดิฉัน', '我（女）', { groups: ['positive'] }),
      W('เรา', '我／我們', { groups: ['positive', 'question'] }), W('หนู', '我（女）', { groups: ['positive'] }),
      W('กู', '我', { groups: ['positive'], noPolite: true }), W('เค้า', '我', { groups: ['positive'] }),
      W('คุณ', '你', { groups: ['question'] }), W('เธอ', '你', { groups: ['question'] }),
      W('แก', '你', { groups: ['question'] }), W('มึง', '你', { groups: ['question'] }),
      W('ตัวเอง', '你', { groups: ['question'] }), W('เขา', '他／她', { groups: ['positive', 'question'] }),
      W('มัน', '它', { groups: ['positive', 'question'] }), W('พี่', '哥／姐', { groups: ['positive', 'question'] }),
      W('ป้า', '阿姨', { groups: ['positive', 'question'] }), W('น้า', '舅／姨', { groups: ['positive', 'question'] })
    ],
    negative: [W('ไม่', '不'), W('ไม่ได้', '並沒有'), W('จะไม่', '將不'), W('ต้องไม่', '不可以')],
    grammar: [
      W('อยาก', '想', { next: 'verb' }), W('จะ', '會／要', { next: 'verb' }),
      W('กำลังจะ', '正要', { next: 'verb' }), W('กำลัง', '正在', { next: 'verb' }),
      W('ต้อง', '必須', { next: 'verb' }), W('ชอบ', '喜歡', { next: 'either' }),
      W('ต้องการ', '需要／想要', { next: 'either' }), W('อยากได้', '想要', { next: 'noun' }),
      W('เอา', '要／拿', { next: 'noun' }), W('ใช้文法 หลัง', '使用後置文法', { next: 'verb', rearOnly: true })
    ],
    verb: [
      W('กิน', '吃'), W('ไป', '去', { destination: true }), W('ไปกิน', '去吃'), W('นอน', '睡'),
      W('ไปนอน', '去睡'), W('ซื้อ', '買'), W('ไปซื้อ', '去買'), W('ดื่ม', '喝'),
      W('ดู', '看'), W('อ่าน', '讀'), W('เล่น', '玩'), W('ทำงาน', '工作')
    ],
    noun: [W('ข้าว', '飯'), W('ขนม', '點心'), W('ผลไม้', '水果'), W('น้ำ', '水'), W('กาแฟ', '咖啡'), W('หนัง', '電影'), W('เพลง', '歌'), W('หนังสือ', '書'), W('เสื้อ', '衣服'), W('รองเท้า', '鞋子'), W('กระเป๋า', '包包'), W('ตั๋ว', '票')],
    destination: [W('กรุงเทพ', '曼谷'), W('ห้าง', '商場'), W('บ้านเพื่อน', '朋友家'), W('เซเว่น', '7-Eleven'), W('ร้านอาหาร', '餐廳')],
    question: [W('หรือเปล่า', '是不是'), W('ไหม', '嗎'), W('หรือยัง', '了嗎'), W('เหรอ', '嗎／真的嗎')],
    adverb: [W('ที่', '在'), W('กับ', '和／跟')],
    adverbObject: [W('บ้าน', '家'), W('ห้าง', '商場'), W('ร้านอาหาร', '餐廳'), W('แม่', '媽媽'), W('พ่อ', '爸爸'), W('เพื่อน', '朋友'), W('แฟน', '伴侶')],
    post: [W('อยู่', '正在'), W('แล้ว', '已經')],
    particle: [W('นะ', '語氣詞'), W('อะ', '語氣詞')],
    polite: [W('ครับ', '男用敬語'), W('ครับผม', '男用敬語'), W('ค่ะ', '女用敬語'), W('คะ', '女用問句敬語')],
    time: [W('ตอนนี้', '現在'), W('วันนี้', '今天'), W('พรุ่งนี้', '明天'), W('เมื่อวาน', '昨天'), W('เดี๋ยว', '待會')]
  };

  function freshState() {
    return {
      mode: 'positive',
      values: { time: null, subject: null, negative: null, grammar: null, question: null, post: null, particle: null, polite: null },
      verbs: [{ verb: null, object: null }], adverbs: [], postRemoved: false,
      active: { type: 'subject', index: null }, confirmed: []
    };
  }
  let state = freshState();

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function save() { try { localStorage.setItem(APP_KEY, JSON.stringify(state)); } catch (_) {} }
  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_KEY));
      if (!parsed || !MODE_NAMES[parsed.mode] || !Array.isArray(parsed.verbs) || !Array.isArray(parsed.confirmed)) return false;
      state = Object.assign(freshState(), parsed);
      state.values = Object.assign(freshState().values, parsed.values || {});
      state.adverbs = Array.isArray(parsed.adverbs) ? parsed.adverbs : [];
      return state.confirmed.length > 0 || sentenceWords().length > 0;
    } catch (_) { return false; }
  }

  const text = (value) => value && value.th ? value.th : '';
  function slotValue(type, index) {
    if (type === 'verb' || type === 'object') return state.verbs[index] && state.verbs[index][type];
    if (type === 'adverb' || type === 'adverbObject') {
      const row = state.adverbs[index];
      return row ? (type === 'adverb' ? row.type : row.object) : null;
    }
    return state.values[type] || null;
  }
  function setSlot(type, index, value) {
    if (type === 'verb' || type === 'object') state.verbs[index][type] = value;
    else if (type === 'adverb' || type === 'adverbObject') {
      if (!state.adverbs[index]) state.adverbs[index] = { type: null, object: null };
      if (type === 'adverb') { state.adverbs[index].type = value; state.adverbs[index].object = null; }
      else state.adverbs[index].object = value;
    } else state.values[type] = value;
  }
  function compoundNegative() { return ['จะไม่', 'ต้องไม่'].includes(text(state.values.negative)); }
  function nounGrammar() {
    const grammar = text(state.values.grammar);
    return ['อยากได้', 'เอา'].includes(grammar) || (['ชอบ', 'ต้องการ'].includes(grammar) && state.verbs[0] && state.verbs[0].verb && state.verbs[0].verb.kind === 'noun');
  }

  function normalize() {
    if (state.mode === 'positive') state.values.negative = null;
    if (state.mode !== 'question') state.values.question = null;
    if (compoundNegative()) state.values.grammar = null;
    const grammar = text(state.values.grammar);
    if (grammar === 'กำลัง' && !state.values.post && !state.postRemoved) state.values.post = W('อยู่', '正在');
    if (grammar === 'ใช้文法 หลัง') state.values.post = W('อยู่', '正在');
    if (!['กำลัง', 'ใช้文法 หลัง'].includes(grammar) && text(state.values.post) === 'อยู่') state.values.post = null;
    if (state.values.subject && !(state.values.subject.groups || []).includes(state.mode === 'question' ? 'question' : 'positive')) state.values.subject = null;
    if (text(state.values.subject) === 'กู') state.values.polite = null;
    if (!state.verbs.length) state.verbs.push({ verb: null, object: null });
  }

  function activeKey() { return `${state.active.type}:${state.active.index == null ? '' : state.active.index}`; }
  function activate(type, index) { state.active = { type, index: index == null ? null : index }; render(); }
  function makeSlot(type, label, index, note) {
    const value = slotValue(type, index);
    const wrap = document.createElement('div'); wrap.className = 'lego-slot';
    const key = `${type}:${index == null ? '' : index}`;
    wrap.innerHTML = `<span class="lego-slot-label">${label}</span><button type="button" class="lego-slot-button${activeKey() === key ? ' is-active' : ''}"><b>${text(value) || '＋'}</b>${note ? `<small>${note}</small>` : ''}</button>`;
    wrap.querySelector('button').addEventListener('click', () => activate(type, index));
    return wrap;
  }

  function renderStructure() {
    const core = $('#lego-core-row'); core.innerHTML = '';
    core.appendChild(makeSlot('subject', '主詞', null));
    if (state.mode !== 'positive') core.appendChild(makeSlot('negative', '否定', null, state.mode === 'question' ? '可選' : '必選'));
    core.appendChild(makeSlot('grammar', '文法', null, compoundNegative() ? 'ตาม否定' : '必選'));
    const blocks = $('#lego-verb-blocks'); blocks.innerHTML = '';
    state.verbs.forEach((row, index) => {
      const group = document.createElement('div'); group.className = 'lego-verb-group';
      group.appendChild(makeSlot('verb', nounGrammar() && index === 0 ? '名詞' : '動詞', index, index ? `ก้อน ${index + 1}` : 'ใส่เองได้'));
      group.appendChild(makeSlot('object', '受詞', index, 'ใส่เอง / ไม่ใช้'));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'lego-remove-verb'; remove.textContent = '✕'; remove.title = '刪除這個動詞'; remove.disabled = state.verbs.length === 1;
      remove.addEventListener('click', () => { state.verbs.splice(index, 1); activate('verb', Math.max(0, index - 1)); });
      group.appendChild(remove); blocks.appendChild(group);
    });
    if (state.mode === 'question') blocks.appendChild(makeSlot('question', '問句', null, '必選'));

    const extra = $('#lego-extra-row'); extra.innerHTML = '';
    extra.appendChild(makeSlot('time', '時間', null, '選填'));
    state.adverbs.forEach((row, index) => {
      extra.appendChild(makeSlot('adverb', '副詞', index, 'ที่ / กับ'));
      if (row.type) extra.appendChild(makeSlot('adverbObject', text(row.type) === 'ที่' ? '地點' : '誰', index, '名詞 / ใส่เอง'));
    });
    const addAdverb = document.createElement('button');
    addAdverb.type = 'button'; addAdverb.className = 'lego-add-verb'; addAdverb.textContent = '＋ เพิ่ม 副詞';
    addAdverb.addEventListener('click', () => { state.adverbs.push({ type: null, object: null }); activate('adverb', state.adverbs.length - 1); });
    extra.appendChild(addAdverb);
    extra.appendChild(makeSlot('post', '後面文法', null, text(state.values.grammar) === 'กำลัง' ? 'อยู่ เอาออกได้' : '選填'));
    extra.appendChild(makeSlot('particle', '語助詞', null, 'นะ / อะ'));
    extra.appendChild(makeSlot('polite', '禮貌語助詞', null, 'ครับ / ค่ะ'));
  }

  function questionAllowed(word) {
    const grammar = text(state.values.grammar);
    if (state.values.negative) return word.th === 'เหรอ' || (text(state.values.negative) === 'ไม่ได้' && word.th === 'หรือเปล่า');
    if (grammar === 'กำลังจะ' && word.th === 'ไหม') return false;
    if (grammar === 'กำลัง' && word.th === 'หรือยัง') return false;
    if (['ชอบ', 'เอา'].includes(grammar) && word.th === 'หรือยัง') return false;
    return true;
  }
  function pool(type, index) {
    if (type === 'subject') return POOLS.subject.filter((word) => (word.groups || []).includes(state.mode === 'question' ? 'question' : 'positive'));
    if (type === 'negative') return POOLS.negative;
    if (type === 'grammar') {
      if (compoundNegative()) return [];
      const neg = text(state.values.negative);
      return POOLS.grammar.filter((word) => !(neg === 'ไม่' && ['จะ', 'กำลังจะ', 'กำลัง'].includes(word.th)) && !(neg === 'ไม่ได้' && word.th === 'เอา'));
    }
    if (type === 'verb') {
      const grammar = state.values.grammar;
      if (grammar && grammar.next === 'noun' && index === 0) return POOLS.noun.map((word) => Object.assign({}, word, { kind: 'noun' }));
      if (grammar && grammar.next === 'either' && index === 0) return POOLS.verb.concat(POOLS.noun.map((word) => Object.assign({}, word, { kind: 'noun' })));
      return POOLS.verb;
    }
    if (type === 'object') {
      const verb = state.verbs[index] && state.verbs[index].verb;
      return verb && verb.destination ? POOLS.destination : POOLS.noun;
    }
    if (type === 'question') return POOLS.question.filter(questionAllowed);
    if (type === 'adverb') return POOLS.adverb;
    if (type === 'adverbObject') return POOLS.adverbObject;
    if (type === 'post') return POOLS.post.filter((word) => text(state.values.grammar) === 'กำลัง' || text(state.values.grammar) === 'ใช้文法 หลัง' ? word.th === 'อยู่' : word.th === 'แล้ว');
    if (type === 'particle') return POOLS.particle;
    if (type === 'polite') {
      if (text(state.values.subject) === 'กู') return [];
      return POOLS.polite.filter((word) => state.mode === 'question' ? word.th !== 'ค่ะ' : word.th !== 'คะ' || text(state.values.particle) === 'นะ');
    }
    if (type === 'time') return POOLS.time;
    return [];
  }

  const skippable = (type) => ['negative', 'object', 'adverb', 'adverbObject', 'post', 'particle', 'polite', 'time'].includes(type);
  const customable = (type) => ['subject', 'verb', 'object', 'adverbObject', 'time'].includes(type);
  function pickerRule(type) {
    if (type === 'grammar') return '文法 ไม่มีปุ่มไม่ใช้; ถ้าไม่ใช้ด้านหน้า ให้เลือก ใช้文法 หลัง';
    if (type === 'verb') return 'เลือกคำหรือกด ใส่เอง; เพิ่ม動詞ได้ไม่จำกัด';
    if (type === 'object') return '受詞 มีทั้ง ใส่เอง และ ไม่ใช้; ไป + สถานที่ ใช้ช่องนี้';
    if (type === 'adverb') return 'เลือก ที่ หรือ กับ แล้วเลือกคำนามช่องถัดไป';
    if (type === 'post' && text(state.values.grammar) === 'กำลัง') return 'กำลัง ใส่ อยู่ ให้ก่อน และเอาออกได้';
    if (type === 'post' && text(state.values.grammar) === 'ใช้文法 หลัง') return 'ใช้文法 หลัง ต้องมี อยู่';
    return 'เลือกคำสำหรับช่องนี้';
  }

  function renderPicker() {
    const { type, index } = state.active;
    const labels = { subject: '主詞', negative: '否定', grammar: '文法', verb: '動詞', object: '受詞', question: '問句', adverb: '副詞', adverbObject: '名詞', post: '後面文法', particle: '語助詞', polite: '禮貌語助詞', time: '時間' };
    $('#lego-picker-title').textContent = `選詞 — ${labels[type] || ''}`;
    $('#lego-picker-rule').textContent = pickerRule(type);
    const grid = $('#lego-choice-grid'); grid.innerHTML = '';
    const selected = slotValue(type, index);
    if (type === 'grammar' && compoundNegative()) grid.innerHTML = '<div class="lego-placeholder">否定คำนี้รวม文法แล้ว ให้เลือก動詞ต่อได้เลย</div>';
    pool(type, index).forEach((word) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = word.th;
      button.setAttribute('aria-pressed', String(text(selected) === word.th));
      button.disabled = usedWords().includes(word.th) && text(selected) !== word.th && !['ที่', 'กับ'].includes(word.th);
      button.addEventListener('click', () => {
        setSlot(type, index, clone(word));
        if (type === 'grammar') state.postRemoved = false;
        if (type === 'post') state.postRemoved = false;
        if (type === 'verb') state.verbs[index].object = null;
        normalize(); save(); render();
      });
      grid.appendChild(button);
    });
    if (skippable(type)) {
      const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'is-skip'; skip.textContent = 'ไม่ใช้'; skip.setAttribute('aria-pressed', String(!selected));
      if (type === 'post' && text(state.values.grammar) === 'ใช้文法 หลัง') skip.disabled = true;
      skip.addEventListener('click', () => {
        if (type === 'adverb' || type === 'adverbObject') state.adverbs.splice(index, 1); else setSlot(type, index, null);
        if (type === 'post' && text(state.values.grammar) === 'กำลัง') state.postRemoved = true;
        save(); render();
      });
      grid.appendChild(skip);
    }
    if (customable(type)) {
      const custom = document.createElement('button'); custom.type = 'button'; custom.textContent = 'ใส่เอง'; custom.className = 'is-skip';
      custom.setAttribute('aria-pressed', String(selected && selected.custom));
      custom.addEventListener('click', () => {
        $('#lego-custom-form').classList.remove('hidden');
        $('#lego-custom-th').value = selected && selected.custom ? selected.th : '';
        $('#lego-custom-zh').value = selected && selected.custom ? selected.zh : '';
        $('#lego-custom-th').focus();
      });
      grid.appendChild(custom);
    }
    $('#lego-custom-form').classList.add('hidden');
  }

  function sentenceWords() {
    const words = [];
    const add = (word, kind) => { if (word && word.th) words.push(Object.assign({}, word, { tokenKind: kind || '' })); };
    add(state.values.time); add(state.values.subject); add(state.values.negative, 'negative'); add(state.values.grammar);
    state.verbs.forEach((row) => { add(row.verb); add(row.object); });
    state.adverbs.forEach((row) => { add(row.type); add(row.object); });
    add(state.values.post); add(state.values.question, 'question'); add(state.values.particle); add(state.values.polite);
    return words;
  }
  const usedWords = () => sentenceWords().map((word) => word.th).filter(Boolean);
  const thai = () => sentenceWords().map((word) => word.th).join(' ');
  const chinese = () => sentenceWords().map((word) => word.zh).filter(Boolean).join('・');
  const hasCustom = () => sentenceWords().some((word) => word.custom);
  function complete() {
    if (!state.values.subject || (!compoundNegative() && !state.values.grammar) || !state.verbs[0] || !state.verbs[0].verb) return false;
    if (state.mode === 'negative' && !state.values.negative) return false;
    if (state.mode === 'question' && !state.values.question) return false;
    return text(state.values.grammar) !== 'ใช้文法 หลัง' || text(state.values.post) === 'อยู่';
  }

  function renderSentence() {
    const line = $('#lego-token-line'); line.innerHTML = '';
    const words = sentenceWords();
    if (!words.length) line.innerHTML = '<span class="lego-placeholder">從「主詞」開始選詞</span>';
    words.forEach((word) => {
      const token = document.createElement('span'); token.className = `lego-token${word.tokenKind ? ` is-${word.tokenKind}` : ''}`; token.textContent = word.th; line.appendChild(token);
    });
    $('#lego-translation').textContent = chinese() || '中文只顯示已提供的內容，系統不會自行推測。';
    $('#lego-complete').disabled = !complete();
    $('#lego-session-count').textContent = `本輪已完成 ${state.confirmed.length} 句`;
  }
  function render() {
    normalize();
    $('#lego-mode-name').textContent = MODE_NAMES[state.mode];
    document.querySelectorAll('#lego-mode-switch [data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    renderStructure(); renderPicker(); renderSentence(); save();
  }
  function show(name) {
    $('#lego-build-screen').classList.toggle('hidden', name !== 'build');
    $('#set1-reveal').classList.toggle('hidden', name !== 'reveal');
    $('#set1-result').classList.toggle('hidden', name !== 'result');
  }
  function resetDraft() {
    const confirmed = state.confirmed, mode = state.mode;
    state = freshState(); state.confirmed = confirmed; state.mode = mode; render();
  }

  var legoQuotaPendingAttempt = null;
  function legoMinimumGuestOnly() { return typeof window.isMinimumGuestOnly === 'function' && window.isMinimumGuestOnly(); }
  function legoQuotaRequestId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    var bytes = new Uint8Array(16);
    try { crypto.getRandomValues(bytes); } catch (_) { for (var i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0; }
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var h = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function legoQuotaOwnerSnapshot() {
    try {
      if (legoMinimumGuestOnly()) return {uid:'minimum-guest',epoch:0};
      var auth = window.SITE_AUTH;
      if (!auth) return null;
      var uid = auth.user && auth.user.id ? String(auth.user.id) : '';
      var bound = auth.learningOwnerId ? String(auth.learningOwnerId) : '';
      if (uid !== bound) return null;
      return { uid: uid, epoch: Number(auth.learningOwnerEpoch) || 0 };
    } catch (_) { return null; }
  }
  function legoQuotaSameOwner(owner) {
    var current = legoQuotaOwnerSnapshot();
    return !!current && current.uid === owner.uid && current.epoch === owner.epoch;
  }
  function legoQuotaAttempt(owner) {
    if (!legoQuotaPendingAttempt || legoQuotaPendingAttempt.uid !== owner.uid || legoQuotaPendingAttempt.epoch !== owner.epoch) {
      legoQuotaPendingAttempt = {requestId:legoQuotaRequestId(),uid:owner.uid,epoch:owner.epoch};
    }
    return legoQuotaPendingAttempt;
  }
  function legoQuotaWait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function legoCheckDailyQuota() {
    try {
      var minimumGuest = legoMinimumGuestOnly();
      var sb = minimumGuest ? (window.getAnonymousSupabaseClient ? window.getAnonymousSupabaseClient() : null) : (window.getSupabaseClient ? window.getSupabaseClient() : null);
      if (!sb || !window.NetworkGuard || typeof NetworkGuard.request !== 'function') return {ok:false,reason:'no_client'};
      var owner = legoQuotaOwnerSnapshot();
      if (!owner) return {ok:false,reason:'owner_unresolved'};
      var attempt = legoQuotaAttempt(owner), headers = {};
      if (!minimumGuest) {
        try {
          var sres = await NetworkGuard.request(function () { return sb.auth.getSession(); }, 'lego-quota-session', {}, 5000, null);
          var session = sres && sres.data && sres.data.session;
          var sessionUid = session && session.user && session.user.id ? String(session.user.id) : '';
          if (sessionUid !== owner.uid || !legoQuotaSameOwner(owner)) return {ok:false,reason:'owner_changed'};
          if (session && session.access_token) headers.Authorization = 'Bearer ' + session.access_token;
        } catch (_) { return {ok:false,reason:'network'}; }
      }
      for(var requestAttempt=0;requestAttempt<2;requestAttempt++){
        var res;
        try {
          res = await NetworkGuard.request(function () { return sb.functions.invoke('lego-daily-limit', {headers:headers,body:{request_id:attempt.requestId}}); }, 'lego-daily-limit', {}, 12000, null);
        } catch (_) {
          if (requestAttempt === 0) { await legoQuotaWait(800); continue; }
          return {ok:false,reason:'network'};
        }
        if(!legoQuotaSameOwner(owner)) return {ok:false,reason:'owner_changed'};
        if (res.error || !res.data) {
          if (requestAttempt === 0) { await legoQuotaWait(800); continue; }
          return {ok:false,reason:'network'};
        }
        if (res.data.requestId !== attempt.requestId || (minimumGuest && res.data.loggedIn !== false)) return {ok:false,reason:'invalid_response'};
        if(legoQuotaPendingAttempt===attempt) legoQuotaPendingAttempt=null;
        return Object.assign({}, res.data, {_owner:owner});
      }
      return {ok:false,reason:'network'};
    } catch (_) { return {ok:false,reason:'network'}; }
  }
  function quotaMessage(quota) {
    if (quota && quota.reason === 'limit') return '今天的造句次數已用完，明天再回來繼續練習。';
    return '連線不穩，暫時無法確認使用次數，請稍後再試。';
  }
  let legoStudyRoundActive = false;
  function legoDispatchStudyRound(name, report) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: { report: report } })); } catch (_) {}
  }

  document.querySelectorAll('#lego-mode-switch [data-mode]').forEach((button) => button.addEventListener('click', () => { state.mode = button.dataset.mode; state.active = { type: 'subject', index: null }; render(); }));
  $('#lego-add-verb').addEventListener('click', () => { state.verbs.push({ verb: null, object: null }); activate('verb', state.verbs.length - 1); });
  $('#lego-clear').addEventListener('click', resetDraft);
  let quotaInFlight = false;
  $('#lego-complete').addEventListener('click', async () => {
    if (!complete()) return;
    if (quotaInFlight) return;
    quotaInFlight = true; $('#lego-complete').disabled = true;
    let quota;
    try { quota = await legoCheckDailyQuota(); } finally { quotaInFlight = false; renderSentence(); }
    if(quota._owner&&!legoQuotaSameOwner(quota._owner)) quota={ok:false,reason:'owner_changed'};
    if (!quota.ok) { window.alert(quotaMessage(quota)); return; }
    if (!legoStudyRoundActive) {
      legoStudyRoundActive = true;
      legoDispatchStudyRound('gsh:round-start', { game_type: 'lego', items: [] });
    }
    const item = { thai: thai(), chinese: chinese(), custom: hasCustom(), mode: state.mode };
    state.confirmed.push(item); save();
    $('#set1-reveal-th').textContent = item.thai;
    $('#set1-reveal-zh').textContent = item.chinese || '未提供中文翻譯';
    $('#set1-reveal-disclaimer').classList.toggle('hidden', !item.custom);
    show('reveal');
    try { if (window.gtag) gtag('event', 'lego_sentence_complete', { category: 'game', mode: state.mode }); } catch (_) {}
  });
  $('#lego-custom-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const th = $('#lego-custom-th').value.trim(); if (!th) return;
    setSlot(state.active.type, state.active.index, W(th, $('#lego-custom-zh').value.trim(), { custom: true }));
    if (state.active.type === 'verb') state.verbs[state.active.index].object = null;
    render();
  });

  window.legoContinueBuilding = function () { resetDraft(); show('build'); };
  window.legoEndGame = function () {
    $('#set1-result-count').textContent = `完成 ${state.confirmed.length} 句`;
    const list = $('#set1-result-list'); list.innerHTML = '';
    if (!state.confirmed.length) list.innerHTML = '<div class="lego-placeholder">本輪還沒有完成的句子</div>';
    state.confirmed.forEach((item) => {
      const row = document.createElement('div'); row.className = 'lego-result-item';
      const title = document.createElement('strong'); title.textContent = item.thai;
      const sub = document.createElement('small'); sub.textContent = item.chinese || '未提供中文翻譯'; row.append(title, sub);
      if (item.custom) { const note = document.createElement('small'); note.textContent = '自訂內容由玩家自行輸入，系統不會檢查或修正內容。'; row.appendChild(note); }
      list.appendChild(row);
    });
    show('result');
    if (legoStudyRoundActive) {
      legoStudyRoundActive = false;
      legoDispatchStudyRound('gsh:round-complete', { game_type: 'lego', items: state.confirmed.map((item) => ({ question: item.thai, is_correct: true, item_score: 0 })) });
    }
    if (window.GameFlow) GameFlow.enhanceResult({ key: 'set1-result', root: $('#set1-result'), actions: '#set1-result .lego-inline-actions', correct: 0, total: state.confirmed.length, showFirstCorrect: false, onReplay: window.legoStartNewSession });
  };
  window.legoStartNewSession = function () { state = freshState(); save(); show('build'); render(); };
  window.legoPrintResult = function () {
    if (window.RoundReport && typeof RoundReport.openPrint === 'function') {
      const report = RoundReport.create({ game_type: 'lego', difficulty: 'set1', mode: 'sentence-builder' });
      state.confirmed.forEach((item) => RoundReport.addItem(report, {
        content_ref: { source: 'game_sentences', key: item.thai }, question: item.thai, meaning: item.chinese || '',
        attempts: [{ answer: item.thai, is_correct: true }], user_answer: item.thai, correct_answer: item.thai,
        is_correct: true, wrong_count: 0, item_score: 0, hint_used: null, linguistic: { custom: !!item.custom }
      }));
      if (RoundReport.openPrint({ gameType: 'lego', report: report, title: '泰語造句練習室 Set 1・本輪報告', documentTitle: '泰語造句練習紀錄', showDifficulty: true, summaryRows: [{ label: '完成', value: state.confirmed.length + ' 句', primary: true }] })) return;
    }
    window.print();
  };
  window.legoResumeContinue = function () { $('#set1-resume-banner').classList.add('hidden'); show('build'); };
  window.legoResumeRestartCurrent = function () { state = freshState(); save(); $('#set1-resume-banner').classList.add('hidden'); show('build'); render(); };
  window.legoResumeNewSession = window.legoResumeRestartCurrent;
  window.dismissHowtoHint = function () {};

  const hasResume = load();
  if (hasResume) { $('#set1-resume-detail').textContent = `已完成 ${state.confirmed.length} 句`; $('#set1-resume-banner').classList.remove('hidden'); }
  show('build'); render();
})();
