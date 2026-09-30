window.__ModuleLoader__.load({
  id: 'dsh-markdown-input',
  factory() {
    // -----------------------------------------------------------------------
    // Markdown input hints for the DSH composer.
    //
    // The user's text is never rewritten except for the list marker the
    // plugin types on Shift+Enter. Features:
    //
    // 1. Shift+Enter starts a new paragraph (<p>) instead of a <br> inside
    //    the same paragraph. The draft value is identical ("\n" either way;
    //    the composer projects paragraph gaps as "\n"), but each line now
    //    owns its own block, so list lines can be indented individually.
    //    On a list / task / ordered / quote line with content, the next
    //    marker is typed for you ("- ", "2. ", "- [ ] ", "> "); on an empty
    //    item the marker is removed (leave the list).
    // 2. Lines that are markdown list / task / ordered / quote items are
    //    indented slightly (class on their <p>; the editor's observer does
    //    not watch attributes, so it keeps them).
    // 3. Markers are drawn bold in the brand color, quote text muted, heading
    //    text bold with muted "#", via the CSS Custom Highlight API (no DOM
    //    change).
    //
    // Enter is untouched (it still sends). Failures disable the plugin
    // instead of breaking Client startup. If the editor instance cannot be
    // reached, Shift+Enter falls back to the native line break plus a typed
    // marker.
    // -----------------------------------------------------------------------

    const TAG = '[md-input]';
    const STYLE_ID = 'dsh-markdown-input/hints';
    const INPUT_SELECTOR = '[data-composer-input]';
    const HL = {
      marker: 'mdcp-marker',
      hash: 'mdcp-hash',
      quote: 'mdcp-quote',
      heading: 'mdcp-heading',
    };
    const INDENT_CLASS = 'mdcp-indent';

    // --- line classification ----------------------------------------------
    const RULES = [
      {
        kind: 'task',
        re: /^([ \t]*)([-*+][ \t]+\[[ xX]\])[ \t]+(.*)$/,
        next: (m) => `${m[1]}${m[2][0]} [ ] `,
      },
      {
        kind: 'ul',
        re: /^([ \t]*)([-*+])[ \t]+(.*)$/,
        next: (m) => `${m[1]}${m[2]} `,
      },
      {
        kind: 'ol',
        re: /^([ \t]*)(\d{1,9}[.)])[ \t]+(.*)$/,
        next: (m) => `${m[1]}${parseInt(m[2], 10) + 1}${m[2].slice(-1)} `,
      },
      {
        kind: 'quote',
        re: /^([ \t]*)(>)[ \t]+(.*)$/,
        next: (m) => `${m[1]}> `,
      },
      {
        kind: 'heading',
        re: /^()(#{1,6})[ \t]+(.*)$/,
        next: null,
      },
    ];
    const INDENTED_KINDS = new Set(['task', 'ul', 'ol', 'quote']);

    function classify(line) {
      for (const rule of RULES) {
        const m = rule.re.exec(line);
        if (!m) continue;
        const markerStart = m[1].length;
        const rest = m[3];
        return {
          kind: rule.kind,
          markerStart,
          markerEnd: markerStart + m[2].length,
          restStart: line.length - rest.length,
          rest,
          next: rule.next ? rule.next(m) : null,
        };
      }
      return null;
    }

    // --- DOM helpers -------------------------------------------------------
    const SHOW = 0x1 | 0x4; // SHOW_ELEMENT | SHOW_TEXT

    /** Split a block into visual lines at <br>, keeping text-node offsets. */
    function linesOf(block) {
      const lines = [{ text: '', parts: [] }];
      const walker = document.createTreeWalker(block, SHOW);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.nodeType === 3) {
          const line = lines[lines.length - 1];
          line.parts.push({ node: n, at: line.text.length });
          line.text += n.nodeValue;
        } else if (n.nodeName === 'BR') {
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

    /** Current visual line split at the collapsed caret. */
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

    // --- editor access -----------------------------------------------------
    // Lexical stores its editor on the root element (`__lexicalEditor`) and,
    // inside `update()`, the live selection on `_pendingEditorState`. These
    // are the only internals used; every access is guarded.
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

    /**
     * Split the paragraph at the caret and optionally type `marker` at the
     * start of the new one. Returns false when the editor path is unusable.
     */
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

    /** Delete `count` characters before the caret (empty-item exit). */
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
    const STYLE_TEXT = `
${INPUT_SELECTOR} p.${INDENT_CLASS} { padding-left: 0.7em; }
::highlight(${HL.marker}) {
  color: var(--dsw-alias-brand-primary);
  text-shadow: 0.35px 0 0 var(--dsw-alias-brand-primary), -0.35px 0 0 var(--dsw-alias-brand-primary);
}
::highlight(${HL.hash}) { color: var(--dsw-alias-label-secondary); }
::highlight(${HL.quote}) { color: var(--dsw-alias-label-secondary); }
::highlight(${HL.heading}) {
  text-shadow: 0.4px 0 0 var(--dsw-alias-label-primary), -0.4px 0 0 var(--dsw-alias-label-primary);
}
`;

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
        for (const [key, name] of Object.entries(HL)) {
          hl[key] = new Highlight();
          hl[key].priority = key === 'marker' || key === 'hash' ? 2 : 1;
          CSS.highlights.set(name, hl[key]);
        }
        disposers.push(() => {
          for (const [key, name] of Object.entries(HL)) {
            if (CSS.highlights.get(name) === hl[key]) CSS.highlights.delete(name);
          }
        });
      }

      const observed = new Map();
      let frame = 0;

      const paint = () => {
        frame = 0;
        if (hasHighlights) for (const h of Object.values(hl)) h.clear();
        for (const input of observed.keys()) {
          if (!input.isConnected) continue;
          for (const block of input.querySelectorAll('p')) {
            const lines = linesOf(block);
            // Indent a block only when every line in it is a list/quote
            // item, so a mixed block never shifts plain text.
            let indent = lines.length > 0;
            for (const line of lines) {
              const info = classify(line.text);
              if (info === null || !INDENTED_KINDS.has(info.kind)) indent = false;
              if (info === null || !hasHighlights) continue;
              const markRange = rangeIn(line, info.markerStart, info.markerEnd);
              if (markRange) (info.kind === 'heading' ? hl.hash : hl.marker).add(markRange);
              if (info.kind === 'quote' || info.kind === 'heading') {
                const restRange = rangeIn(line, info.restStart, line.text.length);
                if (restRange) (info.kind === 'quote' ? hl.quote : hl.heading).add(restRange);
              }
            }
            if (block.classList.contains(INDENT_CLASS) !== indent) {
              block.classList.toggle(INDENT_CLASS, indent);
            }
          }
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
          observed.set(input, observer);
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

      // --- Shift+Enter ---------------------------------------------------
      const timers = new Set();
      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || !event.shiftKey) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.isComposing || event.keyCode === 229) return;
        const input = event.target && event.target.closest
          ? event.target.closest(INPUT_SELECTOR) : null;
        if (!input) return;

        const line = caretLine(input);
        if (line === null) return;
        const info = classify(line.before + line.after);
        const listLine = info !== null && info.next !== null
          && line.before.length >= info.restStart;
        const editor = editorOf(input);

        try {
          if (listLine && info.rest.trim() === '') {
            // Empty item: remove the marker, stay on this line.
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

        // Fallback: native line break, then type the marker.
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
      document.addEventListener('keydown', onKeyDown, true);

      disposers.push(() => {
        document.removeEventListener('keydown', onKeyDown, true);
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        pageObserver.disconnect();
        if (frame !== 0) cancelAnimationFrame(frame);
        if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
        for (const [input, observer] of observed) {
          observer.disconnect();
          for (const p of input.querySelectorAll('p')) p.classList.remove(INDENT_CLASS);
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
