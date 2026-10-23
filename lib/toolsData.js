import {
    Combine,
    Split,
    Minimize2,
    FileText,
    Presentation,
    Sheet,
    Image as ImageIcon,
    FileImage,
    PenLine,
    Hash,
    Stamp,
    RotateCw,
    Globe,
    LockOpen,
    Lock,
    LayoutGrid,
    Archive,
    Wrench,
} from 'lucide-react';

// One color per category keeps the catalog calm and scannable.
export const CATEGORIES = [
    { id: 'organize', name: 'Organize', color: 'var(--cat-organize)' },
    { id: 'optimize', name: 'Optimize', color: 'var(--cat-optimize)' },
    { id: 'convert-to', name: 'Convert to PDF', color: 'var(--cat-convert-to)' },
    { id: 'convert-from', name: 'Convert from PDF', color: 'var(--cat-convert-from)' },
    { id: 'edit', name: 'Edit & Sign', color: 'var(--cat-edit)' },
    { id: 'security', name: 'Security', color: 'var(--cat-security)' },
];

const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

const RAW_TOOLS = [
    {
        id: 'sign-edit-pdf',
        name: 'Edit & Sign PDF',
        description: 'Edit existing text, add text, images and signatures, and fill in PDF forms.',
        icon: PenLine,
        href: '/app',
        category: 'edit',
        featured: true,
    },
    {
        id: 'merge-pdf',
        name: 'Merge PDF',
        description: 'Combine multiple PDFs into one document, in any order.',
        icon: Combine,
        href: '/tools/merge',
        category: 'organize',
        featured: true,
    },
    {
        id: 'split-pdf',
        name: 'Split PDF',
        description: 'Extract a range of pages into a separate PDF.',
        icon: Split,
        href: '/tools/split',
        category: 'organize',
        featured: true,
    },
    {
        id: 'organize-pdf',
        name: 'Organize PDF',
        description: 'Reorder, remove and rearrange pages visually.',
        icon: LayoutGrid,
        href: '/tools/organize',
        category: 'organize',
    },
    {
        id: 'rotate-pdf',
        name: 'Rotate PDF',
        description: 'Rotate individual pages or the whole document.',
        icon: RotateCw,
        href: '/tools/rotate',
        category: 'organize',
    },
    {
        id: 'compress-pdf',
        name: 'Compress PDF',
        description: 'Shrink file size while keeping documents sharp.',
        icon: Minimize2,
        href: '/tools/compress',
        category: 'optimize',
        featured: true,
    },
    {
        id: 'repair-pdf',
        name: 'Repair PDF',
        description: 'Recover content from damaged or corrupt PDFs.',
        icon: Wrench,
        href: '/tools/repair',
        category: 'optimize',
    },
    {
        id: 'pdf-to-pdfa',
        name: 'PDF to PDF/A',
        description: 'Convert to the ISO archival format for long-term storage.',
        icon: Archive,
        href: '/tools/pdf-to-pdfa',
        category: 'optimize',
    },
    {
        id: 'word-to-pdf',
        name: 'Word to PDF',
        description: 'Convert DOC and DOCX documents to PDF.',
        icon: FileText,
        href: '/tools/word-to-pdf',
        category: 'convert-to',
    },
    {
        id: 'powerpoint-to-pdf',
        name: 'PowerPoint to PDF',
        description: 'Convert PPT and PPTX slideshows to PDF.',
        icon: Presentation,
        href: '/tools/powerpoint-to-pdf',
        category: 'convert-to',
    },
    {
        id: 'excel-to-pdf',
        name: 'Excel to PDF',
        description: 'Convert XLS, XLSX and CSV spreadsheets to PDF.',
        icon: Sheet,
        href: '/tools/excel-to-pdf',
        category: 'convert-to',
    },
    {
        id: 'jpg-to-pdf',
        name: 'Image to PDF',
        description: 'Turn JPG, PNG and WebP images into a PDF.',
        icon: FileImage,
        href: '/tools/jpg-to-pdf',
        category: 'convert-to',
        featured: true,
    },
    {
        id: 'html-to-pdf',
        name: 'HTML to PDF',
        description: 'Render HTML files or markup as a PDF document.',
        icon: Globe,
        href: '/tools/html-to-pdf',
        category: 'convert-to',
    },
    {
        id: 'pdf-to-word',
        name: 'PDF to Word',
        description: 'Convert PDFs into editable DOCX documents.',
        icon: FileText,
        href: '/tools/pdf-to-word',
        category: 'convert-from',
        featured: true,
    },
    {
        id: 'pdf-to-powerpoint',
        name: 'PDF to PowerPoint',
        description: 'Turn each PDF page into a PPTX slide.',
        icon: Presentation,
        href: '/tools/pdf-to-powerpoint',
        category: 'convert-from',
    },
    {
        id: 'pdf-to-excel',
        name: 'PDF to Excel',
        description: 'Extract tables from PDFs into XLSX spreadsheets.',
        icon: Sheet,
        href: '/tools/pdf-to-excel',
        category: 'convert-from',
    },
    {
        id: 'pdf-to-jpg',
        name: 'PDF to JPG',
        description: 'Export every page as a high-quality JPG image.',
        icon: ImageIcon,
        href: '/tools/pdf-to-jpg',
        category: 'convert-from',
    },
    {
        id: 'page-numbers',
        name: 'Page Numbers',
        description: 'Add page numbers with your choice of position and format.',
        icon: Hash,
        href: '/tools/page-numbers',
        category: 'edit',
    },
    {
        id: 'watermark',
        name: 'Add Watermark',
        description: 'Stamp text across every page with adjustable opacity.',
        icon: Stamp,
        href: '/tools/watermark',
        category: 'edit',
    },
    {
        id: 'protect-pdf',
        name: 'Protect PDF',
        description: 'Encrypt a PDF with a password (AES-256).',
        icon: Lock,
        href: '/tools/protect',
        category: 'security',
    },
    {
        id: 'unlock-pdf',
        name: 'Unlock PDF',
        description: 'Remove a known password from a protected PDF.',
        icon: LockOpen,
        href: '/tools/unlock',
        category: 'security',
    },
];

export const TOOLS = RAW_TOOLS.map((tool) => ({ ...tool, color: CATEGORY_COLOR[tool.category] }));

export function getTool(id) {
    return TOOLS.find((tool) => tool.id === id);
}

export function getRelatedTools(id, count = 4) {
    const tool = getTool(id);
    if (!tool) return [];
    return TOOLS.filter((t) => t.id !== id && t.category === tool.category)
        .concat(TOOLS.filter((t) => t.id !== id && t.category !== tool.category && t.featured))
        .slice(0, count);
}
