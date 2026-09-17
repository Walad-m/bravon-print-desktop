import { create } from 'zustand';
import { LabelElement, LabelSize, PRESET_LABEL_SIZES, PX_PER_MM, LabelTemplate } from '../types/label';

/** Strips 'id' from each union member individually, preserving discriminant narrowing */
type OmitId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type NewElement = OmitId<LabelElement>;

interface DesignerState {
  elements: LabelElement[];
  selectedElementId: string | null;
  labelSize: LabelSize;
  copies: number;

  // Canvas pixel dimensions (derived from labelSize)
  canvasWidth: number;
  canvasHeight: number;

  // Actions
  addElement: (element: NewElement) => void;
  updateElement: (id: string, updates: Partial<LabelElement>) => void;
  removeElement: (id: string) => void;
  setSelectedElement: (id: string | null) => void;
  setLabelSize: (size: LabelSize) => void;
  setCopies: (copies: number) => void;
  loadTemplate: (template: LabelTemplate) => void;
  clearAll: () => void;
}

const defaultLabelSize = PRESET_LABEL_SIZES[0]; // 58×40mm

export const useDesignerStore = create<DesignerState>((set) => ({
  elements: [],
  selectedElementId: null,
  labelSize: defaultLabelSize,
  copies: 1,
  canvasWidth: defaultLabelSize.width * PX_PER_MM,
  canvasHeight: defaultLabelSize.height * PX_PER_MM,

  addElement: (element) =>
    set((state) => ({
      elements: [...state.elements, { ...element, id: crypto.randomUUID() }] as LabelElement[],
    })),

  updateElement: (id, updates) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? ({ ...el, ...updates } as LabelElement) : el
      ),
    })),

  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
    })),

  setSelectedElement: (id) => set({ selectedElementId: id }),

  setLabelSize: (size) =>
    set({
      labelSize: size,
      canvasWidth: size.width * PX_PER_MM,
      canvasHeight: size.height * PX_PER_MM,
    }),

  setCopies: (copies) => set({ copies }),

  loadTemplate: (template) =>
    set({
      labelSize: template.size,
      canvasWidth: template.size.width * PX_PER_MM,
      canvasHeight: template.size.height * PX_PER_MM,
      elements: JSON.parse(JSON.stringify(template.elements)),
      selectedElementId: null,
    }),

  clearAll: () => set({ elements: [], selectedElementId: null }),
}));
