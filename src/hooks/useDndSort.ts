import { useCallback, useRef } from "react";
import {
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

export interface DndSortOptions {
  longPressDelay?: number;
  distance?: number;
  onStart?: () => void;
  onEnd: (oldIndex: number, newIndex: number) => void;
}

export function useDndSort(opts: DndSortOptions) {
  const { longPressDelay = 400, distance = 8, onStart, onEnd } = opts;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: longPressDelay,
        distance: distance,
        tolerance: 5,
      },
    })
  );

  const dragRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      dragRef.current = String(event.active.id);
      onStart?.();
    },
    [onStart]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        dragRef.current = null;
        return;
      }
      onEnd(
        Number(active.data.current?.sortable?.index),
        Number(over.data.current?.sortable?.index)
      );
      dragRef.current = null;
    },
    [onEnd]
  );

  return { sensors, handleDragStart, handleDragEnd };
}

export { arrayMove } from "@dnd-kit/sortable";
