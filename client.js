window.__ModuleLoader__.load({
  id: 'dsh-markdown-input',
  factory() {
    // -----------------------------------------------------------------------
    // Markdown authoring for the DSH composer.
    //
    // The composer is a plain-text Lexical editor and the message text is the
    // editor text, so the plugin never removes or replaces what you typed; the
    // only text it inserts is a continued list marker or a wrap around a
    // selection. Everything else is presentation:
    //
    //   Line level (on single-line paragraphs, i.e. lines made with
    //   Shift+Enter; a class/attribute on the <p> survives because Lexical's
    //   observer ignores attributes):
    //     "- " "* " "+ "      marker drawn as a bullet (the real "-" is made
    //                         transparent and a ::before glyph sits on it)
    //     "- [ ] " "- [x] "   marker drawn as a checkbox; checked items struck
    //     "1. " "1) "         number bold in the brand color
    //     "> "                left bar, muted text
    //     "# " .. "###### "   bold, larger heading, muted "#"
    //     ``` fences           monospace block with a background and token
    //                         colours (keywords, strings, numbers, comments)
    //   Inline (CSS Custom Highlight API, paint only, any line):
    //     **bold** *italic* `code` ~~strike~~ -> content styled, delimiters muted
    //
    // Editing:
    //   Shift+Enter on a list/quote line starts a new line with the next marker;
    //   on an empty item it removes the marker.
    //   With a single-line selection in the composer, Cmd/Ctrl+B wraps it in
    //   **...**, Cmd/Ctrl+I in *...*, Cmd/Ctrl+E in `...`; a second press
    //   unwraps. Without a selection the keys keep their normal meaning
    //   (Cmd+B still toggles the sidebar).
    //
    // Enter still sends. Any failure disables the plugin, never the Client.
    // -----------------------------------------------------------------------

    const TAG = '[md-input]';
    const STYLE_ID = 'dsh-markdown-input/hints';
    const INPUT_SELECTOR = '[data-composer-input]';

    // Highlight names -> registered on CSS.highlights.
    const HL = [
      'mdi-marker', 'mdi-hash', 'mdi-listnum', 'mdi-quote',
      'mdi-bold', 'mdi-italic', 'mdi-strike', 'mdi-code', 'mdi-delim',
      'mdi-fence', 'mdi-kw', 'mdi-str', 'mdi-num', 'mdi-com',
    ];
    const LINE_CLASSES = [
      'mdi-ul', 'mdi-ol', 'mdi-task', 'mdi-task-done', 'mdi-quote-line',
      'mdi-h', 'mdi-h1', 'mdi-h2', 'mdi-h3',
      'mdi-code-line', 'mdi-fence-line',
    ];
    // Assigned per code run after classes are set, so kept out of LINE_CLASSES.
    const RUN_CLASSES = ['mdi-code-first', 'mdi-code-last'];

    // --- block classification ---------------------------------------------
    const RULES = [
      {
        kind: 'task',
        re: /^([ \t]*)([-*+][ \t]+\[([ xX])\])[ \t]+(.*)$/,
        next: (m) => `${m[1]}${m[2][0]} [ ] `,
      },
      { kind: 'ul', re: /^([ \t]*)([-*+])()[ \t]+(.*)$/, next: (m) => `${m[1]}${m[2]} ` },
      {
        kind: 'ol',
        re: /^([ \t]*)(\d{1,9}[.)])()[ \t]+(.*)$/,
        next: (m) => `${m[1]}${parseInt(m[2], 10) + 1}${m[2].slice(-1)} `,
      },
      { kind: 'quote', re: /^([ \t]*)(>)()[ \t]+(.*)$/, next: (m) => `${m[1]}> ` },
      { kind: 'heading', re: /^()(#{1,6})()[ \t]+(.*)$/, next: null },
    ];

    function classify(line) {
      for (const rule of RULES) {
        const m = rule.re.exec(line);
        if (!m) continue;
        const markerStart = m[1].length;
        const rest = m[4];
        return {
          kind: rule.kind,
          markerStart,
          markerEnd: markerStart + m[2].length,
          restStart: line.length - rest.length,
          rest,
          checked: m[3] === 'x' || m[3] === 'X',
          level: rule.kind === 'heading' ? m[2].length : 0,
          next: rule.next ? rule.next(m) : null,
        };
      }
      return null;
    }

    const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

    // --- inline + code tokenizers ------------------------------------------
    // Returns [{ start, end, name }]. Inline code is matched first so its
    // contents are not treated as emphasis.
    function inlineRanges(text) {
      const out = [];
      const taken = [];
      const free = (s, e) => taken.every(([a, b]) => e <= a || s >= b);
      const mark = (s, e) => taken.push([s, e]);
      const scan = (re, name, open, close) => {
        re.lastIndex = 0;
        for (let m = re.exec(text); m !== null; m = re.exec(text)) {
          const s = m.index + (m[1] ? m[1].length : 0);
          const whole = m[0].length - (m[1] ? m[1].length : 0);
          const e = s + whole;
          if (!free(s, e)) continue;
          mark(s, e);
          out.push({ start: s, end: s + open, name: 'mdi-delim' });
          out.push({ start: s + open, end: e - close, name });
          out.push({ start: e - close, end: e, name: 'mdi-delim' });
        }
      };
      scan(/()`([^`\n]+)`/g, 'mdi-code', 1, 1);
      scan(/()\*\*(?=\S)([^*\n]*?\S)\*\*/g, 'mdi-bold', 2, 2);
      scan(/()__(?=\S)([^_\n]*?\S)__/g, 'mdi-bold', 2, 2);
      scan(/()~~(?=\S)([^~\n]*?\S)~~/g, 'mdi-strike', 2, 2);
      scan(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, 'mdi-italic', 1, 1);
      scan(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, 'mdi-italic', 1, 1);
      return out;
    }

    const KEYWORDS = new Set((
      'abstract as async await break case catch class const continue def default defer del do elif ' +
      'else enum except export extends false final finally fn for from func function go if impl ' +
      'import in interface is lambda let loop match mod mut new nil none None not null of or and ' +
      'package pass private protected pub public raise return self static struct super switch this ' +
      'throw trait true True False try type typeof use var void where while with yield'
    ).split(' '));
    const CODE_TOKEN = /(\/\/[^\n]*|#[^\n]*|\/\*[^]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

    function codeRanges(text) {
      const out = [];
      CODE_TOKEN.lastIndex = 0;
      for (let m = CODE_TOKEN.exec(text); m !== null; m = CODE_TOKEN.exec(text)) {
        const s = m.index;
        const e = s + m[0].length;
        if (m[1]) out.push({ start: s, end: e, name: 'mdi-com' });
        else if (m[2]) out.push({ start: s, end: e, name: 'mdi-str' });
        else if (m[3]) out.push({ start: s, end: e, name: 'mdi-num' });
        else if (m[4] && KEYWORDS.has(m[4])) out.push({ start: s, end: e, name: 'mdi-kw' });
      }
      return out;
    }

    // --- DOM helpers -------------------------------------------------------
    const SHOW = 0x1 | 0x4; // SHOW_ELEMENT | SHOW_TEXT

    /** Split a block into visual lines at user <br> (managed breaks ignored). */
    function linesOf(block) {
      const lines = [{ text: '', parts: [] }];
      const walker = document.createTreeWalker(block, SHOW);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.nodeType === 3) {
          const line = lines[lines.length - 1];
          line.parts.push({ node: n, at: line.text.length });
          line.text += n.nodeValue;
        } else if (n.nodeName === 'BR'
          && !(n.getAttribute && n.getAttribute('data-lexical-managed-linebreak'))) {
          lines.push({ text: '', parts: [] });
        }
      }
      return lines;
    }

    function rangeIn(line, start, end) {
      if (end <= start) return null;
      let s = null;
      let e = null;
      for (const part of line.parts) {
        const len = part.node.nodeValue.length;
        if (s === null && start < part.at + len) s = [part.node, start - part.at];
        if (s !== null && end <= part.at + len) {
          e = [part.node, end - part.at];
          break;
        }
      }
      if (s === null || e === null) return null;
      const range = document.createRange();
      range.setStart(s[0], s[1]);
      range.setEnd(e[0], e[1]);
      return range;
    }

    function fragmentText(fragment) {
      let text = '';
      const walker = document.createTreeWalker(fragment, SHOW);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.nodeType === 3) text += n.nodeValue;
        else if (n.nodeName === 'BR') text += '\n';
      }
      return text;
    }

    function caretLine(input) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
      const anchor = sel.anchorNode;
      if (!anchor || !input.contains(anchor)) return null;
      const el = anchor.nodeType === 1 ? anchor : anchor.parentElement;
      const block = el ? el.closest('p') : null;
      if (!block || !input.contains(block)) return null;
      const pre = document.createRange();
      pre.selectNodeContents(block);
      pre.setEnd(anchor, sel.anchorOffset);
      const post = document.createRange();
      post.selectNodeContents(block);
      post.setStart(anchor, sel.anchorOffset);
      const before = fragmentText(pre.cloneContents());
      const after = fragmentText(post.cloneContents());
      return {
        before: before.slice(before.lastIndexOf('\n') + 1),
        after: after.split('\n')[0],
      };
    }

    // --- editor access (guarded internals) ---------------------------------
    function editorOf(input) {
      const editor = input.__lexicalEditor;
      return editor && typeof editor.update === 'function' ? editor : null;
    }
    function liveSelection(editor) {
      const state = editor._pendingEditorState;
      const sel = state ? state._selection : null;
      return sel && typeof sel.insertParagraph === 'function'
        && typeof sel.insertText === 'function' ? sel : null;
    }
    function newParagraph(editor, marker) {
      let done = false;
      editor.update(() => {
        const sel = liveSelection(editor);
        if (!sel) return;
        sel.insertParagraph();
        if (marker) {
          const after = liveSelection(editor);
          if (after) after.insertText(marker);
        }
        done = true;
      }, { discrete: true });
      return done;
    }
    function deleteBefore(editor, count) {
      let done = false;
      editor.update(() => {
        const sel = liveSelection(editor);
        if (!sel || typeof sel.deleteCharacter !== 'function') return;
        for (let i = 0; i < count; i += 1) sel.deleteCharacter(true);
        done = true;
      }, { discrete: true });
      return done;
    }

    // --- styles ------------------------------------------------------------
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const STYLE_TEXT = `
${INPUT_SELECTOR} p.mdi-ul, ${INPUT_SELECTOR} p.mdi-ol,
${INPUT_SELECTOR} p.mdi-task, ${INPUT_SELECTOR} p.mdi-quote-line {
  position: relative; padding-left: 0.7em;
}
${INPUT_SELECTOR} p[data-mdi-marker]::before {
  content: attr(data-mdi-marker);
  position: absolute;
  left: var(--mdi-x, 0.7em);
  top: var(--mdi-y, 0);
  width: var(--mdi-w, 1ch);
  line-height: var(--mdi-h, inherit);
  text-align: center;
  color: var(--dsw-alias-brand-primary);
  font-weight: 700;
  pointer-events: none;
}
${INPUT_SELECTOR} p.mdi-task::before { font-weight: 400; }
${INPUT_SELECTOR} p.mdi-task-done { color: var(--dsw-alias-label-secondary); }
${INPUT_SELECTOR} p.mdi-quote-line { box-shadow: inset 2px 0 0 0 var(--dsw-alias-border-l2); }
${INPUT_SELECTOR} p.mdi-h { font-weight: 700; }
${INPUT_SELECTOR} p.mdi-task-done { text-decoration: line-through; text-decoration-color: var(--dsw-alias-label-secondary); }
${INPUT_SELECTOR} p.mdi-h1 { font-size: 1.3em; }
${INPUT_SELECTOR} p.mdi-h2 { font-size: 1.18em; }
${INPUT_SELECTOR} p.mdi-h3 { font-size: 1.08em; }
${INPUT_SELECTOR} p.mdi-code-line, ${INPUT_SELECTOR} p.mdi-fence-line {
  font-family: ${MONO};
  font-size: 0.92em;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  padding: 0 10px;
  margin: 0;
}
${INPUT_SELECTOR} p.mdi-code-first { border-top-left-radius: 6px; border-top-right-radius: 6px; padding-top: 2px; }
${INPUT_SELECTOR} p.mdi-code-last { border-bottom-left-radius: 6px; border-bottom-right-radius: 6px; padding-bottom: 2px; }
::highlight(mdi-marker) { color: transparent; }
::highlight(mdi-hash) { color: var(--dsw-alias-label-secondary); }
::highlight(mdi-quote) { color: var(--dsw-alias-label-secondary); }
::highlight(mdi-listnum) {
  color: var(--dsw-alias-brand-primary);
  text-shadow: 0.4px 0 0 var(--dsw-alias-brand-primary), -0.4px 0 0 var(--dsw-alias-brand-primary);
}
::highlight(mdi-delim) { color: var(--dsw-alias-label-secondary); }
::highlight(mdi-bold) {
  text-shadow: 0.4px 0 0 currentColor, -0.4px 0 0 currentColor;
}
::highlight(mdi-italic) { color: var(--dsw-alias-brand-primary); }
::highlight(mdi-strike) {
  text-decoration: line-through;
  color: var(--dsw-alias-label-secondary);
}
::highlight(mdi-code) {
  color: var(--dsw-alias-label-primary);
  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
}
::highlight(mdi-fence) { color: var(--dsw-alias-label-secondary); }
::highlight(mdi-kw) { color: #b35ad1; }
::highlight(mdi-str) { color: #3f9a4f; }
::highlight(mdi-num) { color: #c07a2c; }
::highlight(mdi-com) { color: var(--dsw-alias-label-secondary); }
`;

    const MARKER_PROPS = ['--mdi-x', '--mdi-y', '--mdi-w', '--mdi-h'];
    function clearMarker(block) {
      block.removeAttribute('data-mdi-marker');
      for (const prop of MARKER_PROPS) block.style.removeProperty(prop);
    }
    /** Position the ::before glyph exactly over the marker characters. */
    function placeMarker(block, range) {
      if (range === null) return;
      const rect = range.getBoundingClientRect();
      const box = block.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const set = (prop, value) => {
        if (block.style.getPropertyValue(prop) !== value) block.style.setProperty(prop, value);
      };
      set('--mdi-x', (rect.left - box.left - block.clientLeft).toFixed(1) + 'px');
      set('--mdi-y', (rect.top - box.top - block.clientTop).toFixed(1) + 'px');
      set('--mdi-w', rect.width.toFixed(1) + 'px');
      set('--mdi-h', rect.height.toFixed(1) + 'px');
    }

    // --- painter -----------------------------------------------------------
    function install() {
      const disposers = [];

      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-markdown-input';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = STYLE_TEXT;
      document.head.appendChild(tag);
      disposers.push(() => tag.remove());

      const hasHighlights = typeof CSS !== 'undefined' && CSS.highlights !== undefined
        && typeof Highlight === 'function';
      const hl = {};
      if (hasHighlights) {
        HL.forEach((name, index) => {
          hl[name] = new Highlight();
          hl[name].priority = index; // later names paint over earlier ones
          CSS.highlights.set(name, hl[name]);
        });
        disposers.push(() => {
          for (const name of HL) if (CSS.highlights.get(name) === hl[name]) CSS.highlights.delete(name);
        });
      }
      const add = (name, range) => {
        if (range !== null && hl[name]) hl[name].add(range);
      };

      const setLine = (block, classes, marker) => {
        for (const name of LINE_CLASSES) {
          const want = classes.indexOf(name) !== -1;
          if (block.classList.contains(name) !== want) block.classList.toggle(name, want);
        }
        if (marker) {
          if (block.getAttribute('data-mdi-marker') !== marker) block.setAttribute('data-mdi-marker', marker);
        } else if (block.hasAttribute('data-mdi-marker')) {
          clearMarker(block);
        }
      };

      const observed = new Map();
      let frame = 0;

      const paintLine = (line, info, single) => {
        if (info) {
          const markRange = rangeIn(line, info.markerStart, info.markerEnd);
          if (info.kind === 'heading') {
            add('mdi-hash', markRange);
          } else if (info.kind === 'quote') {
            add('mdi-hash', markRange);
            add('mdi-quote', rangeIn(line, info.restStart, line.text.length));
          } else if ((info.kind === 'ul' || info.kind === 'task') && single && hasHighlights) {
            add('mdi-marker', markRange); // glyph drawn by ::before
          } else {
            add('mdi-listnum', markRange);
          }
        }
        for (const r of inlineRanges(line.text)) add(r.name, rangeIn(line, r.start, r.end));
      };
      const paintCode = (line, state) => {
        if (state === 'fence') {
          add('mdi-fence', rangeIn(line, 0, line.text.length));
          return;
        }
        for (const r of codeRanges(line.text)) add(r.name, rangeIn(line, r.start, r.end));
      };

      const paintInput = (input) => {
        let inCode = false;
        let run = [];
        const flushCode = () => {
          if (run.length === 0) return;
          run[0].classList.add('mdi-code-first');
          run[run.length - 1].classList.add('mdi-code-last');
          run = [];
        };
        for (const block of input.querySelectorAll(':scope > p')) {
          const lines = linesOf(block);
          // Code state per visual line; a fence toggles it.
          const states = lines.map((line) => {
            if (FENCE_RE.test(line.text)) {
              inCode = !inCode;
              return 'fence';
            }
            return inCode ? 'code' : 'text';
          });
          const single = lines.length === 1;

          // Whole paragraph is code or fence: style it as a code block.
          if (states.every((st) => st !== 'text')) {
            const fenceOnly = single && states[0] === 'fence';
            setLine(block, [fenceOnly ? 'mdi-fence-line' : 'mdi-code-line'], null);
            run.push(block);
            lines.forEach((line, i) => paintCode(line, states[i]));
            if (!inCode) flushCode(); // the fence closed here
            continue;
          }
          flushCode();

          // Line-level presentation only for single-line paragraphs.
          const info = single ? classify(lines[0].text) : null;
          let classes = [];
          let marker = null;
          if (info) {
            if (info.kind === 'ul') {
              classes = ['mdi-ul'];
              if (hasHighlights) marker = '•';
            } else if (info.kind === 'task') {
              classes = info.checked ? ['mdi-task', 'mdi-task-done'] : ['mdi-task'];
              if (hasHighlights) marker = info.checked ? '☑' : '☐';
            } else if (info.kind === 'ol') classes = ['mdi-ol'];
            else if (info.kind === 'quote') classes = ['mdi-quote-line'];
            else if (info.kind === 'heading') classes = ['mdi-h', 'mdi-h' + Math.min(info.level, 3)];
          }
          setLine(block, classes, marker);
          if (marker) placeMarker(block, rangeIn(lines[0], info.markerStart, info.markerEnd));

          lines.forEach((line, i) => {
            if (states[i] !== 'text') paintCode(line, states[i]);
            else paintLine(line, single ? info : classify(line.text), single);
          });
        }
        flushCode();
      };

      const paint = () => {
        frame = 0;
        if (hasHighlights) for (const name of HL) hl[name].clear();
        for (const input of observed.keys()) {
          if (!input.isConnected) continue;
          for (const p of input.querySelectorAll(':scope > p')) {
            p.classList.remove(...RUN_CLASSES);
          }
          paintInput(input);
        }
      };
      const schedule = () => {
        if (frame === 0) frame = requestAnimationFrame(paint);
      };

      const syncInputs = () => {
        const present = new Set(document.querySelectorAll(INPUT_SELECTOR));
        for (const [input, observer] of observed) {
          if (!present.has(input)) {
            observer.disconnect();
            observed.delete(input);
          }
        }
        for (const input of present) {
          if (observed.has(input)) continue;
          const observer = new MutationObserver(schedule);
          observer.observe(input, { childList: true, characterData: true, subtree: true });
          const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
          if (resize) resize.observe(input);
          observed.set(input, { disconnect() { observer.disconnect(); if (resize) resize.disconnect(); } });
        }
        schedule();
      };

      let syncFrame = 0;
      const pageObserver = new MutationObserver(() => {
        if (syncFrame === 0) {
          syncFrame = requestAnimationFrame(() => {
            syncFrame = 0;
            syncInputs();
          });
        }
      });
      pageObserver.observe(document.body, { childList: true, subtree: true });
      syncInputs();

      // --- keyboard ------------------------------------------------------
      const timers = new Set();
      const WRAP = { KeyB: '**', KeyI: '*', KeyE: '`' };

      const wrapSelection = (input, delim) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        if (!input.contains(range.startContainer) || !input.contains(range.endContainer)) return false;
        const text = sel.toString();
        if (text === '' || text.indexOf('\n') !== -1) return false;
        const wrapped = text.length > delim.length * 2 && text.startsWith(delim) && text.endsWith(delim);
        const next = wrapped ? text.slice(delim.length, -delim.length) : delim + text + delim;
        return document.execCommand('insertText', false, next);
      };

      const onKeyDown = (event) => {
        const input = event.target && event.target.closest
          ? event.target.closest(INPUT_SELECTOR) : null;
        if (!input) return;
        if (event.isComposing || event.keyCode === 229) return;

        // Selection formatting: only with a non-empty selection.
        const primary = event.metaKey !== event.ctrlKey && (event.metaKey || event.ctrlKey);
        if (primary && !event.altKey && !event.shiftKey && WRAP[event.code]) {
          if (wrapSelection(input, WRAP[event.code])) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          return;
        }

        if (event.key !== 'Enter' || !event.shiftKey) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        const line = caretLine(input);
        if (line === null) return;
        const info = classify(line.before + line.after);
        const listLine = info !== null && info.next !== null
          && line.before.length >= info.restStart;
        const editor = editorOf(input);

        try {
          if (listLine && info.rest.trim() === '') {
            if (editor && deleteBefore(editor, line.before.length)) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            return;
          }
          if (editor && newParagraph(editor, listLine ? info.next : '')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        } catch (error) {
          console.error(TAG, 'editor path failed; using native line break', error);
        }

        if (!listLine) return;
        const marker = info.next;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!input.isConnected || !input.contains(document.activeElement)) return;
          const now = caretLine(input);
          if (now === null || now.before !== '') return;
          document.execCommand('insertText', false, marker);
        }, 0);
        timers.add(timer);
      };
      // window capture runs before the shortcut service's window listeners.
      window.addEventListener('keydown', onKeyDown, true);

      disposers.push(() => {
        window.removeEventListener('keydown', onKeyDown, true);
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        pageObserver.disconnect();
        if (frame !== 0) cancelAnimationFrame(frame);
        if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
        for (const [input, observer] of observed) {
          observer.disconnect();
          for (const p of input.querySelectorAll('p')) {
            p.classList.remove(...LINE_CLASSES, ...RUN_CLASSES);
            if (p.hasAttribute('data-mdi-marker')) clearMarker(p);
          }
        }
        observed.clear();
      });

      console.log(TAG, 'active; highlight API =', hasHighlights);
      return () => {
        for (const dispose of disposers.reverse()) {
          try { dispose(); } catch (error) { console.error(TAG, 'dispose failed', error); }
        }
      };
    }

    return {
      apply(ctx) {
        ctx.effect(() => {
          let dispose = null;
          let onReady = null;
          const start = () => {
            try {
              dispose = install();
            } catch (error) {
              console.error(TAG, 'install failed; plugin disabled', error);
            }
          };
          if (document.body) start();
          else {
            onReady = start;
            document.addEventListener('DOMContentLoaded', onReady, { once: true });
          }
          return () => {
            if (onReady) document.removeEventListener('DOMContentLoaded', onReady);
            if (dispose) dispose();
          };
        });
      },
    };
  },
});
