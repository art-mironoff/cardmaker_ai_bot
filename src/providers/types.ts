export type CardFormat = "1x1" | "3x4" | "4x3" | "9x16";

export interface FormatDimensions {
  width: number;
  height: number;
}

// Target aspect ratios (width / height)
export const FORMAT_RATIOS: Record<CardFormat, number> = {
  "1x1": 1,
  "3x4": 3 / 4,
  "4x3": 4 / 3,
  "9x16": 9 / 16,
};

// API generation dimensions (gpt-image-1 supports only 3 presets)
export const API_DIMENSIONS: Record<CardFormat, FormatDimensions> = {
  "1x1": { width: 1024, height: 1024 },
  "3x4": { width: 1024, height: 1536 },   // 2:3, closest to 3:4
  "4x3": { width: 1536, height: 1024 },   // 3:2, closest to 4:3
  "9x16": { width: 1024, height: 1536 },  // 2:3, closest to 9:16
};

export interface GenerationRequest {
  imageBuffer: Buffer;
  userPrompt: string;
  format: CardFormat;
}

export interface GenerationResult {
  imageBuffer: Buffer;
}

export interface CardProvider {
  name: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
