// src/components/ArticleModal.tsx
//
// WHAT:  Modal popup dialog to preview an article / content item.
//        Displays the full article layout: cover image, title, metadata (date,
//        read time, publication status), excerpt, rich HTML body content,
//        additional details, and call-to-action button.
//
// HOW:   Accepts `open` signal and `article` signal/record. When opened, displays
//        a centered backdrop-blurred modal with smooth scrolling and animations.
//        Includes actions to close, edit (launching inline TipTap edit mode), or view live URL.
//
// RULES: Pure UI component. No server$, no routeLoader$, responsive for desktop/mobile.

import {
  component$,
  type Signal,
  type PropFunction,
  $,
  useSignal,
  useTask$,
  useVisibleTask$,
  useOnDocument,
} from "@builder.io/qwik";
import {
  LuX,
  LuPencil,
  LuExternalLink,
  LuCalendar,
  LuClock,
  LuCopy,
  LuCheck,
  LuCheckCircle2,
  LuAlertCircle,
  LuEyeOff,
  LuSparkles,
  LuLoader,
  LuBold,
  LuItalic,
  LuUnderline,
  LuStrikethrough,
  LuList,
  LuListOrdered,
  LuCheckSquare,
  LuQuote,
  LuCode,
  LuLink,
  LuImage,
  LuVideo,
  LuTable,
  LuUndo,
  LuRedo,
  LuChevronDown,
} from "@qwikest/icons/lucide";
import { TipTapEditor } from "~/components/TipTapEditor";
import { updateContent } from "~/lib/ipc";
import type { ContentRow } from "~/lib/types";

export interface ArticleModalProps {
  open: Signal<boolean>;
  article: Signal<ContentRow | null> | ContentRow | null;
  cmsTitle?: string;
  cmsSlug?: string;
  profileSlug?: string;
  onClose$?: PropFunction<() => void>;
  onEdit$?: PropFunction<(id: string) => void>;
  onSaveContent$?: PropFunction<(id: string, updatedContent: string, updatedTitle?: string) => Promise<boolean | void> | boolean | void>;
}

export const ArticleModal = component$<ArticleModalProps>(({
  open,
  article,
  cmsTitle = "Article",
  cmsSlug,
  profileSlug,
  onClose$,
  onSaveContent$,
}) => {
  const isEditing = useSignal(false);
  const editableContent = useSignal("");
  const editableTitle = useSignal("");
  const isSaving = useSignal(false);
  const saveSuccess = useSignal(false);
  const copiedSlug = useSignal(false);
  const isDirty = useSignal(false);
  const initialContentSnapshot = useSignal<string | null>(null);
  const initialTitleSnapshot = useSignal<string | null>(null);
  const titleTextareaRef = useSignal<HTMLTextAreaElement>();
  const headingDropdownRef = useSignal<HTMLDivElement>();
  const showHeadingDropdown = useSignal(false);
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
  const currentHeading = useSignal("Normal");
  const canUndo = useSignal(false);
  const canRedo = useSignal(false);

  const item: ContentRow | null = article && "value" in article ? article.value : (article as ContentRow | null);

  const startEditing = $(() => {
    editableContent.value = item?.content || "";
    editableTitle.value = item?.title || "";
    initialContentSnapshot.value = item?.content || "";
    initialTitleSnapshot.value = item?.title || "";
    isDirty.value = false;
    showHeadingDropdown.value = false;
    isEditing.value = true;
  });

  // Sync editableContent and editableTitle whenever article signal changes
  useTask$(({ track }) => {
    track(() => (article && "value" in article ? article.value?.id : (article as ContentRow | null)?.id));
    const currentItem = article && "value" in article ? article.value : (article as ContentRow | null);
    editableContent.value = currentItem?.content || "";
    editableTitle.value = currentItem?.title || "";
    initialContentSnapshot.value = null;
    initialTitleSnapshot.value = currentItem?.title || null;
    isEditing.value = false;
    isSaving.value = false;
    saveSuccess.value = false;
    isDirty.value = false;
    showHeadingDropdown.value = false;
  });

  const handleClose = $(() => {
    open.value = false;
    isEditing.value = false;
    isDirty.value = false;
    initialContentSnapshot.value = null;
    initialTitleSnapshot.value = null;
    showHeadingDropdown.value = false;
    isBold.value = false;
    isItalic.value = false;
    isUnderline.value = false;
    isStrike.value = false;
    isBulletList.value = false;
    isOrderedList.value = false;
    isTaskList.value = false;
    isBlockquote.value = false;
    isCodeBlock.value = false;
    isLink.value = false;
    isTableActive.value = false;
    currentHeading.value = "Normal";
    canUndo.value = false;
    canRedo.value = false;
    if (onClose$) {
      onClose$();
    }
  });

  const handleSave = $(async () => {
    if (!item) return;
    isSaving.value = true;
    try {
      const updatedTitle = editableTitle.value.trim() || item.title;
      if (onSaveContent$) {
        await onSaveContent$(item.id, editableContent.value, updatedTitle);
      } else {
        await updateContent(item.id, { title: updatedTitle, content: editableContent.value });
      }
      item.title = updatedTitle;
      item.content = editableContent.value;
      initialContentSnapshot.value = editableContent.value;
      initialTitleSnapshot.value = updatedTitle;
      isDirty.value = false;
      isEditing.value = false;
      isBold.value = false;
      isItalic.value = false;
      isUnderline.value = false;
      isStrike.value = false;
      isBulletList.value = false;
      isOrderedList.value = false;
      isTaskList.value = false;
      isBlockquote.value = false;
      isCodeBlock.value = false;
      isLink.value = false;
      isTableActive.value = false;
      currentHeading.value = "Normal";
      canUndo.value = false;
      canRedo.value = false;
      showHeadingDropdown.value = false;
      saveSuccess.value = true;
      setTimeout(() => {
        saveSuccess.value = false;
      }, 3000);
    } catch (err) {
      console.error("[ArticleModal] Failed to save content:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      isSaving.value = false;
    }
  });

  const handleCancelEdit = $(() => {
    editableContent.value = item?.content || "";
    editableTitle.value = item?.title || "";
    initialContentSnapshot.value = null;
    initialTitleSnapshot.value = null;
    isDirty.value = false;
    showHeadingDropdown.value = false;
    isBold.value = false;
    isItalic.value = false;
    isUnderline.value = false;
    isStrike.value = false;
    isBulletList.value = false;
    isOrderedList.value = false;
    isTaskList.value = false;
    isBlockquote.value = false;
    isCodeBlock.value = false;
    isLink.value = false;
    isTableActive.value = false;
    currentHeading.value = "Normal";
    canUndo.value = false;
    canRedo.value = false;
    isEditing.value = false;
  });

  const handleCopyLink = $(async (slugStr: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(slugStr);
        copiedSlug.value = true;
        setTimeout(() => {
          copiedSlug.value = false;
        }, 2000);
      }
    } catch {
      // Clipboard copy fallback
    }
  });

  // Close on Escape key press
  useOnDocument(
    "keydown",
    $((e: KeyboardEvent) => {
      if (open.value && e.key === "Escape") {
        handleClose();
      }
    })
  );

  // Listen for TipTap editor state changes and sync toolbar signals
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => isEditing.value);
    if (!isEditing.value) return;

    const applyState = (d: any) => {
      if (!d) return;
      if (initialContentSnapshot.value === (item?.content || "") && typeof d.html === "string") {
        initialContentSnapshot.value = d.html;
      }
      isBold.value = Boolean(d.isBold);
      isItalic.value = Boolean(d.isItalic);
      isUnderline.value = Boolean(d.isUnderline);
      isStrike.value = Boolean(d.isStrike);
      isBulletList.value = Boolean(d.isBulletList);
      isOrderedList.value = Boolean(d.isOrderedList);
      isTaskList.value = Boolean(d.isTaskList);
      isBlockquote.value = Boolean(d.isBlockquote);
      isCodeBlock.value = Boolean(d.isCodeBlock);
      isLink.value = Boolean(d.isLink);
      isTableActive.value = Boolean(d.isTableActive);
      currentHeading.value = d.currentHeading || "Normal";
      canUndo.value = Boolean(d.canUndo);
      canRedo.value = Boolean(d.canRedo);
    };

    const syncFromEditor = (ed: any) => {
      if (!ed || ed.isDestroyed) return;
      let h = "Normal";
      if (ed.isActive("heading", { level: 1 })) h = "Heading 1";
      else if (ed.isActive("heading", { level: 2 })) h = "Heading 2";
      else if (ed.isActive("heading", { level: 3 })) h = "Heading 3";

      applyState({
        isBold: ed.isActive("bold"),
        isItalic: ed.isActive("italic"),
        isUnderline: ed.isActive("underline"),
        isStrike: ed.isActive("strike"),
        isBulletList: ed.isActive("bulletList"),
        isOrderedList: ed.isActive("orderedList"),
        isTaskList: ed.isActive("taskList"),
        isBlockquote: ed.isActive("blockquote"),
        isCodeBlock: ed.isActive("codeBlock"),
        isLink: ed.isActive("link"),
        isTableActive: ed.isActive("table"),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        currentHeading: h,
        html: ed.getHTML(),
      });
    };

    let attachedEditor: any = null;
    let detachEditor: (() => void) | null = null;

    const attachToEditor = (ed: any) => {
      if (!ed || ed.isDestroyed || attachedEditor === ed) return;
      if (detachEditor) {
        detachEditor();
        detachEditor = null;
      }
      attachedEditor = ed;

      const onEditorTransaction = () => syncFromEditor(ed);
      ed.on("transaction", onEditorTransaction);
      ed.on("selectionUpdate", onEditorTransaction);
      ed.on("focus", onEditorTransaction);

      syncFromEditor(ed);

      detachEditor = () => {
        try {
          ed.off("transaction", onEditorTransaction);
          ed.off("selectionUpdate", onEditorTransaction);
          ed.off("focus", onEditorTransaction);
        } catch {
          // ignore if editor destroyed
        }
      };
    };

    // 1. Native DOM custom event listener
    const onCustomEvent = (e: Event) => {
      const d = (e as CustomEvent).detail;
      applyState(d);
    };
    window.addEventListener("businesskit:tiptap-state", onCustomEvent);

    const onEditorReady = (e: Event) => {
      const ed = (e as CustomEvent).detail?.editor || (window as any).__articleModalEditor__;
      if (ed) attachToEditor(ed);
    };
    window.addEventListener("businesskit:tiptap-editor-ready", onEditorReady);

    // 2. Direct check if editor already exists
    if (typeof window !== "undefined" && (window as any).__articleModalEditor__) {
      attachToEditor((window as any).__articleModalEditor__);
    }

    // 3. Fallback interval check for editor initialization
    const interval = setInterval(() => {
      if (!attachedEditor && typeof window !== "undefined" && (window as any).__articleModalEditor__) {
        attachToEditor((window as any).__articleModalEditor__);
      }
    }, 50);

    cleanup(() => {
      window.removeEventListener("businesskit:tiptap-state", onCustomEvent);
      window.removeEventListener("businesskit:tiptap-editor-ready", onEditorReady);
      clearInterval(interval);
      if (detachEditor) {
        detachEditor();
      }
    });
  });

  // Close heading dropdown on outside click
  useOnDocument(
    "click",
    $((event: Event) => {
      if (!showHeadingDropdown.value) return;
      const target = event.target as HTMLElement;
      if (headingDropdownRef.value && !headingDropdownRef.value.contains(target)) {
        showHeadingDropdown.value = false;
      }
    })
  );

  // Auto-resize title textarea when editing begins or title updates
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => isEditing.value);
    track(() => editableTitle.value);
    if (isEditing.value && titleTextareaRef.value) {
      titleTextareaRef.value.style.height = "auto";
      titleTextareaRef.value.style.height = `${titleTextareaRef.value.scrollHeight}px`;
    }
  });

  const execCmd = $((cmd: string, arg?: any) => {
    const editor = (window as any).__articleModalEditor__;
    if (!editor) return;
    switch (cmd) {
      case "bold": editor.chain().focus().toggleBold().run(); break;
      case "italic": editor.chain().focus().toggleItalic().run(); break;
      case "underline": editor.chain().focus().toggleUnderline().run(); break;
      case "strike": editor.chain().focus().toggleStrike().run(); break;
      case "bulletList": editor.chain().focus().toggleBulletList().run(); break;
      case "orderedList": editor.chain().focus().toggleOrderedList().run(); break;
      case "taskList": editor.chain().focus().toggleTaskList().run(); break;
      case "blockquote": editor.chain().focus().toggleBlockquote().run(); break;
      case "codeBlock": editor.chain().focus().toggleCodeBlock().run(); break;
      case "undo": editor.chain().focus().undo().run(); break;
      case "redo": editor.chain().focus().redo().run(); break;
      case "heading": {
        editor.chain().focus().toggleHeading({ level: arg }).run();
        showHeadingDropdown.value = false;
        break;
      }
      case "paragraph": {
        editor.chain().focus().setParagraph().run();
        showHeadingDropdown.value = false;
        break;
      }
      case "table": editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case "addRowBefore": editor.chain().focus().addRowBefore().run(); break;
      case "addRowAfter": editor.chain().focus().addRowAfter().run(); break;
      case "deleteRow": editor.chain().focus().deleteRow().run(); break;
      case "addColumnBefore": editor.chain().focus().addColumnBefore().run(); break;
      case "addColumnAfter": editor.chain().focus().addColumnAfter().run(); break;
      case "deleteColumn": editor.chain().focus().deleteColumn().run(); break;
      case "deleteTable": editor.chain().focus().deleteTable().run(); break;
      case "link": {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          const url = prompt("Enter URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }
        break;
      }
      case "image": {
        const url = prompt("Enter image URL:");
        if (url) editor.chain().focus().setImage({ src: url }).run();
        break;
      }
      case "video": {
        const url = prompt("Enter video URL (YouTube, Vimeo, or direct):");
        if (!url) break;
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          editor.chain().focus().setYoutubeVideo({ src: url }).run();
        } else if (url.includes("vimeo.com")) {
          const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
          if (id) {
            const html = `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;"><iframe src="https://player.vimeo.com/video/${id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allowfullscreen></iframe></div>`;
            editor.chain().focus().insertContent(html).run();
          }
        } else {
          const html = `<video src="${url}" controls style="width: 100%; height: auto;"></video>`;
          editor.chain().focus().insertContent(html).run();
        }
        break;
      }
    }
    // Synchronize formatting state immediately
    isBold.value = editor.isActive("bold");
    isItalic.value = editor.isActive("italic");
    isUnderline.value = editor.isActive("underline");
    isStrike.value = editor.isActive("strike");
    isBulletList.value = editor.isActive("bulletList");
    isOrderedList.value = editor.isActive("orderedList");
    isTaskList.value = editor.isActive("taskList");
    isBlockquote.value = editor.isActive("blockquote");
    isCodeBlock.value = editor.isActive("codeBlock");
    isLink.value = editor.isActive("link");
    isTableActive.value = editor.isActive("table");
    canUndo.value = editor.can().undo();
    canRedo.value = editor.can().redo();
    let newHeading = "Normal";
    if (editor.isActive("heading", { level: 1 })) newHeading = "Heading 1";
    else if (editor.isActive("heading", { level: 2 })) newHeading = "Heading 2";
    else if (editor.isActive("heading", { level: 3 })) newHeading = "Heading 3";
    currentHeading.value = newHeading;
  });

  if (!open.value || !item) {
    return null;
  }

  // Parse additional details
  let details: Array<{ key: string; value: string }> = [];
  if (item.additional_details) {
    try {
      const parsed = JSON.parse(item.additional_details);
      if (Array.isArray(parsed)) {
        details = parsed.filter((d: any) => d && (d.key || d.value));
      }
    } catch {
      details = [];
    }
  }

  // Parse image ads
  let imageAds: { imageUrl?: string; text?: string; url?: string } | null = null;
  if (item.image_ads) {
    try {
      const parsed = JSON.parse(item.image_ads);
      if (parsed && (parsed.imageUrl || parsed.text || parsed.url)) {
        imageAds = parsed;
      }
    } catch {
      imageAds = null;
    }
  }

  // Date formatting
  const formattedDate = (() => {
    if (!item.created_at) return null;
    try {
      const d = new Date(item.created_at);
      if (isNaN(d.getTime())) return String(item.created_at);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return String(item.created_at);
    }
  })();

  // Reading time estimate
  const readTime = (() => {
    if (!item.content) return "1 min read";
    const textOnly = item.content.replace(/<[^>]*>/g, " ").trim();
    const words = textOnly.split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  })();

  const isPublished = item.published === 1;
  const isHidden = item.hidden === 1;
  const hubSlug = cmsSlug || (cmsTitle ? cmsTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "article");
  const publicUrl = profileSlug
    ? `https://${profileSlug}.businesskit.io/${hubSlug}/${item.slug}`
    : `/${hubSlug}/${item.slug}`;

  return (
    <div
      class="article-modal-backdrop"
      onClick$={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <style>{ARTICLE_MODAL_STYLES}</style>
      <div class="article-modal-card">
        {/* FIXED TOP HEADER - Row 1: Badges & Live link; Row 2: TipTap Edit Bar; Row 3: Table Toolbar */}
        <div class="article-modal-header">
          {/* Row 1: Badges & Actions */}
          <div class="article-modal-header-top">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  background: "var(--surface-3)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {cmsTitle}
              </span>

              {/* Publication Status Pill */}
              {isPublished ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "9999px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "var(--success, #10b981)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                  }}
                >
                  <LuCheckCircle2 style={{ width: "12px", height: "12px" }} />
                  Published
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "9999px",
                    background: "rgba(245, 158, 11, 0.12)",
                    color: "var(--warning, #f59e0b)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                  }}
                >
                  <LuAlertCircle style={{ width: "12px", height: "12px" }} />
                  Draft
                </span>
              )}

              {/* Secret / Hidden Pill */}
              {isHidden && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "9999px",
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <LuEyeOff style={{ width: "12px", height: "12px" }} />
                  Hidden
                </span>
              )}

              {/* Editing Mode Pill */}
              {isEditing.value && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "9999px",
                    background: "rgba(14, 165, 233, 0.12)",
                    color: "var(--accent)",
                    border: "1px solid rgba(14, 165, 233, 0.25)",
                  }}
                >
                  <LuPencil style={{ width: "11px", height: "11px" }} />
                  Editing Mode
                </span>
              )}
            </div>

            {/* Actions on right */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {isPublished && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open live article"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    height: "2rem",
                    padding: "0 0.75rem",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <LuExternalLink style={{ width: "13px", height: "13px" }} />
                  <span>Live</span>
                </a>
              )}

              {/* In View Mode: Edit & Close buttons */}
              {!isEditing.value && (
                <>
                  <button
                    type="button"
                    onClick$={startEditing}
                    title="Edit this article"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      height: "2rem",
                      padding: "0 0.75rem",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxSizing: "border-box",
                    }}
                  >
                    <LuPencil style={{ width: "13px", height: "13px" }} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick$={handleClose}
                    title="Close popup"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "2rem",
                      height: "2rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      background: "var(--surface-3)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      padding: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    <LuX style={{ width: "16px", height: "16px" }} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: Top Edit Bar (TipTap Toolbar) with Top Stroke Only */}
          {isEditing.value && (
            <div class="article-modal-toolbar">
              <div class="article-modal-picker" ref={headingDropdownRef}>
                <button
                  type="button"
                  class="article-modal-picker-label"
                  onMouseDown$={(e) => e.preventDefault()}
                  onClick$={() => {
                    showHeadingDropdown.value = !showHeadingDropdown.value;
                  }}
                >
                  <span>{currentHeading.value}</span>
                  <LuChevronDown style={{ width: "14px", height: "14px", marginLeft: "4px" }} />
                </button>
                {showHeadingDropdown.value && (
                  <div class="article-modal-picker-options">
                    <button type="button" class="article-modal-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("paragraph")}>Normal</button>
                    <button type="button" class="article-modal-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("heading", 1)}>Heading 1</button>
                    <button type="button" class="article-modal-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("heading", 2)}>Heading 2</button>
                    <button type="button" class="article-modal-picker-item" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("heading", 3)}>Heading 3</button>
                  </div>
                )}
              </div>

              <button
                type="button"
                class={`article-modal-tb-btn ${isBold.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("bold")}
                title="Bold"
              >
                <LuBold style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isItalic.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("italic")}
                title="Italic"
              >
                <LuItalic style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isUnderline.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("underline")}
                title="Underline"
              >
                <LuUnderline style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isStrike.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("strike")}
                title="Strikethrough"
              >
                <LuStrikethrough style={{ width: "16px", height: "16px" }} />
              </button>

              <button
                type="button"
                class={`article-modal-tb-btn ${isBulletList.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("bulletList")}
                title="Bullet List"
              >
                <LuList style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isOrderedList.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("orderedList")}
                title="Numbered List"
              >
                <LuListOrdered style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isTaskList.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("taskList")}
                title="Task List"
              >
                <LuCheckSquare style={{ width: "16px", height: "16px" }} />
              </button>

              <button
                type="button"
                class={`article-modal-tb-btn ${isBlockquote.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("blockquote")}
                title="Blockquote"
              >
                <LuQuote style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isCodeBlock.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("codeBlock")}
                title="Code Block"
              >
                <LuCode style={{ width: "16px", height: "16px" }} />
              </button>

              <button
                type="button"
                class={`article-modal-tb-btn ${isLink.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("link")}
                title="Link"
              >
                <LuLink style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class="article-modal-tb-btn"
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("image")}
                title="Image"
              >
                <LuImage style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class="article-modal-tb-btn"
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("video")}
                title="Video"
              >
                <LuVideo style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class={`article-modal-tb-btn ${isTableActive.value ? "is-active" : ""}`}
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("table")}
                title="Insert Table"
              >
                <LuTable style={{ width: "16px", height: "16px" }} />
              </button>

              <button
                type="button"
                class="article-modal-tb-btn"
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("undo")}
                disabled={!canUndo.value}
                title="Undo"
              >
                <LuUndo style={{ width: "16px", height: "16px" }} />
              </button>
              <button
                type="button"
                class="article-modal-tb-btn"
                onMouseDown$={(e) => e.preventDefault()}
                onClick$={() => execCmd("redo")}
                disabled={!canRedo.value}
                title="Redo"
              >
                <LuRedo style={{ width: "16px", height: "16px" }} />
              </button>
            </div>
          )}

          {/* Row 3: Table Toolbar with Top Stroke Only (when table active) */}
          {isEditing.value && isTableActive.value && (
            <div class="article-modal-table-toolbar">
              <span style={{ fontWeight: 600, color: "var(--text-secondary)", marginRight: "0.25rem" }}>Table:</span>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("addRowBefore")} title="Insert row above">+ Row Above</button>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("addRowAfter")} title="Insert row below">+ Row Below</button>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("deleteRow")} title="Delete row">- Row</button>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("addColumnBefore")} title="Insert column left">+ Col Left</button>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("addColumnAfter")} title="Insert column right">+ Col Right</button>
              <button type="button" class="article-modal-table-btn" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("deleteColumn")} title="Delete column">- Col</button>
              <button type="button" class="article-modal-table-btn article-modal-table-btn-danger" onMouseDown$={(e) => e.preventDefault()} onClick$={() => execCmd("deleteTable")} title="Delete entire table">Delete Table</button>
            </div>
          )}
        </div>

        {/* SCROLLABLE ARTICLE BODY */}
        <div class="article-modal-scroll article-modal-body">
          {/* Hero Image */}
          {item.hero_image_url && (
            <div
              style={{
                width: "100%",
                maxHeight: "360px",
                overflow: "hidden",
                borderRadius: "0.75rem",
                border: "1px solid var(--border)",
                background: "var(--surface-3)",
              }}
            >
              <img
                src={item.hero_image_url}
                alt={item.title}
                width={720}
                height={360}
                style={{
                  width: "100%",
                  height: "100%",
                  maxHeight: "360px",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          )}

          {/* Title & Metadata */}
          <div>
            {isEditing.value ? (
              <textarea
                ref={titleTextareaRef}
                rows={1}
                value={editableTitle.value}
                onInput$={$((e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${target.scrollHeight}px`;
                  const val = target.value;
                  editableTitle.value = val;
                  const baseContent = initialContentSnapshot.value ?? (item?.content || "");
                  const baseTitle = initialTitleSnapshot.value ?? (item?.title || "");
                  const isTitleChanged = val !== baseTitle;
                  const isContentChanged = editableContent.value !== baseContent;
                  isDirty.value = isTitleChanged || isContentChanged;
                })}
                placeholder="Article title..."
                class="article-modal-editable-title"
              />
            ) : (
              <h1
                style={{
                  fontSize: "1.875rem",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 0.75rem 0",
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  fontFamily: "var(--font-serif, 'BusinessKitSerif', Georgia, serif)",
                }}
              >
                {item.title}
              </h1>
            )}

            {/* Meta Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              {formattedDate && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <LuCalendar style={{ width: "14px", height: "14px" }} />
                  <span>{formattedDate}</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <LuClock style={{ width: "14px", height: "14px" }} />
                <span>{readTime}</span>
              </div>

              {/* Slug Chip with Copy */}
              <button
                type="button"
                onClick$={() => handleCopyLink(`/${hubSlug}/${item.slug}`)}
                title="Click to copy path"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.15rem 0.35rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "0.375rem",
                  color: "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono, monospace)",
                  cursor: "pointer",
                }}
              >
                {copiedSlug.value ? (
                  <>
                    <LuCheck style={{ width: "12px", height: "12px", color: "var(--success, #10b981)" }} />
                    <span style={{ color: "var(--success, #10b981)" }}>Copied!</span>
                  </>
                ) : (
                  <>
                    <LuCopy style={{ width: "12px", height: "12px" }} />
                    <span>/{item.slug}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Excerpt / Lead */}
          {item.excerpt && (
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "var(--surface-3)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "0 0.5rem 0.5rem 0",
                fontSize: "1rem",
                lineHeight: 1.6,
                color: "var(--text-secondary)",
                fontStyle: "italic",
                fontFamily: "var(--font-serif, 'BusinessKitSerif', Georgia, serif)",
              }}
            >
              {item.excerpt}
            </div>
          )}

          {/* AI Summary */}
          {item.ai_summary && (
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "rgba(59, 130, 246, 0.06)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "#3b82f6",
                  letterSpacing: "0.05em",
                }}
              >
                <LuSparkles style={{ width: "13px", height: "13px" }} />
                <span>AI Summary</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
                {item.ai_summary}
              </p>
            </div>
          )}

          {/* Main Article Content */}
          {isEditing.value ? (
            <TipTapEditor
              value={editableContent}
              hideToolbar={true}
              onChange$={$((val: string) => {
                editableContent.value = val;
                const baseContent = initialContentSnapshot.value ?? (item?.content || "");
                const baseTitle = initialTitleSnapshot.value ?? (item?.title || "");
                const isContentChanged = val !== baseContent;
                const isTitleChanged = editableTitle.value !== baseTitle;
                isDirty.value = isContentChanged || isTitleChanged;
              })}
              placeholder="Write your article content here..."
            />
          ) : (editableContent.value || item.content) ? (
            <div
              class="article-modal-prose"
              dangerouslySetInnerHTML={editableContent.value || item.content || undefined}
            />
          ) : (
            <div
              style={{
                padding: "3rem 1.5rem",
                textAlign: "center",
                color: "var(--text-secondary)",
                background: "var(--surface-3)",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              No article content has been written yet.
              <div style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  onClick$={startEditing}
                  class="article-modal-btn-edit"
                >
                  <LuPencil style={{ width: "13px", height: "13px" }} />
                  Start Writing
                </button>
              </div>
            </div>
          )}

          {/* Additional Details */}
          {details.length > 0 && (
            <div
              style={{
                paddingTop: "1.25rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  letterSpacing: "0.05em",
                }}
              >
                Additional Details
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {details.map((detail, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.3rem 0.625rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{detail.key}:</span>
                    <span style={{ color: "var(--text-primary)" }}>{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call-to-Action Button */}
          {item.cta_button_url && item.cta_button_text && (
            <div
              style={{
                paddingTop: "1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <a
                href={item.cta_button_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.5rem",
                  background: "var(--button-primary-bg)",
                  color: "var(--button-primary-text)",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "opacity 0.15s ease",
                }}
              >
                <span>{item.cta_button_text}</span>
                <LuExternalLink style={{ width: "14px", height: "14px" }} />
              </a>
            </div>
          )}

          {/* Sponsored Ad */}
          {imageAds && (
            <div
              style={{
                padding: "1rem",
                background: "var(--surface-3)",
                border: "1px dashed var(--border)",
                borderRadius: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              {imageAds.imageUrl && (
                <img
                  src={imageAds.imageUrl}
                  alt="Sponsor Ad"
                  width={64}
                  height={64}
                  style={{ width: "64px", height: "64px", borderRadius: "0.375rem", objectFit: "cover" }}
                />
              )}
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-secondary)",
                  }}
                >
                  Sponsored
                </span>
                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
                  {imageAds.text || "Sponsored Banner"}
                </div>
              </div>
              {imageAds.url && (
                <a
                  href={imageAds.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "0.375rem 0.75rem",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    fontSize: "0.75rem",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Visit
                </a>
              )}
            </div>
          )}

          {/* Generous bottom padding spacer to prevent last line from touching footer */}
          <div style={{ height: "3.5rem", minHeight: "3.5rem", flexShrink: 0, pointerEvents: "none" }} />
        </div>

        {/* FIXED FOOTER */}
        <div class="article-modal-footer">
          <div class="article-modal-footer-id">
            <span>ID: <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{item.id}</span></span>
            {saveSuccess.value && (
              <span
                style={{
                  marginLeft: "0.75rem",
                  color: "var(--success, #10b981)",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <LuCheck style={{ width: "12px", height: "12px" }} />
                Saved!
              </span>
            )}
          </div>

          <div class="article-modal-footer-actions">
            {isEditing.value ? (
              <>
                <button
                  type="button"
                  onClick$={handleCancelEdit}
                  disabled={isSaving.value}
                  class="article-modal-btn-close"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick$={handleSave}
                  disabled={!isDirty.value || isSaving.value}
                  class={`article-modal-btn-save ${!isDirty.value ? "is-disabled" : ""}`}
                >
                  {isSaving.value ? (
                    <>
                      <LuLoader class="article-modal-spin" style={{ width: "13px", height: "13px" }} />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick$={handleClose}
                class="article-modal-btn-close"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const ARTICLE_MODAL_STYLES = `
  @font-face {
    font-family: "BusinessKitSerif";
    src: url("/fonts/BusinessKitSerif.woff2") format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }

  @keyframes articleModalFadeIn {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .article-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .article-modal-card {
    width: 100%;
    max-width: 760px;
    max-height: 90vh;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    animation: articleModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .article-modal-header {
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 100%;
  }

  .article-modal-header-top {
    height: 3rem;
    min-height: 3rem;
    padding: 0 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .article-modal-toolbar {
    border: none;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    padding: 0.25rem 1.5rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0;
    width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .article-modal-table-toolbar {
    border: none;
    border-top: 1px solid var(--border);
    background: var(--surface-3);
    padding: 0.25rem 1.5rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: 0.75rem;
    width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .article-modal-header-top {
      padding: 0 1rem;
    }
    .article-modal-toolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      scrollbar-width: none !important;
      padding: 0.35rem 0.75rem !important;
      gap: 2px !important;
    }
    .article-modal-toolbar::-webkit-scrollbar {
      display: none !important;
    }
    .article-modal-table-toolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      scrollbar-width: none !important;
      padding: 0.35rem 0.75rem !important;
    }
    .article-modal-table-toolbar::-webkit-scrollbar {
      display: none !important;
    }
    .article-modal-tb-btn {
      flex-shrink: 0 !important;
    }
    .article-modal-picker {
      flex-shrink: 0 !important;
    }
    .article-modal-table-btn {
      flex-shrink: 0 !important;
      white-space: nowrap !important;
    }
  }

  .article-modal-tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    margin: 1px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }

  .article-modal-tb-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .article-modal-tb-btn.is-active {
    background: var(--accent-soft, rgba(14, 165, 233, 0.15));
    color: var(--accent, #0ea5e9);
    border-color: var(--accent, #0ea5e9);
  }

  .article-modal-tb-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .article-modal-picker {
    position: relative;
    display: inline-block;
    margin-right: 4px;
  }

  .article-modal-picker-label {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    min-width: 90px;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .article-modal-picker-label:hover {
    background: var(--surface-3);
    color: var(--accent, #0ea5e9);
  }

  .article-modal-picker-options {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    min-width: 120px;
    z-index: 150;
    padding: 4px 0;
  }

  .article-modal-picker-item {
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    font-size: 0.8125rem;
    display: block;
  }

  .article-modal-picker-item:hover {
    background: var(--accent-soft, rgba(14, 165, 233, 0.15));
    color: var(--accent, #0ea5e9);
  }

  .article-modal-table-btn {
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

  .article-modal-table-btn:hover {
    border-color: var(--accent, #0ea5e9);
    color: var(--accent, #0ea5e9);
  }

  .article-modal-table-btn-danger {
    color: var(--error, #ef4444);
  }

  .article-modal-table-btn-danger:hover {
    border-color: var(--error, #ef4444);
    background: rgba(239, 68, 68, 0.08);
    color: var(--error, #ef4444);
  }

  .article-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.75rem 2rem 3rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Desktop bottom footer: horizontal flex with both button and ID text */
  .article-modal-footer {
    padding: 0.5rem 1.5rem;
    border-top: 1px solid var(--border);
    background: var(--surface-1);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
  }

  .article-modal-footer-id {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .article-modal-footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .article-modal-btn-close {
    height: 2rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }
  .article-modal-btn-close:hover {
    background: var(--surface-3);
  }

  .article-modal-btn-edit {
    height: 2rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }
  .article-modal-btn-edit:hover {
    opacity: 0.9;
  }

  .article-modal-btn-save {
    height: 2rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--button-primary-bg, #0ea5e9);
    color: var(--button-primary-text, #ffffff);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }
  .article-modal-btn-save:hover:not(:disabled):not(.is-disabled) {
    opacity: 0.9;
  }
  .article-modal-btn-save:disabled,
  .article-modal-btn-save.is-disabled {
    opacity: 0.45 !important;
    cursor: not-allowed !important;
    background: var(--surface-3) !important;
    color: var(--text-secondary) !important;
    border: 1px solid var(--border) !important;
    box-shadow: none !important;
  }

  @keyframes articleModalSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .article-modal-spin {
    animation: articleModalSpin 1s linear infinite;
  }

  .article-modal-editable-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.75rem 0;
    line-height: 1.25;
    letter-spacing: -0.02em;
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-family: inherit;
    padding: 0;
    box-sizing: border-box;
    resize: none;
    overflow: hidden;
    word-break: break-word;
    white-space: pre-wrap;
    display: block;
  }
  .article-modal-editable-title:focus {
    outline: none;
  }
  .article-modal-editable-title::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .article-modal-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .article-modal-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .article-modal-scroll::-webkit-scrollbar-thumb {
    background-color: var(--border);
    border-radius: 3px;
  }

  /* Rich prose styling for rendered HTML content in view mode */
  .article-modal-prose {
    font-family: var(--font-serif, "BusinessKitSerif", Georgia, Cambria, "Times New Roman", Times, serif);
    font-size: 17px;
    line-height: 1.7;
    color: var(--text-primary);
    word-break: break-word;
  }
  .article-modal-prose h1 {
    font-family: var(--font-serif, "BusinessKitSerif", Georgia, Cambria, "Times New Roman", Times, serif);
    font-size: 24px;
    font-weight: 600;
    margin-top: 1.75rem;
    margin-bottom: 0.75rem;
    color: var(--text-primary);
    line-height: 1.3;
  }
  .article-modal-prose h2 {
    font-family: var(--font-serif, "BusinessKitSerif", Georgia, Cambria, "Times New Roman", Times, serif);
    font-size: 21px;
    font-weight: 500;
    margin-top: 1.5rem;
    margin-bottom: 0.625rem;
    color: var(--text-primary);
    line-height: 1.35;
  }
  .article-modal-prose h3 {
    font-family: var(--font-serif, "BusinessKitSerif", Georgia, Cambria, "Times New Roman", Times, serif);
    font-size: 19px;
    font-weight: 500;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    line-height: 1.4;
  }
  .article-modal-prose p {
    font-size: 17px;
    margin-top: 0;
    margin-bottom: 1.125rem;
    line-height: 1.7;
  }
  .article-modal-prose ul {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin-top: 0;
    margin-bottom: 1.125rem;
  }
  .article-modal-prose ol {
    list-style-type: decimal;
    padding-left: 1.5rem;
    margin-top: 0;
    margin-bottom: 1.125rem;
  }
  .article-modal-prose li {
    margin-bottom: 0.375rem;
    line-height: 1.65;
  }
  .article-modal-prose blockquote {
    border-left: 3px solid var(--accent);
    padding-left: 1.25rem;
    margin: 1.5rem 0;
    font-style: italic;
    color: var(--text-secondary);
    font-size: 1.05rem;
    line-height: 1.65;
  }
  .article-modal-prose pre {
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.875rem;
    margin: 1rem 0;
  }
  .article-modal-prose code {
    font-family: var(--font-mono, monospace);
    background: var(--surface-3);
    padding: 0.15em 0.35em;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  .article-modal-prose pre code {
    background: transparent;
    padding: 0;
  }
  .article-modal-prose img {
    max-width: 100%;
    border-radius: 0.5rem;
    margin: 1.25rem 0;
    display: block;
  }
  .article-modal-prose a {
    color: var(--accent);
    text-decoration: underline;
  }
  .article-modal-prose iframe {
    width: 100%;
    border-radius: 0.5rem;
    margin: 1.25rem 0;
    border: none;
  }

  /* Table styling in view mode: no outer stroke, no vertical lines, only horizontal lines */
  .article-modal-prose table {
    border-collapse: collapse;
    width: 100%;
    margin: 1.5rem 0;
    border: none;
    font-size: 16px;
    line-height: 1.6;
  }
  .article-modal-prose table th,
  .article-modal-prose table td {
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 0.875rem 1.25rem;
    vertical-align: top;
    box-sizing: border-box;
    text-align: left;
    color: var(--text-primary);
  }
  .article-modal-prose table th {
    font-weight: 500;
    background: transparent;
  }
  .article-modal-prose table th:first-child,
  .article-modal-prose table td:first-child {
    min-width: 135px; /* Reduced by 25% from 180px */
    padding-left: 0;
    padding-right: 1.5rem; /* Reduced by 25% from 2rem */
    font-weight: 400;
  }
  .article-modal-prose table th:first-child {
    font-weight: 500;
  }
  .article-modal-prose table th:last-child,
  .article-modal-prose table td:last-child {
    padding-right: 0;
  }

  /* Task list styling */
  .article-modal-prose ul[data-type="taskList"] {
    list-style: none;
    padding-left: 0;
  }
  .article-modal-prose ul[data-type="taskList"] li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
  }
  .article-modal-prose ul[data-type="taskList"] li > label {
    margin-top: 0.15rem;
  }
  .article-modal-prose ul[data-type="taskList"] li > div {
    flex: 1;
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .article-modal-backdrop {
      padding: 1rem;
    }

    .article-modal-card {
      margin: 2rem 0;
      max-height: calc(100vh - 4rem);
    }

    .article-modal-header {
      min-height: 3rem;
    }

    .article-modal-body {
      padding: 1rem;
      gap: 1.25rem;
    }

    /* on mobile: footer puts buttons below ID */
    .article-modal-footer {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 0.5rem 1rem;
      gap: 0.5rem;
    }

    .article-modal-footer-id {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .article-modal-footer-actions {
      display: flex;
      gap: 0.5rem;
      width: 100%;
    }

    .article-modal-footer-actions button,
    .article-modal-btn-close,
    .article-modal-btn-edit,
    .article-modal-btn-save {
      flex: 1;
      height: 2rem;
      justify-content: center;
      font-size: 0.8125rem;
    }

    /* make table responsive on mobile in view mode */
    .article-modal-prose table {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border: none;
      font-size: 14px;
      margin: 1rem 0;
    }

    .article-modal-prose th,
    .article-modal-prose td {
      border: none;
      border-bottom: 1px solid var(--border);
      padding: 0.625rem 0.875rem;
      font-size: 14px;
    }

    .article-modal-prose th {
      font-weight: 500;
    }

    .article-modal-prose th:first-child,
    .article-modal-prose td:first-child {
      min-width: 98px; /* Reduced by 25% from 130px */
      width: auto;
      padding-left: 0;
      padding-right: 0.9rem;
      font-weight: 400;
    }

    .article-modal-prose th:first-child {
      font-weight: 500;
    }

    .article-modal-prose th:last-child,
    .article-modal-prose td:last-child {
      padding-right: 0;
    }
  }
`;
