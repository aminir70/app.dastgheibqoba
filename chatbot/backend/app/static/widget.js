(function () {
  // ---- config ----
  var script = document.currentScript;
  var API = (script && script.getAttribute("data-api")) ||
            (script ? new URL(script.src).origin : "");
  var TITLE = (script && script.getAttribute("data-title")) || "دستیار پاسخگو";
  var KEY = "rag_user_token";
  var token = localStorage.getItem(KEY) || "";
  var convId = null;   // current conversation (null = new, created on first message)

  // ---- styles ----
  var css = `
  #ragw,#ragw *{box-sizing:border-box;font-family:Vazirmatn,system-ui,Tahoma,sans-serif}
  #ragw{position:fixed;bottom:22px;left:22px;z-index:2147483000;direction:rtl}
  #ragw .fab{width:60px;height:60px;border-radius:50%;background:#0f766e;color:#fff;border:none;
    cursor:pointer;box-shadow:0 8px 26px rgba(15,118,110,.4);font-size:26px;display:grid;place-items:center;transition:.2s}
  #ragw .fab:hover{transform:scale(1.06)}
  #ragw .win{position:absolute;bottom:74px;left:0;width:380px;max-width:calc(100vw - 30px);
    height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:18px;
    box-shadow:0 20px 60px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden}
  #ragw .win.open{display:flex;animation:ragwpop .22s ease}
  @keyframes ragwpop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  #ragw .hd{background:#0f766e;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:8px;position:relative;z-index:6}
  #ragw .hd b{font-size:15px;flex:1}
  #ragw .hd button{background:rgba(255,255,255,.12);border:none;color:#fff;cursor:pointer;
    width:30px;height:30px;border-radius:9px;font-size:16px;display:grid;place-items:center;transition:.15s}
  #ragw .hd button:hover{background:rgba(255,255,255,.25)}
  #ragw .hd button.hidden{display:none}
  #ragw .body{flex:1;overflow-y:auto;padding:16px;background:#f4f1ea}
  #ragw .msg{max-width:86%;padding:10px 13px;border-radius:14px;margin-bottom:10px;font-size:14px;
    line-height:1.85;white-space:pre-wrap;word-break:break-word;clear:both;animation:ragwin .2s ease}
  @keyframes ragwin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  #ragw .msg.bot{background:#fff;border:1px solid #e4ded2;border-top-right-radius:4px;float:right}
  #ragw .msg.user{background:#0f766e;color:#fff;border-top-left-radius:4px;float:left}
  #ragw .msg.err{background:#fbe3e1;border:1px solid #f1c9c5;color:#8a201b;float:right;border-top-right-radius:4px}
  #ragw .src{font-size:11px;color:#6b7b76;margin-top:7px;border-top:1px dashed #e4ded2;padding-top:6px}
  #ragw .dots span{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;
    background:#9bb0ab;animation:ragwblink 1.2s infinite}
  #ragw .dots span:nth-child(2){animation-delay:.2s}
  #ragw .dots span:nth-child(3){animation-delay:.4s}
  @keyframes ragwblink{0%,60%,100%{opacity:.3}30%{opacity:1}}
  #ragw .ft{border-top:1px solid #e4ded2;padding:10px;background:#fff;display:flex;gap:8px}
  #ragw .ft input{flex:1;border:1px solid #e4ded2;border-radius:12px;padding:10px 12px;font-size:14px;outline:none}
  #ragw .ft input:focus{border-color:#0f766e}
  #ragw .ft button{background:#0f766e;color:#fff;border:none;border-radius:12px;padding:0 16px;cursor:pointer;font-size:14px;transition:.15s}
  #ragw .ft button:hover{filter:brightness(1.08)}
  #ragw .ft button:disabled{opacity:.5}
  /* conversations panel */
  #ragw .conv{position:absolute;top:58px;left:0;right:0;bottom:0;background:#fff;z-index:5;
    display:none;flex-direction:column}
  #ragw .conv.open{display:flex;animation:ragwin .18s ease}
  #ragw .conv .ctop{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e4ded2}
  #ragw .conv .ctop b{font-size:14px}
  #ragw .conv .newbtn{background:#0f766e;color:#fff;border:none;border-radius:10px;padding:7px 12px;font-size:13px;cursor:pointer}
  #ragw .conv .clist{flex:1;overflow-y:auto;padding:8px}
  #ragw .citem{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:11px;cursor:pointer;transition:.12s}
  #ragw .citem:hover{background:#f4f1ea}
  #ragw .citem.active{background:#d7ede9}
  #ragw .citem .t{flex:1;font-size:13.5px;color:#10221f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #ragw .citem .d{font-size:11px;color:#9bb0ab}
  #ragw .citem .del{background:none;border:none;color:#b3261e;cursor:pointer;font-size:14px;opacity:0;transition:.12s;padding:2px 6px}
  #ragw .citem:hover .del{opacity:1}
  #ragw .conv .empty{padding:30px;text-align:center;color:#9bb0ab;font-size:13px}
  /* auth */
  #ragw .auth{padding:24px 18px}
  #ragw .auth h3{margin:0 0 6px;font-size:16px;text-align:center}
  #ragw .auth p{color:#6b7b76;font-size:13px;margin:0 0 18px;text-align:center}
  #ragw .auth input{width:100%;border:1px solid #e4ded2;border-radius:12px;padding:11px;font-size:14px;margin-bottom:10px;outline:none}
  #ragw .auth input:focus{border-color:#0f766e}
  #ragw .auth button.primary{width:100%;background:#0f766e;color:#fff;border:none;border-radius:12px;padding:11px;font-size:14px;cursor:pointer}
  #ragw .auth .err{color:#b3261e;font-size:13px;min-height:18px;text-align:center}
  #ragw .auth .toggle{text-align:center;font-size:13px;color:#6b7b76;margin-top:14px}
  #ragw .auth .toggle a{color:#0f766e;cursor:pointer;font-weight:600}
  `;
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var fl = document.createElement("link"); fl.rel = "stylesheet";
  fl.href = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@33.003/Vazirmatn-font-face.css";
  document.head.appendChild(fl);

  // ---- DOM ----
  var root = document.createElement("div"); root.id = "ragw";
  root.innerHTML = `
    <div class="win" id="ragw-win">
      <div class="hd">
        <button id="ragw-list" class="hidden" title="گفتگوها">☰</button>
        <b>${TITLE}</b>
        <button id="ragw-new" class="hidden" title="گفتگوی جدید">↺</button>
        <button id="ragw-x" title="بستن">×</button>
      </div>
      <div class="conv" id="ragw-conv">
        <div class="ctop"><b>گفتگوهای شما</b><button class="newbtn" id="ragw-conv-new">+ گفتگوی جدید</button></div>
        <div class="clist" id="ragw-clist"></div>
      </div>
      <div class="body" id="ragw-body"></div>
      <div class="ft" id="ragw-ft">
        <input id="ragw-in" placeholder="سؤالتان را بنویسید..." autocomplete="off">
        <button id="ragw-send">ارسال</button>
      </div>
    </div>
    <button class="fab" id="ragw-fab">💬</button>`;
  document.body.appendChild(root);

  var win = root.querySelector("#ragw-win");
  var body = root.querySelector("#ragw-body");
  var input = root.querySelector("#ragw-in");
  var sendBtn = root.querySelector("#ragw-send");
  var footer = root.querySelector("#ragw-ft");
  var newBtn = root.querySelector("#ragw-new");
  var listBtn = root.querySelector("#ragw-list");
  var convPanel = root.querySelector("#ragw-conv");
  var clist = root.querySelector("#ragw-clist");

  root.querySelector("#ragw-fab").onclick = toggle;
  root.querySelector("#ragw-x").onclick = toggle;
  newBtn.onclick = newChat;
  listBtn.onclick = toggleConvPanel;
  root.querySelector("#ragw-conv-new").onclick = function () { convPanel.classList.remove("open"); newChat(); };
  sendBtn.onclick = send;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });

  var opened = false, started = false;

  function toggle() {
    opened = !opened;
    win.classList.toggle("open", opened);
    if (opened && !started) {
      started = true;
      if (token) { showLoggedInUI(); loadAndOpenLatest(); }
      else { hideLoggedInUI(); showAuth("login"); }
    }
  }
  function showLoggedInUI() { newBtn.classList.remove("hidden"); listBtn.classList.remove("hidden"); footer.style.display = "flex"; }
  function hideLoggedInUI() { newBtn.classList.add("hidden"); listBtn.classList.add("hidden"); }

  function authHeaders() { return { "Authorization": "Bearer " + token }; }

  // ---- message rendering ----
  function addMsg(text, who, sources) {
    var d = document.createElement("div");
    d.className = "msg " + who;
    d.textContent = text;
    if (sources && sources.length) addSources(d, sources);
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    return d;
  }
  function addSources(bubble, sources) {
    if (bubble.querySelector(".src")) return;
    var byFile = {}, order = [];
    sources.forEach(function (x) {
      if (!byFile[x.filename]) { byFile[x.filename] = { pages: [], labels: [] }; order.push(x.filename); }
      var g = byFile[x.filename];
      if (x.page != null && g.pages.indexOf(x.page) === -1) g.pages.push(x.page);
      if (x.label && g.labels.indexOf(x.label) === -1) g.labels.push(x.label);
    });
    var parts = order.map(function (f) {
      var g = byFile[f]; var bits = [f];
      if (g.pages.length) bits.push("ص " + g.pages.sort(function (a, b) { return a - b; }).join("، "));
      if (g.labels.length) bits.push(g.labels.join("، "));
      return bits.join(" — ");
    });
    var s = document.createElement("div"); s.className = "src";
    s.textContent = "منابع: " + parts.join(" | ");
    bubble.appendChild(s);
  }
  function typingBubble() {
    var d = document.createElement("div"); d.className = "msg bot";
    d.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    return d;
  }

  // ---- conversations ----
  function loadAndOpenLatest() {
    fetch(API + "/api/conversations", { headers: authHeaders() })
      .then(function (r) { if (r.status === 401) { signOut(); return null; } return r.json(); })
      .then(function (list) {
        if (list === null) return;
        if (list && list.length) openConversation(list[0].id);
        else newChat();
      }).catch(function () { newChat(); });
  }
  function toggleConvPanel() {
    if (convPanel.classList.contains("open")) { convPanel.classList.remove("open"); return; }
    fetch(API + "/api/conversations", { headers: authHeaders() })
      .then(function (r) { if (r.status === 401) { signOut(); return null; } return r.json(); })
      .then(function (list) {
        if (list === null) return;
        renderConvList(list);
        convPanel.classList.add("open");
      });
  }
  function renderConvList(list) {
    clist.innerHTML = "";
    if (!list.length) { clist.innerHTML = '<div class="empty">هنوز گفتگویی ندارید.</div>'; return; }
    list.forEach(function (c) {
      var item = document.createElement("div");
      item.className = "citem" + (c.id === convId ? " active" : "");
      var date = new Date(c.updated_at).toLocaleDateString("fa-IR");
      item.innerHTML = '<span class="t"></span><span class="d">' + date + '</span><button class="del" title="حذف">🗑</button>';
      item.querySelector(".t").textContent = c.title || "گفتگو";
      item.onclick = function () { convPanel.classList.remove("open"); openConversation(c.id); };
      item.querySelector(".del").onclick = function (e) { e.stopPropagation(); deleteConversation(c.id); };
      clist.appendChild(item);
    });
  }
  function openConversation(id) {
    convId = id;
    fetch(API + "/api/conversations/" + id + "/messages", { headers: authHeaders() })
      .then(function (r) { if (r.status === 401) { signOut(); return null; } return r.json(); })
      .then(function (msgs) {
        if (msgs === null) return;
        body.innerHTML = "";
        if (!msgs.length) { addMsg("سلام! هر سؤالی درباره‌ی محتوای موجود دارید بپرسید.", "bot"); return; }
        msgs.forEach(function (m) { addMsg(m.content, m.role === "assistant" ? "bot" : "user", m.sources); });
      });
  }
  function newChat() {
    convId = null;
    convPanel.classList.remove("open");
    body.innerHTML = "";
    addMsg("سلام! هر سؤالی درباره‌ی محتوای موجود دارید بپرسید.", "bot");
    input.focus();
  }
  function deleteConversation(id) {
    fetch(API + "/api/conversations/" + id, { method: "DELETE", headers: authHeaders() })
      .then(function () {
        if (id === convId) {
          convId = null; body.innerHTML = "";
          addMsg("سلام! هر سؤالی درباره‌ی محتوای موجود دارید بپرسید.", "bot");
        }
        return fetch(API + "/api/conversations", { headers: authHeaders() });
      })
      .then(function (r) { return r ? r.json() : null; })
      .then(function (list) { if (list) renderConvList(list); });
  }

  function signOut() {
    token = ""; localStorage.removeItem(KEY); convId = null;
    hideLoggedInUI(); convPanel.classList.remove("open");
    body.innerHTML = ""; showAuth("login");
  }

  // ---- auth ----
  function showAuth(mode) {
    footer.style.display = "none";
    var existing = document.getElementById("ragw-auth"); if (existing) existing.remove();
    var isLogin = mode === "login";
    var v = document.createElement("div"); v.className = "auth"; v.id = "ragw-auth";
    v.innerHTML = `
      <h3>${isLogin ? "ورود" : "ثبت‌نام"}</h3>
      <p>${isLogin ? "برای استفاده از دستیار وارد شوید." : "یک نام کاربری و رمز عبور بسازید."}</p>
      <input id="ragw-user" placeholder="نام کاربری" autocomplete="username">
      <input id="ragw-pass" type="password" placeholder="رمز عبور" autocomplete="current-password">
      <div class="err" id="ragw-err"></div>
      <button class="primary" id="ragw-go">${isLogin ? "ورود" : "ثبت‌نام و ورود"}</button>
      <div class="toggle">${isLogin ? "حساب ندارید؟" : "حساب دارید؟"}
        <a id="ragw-switch">${isLogin ? "ثبت‌نام کنید" : "وارد شوید"}</a></div>`;
    body.appendChild(v);
    document.getElementById("ragw-go").onclick = function () { doAuth(isLogin); };
    document.getElementById("ragw-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doAuth(isLogin); });
    document.getElementById("ragw-switch").onclick = function () { showAuth(isLogin ? "register" : "login"); };
  }
  function doAuth(isLogin) {
    var username = document.getElementById("ragw-user").value.trim();
    var password = document.getElementById("ragw-pass").value;
    var err = document.getElementById("ragw-err"); err.textContent = "";
    if (!username || !password) { err.textContent = "نام کاربری و رمز را وارد کنید."; return; }
    fetch(API + (isLogin ? "/api/auth/login" : "/api/auth/register"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { err.textContent = res.d.detail || "خطا"; return; }
        token = res.d.token; localStorage.setItem(KEY, token);
        var a = document.getElementById("ragw-auth"); if (a) a.remove();
        showLoggedInUI();
        newChat();
      }).catch(function () { err.textContent = "خطای ارتباط با سرور"; });
  }

  // ---- chat (streaming) ----
  function send() {
    var q = input.value.trim(); if (!q) return;
    if (!token) { showAuth("login"); return; }
    convPanel.classList.remove("open");
    addMsg(q, "user"); input.value = ""; sendBtn.disabled = true;
    var bubble = typingBubble();
    var answer = ""; var sources = null; var firstDelta = true;

    fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ question: q, conversation_id: convId })
    }).then(function (resp) {
      if (resp.status === 401) { bubble.remove(); signOut(); return; }
      if (!resp.ok || !resp.body) {
        return resp.json().catch(function () { return {}; }).then(function (d) {
          showError(bubble, d.detail || "خطایی رخ داد.");
        });
      }
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      function handle(ev) {
        if (ev.type === "meta") { if (ev.conversation_id) convId = ev.conversation_id; }
        else if (ev.type === "sources") { sources = ev.sources; }
        else if (ev.type === "delta") {
          if (firstDelta) { firstDelta = false; bubble.textContent = ""; }
          answer += ev.text; bubble.textContent = answer;
          body.scrollTop = body.scrollHeight;
        } else if (ev.type === "error") { showError(bubble, ev.detail || "خطا"); }
        else if (ev.type === "done") { if (sources) addSources(bubble, sources); }
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += decoder.decode(r.value, { stream: true });
          var i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            var raw = buf.slice(0, i); buf = buf.slice(i + 2);
            var line = raw.replace(/^data:\s?/, "").trim();
            if (line) { try { handle(JSON.parse(line)); } catch (e) {} }
          }
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      showError(bubble, "خطای ارتباط با سرور.");
    }).finally(function () { sendBtn.disabled = false; input.focus(); });
  }

  function showError(bubble, msg) {
    bubble.className = "msg err"; bubble.textContent = msg;
    body.scrollTop = body.scrollHeight;
  }
})();
