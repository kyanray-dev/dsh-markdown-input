# dsh-markdown-input

[中文](#中文) | [English](#english)

<a id="中文"></a>

在 DeepSeek Harness（DSH）的输入框里写 Markdown：Shift+Enter 自动续写列表，列表、引用、标题的语法标记实时高亮。

## 功能

- **Shift+Enter 续写列表**：在有内容的列表行上按 Shift+Enter，换行并自动补上下一个标记。
  - `- ` / `* ` / `+ ` → 同样的符号
  - `1. ` / `1) ` → 序号加一（`9.` → `10.`）
  - `- [x] ` / `- [ ] ` → `- [ ] `
  - `> ` → `> `
  - 行首空格（嵌套缩进）保留
- **退出列表**：在只有标记的空行上按 Shift+Enter，删除该标记。
- **语法高亮**：`-`、`1.`、`- [ ]`、`>` 加粗并使用主题品牌色；引用文字变灰；标题文字加粗，`#` 变灰。
- **列表缩进**：列表、任务、引用行略微缩进（粘贴的多行文本除外）。
- **Enter 行为不变**：Enter 仍然发送消息，Shift+Enter 仍然换行。

发送给模型的文字就是你输入的原文，插件只会在续写时补上列表标记，不会改写其他内容。

## 安装

需要 `dsh` CLI 在 `PATH` 上（`npm install -g @deepseek-ai/dsh`）。本插件是纯 JavaScript，无需构建。

```sh
git clone https://github.com/kyanray-dev/dsh-markdown-input.git
cd dsh-markdown-input
dsh plugin --profile web add ./
```

然后以该 profile 重启 Harness。DSH Desktop 用户请按 `Cmd+Q` 完全退出后重新打开。

也可以通过 [dsh-market](https://github.com/dsh-market/dsh-market) 插件市场安装。

## 工作原理

- 高亮使用浏览器的 [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API)，只影响绘制，不向编辑器插入任何节点。
- 缩进通过给行所在的 `<p>` 添加 class 实现；编辑器的 MutationObserver 不监听属性变化，因此不会被还原。
- Shift+Enter 时通过编辑器实例把当前行拆成新段落，并在新段落开头插入标记。段落间隔与行内换行在草稿中同样导出为 `\n`，发送内容不变。
- 插件整体包在 try/catch 中：任何异常只会让插件自身停用，不影响 DSH 启动。

## 限制

- 续写依赖编辑器内部字段 `__lexicalEditor` 与 `_pendingEditorState`，DSH 升级后可能变化；取不到时退回为原生换行加插入标记，列表行不再缩进。
- 粘贴进来的多行文本位于同一段落内，只高亮、不缩进。
- 仅支持 Web 界面（包括 DSH Desktop）。在 DSH Desktop 0.1.7-rc.2 上测试。

## 卸载

在「设置 → 插件」中关闭或移除 `dsh-markdown-input`。

## 许可证

[Apache-2.0](LICENSE)

---

<a id="english"></a>

## English

Markdown authoring in the DeepSeek Harness (DSH) composer: Shift+Enter continues lists, and list, quote and heading markers are highlighted as you type.

### Features

- **List continuation on Shift+Enter** — on a list line with content, Shift+Enter starts a new line with the next marker: `- ` / `* ` / `+ ` repeat, `1. ` / `1) ` increment (`9.` → `10.`), `- [x] ` becomes `- [ ] `, `> ` repeats. Leading indentation is kept.
- **Leave a list** — Shift+Enter on an empty item removes the marker.
- **Syntax hints** — `-`, `1.`, `- [ ]` and `>` are drawn bold in the theme's brand color; quote text is muted; heading text is bold with a muted `#`.
- **List indentation** — list, task and quote lines are indented slightly (except inside pasted multi-line text).
- **Enter unchanged** — Enter still sends, Shift+Enter still inserts a newline.

The text sent to the model is exactly what you typed; the only text the plugin inserts is the continued list marker.

### Install

Requires the `dsh` CLI on `PATH` (`npm install -g @deepseek-ai/dsh`). Plain JavaScript, no build step.

```sh
git clone https://github.com/kyanray-dev/dsh-markdown-input.git
cd dsh-markdown-input
dsh plugin --profile web add ./
```

Restart the Harness with that profile. On DSH Desktop, quit with `Cmd+Q` and reopen.

### How it works

- Highlights use the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API), which paints ranges without inserting nodes into the editor.
- Indentation is a class on each line's `<p>`; the editor's MutationObserver ignores attribute changes, so it is kept.
- On Shift+Enter the plugin splits the current line into a new paragraph through the editor instance and types the marker. Paragraph gaps and line breaks both project to `\n` in the draft, so the sent text is the same.
- Everything runs inside try/catch: a failure disables the plugin, never Harness startup.

### Limitations

- Continuation reads the editor internals `__lexicalEditor` and `_pendingEditorState`, which may change in future DSH releases. When they are unavailable the plugin falls back to a native line break plus a typed marker, without indentation.
- Pasted multi-line text shares one paragraph, so it is highlighted but not indented.
- Web UI only (including DSH Desktop). Tested on DSH Desktop 0.1.7-rc.2.

### Uninstall

Disable or remove `dsh-markdown-input` under Settings → Plugins.

### License

[Apache-2.0](LICENSE)
