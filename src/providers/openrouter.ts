import OpenAI from "openai";
import { config } from "../config.js";
import {
  CardProvider,
  GenerationRequest,
  GenerationResult,
  CardFormat,
} from "./types.js";

interface OpenRouterImageConfig {
  aspect_ratio: string;
  image_size: string;
}

interface OpenRouterCreateParams {
  model: string;
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  modalities: string[];
  image_config: OpenRouterImageConfig;
}

interface OpenRouterImage {
  image_url?: { url: string };
  url?: string;
}

interface OpenRouterChoice {
  message: {
    images?: OpenRouterImage[];
  };
}

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
      timeout: 120_000,
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const aspectRatio = ASPECT_RATIOS[request.format];
    const base64Image = Buffer.from(request.imageBuffer).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    const prompt =
      `You are a product card designer. The user sends a photo and an instruction. ` +
      `Follow the instruction to transform the photo into a product card for a marketplace. ` +
      `Do NOT render the instruction text on the image. ` +
      `Only add text to the image if the user explicitly asks for it. ` +
      `Do not add any extra labels, watermarks, or text that the user did not ask for.\n\n` +
      `Instruction: ${request.userPrompt}`;

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
    } as OpenRouterCreateParams as Parameters<typeof this.client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;

    const choice = (response.choices?.[0] as unknown as OpenRouterChoice | undefined)?.message;
    if (!choice) {
      throw new Error("OpenRouter API returned no response");
    }

    // Extract image from response
    const images = choice.images;
    if (images && images.length > 0) {
      const imageUrl: string | undefined = images[0].image_url?.url || images[0].url;
      if (imageUrl?.startsWith("data:image/")) {
        const base64Data = imageUrl.split(",")[1];
        if (!base64Data) throw new Error("Invalid data URL format from OpenRouter");
        return { imageBuffer: Buffer.from(base64Data, "base64") };
      }
    }

    throw new Error("OpenRouter API returned no image in response");
  }
}
