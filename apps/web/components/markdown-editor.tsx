"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Obsidian-flavored typography — proportional body text, large headings,
 * styled bold/italic/links/code. Markdown markers (`#`, `*`, `>`) stay visible
 * but render in a muted color so the document feels like prose.
 */
const runeHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.85em", fontWeight: "700", lineHeight: "1.25" },
  { tag: t.heading2, fontSize: "1.5em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading3, fontSize: "1.22em", fontWeight: "600", lineHeight: "1.35" },
  { tag: t.heading4, fontSize: "1.08em", fontWeight: "600" },
  { tag: t.heading5, fontWeight: "600" },
  { tag: t.heading6, fontWeight: "600", color: "var(--color-fg-muted)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  {
    tag: t.link,
    color: "var(--color-accent)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  { tag: t.url, color: "var(--color-accent)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.92em" },
  { tag: t.quote, color: "var(--color-fg-muted)", fontStyle: "italic" },
  { tag: t.list, color: "var(--color-fg-muted)" },
  {
    tag: t.processingInstruction,
    color: "var(--color-fg-subtle)",
    fontWeight: "400",
  },
  { tag: t.contentSeparator, color: "var(--color-border-strong)" },
  { tag: t.meta, color: "var(--color-fg-subtle)" },
]);

const runeTheme = EditorView.theme(
  {
    "&": {
      color: "var(--color-fg)",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "15px",
      lineHeight: "1.7",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-sans)",
      padding: "1.25rem 1rem 4rem",
      caretColor: "var(--color-accent)",
    },
    ".cm-content": {
      maxWidth: "70ch",
      margin: "0 auto",
      padding: "0",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--color-accent)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklch, var(--color-accent) 30%, transparent)",
    },
    ".cm-selectionBackground": {
      backgroundColor:
        "color-mix(in oklch, var(--color-accent) 22%, transparent) !important",
    },
    ".cm-placeholder": {
      color: "var(--color-fg-subtle)",
    },
  },
  { dark: true },
);

export default function MarkdownEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(runeHighlight),
        runeTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full overflow-auto" />;
}
