import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function SortableTab(props) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab',
    touchAction: 'none'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`tab ${props.isActive ? 'active' : ''}`}
      onClick={(e) => {
        // Prevent click if we were dragging
        if (e.defaultPrevented) return;
        props.onClick();
      }}
    >
      {props.children}
    </div>
  );
}
