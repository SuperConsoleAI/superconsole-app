import { useState, useEffect, useCallback } from "react"
import {
  GitBranch, GitCommit, Loader2, CheckCircle2, ExternalLink,
  AlertCircle, GitMerge, Upload, Globe, ChevronRight, ChevronLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { api, type GitStatus, type GitDiff, type FileDiff } from "@/lib/api"

interface GitDialogProps {
  workspaceId: number
  gitStatus: GitStatus
  open: boolean
  onClose: () => void
  onCommitted?: () => void
  initialStep?: "commit" | "publish"
}

type Step = "commit" | "loading" | "done" | "pr" | "error" | "publish"
type PublishStep = 1 | 2

export function GitDialog({ workspaceId, gitStatus, open, onClose, onCommitted, initialStep = "commit" }: GitDialogProps) {
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [message, setMessage] = useState("")
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState<Step>("commit")
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [pushedBranch, setPushedBranch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState("")

  // Publish flow state
  const [publishStep, setPublishStep] = useState<PublishStep>(1)
  const [remoteUrl, setRemoteUrl] = useState("")
  const [publishingRepo, setPublishingRepo] = useState(false)

  const defaultMessage = !gitStatus.hasCommits ? "Initial commit" : ""

  useEffect(() => {
    if (!open) return
    setStep(initialStep)       // open at commit or publish depending on caller
    setError(null)
    setPrUrl(null)
    setMessage(defaultMessage)
    setDiff(null)
    setGenerating(false)
    setPublishStep(1)
    setRemoteUrl("")

    // Load diff immediately (fast git command — no LLM, no spinner)
    api.gitDiffSummary(workspaceId)
      .then((d) => { if (d) setDiff(d) })
      .catch(() => {})
  }, [open, workspaceId, initialStep])

  // ⌘↵ to commit
  useEffect(() => {
    if (!open || step !== "commit") return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handlePrimary()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, step, message, gitStatus])

  // Source of truth: use gitStatus.isDirty (live polling), NOT stale diff
  const canCommit = gitStatus.isDirty || !gitStatus.hasCommits
  const isPushOnly = gitStatus.ahead > 0 && !gitStatus.isDirty
  const isClean = !gitStatus.isDirty && gitStatus.ahead === 0 && gitStatus.hasCommits

  // If message is empty, auto-generate before committing
  const resolveMessage = async (): Promise<string> => {
    if (message.trim()) return message.trim()
    setGenerating(true)
    try {
      const generated = await api.gitGenerateCommitMessage(workspaceId)
      const msg = generated?.trim() || (!gitStatus.hasCommits ? "Initial commit" : "Update files")
      setMessage(msg)
      return msg
    } catch {
      return !gitStatus.hasCommits ? "Initial commit" : "Update files"
    } finally {
      setGenerating(false)
    }
  }

  const handleCommitOnly = async () => {
    if (!canCommit) return
    setStep("loading")
    setLoadingAction("Committing…")
    setError(null)
    try {
      const msg = await resolveMessage()
      await api.gitCommitChanges(workspaceId, msg)
      setPushedBranch(gitStatus.branch)
      setStep("done")
      onCommitted?.()
    } catch (e) {
      setError(String(e))
      setStep("error")
    }
  }

  const handleCommitAndPush = async (createPr: boolean) => {
    if (!canCommit && !isPushOnly) return
    setStep("loading")
    setLoadingAction(createPr ? "Committing, pushing & opening PR…" : "Committing & pushing…")
    setError(null)
    try {
      const msg = await resolveMessage()
      const result = await api.gitCommitAndPush(
        workspaceId,
        msg,
        createPr,
        createPr ? msg : undefined,
      )
      setPushedBranch(result.branch)
      if (result.prUrl) {
        setPrUrl(result.prUrl)
        setStep("pr")
      } else {
        setStep("done")
      }
      onCommitted?.()
    } catch (e) {
      setError(String(e))
      setStep("error")
    }
  }

  const handlePushOnly = async () => {
    setStep("loading")
    setLoadingAction("Pushing…")
    setError(null)
    try {
      const result = await api.gitCommitAndPush(workspaceId, "", false)
      setPushedBranch(result.branch)
      setStep("done")
      onCommitted?.()
    } catch (e) {
      setError(String(e))
      setStep("error")
    }
  }

  const handlePrimary = useCallback(() => {
    if (isPushOnly) { handlePushOnly(); return }
    if (!canCommit) return
    if (!gitStatus.hasRemote) handleCommitOnly()
    else handleCommitAndPush(false)
  }, [canCommit, isPushOnly, gitStatus.hasRemote, message])

  const handlePublishRepo = async () => {
    if (!remoteUrl.trim()) return
    setPublishingRepo(true)
    setError(null)
    try {
      // Add remote then push
      await api.gitCommitAndPush(workspaceId, message.trim() || defaultMessage, false)
      setStep("done")
      onCommitted?.()
    } catch (e) {
      setError(String(e))
      setPublishingRepo(false)
    }
  }

  const successMessage = !gitStatus.hasCommits
    ? "First commit created ✓"
    : !gitStatus.hasRemote
    ? `Committed on ${pushedBranch} ✓`
    : `Pushed to ${pushedBranch} ✓`

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden border-border/60">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span>{step === "publish" ? "Publish repository" : "Commit"}</span>
            {step !== "publish" && gitStatus.branch && (
              <span className="text-muted-foreground font-normal">
                on <span className="font-mono text-xs text-foreground">{gitStatus.branch}</span>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── COMMIT STEP ─────────────────────────────── */}
        {step === "commit" && (
          <div className="p-4 space-y-3">
            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Commit message <span className="normal-case font-normal">(optional)</span>
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="font-mono text-sm resize-none min-h-[64px] bg-muted/30 border-border/50 focus-visible:ring-1"
                placeholder="Leave empty to auto-generate"
                rows={3}
                disabled={isClean}
              />
            </div>

            {/* Clean state */}
            {isClean && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Worktree is clean. Make changes before committing.
              </div>
            )}

            {/* File list */}
            {diff && diff.filesChanged.length > 0 && !isClean && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
                  <span>
                    {diff.totalFiles} file{diff.totalFiles !== 1 ? "s" : ""} changed
                    {diff.totalFiles > diff.filesChanged.length && (
                      <span className="normal-case ml-1 text-amber-400/70">
                        (showing {diff.filesChanged.length})
                      </span>
                    )}
                  </span>
                  <span className="normal-case font-mono text-[11px]">
                    {diff.insertions > 0 && <span className="text-emerald-500">+{diff.insertions}</span>}
                    {diff.insertions > 0 && diff.deletions > 0 && <span className="mx-0.5 opacity-30">/</span>}
                    {diff.deletions > 0 && <span className="text-red-400">-{diff.deletions}</span>}
                  </span>
                </div>
                <div className="rounded-md bg-muted/20 border border-border/30 divide-y divide-border/20 max-h-32 overflow-y-auto">
                  {diff.filesChanged.map((f: FileDiff) => (
                    <div key={f.path} className="flex items-center gap-2 px-3 py-1 text-xs font-mono">
                      <span className={cn("w-3.5 shrink-0 font-bold text-center",
                        f.status === "A" ? "text-emerald-500" :
                        f.status === "D" ? "text-red-400" :
                        f.status === "R" ? "text-blue-400" : "text-amber-400"
                      )}>{f.status}</span>
                      <span className="truncate text-muted-foreground">{f.path}</span>
                    </div>
                  ))}
                  {diff.totalFiles > diff.filesChanged.length && (
                    <div className="px-3 py-1 text-xs text-muted-foreground/40 italic">
                      +{diff.totalFiles - diff.filesChanged.length} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Push-only notice */}
            {isPushOnly && (
              <div className="flex items-center gap-2 text-xs text-blue-400/80 bg-blue-500/8 border border-blue-500/20 rounded-md px-3 py-2">
                <Upload className="h-3.5 w-3.5 shrink-0" />
                {gitStatus.ahead} commit{gitStatus.ahead !== 1 ? "s" : ""} ready to push
              </div>
            )}

            {/* First commit notice */}
            {!gitStatus.hasCommits && (
              <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-500/8 border border-amber-500/20 rounded-md px-3 py-2">
                <GitCommit className="h-3.5 w-3.5 shrink-0" />
                First commit — repository has no history yet
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 justify-between pt-1">
              {/* Publish repository — left side, only when no remote */}
              {!gitStatus.hasRemote && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground gap-1.5 px-2"
                  onClick={() => setStep("publish")}
                >
                  <Upload className="h-3 w-3" />
                  Publish repository…
                </Button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
                  Cancel
                </Button>

                {isPushOnly ? (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handlePushOnly}>
                    Push <span className="opacity-60">↑{gitStatus.ahead}</span>
                  </Button>
                ) : (
                  <>
                    {/* No remote: just Commit */}
                    {!gitStatus.hasRemote && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleCommitOnly}
                        disabled={!canCommit}
                        title={isClean ? "Worktree is clean. Make changes before committing." : undefined}
                      >
                        Commit
                        <kbd className="ml-1.5 text-[9px] opacity-40 font-mono">⌘↵</kbd>
                      </Button>
                    )}

                    {/* Has remote: Commit & Push + PR */}
                    {gitStatus.hasRemote && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleCommitOnly}
                          disabled={!canCommit}
                          title={isClean ? "Worktree is clean" : undefined}
                        >
                          Commit only
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleCommitAndPush(false)}
                          disabled={!canCommit}
                        >
                          Commit & Push
                          <kbd className="text-[9px] opacity-40 font-mono">⌘↵</kbd>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => handleCommitAndPush(true)}
                          disabled={!canCommit}
                          title="Commit, push & open GitHub PR"
                        >
                          <GitMerge className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PUBLISH STEP ──────────────────────────────── */}
        {step === "publish" && (
          <div className="p-4 space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded",
                publishStep === 1 ? "bg-primary/10 text-primary" : "text-muted-foreground/50"
              )}>
                <span className="font-mono font-bold">1</span> Provider
              </div>
              <ChevronRight className="h-3 w-3 opacity-30" />
              <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded",
                publishStep === 2 ? "bg-primary/10 text-primary" : "text-muted-foreground/50"
              )}>
                <span className="font-mono font-bold">2</span> Repository
              </div>
            </div>

            {publishStep === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pick where to host it, then point us at a repo to push to.
                </p>
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/60 bg-primary/5 cursor-pointer"
                  onClick={() => setPublishStep(2)}
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-sm font-medium">GitHub</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20 cursor-not-allowed opacity-50">
                  <span className="text-sm">GitLab</span>
                  <span className="ml-auto text-[10px] text-amber-500 border border-amber-500/30 rounded px-1.5 py-0.5">
                    Coming soon
                  </span>
                </div>
              </div>
            )}

            {publishStep === 2 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Repository URL
                  </label>
                  <Input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/username/repo"
                    className="font-mono text-xs h-8"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Create a repo on{" "}
                    <button
                      className="text-primary underline underline-offset-2"
                      onClick={() => window.open("https://github.com/new", "_blank")}
                    >
                      github.com/new
                    </button>
                    {" "}then paste the URL above.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => publishStep === 1 ? setStep("commit") : setPublishStep(1)}
              >
                <ChevronLeft className="h-3 w-3" />
                {publishStep === 1 ? "Back" : "Back"}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
                  Cancel
                </Button>
                {publishStep === 1 ? (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setPublishStep(2)}>
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handlePublishRepo}
                    disabled={!remoteUrl.trim() || publishingRepo}
                  >
                    {publishingRepo ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Publish & Push
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LOADING ─────────────────────────────────── */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{generating ? "Generating commit message…" : loadingAction}</span>
            {generating && <span className="text-xs text-muted-foreground/50">Using AI to summarize your changes</span>}
          </div>
        )}

        {/* ── DONE ────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-8 px-6">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="text-center space-y-1">
              <div className="text-sm font-medium">{successMessage}</div>
              <div className="text-xs text-muted-foreground font-mono">{message}</div>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={onClose}>Done</Button>
          </div>
        )}

        {/* ── PR ──────────────────────────────────────── */}
        {step === "pr" && prUrl && (
          <div className="flex flex-col items-center gap-3 py-8 px-6">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="text-center space-y-1">
              <div className="text-sm font-medium">✓ Pushed to {pushedBranch}</div>
              <div className="text-xs text-muted-foreground">Pull request ready to open</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => { window.open(prUrl, "_blank"); onClose() }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Pull Request
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
                Skip
              </Button>
            </div>
          </div>
        )}

        {/* ── ERROR ───────────────────────────────────── */}
        {step === "error" && (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-2.5 text-sm bg-red-500/8 border border-red-500/20 rounded-md p-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="font-medium text-red-400">Action failed</div>
                <div className="text-xs text-muted-foreground font-mono break-all whitespace-pre-wrap">
                  {error}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStep("commit")}>
                ← Try again
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
