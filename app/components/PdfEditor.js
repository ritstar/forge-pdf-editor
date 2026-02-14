'use client';

import TextOverlay from './TextOverlay';
import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Draggable from 'react-draggable';
import { Resizable } from 're-resizable';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfEditor({ pdfFile, images, texts = [], onPositionChange, onScaleChange, onImageLoad, onImageResize, onImageDelete, onTextUpdate, onTextDelete, onTextMove }) {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [containerWidth, setContainerWidth] = useState(null);
    const containerRef = useRef(null);

    // Assuming 'dimensions' state or prop is available, or needs to be defined.
    // For now, I'll define a placeholder for 'dimensions' based on the original containerWidth logic.
    // In a real app, 'dimensions' would likely come from a state or prop, or be calculated more robustly.
    const [dimensions, setDimensions] = useState({ width: 600, height: 800 }); // Placeholder

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
    }

    // Handle container resize to adjust PDF scale
    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                setContainerWidth(width);
                // Update placeholder dimensions based on container width
                const newPdfWidth = Math.min(width, 800);
                setDimensions(prev => ({ ...prev, width: newPdfWidth, height: newPdfWidth * (prev.height / prev.width || 1.414) })); // Maintain aspect ratio
            }
        };

        window.addEventListener('resize', updateWidth);
        updateWidth();
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    // Load image dimensions when images change
    useEffect(() => {
        images.forEach((image) => {
            if (image.file && !image.dimensions) {
                const img = new Image();
                img.src = URL.createObjectURL(image.file);
                img.onload = () => {
                    if (img.width > 0) {
                        const displayScale = Math.min(200 / img.width, 1);
                        const dimensions = {
                            width: Math.max(50, img.width * displayScale),
                            height: Math.max(50, img.height * displayScale),
                            originalWidth: img.width,
                            originalHeight: img.height
                        };
                        if (onImageLoad) onImageLoad(image.id, dimensions);
                    }
                };
            }
        });
    }, [images, onImageLoad]);

    const handleDragStop = (imageId) => (e, data) => {
        onPositionChange(imageId, { x: data.x, y: data.y });
    };

    const handleResize = (imageId) => (e, direction, ref, delta) => {
        const newWidth = parseFloat(ref.style.width);
        const newHeight = parseFloat(ref.style.height);

        // Calculate position adjustment needed for left/top resizes
        const positionDelta = { x: 0, y: 0 };

        if (typeof direction === 'string') {
            if (direction.includes('left')) {
                positionDelta.x = -delta.width;
            }
            if (direction.includes('top')) {
                positionDelta.y = -delta.height;
            }
        }

        onImageResize(imageId, { width: newWidth, height: newHeight }, positionDelta);
    };

    const handleDelete = (imageId) => {
        onImageDelete(imageId);
    };

    return (
        <div className="editor-container" ref={containerRef}>
            <div className="pdf-wrapper">
                <Document
                    file={pdfFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="flex justify-center"
                >
                    <Page
                        pageNumber={pageNumber}
                        width={containerWidth ? Math.min(containerWidth, 800) : 600}
                        onRenderSuccess={(page) => {
                            const currentScale = page.width / page.originalWidth;
                            onScaleChange(currentScale);
                            setScale(currentScale);
                        }}
                    />
                </Document>

                {images.map((image) => {
                    if (!image.dimensions || !image.file) return null;

                    return (
                        <ImageOverlay
                            key={image.id}
                            image={image}
                            onDragStop={handleDragStop(image.id)}
                            onResize={handleResize(image.id)}
                            onDelete={() => handleDelete(image.id)}
                        />
                    );
                })}

                {texts.map((text) => (
                    <TextOverlay
                        key={text.id}
                        text={text}
                        onUpdate={onTextUpdate}
                        onDelete={onTextDelete}
                        onDragStop={onTextMove}
                    />
                ))}
            </div>

            {numPages && (
                <div className="flex items-center gap-4" style={{ marginTop: '1rem' }}>
                    <button
                        className="btn btn-secondary"
                        disabled={pageNumber <= 1}
                        onClick={() => setPageNumber(prev => prev - 1)}
                    >
                        Previous
                    </button>
                    <span>
                        Page {pageNumber} of {numPages}
                    </span>
                    <button
                        className="btn btn-secondary"
                        disabled={pageNumber >= numPages}
                        onClick={() => setPageNumber(prev => prev + 1)}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}

// Separate component for each image overlay using its own ref
function ImageOverlay({ image, onDragStop, onResize, onDelete }) {
    const draggableRef = useRef(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [selected, setSelected] = useState(false);
    const [localPosition, setLocalPosition] = useState(image.position);
    const [isResizing, setIsResizing] = useState(false);
    const initialResizePos = useRef(image.position);

    // Sync local position with prop when not resizing/dragging
    useEffect(() => {
        if (!isResizing) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalPosition(image.position);
        }
    }, [image.position, isResizing]);

    const handleContextMenu = (e) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY
        });
    };

    const handleDeleteClick = () => {
        onDelete();
        setContextMenu(null);
    };

    useEffect(() => {
        const handleClick = (e) => {
            setContextMenu(null);
            if (draggableRef.current && !draggableRef.current.contains(e.target)) {
                setSelected(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleImageClick = (e) => {
        e.stopPropagation();
        setSelected(true);
    };

    const handleDrag = (e, data) => {
        setLocalPosition({ x: data.x, y: data.y });
    };

    const handleDragStop = (e, data) => {
        setLocalPosition({ x: data.x, y: data.y });
        onDragStop(e, data);
    };

    const handleResizeStart = () => {
        setIsResizing(true);
        initialResizePos.current = localPosition;
    };

    const handleLocalResize = (e, direction, ref, delta) => {
        const newPos = { ...initialResizePos.current };

        if (direction.includes('left')) {
            newPos.x = initialResizePos.current.x - delta.width;
        }
        if (direction.includes('top')) {
            newPos.y = initialResizePos.current.y - delta.height;
        }

        // Direct DOM update for smooth sync to prevent "resizing from right" visual artifact
        if (draggableRef.current) {
            draggableRef.current.style.transform = `translate(${newPos.x}px, ${newPos.y}px)`;
        }

        setLocalPosition(newPos);
    };

    const handleResizeStop = (e, direction, ref, delta) => {
        setIsResizing(false);
        // Calculate final position delta for parent update
        const positionDelta = {
            x: localPosition.x - initialResizePos.current.x,
            y: localPosition.y - initialResizePos.current.y
        };

        // Pass the event and data to the parent handler
        // We need to construct the arguments expected by handleResize in PdfEditor
        // handleResize(imageId)(e, direction, ref, delta)
        // But here onResize is already the curried function: (e, direction, ref, delta) => ...
        // Wait, PdfEditor passes: onResize={handleResize(image.id)}
        // And handleResize returns: (e, direction, ref, delta) => { ... }
        // So we can just call onResize(e, direction, ref, delta)
        // BUT, my handleResize implementation in PdfEditor calculates positionDelta based on direction.
        // Since I've already calculated the exact position I want (localPosition), 
        // I should probably rely on the parent to do the same math, OR update the parent to accept absolute position?
        // The parent handleResize logic (Step 468) calculates delta based on direction.
        // That logic matches my handleLocalResize logic.
        // So calling onResize should result in the same final position.

        onResize(e, direction, ref, delta);
    };

    return (
        <>
            <div className="overlay-container">
                <Draggable
                    bounds="parent"
                    position={localPosition}
                    onDrag={handleDrag}
                    onStop={handleDragStop}
                    nodeRef={draggableRef}
                    cancel=".resize-handle"
                    key={`drag-${image.id}`}
                >
                    <div ref={draggableRef} style={{ position: 'absolute', top: 0, left: 0 }}>
                        <Resizable
                            size={{
                                width: image.dimensions.width,
                                height: image.dimensions.height
                            }}
                            onResizeStart={handleResizeStart}
                            onResize={handleLocalResize}
                            onResizeStop={handleResizeStop}
                            lockAspectRatio={false}
                            minWidth={30}
                            minHeight={30}
                            maxWidth={2000}
                            maxHeight={2000}
                            handleClasses={{
                                top: 'resize-handle',
                                right: 'resize-handle',
                                bottom: 'resize-handle',
                                left: 'resize-handle',
                                topRight: 'resize-handle',
                                bottomRight: 'resize-handle',
                                bottomLeft: 'resize-handle',
                                topLeft: 'resize-handle'
                            }}
                            enable={selected ? {
                                top: true,
                                right: true,
                                bottom: true,
                                left: true,
                                topRight: true,
                                bottomRight: true,
                                bottomLeft: true,
                                topLeft: true
                            } : {
                                top: false,
                                right: false,
                                bottom: false,
                                left: false,
                                topRight: false,
                                bottomRight: false,
                                bottomLeft: false,
                                topLeft: false
                            }}
                            handleStyles={selected ? {
                                topRight: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    right: '-6px',
                                    top: '-6px',
                                    zIndex: 1000,
                                    cursor: 'ne-resize',
                                    pointerEvents: 'auto'
                                },
                                bottomRight: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    right: '-6px',
                                    bottom: '-6px',
                                    zIndex: 1000,
                                    cursor: 'se-resize',
                                    pointerEvents: 'auto'
                                },
                                bottomLeft: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    left: '-6px',
                                    bottom: '-6px',
                                    zIndex: 1000,
                                    cursor: 'sw-resize',
                                    pointerEvents: 'auto'
                                },
                                topLeft: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    left: '-6px',
                                    top: '-6px',
                                    zIndex: 1000,
                                    cursor: 'nw-resize',
                                    pointerEvents: 'auto'
                                },
                                top: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    top: '-6px',
                                    zIndex: 1000,
                                    cursor: 'n-resize',
                                    pointerEvents: 'auto'
                                },
                                right: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    right: '-6px',
                                    zIndex: 1000,
                                    cursor: 'e-resize',
                                    pointerEvents: 'auto'
                                },
                                bottom: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    bottom: '-6px',
                                    zIndex: 1000,
                                    cursor: 's-resize',
                                    pointerEvents: 'auto'
                                },
                                left: {
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#2563eb',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    left: '-6px',
                                    zIndex: 1000,
                                    cursor: 'w-resize',
                                    pointerEvents: 'auto'
                                }
                            } : {}}
                        >
                            <div
                                onClick={handleImageClick}
                                onContextMenu={handleContextMenu}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    cursor: 'move',
                                    pointerEvents: 'auto',
                                    border: selected ? '2px solid #2563eb' : '2px solid transparent',
                                    boxSizing: 'border-box',
                                    backgroundColor: 'transparent'
                                }}
                                className="image-container"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={URL.createObjectURL(image.file)}
                                    alt="Overlay"
                                    draggable={false}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'fill',
                                        userSelect: 'none'
                                    }}
                                />
                            </div>
                        </Resizable>
                    </div>
                </Draggable>
            </div>

            {contextMenu && (
                <div
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 1000
                    }}
                >
                    <button onClick={handleDeleteClick} className="context-menu-item">
                        Delete Image
                    </button>
                </div>
            )}
        </>
    );
}
