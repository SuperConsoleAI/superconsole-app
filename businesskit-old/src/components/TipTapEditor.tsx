import { component$, useSignal, useVisibleTask$, useTask$, $, useOnDocument, type Signal, type QRL } from "@builder.io/qwik";
import { 
  LuBold, LuItalic, LuUnderline, LuStrikethrough, 
  LuList, LuListOrdered, LuCheckSquare, 
  LuQuote, LuCode, LuLink, LuImage, LuVideo, 
  LuUndo, LuRedo, LuChevronDown, LuMaximize, LuTable
} from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

const { spacing, typography, borderRadius } = designSystem;

export interface TipTapEditorProps {
  value: Signal<string> | string;
  placeholder?: string;
  onChange$?: QRL<(html: string) => void>;
  documentMode?: boolean;
  hideToolbar?: boolean;
}

export const TipTapEditor = component$<TipTapEditorProps>(({ value, placeholder = "Start typing...", onChange$, documentMode = false, hideToolbar = false }) => {
  const editorRef = useSignal<HTMLDivElement>();
  const editorInstance = useSignal<any>();
  const showHeadingDropdown = useSignal<boolean>(false);
  const dropdownButtonRef = useSignal<HTMLButtonElement>();
  const canUndo = useSignal(false);
  const canRedo = useSignal(false);
  const currentHeading = useSignal<string>('Normal');
  const editorHeight = useSignal<number>(240);
  const isResizing = useSignal<boolean>(false);
  const isEnlarged = useSignal<boolean>(false);
  const isTableActive = useSignal(false);
  const isBold = useSignal(false);
  const isItalic = useSignal(false);
  const isUnderline = useSignal(false);
  const isStrike = useSignal(false);
  const isBulletList = useSignal(false);
  const isOrderedList = useSignal(false);
  const isTaskList = useSignal(false);
  const isBlockquote = useSignal(false);
  const isCodeBlock = useSignal(false);
  const isLink = useSignal(false);

  const handleResizePointerDown$ = $((e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();

    const startY = e.clientY;
    const startH = editorHeight.value;
    isResizing.value = true;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.buttons === 0 && moveEvent.pointerType === "mouse") {
        onPointerUp();
        return;
      }
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(160, Math.min(1000, Math.round(startH + delta)));
      editorHeight.value = newHeight;
    };

    const onPointerUp = () => {
      isResizing.value = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });

  const toggleEnlarge$ = $(() => {
    if (isEnlarged.value) {
      editorHeight.value = 240;
      isEnlarged.value = false;
    } else {
      editorHeight.value = 520;
      isEnlarged.value = true;
    }
  });

  useOnDocument(
    'click',
    $((event) => {
      // Only process if dropdown is open
      if (!showHeadingDropdown.value) return;
      
      const target = event.target as HTMLElement;
      if (dropdownButtonRef.value && !dropdownButtonRef.value.contains(target)) {
        showHeadingDropdown.value = false;
      }
    })
  );

  useTask$(({ track }) => {
    const val = track(() => (typeof value === "string" ? value : value.value));
    if (editorInstance.value && !editorInstance.value.isFocused) {
      if (editorInstance.value.getHTML() !== val) {
        editorInstance.value.commands.setContent(val || "", false);
      }
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track, cleanup }) => {
    track(() => editorRef.value);

    if (!editorRef.value) return;

    const initialContent = typeof value === "string" ? value : value.value;

    const { Editor } = await import("@tiptap/core");
    const StarterKit = (await import("@tiptap/starter-kit")).default;
    const Image = (await import("@tiptap/extension-image")).default;
    const Link = (await import("@tiptap/extension-link")).default;
    const Underline = (await import("@tiptap/extension-underline")).default;
    const Youtube = (await import("@tiptap/extension-youtube")).default;
    const TaskList = (await import("@tiptap/extension-task-list")).default;
    const TaskItem = (await import("@tiptap/extension-task-item")).default;
    const { Table, TableRow, TableHeader, TableCell } = await import("@tiptap/extension-table");
    const { marked } = await import("marked");

    const editor = new Editor({
      element: editorRef.value,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Image,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'tiptap-link',
          },
        }),
        Underline,
        Youtube.configure({
          height: 480,
          controls: false,
          modestBranding: true,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
          HTMLAttributes: {
            class: 'tiptap-task-item',
          },
        }),
        Table.configure({
          resizable: true,
          HTMLAttributes: {
            class: 'tiptap-table',
          },
        }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: initialContent || "",
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content',
        },
        handlePaste: (_view, event) => {
          const plainText = event.clipboardData?.getData("text/plain");
          if (!plainText) return false;

          const htmlText = event.clipboardData?.getData("text/html");
          const hasHtmlTable = Boolean(htmlText && /<table[\s>]/i.test(htmlText));

          // If clipboard HTML already has a <table>, ProseMirror's Table extension parses it directly
          if (hasHtmlTable) {
            return false;
          }

          // Markdown table pattern: checks for markdown table delimiter line like `|---|---|` or `---|---`
          const mdTableRegex = /(?:^|\n)[ \t]*\|?([ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-+:?[ \t]*\|?[ \t]*(?:\n|$)/m;

          if (mdTableRegex.test(plainText)) {
            try {
              const parsedHtml = marked.parse(plainText, { gfm: true, async: false }) as string;
              if (parsedHtml && /<table[\s>]/i.test(parsedHtml)) {
                editor.commands.insertContent(parsedHtml);
                return true;
              }
            } catch (err) {
              console.warn("[TipTapEditor] Error parsing pasted markdown table:", err);
            }
          }

          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const html = ed.getHTML();

        if (typeof value !== 'string') {
          value.value = html;
        }

        if (onChange$) {
          onChange$(html);
        }

        syncEditorState(ed);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        syncEditorState(ed);
      },
      onTransaction: ({ editor: ed }) => {
        syncEditorState(ed);
      },
      onFocus: ({ editor: ed }) => {
        syncEditorState(ed);
      },
    });

    const syncEditorState = (ed: any) => {
      if (!ed) return;
      const newCanUndo = ed.can().undo();
      const newCanRedo = ed.can().redo();
      if (canUndo.value !== newCanUndo) canUndo.value = newCanUndo;
      if (canRedo.value !== newCanRedo) canRedo.value = newCanRedo;

      let newHeading = 'Normal';
      if (ed.isActive('heading', { level: 1 })) newHeading = 'Heading 1';
      else if (ed.isActive('heading', { level: 2 })) newHeading = 'Heading 2';
      else if (ed.isActive('heading', { level: 3 })) newHeading = 'Heading 3';
      if (currentHeading.value !== newHeading) currentHeading.value = newHeading;

      const newIsTableActive = ed.isActive('table');
      if (isTableActive.value !== newIsTableActive) isTableActive.value = newIsTableActive;

      const b = ed.isActive('bold');
      if (isBold.value !== b) isBold.value = b;

      const it = ed.isActive('italic');
      if (isItalic.value !== it) isItalic.value = it;

      const u = ed.isActive('underline');
      if (isUnderline.value !== u) isUnderline.value = u;

      const s = ed.isActive('strike');
      if (isStrike.value !== s) isStrike.value = s;

      const bl = ed.isActive('bulletList');
      if (isBulletList.value !== bl) isBulletList.value = bl;

      const ol = ed.isActive('orderedList');
      if (isOrderedList.value !== ol) isOrderedList.value = ol;

      const tl = ed.isActive('taskList');
      if (isTaskList.value !== tl) isTaskList.value = tl;

      const bq = ed.isActive('blockquote');
      if (isBlockquote.value !== bq) isBlockquote.value = bq;

      const cb = ed.isActive('codeBlock');
      if (isCodeBlock.value !== cb) isCodeBlock.value = cb;

      const lnk = ed.isActive('link');
      if (isLink.value !== lnk) isLink.value = lnk;

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("businesskit:tiptap-state", {
          detail: {
            isBold: b,
            isItalic: it,
            isUnderline: u,
            isStrike: s,
            isBulletList: bl,
            isOrderedList: ol,
            isTaskList: tl,
            isBlockquote: bq,
            isCodeBlock: cb,
            isLink: lnk,
            isTableActive: newIsTableActive,
            canUndo: newCanUndo,
            canRedo: newCanRedo,
            currentHeading: newHeading,
            html: ed.getHTML(),
          }
        }));
      }
    };

    (editorRef.value as any).__tiptap__ = editor;
    (window as any).__articleModalEditor__ = editor;
    editorInstance.value = editor;
    syncEditorState(editor);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("businesskit:tiptap-editor-ready", {
        detail: { editor }
      }));
    }

    cleanup(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("businesskit:tiptap-editor-destroyed"));
      }
      if (editorRef.value) {
        delete (editorRef.value as any).__tiptap__;
      }
      if ((window as any).__articleModalEditor__ === editor) {
        delete (window as any).__articleModalEditor__;
      }
      editor.destroy();
      editorInstance.value = null;
    });
  });

  const setHeading = $((level: 1 | 2 | 3) => {
    const editor = (editorRef.value as any)?.__tiptap__ || editorInstance.value;
    if (!editor) return;
    editor.chain().focus().toggleHeading({ level }).run();
    showHeadingDropdown.value = false;
  });

  const setParagraph = $(() => {
    const editor = (editorRef.value as any)?.__tiptap__ || editorInstance.value;
    if (!editor) return;
    editor.chain().focus().setParagraph().run();
    showHeadingDropdown.value = false;
  });

  const toggleFormat = $((format: string) => {
    const editor = (editorRef.value as any)?.__tiptap__ || editorInstance.value;
    if (!editor) return;

    switch (format) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'code': editor.chain().focus().toggleCode().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline().run(); break;
      case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
      case 'taskList': editor.chain().focus().toggleTaskList().run(); break;
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
      case 'undo': editor.chain().focus().undo().run(); break;
      case 'redo': editor.chain().focus().redo().run(); break;
    }

    isBold.value = editor.isActive('bold');
    isItalic.value = editor.isActive('italic');
    isUnderline.value = editor.isActive('underline');
    isStrike.value = editor.isActive('strike');
    isBulletList.value = editor.isActive('bulletList');
    isOrderedList.value = editor.isActive('orderedList');
    isTaskList.value = editor.isActive('taskList');
    isBlockquote.value = editor.isActive('blockquote');
    isCodeBlock.value = editor.isActive('codeBlock');
    isLink.value = editor.isActive('link');
    canUndo.value = editor.can().undo();
    canRedo.value = editor.can().redo();
  });

  const addLink = $(() => {
    const editor = (editorRef.value as any)?.__tiptap__ || editorInstance.value;
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      isLink.value = false;
      return;
    }
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
      isLink.value = true;
    }
  });

  const addImage = $(() => {
    const url = prompt('Enter image URL:');
    if (url) {
      editorInstance.value?.chain().focus().setImage({ src: url }).run();
    }
  });

  const addVideo = $(() => {
    const url = prompt('Enter video URL (YouTube, Vimeo, or direct):');
    if (!url) return;

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // Use TipTap's YouTube extension for proper embed rendering
      editorInstance.value?.chain().focus().setYoutubeVideo({ src: url }).run();
    } else if (url.includes('vimeo.com')) {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
      if (id) {
        const html = `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;"><iframe src="https://player.vimeo.com/video/${id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allowfullscreen></iframe></div>`;
        editorInstance.value?.chain().focus().insertContent(html).run();
      }
    } else {
      const html = `<video src="${url}" controls style="width: 100%; height: auto;"></video>`;
      editorInstance.value?.chain().focus().insertContent(html).run();
    }
  });

  const addTable = $(() => {
    editorInstance.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  });

  const addRowBefore = $(() => {
    editorInstance.value?.chain().focus().addRowBefore().run();
  });

  const addRowAfter = $(() => {
    editorInstance.value?.chain().focus().addRowAfter().run();
  });

  const deleteRow = $(() => {
    editorInstance.value?.chain().focus().deleteRow().run();
  });

  const addColumnBefore = $(() => {
    editorInstance.value?.chain().focus().addColumnBefore().run();
  });

  const addColumnAfter = $(() => {
    editorInstance.value?.chain().focus().addColumnAfter().run();
  });

  const deleteColumn = $(() => {
    editorInstance.value?.chain().focus().deleteColumn().run();
  });

  const deleteTable = $(() => {
    editorInstance.value?.chain().focus().deleteTable().run();
  });



  return (
    <div class={`tiptap-root-wrap ${documentMode ? "tiptap-document-mode" : ""}`} style={{ position: "relative" }}>
      <style>{`
        /* Toolbar */
        .tiptap-toolbar {
          border: 1px solid var(--border);
          border-radius: ${borderRadius.md} ${borderRadius.md} 0 0;
          background: var(--surface-2);
          padding: 0.25rem;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0;
          max-width: 100%;
          position: sticky;
          top: -1.5rem;
          z-index: 100;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
        }

        /* Document mode header toolbar - inserted in header with top stroke only */
        .tiptap-header-toolbar {
          border: none !important;
          border-top: 1px solid var(--border) !important;
          border-radius: 0 !important;
          background: var(--surface-2) !important;
          padding: 0.25rem 1.5rem !important;
          display: flex !important;
          align-items: center !important;
          flex-wrap: wrap !important;
          gap: 0 !important;
          width: 100% !important;
          box-sizing: border-box !important;
          box-shadow: none !important;
          position: static !important;
          margin: 0 !important;
        }

        .tiptap-header-table-toolbar {
          border: none !important;
          border-top: 1px solid var(--border) !important;
          border-radius: 0 !important;
          background: var(--surface-2) !important;
          padding: 0.25rem 1.5rem !important;
          display: flex !important;
          align-items: center !important;
          flex-wrap: wrap !important;
          gap: 0.35rem !important;
          width: 100% !important;
          box-sizing: border-box !important;
          position: static !important;
          margin: 0 !important;
        }

        @media (max-width: 640px) {
          .tiptap-header-toolbar {
            padding: 0.25rem 1rem !important;
          }
          .tiptap-header-table-toolbar {
            padding: 0.25rem 1rem !important;
          }
        }

        .tiptap-editor-document {
          border: none !important;
          background: transparent !important;
          height: auto !important;
          min-height: 240px !important;
          overflow: visible !important;
          box-shadow: none !important;
          padding-bottom: 3.5rem !important;
        }

        .tiptap-editor-document .tiptap-editor-content {
          height: auto !important;
          min-height: 240px !important;
          overflow: visible !important;
          overflow-y: visible !important;
          padding: 0 !important;
          padding-bottom: 3.5rem !important;
          background: transparent !important;
        }

        .tiptap-toolbar button,
        .tiptap-toolbar .tiptap-picker {
          flex-shrink: 0;
          margin: 0;
        }

        @media (max-width: 768px) {
          .tiptap-toolbar {
            gap: 0;
            padding: 0.25rem;
          }
        }

        /* Toolbar buttons - uniform equal dimensions and centering */
        .tiptap-btn {
          width: 28px;
          height: 28px;
          margin: 0;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-primary);
          padding: 0;
          position: relative;
          transition: all 0.15s ease;
        }

        .tiptap-btn:hover {
          color: var(--accent);
          background: var(--surface-3);
        }

        .tiptap-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .tiptap-btn.is-active {
          color: var(--accent);
          background: var(--surface-3);
          box-shadow: inset 0 0 0 1px var(--border);
          font-weight: 600;
        }

        .tiptap-btn.is-active:hover {
          color: var(--accent);
          background: var(--surface-3);
        }

        .tiptap-btn svg {
          width: 16px;
          height: 16px;
        }

        /* Heading dropdown */
        .tiptap-picker {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .tiptap-picker-label {
          min-width: 90px;
          height: 28px;
          padding: 0 6px 0 8px;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 500;
          position: relative;
          transition: all 0.15s ease;
        }

        .tiptap-picker-label:hover {
          background: var(--surface-3);
          color: var(--accent);
        }

        .tiptap-picker-options {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 2px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: ${borderRadius.md};
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
          min-width: 120px;
          z-index: 150;
          padding: 4px 0;
        }

        .tiptap-picker-item {
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          color: var(--text-primary);
          font-size: ${typography.sizes.sm};
          display: block;
        }

        .tiptap-picker-item:hover {
          background: var(--accent-soft);
          color: var(--accent);
        }

        /* Editor container */
        .tiptap-editor-container {
          border: 1px solid var(--border);
          border-top: none;
          border-radius: 0 0 ${borderRadius.md} ${borderRadius.md};
          background: var(--surface-1);
          font-family: inherit;
          font-size: 16px;
          position: relative;
          z-index: 1;
        }
        
        .tiptap-editor-content {
          min-height: 140px;
          height: 100%;
          color: var(--text-primary);
          padding: ${spacing.md};
          outline: none;
          overflow-y: auto;
          box-sizing: border-box;
          font-size: 16px;
          line-height: 1.6;
        }

        /* Placeholder */
        .tiptap-editor-content p.is-editor-empty:first-child::before {
          content: "${placeholder}";
          color: var(--text-secondary);
          float: left;
          height: 0;
          pointer-events: none;
          font-style: normal;
        }

        /* Editor content styles */
        .tiptap-editor-content h1 { 
          font-size: 22px; 
          font-weight: 700; 
          margin: 1rem 0; 
          line-height: 1.3; 
          color: var(--text-primary);
        }
        
        .tiptap-editor-content h2 { 
          font-size: 20px; 
          font-weight: 600; 
          margin: 0.83rem 0; 
          line-height: 1.35; 
          color: var(--text-primary);
        }
        
        .tiptap-editor-content h3 { 
          font-size: 18px; 
          font-weight: 600; 
          margin: 0.67rem 0; 
          line-height: 1.4; 
          color: var(--text-primary);
        }
        
        .tiptap-editor-content p { 
          font-size: 16px;
          line-height: 1.6;
          margin: 0.5rem 0; 
        }
        
        .tiptap-editor-content ul,
        .tiptap-editor-content ol { 
          padding-left: 2rem; 
          margin: 0.75rem 0; 
        }
        
        .tiptap-editor-content ul { 
          list-style-type: disc; 
        }
        
        .tiptap-editor-content ol { 
          list-style-type: decimal; 
        }
        
        .tiptap-editor-content li { 
          margin: 0.25rem 0;
          padding-left: 1.5em;
        }

        .tiptap-editor-content ul li::marker,
        .tiptap-editor-content ol li::marker {
          color: var(--text-primary);
        }
        
        .tiptap-editor-content code { 
          background: var(--field-fill); 
          padding: 0.2em 0.4em; 
          border-radius: 0.25rem; 
          font-size: 0.875em;
          font-family: 'Monaco', 'Courier New', monospace;
        }
        
        .tiptap-editor-content pre { 
          background: var(--surface-3); 
          color: var(--text-primary); 
          padding: 1rem; 
          border-radius: 0.5rem; 
          margin: 1rem 0; 
          overflow-x: auto;
          max-width: 100%;
          word-wrap: break-word;
          white-space: pre-wrap;
        }
        
        .tiptap-editor-content pre code { 
          background: none; 
          padding: 0; 
          color: inherit; 
        }
        
        .tiptap-editor-content blockquote { 
          border-left: 3px solid var(--border); 
          padding-left: 1rem; 
          margin: 1rem 0; 
          color: var(--text-secondary); 
        }
        
        .tiptap-editor-content strong { 
          font-weight: 700; 
        }
        
        .tiptap-editor-content em { 
          font-style: italic; 
        }
        
        .tiptap-editor-content s { 
          text-decoration: line-through; 
        }
        
        .tiptap-editor-content u { 
          text-decoration: underline; 
        }
        
        .tiptap-editor-content a { 
          color: var(--accent); 
          text-decoration: underline; 
        }
        
        .tiptap-editor-content img { 
          max-width: 100%; 
          height: auto; 
          border-radius: 0.5rem; 
          margin: 1rem 0;
          display: block;
        }
        
        .tiptap-editor-content video,
        .tiptap-editor-content iframe { 
          max-width: 100%;
          width: 100%; 
          height: auto;
          min-height: 400px;
          border-radius: 0.5rem; 
          margin: 1rem 0; 
          aspect-ratio: 16/9;
          display: block;
        }

        /* YouTube embed from TipTap extension */
        .tiptap-editor-content div[data-youtube-video] {
          margin: 1rem 0;
          max-width: 100%;
          overflow: hidden;
        }

        .tiptap-editor-content div[data-youtube-video] iframe {
          max-width: 100%;
          width: 100%;
          height: 480px;
          border-radius: 0.5rem;
          display: block;
        }

        /* Task List styles */
        .tiptap-editor-content ul[data-type="taskList"] {
          list-style-type: none;
          list-style: none;
          padding-left: 0;
          margin-left: 0;
        }

        .tiptap-editor-content ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          list-style-type: none;
          list-style: none;
          padding-left: 0;
        }

        .tiptap-editor-content ul[data-type="taskList"] li::before,
        .tiptap-editor-content ul[data-type="taskList"] li::marker {
          display: none;
          content: '';
        }

        .tiptap-editor-content ul[data-type="taskList"] li > label {
          flex: 0 0 auto;
          margin: 0;
          padding: 0;
          user-select: none;
          display: flex;
          align-items: flex-start;
          line-height: 1;
          padding-top: 0.125rem;
        }

        .tiptap-editor-content ul[data-type="taskList"] li > div {
          flex: 1 1 auto;
          min-width: 0;
        }

        .tiptap-editor-content ul[data-type="taskList"] li > div > p {
          margin: 0;
        }

        .tiptap-editor-content ul[data-type="taskList"] input[type="checkbox"] {
          cursor: pointer;
          width: 1.25rem;
          height: 1.25rem;
          min-width: 1.25rem;
          min-height: 1.25rem;
          margin: 0;
          padding: 0;
          flex-shrink: 0;
        }

        /* Table Design with vertical and horizontal lines */
        .tiptap-editor-content table {
          border-collapse: collapse;
          table-layout: auto;
          width: 100%;
          margin: 1.5rem 0;
          border: 1px solid var(--border);
          font-size: 16px;
          line-height: 1.6;
        }

        .tiptap-editor-content table th,
        .tiptap-editor-content table td {
          border: 1px solid var(--border);
          padding: 0.875rem 1.25rem;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
          text-align: left;
          background: transparent;
          color: var(--text-primary);
          font-size: 16px;
        }

        .tiptap-editor-content table th {
          font-weight: 600;
          background: var(--surface-2, rgba(0, 0, 0, 0.02));
          color: var(--text-primary);
          border: 1px solid var(--border);
          font-size: 16px;
        }

        /* First column styling, reduced width by 25% */
        .tiptap-editor-content table tbody tr td:first-child,
        .tiptap-editor-content table tr td:first-child {
          font-weight: normal;
          color: var(--text-primary);
        }

        .tiptap-editor-content table tbody tr td,
        .tiptap-editor-content table tr td {
          color: var(--text-primary);
        }

        .tiptap-editor-content table th:first-child,
        .tiptap-editor-content table td:first-child {
          min-width: 135px; /* Reduced by 25% from 180px */
          padding-left: 0.75rem;
          padding-right: 1.5rem; /* Reduced by 25% from 2rem */
        }

        .tiptap-editor-content table th:last-child,
        .tiptap-editor-content table td:last-child {
          padding-right: 0.75rem;
        }

        .tiptap-editor-content table .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(14, 165, 233, 0.12);
          pointer-events: none;
        }

        .tiptap-editor-content table .column-resize-handle {
          position: absolute;
          right: -1px;
          top: 0;
          bottom: 0;
          width: 3px;
          background-color: var(--accent);
          pointer-events: none;
        }

        .tiptap-editor-content .tableWrapper {
          overflow-x: auto;
          margin: 1.5rem 0;
        }

        .tiptap-table-toolbar {
          background: var(--surface-3);
          border-left: 1px solid var(--border);
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 0.35rem 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
          font-size: 0.75rem;
          position: sticky;
          top: calc(-1.5rem + 34px);
          z-index: 99;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .tiptap-table-btn {
          padding: 0.25rem 0.5rem;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 0.25rem;
          color: var(--text-primary);
          font-size: 0.75rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          transition: all 0.15s ease;
        }

        .tiptap-table-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .tiptap-table-btn-danger {
          color: var(--error, #ef4444);
        }

        .tiptap-table-btn-danger:hover {
          border-color: var(--error, #ef4444);
          background: rgba(239, 68, 68, 0.08);
          color: var(--error, #ef4444);
        }
      `}</style>

      {hideToolbar ? (
        <div
          class="tiptap-editor-container tiptap-editor-document"
          style={{
            height: "auto",
            minHeight: "240px",
            border: "none",
            background: "transparent",
            position: "relative",
            display: "block",
            overflow: "visible",
            boxShadow: "none",
          }}
        >
          <div
            ref={editorRef}
            style={{
              height: "auto",
              overflow: "visible",
              padding: 0,
              outline: "none",
            }}
          />
        </div>
      ) : (
        /* Standalone mode (for ArticleForm, ProductForm, JobsForm, SectionEditorModal) */
        <>
          <div class="tiptap-toolbar">
            <div class="tiptap-picker">
              <button
                ref={dropdownButtonRef}
                type="button"
                class="tiptap-picker-label"
                onClick$={() => {
                  showHeadingDropdown.value = !showHeadingDropdown.value;
                }}
              >
                {currentHeading.value}
                <LuChevronDown style="width:14px;height:14px;margin-left:4px;" />
              </button>
              {showHeadingDropdown.value && (
                <div class="tiptap-picker-options">
                  <button type="button" class="tiptap-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => setParagraph()}>Normal</button>
                  <button type="button" class="tiptap-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => setHeading(1)}>Heading 1</button>
                  <button type="button" class="tiptap-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => setHeading(2)}>Heading 2</button>
                  <button type="button" class="tiptap-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => setHeading(3)}>Heading 3</button>
                </div>
              )}
            </div>

            <button
              type="button"
              class={`tiptap-btn ${isBold.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('bold')}
              title="Bold"
            >
              <LuBold style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isItalic.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('italic')}
              title="Italic"
            >
              <LuItalic style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isUnderline.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('underline')}
              title="Underline"
            >
              <LuUnderline style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isStrike.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('strike')}
              title="Strikethrough"
            >
              <LuStrikethrough style="width:16px;height:16px;" />
            </button>

            <button
              type="button"
              class={`tiptap-btn ${isBulletList.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('bulletList')}
              title="Bullet List"
            >
              <LuList style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isOrderedList.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('orderedList')}
              title="Numbered List"
            >
              <LuListOrdered style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isTaskList.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('taskList')}
              title="Task List"
            >
              <LuCheckSquare style="width:16px;height:16px;" />
            </button>

            <button
              type="button"
              class={`tiptap-btn ${isBlockquote.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('blockquote')}
              title="Blockquote"
            >
              <LuQuote style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isCodeBlock.value ? "is-active" : ""}`}
              onClick$={() => toggleFormat('codeBlock')}
              title="Code Block"
            >
              <LuCode style="width:16px;height:16px;" />
            </button>

            <button
              type="button"
              class={`tiptap-btn ${isLink.value ? "is-active" : ""}`}
              onClick$={addLink}
              title="Link"
            >
              <LuLink style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class="tiptap-btn"
              onClick$={addImage}
              title="Image"
            >
              <LuImage style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class="tiptap-btn"
              onClick$={addVideo}
              title="Video"
            >
              <LuVideo style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class={`tiptap-btn ${isTableActive.value ? "is-active" : ""}`}
              onClick$={addTable}
              title="Insert Table"
            >
              <LuTable style="width:16px;height:16px;" />
            </button>

            <button
              type="button"
              class="tiptap-btn"
              onClick$={() => toggleFormat('undo')}
              disabled={!canUndo.value}
              title="Undo"
            >
              <LuUndo style="width:16px;height:16px;" />
            </button>
            <button
              type="button"
              class="tiptap-btn"
              onClick$={() => toggleFormat('redo')}
              disabled={!canRedo.value}
              title="Redo"
            >
              <LuRedo style="width:16px;height:16px;" />
            </button>

            <button
              type="button"
              class={`tiptap-btn ${isEnlarged.value ? "is-active" : ""}`}
              onClick$={toggleEnlarge$}
              style={{ marginLeft: "auto" }}
              title={isEnlarged.value ? "Collapse editor" : "Enlarge editor"}
            >
              <LuMaximize style="width:16px;height:16px;" />
            </button>
          </div>

          {isTableActive.value && (
            <div class="tiptap-table-toolbar">
              <span style="font-weight: 600; color: var(--text-secondary); margin-right: 0.25rem;">Table:</span>
              <button type="button" class="tiptap-table-btn" onClick$={addRowBefore} title="Insert row above">+ Row Above</button>
              <button type="button" class="tiptap-table-btn" onClick$={addRowAfter} title="Insert row below">+ Row Below</button>
              <button type="button" class="tiptap-table-btn" onClick$={deleteRow} title="Delete row">- Row</button>
              <button type="button" class="tiptap-table-btn" onClick$={addColumnBefore} title="Insert column left">+ Col Left</button>
              <button type="button" class="tiptap-table-btn" onClick$={addColumnAfter} title="Insert column right">+ Col Right</button>
              <button type="button" class="tiptap-table-btn" onClick$={deleteColumn} title="Delete column">- Col</button>
              <button type="button" class="tiptap-table-btn tiptap-table-btn-danger" onClick$={deleteTable} title="Delete entire table">Delete Table</button>
            </div>
          )}

          <div
            class="tiptap-editor-container"
            style={{
              height: `${editorHeight.value}px`,
              minHeight: "160px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              ref={editorRef}
              style={{
                flex: "1 1 auto",
                height: "100%",
                overflowY: "auto",
              }}
            />

            {/* Bottom Right Corner Resize Handle */}
            <div
              title="Drag to resize / Double-click to toggle enlarge"
              preventdefault:pointerdown
              onPointerDown$={handleResizePointerDown$}
              onDblClick$={toggleEnlarge$}
              style={{
                position: "absolute",
                right: "3px",
                bottom: "3px",
                width: "16px",
                height: "16px",
                cursor: "se-resize",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                color: isResizing.value ? "var(--accent)" : "var(--text-secondary)",
                opacity: isResizing.value ? 1 : 0.5,
                zIndex: 10,
                touchAction: "none",
                userSelect: "none",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
