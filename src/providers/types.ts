export type CardFormat = "1x1" | "3x4" | "4x3" | "9x16";

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
