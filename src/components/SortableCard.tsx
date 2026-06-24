import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SortableCardProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
}

export function SortableCard({
  id, children, disabled, className, style,
  onClick, onContextMenu, onMouseMove, onDragStart,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""}${isDragging ? " dragging" : ""}`}
      style={{
        ...style,
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 999 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        position: "relative",
        touchAction: "none",
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseMove={onMouseMove}
      onDragStart={onDragStart}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
