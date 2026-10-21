'use client';

import { useState } from 'react';

export function moveItem(list, from, to) {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// HTML5 drag-and-drop reordering for a list. `onMove(from, to)` applies the change.
export function useReorder(onMove) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const itemProps = (index) => ({
    draggable: true,
    onDragStart: (event) => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      // Firefox requires data to be set for a drag to start.
      event.dataTransfer.setData('text/plain', String(index));
    },
    onDragEnter: (event) => {
      event.preventDefault();
      if (dragIndex !== null) setOverIndex(index);
    },
    onDragOver: (event) => {
      if (dragIndex !== null) event.preventDefault();
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
      setDragIndex(null);
      setOverIndex(null);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const stateClass = (index) =>
    `${dragIndex === index ? 'is-dragging' : ''} ${overIndex === index && dragIndex !== index ? 'is-over' : ''}`;

  return { itemProps, stateClass };
}
