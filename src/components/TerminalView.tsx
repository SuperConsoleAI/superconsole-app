import { useCallback, useEffect, useRef, useState } from "react";
import { type SessionInfo, type SessionTab, type Workspace } from "@/lib/api";
import { TerminalPane } from "./TerminalPane";
import { cn } from "@/lib/utils";

interface TerminalViewProps {
  workspace: Workspace;
  tab: SessionTab;
  visible: boolean;
  onSessionState: (sessionId: string, live: boolean) => void;
  onSessionInfo: (sessionId: string, info: SessionInfo) => void;
  onOpenFiles: () => void;
}

type PaneNode = { type: "pane"; id: string };
type SplitNode = {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  children: [LayoutNode, LayoutNode];
  ratio: number;
};
type LayoutNode = PaneNode | SplitNode;

function Resizer({
  direction,
  onDrag,
}: {
  direction: "horizontal" | "vertical";
  onDrag: (delta: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      onDrag(direction === "horizontal" ? e.movementX : e.movementY);
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, onDrag]);

  return (
    <div
      className={cn(
        "z-10 bg-border hover:bg-primary/50 transition-colors",
        direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
      onMouseDown={() => setIsDragging(true)}
    />
  );
}

export function TerminalView({
  workspace,
  tab,
  visible,
  onSessionState,
  onSessionInfo,
  onOpenFiles,
}: TerminalViewProps) {
  const [layout, setLayout] = useState<LayoutNode>({ type: "pane", id: tab.id });

  const splitPane = useCallback(
    (nodeId: string, direction: "horizontal" | "vertical") => {
      setLayout((prev) => {
        const clone = structuredClone(prev);

        const findAndSplit = (node: LayoutNode): boolean => {
          if (node.type === "pane") {
            if (node.id === nodeId) {
              const newPane: PaneNode = { type: "pane", id: crypto.randomUUID() };
              
              Object.assign(node, {
                type: "split",
                id: crypto.randomUUID(),
                direction,
                ratio: 0.5,
                children: [{ type: "pane", id: nodeId }, newPane],
              });
              return true;
            }
            return false;
          } else {
            return findAndSplit(node.children[0]) || findAndSplit(node.children[1]);
          }
        };

        findAndSplit(clone);
        return clone;
      });
    },
    [],
  );
  const closePane = useCallback((nodeId: string) => {
    setLayout((prev) => {
      if (prev.type === "pane") return prev;

      const clone = structuredClone(prev);

      const findAndRemove = (parent: SplitNode): boolean => {
        if (parent.children[0].type === "pane" && parent.children[0].id === nodeId) {
          Object.assign(parent, parent.children[1]);
          return true;
        }
        if (parent.children[1].type === "pane" && parent.children[1].id === nodeId) {
          Object.assign(parent, parent.children[0]);
          return true;
        }

        let found = false;
        if (parent.children[0].type === "split") {
          found = findAndRemove(parent.children[0] as SplitNode);
        }
        if (!found && parent.children[1].type === "split") {
          found = findAndRemove(parent.children[1] as SplitNode);
        }
        return found;
      };

      findAndRemove(clone as SplitNode);
      return clone;
    });
  }, []);
  const updateRatio = useCallback((splitId: string, delta: number, totalSize: number) => {
    if (totalSize <= 0) return;
    
    setLayout((prev) => {
      const clone = structuredClone(prev);

      const findAndUpdate = (node: LayoutNode): boolean => {
        if (node.type === "split") {
          if (node.id === splitId) {
            const ratioDelta = delta / totalSize;
            node.ratio = Math.max(0.1, Math.min(0.9, node.ratio + ratioDelta));
            return true;
          }
          return findAndUpdate(node.children[0]) || findAndUpdate(node.children[1]);
        }
        return false;
      };

      findAndUpdate(clone);
      return clone;
    });
  }, []);

  const renderNode = (node: LayoutNode, suggestedDir: "horizontal" | "vertical" = "horizontal"): React.ReactNode => {
    if (node.type === "pane") {
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col relative group">
           <TerminalPane
             workspace={workspace}
             sessionId={node.id}
             cli={node.id === tab.id ? tab.cli : "shell"}
             label={node.id === tab.id ? tab.label : "Shell"}
             initialInput={node.id === tab.id ? tab.initialInput : undefined}
             resumeId={node.id === tab.id ? tab.resumeId : undefined}
             visible={visible}
             onSessionState={onSessionState}
             onSessionInfo={onSessionInfo}
             onOpenFiles={onOpenFiles}
             suggestedSplitDir={suggestedDir}
             onSplit={() => splitPane(node.id, suggestedDir)}
             onClose={() => closePane(node.id)}
             isOnlyPane={layout.type === "pane"}
           />
        </div>
      );
    }

    // Split node
    const nextDir = node.direction === "horizontal" ? "vertical" : "horizontal";
    return (
      <SplitNodeRenderer
        node={node}
        onDrag={(delta, totalSize) => updateRatio(node.id, delta, totalSize)}
        renderChild={(n) => renderNode(n, nextDir)}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {renderNode(layout)}
    </div>
  );
}

function SplitNodeRenderer({
  node,
  onDrag,
  renderChild,
}: {
  node: SplitNode;
  onDrag: (delta: number, totalSize: number) => void;
  renderChild: (n: LayoutNode) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = (delta: number) => {
    if (!containerRef.current) return;
    const totalSize =
      node.direction === "horizontal"
        ? containerRef.current.clientWidth
        : containerRef.current.clientHeight;
    onDrag(delta, totalSize);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-1",
        node.direction === "horizontal" ? "flex-row" : "flex-col"
      )}
    >
      <div style={{ flex: node.ratio * 100 }} className="flex min-h-0 min-w-0">
        {renderChild(node.children[0])}
      </div>
      <Resizer direction={node.direction} onDrag={handleDrag} />
      <div style={{ flex: (1 - node.ratio) * 100 }} className="flex min-h-0 min-w-0">
        {renderChild(node.children[1])}
      </div>
    </div>
  );
}
