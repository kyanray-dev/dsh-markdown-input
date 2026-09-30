# dsh-markdown-input

[中文](#中文) | [English](#english)

<a id="中文"></a>

在 DeepSeek Harness（DSH）的输入框里写 Markdown：列表显示为圆点和复选框，粗体、斜体、行内代码、删除线和代码块实时呈现，Shift+Enter 自动续写列表。发送出去的仍是你输入的 Markdown 原文。

## 功能

**显示效果**（只改显示，不改文字）

| 输入 | 显示 |
|---|---|
| `- 项目` / `* 项目` / `+ 项目` | `•` 圆点，列表行略微缩进 |
| `- [ ] 待办` / `- [x] 完成` | `☐` / `☑` 复选框，已完成的项加删除线 |
| `1. 第一项` | 序号加粗，使用主题品牌色 |
| `> 引用` | 左侧竖线，文字变灰 |
| `## 标题` | 加粗、放大，`#` 变灰 |
| `**粗体**` `*斜体*` `` `代码` `` `~~删除~~` | 中间文字显示对应格式，符号变灰 |
| ```` ```js ```` … ```` ``` ```` | 等宽字体、底色，关键字、字符串、数字、注释分别上色 |

圆点、复选框和代码块只对单独成行的内容生效，也就是用 Shift+Enter 换出来的行；粘贴进来的多行文字只做行内高亮。

**编辑**

- **Shift+Enter 续写列表**：在有内容的列表行上按 Shift+Enter，换行并补上下一个标记。`-` `*` `+` 保持不变，`9.` 续成 `10.`，`- [x]` 续成 `- [ ]`，`>` 保持不变，行首缩进保留。
- **退出列表**：在只有标记的空行上按 Shift+Enter，删除该标记。
- **选中文字加格式**：选中一段文字后按 `Cmd/Ctrl+B` 加 `**`，`Cmd/Ctrl+I` 加 `*`，`Cmd/Ctrl+E` 加反引号；再按一次去掉。没有选中文字时这些键保持原来的作用，`Cmd+B` 仍然开关侧边栏。
- **Enter 行为不变**：Enter 发送，Shift+Enter 换行。

插件只会在续写列表和选中加格式时插入文字，其他情况不改动你输入的内容。

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
- 圆点和复选框：把原来的 `-` 画成透明，再用 `<p>` 的 `::before` 在同一位置画 `•` / `☐` / `☑`；位置按标记字符的实际大小测量。
- 行的样式通过给 `<p>` 添加 class 实现；编辑器的 MutationObserver 不监听属性变化，因此不会被还原。
- Shift+Enter 时通过编辑器实例把当前行拆成新段落，并在新段落开头插入标记。段落间隔与行内换行在草稿中同样导出为 `\n`，发送内容不变。
- 插件整体包在 try/catch 中：任何异常只会让插件自身停用，不影响 DSH 启动。

## 限制

- 标记不会被真正隐藏：`**` 这类符号会变灰但仍占位置，圆点所在位置仍是原来的 `-`。这是为了保证发送的文字不变。
- 粗体用描边模拟，斜体用颜色区分：浏览器的 Highlight API 不支持改字重和字形。
- 续写依赖编辑器内部字段 `__lexicalEditor` 与 `_pendingEditorState`，DSH 升级后可能变化；取不到时退回为原生换行加插入标记，列表行不再缩进，也不显示圆点。
- 粘贴进来的多行文本位于同一段落内，只做行内高亮。
- 仅支持 Web 界面（包括 DSH Desktop）。在 DSH Desktop 0.1.7-rc.2 上测试。

## 卸载

在「设置 → 插件」中关闭或移除 `dsh-markdown-input`。

## 许可证

[Apache-2.0](LICENSE)

---

<a id="english"></a>

## English

Markdown authoring in the DeepSeek Harness (DSH) composer: lists show bullets and checkboxes, bold, italic, inline code, strikethrough and fenced code render as you type, and Shift+Enter continues lists. The sent text is still the Markdown you typed.

### Features

**Presentation** (display only, text unchanged)

| Input | Display |
|---|---|
| `- item` / `* item` / `+ item` | `•` bullet, slightly indented |
| `- [ ] todo` / `- [x] done` | `☐` / `☑` checkbox; done items struck through |
| `1. first` | number bold in the brand color |
| `> quote` | left bar, muted text |
| `## Title` | bold and larger, muted `#` |
| `**bold**` `*italic*` `` `code` `` `~~strike~~` | content styled, delimiters muted |
| ```` ```js ```` … ```` ``` ```` | monospace block with a background; keywords, strings, numbers and comments coloured |

Bullets, checkboxes and code blocks apply to lines that stand alone, i.e. lines made with Shift+Enter; pasted multi-line text gets inline styling only.

**Editing**

- **List continuation on Shift+Enter** — on a list line with content, Shift+Enter starts a new line with the next marker: `-` `*` `+` repeat, `9.` becomes `10.`, `- [x]` becomes `- [ ]`, `>` repeats. Leading indentation is kept.
- **Leave a list** — Shift+Enter on an empty item removes the marker.
- **Format a selection** — with text selected, `Cmd/Ctrl+B` wraps it in `**`, `Cmd/Ctrl+I` in `*`, `Cmd/Ctrl+E` in backticks; press again to unwrap. Without a selection the keys keep their usual meaning (`Cmd+B` still toggles the sidebar).
- **Enter unchanged** — Enter sends, Shift+Enter inserts a newline.

The plugin only inserts text when it continues a list or wraps a selection.

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
- Bullets and checkboxes: the real `-` is painted transparent and the `<p>`'s `::before` draws `•` / `☐` / `☑` over it, positioned from the marker's measured box.
- Line styles are classes on each line's `<p>`; the editor's MutationObserver ignores attribute changes, so they are kept.
- On Shift+Enter the plugin splits the current line into a new paragraph through the editor instance and types the marker. Paragraph gaps and line breaks both project to `\n` in the draft, so the sent text is the same.
- Everything runs inside try/catch: a failure disables the plugin, never Harness startup.

### Limitations

- Markers are not removed: delimiters such as `**` are muted but still take space, and a bullet sits where the `-` is. This keeps the sent text identical.
- Bold is simulated with a stroke and italic with colour: the Highlight API cannot change font weight or style.
- Continuation reads the editor internals `__lexicalEditor` and `_pendingEditorState`, which may change in future DSH releases. When they are unavailable the plugin falls back to a native line break plus a typed marker, without indentation or bullets.
- Pasted multi-line text shares one paragraph, so it gets inline styling only.
- Web UI only (including DSH Desktop). Tested on DSH Desktop 0.1.7-rc.2.

### Uninstall

Disable or remove `dsh-markdown-input` under Settings → Plugins.

### License

[Apache-2.0](LICENSE)
