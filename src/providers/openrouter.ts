import OpenAI from "openai";
import { config } from "../config.js";
import {
  CardProvider,
  GenerationRequest,
  GenerationResult,
  CardFormat,
} from "./types.js";

const ASPECT_RATIOS: Record<CardFormat, string> = {
  "1x1": "1:1",
  "3x4": "3:4",
  "4x3": "4:3",
  "9x16": "9:16",
};

export class OpenRouterProvider implements CardProvider {
  name = "openrouter";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const aspectRatio = ASPECT_RATIOS[request.format];
    const base64Image = Buffer.from(request.imageBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64Image}`;

    const prompt =
      `Follow the user's request exactly. Include ALL text the user asked for — do not skip any. Do not add extra text, labels, or watermarks that the user did not ask for. ` +
      `User request: ${request.userPrompt}`;

    const response = await this.client.chat.completions.create({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: "1K",
      },
    } as any);

    const choice = response.choices?.[0]?.message;
    if (!choice) {
      throw new Error("OpenRouter API returned no response");
    }

    // Extract image from response
    const images = (choice as any).images;
    if (images && images.length > 0) {
      const imageUrl: string = images[0].image_url?.url || images[0].url;
      if (imageUrl?.startsWith("data:image/")) {
        const base64Data = imageUrl.split(",")[1];
        return { imageBuffer: Buffer.from(base64Data, "base64") };
      }
    }

    throw new Error("OpenRouter API returned no image in response");
  }
}
