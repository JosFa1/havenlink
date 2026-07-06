/**
 * HavenLink "Ask Haven" chat widget.
 *
 * Self-contained: injects its own styles and markup, keeps conversation history
 * in memory, and talks to POST /api/chat on the same origin. Drop it on any page
 * with:  <script src="/chat-widget.js" defer></script>
 */
(function () {
  "use strict";

  // Don't double-inject if the script is included twice.
  if (window.__havenChatLoaded) return;
  window.__havenChatLoaded = true;

  var API_URL = "/api/chat";
  var history = []; // [{ role: "user" | "model", text: string }]
  var sending = false;

  // ---- Styles ----------------------------------------------------------------
  // "Light Editorial" palette — self-contained (this <style> is injected into
  // <head>, not scoped to body.editorial, so all values are inline hexes):
  // paper #faf8f5 / paper-dim #f1ede6 / ink #14213d / terracotta #b4551f /
  // muted #4a5468 / hairline rgba(20,33,61,.14).
  var css = `
  .hl-chat-btn{position:fixed;bottom:20px;right:20px;z-index:9998;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:#14213d;color:#faf8f5;box-shadow:0 10px 30px -8px rgba(13,24,48,.5);display:flex;align-items:center;justify-content:center;transition:transform .25s cubic-bezier(.22,.61,.2,1),background-color .25s ease}
  .hl-chat-btn:hover{transform:translateY(-2px);background:#b4551f}
  .hl-chat-btn svg{width:26px;height:26px}
  .hl-chat-panel{position:fixed;bottom:92px;right:20px;z-index:9999;width:376px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 128px);background:#faf8f5;border:1px solid rgba(20,33,61,.14);border-radius:14px;box-shadow:0 24px 60px -20px rgba(13,24,48,.4);display:none;flex-direction:column;overflow:hidden;font-family:inherit}
  .hl-chat-panel.hl-open{display:flex}
  .hl-chat-head{background:#14213d;color:#faf8f5;padding:16px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .hl-chat-head h3{margin:0;font-family:"Fraunces",Georgia,"Times New Roman",serif;font-size:19px;font-weight:500;letter-spacing:-.01em}
  .hl-chat-head p{margin:3px 0 0;font-size:12px;letter-spacing:.02em;color:rgba(250,248,245,.62)}
  .hl-chat-close{background:none;border:none;color:rgba(250,248,245,.7);font-size:24px;line-height:1;cursor:pointer;padding:0 2px;transition:color .2s ease}
  .hl-chat-close:hover{color:#faf8f5}
  .hl-chat-log{flex:1;overflow-y:auto;padding:18px;background:#f1ede6;display:flex;flex-direction:column;gap:12px}
  .hl-msg{max-width:85%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .hl-msg.hl-user{align-self:flex-end;background:#b4551f;color:#faf8f5;border-bottom-right-radius:4px}
  .hl-msg.hl-bot{align-self:flex-start;background:#faf8f5;color:#14213d;border:1px solid rgba(20,33,61,.14);border-bottom-left-radius:4px}
  .hl-typing{align-self:flex-start;color:#4a5468;font-size:13px;font-style:italic;padding:4px 6px}
  .hl-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(20,33,61,.14);background:#faf8f5}
  .hl-chat-input{flex:1;border:1px solid rgba(20,33,61,.2);border-radius:12px;padding:11px 14px;font-size:14px;font-family:inherit;color:#14213d;background:#faf8f5;outline:none;resize:none;transition:border-color .2s ease}
  .hl-chat-input::placeholder{color:#8a92a3}
  .hl-chat-input:focus{border-color:#b4551f}
  .hl-chat-send{border:none;background:#14213d;color:#faf8f5;border-radius:12px;padding:0 18px;font-size:14px;font-weight:600;letter-spacing:.02em;cursor:pointer;transition:background-color .25s ease}
  .hl-chat-send:hover:not(:disabled){background:#b4551f}
  .hl-chat-send:disabled{opacity:.5;cursor:not-allowed}
  `;
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- Markup ----------------------------------------------------------------
  var btn = document.createElement("button");
  btn.className = "hl-chat-btn";
  btn.setAttribute("aria-label", "Open the HavenLink assistant");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "hl-chat-panel";
  panel.innerHTML =
    '<div class="hl-chat-head">' +
    "<div><h3>Ask Haven</h3><p>HavenLink's adoption assistant</p></div>" +
    '<button class="hl-chat-close" aria-label="Close chat">&times;</button>' +
    "</div>" +
    '<div class="hl-chat-log" role="log" aria-live="polite"></div>' +
    '<form class="hl-chat-form">' +
    '<textarea class="hl-chat-input" rows="1" placeholder="Ask about adoption, home study, matching..." aria-label="Your message"></textarea>' +
    '<button type="submit" class="hl-chat-send">Send</button>' +
    "</form>";

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var log = panel.querySelector(".hl-chat-log");
  var form = panel.querySelector(".hl-chat-form");
  var input = panel.querySelector(".hl-chat-input");
  var sendBtn = panel.querySelector(".hl-chat-send");
  var closeBtn = panel.querySelector(".hl-chat-close");

  var greeted = false;
  function openPanel() {
    panel.classList.add("hl-open");
    if (!greeted) {
      greeted = true;
      addMessage(
        "bot",
        "Hi! I'm Haven \u{1F44B} I can answer questions about HavenLink — the adoption process, home study, family intake, agency matching, and more. What would you like to know?"
      );
    }
    input.focus();
  }
  function closePanel() {
    panel.classList.remove("hl-open");
  }

  btn.addEventListener("click", function () {
    panel.classList.contains("hl-open") ? closePanel() : openPanel();
  });
  closeBtn.addEventListener("click", closePanel);

  function addMessage(who, text) {
    var el = document.createElement("div");
    el.className = "hl-msg " + (who === "user" ? "hl-user" : "hl-bot");
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function showTyping() {
    var el = document.createElement("div");
    el.className = "hl-typing";
    el.textContent = "Haven is typing…";
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // Auto-grow the textarea up to a few lines.
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });
  // Enter sends; Shift+Enter makes a newline.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (sending) return;
    var text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    history.push({ role: "user", text: text });
    input.value = "";
    input.style.height = "auto";

    sending = true;
    sendBtn.disabled = true;
    var typing = showTyping();

    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      typing.remove();
      var reply =
        data.reply ||
        "Sorry, I couldn't reach the assistant just now. Please email havenlink.org@gmail.com.";
      addMessage("bot", reply);
      history.push({ role: "model", text: reply });
    } catch (err) {
      typing.remove();
      addMessage(
        "bot",
        "I'm having trouble connecting. Please check your connection or email havenlink.org@gmail.com."
      );
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });
})();
