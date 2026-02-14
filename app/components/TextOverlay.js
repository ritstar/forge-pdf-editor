import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { Trash2 } from 'lucide-react';

export default function TextOverlay({ text, onUpdate, onDelete, onDragStop }) {
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState(text.text);
    const [showMenu, setShowMenu] = useState(false);
    const nodeRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleDoubleClick = () => {
        setIsEditing(true);
    };

    const handleBlur = () => {
        setIsEditing(false);
        onUpdate(text.id, { text: content });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        setShowMenu(true);
    };

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setShowMenu(false);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    return (
        <>
            <Draggable
                nodeRef={nodeRef}
                defaultPosition={text.position}
                onStop={(e, data) => onDragStop(text.id, { x: data.x, y: data.y })}
                disabled={isEditing} // Disable drag while editing
            >
                <div
                    ref={nodeRef}
                    style={{
                        position: 'absolute',
                        cursor: isEditing ? 'text' : 'move',
                        zIndex: 20, // Above images
                    }}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}
                >
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            style={{
                                fontSize: '16px',
                                fontFamily: 'Helvetica, sans-serif',
                                border: '1px dashed #4F46E5',
                                background: 'rgba(255, 255, 255, 0.8)',
                                padding: '4px',
                                outline: 'none',
                                minWidth: '100px',
                                color: 'black'
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                fontSize: '16px',
                                fontFamily: 'Helvetica, sans-serif',
                                padding: '5px', // Match input padding + border
                                whiteSpace: 'nowrap',
                                color: 'black',
                                userSelect: 'none',
                                textShadow: '0 0 2px rgba(255,255,255,0.8)' // Better visibility
                            }}
                        >
                            {text.text}
                        </div>
                    )}

                    {showMenu && (
                        <div
                            className="context-menu"
                            style={{
                                top: '100%',
                                left: 0,
                                marginTop: '5px'
                            }}
                        >
                            <button
                                className="context-menu-item"
                                onClick={() => onDelete(text.id)}
                            >
                                <Trash2 size={14} />
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </Draggable>
        </>
    );
}
