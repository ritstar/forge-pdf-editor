import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
} from 'pdf-lib';

function getFieldType(field) {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'list';
  return 'unknown';
}

function getFieldOptions(field) {
  try {
    if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      return field.getOptions?.() ?? [];
    }
  } catch {
    return [];
  }
  return [];
}

function getFieldValue(field, type) {
  try {
    if (type === 'text') return field.getText() ?? '';
    if (type === 'checkbox') return field.isChecked();
    if (type === 'radio') return field.getSelected() ?? '';
    if (type === 'dropdown' || type === 'list') {
      const selected = field.getSelected?.() ?? [];
      return Array.isArray(selected) ? selected[0] ?? '' : selected ?? '';
    }
  } catch {
    return type === 'checkbox' ? false : '';
  }

  return '';
}

export function getInitialsFromName(nameOrEmail = '') {
  const source = String(nameOrEmail || '').trim();
  if (!source) return '';

  if (source.includes('@')) {
    const local = source.split('@')[0];
    const cleaned = local.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  const parts = source.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export async function extractFormFieldsFromPdfBytes(pdfBytes) {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields
    .map((field) => {
      const type = getFieldType(field);
      if (type === 'unknown') return null;

      const name = field.getName();
      return {
        name,
        label: name,
        type,
        options: getFieldOptions(field),
        value: getFieldValue(field, type),
      };
    })
    .filter(Boolean);
}

export async function applyFormValuesToPdfDoc(pdfDoc, formValues = {}) {
  const form = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in formValues)) continue;

    const type = getFieldType(field);
    const value = formValues[name];

    try {
      if (type === 'text') {
        field.setText(value == null ? '' : String(value));
        continue;
      }

      if (type === 'checkbox') {
        if (value) field.check();
        else field.uncheck();
        continue;
      }

      if (type === 'radio') {
        if (value != null && String(value).length > 0) {
          field.select(String(value));
        }
        continue;
      }

      if (type === 'dropdown' || type === 'list') {
        if (value == null || value === '') continue;
        const options = field.getOptions?.() ?? [];
        const selected = String(value);
        if (options.includes(selected)) {
          field.select(selected);
        }
      }
    } catch {
      // Skip incompatible value for this field and continue applying the rest.
    }
  }

  form.updateFieldAppearances(helvetica);
}
